/*
    LabClock — landing pública.
    Vanilla JS (sem jQuery) pra ser leve. Faz 1 fetch pra detectar login → redirect.
    Theme toggle compartilhado.
*/

(function () {
    // Se já estiver logado, manda direto pro painel
    fetch('api/auth.php?acao=me', { credentials: 'same-origin' })
        .then(function (r) { if (r.ok) location.replace('app.html'); })
        .catch(function () {});

    // Theme toggle
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.theme-toggle');
        if (!btn) return;
        var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var nxt = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nxt);
        try { localStorage.setItem('app-theme', nxt); } catch (e2) {}
    });
})();
