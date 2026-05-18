/*
    LabClock — página de grupo (vários cronômetros sincronizados)
    /g/{slug}/ → polling 3s + display local 10fps (mesma estratégia da página individual).
*/

var API_GRUPO = '../api/grupos.php';
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
    $.getJSON('../api/auth.php?acao=me').done(function (resp) {
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
        $('#btn-tv').attr('href', '../tv/' + slug + '/');
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
                '<a href="../c/' + esc(c.slug) + '/" class="cron-titulo">' +
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
          .fail(function (xhr) { alert((xhr.responseJSON && xhr.responseJSON.error) || 'erro'); });
    });
}

// Roda 10fps — atualiza displays sem precisar de novo HTML
function atualizarDisplays() {
    if (!estado.grupo) return;
    var serverNow = Date.now() + estado.serverOffsetMs;
    estado.grupo.cronometros.forEach(function (c) {
        var rem = calcularRemaining(c, serverNow);
        $('.cron-display[data-slug="' + c.slug + '"]').text(formatar(rem));

        // Beep + classe atrasado quando cruza zero (cada cronômetro independente)
        if (c.status === 'RODANDO') {
            if (rem <= 0 && !estado.beepEm[c.slug]) {
                estado.beepEm[c.slug] = true;
                avisarFim();
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
    $('#btn-add').on('click', function () {
        $('#add-form').prop('hidden', false);
        $('#slug-add').val('').focus();
    });
    $('#btn-add-cancel').on('click', function () {
        $('#add-form').prop('hidden', true);
        $('#erro-add').hide();
    });
    $('#btn-add-confirm').on('click', enviarAdd);
    $('#slug-add').on('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); enviarAdd(); } });

    function enviarAdd() {
        var s = $('#slug-add').val().trim().toLowerCase();
        if (!/^[a-z0-9]{4,12}$/.test(s)) {
            $('#erro-add').text('Slug inválido (4-12 letras/números)').show();
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
            carregarGrupo(slug);
        }).fail(function (xhr) {
            $('#erro-add').text((xhr.responseJSON && xhr.responseJSON.error) || 'erro').show();
        });
    }
}


/*
    COMPARTILHAR
*/

function bindCompartilhar(slug) {
    $('#btn-copiar').on('click', function () {
        var url = location.origin + location.pathname.replace(/grupo\.html.*$/, '') + (location.pathname.indexOf('/g/') !== -1 ? '' : 'g/' + slug + '/');
        if (location.pathname.indexOf('/g/') !== -1) url = location.href;
        navigator.clipboard.writeText(url).then(function () {
            var $b = $('#btn-copiar');
            var orig = $b.text();
            $b.text('Copiado!');
            setTimeout(function () { $b.text(orig); }, 2000);
        });
    });
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
