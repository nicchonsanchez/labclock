/*
    LabClock — página de grupo (vários cronômetros sincronizados)
    /g/{slug}/ → polling 3s + display local 10fps (mesma estratégia da página individual).
*/

var API_GRUPO = '/labclock/api/grupos.php';
var POLL_MS = 3000;
var DISPLAY_FPS = 10;

var estado = {
    grupo: null,
    serverOffsetMs: 0,
    user: null,
    podeEditar: false,  // dono do grupo ou admin
    beepEm: {},         // slug → bool (jaBeepou)
};

$(function () {
    var slug = obterSlugDaURL();
    if (!slug) { $('#grupo-codigo').text('Slug ausente'); return; }
    bindThemeToggle();
    bindCompartilhar(slug);
    bindAddCronometro(slug);
    if (window.lcNotify) {
        lcNotify.init();
        // Grupo tem N cronômetros — pede permissão no primeiro clique em qualquer cronômetro
        $(document).one('click', '.cronometro-item-grupo', function () { lcNotify.pedirPermissao(); });
    }
    carregarUser();
    carregarGrupo(slug);
    setInterval(function () { carregarGrupo(slug); }, POLL_MS);
    setInterval(atualizarDisplays, Math.floor(1000 / DISPLAY_FPS));
});

function obterSlugDaURL() {
    var qs = new URLSearchParams(location.search);
    if (qs.get('slug')) return qs.get('slug');
    var m = location.pathname.match(/\/g\/([a-z0-9]{4,12})\/?$/);
    return m ? m[1] : null;
}

function carregarUser() {
    $.getJSON('/labclock/api/auth.php?acao=me').done(function (resp) {
        estado.user = resp.user;
        atualizarPermissoes();
    });
}

function atualizarPermissoes() {
    var g = estado.grupo;
    var u = estado.user;
    estado.podeEditar = !!(g && u && (g.dono_id === u.id || u.papel === 'admin'));
    $('#btn-add').prop('hidden', !estado.podeEditar);
}

function carregarGrupo(slug) {
    $.getJSON(API_GRUPO + '?slug=' + encodeURIComponent(slug)).done(function (g) {
        estado.grupo = g;
        estado.serverOffsetMs = g.server_time_ms - Date.now();
        $('#grupo-codigo').text('Grupo · ' + g.slug);
        $('#grupo-nome').text(g.nome);
        $('#grupo-info').text('Dono: ' + g.dono_nome + ' · ' + g.cronometros.length + ' cronômetro' + (g.cronometros.length === 1 ? '' : 's'));
        $('#btn-tv').attr('href', '/labclock/tv/' + slug + '/');
        renderLista();
        atualizarPermissoes();
    }).fail(function (xhr) {
        if (xhr.status === 404) $('#grupo-codigo').text('Grupo não encontrado');
    });
}

function renderLista() {
    var $list = $('#lista-grupo').removeAttr('aria-busy');
    var crs = estado.grupo.cronometros;
    if (!crs || crs.length === 0) {
        $list.html('<p class="state-msg">Grupo vazio. ' + (estado.podeEditar ? 'Adicione cronômetros pelo botão acima.' : 'O dono ainda não adicionou nada.') + '</p>');
        return;
    }
    var serverMs = estado.grupo.server_time_ms;
    var html = crs.map(function (c) {
        var rem = calcularRemaining(c, serverMs);
        var classes = ['cronometro-item-grupo'];
        if (c.status === 'RODANDO') classes.push('rodando');
        if (c.status === 'RODANDO' && rem < 0) classes.push('atrasado');
        return (
            '<article class="' + classes.join(' ') + '" data-slug="' + esc(c.slug) + '">' +
              '<header class="cron-header">' +
                '<a href="/labclock/c/' + esc(c.slug) + '/" class="cron-titulo">' +
                  '<h3>' + esc(c.nome) + '</h3>' +
                  (c.sala_nome ? '<span class="cron-sala">' + esc(c.sala_nome) + '</span>' : '') +
                '</a>' +
                (estado.podeEditar ? '<button class="btn-remover-grupo" data-slug="' + esc(c.slug) + '" title="Remover do grupo">×</button>' : '') +
              '</header>' +
              '<div class="cron-display" data-slug="' + esc(c.slug) + '">' + formatar(rem) + '</div>' +
              '<p class="cron-status">' + esc(rotuloStatus(c.status)) + (rem < 0 && c.status === 'RODANDO' ? ' · atrasado' : '') + '</p>' +
            '</article>'
        );
    }).join('');
    $list.html(html);

    // bind remover
    $('.btn-remover-grupo').on('click', function () {
        var s = $(this).data('slug');
        if (!confirm('Remover este cronômetro do grupo? (O cronômetro em si continua existindo)')) return;
        $.ajax({
            url: API_GRUPO + '?slug=' + encodeURIComponent(estado.grupo.slug) + '&acao=remove&cronometro_slug=' + encodeURIComponent(s),
            method: 'DELETE',
        }).done(function () { carregarGrupo(estado.grupo.slug); })
          .fail(function (xhr) {
              if (xhr.status === 401) { alert('Sessão expirou. Logue novamente.'); location.href = '/labclock/login.html'; return; }
              alert('Falha (HTTP ' + (xhr.status || '0') + '): ' + ((xhr.responseJSON && xhr.responseJSON.error) || 'erro de conexão'));
          });
    });
}

