<?php
// LabClock — self-service signup (Fase 7).
//
//   POST /api/signup.php  { tenant_nome, tenant_slug?, admin_nome, admin_email, admin_senha }
//
// Cria tenant + user admin numa transação. Faz login automático.

declare(strict_types=1);

require_once __DIR__ . '/_db.php';
require_once __DIR__ . '/_util.php';
require_once __DIR__ . '/_auth.php';
require_once __DIR__ . '/_audit.php';

header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    lc_json(['error' => 'método não suportado'], 405);
}

try {
    $b = lc_input();

    $tenantNome  = trim((string) ($b['tenant_nome']  ?? ''));
    $tenantSlug  = strtolower(trim((string) ($b['tenant_slug']  ?? '')));
    $adminNome   = trim((string) ($b['admin_nome']   ?? ''));
    $adminEmail  = strtolower(trim((string) ($b['admin_email']  ?? '')));
    $adminSenha  = (string) ($b['admin_senha']  ?? '');

    if ($tenantNome === '' || mb_strlen($tenantNome) > 120) {
        lc_json(['error' => 'nome do lab obrigatório (até 120 chars)'], 422);
    }
    // Slug: autogera a partir do nome se vier vazio
    if ($tenantSlug === '') {
        $tenantSlug = lc_slugify($tenantNome);
    }
    if (!preg_match('/^[a-z0-9]{4,20}$/', $tenantSlug)) {
        lc_json(['error' => 'slug inválido (4-20 letras/números minúsculos)'], 422);
    }
    if ($adminNome === '') lc_json(['error' => 'nome do admin obrigatório'], 422);
    if (mb_strlen($adminNome) > 120) lc_json(['error' => 'nome do admin muito longo'], 422);
    if (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) lc_json(['error' => 'email inválido'], 422);
    if (mb_strlen($adminSenha) < 8) lc_json(['error' => 'senha mínima 8 chars'], 422);

    $db = lc_db();

    // Rate limit simples: 3 signups por IP por hora
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    if ($ip) {
        $stmt = $db->prepare("SELECT COUNT(*) FROM labclock_audit_log
            WHERE acao = 'signup' AND ip = :ip AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)");
        $stmt->execute([':ip' => $ip]);
        if ((int) $stmt->fetchColumn() >= 3) {
            lc_json(['error' => 'muitos signups recentes deste IP, aguarde 1h'], 429);
        }
    }

    // Pre-check: slug e email não podem estar duplicados (UX: erro antes da transação)
    $stmt = $db->prepare("SELECT id FROM labclock_tenants WHERE slug = :s");
    $stmt->execute([':s' => $tenantSlug]);
    if ($stmt->fetchColumn()) lc_json(['error' => 'slug já em uso, escolha outro'], 409);

    $stmt = $db->prepare("SELECT id FROM labclock_usuarios WHERE email = :e");
    $stmt->execute([':e' => $adminEmail]);
    if ($stmt->fetchColumn()) lc_json(['error' => 'email já cadastrado'], 409);

    // Transação: tenant + user admin
    $db->beginTransaction();
    try {
        $stmt = $db->prepare("INSERT INTO labclock_tenants (slug, nome) VALUES (:s, :n)");
        $stmt->execute([':s' => $tenantSlug, ':n' => $tenantNome]);
        $tenantId = (int) $db->lastInsertId();

        $stmt = $db->prepare("INSERT INTO labclock_usuarios (tenant_id, email, senha_hash, nome, papel)
                              VALUES (:tid, :e, :h, :n, 'admin')");
        $stmt->execute([
            ':tid' => $tenantId,
            ':e'   => $adminEmail,
            ':h'   => lc_hash_senha($adminSenha),
            ':n'   => $adminNome,
        ]);
        $userId = (int) $db->lastInsertId();
        $db->commit();
    } catch (\Throwable $e) {
        $db->rollBack();
        // Race condition: outra request criou o slug/email entre o pre-check e o INSERT
        if (str_contains($e->getMessage(), 'Duplicate')) {
            lc_json(['error' => 'slug ou email já em uso (race)'], 409);
        }
        throw $e;
    }

    // Login automático
    lc_session_start();
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;

    // Audit (agora com tenant_id setado via sessão)
    lc_audit('signup', 'tenant', $tenantId, [
        'tenant_slug' => $tenantSlug,
        'tenant_nome' => $tenantNome,
        'admin_email' => $adminEmail,
        'admin_nome'  => $adminNome,
    ]);

    lc_json([
        'ok' => true,
        'tenant' => ['id' => $tenantId, 'slug' => $tenantSlug, 'nome' => $tenantNome],
        'user'   => ['id' => $userId, 'email' => $adminEmail, 'nome' => $adminNome, 'papel' => 'admin'],
    ], 201);

} catch (Throwable $e) {
    error_log('[labclock-signup] ' . $e->getMessage());
    lc_json(['error' => 'erro interno'], 500);
}
