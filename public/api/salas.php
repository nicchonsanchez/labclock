<?php
// LabClock — endpoints de salas (admin gerencia, todos podem listar).

declare(strict_types=1);

require_once __DIR__ . '/_db.php';
require_once __DIR__ . '/_util.php';
require_once __DIR__ . '/_auth.php';
require_once __DIR__ . '/_audit.php';

header('X-Content-Type-Options: nosniff');

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int) $_GET['id'] : null;

try {
    $db = lc_db();

    // GET — listar (exige login pra escopo de tenant; pré-Fase 7 era público)
    if ($method === 'GET') {
        $me = lc_require_login();
        $stmt = $db->prepare("SELECT id, nome, ordem FROM labclock_salas WHERE tenant_id = :tid ORDER BY ordem ASC, nome ASC");
        $stmt->execute([':tid' => (int) $me['tenant_id']]);
        lc_json(['salas' => $stmt->fetchAll()]);
    }

    // Demais ações exigem admin
    $me = lc_require_login();
    if ($me['papel'] !== 'admin') lc_json(['error' => 'somente admin'], 403);

    if ($method === 'POST') {
        $b = lc_input();
        $nome  = trim((string) ($b['nome']  ?? ''));
        $ordem = (int) ($b['ordem'] ?? 0);
        if ($nome === '') lc_json(['error' => 'nome obrigatório'], 422);
        if (mb_strlen($nome) > 80) lc_json(['error' => 'nome muito longo'], 422);

        $stmt = $db->prepare("INSERT INTO labclock_salas (tenant_id, nome, ordem) VALUES (:tid, :n, :o)");
        $stmt->execute([':tid' => (int) $me['tenant_id'], ':n' => $nome, ':o' => $ordem]);
        $newId = (int) $db->lastInsertId();
        lc_audit('sala.criar', 'sala', $newId, ['nome' => $nome, 'ordem' => $ordem]);
        lc_json(['ok' => true, 'id' => $newId, 'nome' => $nome, 'ordem' => $ordem], 201);
    }

    if ($method === 'PATCH' && $id !== null) {
        // Confirma que a sala pertence ao tenant antes de mexer
        $chk = $db->prepare("SELECT id FROM labclock_salas WHERE id = :id AND tenant_id = :tid");
        $chk->execute([':id' => $id, ':tid' => (int) $me['tenant_id']]);
        if (!$chk->fetch()) lc_json(['error' => 'sala não encontrada'], 404);

        $b = lc_input();
        $sets = [];
        $params = [':id' => $id];
        if (isset($b['nome'])) {
            $nome = trim((string) $b['nome']);
            if ($nome === '') lc_json(['error' => 'nome vazio'], 422);
            $sets[] = "nome = :n";
            $params[':n'] = $nome;
        }
        if (isset($b['ordem'])) {
            $sets[] = "ordem = :o";
            $params[':o'] = (int) $b['ordem'];
        }
        if (empty($sets)) lc_json(['error' => 'nada pra editar'], 422);
        $sql = "UPDATE labclock_salas SET " . implode(', ', $sets) . " WHERE id = :id";
        $u = $db->prepare($sql);
        $u->execute($params);
        lc_audit('sala.editar', 'sala', $id, [
            'nome_novo' => $params[':n'] ?? null,
            'ordem_nova' => $params[':o'] ?? null,
        ]);
        lc_json(['ok' => true]);
    }

    if ($method === 'DELETE' && $id !== null) {
        // Cronômetros com sala_id desta sala vão pra sala_id=NULL (ON DELETE SET NULL)
        $stmt = $db->prepare("DELETE FROM labclock_salas WHERE id = :id AND tenant_id = :tid");
        $stmt->execute([':id' => $id, ':tid' => (int) $me['tenant_id']]);
        if ($stmt->rowCount() > 0) lc_audit('sala.deletar', 'sala', $id);
        lc_json(['ok' => true, 'affected' => $stmt->rowCount()]);
    }

    lc_json(['error' => 'rota inválida'], 404);
} catch (Throwable $e) {
    error_log('[labclock-salas] ' . $e->getMessage());
    lc_json(['error' => 'erro interno'], 500);
}
