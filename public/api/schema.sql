-- LabClock — Fase 1
-- Banco: niccho25_app_nicchon (compartilhado com app_links do app.nicchon.com)
-- Prefixo labclock_ pra não conflitar com outras tabelas do banco.

CREATE TABLE IF NOT EXISTS labclock_cronometros (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug                  VARCHAR(12) NOT NULL UNIQUE,
  nome                  VARCHAR(120) NOT NULL,
  duracao_ms            INT NOT NULL,
  status                ENUM('PARADO','RODANDO','PAUSADO') NOT NULL DEFAULT 'PARADO',
  started_at_ms         BIGINT NULL,            -- timestamp ms de quando iniciou (NULL se PARADO/PAUSADO)
  paused_remaining_ms   INT NULL,                -- restante quando pausou (NULL se RODANDO/PARADO)
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_updated (updated_at),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
