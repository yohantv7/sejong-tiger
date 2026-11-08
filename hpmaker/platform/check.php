<?php
/*
 * 점검용 파일: 서버에 올라간 파일이 최신인지 확인하고, PHP 가 기억해 둔(OPcache) 예전 파일을 비웁니다.
 *   https://sjtiger.kr/hpmaker/platform/check.php?key=config.php에_적은_INSTALL_KEY
 * 확인이 끝나면 지워도 됩니다.
 */
@ini_set('display_errors', '0');
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

$cfgFile = __DIR__ . '/inc/config.php';
$cfg = is_file($cfgFile) ? require $cfgFile : [];
$key = (string) ($_GET['key'] ?? '');
if (empty($cfg['INSTALL_KEY']) || !hash_equals((string) $cfg['INSTALL_KEY'], $key)) {
    http_response_code(403);
    exit("키가 맞지 않습니다. 주소 뒤에 ?key=INSTALL_KEY값 을 붙여 주세요.\n");
}

echo "PHP 버전: " . PHP_VERSION . "\n\n";
foreach (['api.php', 'inc/lib.php', 'install.php'] as $f) {
    $p = __DIR__ . '/' . $f;
    if (!is_file($p)) { echo "$f: 없음\n"; continue; }
    $src = file_get_contents($p);
    $old = strpos($src, 'MYSQL_ATTR_INIT_COMMAND') !== false || strpos($src, 'curl_close(') !== false || strpos($src, 'imagedestroy(') !== false;
    echo "$f: " . filesize($p) . " 바이트, 수정 " . date('Y-m-d H:i:s', filemtime($p)) . ' → ' . ($old ? '예전 파일입니다. 다시 올려 주세요.' : '최신') . "\n";
}

echo "\n";
if (function_exists('opcache_get_status')) {
    $st = @opcache_get_status(false);
    echo 'OPcache: ' . ($st && !empty($st['opcache_enabled']) ? '켜짐' : '꺼짐') . "\n";
    $done = 0;
    foreach (['api.php', 'inc/lib.php'] as $f) {
        if (function_exists('opcache_invalidate') && @opcache_invalidate(__DIR__ . '/' . $f, true)) $done++;
    }
    echo "기억된 예전 파일 비우기: {$done}개 처리\n";
} else {
    echo "OPcache: 없음\n";
}
echo "\n이제 플랫폼 화면을 새로고침해 보세요.\n";
