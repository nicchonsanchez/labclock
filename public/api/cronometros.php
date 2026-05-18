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
    if ($method === 'GET' && $slug === null) {
        $stmt = $db->query("SELECT slug, nome, duracao_ms, status, started_at_ms, paused_remaining_ms FROM labclock_cronometros ORDER BY updated_at DESC LIMIT 100");
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

        // Gera slug único — tenta até 5x em caso de colisão
        $stmt = $db->prepare("INSERT INTO labclock_cronometros (slug, dono_id, nome, duracao_ms) VALUES (:s, :dono, :n, :d)");
        for ($i = 0; $i < 5; $i++) {
            $s = lc_gerar_slug();
            try {
                $stmt->execute([':s' => $s, ':dono' => $user['id'], ':n' => $nome, ':d' => $duracao]);
                lc_json([
                    'slug'           => $s,
                    'nome'           => $nome,
                    'duracao_ms'     => $duracao,
                    'status'         => 'PARADO',
                    'dono_id'        => (int) $user['id'],
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
        $stmt = $db->prepare("SELECT * FROM labclock_cronometros WHERE slug = :s");
        $stmt->execute([':s' => $slug]);
        $c = $stmt->fetch();
        if (!$c) lc_json(['error' => 'cronômetro não encontrado'], 404);
        lc_json(array_merge(lc_cron_to_array($c), ['server_time_ms' => $now]));
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
            lc_json(['ok' => true, 'status' => 'PAUSADO', 'paused_remaining_ms' => $remaining, 'server_time_ms' => $now]);
        }

        if ($acao === 'reset') {
            $u = $db->prepare("UPDATE labclock_cronometros SET status='PARADO', started_at_ms=NULL, paused_remaining_ms=NULL WHERE slug=:slug");
            $u->execute([':slug' => $slug]);
            lc_json(['ok' => true, 'status' => 'PARADO', 'server_time_ms' => $now]);
        }

        lc_json(['error' => 'ação desconhecida (use start, pause ou reset)'], 422);
    }

    // ---------- EXCLUIR ----------
    if ($method === 'DELETE' && $slug !== null) {
        $user = lc_require_login();
        // Mesma regra de ownership do PATCH
        $stmt = $db->prepare("SELECT dono_id FROM labclock_cronometros WHERE slug = :s");
        $stmt->execute([':s' => $slug]);
        $c = $stmt->fetch();
        if (!$c) lc_json(['error' => 'cronômetro não encontrado'], 404);
        if ($c['dono_id'] !== null && (int) $c['dono_id'] !== (int) $user['id'] && $user['papel'] !== 'admin') {
            lc_json(['error' => 'sem permissão pra excluir'], 403);
        }
        $del = $db->prepare("DELETE FROM labclock_cronometros WHERE slug = :s");
        $del->execute([':s' => $slug]);
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
