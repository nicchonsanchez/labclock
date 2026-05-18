<?php
// LabClock — endpoints de grupos (M:N com cronômetros).
//
//   GET    /api/grupos.php                                  meus grupos + grupos onde tenho cronômetro
//   GET    /api/grupos.php?slug=X                           detalhe (com cronômetros + estados pro polling)
//   POST   /api/grupos.php                                  cria { nome }
//   PATCH  /api/grupos.php?slug=X                           edita nome
//   DELETE /api/grupos.php?slug=X                           remove (cascade tira do grupo_cronometros)
//   POST   /api/grupos.php?slug=X&acao=add                  adiciona cronômetro { cronometro_slug }
//   DELETE /api/grupos.php?slug=X&acao=remove&cronometro_slug=Y

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

    // ---------- DETALHE (público — read-only via URL compartilhada) ----------
    if ($method === 'GET' && $slug !== null) {
        $stmt = $db->prepare("SELECT g.id, g.slug, g.nome, g.dono_id, g.created_at, u.nome AS dono_nome
            FROM labclock_grupos g JOIN labclock_usuarios u ON u.id = g.dono_id WHERE g.slug = :s");
        $stmt->execute([':s' => $slug]);
        $g = $stmt->fetch();
        if (!$g) lc_json(['error' => 'grupo não encontrado'], 404);

        $cs = $db->prepare("SELECT c.slug, c.nome, c.duracao_ms, c.status, c.started_at_ms, c.paused_remaining_ms,
                                   c.sala_id, s.nome AS sala_nome, gc.ordem
            FROM labclock_grupo_cronometros gc
            JOIN labclock_cronometros c ON c.id = gc.cronometro_id
            LEFT JOIN labclock_salas s ON s.id = c.sala_id
            WHERE gc.grupo_id = :gid
            ORDER BY gc.ordem ASC, c.nome ASC");
        $cs->execute([':gid' => $g['id']]);
        $cronometros = array_map(function ($c) {
            return [
                'slug'                => $c['slug'],
                'nome'                => $c['nome'],
                'duracao_ms'          => (int) $c['duracao_ms'],
                'status'              => $c['status'],
                'started_at_ms'       => $c['started_at_ms'] !== null ? (int) $c['started_at_ms'] : null,
                'paused_remaining_ms' => $c['paused_remaining_ms'] !== null ? (int) $c['paused_remaining_ms'] : null,
                'sala_id'             => $c['sala_id'] !== null ? (int) $c['sala_id'] : null,
                'sala_nome'           => $c['sala_nome'],
                'ordem'               => (int) $c['ordem'],
            ];
        }, $cs->fetchAll());

        lc_json([
            'slug'           => $g['slug'],
            'nome'           => $g['nome'],
            'dono_id'        => (int) $g['dono_id'],
            'dono_nome'      => $g['dono_nome'],
            'cronometros'    => $cronometros,
            'server_time_ms' => $now,
        ]);
    }

    // ---------- LISTAR (logado) — meus grupos + grupos onde tenho cronômetro ----------
    if ($method === 'GET' && $slug === null) {
        $me = lc_require_login();
        $stmt = $db->prepare("
            SELECT g.slug, g.nome, g.dono_id, u.nome AS dono_nome, g.created_at,
                   (SELECT COUNT(*) FROM labclock_grupo_cronometros gc WHERE gc.grupo_id = g.id) AS total_cronometros
              FROM labclock_grupos g
              JOIN labclock_usuarios u ON u.id = g.dono_id
             WHERE g.dono_id = :me
                OR g.id IN (
                    SELECT gc.grupo_id FROM labclock_grupo_cronometros gc
                    JOIN labclock_cronometros c ON c.id = gc.cronometro_id
                    WHERE c.dono_id = :me2
                )
             ORDER BY g.created_at DESC");
        $stmt->execute([':me' => $me['id'], ':me2' => $me['id']]);
        lc_json(['grupos' => $stmt->fetchAll(), 'server_time_ms' => $now]);
    }

    // ---------- CRIAR (logado) ----------
    if ($method === 'POST' && $slug === null) {
        $me = lc_require_login();
        $b = lc_input();
        $nome = trim((string) ($b['nome'] ?? ''));
        if ($nome === '' || mb_strlen($nome) > 120) lc_json(['error' => 'nome obrigatório (até 120 chars)'], 422);

        $ins = $db->prepare("INSERT INTO labclock_grupos (slug, dono_id, nome) VALUES (:s, :d, :n)");
        for ($i = 0; $i < 5; $i++) {
            $s = lc_gerar_slug();
            try {
                $ins->execute([':s' => $s, ':d' => $me['id'], ':n' => $nome]);
                $newId = (int) $db->lastInsertId();
                lc_audit('grupo.criar', 'grupo', $newId, ['slug' => $s, 'nome' => $nome]);
                lc_json(['ok' => true, 'slug' => $s, 'nome' => $nome, 'dono_id' => (int) $me['id']], 201);
            } catch (PDOException $e) {
                if (!str_contains($e->getMessage(), 'Duplicate')) throw $e;
            }
        }
        lc_json(['error' => 'falha ao gerar slug único'], 500);
    }

    // Operações que precisam do grupo + ownership check
    if (in_array($method, ['PATCH', 'DELETE', 'POST'], true) && $slug !== null) {
        $me = lc_require_login();
        $stmt = $db->prepare("SELECT id, dono_id FROM labclock_grupos WHERE slug = :s");
        $stmt->execute([':s' => $slug]);
        $g = $stmt->fetch();
        if (!$g) lc_json(['error' => 'grupo não encontrado'], 404);
        if ((int) $g['dono_id'] !== (int) $me['id'] && $me['papel'] !== 'admin') {
            lc_json(['error' => 'sem permissão pra mexer neste grupo'], 403);
        }
        $gid = (int) $g['id'];

        // PATCH — edita nome
        if ($method === 'PATCH' && $acao === null) {
            $b = lc_input();
            $nome = trim((string) ($b['nome'] ?? ''));
            if ($nome === '' || mb_strlen($nome) > 120) lc_json(['error' => 'nome inválido'], 422);
            $u = $db->prepare("UPDATE labclock_grupos SET nome = :n WHERE id = :id");
            $u->execute([':n' => $nome, ':id' => $gid]);
            lc_audit('grupo.editar', 'grupo', $gid, ['slug' => $slug, 'nome_novo' => $nome]);
            lc_json(['ok' => true]);
        }

        // DELETE — remove grupo (cascade limpa M:N)
        if ($method === 'DELETE' && $acao === null) {
            $del = $db->prepare("DELETE FROM labclock_grupos WHERE id = :id");
            $del->execute([':id' => $gid]);
            lc_audit('grupo.deletar', 'grupo', $gid, ['slug' => $slug]);
            lc_json(['ok' => true]);
        }

        // POST acao=add — adiciona cronômetro ao grupo
        if ($method === 'POST' && $acao === 'add') {
            $b = lc_input();
            $cronSlug = trim((string) ($b['cronometro_slug'] ?? ''));
            if (!preg_match('/^[a-z0-9]{4,12}$/', $cronSlug)) lc_json(['error' => 'cronometro_slug inválido'], 422);

            $cs = $db->prepare("SELECT id FROM labclock_cronometros WHERE slug = :s");
            $cs->execute([':s' => $cronSlug]);
            $c = $cs->fetch();
            if (!$c) lc_json(['error' => 'cronômetro não encontrado'], 404);

            // ordem = max+10
            $maxOrdem = (int) $db->query("SELECT COALESCE(MAX(ordem), 0) FROM labclock_grupo_cronometros WHERE grupo_id = $gid")->fetchColumn();
            $novaOrdem = $maxOrdem + 10;

            try {
                $ins = $db->prepare("INSERT INTO labclock_grupo_cronometros (grupo_id, cronometro_id, ordem) VALUES (:g, :c, :o)");
                $ins->execute([':g' => $gid, ':c' => (int) $c['id'], ':o' => $novaOrdem]);
                lc_audit('grupo.add_cron', 'grupo', $gid, ['grupo_slug' => $slug, 'cronometro_slug' => $cronSlug, 'cronometro_id' => (int) $c['id']]);
                lc_json(['ok' => true, 'cronometro_slug' => $cronSlug, 'ordem' => $novaOrdem]);
            } catch (PDOException $e) {
                if (str_contains($e->getMessage(), 'Duplicate')) lc_json(['error' => 'cronômetro já está no grupo'], 409);
                throw $e;
            }
        }

        // DELETE acao=remove&cronometro_slug=Y
        if ($method === 'DELETE' && $acao === 'remove') {
            $cronSlug = trim((string) ($_GET['cronometro_slug'] ?? ''));
            if (!preg_match('/^[a-z0-9]{4,12}$/', $cronSlug)) lc_json(['error' => 'cronometro_slug inválido'], 422);
            $del = $db->prepare("DELETE gc FROM labclock_grupo_cronometros gc
                JOIN labclock_cronometros c ON c.id = gc.cronometro_id
                WHERE gc.grupo_id = :g AND c.slug = :s");
            $del->execute([':g' => $gid, ':s' => $cronSlug]);
            if ($del->rowCount() > 0) {
                lc_audit('grupo.remove_cron', 'grupo', $gid, ['grupo_slug' => $slug, 'cronometro_slug' => $cronSlug]);
            }
            lc_json(['ok' => true, 'affected' => $del->rowCount()]);
        }
    }

    lc_json(['error' => 'rota inválida'], 404);
} catch (Throwable $e) {
    error_log('[labclock-grupos] ' . $e->getMessage());
    lc_json(['error' => 'erro interno'], 500);
}
