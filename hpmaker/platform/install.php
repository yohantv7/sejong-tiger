<?php
/*
 * 처음 한 번만 실행하는 설치 파일: 가비아 MySQL 에 플랫폼 테이블(pf_users, pf_listings, pf_orders)을 만듭니다.
 *   https://sjtiger.kr/hpmaker/platform/install.php?key=config.php에_적은_INSTALL_KEY
 * 이미 테이블이 있으면 건드리지 않으므로 여러 번 실행해도 안전합니다. 설치가 끝나면 이 파일은 지워도 됩니다.
 */
require __DIR__ . '/inc/lib.php';
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

$cfg = pf_config();
$key = (string) ($_GET['key'] ?? '');
if (empty($cfg['INSTALL_KEY']) || strpos($cfg['INSTALL_KEY'], '여기에') === 0 || !hash_equals($cfg['INSTALL_KEY'], $key)) {
    http_response_code(403);
    exit("설치 키가 맞지 않습니다. config.php 의 INSTALL_KEY 값을 주소 뒤 ?key= 에 붙여 주세요.\n");
}

$sql = file_get_contents(__DIR__ . '/sql/schema.sql');
$sql = preg_replace('/^\s*--.*$/m', '', $sql);
$db = pf_db();
$done = 0;
foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
    $db->exec($stmt);
    $done++;
}
foreach (['cache', 'uploads'] as $d) {
    $p = __DIR__ . '/' . $d;
    if (!is_dir($p)) @mkdir($p, 0755, true);
    echo $d . ' 폴더 쓰기: ' . (is_writable($p) ? '가능' : '불가 — FileZilla 에서 폴더 권한을 755(안 되면 707)로 바꿔 주세요') . "\n";
}
echo "MySQL 버전: " . $db->query('SELECT VERSION()')->fetchColumn() . "\n";
echo "GD(사진 줄이기): " . (function_exists('imagecreatetruecolor') ? '있음' : '없음 — 사진을 원본 그대로 저장합니다') . "\n";
echo "테이블 준비 완료 ($done 개 명령 실행). 이제 https://sjtiger.kr/hpmaker/platform/ 에 접속해 보세요.\n";
