<?php
// LabClock — auth via PHP session.
//
// PBKDF2 SHA-256 com 600k iterações (mesmo padrão do painel nicchon.com).
// Sessão dura 7 dias (cookie HttpOnly + SameSite=Lax).
// Multi-tenant fica pra fase 7 — por enquanto há 1 lab implícito.

declare(strict_types=1);

require_once __DIR__ . '/_db.php';

const LC_PBKDF2_ITER   = 600_000;
const LC_PBKDF2_HASH   = 'sha256';
const LC_SESSION_NAME  = 'labclock_session';
const LC_SESSION_TTL_S = 7 * 24 * 3600; // 7 dias

// Inicia sessão (idempotente). Configura cookie seguro.
function lc_session_start(): void {
    if (session_status() !== PHP_SESSION_NONE) return;
    session_name(LC_SESSION_NAME);
    session_set_cookie_params([
        'lifetime' => LC_SESSION_TTL_S,
        'path'     => '/labclock/',
        'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

// Devolve user logado (array) ou null.
function lc_user(): ?array {
    lc_session_start();
    $id = $_SESSION['user_id'] ?? null;
    if (!$id) return null;
    static $cache = null;
    if ($cache !== null && $cache['id'] === $id) return $cache;
    $stmt = lc_db()->prepare("SELECT id, email, nome, papel, created_at FROM labclock_usuarios WHERE id = :id");
    $stmt->execute([':id' => $id]);
    $u = $stmt->fetch();
    return $cache = ($u ?: null);
}

// Exige login no endpoint. Devolve user. 401 se ausente.
function lc_require_login(): array {
    $u = lc_user();
    if (!$u) {
        require_once __DIR__ . '/_util.php';
        lc_json(['error' => 'autenticação necessária'], 401);
    }
    return $u;
}

// Hash de senha. Formato: pbkdf2$<iter>$<base64(salt)>$<base64(hash)>
function lc_hash_senha(string $senha): string {
    $salt = random_bytes(16);
    $hash = hash_pbkdf2(LC_PBKDF2_HASH, $senha, $salt, LC_PBKDF2_ITER, 0, true);
    return sprintf('pbkdf2$%d$%s$%s', LC_PBKDF2_ITER, base64_encode($salt), base64_encode($hash));
}

// Verifica senha. Usa hash_equals pra timing-safe.
function lc_verifica_senha(string $senha, string $armazenado): bool {
    $partes = explode('$', $armazenado);
    if (count($partes) !== 4 || $partes[0] !== 'pbkdf2') return false;
    $iter = (int) $partes[1];
    $salt = base64_decode($partes[2], true);
    $hash = base64_decode($partes[3], true);
    if ($salt === false || $hash === false || $iter < 1) return false;
    $calc = hash_pbkdf2(LC_PBKDF2_HASH, $senha, $salt, $iter, 0, true);
    return hash_equals($hash, $calc);
}

// Tenta logar. Retorna user ou null.
function lc_login(string $email, string $senha): ?array {
    $stmt = lc_db()->prepare("SELECT id, email, nome, papel, senha_hash FROM labclock_usuarios WHERE email = :e");
    $stmt->execute([':e' => strtolower(trim($email))]);
    $u = $stmt->fetch();
    if (!$u || !lc_verifica_senha($senha, $u['senha_hash'])) return null;
    lc_session_start();
    session_regenerate_id(true); // anti session fixation
    $_SESSION['user_id'] = (int) $u['id'];
    unset($u['senha_hash']);
    return $u;
}

function lc_logout(): void {
    lc_session_start();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'] ?? '', $p['secure'], $p['httponly']);
    }
    session_destroy();
}
