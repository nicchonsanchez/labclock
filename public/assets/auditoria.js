/*
    LabClock — UI de auditoria (admin).
    Lista paginada do audit log com filtros (usuário, ação, período).
*/

var API_AUDIT = 'api/auditoria.php';
var API_AUTH  = 'api/auth.php';

var estado = {
    limit:  50,
    offset: 0,
    total:  0,
    filtros: {},
};

$(function () {
    bindThemeToggle();
    bindFiltros();
    bindPaginacao();
    checarAdmin().then(function () {
        carregarOpcoesFiltros();
        carregar();
    });
});

function checarAdmin() {
    return $.getJSON(API_AUTH + '?acao=me').then(function (resp) {
        if (!resp.user || resp.user.papel !== 'admin') {
            $('main').html('<section class="hero"><h1>Acesso restrito.</h1><p class="lede">Auditoria é só pra admins. <a href="login.html">Logar como admin</a> ou <a href="./">voltar</a>.</p></section>');
            return Promise.reject('not-admin');
        }
    }).catch(function () {
        $('main').html('<section class="hero"><h1>Acesso restrito.</h1><p class="lede">Você precisa estar logado como admin. <a href="login.html">Logar</a>.</p></section>');
        return Promise.reject('not-logged');
    });
}

function carregarOpcoesFiltros() {
    $.getJSON(API_AUDIT + '?usuarios=1').done(function (r) {
        var $sel = $('#filtro-usuario');
        (r.usuarios || []).forEach(function (u) {
            $sel.append($('<option>').val(u.id).text(u.nome + ' (' + u.email + ')'));
        });
    });
    $.getJSON(API_AUDIT + '?acao_lista=1').done(function (r) {
        var $sel = $('#filtro-acao');
        (r.acoes || []).forEach(function (a) {
            $sel.append($('<option>').val(a).text(a));
        });
    });
}

function bindFiltros() {
    $('#form-filtros').on('submit', function (e) {
        e.preventDefault();
        estado.filtros = {
            usuario_id: $('#filtro-usuario').val(),
            acao:       $('#filtro-acao').val(),
            desde:      $('#filtro-desde').val(),
            ate:        $('#filtro-ate').val(),
        };
        estado.offset = 0;
        carregar();
    });
    $('#btn-limpar').on('click', function () {
        $('#filtro-usuario, #filtro-acao').val('');
        $('#filtro-desde, #filtro-ate').val('');
        estado.filtros = {};
        estado.offset = 0;
        carregar();
    });
}

function bindPaginacao() {
    $('#btn-anterior').on('click', function () {
        if (estado.offset >= estado.limit) {
            estado.offset -= estado.limit;
            carregar();
        }
    });
    $('#btn-proxima').on('click', function () {
        if (estado.offset + estado.limit < estado.total) {
            estado.offset += estado.limit;
            carregar();
        }
    });
}

function carregar() {
    $('#tabela-auditoria').attr('aria-busy', 'true').html('<p class="state-msg">Carregando…</p>');
    var qs = $.param(Object.assign(
        { limit: estado.limit, offset: estado.offset },
        Object.fromEntries(Object.entries(estado.filtros).filter(function (kv) { return kv[1]; }))
    ));
    $.getJSON(API_AUDIT + '?' + qs).done(function (r) {
        estado.total = r.total;
        renderTabela(r.entries);
        atualizarPaginacao();
    }).fail(function (xhr) {
        $('#tabela-auditoria').html('<p class="state-msg">' + esc((xhr.responseJSON && xhr.responseJSON.error) || 'erro') + '</p>');
    });
}

function renderTabela(entries) {
    var $t = $('#tabela-auditoria').removeAttr('aria-busy');
    if (!entries || entries.length === 0) {
        $t.html('<p class="state-msg">Nenhuma entrada encontrada.</p>');
        return;
    }
    var html =
        '<table class="auditoria-table">' +
          '<thead><tr>' +
            '<th>Quando</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>IP</th><th>Detalhes</th>' +
          '</tr></thead><tbody>' +
          entries.map(function (e) {
            return (
                '<tr>' +
                  '<td class="col-quando"><span class="font-mono-meta">' + esc(e.created_at) + '</span></td>' +
                  '<td class="col-user">' + (e.usuario_email ? esc(e.usuario_email) : '<em>anônimo</em>') + '</td>' +
                  '<td class="col-acao"><code>' + esc(e.acao) + '</code></td>' +
                  '<td class="col-ent">' + (e.entidade_tipo ? esc(e.entidade_tipo) + (e.entidade_id ? ' #' + e.entidade_id : '') : '—') + '</td>' +
                  '<td class="col-ip"><span class="font-mono-meta">' + esc(e.ip || '—') + '</span></td>' +
                  '<td class="col-det">' + renderDetalhes(e.detalhes) + '</td>' +
                '</tr>'
            );
        }).join('') +
        '</tbody></table>';
    $t.html(html);
}

function renderDetalhes(d) {
    if (!d) return '—';
    try {
        var json = JSON.stringify(d, null, 0);
        if (json.length > 60) {
            return '<details><summary>' + esc(json.substring(0, 50)) + '…</summary><pre class="audit-pre">' + esc(JSON.stringify(d, null, 2)) + '</pre></details>';
        }
        return '<code>' + esc(json) + '</code>';
    } catch (e) {
        return esc(String(d));
    }
}

function atualizarPaginacao() {
    var inicio = estado.total === 0 ? 0 : estado.offset + 1;
    var fim    = Math.min(estado.offset + estado.limit, estado.total);
    $('#paginacao-info').text(inicio + '–' + fim + ' de ' + estado.total);
    $('#auditoria-meta').text(estado.total + ' entrada' + (estado.total === 1 ? '' : 's'));
    $('#btn-anterior').prop('disabled', estado.offset === 0);
    $('#btn-proxima').prop('disabled', estado.offset + estado.limit >= estado.total);
}

function bindThemeToggle() {
    $(document).on('click', '.theme-toggle', function () {
        var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var nxt = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nxt);
        try { localStorage.setItem('app-theme', nxt); } catch (e) {}
    });
}

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
