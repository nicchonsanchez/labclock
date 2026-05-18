/*
    LabClock — login
    POST /api/auth.php?acao=login → guarda sessão (cookie HttpOnly)
*/

$(function () {
    bindThemeToggle();

    // Se já logado, redireciona pra home
    $.getJSON('api/auth.php?acao=me').done(function () {
        var next = new URLSearchParams(location.search).get('next') || './';
        location.href = next;
    });

    $('#form-login').on('submit', function (e) {
        e.preventDefault();
        var email = $('#email').val().trim();
        var senha = $('#senha').val();
        var $err = $('#erro');
        var $btn = $('#btn-submit');

        $err.hide();
        $btn.prop('disabled', true).text('Entrando...');

        $.ajax({
            url: 'api/auth.php?acao=login',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ email: email, senha: senha }),
        }).done(function () {
            var next = new URLSearchParams(location.search).get('next') || './';
            location.href = next;
        }).fail(function (xhr) {
            var msg = (xhr.responseJSON && xhr.responseJSON.error) || 'erro';
            $err.text(msg === 'credenciais inválidas' ? 'Email ou senha incorretos.' : msg).show();
            $btn.prop('disabled', false).text('Entrar');
        });
    });
});

function bindThemeToggle() {
    $(document).on('click', '.theme-toggle', function () {
        var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var nxt = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nxt);
        try { localStorage.setItem('app-theme', nxt); } catch (e) {}
    });
}
