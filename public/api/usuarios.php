<?php
// LabClock — endpoints de usuários (admin) e perfil.
//
//   GET    /api/usuarios.php                       lista todos (admin)
//   POST   /api/usuarios.php                       cria técnico (admin) { email, senha, nome, papel? }
//   DELETE /api/usuarios.php?id=N                  remove usuário (admin; não pode remover a si mesmo)
//   PATCH  /api/usuarios.php?acao=trocar-senha     user troca a própria senha { senha_atual, senha_nova }

declare(strict_types=1);

require_once __DIR__ . '/_db.php';
require_once __DIR__ . '/_util.php';
require_once __DIR__ . '/_auth.php';

header('X-Content-Type-Options: nosniff');

$method = $_SERVER['REQUEST_METHOD'];
$acao   = $_GET['acao'] ?? null;
$id     = isset($_GET['id']) ? (int) $_GET['id'] : null;
$me     = lc_require_login();

function exigir_admin(array $user): void {
    if (($user['papel'] ?? '') !== 'admin') {
        lc_json(['error' => 'somente admin'], 403);
    }
}

try {
    $db = lc_db();

    // ---------- TROCAR SENHA (qualquer user logado) ----------
    if ($method === 'PATCH' && $acao === 'trocar-senha') {
        $b = lc_input();
        $atual = (string) ($b['senha_atual'] ?? '');
        $nova  = (string) ($b['senha_nova']  ?? '');

        if ($atual === '' || $nova === '') {
            lc_json(['error' => 'senha_atual e senha_nova obrigatórios'], 422);
        }
        if (mb_strlen($nova) < 8) {
            lc_json(['error' => 'senha nova mínima 8 chars'], 422);
        }
        if ($atual === $nova) {
            lc_json(['error' => 'senha nova deve ser diferente da atual'], 422);
        }

        // Verifica senha atual
        $stmt = $db->prepare("SELECT senha_hash FROM labclock_usuarios WHERE id = :id");
        $stmt->execute([':id' => $me['id']]);
        $row = $stmt->fetch();
        if (!$row || !lc_verifica_senha($atual, $row['senha_hash'])) {
            lc_json(['error' => 'senha atual incorreta'], 401);
        }

        $u = $db->prepare("UPDATE labclock_usuarios SET senha_hash = :h WHERE id = :id");
        $u->execute([':h' => lc_hash_senha($nova), ':id' => $me['id']]);
        lc_json(['ok' => true]);
    }

    // ---------- LISTAR (admin) ----------
    if ($method === 'GET' && $acao === null && $id === null) {
        exigir_admin($me);
        $stmt = $db->query("SELECT id, email, nome, papel, created_at, last_login_at FROM labclock_usuarios ORDER BY created_at DESC");
        lc_json(['usuarios' => $stmt->fetchAll()]);
    }

    // ---------- CRIAR (admin) ----------
    if ($method === 'POST' && $acao === null) {
        exigir_admin($me);
        $b = lc_input();
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        $senha = (string) ($b['senha'] ?? '');
        $nome  = trim((string) ($b['nome']  ?? ''));
        $papel = (string) ($b['papel'] ?? 'tecnico');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) lc_json(['error' => 'email inválido'], 422);
        if (mb_strlen($senha) < 8) lc_json(['error' => 'senha mínima 8 chars'], 422);
        if ($nome === '') lc_json(['error' => 'nome obrigatório'], 422);
        if (!in_array($papel, ['tecnico', 'admin'], true)) $papel = 'tecnico';

        try {
            $stmt = $db->prepare("INSERT INTO labclock_usuarios (email, senha_hash, nome, papel) VALUES (:e, :h, :n, :p)");
            $stmt->execute([
                ':e' => $email,
                ':h' => lc_hash_senha($senha),
                ':n' => $nome,
                ':p' => $papel,
            ]);
            $newId = (int) $db->lastInsertId();
            lc_json(['ok' => true, 'id' => $newId, 'email' => $email, 'nome' => $nome, 'papel' => $papel], 201);
        } catch (PDOException $e) {
            if (str_contains($e->getMessage(), 'Duplicate')) {
                lc_json(['error' => 'email já cadastrado'], 409);
            }
            throw $e;
        }
    }

    // ---------- DELETAR (admin; não pode remover a si próprio) ----------
    if ($method === 'DELETE' && $id !== null) {
        exigir_admin($me);
        if ($id === (int) $me['id']) lc_json(['error' => 'não pode remover a si mesmo'], 422);
        $stmt = $db->prepare("DELETE FROM labclock_usuarios WHERE id = :id");
        $stmt->execute([':id' => $id]);
        lc_json(['ok' => true, 'affected' => $stmt->rowCount()]);
    }

    lc_json(['error' => 'rota inválida'], 404);
} catch (Throwable $e) {
    error_log('[labclock-usuarios] ' . $e->getMessage());
    lc_json(['error' => 'erro interno'], 500);
}
