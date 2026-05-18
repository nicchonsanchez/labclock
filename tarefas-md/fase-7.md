# LabClock — Fase 7 (Multi-tenant + landing)

**Status:** Em curso (2026-05-18).

## Escopo

Transformar o LabClock de "1 lab implícito" em "N labs isolados" + abrir signup público.

1. **Schema multi-tenant**: tabela `labclock_tenants` + coluna `tenant_id` em todas as tabelas de dado (usuarios, cronometros, salas, grupos, audit_log).
2. **Migração**: criar tenant default `kharis` e atribuir todos os dados existentes a ele.
3. **Isolamento**: todos os endpoints filtram/inserem com `tenant_id` baseado na sessão (`user.tenant_id`).
4. **Self-service signup**: nova página `/criar-conta.html` permite criar um tenant novo + user admin inicial sem intervenção manual.
5. **Landing pública**: index reescrito como landing explicando o produto, com CTA pra "Criar conta" e "Entrar". Home logada vira `/app.html` (dashboard).

## Fora de escopo (fica pra Fase 8+)

- **Billing / planos**: por enquanto todos os tenants são gratuitos sem limite. Modelo de cobrança fica pra depois — multi-tenant é pré-requisito, não objetivo final.
- **Subdomínio por tenant** (`meulab.app.nicchon.com/labclock/`): roteamento path-based + slug global é suficiente. Subdomínio fica pra v2 quando justificar branding.
- **Convites por email**: admin de um tenant cria técnicos manualmente (Fase 3). Convite por link/email fica pra depois.
- **Tenant slug na URL**: slugs de cronômetro/grupo/TV continuam globais — não precisam de tenant slug pra acessar leitura pública. Tenant é inferido pelo slug do recurso.

## Decisões técnicas

### Roteamento

**Slugs globais, sem tenant na URL.** Cronômetro `abc12xyz` é único globalmente — duas contas não podem criar com o mesmo slug. Quem acessa `/c/abc12xyz/` lê o estado direto, sem precisar saber a qual tenant pertence. Ações exigem login e o sistema valida que o cronômetro pertence ao tenant do user.

Justificativa: URLs compartilhadas continuam curtas e a TV mode anônima funciona sem complicação. Custo: namespace global limita escalabilidade — quando saturar (32^8 = 1 trilhão), revisita. Não vamos chegar lá.

### Email único global

Email único na tabela `labclock_usuarios` (não único por tenant). Justificativa:
- Login form não precisa de "qual tenant" — usuário coloca email + senha e o sistema descobre.
- Mesma pessoa em 2 tenants exige 2 emails (workaround simples: `+`).
- Simplifica drasticamente a UX de login.

Custo: se alguém quiser desativar `feature_X@empresa.com` num tenant e criar `feature_X@empresa.com` em outro, não dá. Trade-off aceito.

### Tenant default = `kharis`

Todos os dados pre-Fase 7 ficam no tenant `kharis` (uso interno da agência). O migration script cria o tenant + faz UPDATE em todas as tabelas atribuindo `tenant_id = <id do kharis>`.

### Self-service: signup atomic

Criar conta = 1 transação SQL que cria tenant + user admin. Se uma falha, ambos rollback. Slug do tenant é gerado por padrão (8 chars) mas usuário pode editar até 7 dias depois (não escopo dessa fase).

## Etapas

### 7.1 — Schema + migração

1. Tabela `labclock_tenants` (id, slug UNIQUE, nome, plano DEFAULT 'free', status DEFAULT 'ativo', created_at).
2. Adicionar `tenant_id INT UNSIGNED NOT NULL` em: `labclock_usuarios`, `labclock_cronometros`, `labclock_grupos`, `labclock_salas`, `labclock_audit_log` (NULL aceito aqui pra ações pré-login).
3. FK em todas elas com `ON DELETE CASCADE`.
4. Index `(tenant_id, *)` nos campos relevantes.
5. Script `_setup-fase7.php` idempotente:
   - Cria tabela tenants
   - Insere tenant 'kharis' se não existir
   - Para cada tabela alvo: ADD COLUMN se não existir + UPDATE WHERE tenant_id IS NULL SET tenant_id = <kharis> + ALTER COLUMN NOT NULL + ADD FK

### 7.2 — Isolamento de queries

