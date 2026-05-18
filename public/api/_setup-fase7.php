<?php
// LabClock — setup Fase 7: multi-tenant.
//
// 1. Cria tabela labclock_tenants
// 2. Insere tenant default 'kharis' (id=1)
// 3. Adiciona tenant_id em todas as tabelas (idempotente — checa colunas antes)
// 4. Atribui tenant_id=1 aos dados existentes
// 5. Aplica NOT NULL + FK
//
// Idempotente. Roda 1x via browser. Deletar depois.

declare(strict_types=1);
require_once __DIR__ . '/_db.php';

header('Content-Type: text/plain; charset=utf-8');

$db = lc_db();
$log = [];

function tem_coluna(PDO $db, string $tabela, string $coluna): bool {
    $stmt = $db->prepare("SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c");
    $stmt->execute([':t' => $tabela, ':c' => $coluna]);
    return (bool) $stmt->fetchColumn();
}

function tem_fk(PDO $db, string $tabela, string $constraint): bool {
    $stmt = $db->prepare("SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND CONSTRAINT_NAME = :c AND CONSTRAINT_TYPE = 'FOREIGN KEY'");
    $stmt->execute([':t' => $tabela, ':c' => $constraint]);
    return (bool) $stmt->fetchColumn();
}

try {
    // ---------- 1. labclock_tenants ----------
    $db->exec("CREATE TABLE IF NOT EXISTS labclock_tenants (
        id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        slug       VARCHAR(20) NOT NULL UNIQUE,
        nome       VARCHAR(120) NOT NULL,
        plano      VARCHAR(20) NOT NULL DEFAULT 'free',
        status     ENUM('ativo','suspenso') NOT NULL DEFAULT 'ativo',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $log[] = "[ok] tabela labclock_tenants criada/existe";

    // ---------- 2. tenant default 'kharis' ----------
    $stmt = $db->prepare("SELECT id FROM labclock_tenants WHERE slug = 'kharis'");
    $stmt->execute();
    $kharisId = (int) $stmt->fetchColumn();
    if (!$kharisId) {
        $db->exec("INSERT INTO labclock_tenants (slug, nome) VALUES ('kharis', 'Kharis')");
        $kharisId = (int) $db->lastInsertId();
        $log[] = "[ok] tenant 'kharis' criado (id=$kharisId)";
    } else {
        $log[] = "[skip] tenant 'kharis' já existia (id=$kharisId)";
    }

    // ---------- 3-5. ALTER em cada tabela ----------
    // Tabelas onde tenant_id é obrigatório (NOT NULL + FK CASCADE)
    $tabelasNotNull = ['labclock_usuarios', 'labclock_cronometros', 'labclock_grupos', 'labclock_salas'];
    foreach ($tabelasNotNull as $t) {
        if (!tem_coluna($db, $t, 'tenant_id')) {
            $db->exec("ALTER TABLE `$t` ADD COLUMN tenant_id INT UNSIGNED NULL");
            $log[] = "[ok] $t.tenant_id adicionada (NULL temporário)";
        } else {
            $log[] = "[skip] $t.tenant_id já existe";
        }

        // Backfill: atribui kharis a rows sem tenant
        $upd = $db->prepare("UPDATE `$t` SET tenant_id = :tid WHERE tenant_id IS NULL");
        $upd->execute([':tid' => $kharisId]);
        if ($upd->rowCount() > 0) $log[] = "[ok] $t: " . $upd->rowCount() . " rows backfilled com tenant_id=$kharisId";

        // Promove pra NOT NULL
        $db->exec("ALTER TABLE `$t` MODIFY tenant_id INT UNSIGNED NOT NULL");

        // FK
        $fkName = "fk_{$t}_tenant";
        if (!tem_fk($db, $t, $fkName)) {
            $db->exec("ALTER TABLE `$t` ADD CONSTRAINT `$fkName`
                FOREIGN KEY (tenant_id) REFERENCES labclock_tenants(id) ON DELETE CASCADE");
            $log[] = "[ok] $t.$fkName criada";
        }

        // Index — checa se existe pelo nome padrão
        $idxName = "idx_{$t}_tenant";
        $stmt = $db->prepare("SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND INDEX_NAME = :i");
        $stmt->execute([':t' => $t, ':i' => $idxName]);
        if (!$stmt->fetchColumn()) {
            try {
                $db->exec("CREATE INDEX `$idxName` ON `$t` (tenant_id)");
                $log[] = "[ok] $t.$idxName index criado";
            } catch (\Throwable $e) {
                $log[] = "[warn] $t index falhou (provável duplicado): " . $e->getMessage();
            }
        }
    }

    // ---------- audit_log: tenant_id NULL aceito (ações pre-login) ----------
    if (!tem_coluna($db, 'labclock_audit_log', 'tenant_id')) {
        $db->exec("ALTER TABLE labclock_audit_log ADD COLUMN tenant_id INT UNSIGNED NULL");
        $log[] = "[ok] labclock_audit_log.tenant_id adicionada (NULL aceito)";
    } else {
        $log[] = "[skip] labclock_audit_log.tenant_id já existe";
    }
    // FK SET NULL no audit (não cascade — log sobrevive a delete de tenant)
    if (!tem_fk($db, 'labclock_audit_log', 'fk_labclock_audit_log_tenant')) {
        try {
            $db->exec("ALTER TABLE labclock_audit_log ADD CONSTRAINT fk_labclock_audit_log_tenant
                FOREIGN KEY (tenant_id) REFERENCES labclock_tenants(id) ON DELETE SET NULL");
            $log[] = "[ok] fk_labclock_audit_log_tenant criada";
        } catch (\Throwable $e) {
            $log[] = "[warn] fk audit falhou: " . $e->getMessage();
        }
    }

    echo implode("\n", $log) . "\n\n--- RESUMO ---\n";
    foreach ($tabelasNotNull as $t) {
        $stmt = $db->query("SELECT COUNT(*) FROM `$t`");
        echo "$t: " . $stmt->fetchColumn() . " rows\n";
    }
    $stmt = $db->query("SELECT id, slug, nome FROM labclock_tenants");
    echo "\nTenants:\n";
    foreach ($stmt->fetchAll() as $r) echo "  #{$r['id']} {$r['slug']} ({$r['nome']})\n";
    echo "\nOK — Fase 7 migration completa. Pode deletar este arquivo agora.\n";

} catch (\Throwable $e) {
    http_response_code(500);
    echo implode("\n", $log) . "\n\nERRO: " . $e->getMessage() . "\n";
}
