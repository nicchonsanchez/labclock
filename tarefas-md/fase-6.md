# LabClock — Fase 6 (Audit log + Notificações)

**Status:** Em curso (2026-05-18).

## Escopo

1. **Audit log** — registrar quem fez o quê, quando, em que entidade. Persistido em `labclock_audit_log`. Visível em `/admin/auditoria/` (só admin).
2. **Notificações no SO** — Service Worker + Notification API. Quando timer zera, dispara notificação nativa do sistema operacional, **mesmo que a aba esteja sem foco** (mas a aba precisa estar aberta — push servidor-iniciado fica pra fase posterior).

## Fora de escopo (pra fase posterior)

- Web Push real (servidor dispara notificação mesmo com aba fechada) — exige VAPID keys + lib `web-push` + cron pra checar timers. Complexidade alta, deixar pra Fase 7+.
- Logs com retention/rotação automática — só lista as últimas N entries; limpeza manual via admin se precisar.
- Dashboard de métricas (gráficos de uso) — fora do escopo, audit log é só listagem.

## Etapas

### 6.1 — Audit log

1. Criar tabela `labclock_audit_log`:
   ```sql
   id            BIGINT PK
   usuario_id    INT NULL (FK soft — pode ficar órfão se user for deletado)
   usuario_email VARCHAR(190) NULL (snapshot — sobrevive a delete do user)
   acao          VARCHAR(60)  (ex: 'cronometro.start', 'login.success')
   entidade_tipo VARCHAR(30)  NULL
   entidade_id   INT          NULL
   detalhes      JSON         NULL
   ip            VARCHAR(45)  NULL
   user_agent    VARCHAR(255) NULL
   created_at    DATETIME
   INDEX (created_at), INDEX (usuario_id), INDEX (acao)
   ```
2. Helper `lc_audit(string $acao, ?array $contexto = null)` em `_auth.php` (ou novo `_audit.php`).
   - Pega user atual via sessão (pode ser anônimo — `usuario_id = NULL`).
   - Pega IP + UA do request.
   - Insere row.
   - Falha silenciosa (não pode quebrar a request principal).
3. Integrar nos endpoints:
   - `auth.php`: `login.success`, `login.fail`, `logout`
   - `cronometros.php`: `cronometro.criar`, `cronometro.editar`, `cronometro.deletar`, `cronometro.start`, `cronometro.pause`, `cronometro.reset`
   - `grupos.php`: `grupo.criar`, `grupo.editar`, `grupo.deletar`, `grupo.add_cron`, `grupo.remove_cron`
   - `salas.php`: `sala.criar`, `sala.editar`, `sala.deletar`
   - `usuarios.php`: `usuario.criar`, `usuario.deletar`, `usuario.trocar_senha`
4. Endpoint `GET /api/auditoria.php` (admin-only):
   - Query: `?limit=100&offset=0&usuario_id=N&acao=X&desde=YYYY-MM-DD&ate=YYYY-MM-DD`
   - Retorna array de entries + total count
5. Página `/admin/auditoria/`:
   - Lista paginada (tabela)
   - Filtros: usuário (select), ação (select), período (date range)
   - Coluna "detalhes" expandida via clique
   - Sem edição/delete — log é append-only

### 6.2 — Notificações no SO

1. `assets/sw.js` — Service Worker mínimo:
   - `install`: skipWaiting
   - `activate`: claim clients
   - `message`: recebe `{ tipo: 'notify', titulo, body, slug }` do cliente, dispara `self.registration.showNotification(...)`
   - `notificationclick`: abre `/c/{slug}/` ou foca aba existente
2. Registrar SW em todas as páginas que têm cronômetro rodando (`cronometro.js`, `grupo.js`, `tv.js`):
   - Verifica `'serviceWorker' in navigator`
   - Pede permissão `Notification.requestPermission()` no primeiro start ou no carregamento
   - Quando timer cruza zero, posta mensagem pro SW (mesmo se aba sem foco, notificação aparece)
3. Adicionar `manifest.json` mínimo (PWA-lite — só pra Service Worker funcionar bem):
   ```json
   { "name": "LabClock", "short_name": "LabClock", "start_url": ".",
     "display": "standalone", "background_color": "#F5F0E6",
     "theme_color": "#5C1F1F", "icons": [...] }
   ```
   (Reusa o favicon do Nicchon como icon.)

## Critérios de aceite

### Audit log
- [ ] Schema criado em produção (via setup script idempotente)
- [ ] Login success/fail registra com IP
- [ ] Cada acao de cronometro registra (start/pause/reset/criar/editar/deletar)
- [ ] Cada acao de grupo registra
- [ ] Cada acao admin (criar/deletar user, criar sala) registra
- [ ] `/admin/auditoria/` lista entries paginadas
- [ ] Filtros funcionam (usuário, ação, período)
- [ ] Não admin é redirecionado/bloqueado de `/admin/auditoria/`

### Notificações
- [ ] Service Worker registra sem erro de CSP
- [ ] Permissão é pedida ao usuário no primeiro start
- [ ] Aba minimizada/sem foco: notificação do SO aparece quando timer zera
- [ ] Clique na notificação foca/abre a aba do cronômetro
- [ ] Funciona em Chrome desktop + mobile
- [ ] Não tenta registrar SW em browsers que não suportam (graceful fallback)

## Riscos / decisões

- **CSP + Service Worker**: SW precisa de `worker-src 'self'`. Verificar header. CSP atual tem `default-src 'self'` que já cobre, mas Chrome às vezes pede explícito.
- **Audit log crescimento**: sem retention automática, tabela cresce. Aceitável pra uso interno; cleanup manual quando passar de 10k rows.
- **JSON column** no MySQL 5.7+ — Hostgator suporta (já confirmado em outros projetos).
- **`detalhes` snapshot vs FK**: gravo `usuario_email` snapshot pra que log sobreviva a delete do user. Mesma lógica vale pra entidade — gravo nome/slug em `detalhes` JSON.
- **Permissão Notification**: pedir cedo demais irrita user; pedir só quando ele aperta "start" pela primeira vez é melhor. Vou adotar isso.
- **Sem cron de push real**: se a aba estiver fechada, não há notificação. É limitação aceita — a maioria dos usos do LabClock é com TV/desktop ligado.
