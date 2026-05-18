<?php
// LabClock — audit log (Fase 6).
//
// Append-only. Falha silenciosa: erro de audit nunca quebra a request principal.
// Snapshot de usuario_email (não só FK) pra log sobreviver a delete do user.

declare(strict_types=1);

require_once __DIR__ . '/_db.php';
require_once __DIR__ . '/_auth.php';

/**
 * Registra uma ação no audit log.
 *
 * @param string      $acao         Ex: 'cronometro.start', 'login.success', 'grupo.criar'
 * @param string|null $entidadeTipo Ex: 'cronometro', 'grupo', 'usuario', 'sala', null
 * @param int|null    $entidadeId   ID da entidade afetada (NULL pra ações sem entidade)
 * @param array|null  $detalhes     JSON snapshot de campos relevantes (nome, slug, etc.)
 */
function lc_audit(string $acao, ?string $entidadeTipo = null, ?int $entidadeId = null, ?array $detalhes = null): void {
    try {
        $u = lc_user();
        $stmt = lc_db()->prepare(
            "INSERT INTO labclock_audit_log
                (usuario_id, usuario_email, acao, entidade_tipo, entidade_id, detalhes, ip, user_agent, created_at)
             VALUES (:uid, :uemail, :acao, :et, :eid, :det, :ip, :ua, NOW())"
        );
        $stmt->execute([
            ':uid'    => $u['id'] ?? null,
            ':uemail' => $u['email'] ?? null,
            ':acao'   => $acao,
            ':et'     => $entidadeTipo,
            ':eid'    => $entidadeId,
            ':det'    => $detalhes !== null ? json_encode($detalhes, JSON_UNESCAPED_UNICODE) : null,
            ':ip'     => lc_audit_ip(),
            ':ua'     => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
        ]);
    } catch (\Throwable $e) {
        // Audit nunca pode quebrar request principal.
        error_log('[labclock audit] ' . $e->getMessage());
    }
}

/** IP do cliente, considerando proxy reverso quando aplicável. */
function lc_audit_ip(): ?string {
    // Hostgator não tem proxy reverso confiável — REMOTE_ADDR é o IP real.
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    return $ip ? substr($ip, 0, 45) : null;
}

/**
 * Lista entries do audit log com filtros.
 * Só pra uso de admin (endpoint deve validar permissão antes).
 */
function lc_audit_listar(array $filtros = [], int $limit = 100, int $offset = 0): array {
    $where = [];
    $params = [];
    if (!empty($filtros['usuario_id'])) {
        $where[] = 'usuario_id = :uid';
        $params[':uid'] = (int) $filtros['usuario_id'];
    }
    if (!empty($filtros['acao'])) {
        $where[] = 'acao = :acao';
        $params[':acao'] = (string) $filtros['acao'];
    }
    if (!empty($filtros['desde'])) {
        $where[] = 'created_at >= :desde';
        $params[':desde'] = (string) $filtros['desde'] . ' 00:00:00';
    }
    if (!empty($filtros['ate'])) {
        $where[] = 'created_at <= :ate';
        $params[':ate'] = (string) $filtros['ate'] . ' 23:59:59';
    }
    $sqlWhere = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
    $limit = max(1, min(500, $limit));
    $offset = max(0, $offset);

    $sql = "SELECT id, usuario_id, usuario_email, acao, entidade_tipo, entidade_id,
                   detalhes, ip, user_agent, created_at
            FROM labclock_audit_log
            $sqlWhere
            ORDER BY id DESC
            LIMIT $limit OFFSET $offset";
    $stmt = lc_db()->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    // Decodifica detalhes JSON pro client receber objeto.
    foreach ($rows as &$r) {
        if ($r['detalhes']) $r['detalhes'] = json_decode($r['detalhes'], true);
    }
    unset($r);

    $stmtC = lc_db()->prepare("SELECT COUNT(*) FROM labclock_audit_log $sqlWhere");
    $stmtC->execute($params);
    $total = (int) $stmtC->fetchColumn();

    return ['entries' => $rows, 'total' => $total, 'limit' => $limit, 'offset' => $offset];
}

/** Lista de ações distintas (pra dropdown de filtro). */
function lc_audit_acoes(): array {
    $stmt = lc_db()->query("SELECT DISTINCT acao FROM labclock_audit_log ORDER BY acao");
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}
