/*
    LabClock — home: lista cronômetros + criar
    Polling a cada 3s pra refletir mudanças feitas em outros dispositivos.
*/

var API = 'api/cronometros.php';
var POLL_MS = 3000;

var salasCache = [];
var filtroSalaId = null;  // null = todas

$(function () {
    bindThemeToggle();
    bindFormCriar();
    bindFormCriarGrupo();
    bindUserArea();
    carregarSalas();
    carregarLista();
    carregarGrupos();
    setInterval(function () { carregarLista(); carregarGrupos(); }, POLL_MS);
});

/*
    HEADER user-area: mostra "logado como X" ou link de login
*/
function bindUserArea() {
    $.getJSON('api/auth.php?acao=me').done(function (resp) {
        var u = resp.user;
        var adminLink = u.papel === 'admin'
            ? '<a href="admin.html" class="link-nav" title="Gerenciar usuários">admin</a>'
            : '';
        $('#user-area').html(
            '<span class="user-chip">' +
              adminLink +
              '<a href="perfil.html" class="link-nav">perfil</a>' +
              '<span class="user-sep">·</span>' +
              '<span class="user-nome">' + esc(u.nome) + '</span>' +
              '<button type="button" id="btn-logout">sair</button>' +
            '</span>'
        );
        $('#btn-logout').on('click', function () {
            $.ajax({ url: 'api/auth.php?acao=logout', method: 'POST' }).always(function () {
                location.reload();
            });
        });
    }).fail(function () {
        var next = encodeURIComponent(location.pathname + location.search);
        $('#user-area').html('<a href="login.html?next=' + next + '" class="login-link">Entrar</a>');
        // Desabilita form de criar se não logado
        $('#form-criar button[type=submit]').prop('disabled', true).text('Faça login pra criar');
    });
}


/*
    LISTA
*/

function carregarSalas() {
    $.getJSON('api/salas.php').done(function (resp) {
        salasCache = resp.salas || [];
        // dropdown no form de criar cronômetro
        var $sel = $('#sala').empty().append('<option value="">— sem sala —</option>');
        salasCache.forEach(function (s) {
            $sel.append('<option value="' + s.id + '">' + esc(s.nome) + '</option>');
        });
        // chips de filtro
        var $chips = $('#filtros-sala').empty();
        var todasClass = filtroSalaId === null ? ' ativo' : '';
        $chips.append('<button class="chip-sala' + todasClass + '" data-sala="">Todas</button>');
        salasCache.forEach(function (s) {
            var cls = filtroSalaId === s.id ? ' ativo' : '';
            $chips.append('<button class="chip-sala' + cls + '" data-sala="' + s.id + '">' + esc(s.nome) + '</button>');
        });
        $('.chip-sala').on('click', function () {
            var v = $(this).data('sala');
            filtroSalaId = v === '' || v === undefined ? null : parseInt(v, 10);
            $('.chip-sala').removeClass('ativo');
            $(this).addClass('ativo');
            carregarLista();
        });
    });
}

function carregarLista() {
    var url = API + (filtroSalaId !== null ? '?sala_id=' + filtroSalaId : '');
    $.getJSON(url).done(function (resp) {
        var $list = $('#lista');
        $list.removeAttr('aria-busy');
        if (!resp.cronometros || resp.cronometros.length === 0) {
            $list.html('<p class="state-msg">Nenhum cronômetro' + (filtroSalaId !== null ? ' nesta sala' : '') + '.</p>');
            return;
        }
        var server_ms = resp.server_time_ms;
        var html = resp.cronometros.map(function (c) {
            return renderItem(c, server_ms);
        }).join('');
        $list.html(html);
    }).fail(function () {
        $('#lista').html('<p class="state-msg">Erro ao carregar — tentando novamente em alguns segundos.</p>');
    });
}

function carregarGrupos() {
    $.getJSON('api/grupos.php').done(function (resp) {
        var $list = $('#lista-grupos').removeAttr('aria-busy');
        if (!resp.grupos || resp.grupos.length === 0) {
            $list.html('<p class="state-msg">Você ainda não tem grupos. Crie um acima.</p>');
            return;
        }
        var html = resp.grupos.map(function (g) {
            return (
                '<a href="g/' + esc(g.slug) + '/" class="cronometro-item grupo-card">' +
                  '<p class="codigo">' + esc(g.slug) + '</p>' +
                  '<h3 class="titulo">' + esc(g.nome) + '</h3>' +
                  '<p class="tempo grupo-stats">' + g.total_cronometros + ' cronômetro' + (g.total_cronometros === 1 ? '' : 's') + '</p>' +
                '</a>'
            );
        }).join('');
        $list.html(html);
    }).fail(function (xhr) {
        // Usuário não logado retorna 401 — esconde a seção
        if (xhr.status === 401) {
            $('#lista-grupos').closest('section').hide();
        }
    });
}

