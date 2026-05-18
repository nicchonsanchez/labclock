<?php
// LabClock — endpoints de autenticação.
//
//   POST /api/auth.php?acao=login    { email, senha }  → user + cookie de sessão
//   POST /api/auth.php?acao=logout                     → encerra sessão
//   GET  /api/auth.php?acao=me                         → user logado (ou 401)

declare(strict_types=1);

require_once __DIR__ . '/_db.php';
require_once __DIR__ . '/_util.php';
require_once __DIR__ . '/_auth.php';

header('X-Content-Type-Options: nosniff');

$method = $_SERVER['REQUEST_METHOD'];
$acao   = $_GET['acao'] ?? null;

try {
    if ($method === 'POST' && $acao === 'login') {
        $b = lc_input();
        $email = trim((string) ($b['email'] ?? ''));
        $senha = (string) ($b['senha'] ?? '');
        if ($email === '' || $senha === '') {
            lc_json(['error' => 'email e senha obrigatórios'], 422);
        }
        $u = lc_login($email, $senha);
        if (!$u) lc_json(['error' => 'credenciais inválidas'], 401);
        lc_json(['ok' => true, 'user' => $u]);
    }

    if ($method === 'POST' && $acao === 'logout') {
        lc_logout();
        lc_json(['ok' => true]);
    }

    if ($method === 'GET' && $acao === 'me') {
        $u = lc_user();
        if (!$u) lc_json(['error' => 'não autenticado'], 401);
        lc_json(['user' => $u]);
    }

    lc_json(['error' => 'rota inválida'], 404);
} catch (Throwable $e) {
    error_log('[labclock-auth] ' . $e->getMessage());
    lc_json(['error' => 'erro interno'], 500);
}
