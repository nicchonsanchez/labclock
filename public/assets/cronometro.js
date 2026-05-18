/*
    LabClock — página individual /c/{slug}/

    Estratégia de sync:
    - Polling a cada 3s pega o estado autoritativo do servidor
    - Entre polls, o display é atualizado localmente (10x por segundo)
      calculando tempo restante a partir de started_at_ms + duracao_ms
    - Quando cruza 0, dispara beep local (1 vez)
*/

var API = '../api/cronometros.php';
var POLL_MS = 3000;
var DISPLAY_FPS = 10;

var estado = {
    cronometro: null,       // último estado vindo do servidor
    serverOffsetMs: 0,      // diferença entre clock local e servidor
    jaBeepou: false,        // flag pra disparar beep uma vez quando cruza 0
};

$(function () {
    var slug = obterSlugDaURL();
    if (!slug) {
        $('#cronometro-status').text('Slug ausente na URL');
        return;
    }
    bindThemeToggle();
    bindBotoes(slug);
    bindCompartilhar(slug);
    carregarEstado(slug);
    setInterval(function () { carregarEstado(slug); }, POLL_MS);
    setInterval(atualizarDisplay, Math.floor(1000 / DISPLAY_FPS));
});

// Suporta tanto /c/abc12xyz/ (rewrite) quanto /cronometro.html?slug=abc12xyz
function obterSlugDaURL() {
    var qs = new URLSearchParams(location.search);
    if (qs.get('slug')) return qs.get('slug');
    var m = location.pathname.match(/\/c\/([a-z0-9]{4,12})\/?$/);
    return m ? m[1] : null;
}


/*
    SYNC COM SERVIDOR
*/

function carregarEstado(slug) {
    $.getJSON(API + '?slug=' + encodeURIComponent(slug)).done(function (c) {
        estado.cronometro = c;
        estado.serverOffsetMs = c.server_time_ms - Date.now();
        $('#cronometro').removeAttr('aria-busy');
        $('#cronometro-nome').text(c.nome);
        $('#cronometro-codigo').text('Código · ' + c.slug);
        $('#cronometro-status').text(rotuloStatus(c.status));
        atualizarClasses(c.status);
        atualizarBotoes(c.status);
        // Reset do beep só quando status volta pra PARADO ou for resetado
        if (c.status === 'PARADO') estado.jaBeepou = false;
    }).fail(function (xhr) {
        if (xhr.status === 404) {
            $('#cronometro-status').text('Cronômetro não encontrado');
        }
    });
}


/*
    DISPLAY (roda 10x/s pra suavidade visual)
*/

function atualizarDisplay() {
    var c = estado.cronometro;
    if (!c) return;
    var serverNow = Date.now() + estado.serverOffsetMs;
    var remaining = calcularRemaining(c, serverNow);
    $('#cronometro-display').text(formatar(remaining));

    // Beep quando cruza 0 (rodando)
    if (c.status === 'RODANDO' && remaining <= 0 && !estado.jaBeepou) {
        estado.jaBeepou = true;
        avisarFim();
    }
    // Mostra "atrasado" quando rodando em negativo
    if (c.status === 'RODANDO' && remaining < 0) {
        $('#cronometro').addClass('atrasado');
    } else {
        $('#cronometro').removeClass('atrasado');
    }
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
    AÇÕES (start / pause / reset / excluir)
*/

function bindBotoes(slug) {
    $('[data-acao]').on('click', function () {
        var acao = $(this).data('acao');
        $.ajax({
            url: API + '?slug=' + encodeURIComponent(slug) + '&acao=' + encodeURIComponent(acao),
            method: 'PATCH',
        }).done(function () {
            // Recarrega imediatamente pra refletir mudança (sem esperar 3s do polling)
            carregarEstado(slug);
        }).fail(function (xhr) {
            var msg = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : 'erro';
            alert('Falha: ' + msg);
        });
    });
}

function atualizarBotoes(status) {
    var $start = $('[data-acao=start]');
    var $pause = $('[data-acao=pause]');
    var $reset = $('[data-acao=reset]');
    if (status === 'RODANDO') {
        $start.prop('disabled', true);
        $pause.prop('disabled', false);
        $reset.prop('disabled', false);
    } else if (status === 'PAUSADO') {
        $start.prop('disabled', false).text('Retomar');
        $pause.prop('disabled', true);
        $reset.prop('disabled', false);
    } else {
        $start.prop('disabled', false).text('Iniciar');
        $pause.prop('disabled', true);
        $reset.prop('disabled', true);
    }
}

function atualizarClasses(status) {
    $('#cronometro').removeClass('rodando pausado atrasado');
    if (status === 'RODANDO') $('#cronometro').addClass('rodando');
    if (status === 'PAUSADO') $('#cronometro').addClass('pausado');
}

function rotuloStatus(s) {
    if (s === 'RODANDO') return 'Rodando';
    if (s === 'PAUSADO') return 'Pausado';
    return 'Parado';
}


/*
    AVISO DE FIM (3 beeps via Web Audio)
*/

function avisarFim() {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        for (var i = 0; i < 3; i++) {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.type = 'sine';
            var start = ctx.currentTime + i * 0.25;
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
            osc.start(start);
            osc.stop(start + 0.2);
        }
    } catch (e) {}
}


/*
    COMPARTILHAR
*/

function bindCompartilhar(slug) {
    var url = location.origin + location.pathname.replace(/\/cronometro\.html$/, '/c/' + slug + '/').replace(/[^/]+$/, 'c/' + slug + '/');
    // Simplificação: usa a URL atual se já estiver no formato bonito; senão, monta
    if (location.pathname.indexOf('/c/') === -1) {
        url = location.origin + location.pathname.replace(/cronometro\.html.*$/, '') + 'c/' + slug + '/';
    } else {
        url = location.href;
    }
    $('#share-url').val(url);
    $('#copy-url').on('click', function () {
        navigator.clipboard.writeText(url).then(function () {
            $('#copy-url').text('Copiado!');
            setTimeout(function () { $('#copy-url').text('Copiar link'); }, 2000);
        });
    });
}


/*
    FORMATAÇÃO + TEMA
*/

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

function bindThemeToggle() {
    $(document).on('click', '.theme-toggle', function () {
        var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var nxt = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nxt);
        try { localStorage.setItem('app-theme', nxt); } catch (e) {}
    });
}
