/*
    LabClock — TV mode
    Reusa o slug do grupo. Layout full-screen, números gigantes, sem header normal.
    Wake Lock API mantém tela ligada. QR code aponta pra URL /g/{slug}/ pra pareamento celular.
*/

var API_GRUPO = '/labclock/api/grupos.php';
var POLL_MS = 3000;
var DISPLAY_FPS = 10;

var estado = {
    grupo: null,
    serverOffsetMs: 0,
    beepEm: {},          // slug → bool
    flashEm: {},         // slug → timestamp do flash
    wakeLock: null,
};

$(function () {
    var slug = obterSlugDaURL();
    if (!slug) { $('#tv-nome').text('Slug ausente'); return; }
    bindFullscreen();
    bindRelogio();
    bindWakeLock();
    if (window.lcNotify) {
        lcNotify.init();
        // TV: pede permissão no 1o clique em qualquer lugar (gesto de usuário necessário)
        $(document).one('click', function () { lcNotify.pedirPermissao(); });
    }
    carregarGrupo(slug);
    setInterval(function () { carregarGrupo(slug); }, POLL_MS);
    setInterval(atualizarDisplays, Math.floor(1000 / DISPLAY_FPS));
});

function obterSlugDaURL() {
    var qs = new URLSearchParams(location.search);
    if (qs.get('slug')) return qs.get('slug');
    var m = location.pathname.match(/\/tv\/([a-z0-9]{4,12})\/?$/);
    return m ? m[1] : null;
}

function bindRelogio() {
    function tick() {
        var d = new Date();
        var hh = d.getHours().toString().padStart(2, '0');
        var mm = d.getMinutes().toString().padStart(2, '0');
        $('#tv-relogio').text(hh + ':' + mm);
    }
    tick();
    setInterval(tick, 30000); // atualiza a cada 30s — segundos no relógio de parede só polui
}

function bindFullscreen() {
    $('#tv-fullscreen').on('click', function () {
        var el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    });
    // Em algumas TVs (Smart TV, browsers de quiosque), entra fullscreen no primeiro clique em qualquer lugar
}

// Mantém a tela acordada — sem isso a TV apaga em ~10min de inatividade
async function bindWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        estado.wakeLock = await navigator.wakeLock.request('screen');
        // Re-adquire quando volta de visibility hidden (tablet desbloqueio)
        document.addEventListener('visibilitychange', async function () {
            if (document.visibilityState === 'visible' && estado.wakeLock === null) {
                try { estado.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
            }
        });
    } catch (e) { /* permissão negada — ok, segue sem */ }
}


/*
    SYNC com servidor
*/

function carregarGrupo(slug) {
    $.getJSON(API_GRUPO + '?slug=' + encodeURIComponent(slug)).done(function (g) {
        var primeira = !estado.grupo;
        estado.grupo = g;
        estado.serverOffsetMs = g.server_time_ms - Date.now();
        $('#tv-nome').text(g.nome.toUpperCase());

        if (primeira) {
            // Gera QR code uma vez (URL não muda)
            var url = location.origin + '/labclock/g/' + slug + '/';
            $('#tv-url-mobile').text(url.replace(/^https?:\/\//, ''));
            new QRCode(document.getElementById('tv-qr'), {
                text: url,
                width: 100,
                height: 100,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M,
            });
        }
        renderGrid(g);
    }).fail(function (xhr) {
        if (xhr.status === 404) $('#tv-nome').text('Grupo não encontrado');
    });
}

function renderGrid(g) {
    var $grid = $('#tv-grid').removeAttr('aria-busy');
    var crs = g.cronometros;
    if (!crs || crs.length === 0) {
        $grid.attr('class', 'tv-grid').html('<p class="tv-state">Grupo vazio. Adicione cronômetros pela página de gerenciamento.</p>');
        return;
    }
    // Define quantas colunas baseado em quantos cronômetros
    var colsClass = 'cols-many';
    if      (crs.length === 1) colsClass = 'cols-1';
    else if (crs.length === 2) colsClass = 'cols-2';
    else if (crs.length === 3) colsClass = 'cols-3';
    else if (crs.length === 4) colsClass = 'cols-4';
    $grid.attr('class', 'tv-grid ' + colsClass);

    var html = crs.map(function (c) {
        return (
            '<article class="tv-card" data-slug="' + esc(c.slug) + '">' +
              '<h2 class="tv-card-nome">' + esc(c.nome) + '</h2>' +
              (c.sala_nome ? '<p class="tv-card-sala">' + esc(c.sala_nome) + '</p>' : '<p class="tv-card-sala"></p>') +
              '<p class="tv-card-tempo" data-slug-tempo="' + esc(c.slug) + '">--:--</p>' +
              '<p class="tv-card-status" data-slug-status="' + esc(c.slug) + '">—</p>' +
            '</article>'
        );
    }).join('');
    $grid.html(html);
}

// 10fps — atualiza display de cada cronômetro com cálculo local
function atualizarDisplays() {
    if (!estado.grupo) return;
    var serverNow = Date.now() + estado.serverOffsetMs;
    estado.grupo.cronometros.forEach(function (c) {
        var rem = calcularRemaining(c, serverNow);
        $('[data-slug-tempo="' + c.slug + '"]').text(formatar(rem));
        var $card = $('.tv-card[data-slug="' + c.slug + '"]');

        // Status visual + texto
        if (c.status === 'RODANDO' && rem < 0) {
            $card.addClass('rodando atrasado');
            $('[data-slug-status="' + c.slug + '"]').text('atrasado');
        } else if (c.status === 'RODANDO') {
            $card.addClass('rodando').removeClass('atrasado');
            $('[data-slug-status="' + c.slug + '"]').text('rodando');
        } else if (c.status === 'PAUSADO') {
            $card.removeClass('rodando atrasado');
            $('[data-slug-status="' + c.slug + '"]').text('pausado');
        } else {
            $card.removeClass('rodando atrasado terminado');
            $('[data-slug-status="' + c.slug + '"]').text('parado');
        }

        // Beep + flash quando cruza zero
        if (c.status === 'RODANDO') {
            if (rem <= 0 && !estado.beepEm[c.slug]) {
                estado.beepEm[c.slug] = true;
                avisarFim();
                $card.addClass('terminado');
                setTimeout(function () { $card.removeClass('terminado'); }, 3000);
                if (window.lcNotify) {
                    lcNotify.disparar({
                        titulo: 'Cronômetro terminou',
                        body:   (c.nome || c.slug) + ' chegou ao zero.',
                        slug:   c.slug,
                        url:    '/labclock/c/' + c.slug + '/',
                    });
                }
            }
        } else if (c.status === 'PARADO') {
            estado.beepEm[c.slug] = false; // reset pra próximo ciclo
        }
    });
}

function calcularRemaining(c, serverNow) {
    if (c.status === 'RODANDO' && c.started_at_ms) return c.duracao_ms - (serverNow - c.started_at_ms);
    if (c.status === 'PAUSADO' && c.paused_remaining_ms !== null) return c.paused_remaining_ms;
    return c.duracao_ms;
}


/*
    BEEP — Web Audio (mesmo padrão das outras páginas)
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
            gain.gain.exponentialRampToValueAtTime(0.5, t + 0.01); // 0.5 em vez de 0.3 — TV precisa ser mais audível
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

function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