1. `_auth.php`: `lc_user()` retorna user com `tenant_id`. Helper `lc_tenant_id(): int` pra acesso direto.
2. Endpoints que listam (cronometros, grupos, salas, usuarios, auditoria): adicionam `WHERE tenant_id = ?` no SELECT.
3. Endpoints que criam (cronometros, grupos, salas, usuarios): incluem `tenant_id` no INSERT.
4. Endpoints que mexem em entidade específica (PATCH/DELETE): além do ownership atual, valida `entidade.tenant_id === user.tenant_id`. Admin de um tenant **não** pode mexer em entidade de outro tenant. (Admin global = não existe na v1; cada admin é admin do próprio tenant.)
5. Endpoints públicos (`GET /api/cronometros.php?slug=X`, `GET /api/grupos.php?slug=X`): não filtram por tenant — slug é global.

### 7.3 — Self-service signup

1. Nova página `criar-conta.html`:
   - Form: nome do lab, slug do lab (autopreenchido pelo nome), nome do admin, email, senha
   - Validações client-side
   - POST `/api/signup.php`
2. Endpoint `api/signup.php`:
   - Recebe `{ tenant_nome, tenant_slug?, admin_nome, admin_email, admin_senha }`
   - Valida: tenant_slug 4-12 chars [a-z0-9], email válido, senha ≥8 chars
   - Transação: INSERT tenant + INSERT usuario (papel='admin', tenant_id=novoTenant)
   - Faz login automático na resposta (sessão criada)
   - Audit `signup` com snapshot do tenant criado
3. Rate limit básico: 1 signup por IP por hora (cookie + IP em audit log; if (count >= 1) → 429).

### 7.4 — Landing pública + dashboard

1. Atual `/index.html` (logado vai pra dashboard, anônimo vai pra login) vira `/app.html` ou `/dashboard.html`.
2. Novo `/index.html`: landing pública.
   - Hero: nome + tagline + CTA "Criar conta grátis" / "Entrar"
   - Seção "Para quê serve": laboratório, cozinha pro, brewery, multi-timing
   - Seção "Como funciona": 3 passos (cria conta → cria cronômetros → compartilha por URL)
   - Seção "Built for transparency": menção a open-source, código-aberto, etc. (TBD)
   - Footer: link pro nicchon.com, contato
3. Redirect: se usuário logado acessa `/`, redireciona pra `/app.html`. Se anônimo, mostra landing.
4. Atualizar todos os links internos (`back-link` no header) pra apontar pro lugar certo.

## Critérios de aceite

### Schema/migração
- [ ] `labclock_tenants` criado com tenant `kharis` (id=1)
- [ ] Todos os dados existentes (usuarios, cronometros, salas, grupos, audit) têm `tenant_id = 1`
- [ ] FK em todas as tabelas com `ON DELETE CASCADE`
- [ ] DELETE de um tenant cascade limpa tudo (testar com tenant secundário)

### Isolamento
- [ ] Listar cronometros: só retorna do tenant do user logado
- [ ] Criar cronometro: grava `tenant_id` automaticamente
- [ ] Admin de tenant A não consegue editar/deletar entidade do tenant B (403)
- [ ] Slugs continuam globais — `/c/{slug}/` público funciona independente de tenant

### Signup
- [ ] `POST /api/signup.php` com dados válidos cria tenant + user admin + faz login
- [ ] Dados inválidos: 422 com mensagem
- [ ] Slug duplicado: 409
- [ ] Email duplicado: 409
- [ ] Audit `signup` gravado com snapshot

### Landing
- [ ] `/labclock/` anônimo: landing pública
- [ ] `/labclock/` logado: redirect pra `/labclock/app.html`
- [ ] CTA "Criar conta" → `/labclock/criar-conta.html`
- [ ] CTA "Entrar" → `/labclock/login.html`
- [ ] Mobile responsive

## Riscos / decisões

- **Migração de NULL → NOT NULL com FK**: se algum row tem `tenant_id` NULL após UPDATE, o ALTER falha. Garantir UPDATE rodou antes do ALTER. Script faz UPDATE primeiro e só depois muda pra NOT NULL.
- **Email único global vs único por tenant**: optei por global (decisão acima). Se isso bloquear caso real, podemos migrar pra unique(email, tenant_id) numa fase 8+.
- **`tenant_id` em `labclock_audit_log` NULL aceito**: ações pré-login (signup, login.fail) podem não ter tenant. Pós-login, gravar tenant_id.
- **Sem rate limit forte no signup**: 1 por IP por hora é fraco contra ataques distribuídos. Aceitável pra v1 — Hostgator + DDoS de signup é improvável.
- **Não migrar usuário no signup**: se o user já tem conta num tenant e tenta criar outro tenant com o mesmo email → 409. Pra ter conta em 2 tenants, usa email com `+alias`. Documentar no UX.
- **Slug do tenant**: 4-12 chars [a-z0-9] (mesmo padrão dos outros slugs). Auto-preenchido a partir do nome (snake_case → kebab → strip invalid). User pode editar no form.
