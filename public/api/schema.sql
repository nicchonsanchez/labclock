-- LabClock — Fases 1 e 2
-- Banco: niccho25_app_nicchon (compartilhado com app_links do app.nicchon.com)
-- Prefixo labclock_ pra não conflitar com outras tabelas do banco.

-- ===== Fase 2: usuários =====
CREATE TABLE IF NOT EXISTS labclock_usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(120) NOT NULL UNIQUE,
  senha_hash    VARCHAR(255) NOT NULL,           -- pbkdf2$iter$salt_b64$hash_b64
  nome          VARCHAR(120) NOT NULL,
  papel         ENUM('tecnico','admin') NOT NULL DEFAULT 'tecnico',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== Fase 1: cronômetros (com dono adicionado na fase 2) =====
CREATE TABLE IF NOT EXISTS labclock_cronometros (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug                  VARCHAR(12) NOT NULL UNIQUE,
  dono_id               INT UNSIGNED NULL,       -- NULL pra cronômetros criados antes da fase 2 (legado)
  nome                  VARCHAR(120) NOT NULL,
  duracao_ms            INT NOT NULL,
  status                ENUM('PARADO','RODANDO','PAUSADO') NOT NULL DEFAULT 'PARADO',
  started_at_ms         BIGINT NULL,
  paused_remaining_ms   INT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_updated (updated_at),
  INDEX idx_status (status),
  INDEX idx_dono (dono_id),
  CONSTRAINT fk_cron_dono FOREIGN KEY (dono_id) REFERENCES labclock_usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migração idempotente: adiciona dono_id em tabelas pré-fase-2 que ainda não tenham a coluna.
-- (Roda manualmente se a CREATE TABLE acima for ignorada por já existir)
-- ALTER TABLE labclock_cronometros ADD COLUMN dono_id INT UNSIGNED NULL AFTER slug;
-- ALTER TABLE labclock_cronometros ADD INDEX idx_dono (dono_id);
-- ALTER TABLE labclock_cronometros ADD CONSTRAINT fk_cron_dono FOREIGN KEY (dono_id) REFERENCES labclock_usuarios(id) ON DELETE SET NULL;
