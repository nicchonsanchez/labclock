<?php
// LabClock — CRUD de cronômetros (sem auth na fase 1).
//
// Rotas (via ?slug= e ?acao=):
//   GET    /api/cronometros.php                  → lista todos (limite)
//   POST   /api/cronometros.php                  → cria { nome, duracao_ms }
//   GET    /api/cronometros.php?slug=X           → detalhe
//   PATCH  /api/cronometros.php?slug=X&acao=start
//   PATCH  /api/cronometros.php?slug=X&acao=pause
//   PATCH  /api/cronometros.php?slug=X&acao=reset
//   DELETE /api/cronometros.php?slug=X
//
// Resposta inclui server_time_ms pra o cliente calcular offset de relógio.

declare(strict_types=1);

require_once __DIR__ . '/_db.php';
require_once __DIR__ . '/_util.php';
require_once __DIR__ . '/_auth.php';
require_once __DIR__ . '/_audit.php';

header('X-Content-Type-Options: nosniff');

$method = $_SERVER['REQUEST_METHOD'];
$slug   = isset($_GET['slug']) ? trim((string) $_GET['slug']) : null;
$acao   = isset($_GET['acao']) ? trim((string) $_GET['acao']) : null;
$now    = lc_now_ms();

if ($slug !== null && !preg_match('/^[a-z0-9]{4,12}$/', $slug)) {
    lc_json(['error' => 'slug inválido'], 422);
}

