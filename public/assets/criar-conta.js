/*
    LabClock — self-service signup.
    Cria tenant + admin numa requisição e faz login automático.
*/

$(function () {
    bindThemeToggle();
    bindAutoSlug();
    bindSubmit();
    redirecionarSeLogado();
});

function redirecionarSeLogado() {
    $.getJSON('api/auth.php?acao=me').done(function (resp) {
        if (resp.user) location.href = 'app.html';
    });
}

// Auto-preenche o slug a partir do nome do lab (enquanto user não digitar nada manualmente)
function bindAutoSlug() {
    var slugTouched = false;
    $('#tenant-slug').on('input', function () { slugTouched = true; });
    $('#tenant-nome').on('input', function () {
        if (slugTouched) return;
        var s = slugify($(this).val());
        $('#tenant-slug').val(s);
    });
}

function slugify(s) {
    return (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')  // remove acentos
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 20);
}

function bindSubmit() {
    $('#form-signup').on('submit', function (e) {
        e.preventDefault();
        $('#erro').hide();
        var $btn = $('#btn-submit').prop('disabled', true).text('Criando…');

        var dados = {
            tenant_nome: $('#tenant-nome').val().trim(),
            tenant_slug: $('#tenant-slug').val().trim().toLowerCase(),
            admin_nome:  $('#admin-nome').val().trim(),
            admin_email: $('#admin-email').val().trim().toLowerCase(),
            admin_senha: $('#admin-senha').val(),
        };

        $.ajax({
            url: 'api/signup.php',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(dados),
        }).done(function (resp) {
            // Login já está feito (sessão criada pelo backend). Manda pro dashboard.
            location.href = 'app.html';
        }).fail(function (xhr) {
            var msg = (xhr.responseJSON && xhr.responseJSON.error) || 'erro inesperado';
            $('#erro').text(msg).show();
            $btn.prop('disabled', false).text('Criar lab e entrar');
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
