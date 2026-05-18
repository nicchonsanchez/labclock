<?php
// LabClock — endpoint de leitura do audit log (admin only).
//
//   GET /api/auditoria.php?limit=100&offset=0
//                          &usuario_id=N    (opcional)
//                          &acao=X          (opcional, ex: 'cronometro.start')
//                          &desde=YYYY-MM-DD (opcional)
//                          &ate=YYYY-MM-DD   (opcional)
//
//   GET /api/auditoria.php?acao_lista=1  → lista de ações distintas (pra dropdown)
//   GET /api/auditoria.php?usuarios=1    → lista compacta {id, email, nome} pra filtro

declare(strict_types=1);

require_once __DIR__ . '/_db.php';
require_once __DIR__ . '/_util.php';
require_once __DIR__ . '/_auth.php';
require_once __DIR__ . '/_audit.php';

header('X-Content-Type-Options: nosniff');

$method = $_SERVER['REQUEST_METHOD'];
$me     = lc_require_login();
if (($me['papel'] ?? '') !== 'admin') {
    lc_json(['error' => 'somente admin'], 403);
}

try {
    if ($method !== 'GET') lc_json(['error' => 'método não suportado'], 405);

    // Endpoints auxiliares pros filtros do front
    if (isset($_GET['acao_lista'])) {
        lc_json(['acoes' => lc_audit_acoes()]);
    }
    if (isset($_GET['usuarios'])) {
        $stmt = lc_db()->query("SELECT id, email, nome FROM labclock_usuarios ORDER BY nome");
        lc_json(['usuarios' => $stmt->fetchAll()]);
    }

    $filtros = [];
    if (isset($_GET['usuario_id']) && $_GET['usuario_id'] !== '') $filtros['usuario_id'] = (int) $_GET['usuario_id'];
    if (isset($_GET['acao'])       && $_GET['acao'] !== '')       $filtros['acao']       = (string) $_GET['acao'];
    if (isset($_GET['desde'])      && $_GET['desde'] !== '')      $filtros['desde']      = (string) $_GET['desde'];
    if (isset($_GET['ate'])        && $_GET['ate'] !== '')        $filtros['ate']        = (string) $_GET['ate'];

    $limit  = isset($_GET['limit'])  ? (int) $_GET['limit']  : 100;
    $offset = isset($_GET['offset']) ? (int) $_GET['offset'] : 0;

    $res = lc_audit_listar($filtros, $limit, $offset);
    lc_json($res);
} catch (Throwable $e) {
    error_log('[labclock-auditoria] ' . $e->getMessage());
    lc_json(['error' => 'erro interno'], 500);
}
