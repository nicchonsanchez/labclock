/*
    LabClock — Service Worker.
    Fase 6: notificação no SO quando timer cruza zero (mesmo com aba sem foco).
    Não faz cache (sistema é polling-heavy, queremos sempre dados frescos).

    Service Worker precisa estar no escopo da pasta — fica em /labclock/sw.js
    pra cobrir /labclock/* (todas as páginas e API).
*/

self.addEventListener('install', function (e) {
    self.skipWaiting();
});

self.addEventListener('activate', function (e) {
    e.waitUntil(self.clients.claim());
});

// Recebe mensagem do client { tipo: 'notify', titulo, body, slug, icon? }
self.addEventListener('message', function (e) {
    var data = e.data || {};
    if (data.tipo !== 'notify') return;
    var titulo = data.titulo || 'LabClock';
    var opts = {
        body:   data.body || 'Um cronômetro chegou ao fim.',
        icon:   data.icon || 'https://nicchon.com/favicon.svg',
        badge:  data.icon || 'https://nicchon.com/favicon.svg',
        tag:    data.slug ? 'labclock-' + data.slug : 'labclock',
        renotify: true,
        data:   { slug: data.slug || null, url: data.url || null },
        // Vibração só funciona em alguns mobile; ignora silencioso em desktop
        vibrate: [200, 100, 200],
    };
    self.registration.showNotification(titulo, opts);
});

// Clique na notificação: foca aba existente ou abre nova
self.addEventListener('notificationclick', function (e) {
    e.notification.close();
    var data = e.notification.data || {};
    var alvo = data.url || (data.slug ? '/labclock/c/' + data.slug + '/' : '/labclock/');

    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
            // Procura aba já aberta com o cronômetro
            for (var i = 0; i < lista.length; i++) {
                var c = lista[i];
                if (c.url.indexOf(alvo) !== -1 && 'focus' in c) return c.focus();
            }
            // Caso contrário abre nova
            if (self.clients.openWindow) return self.clients.openWindow(alvo);
        })
    );
});