// Roda 10fps — atualiza displays sem precisar de novo HTML
function atualizarDisplays() {
    if (!estado.grupo) return;
    var serverNow = Date.now() + estado.serverOffsetMs;
    estado.grupo.cronometros.forEach(function (c) {
        var rem = calcularRemaining(c, serverNow);
        $('.cron-display[data-slug="' + c.slug + '"]').text(formatar(rem));

        // Beep + notificação SO + classe atrasado quando cruza zero (cada cronômetro independente)
        if (c.status === 'RODANDO') {
            if (rem <= 0 && !estado.beepEm[c.slug]) {
                estado.beepEm[c.slug] = true;
                avisarFim();
                if (window.lcNotify) {
                    lcNotify.disparar({
                        titulo: 'Cronômetro terminou',
                        body:   (c.nome || c.slug) + ' chegou ao zero.',
                        slug:   c.slug,
                        url:    '/labclock/c/' + c.slug + '/',
                    });
                }
            }
            var $card = $('.cronometro-item-grupo[data-slug="' + c.slug + '"]');
            if (rem < 0) $card.addClass('atrasado'); else $card.removeClass('atrasado');
        } else {
            // Reset do beep quando volta pra PARADO
            if (c.status === 'PARADO') estado.beepEm[c.slug] = false;
        }
    });
}

function calcularRemaining(c, serverNow) {
    if (c.status === 'RODANDO' && c.started_at_ms) {
        return c.duracao_ms - (serverNow - c.started_at_ms);
    }
    if (c.status === 'PAUSADO' && c.paused_remaining_ms !== null) {
        return c.paused_remaining_ms;
    }
    return c.duracao_ms;
}


/*
    ADICIONAR cronômetro ao grupo
*/

function bindAddCronometro(slug) {
    // Cache dos cronometros disponiveis no tenant (todos menos os ja no grupo).
    // Carrega na hora de abrir o form.
    var disponiveis = [];
    var idxFocado = -1;

    $('#btn-add').on('click', function () {
        $('#add-form').prop('hidden', false);
        $('#slug-add').val('').focus();
        $('#erro-add').hide();
        carregarDisponiveis();
    });
    $('#btn-add-cancel').on('click', function () {
        $('#add-form').prop('hidden', true);
        $('#erro-add').hide();
        fecharLista();
    });
    $('#btn-add-confirm').on('click', enviarAdd);

    // Toggle dropdown
    $('#slug-add-toggle').on('click', function (e) {
        e.stopPropagation();
        if ($('#slug-add-list').prop('hidden')) abrirLista(); else fecharLista();
    });

    // Input: filtra a lista em tempo real + abre dropdown
    $('#slug-add').on('focus', abrirLista);
    $('#slug-add').on('input', function () {
        renderLista($(this).val().trim().toLowerCase());
        abrirLista();
    });

    // Teclado: setas + Enter pra navegar/escolher
    $('#slug-add').on('keydown', function (e) {
        var $items = $('#slug-add-list .combo-item');
        if (e.key === 'ArrowDown') { e.preventDefault(); abrirLista(); idxFocado = Math.min(idxFocado + 1, $items.length - 1); destacar($items); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); idxFocado = Math.max(idxFocado - 1, 0); destacar($items); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (idxFocado >= 0 && $items.length > 0) {
                selecionar($items.eq(idxFocado).data('slug'));
            } else {
                enviarAdd(); // permite digitar slug exato + Enter (compat)
            }
        }
        else if (e.key === 'Escape') { fecharLista(); }
    });

    // Click fora fecha
    $(document).on('click.combobox', function (e) {
        if (!$(e.target).closest('.combo-wrap').length) fecharLista();
    });

    function destacar($items) {
        $items.removeClass('combo-item-ativo');
        if (idxFocado >= 0) {
            var $it = $items.eq(idxFocado).addClass('combo-item-ativo');
            // scroll into view se necessario
            var el = $it[0];
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
        }
    }

    function abrirLista() {
        $('#slug-add-list').prop('hidden', false);
        $('.combo-wrap').attr('aria-expanded', 'true').addClass('open');
    }
    function fecharLista() {
        $('#slug-add-list').prop('hidden', true);
        $('.combo-wrap').attr('aria-expanded', 'false').removeClass('open');
        idxFocado = -1;
    }

    function carregarDisponiveis() {
        $.getJSON('/labclock/api/cronometros.php').done(function (resp) {
            var jaNoGrupo = {};
            if (estado.grupo && estado.grupo.cronometros) {
                estado.grupo.cronometros.forEach(function (c) { jaNoGrupo[c.slug] = true; });
            }
            disponiveis = (resp.cronometros || []).filter(function (c) { return !jaNoGrupo[c.slug]; });
            renderLista('');
        }).fail(function () {
            disponiveis = [];
            renderLista('');
        });
    }

    function renderLista(filtro) {
        var $list = $('#slug-add-list');
        var itens = filtro
            ? disponiveis.filter(function (c) {
                return c.nome.toLowerCase().indexOf(filtro) !== -1
                    || c.slug.toLowerCase().indexOf(filtro) !== -1
                    || (c.sala_nome && c.sala_nome.toLowerCase().indexOf(filtro) !== -1);
            })
            : disponiveis.slice();
        if (itens.length === 0) {
            var msg = disponiveis.length === 0 ? 'nenhum cronômetro disponível' : 'nenhum resultado';
            $list.html('<li class="combo-empty">' + msg + '</li>');
            return;
        }
        $list.empty();
        itens.forEach(function (c) {
            var sala = c.sala_nome ? '<span class="combo-sala">' + esc(c.sala_nome) + '</span>' : '';
            var $li = $(
                '<li class="combo-item" role="option" data-slug="' + esc(c.slug) + '">' +
                  '<span class="combo-nome">' + esc(c.nome) + '</span>' +
                  sala +
                  '<span class="combo-slug">' + esc(c.slug) + '</span>' +
                '</li>'
            );
            $li.on('click', function () { selecionar(c.slug); });
            $list.append($li);
        });
        idxFocado = -1;
    }

    function selecionar(cronSlug) {
        $('#slug-add').val(cronSlug);
        fecharLista();
        enviarAdd();
    }

    function enviarAdd() {
        var s = $('#slug-add').val().trim().toLowerCase();
        if (!/^[a-z0-9]{4,12}$/.test(s)) {
            $('#erro-add').text('Selecione um cronômetro da lista ou digite um slug válido (4-12 chars).').show();
            return;
        }
        $.ajax({
            url: API_GRUPO + '?slug=' + encodeURIComponent(slug) + '&acao=add',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ cronometro_slug: s }),
        }).done(function () {
            $('#add-form').prop('hidden', true);
            $('#erro-add').hide();
            $('#slug-add').val('');
            fecharLista();
            carregarGrupo(slug);
        }).fail(function (xhr) {
            if (xhr.status === 401) { $('#erro-add').text('Sessão expirou — logue novamente').show(); return; }
            var m = (xhr.responseJSON && xhr.responseJSON.error) || 'erro (HTTP ' + (xhr.status || '0') + ')';
            $('#erro-add').text(m).show();
        });
    }
}