function renderItem(c, serverMs) {
    var remaining = calcularRemaining(c, serverMs);
    var badge = '';
    if (c.status === 'RODANDO') badge = '<span class="badge rodando">rodando</span>';
    else if (c.status === 'PAUSADO') badge = '<span class="badge pausado">pausado</span>';
    else badge = '<span class="badge">parado</span>';
    return (
        '<a href="c/' + esc(c.slug) + '/" class="cronometro-item">' +
            badge +
            '<p class="codigo">' + esc(c.slug) + '</p>' +
            '<h3 class="titulo">' + esc(c.nome) + '</h3>' +
            '<p class="tempo">' + formatar(remaining) + '</p>' +
        '</a>'
    );
}

// Calcula remaining_ms canônico baseado no estado autoritativo do servidor
function calcularRemaining(c, serverMs) {
    if (c.status === 'RODANDO' && c.started_at_ms) {
        return c.duracao_ms - (serverMs - c.started_at_ms);
    }
    if (c.status === 'PAUSADO' && c.paused_remaining_ms !== null) {
        return c.paused_remaining_ms;
    }
    return c.duracao_ms;
}


/*
    CRIAR
*/

function bindFormCriar() {
    $('#form-criar').on('submit', function (e) {
        e.preventDefault();
        var nome = $('#nome').val().trim() || 'Cronômetro';
        var tempoStr = $('#tempo').val().trim() || '60';
        var duracao_ms = parsearTempoMs(tempoStr);
        var sala = $('#sala').val();
        if (duracao_ms < 1000) { alert('Tempo mínimo: 1 segundo'); return; }
        var body = { nome: nome, duracao_ms: duracao_ms };
        if (sala) body.sala_id = parseInt(sala, 10);
        $.ajax({
            url: API,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(body),
        }).done(function (resp) {
            location.href = 'c/' + resp.slug + '/';
        }).fail(function (xhr) {
            alert('Erro ao criar: ' + ((xhr.responseJSON && xhr.responseJSON.error) || 'erro'));
        });
    });
}

function bindFormCriarGrupo() {
    $('#form-criar-grupo').on('submit', function (e) {
        e.preventDefault();
        var nome = $('#nome-grupo').val().trim();
        if (!nome) { alert('Nome obrigatório'); return; }
        $.ajax({
            url: 'api/grupos.php',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ nome: nome }),
        }).done(function (resp) {
            location.href = 'g/' + resp.slug + '/';
        }).fail(function (xhr) {
            alert('Erro ao criar grupo: ' + ((xhr.responseJSON && xhr.responseJSON.error) || 'erro'));
        });
    });
}


/*
    HELPERS — formatação de tempo
*/

// Aceita "5", "5:00", "1:30:00" — devolve milissegundos
function parsearTempoMs(texto) {
    texto = texto.trim();
    if (texto.indexOf(':') !== -1) {
        var partes = texto.split(':').map(function (p) { return parseInt(p, 10) || 0; });
        if (partes.length === 3) return (partes[0] * 3600 + partes[1] * 60 + partes[2]) * 1000;
        if (partes.length === 2) return (partes[0] * 60 + partes[1]) * 1000;
        return 0;
    }
    var n = parseInt(texto, 10);
    return isNaN(n) ? 0 : n * 1000;
}

// ms → "MM:SS" (ou "H:MM:SS"). Aceita negativos com prefixo "-".
function formatar(ms) {
    var negativo = ms < 0;
    var segundos = Math.abs(Math.floor(ms / 1000));
    var h = Math.floor(segundos / 3600);
    var m = Math.floor((segundos % 3600) / 60);
    var s = segundos % 60;
    var mm = m.toString().padStart(2, '0');
    var ss = s.toString().padStart(2, '0');
    var sinal = negativo ? '-' : '';
    if (h > 0) return sinal + h + ':' + mm + ':' + ss;
    return sinal + mm + ':' + ss;
}

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}


/*
    TEMA (compartilha localStorage 'app-theme' com app.nicchon.com)
*/

function bindThemeToggle() {
    $(document).on('click', '.theme-toggle', function () {
        var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var nxt = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nxt);
        try { localStorage.setItem('app-theme', nxt); } catch (e) {}
    });
}
