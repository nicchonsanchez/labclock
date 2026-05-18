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

-- ===== Fase 4: salas + grupos =====
CREATE TABLE IF NOT EXISTS labclock_salas (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(80) NOT NULL,
  ordem         INT NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ordem (ordem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS labclock_grupos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug          VARCHAR(12) NOT NULL UNIQUE,
  dono_id       INT UNSIGNED NOT NULL,
  nome          VARCHAR(120) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dono (dono_id),
  CONSTRAINT fk_grupo_dono FOREIGN KEY (dono_id) REFERENCES labclock_usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS labclock_grupo_cronometros (
  grupo_id        INT UNSIGNED NOT NULL,
  cronometro_id   INT UNSIGNED NOT NULL,
  ordem           INT NOT NULL DEFAULT 0,
  added_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (grupo_id, cronometro_id),
  INDEX idx_cron (cronometro_id),
  CONSTRAINT fk_gc_grupo FOREIGN KEY (grupo_id)      REFERENCES labclock_grupos(id)      ON DELETE CASCADE,
  CONSTRAINT fk_gc_cron  FOREIGN KEY (cronometro_id) REFERENCES labclock_cronometros(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ALTER pra adicionar sala_id em cronometros (fase 4):
-- ALTER TABLE labclock_cronometros ADD COLUMN sala_id INT UNSIGNED NULL AFTER dono_id;
-- ALTER TABLE labclock_cronometros ADD INDEX idx_sala (sala_id);
-- ALTER TABLE labclock_cronometros ADD CONSTRAINT fk_cron_sala FOREIGN KEY (sala_id) REFERENCES labclock_salas(id) ON DELETE SET NULL;

-- ===== Fase 7: multi-tenant =====
CREATE TABLE IF NOT EXISTS labclock_tenants (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug          VARCHAR(20) NOT NULL UNIQUE,
  nome          VARCHAR(120) NOT NULL,
  plano         VARCHAR(20) NOT NULL DEFAULT 'free',
  status        ENUM('ativo','suspenso') NOT NULL DEFAULT 'ativo',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Adicionado pela migração:
-- ALTER TABLE labclock_usuarios     ADD COLUMN tenant_id INT UNSIGNED NOT NULL, ADD INDEX (tenant_id), ADD FK CASCADE
-- ALTER TABLE labclock_cronometros  ADD COLUMN tenant_id INT UNSIGNED NOT NULL, ADD INDEX (tenant_id), ADD FK CASCADE
-- ALTER TABLE labclock_grupos       ADD COLUMN tenant_id INT UNSIGNED NOT NULL, ADD INDEX (tenant_id), ADD FK CASCADE
-- ALTER TABLE labclock_salas        ADD COLUMN tenant_id INT UNSIGNED NOT NULL, ADD INDEX (tenant_id), ADD FK CASCADE
-- ALTER TABLE labclock_audit_log    ADD COLUMN tenant_id INT UNSIGNED NULL,     ADD INDEX (tenant_id), ADD FK SET NULL

-- ===== Fase 6: audit log =====
CREATE TABLE IF NOT EXISTS labclock_audit_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED NULL,                 -- soft FK; pode ficar orfão se user for deletado
  usuario_email VARCHAR(120) NULL,                 -- snapshot pra sobreviver a delete
  acao          VARCHAR(60) NOT NULL,              -- ex: 'cronometro.start', 'login.success'
  entidade_tipo VARCHAR(30) NULL,                  -- ex: 'cronometro', 'grupo', 'usuario'
  entidade_id   INT UNSIGNED NULL,
  detalhes      JSON NULL,                         -- snapshot de campos relevantes (nome, slug, etc.)
  ip            VARCHAR(45) NULL,                  -- IPv4/IPv6
  user_agent    VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at),
  INDEX idx_usuario (usuario_id),
  INDEX idx_acao (acao),
  INDEX idx_entidade (entidade_tipo, entidade_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
