<?php
// LabClock — helpers compartilhados pelos endpoints.

declare(strict_types=1);

// Envia resposta JSON e encerra. Single-exit point dos handlers.
function lc_json($data, int $code = 200): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Slug de 8 chars sem caracteres confusos (0/O, 1/I/l). ~10^11 combinações.
function lc_gerar_slug(): string {
    $chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    $len   = strlen($chars);
    $s = '';
    for ($i = 0; $i < 8; $i++) {
        $s .= $chars[random_int(0, $len - 1)];
    }
    return $s;
}

// Lê body JSON do request. Devolve array vazio se body ausente/inválido.
function lc_input(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

// Timestamp atual em milissegundos (referência única do servidor).
function lc_now_ms(): int {
    return (int) (microtime(true) * 1000);
}

// Estado canônico do cronômetro pra retorno na API.
function lc_cron_to_array(array $c): array {
    return [
        'slug'                => $c['slug'],
        'nome'                => $c['nome'],
        'duracao_ms'          => (int) $c['duracao_ms'],
        'status'              => $c['status'],
        'started_at_ms'       => $c['started_at_ms'] !== null ? (int) $c['started_at_ms'] : null,
        'paused_remaining_ms' => $c['paused_remaining_ms'] !== null ? (int) $c['paused_remaining_ms'] : null,
    ];
}
