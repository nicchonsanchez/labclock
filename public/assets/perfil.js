/*
    LabClock — Perfil (trocar senha)
*/

$(function () {
    bindThemeToggle();
    verificarAcesso();
    bindForm();
});

function verificarAcesso() {
    $.getJSON('api/auth.php?acao=me').done(function (resp) {
        $('#meu-nome').text(resp.user.nome);
        $('#meu-email').text(resp.user.email);
    }).fail(function () {
        location.href = 'login.html?next=' + encodeURIComponent(location.pathname);
    });
}

function bindForm() {
    $('#form-senha').on('submit', function (e) {
        e.preventDefault();
        var $err = $('#erro').hide();
        var $ok = $('#ok').hide();
        var atual = $('#senha-atual').val();
        var nova  = $('#senha-nova').val();
        var conf  = $('#senha-confirma').val();

        if (nova !== conf) {
            $err.text('A confirmação não bate com a senha nova.').show();
            return;
        }
        if (atual === nova) {
            $err.text('Senha nova deve ser diferente da atual.').show();
            return;
        }

        $('#btn-submit').prop('disabled', true).text('Trocando...');

        $.ajax({
            url: 'api/usuarios.php?acao=trocar-senha',
            method: 'PATCH',
            contentType: 'application/json',
            data: JSON.stringify({ senha_atual: atual, senha_nova: nova }),
        }).done(function () {
            $('#form-senha')[0].reset();
            $ok.show();
        }).fail(function (xhr) {
            $err.text((xhr.responseJSON && xhr.responseJSON.error) || 'erro').show();
        }).always(function () {
            $('#btn-submit').prop('disabled', false).text('Trocar');
        });
    });
}

function bindThemeToggle() {
    $(document).on('click', '.theme-toggle', function () {
        var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var nxt = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nxt);
        try { localStorage.setItem('app-theme', nxt); } catch (e) {}
    });
}
