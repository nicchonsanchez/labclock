/*
    LabClock — home: lista cronômetros + criar
    Polling a cada 3s pra refletir mudanças feitas em outros dispositivos.
*/

var API = 'api/cronometros.php';
var POLL_MS = 3000;

$(function () {
    bindThemeToggle();
    bindFormCriar();
    bindUserArea();
    carregarLista();
    setInterval(carregarLista, POLL_MS);
});

/*
    HEADER user-area: mostra "logado como X" ou link de login
*/
function bindUserArea() {
    $.getJSON('api/auth.php?acao=me').done(function (resp) {
        var u = resp.user;
        $('#user-area').html(
            '<span class="user-chip">' +
              '<span>como <span class="user-nome">' + esc(u.nome) + '</span></span>' +
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

function carregarLista() {
    $.getJSON(API).done(function (resp) {
        var $list = $('#lista');
        $list.removeAttr('aria-busy');
        if (!resp.cronometros || resp.cronometros.length === 0) {
            $list.html('<p class="state-msg">Nenhum cronômetro ainda. Crie o primeiro acima.</p>');
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
        if (duracao_ms < 1000) {
            alert('Tempo mínimo: 1 segundo');
            return;
        }
        $.ajax({
            url: API,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ nome: nome, duracao_ms: duracao_ms }),
        }).done(function (resp) {
            // Redireciona pra página individual do cronômetro criado
            location.href = 'c/' + resp.slug + '/';
        }).fail(function (xhr) {
            var msg = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : 'erro desconhecido';
            alert('Erro ao criar: ' + msg);
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
