/*
    LabClock — registro de Service Worker + helper de notificação no SO.
    Importado por cronometro.js, grupo.js e tv.js.

    Uso:
      lcNotify.init();                         // registra SW (idempotente)
      lcNotify.pedirPermissao();               // chama 1x antes do start
      lcNotify.disparar({ titulo, body, slug, url });  // notifica
*/

(function (global) {
    var swReg = null;
    var permissaoPedida = false;

    function suportado() {
        return 'serviceWorker' in navigator && 'Notification' in window;
    }

    function init() {
        if (!suportado()) return;
        // SW fica em /labclock/sw.js — escopo cobre /labclock/* automaticamente
        var swUrl = (location.pathname.indexOf('/labclock/') !== -1)
            ? '/labclock/sw.js'
            : 'sw.js';
        navigator.serviceWorker.register(swUrl, { scope: '/labclock/' }).then(function (reg) {
            swReg = reg;
        }).catch(function (e) {
            // Silencioso — sistema funciona sem SW, só não tem notificação
        });
    }

    function pedirPermissao() {
        if (!suportado()) return Promise.resolve('unsupported');
        if (permissaoPedida) return Promise.resolve(Notification.permission);
        permissaoPedida = true;
        if (Notification.permission === 'default') {
            return Notification.requestPermission();
        }
        return Promise.resolve(Notification.permission);
    }

    function disparar(opts) {
        if (!suportado()) return;
        if (Notification.permission !== 'granted') return;
        // Preferência: posta pro SW (funciona mesmo se aba sem foco).
        // Fallback: new Notification() direto (só funciona com aba ativa em alguns browsers).
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                tipo:   'notify',
                titulo: opts.titulo || 'LabClock',
                body:   opts.body || 'Cronômetro terminou.',
                slug:   opts.slug || null,
                url:    opts.url || null,
            });
        } else if (swReg && swReg.showNotification) {
            swReg.showNotification(opts.titulo || 'LabClock', {
                body: opts.body || 'Cronômetro terminou.',
                icon: 'https://nicchon.com/favicon.svg',
                tag:  opts.slug ? 'labclock-' + opts.slug : 'labclock',
                renotify: true,
                data: { slug: opts.slug || null, url: opts.url || null },
            });
        } else {
            try {
                new Notification(opts.titulo || 'LabClock', {
                    body: opts.body || 'Cronômetro terminou.',
                    icon: 'https://nicchon.com/favicon.svg',
                    tag:  opts.slug ? 'labclock-' + opts.slug : 'labclock',
                });
            } catch (e) {}
        }
    }

    global.lcNotify = {
        init:           init,
        pedirPermissao: pedirPermissao,
        disparar:       disparar,
        suportado:      suportado,
    };
})(window);
