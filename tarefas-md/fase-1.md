# LabClock — Fase 1 (MVP)

**Status:** Entregue 2026-05-18.

## Escopo

- Backend PHP+MySQL: criar, listar, detalhar, start/pause/reset, deletar cronômetro
- Frontend home: lista + form de criar
- Frontend individual `/c/{slug}/`: display grande, controles, link de compartilhar
- Polling 3s + cálculo client-side a 10fps
- Sem auth, sem grupos, sem TV mode (próximas fases)
- Identidade visual v2026 (mesma de app.nicchon.com)
- Tema dark/light compartilhado via localStorage `app-theme`
- Beep Web Audio quando cruza 0
- Display em MM:SS (ou H:MM:SS) com suporte a negativos pra mostrar atraso

## O que ficou pra fase 2+

- Auth (login, cada user vê seus cronômetros)
- Tabela `cronos_usuarios`, `cronos_labs`, `cronos_salas`
- Edição de nome/tempo via UI
- Audit log (quem fez o quê)
- Grupos M:N
- TV mode `/tv/{slug}` full-screen
- QR code pra pareamento
- Web Push (notificação background)
- Multi-tenant

## Critérios de aceite

- [x] `POST /api/cronometros.php` cria com slug retornado
- [x] `GET /api/cronometros.php` lista 100 mais recentes
- [x] `PATCH /api/cronometros.php?slug=X&acao=start` inicia
- [x] `PATCH /api/cronometros.php?slug=X&acao=pause` pausa preservando remaining
- [x] `PATCH /api/cronometros.php?slug=X&acao=reset` reseta pro tempo original
- [x] Home lista todos com tempo calculado em tempo real
- [x] Página `/c/{slug}/` mostra cronômetro com controles
- [x] 2 dispositivos no mesmo cronômetro veem mesma contagem (latência ~3s pra ações)
- [x] Tema dark/light funcionando
- [x] Beep quando cruza 0
- [x] Display em MM:SS

## Lições da fase 1

- (preencher após uso real por 1 semana)