try {
    $db = lc_db();

    // ---------- LISTAR ----------
    // Aceita ?sala_id=N pra filtrar por sala. Inclui sala_nome + dono_nome via JOIN.
    if ($method === 'GET' && $slug === null) {
        $where = '';
        $params = [];
        if (isset($_GET['sala_id'])) {
            $where = ' WHERE c.sala_id = :sid';
            $params[':sid'] = (int) $_GET['sala_id'];
        }
        $sql = "SELECT c.slug, c.nome, c.duracao_ms, c.status, c.started_at_ms, c.paused_remaining_ms,
                       c.sala_id, c.dono_id, s.nome AS sala_nome, u.nome AS dono_nome
                  FROM labclock_cronometros c
                  LEFT JOIN labclock_salas    s ON s.id = c.sala_id
                  LEFT JOIN labclock_usuarios u ON u.id = c.dono_id
                  $where
                  ORDER BY c.updated_at DESC LIMIT 100";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = array_map('lc_cron_to_array', $stmt->fetchAll());
        lc_json(['server_time_ms' => $now, 'cronometros' => $rows]);
    }

    // ---------- CRIAR ----------
    if ($method === 'POST' && $slug === null) {
        $user = lc_require_login();
        $b = lc_input();
        $nome = trim((string) ($b['nome'] ?? ''));
        if ($nome === '') $nome = 'Cronômetro';
        if (mb_strlen($nome) > 120) lc_json(['error' => 'nome muito longo'], 422);

        $duracao = (int) ($b['duracao_ms'] ?? 60000);
        if ($duracao < 1000 || $duracao > 86_400_000) {
            lc_json(['error' => 'duracao_ms deve estar entre 1s e 24h'], 422);
        }

        // sala_id opcional — valida se existe
        $sala_id = null;
        if (isset($b['sala_id']) && $b['sala_id'] !== null && $b['sala_id'] !== '') {
            $sala_id = (int) $b['sala_id'];
            $chk = $db->prepare("SELECT id FROM labclock_salas WHERE id = :id");
            $chk->execute([':id' => $sala_id]);
            if (!$chk->fetch()) lc_json(['error' => 'sala_id não existe'], 422);
        }

        // Gera slug único — tenta até 5x em caso de colisão
        $stmt = $db->prepare("INSERT INTO labclock_cronometros (slug, dono_id, sala_id, nome, duracao_ms) VALUES (:s, :dono, :sala, :n, :d)");
        for ($i = 0; $i < 5; $i++) {
            $s = lc_gerar_slug();
            try {
                $stmt->execute([':s' => $s, ':dono' => $user['id'], ':sala' => $sala_id, ':n' => $nome, ':d' => $duracao]);
                $newId = (int) $db->lastInsertId();
                lc_audit('cronometro.criar', 'cronometro', $newId, [
                    'slug' => $s, 'nome' => $nome, 'duracao_ms' => $duracao, 'sala_id' => $sala_id,
                ]);
                lc_json([
                    'slug'           => $s,
                    'nome'           => $nome,
                    'duracao_ms'     => $duracao,
                    'status'         => 'PARADO',
                    'dono_id'        => (int) $user['id'],
                    'sala_id'        => $sala_id,
                    'server_time_ms' => $now,
                ], 201);
            } catch (PDOException $e) {
                if (!str_contains($e->getMessage(), 'Duplicate')) throw $e;
            }
        }
        lc_json(['error' => 'falha ao gerar slug único'], 500);
    }

    // ---------- DETALHE ----------
    if ($method === 'GET' && $slug !== null) {
        $stmt = $db->prepare("SELECT c.*, s.nome AS sala_nome, u.nome AS dono_nome
            FROM labclock_cronometros c
            LEFT JOIN labclock_salas    s ON s.id = c.sala_id
            LEFT JOIN labclock_usuarios u ON u.id = c.dono_id
            WHERE c.slug = :s");
        $stmt->execute([':s' => $slug]);
        $c = $stmt->fetch();
        if (!$c) lc_json(['error' => 'cronômetro não encontrado'], 404);
        lc_json(array_merge(lc_cron_to_array($c), ['server_time_ms' => $now]));
    }

    // ---------- EDITAR (nome / duracao_ms) — PATCH sem ?acao ----------
    if ($method === 'PATCH' && $slug !== null && $acao === null) {
        $user = lc_require_login();
        $stmt = $db->prepare("SELECT * FROM labclock_cronometros WHERE slug = :s");
        $stmt->execute([':s' => $slug]);
        $c = $stmt->fetch();
        if (!$c) lc_json(['error' => 'cronômetro não encontrado'], 404);
        if ($c['dono_id'] !== null && (int) $c['dono_id'] !== (int) $user['id'] && $user['papel'] !== 'admin') {
            lc_json(['error' => 'sem permissão pra editar'], 403);
        }

        $b = lc_input();
        $novoNome    = isset($b['nome'])       ? trim((string) $b['nome'])  : null;
        $novaDuracao = isset($b['duracao_ms']) ? (int) $b['duracao_ms']      : null;
        $temSala     = array_key_exists('sala_id', $b);  // permite enviar null pra desassociar
        $novaSala    = $temSala ? ($b['sala_id'] !== null && $b['sala_id'] !== '' ? (int) $b['sala_id'] : null) : null;

        if ($novoNome === null && $novaDuracao === null && !$temSala) {
            lc_json(['error' => 'nada pra editar (envie nome, duracao_ms ou sala_id)'], 422);
        }
        if ($novoNome !== null) {
            if ($novoNome === '') lc_json(['error' => 'nome vazio'], 422);
            if (mb_strlen($novoNome) > 120) lc_json(['error' => 'nome muito longo'], 422);
        }
        if ($novaDuracao !== null) {
            if ($novaDuracao < 1000 || $novaDuracao > 86_400_000) {
                lc_json(['error' => 'duracao_ms deve estar entre 1s e 24h'], 422);
            }
        }
        if ($temSala && $novaSala !== null) {
            $chk = $db->prepare("SELECT id FROM labclock_salas WHERE id = :id");
            $chk->execute([':id' => $novaSala]);
            if (!$chk->fetch()) lc_json(['error' => 'sala_id não existe'], 422);
        }

        // Constrói UPDATE dinâmico. Se duração mudou, força reset (status PARADO).
        $sets = [];
        $params = [':slug' => $slug];
        if ($novoNome !== null) {
            $sets[] = "nome = :nome";
            $params[':nome'] = $novoNome;
        }
        if ($novaDuracao !== null && $novaDuracao !== (int) $c['duracao_ms']) {
            $sets[] = "duracao_ms = :dur";
            $sets[] = "status = 'PARADO'";
            $sets[] = "started_at_ms = NULL";
            $sets[] = "paused_remaining_ms = NULL";
            $params[':dur'] = $novaDuracao;
        }
        if ($temSala) {
            $sets[] = "sala_id = :sala";
            $params[':sala'] = $novaSala;
        }

        if (empty($sets)) {
            lc_json(['ok' => true, 'noop' => true]);
        }

        $sql = "UPDATE labclock_cronometros SET " . implode(', ', $sets) . " WHERE slug = :slug";
        $u = $db->prepare($sql);
        $u->execute($params);
        lc_audit('cronometro.editar', 'cronometro', (int) $c['id'], [
            'slug' => $slug,
            'nome_novo' => $novoNome,
            'duracao_ms_nova' => $novaDuracao,
            'sala_id_nova' => $temSala ? $novaSala : null,
        ]);
        lc_json(['ok' => true, 'server_time_ms' => $now]);
    }

    // ---------- AÇÕES (start, pause, reset) ----------
    if ($method === 'PATCH' && $slug !== null && $acao !== null) {
        $user = lc_require_login();
        $stmt = $db->prepare("SELECT * FROM labclock_cronometros WHERE slug = :s");
        $stmt->execute([':s' => $slug]);
        $c = $stmt->fetch();
        if (!$c) lc_json(['error' => 'cronômetro não encontrado'], 404);
        // Ownership: dono pode tudo. Admin pode tudo. Outros: 403.
        // (cronômetros legados sem dono_id, qualquer logado pode mexer — facilita migração)
        if ($c['dono_id'] !== null && (int) $c['dono_id'] !== (int) $user['id'] && $user['papel'] !== 'admin') {
            lc_json(['error' => 'sem permissão pra mexer neste cronômetro'], 403);
        }

        if ($acao === 'start') {
            // Se pausado: retoma de onde parou (started_at = now - elapsed)
            // Se parado:  começa do zero (started_at = now)
            if ($c['status'] === 'PAUSADO' && $c['paused_remaining_ms'] !== null) {
                $elapsed = (int) $c['duracao_ms'] - (int) $c['paused_remaining_ms'];
                $started = $now - $elapsed;
            } else {
                $started = $now;
            }
            $u = $db->prepare("UPDATE labclock_cronometros SET status='RODANDO', started_at_ms=:s, paused_remaining_ms=NULL WHERE slug=:slug");
            $u->execute([':s' => $started, ':slug' => $slug]);
            lc_audit('cronometro.start', 'cronometro', (int) $c['id'], ['slug' => $slug, 'nome' => $c['nome'], 'retomado_de_pausa' => $c['status'] === 'PAUSADO']);
            lc_json(['ok' => true, 'status' => 'RODANDO', 'started_at_ms' => $started, 'server_time_ms' => $now]);
        }

        if ($acao === 'pause') {
            if ($c['status'] !== 'RODANDO') lc_json(['error' => 'cronômetro não está rodando'], 409);
            $elapsed   = $now - (int) $c['started_at_ms'];
            $remaining = (int) $c['duracao_ms'] - $elapsed;
            // Permite remaining negativo? Por enquanto não — pausa no zero.
            // Cronômetro continua "atrasado" apenas se estiver RODANDO (cliente calcula).
            if ($remaining < 0) $remaining = 0;
            $u = $db->prepare("UPDATE labclock_cronometros SET status='PAUSADO', paused_remaining_ms=:r, started_at_ms=NULL WHERE slug=:slug");
            $u->execute([':r' => $remaining, ':slug' => $slug]);
            lc_audit('cronometro.pause', 'cronometro', (int) $c['id'], ['slug' => $slug, 'nome' => $c['nome'], 'restante_ms' => $remaining]);
            lc_json(['ok' => true, 'status' => 'PAUSADO', 'paused_remaining_ms' => $remaining, 'server_time_ms' => $now]);
        }

        if ($acao === 'reset') {
            $u = $db->prepare("UPDATE labclock_cronometros SET status='PARADO', started_at_ms=NULL, paused_remaining_ms=NULL WHERE slug=:slug");
            $u->execute([':slug' => $slug]);
            lc_audit('cronometro.reset', 'cronometro', (int) $c['id'], ['slug' => $slug, 'nome' => $c['nome']]);
            lc_json(['ok' => true, 'status' => 'PARADO', 'server_time_ms' => $now]);
        }

        lc_json(['error' => 'ação desconhecida (use start, pause ou reset)'], 422);
    }

    // ---------- EXCLUIR ----------
    if ($method === 'DELETE' && $slug !== null) {
        $user = lc_require_login();
        // Mesma regra de ownership do PATCH
        $stmt = $db->prepare("SELECT id, dono_id, nome FROM labclock_cronometros WHERE slug = :s");
        $stmt->execute([':s' => $slug]);
        $c = $stmt->fetch();
        if (!$c) lc_json(['error' => 'cronômetro não encontrado'], 404);
        if ($c['dono_id'] !== null && (int) $c['dono_id'] !== (int) $user['id'] && $user['papel'] !== 'admin') {
            lc_json(['error' => 'sem permissão pra excluir'], 403);
        }
        $del = $db->prepare("DELETE FROM labclock_cronometros WHERE slug = :s");
        $del->execute([':s' => $slug]);
        lc_audit('cronometro.deletar', 'cronometro', (int) $c['id'], ['slug' => $slug, 'nome' => $c['nome']]);
        lc_json(['ok' => true, 'affected' => $del->rowCount(), 'server_time_ms' => $now]);
    }

    lc_json(['error' => 'método/rota não suportado'], 405);
} catch (PDOException $e) {
    error_log('[labclock-api] PDO: ' . $e->getMessage());
    lc_json(['error' => 'erro de banco'], 500);
} catch (Throwable $e) {
    error_log('[labclock-api] ' . $e->getMessage());
    lc_json(['error' => 'erro interno'], 500);
}
