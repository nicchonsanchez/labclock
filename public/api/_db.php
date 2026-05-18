<?php
// LabClock — conexão PDO ao niccho25_app_nicchon.

declare(strict_types=1);

function lc_config(): array {
    static $cfg = null;
    if ($cfg === null) {
        $path = __DIR__ . '/_config.php';
        if (!is_file($path)) {
            http_response_code(500);
            exit('LabClock: _config.php ausente. Rodar pelo deploy.');
        }
        $cfg = require $path;
    }
    return $cfg;
}

function lc_db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $c = lc_config()['db'];
        $pdo = new PDO(
            "mysql:host={$c['host']};dbname={$c['name']};charset=utf8mb4",
            $c['user'],
            $c['pass'],
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
    }
    return $pdo;
}
