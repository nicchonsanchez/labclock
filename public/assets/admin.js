/*
    LabClock — Admin (gerenciar usuários)
    Acesso só pra admin. Redireciona não-admins.
*/

$(function () {
    bindThemeToggle();
    verificarAcesso();
    bindFormNovo();
    bindFormSala();
});

function verificarAcesso() {
    $.getJSON('api/auth.php?acao=me').done(function (resp) {
        if (resp.user.papel !== 'admin') {
            alert('Acesso restrito a admins.');
            location.href = './';
            return;
        }
        carregarUsuarios();
        carregarSalas();
    }).fail(function () {
        location.href = 'login.html?next=' + encodeURIComponent(location.pathname);
    });
}

function carregarSalas() {
    $.getJSON('api/salas.php').done(function (resp) {
        var $tb = $('#lista-salas').removeAttr('aria-busy');
        if (!resp.salas || resp.salas.length === 0) {
            $tb.html('<p class="state-msg">Nenhuma sala cadastrada.</p>');
            return;
        }
        var rows = resp.salas.map(function (s) {
            return (
                '<tr>' +
                  '<td><strong>' + esc(s.nome) + '</strong></td>' +
                  '<td class="muted">ordem ' + s.ordem + '</td>' +
                  '<td><button type="button" class="btn-sec btn-sm btn-remover-sala" data-id="' + s.id + '" data-nome="' + esc(s.nome) + '">Remover</button></td>' +
                '</tr>'
            );
        }).join('');
        $tb.html('<table class="tabela-users"><thead><tr><th>Sala</th><th>Ordem</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>');

        $('.btn-remover-sala').on('click', function () {
            var id = $(this).data('id');
            var nome = $(this).data('nome');
            if (!confirm('Remover ' + nome + '? Cronômetros nesta sala ficarão sem sala.')) return;
            $.ajax({ url: 'api/salas.php?id=' + id, method: 'DELETE' })
                .done(carregarSalas)
                .fail(function (xhr) { alert((xhr.responseJSON && xhr.responseJSON.error) || 'erro'); });
        });
    });
}

function bindFormSala() {
    $('#form-nova-sala').on('submit', function (e) {
        e.preventDefault();
        var $err = $('#erro-sala').hide();
        var body = {
            nome:  $('#sala-nome').val().trim(),
            ordem: parseInt($('#sala-ordem').val(), 10) || 0,
        };
        $.ajax({
            url: 'api/salas.php',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(body),
        }).done(function () {
            $('#form-nova-sala')[0].reset();
            $('#sala-ordem').val(0);
            carregarSalas();
        }).fail(function (xhr) {
            $err.text((xhr.responseJSON && xhr.responseJSON.error) || 'erro').show();
        });
    });
}

function carregarUsuarios() {
    $.getJSON('api/usuarios.php').done(function (resp) {
        var $tb = $('#tabela-usuarios');
        $tb.removeAttr('aria-busy');
        if (!resp.usuarios || resp.usuarios.length === 0) {
            $tb.html('<p class="state-msg">Nenhum usuário ainda.</p>');
            return;
        }
        var rows = resp.usuarios.map(function (u) {
            var ultimo = u.last_login_at ? fmtData(u.last_login_at) : '<span class="dim">nunca</span>';
            return (
                '<tr>' +
                  '<td><strong>' + esc(u.nome) + '</strong><br><span class="muted">' + esc(u.email) + '</span></td>' +
                  '<td><span class="tag tag-' + u.papel + '">' + u.papel + '</span></td>' +
                  '<td class="muted">' + fmtData(u.created_at) + '</td>' +
                  '<td class="muted">' + ultimo + '</td>' +
                  '<td><button type="button" class="btn-sec btn-sm btn-remover" data-id="' + u.id + '" data-nome="' + esc(u.nome) + '">Remover</button></td>' +
                '</tr>'
            );
        }).join('');
        $tb.html(
            '<table class="tabela-users">' +
              '<thead><tr><th>Usuário</th><th>Papel</th><th>Criado</th><th>Último login</th><th></th></tr></thead>' +
              '<tbody>' + rows + '</tbody>' +
            '</table>'
        );

        $('.btn-remover').on('click', function () {
            var id = $(this).data('id');
            var nome = $(this).data('nome');
            if (!confirm('Remover ' + nome + '? Não pode desfazer.')) return;
            $.ajax({ url: 'api/usuarios.php?id=' + id, method: 'DELETE' })
                .done(carregarUsuarios)
                .fail(function (xhr) {
                    alert('Falha: ' + ((xhr.responseJSON && xhr.responseJSON.error) || 'erro'));
                });
        });
    });
}

function bindFormNovo() {
    $('#form-novo-user').on('submit', function (e) {
        e.preventDefault();
        var $err = $('#erro-novo').hide();
        var body = {
            email: $('#email').val().trim(),
            nome:  $('#nome').val().trim(),
            senha: $('#senha').val(),
            papel: $('#papel').val(),
        };
        $.ajax({
            url: 'api/usuarios.php',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(body),
        }).done(function () {
            $('#form-novo-user')[0].reset();
            carregarUsuarios();
        }).fail(function (xhr) {
            $err.text((xhr.responseJSON && xhr.responseJSON.error) || 'erro').show();
        });
    });
}

function fmtData(d) {
    if (!d) return '—';
    var dt = new Date(d.replace(' ', 'T'));
    return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bindThemeToggle() {
    $(document).on('click', '.theme-toggle', function () {
        var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var nxt = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nxt);
        try { localStorage.setItem('app-theme', nxt); } catch (e) {}
    });
}
