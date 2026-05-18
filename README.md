# LabClock

Central de cronômetros multi-dispositivo. Cria, compartilha por URL, monitora em sincronia entre TVs e celulares.

**Caso de uso original:** laboratório químico com ensaios paralelos em salas diferentes (aquecimentos, repousos). Aplica-se também a cozinha profissional, salões, brewery — qualquer contexto multi-timing.

**Status atual:** Fase 1 (MVP backend). Sem auth, sem grupos, sem TV mode. Veja [tarefas-md/](tarefas-md/) pra roadmap.

---

## Stack

- **Backend:** PHP 8 + PDO + MySQL (Hostgator shared)
- **Frontend:** HTML + CSS + jQuery 3 (self-hosted) + Vanilla JS
- **Real-time:** polling 3s + cálculo determinístico client-side (sem WebSocket — shared hosting)
- **Banco:** `niccho25_app_nicchon` (isolado do banco do painel nicchon.com)
- **Deploy:** GitHub Actions → FTP pra `/app.nicchon.com/labclock/`

---

## Estrutura

```
labclock/
├── public/                     ← deployado pra /app.nicchon.com/labclock/
│   ├── index.html              home: lista + criar
│   ├── cronometro.html         página individual (acessada via /c/{slug}/)
│   ├── .htaccess               CSP, rewrite /c/{slug}, security headers
│   ├── api/
│   │   ├── cronometros.php     CRUD (GET, POST, PATCH, DELETE)
│   │   ├── _config.php.template   secrets injetadas no deploy
│   │   ├── _db.php             conexão PDO (lc_db)
│   │   ├── _util.php           helpers (slug, json, formatação)
│   │   └── schema.sql          DDL
│   └── assets/
│       ├── style.css           tokens v2026 (light + dark)
│       ├── main.js             home
│       ├── cronometro.js       página individual
│       └── jquery-3.6.1.min.js self-hosted
├── .github/workflows/
│   └── deploy.yml              build (inject secrets) + FTP
├── tarefas-md/
│   └── fase-1.md               escopo desta fase
└── README.md
```

---

## API REST (fase 1, sem auth)

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/cronometros.php` | Lista 100 mais recentes |
| `POST` | `/api/cronometros.php` | Cria `{ nome, duracao_ms }` |
| `GET` | `/api/cronometros.php?slug=X` | Detalhe |
| `PATCH` | `/api/cronometros.php?slug=X&acao=start` | Inicia (retoma se pausado) |
| `PATCH` | `/api/cronometros.php?slug=X&acao=pause` | Pausa |
| `PATCH` | `/api/cronometros.php?slug=X&acao=reset` | Reseta pro tempo original |
| `DELETE` | `/api/cronometros.php?slug=X` | Remove |

Todas as respostas incluem `server_time_ms` pro cliente calcular offset de relógio.

### Estado autoritativo no servidor

```
status              ENUM('PARADO', 'RODANDO', 'PAUSADO')
started_at_ms       BIGINT NULL  ← quando RODANDO, timestamp absoluto
paused_remaining_ms INT NULL     ← quando PAUSADO, restante em ms
```

Cliente calcula tempo restante:
```js
if (status === 'RODANDO') {
    remaining_ms = duracao_ms - (server_time_ms - started_at_ms);
} else if (status === 'PAUSADO') {
    remaining_ms = paused_remaining_ms;
} else {
    remaining_ms = duracao_ms;
}
```

---

## Como rodar localmente

Não tem ambiente local atualmente. Pra desenvolver:
1. Cria `public/api/_config.php` (copia o `.template` e preenche)
2. Aponta o XAMPP pra esta pasta
3. Acessa `http://localhost/labclock/public/`

Ou push pra `main` → deploy automático em ~1min.

---

## Secrets necessárias no GitHub Actions

| Secret | Descrição |
|---|---|
| `FTP_HOST` | `ftp.nicchon.com` |
| `FTP_USERNAME` | usuário do cPanel |
| `FTP_PASSWORD` | senha FTP |
| `DB_HOST` | `localhost` |
| `DB_NAME` | `niccho25_app_nicchon` |
| `DB_USER` | usuário MySQL |
| `DB_PASS` | senha MySQL |

---

## Roadmap

- ✅ Fase 1 — MVP (backend + frontend mínimo + multi-device sync)
- ⏳ Fase 2 — Auth + ownership (login, cada user vê seus)
- ⏳ Fase 3 — Salas + Grupos (M:N)
- ⏳ Fase 4 — Sessões + TV mode (full-screen, QR code)
- ⏳ Fase 5 — Audit log + Web Push (notificação background)
- ⏳ Fase 6 — Multi-tenant + landing (preparar SaaS)

Veja roadmap completo no monorepo `nicchonsanchez/projetos` em [tarefas-md/labclock-projeto.md](https://github.com/nicchonsanchez/projetos/blob/main/tarefas-md/labclock-projeto.md).

---

## Decisões técnicas notáveis

- **Polling 3s + cálculo determinístico:** sem WebSocket (não funciona em shared hosting), cliente puxa estado a cada 3s e calcula o display local entre polls (10fps). Latência de 3s pra ações manuais é aceitável pro contexto de laboratório.
- **Banco isolado** (`niccho25_app_nicchon`): SQL injection num endpoint do LabClock não atinge dados do painel nicchon.com.
- **jQuery self-hosted:** CSP `script-src 'self'` proíbe CDN externo. Reduz superfície de ataque e melhora reproducibilidade.
- **CSP estrita** desde o dia 1: `script-src 'self'` + sem inline onclick. Padrão dos outros projetos do ecossistema.
