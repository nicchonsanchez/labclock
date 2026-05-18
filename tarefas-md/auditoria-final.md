# LabClock — Auditoria final (pós-Fase 7)

**Quando rodar:** após Fase 7 estar entregue (multi-tenant + landing), antes de considerar o sistema "fechado v1".

## Por que essa tarefa existe

A documentação foi se atualizando ao longo das fases mas não tem coerência completa. README está parado na Fase 1. Faltam ADRs das decisões já tomadas. Faltam runbooks pra operações comuns. E o sistema todo precisa de uma passada funcional dispositivo a dispositivo antes de declarar pronto.

## Escopo

### 1. Revisão da documentação

Comparar **estado atual vs ideal** (referência: KTask) e fechar o gap:

- [ ] **README.md raiz** — atualizar pra refletir estado real. Hoje diz "Fase 1, sem auth, sem grupos, sem TV mode" — mentira. Reescrever do zero com: feature set real, API completa, roadmap atual, como rodar.
- [ ] **docs/architecture.md** (não existe) — C4 nível 1 + 2. Contexto (clientes desktop/mobile/TV ↔ Hostgator PHP+MySQL ↔ banco isolado) + subsistemas (auth, cronômetros, grupos, salas, audit, notificação).
- [ ] **docs/data-model.md** (não existe) — diagrama Mermaid das 6 tabelas (`labclock_*`) + relações + decisões (slug 8-char, snapshot de email em audit, dono_id com ON DELETE SET NULL).
- [ ] **docs/adr/** (não existe) — criar ADRs retroativas das decisões já tomadas:
   - 0001-polling-em-vez-de-websocket.md (limitação Hostgator)
   - 0002-banco-isolado-do-painel.md (segurança)
   - 0003-jquery-self-hosted.md (CSP estrita)
   - 0004-slug-8-char-sem-confusao.md (UX URL curta)
   - 0005-pbkdf2-600k-iter.md (senha-hash)
   - 0006-calculo-determinístico-client-side.md (latência aceita)
- [ ] **docs/runbooks/** (não existe):
   - setup-banco-novo.md (rodar `_setup-fase*.php` em ordem, deletar depois)
   - deploy-falhou.md (gh secret check, re-run workflow, ftp manual)
   - timer-dessincronizado.md (cliente vs servidor — checar server_time_ms)
   - resetar-senha-admin.md (via phpMyAdmin + hash PBKDF2)
- [ ] **docs/onboarding.md** (não existe) — checklist 30/60/90 pra dev novo entender o sistema.
- [ ] **tarefas-md/fase-2.md, fase-3.md, fase-4.md, fase-5.md** (não existem) — escrever retrospectivamente, com escopo + critérios de aceite. Padrão fase-1.md.
- [ ] **API reference** — documentar endpoints finais (cronometros, grupos, salas, usuarios, auth, auditoria). Decisão: inline em README.md ou docs/api.md? KTask usa Swagger; LabClock pode ser markdown simples já que API é pequena.
- [ ] **Central de Ajuda no app** — `/labclock/ajuda/` com guia pro técnico/admin (criar cronômetro, compartilhar, montar grupo, TV mode, trocar senha). Inspiração: `/ajuda` do KTask.

### 2. Auditoria funcional do sistema

Bateria de testes manuais em dispositivos reais, **todos os fluxos do produto**:

#### Autenticação
- [ ] Login com credenciais corretas → 200, cookie de sessão, redirect
- [ ] Login com senha errada → 401, audit `login.fail` gravado com email tentado e IP
- [ ] Logout → sessão destruída, audit `logout` gravado
- [ ] Sessão expira após 7 dias (verificar TTL real)
- [ ] Trocar senha → audit `usuario.trocar_senha` gravado
- [ ] Senha atual incorreta → 401

#### Cronômetros
- [ ] Criar com nome + duração → 201, slug retornado, audit `cronometro.criar`
- [ ] Criar com duração < 1s ou > 24h → 422
- [ ] Editar nome → audit `cronometro.editar`
- [ ] Editar duração → status volta pra PARADO (reset implícito)
- [ ] Start, pause, reset → audit de cada ação
- [ ] Pause em cronômetro PARADO → 409
- [ ] Deletar cronômetro próprio → 200, audit
- [ ] Tentar deletar de outro user (não admin) → 403
- [ ] Admin deleta cronômetro de outro → 200
- [ ] 2 dispositivos no mesmo `/c/{slug}/` → latência ≤3s pra ações
- [ ] Beep quando cruza zero (Web Audio funciona)
- [ ] Notificação no SO quando cruza zero (Fase 6)
- [ ] Display continua mostrando negativos depois do zero (atraso)

#### Grupos
- [ ] Criar grupo → 201, audit `grupo.criar`
- [ ] Adicionar cronômetro ao grupo → audit `grupo.add_cron`
- [ ] Adicionar mesmo cronômetro 2x → 409
- [ ] Remover cronômetro do grupo → audit `grupo.remove_cron`, mas cronômetro continua existindo
- [ ] Editar nome do grupo → audit
- [ ] Deletar grupo (cascade) → audit, M:N limpa
- [ ] `/g/{slug}/` público mostra estado em tempo real sem login
- [ ] Não-dono e não-admin não consegue editar/deletar grupo

#### TV mode
- [ ] `/tv/{slug}/` carrega
- [ ] QR code é gerado e aponta pra `/g/{slug}/`
- [ ] Relógio HH:MM atualiza
- [ ] Wake Lock ativa (tela não apaga)
- [ ] Layout 1-2-3-4 colunas conforme qty de cronômetros
- [ ] Beep volume 0.5 audível
- [ ] Flash bordô quando algum timer cruza zero
- [ ] Smart TV (browser embutido) — testar pelo menos 1x

#### Salas (admin)
- [ ] Criar/editar/deletar sala → audit
- [ ] Cronômetros com sala_id desta sala → sala_id vira NULL após deletar
- [ ] Filtrar cronômetros por sala_id funciona

#### Admin
- [ ] Não-admin acessando `/admin/usuarios/` → bloqueado/redirect
- [ ] Não-admin acessando `/admin/auditoria/` → bloqueado/redirect
- [ ] Admin cria técnico → audit, novo user consegue logar
- [ ] Admin tenta deletar a si mesmo → 422
- [ ] Admin deleta outro user → audit, cronômetros do user ficam órfãos (dono_id=NULL)
- [ ] Audit log filtros funcionam (usuário, ação, período)

#### Segurança
- [ ] CSP headers presentes em todas as páginas
- [ ] Inline `<script>` ou `onclick=` → bloqueado (verificar console)
- [ ] Tentar acessar `/api/_db.php`, `/api/_config.php`, `/api/_setup-*.php` direto → 403
- [ ] Tentar SQL injection em slug/email → escapado pelos prepared statements
- [ ] Senha em formato PBKDF2 (não plaintext) no banco
- [ ] Cookie de sessão tem `HttpOnly` + `SameSite=Lax`

#### Performance / latência
- [ ] Polling 3s não derruba o servidor (testar com 10+ clientes simultâneos)
- [ ] Display 10fps fluido em mobile médio
- [ ] FTP deploy completa em <30s

### 3. Limpeza pós-auditoria

- [ ] Deletar todos `_setup-fase*.php` da produção
- [ ] Remover `_setup-*.php` do `.htaccess` denylist se necessário (ou manter denylist por segurança e só deletar os arquivos)
- [ ] Trocar senha do admin se ainda for `senha123`
- [ ] Adicionar `docs/postmortems/` template vazio + política (não obrigatório criar, só template pronto)
- [ ] Tag do commit final `v1.0.0` no git

## Critérios de aceite

- [ ] Todos os checkboxes acima marcados (com link pra commit/PR/print que comprova)
- [ ] Documentação coerente entre si — sem README dizendo "Fase 1" enquanto produto está em Fase 7
- [ ] Zero arquivos `_setup-*.php` em produção
- [ ] Audit log mostra pelo menos 1 entry de cada ação testada
- [ ] Sistema rodando em uso real por 1 semana sem incidente crítico (anotar lições aprendidas em `lições-fase-7.md` ou similar)

## Riscos / decisões

- **Documentação retrospectiva é menos precisa que prospectiva**: vou ter que ler git log + código pra reconstruir decisões. Antes de fechar cada ADR, validar com o user.
- **Auditoria funcional toma tempo (~1 dia)**: priorizar fluxos de produto sobre edge cases.
- **Central de Ajuda no app**: feature opcional. Se LabClock for ferramenta interna, pode adiar. Se for SaaS público (Fase 7+), é obrigatório.