/*
    COMPARTILHAR
*/

function bindCompartilhar(slug) {
    var url = location.origin + '/labclock/g/' + slug + '/';
    $('#btn-copiar').on('click', function () {
        copiarParaClipboard(url, $('#btn-copiar'));
    });
}

// Copia com fallback (mesmo helper que cronometro.js, duplicado pra nao criar dependencia)
function copiarParaClipboard(texto, $btn) {
    var textoOriginal = $btn.text();
    var sucesso = function () {
        $btn.text('Copiado!');
        setTimeout(function () { $btn.text(textoOriginal); }, 2000);
    };
    var falha = function () {
        // Cria um input temporario, seleciona, alerta o user pra copiar manualmente
        prompt('Copie a URL abaixo manualmente:', texto);
        $btn.text(textoOriginal);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(sucesso).catch(function () {
            tentarExecCommand(texto, sucesso, falha);
        });
        return;
    }
    tentarExecCommand(texto, sucesso, falha);
}

function tentarExecCommand(texto, sucesso, falha) {
    try {
        var ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) { sucesso(); return; }
    } catch (e) { /* segue pra falha */ }
    falha();
}


/*
    AVISO DE FIM — 3 beeps Web Audio
*/

function avisarFim() {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        for (var i = 0; i < 3; i++) {
            var osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 880; osc.type = 'sine';
            var t = ctx.currentTime + i * 0.25;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
            osc.start(t); osc.stop(t + 0.2);
        }
    } catch (e) {}
}


/*
    HELPERS
*/

function formatar(ms) {
    var neg = ms < 0;
    var s = Math.abs(Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var mm = m.toString().padStart(2, '0'), ss = sec.toString().padStart(2, '0');
    var sign = neg ? '-' : '';
    if (h > 0) return sign + h + ':' + mm + ':' + ss;
    return sign + mm + ':' + ss;
}

function rotuloStatus(s) {
    if (s === 'RODANDO') return 'rodando';
    if (s === 'PAUSADO') return 'pausado';
    return 'parado';
}

function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bindThemeToggle() {
    $(document).on('click', '.theme-toggle', function () {
        var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var nxt = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nxt);
        try { localStorage.setItem('app-theme', nxt); } catch (e) {}
    });
}
