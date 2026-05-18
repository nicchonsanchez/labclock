<?php
// LabClock — setup Fase 6: cria tabela audit_log.
// Idempotente. Roda 1x via browser ou CLI e deleta depois.

declare(strict_types=1);
require_once __DIR__ . '/_db.php';

header('Content-Type: text/plain; charset=utf-8');

$ddl = <<<SQL
CREATE TABLE IF NOT EXISTS labclock_audit_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED NULL,
  usuario_email VARCHAR(120) NULL,
  acao          VARCHAR(60) NOT NULL,
  entidade_tipo VARCHAR(30) NULL,
  entidade_id   INT UNSIGNED NULL,
  detalhes      JSON NULL,
  ip            VARCHAR(45) NULL,
  user_agent    VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at),
  INDEX idx_usuario (usuario_id),
  INDEX idx_acao (acao),
  INDEX idx_entidade (entidade_tipo, entidade_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;

try {
    lc_db()->exec($ddl);
    echo "OK — labclock_audit_log criada (ou já existia)\n";
    $stmt = lc_db()->query("SELECT COUNT(*) FROM labclock_audit_log");
    echo "Total de entries: " . $stmt->fetchColumn() . "\n";
} catch (\Throwable $e) {
    http_response_code(500);
    echo "ERRO: " . $e->getMessage() . "\n";
}
