<?php
/*
 * hpmaker 플랫폼 API — sjtiger.kr/hpmaker/platform/api.php?a=동작
 *
 *  공개(로그인 불필요)
 *    GET  a=list        상품 목록 (q 검색어, cat 분류, sort new|low|high|popular, cursor 다음 쪽)
 *    GET  a=item&id=    상품 상세
 *  로그인 필요 (Authorization: Bearer <Firebase ID 토큰>)
 *    GET  a=me                    내 정보와 처리할 주문 수
 *    POST a=nickname              별명 바꾸기 {nickname}
 *    POST a=create                상품 등록 (multipart: title, category, price, stock, description, image)
 *    POST a=update                상품 수정 (multipart: id, …, status on|hidden)
 *    POST a=delete                상품 삭제 {id} (주문이 있으면 숨김 처리)
 *    POST a=buy                   구매 신청 {id, qty, note}
 *    GET  a=orders&role=buyer|seller  주문 목록
 *    POST a=order                 주문 처리 {id, action ship|complete|cancel}
 *    GET  a=my_listings           내가 올린 상품
 */
require __DIR__ . '/inc/lib.php';

const PAGE_SIZE = 24;
const LIST_CACHE_TTL = 5;      // 목록은 5초 동안 같은 결과를 재사용 (상품이 바뀌면 즉시 새로 만듦)

$action = $_GET['a'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($action) {
        case 'list':        api_list(); break;
        case 'item':        api_item(); break;
        case 'me':          api_me(); break;
        case 'nickname':    need_post($method); api_nickname(); break;
        case 'create':      need_post($method); api_save_listing(false); break;
        case 'update':      need_post($method); api_save_listing(true); break;
        case 'delete':      need_post($method); api_delete(); break;
        case 'buy':         need_post($method); api_buy(); break;
        case 'orders':      api_orders(); break;
        case 'order':       need_post($method); api_order_action(); break;
        case 'my_listings': api_my_listings(); break;
        default:            pf_fail(404, '알 수 없는 요청입니다.');
    }
} catch (PDOException $e) {
    $db = pf_db();
    if ($db->inTransaction()) $db->rollBack();
    error_log('pf api: ' . $e->getMessage());
    pf_fail(500, '잠시 후 다시 시도해 주세요.');
}

function need_post($m) { if ($m !== 'POST') pf_fail(405, 'POST 로 요청해 주세요.'); }

function int_param($v, $min, $max) {
    if (!is_numeric($v) || (int) $v != $v) return null;
    $v = (int) $v;
    return ($v < $min || $v > $max) ? null : $v;
}

/** 판매자 번호로 별명을 한 번에 찾아 붙입니다. */
function attach_nicknames($rows) {
    $ids = array_values(array_unique(array_map(function ($r) { return (int) $r['seller_id']; }, $rows)));
    if (!$ids) return $rows;
    $st = pf_db()->prepare('SELECT id, nickname FROM pf_users WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $st->execute($ids);
    $names = [];
    foreach ($st->fetchAll() as $u) $names[(int) $u['id']] = $u['nickname'];
    foreach ($rows as &$r) $r['nickname'] = $names[(int) $r['seller_id']] ?? '';
    return $rows;
}

/** 목록 한 줄을 화면용으로 정리 */
function card_row($r) {
    return [
        'id' => (int) $r['id'],
        'title' => $r['title'],
        'category' => $r['category'],
        'price' => (int) $r['price'],
        'stock' => (int) $r['stock'],
        'status' => $r['status'],
        'image' => $r['image'],
        'sold' => (int) $r['sold_count'],
        'seller' => $r['nickname'],
        'created' => $r['created_at'],
    ];
}

/* ---------------- 목록 ----------------
 * 많은 상품이 쌓여도 빠르도록 "쪽 번호(OFFSET)" 대신 "마지막으로 본 상품 위치(커서)" 다음부터 읽습니다.
 * 정렬마다 맞춘 색인(schema.sql 의 ix_status_…)을 따라가므로 DB 가 표 전체를 훑지 않습니다.
 */
function api_list() {
    $q = trim((string) ($_GET['q'] ?? ''));
    $q = mb_substr($q, 0, 40);
    $cat = (string) ($_GET['cat'] ?? '');
    if ($cat !== '' && !in_array($cat, PF_CATEGORIES, true)) $cat = '';
    $sort = (string) ($_GET['sort'] ?? 'new');
    $orders = [
        'new' => ['col' => null, 'dir' => 'DESC'],
        'low' => ['col' => 'price', 'dir' => 'ASC'],
        'high' => ['col' => 'price', 'dir' => 'DESC'],
        'popular' => ['col' => 'sold_count', 'dir' => 'DESC'],
    ];
    if (!isset($orders[$sort])) $sort = 'new';
    $cursor = (string) ($_GET['cursor'] ?? '');

    $key = "list|$q|$cat|$sort|$cursor";
    $cached = pf_cache_get($key, LIST_CACHE_TTL);
    if ($cached !== null) pf_send_public_json($cached, LIST_CACHE_TTL);

    $where = ["l.status = 'on'"];
    $args = [];
    if ($cat !== '') { $where[] = 'l.category = ?'; $args[] = $cat; }
    if ($q !== '') {
        $where[] = 'l.title LIKE ?';
        $args[] = '%' . addcslashes($q, '%_\\') . '%';
    }

    $o = $orders[$sort];
    $cmp = $o['dir'] === 'DESC' ? '<' : '>';
    if ($cursor !== '') {
        $c = explode('_', $cursor);
        if ($o['col'] === null && count($c) === 1 && ctype_digit($c[0])) {
            $where[] = "l.id $cmp ?";
            $args[] = (int) $c[0];
        } elseif ($o['col'] !== null && count($c) === 2 && ctype_digit($c[0]) && ctype_digit($c[1])) {
            $where[] = "(l.{$o['col']} $cmp ? OR (l.{$o['col']} = ? AND l.id $cmp ?))";
            array_push($args, (int) $c[0], (int) $c[0], (int) $c[1]);
        }
    }
    $orderBy = $o['col'] === null ? "l.id {$o['dir']}" : "l.{$o['col']} {$o['dir']}, l.id {$o['dir']}";

    // 상품만 먼저 색인 순서대로 25개 읽고, 판매자 별명은 따로 붙입니다.
    // (회원 표와 한 번에 묶으면 DB 가 회원 표부터 읽어 색인을 못 쓰고 전체를 다시 정렬할 수 있습니다)
    $sql = 'SELECT l.id, l.seller_id, l.title, l.category, l.price, l.stock, l.status, l.image, l.sold_count, l.created_at
            FROM pf_listings l
            WHERE ' . implode(' AND ', $where) . " ORDER BY $orderBy LIMIT " . (PAGE_SIZE + 1);
    $st = pf_db()->prepare($sql);
    $st->execute($args);
    $rows = attach_nicknames($st->fetchAll());

    $next = null;
    if (count($rows) > PAGE_SIZE) {
        array_pop($rows);
        $last = end($rows);
        $next = $o['col'] === null ? (string) $last['id'] : $last[$o['col']] . '_' . $last['id'];
    }
    $json = json_encode(['ok' => true, 'items' => array_map('card_row', $rows), 'next' => $next], JSON_UNESCAPED_UNICODE);
    pf_cache_put($key, $json);
    pf_cache_gc();
    pf_send_public_json($json, LIST_CACHE_TTL);
}

/* ---------------- 상세 ---------------- */
function api_item() {
    $id = int_param($_GET['id'] ?? '', 1, PHP_INT_MAX);
    if (!$id) pf_fail(400, '상품 번호가 올바르지 않습니다.');

    $key = "item|$id";
    $json = pf_cache_get($key, LIST_CACHE_TTL);
    if ($json === null) {
        $st = pf_db()->prepare(
            'SELECT l.*, u.nickname,
                    (SELECT COUNT(*) FROM pf_orders o WHERE o.seller_id = l.seller_id AND o.status = \'completed\') AS seller_deals
             FROM pf_listings l JOIN pf_users u ON u.id = l.seller_id WHERE l.id = ?');
        $st->execute([$id]);
        $r = $st->fetch();
        if (!$r) pf_fail(404, '상품을 찾을 수 없습니다.');
        $item = card_row($r) + [
            'description' => $r['description'],
            'seller_id' => (int) $r['seller_id'],
            'seller_deals' => (int) $r['seller_deals'],
        ];
        $json = json_encode(['ok' => true, 'item' => $item], JSON_UNESCAPED_UNICODE);
        pf_cache_put($key, $json);
    }
    $data = json_decode($json, true);
    if ($data['item']['status'] === 'hidden') {
        // 숨긴 상품은 판매자 본인만 볼 수 있습니다.
        $me = pf_current_user(false);
        if (!$me || $me['id'] !== $data['item']['seller_id']) pf_fail(404, '상품을 찾을 수 없습니다.');
        pf_send(200, $json, ['Cache-Control: no-store']);
    }
    pf_send_public_json($json, LIST_CACHE_TTL);
}

/* ---------------- 내 정보 ---------------- */
function api_me() {
    $me = pf_current_user();
    $st = pf_db()->prepare(
        "SELECT
            (SELECT COUNT(*) FROM pf_orders WHERE seller_id = ? AND status = 'requested') AS to_ship,
            (SELECT COUNT(*) FROM pf_orders WHERE buyer_id = ? AND status = 'shipped')   AS to_confirm");
    $st->execute([$me['id'], $me['id']]);
    $c = $st->fetch();
    pf_send(200, ['ok' => true, 'me' => $me + ['to_ship' => (int) $c['to_ship'], 'to_confirm' => (int) $c['to_confirm']]],
        ['Cache-Control: no-store']);
}

function api_nickname() {
    $me = pf_current_user();
    $nick = trim((string) (pf_input()['nickname'] ?? ''));
    if (!preg_match('/^[\p{L}\p{N}_]{2,20}$/u', $nick)) pf_fail(400, '별명은 한글·영문·숫자 2~20자로 정해 주세요.');
    try {
        pf_db()->prepare('UPDATE pf_users SET nickname = ? WHERE id = ?')->execute([$nick, $me['id']]);
    } catch (PDOException $e) {
        if ($e->errorInfo[1] == 1062) pf_fail(409, '이미 쓰고 있는 별명입니다.');
        throw $e;
    }
    pf_bump_version();
    pf_send(200, ['ok' => true, 'nickname' => $nick]);
}

/* ---------------- 이미지 저장 ----------------
 * 그림 파일인지 실제 내용으로 확인하고, 이름은 무작위로 새로 붙입니다.
 * 서버에 GD 가 있으면 긴 변을 1200px 로 줄여 저장해 화면이 더 빨리 뜹니다.
 */
function save_image($f) {
    if (!isset($f['error']) || $f['error'] === UPLOAD_ERR_NO_FILE) return null;
    if ($f['error'] !== UPLOAD_ERR_OK) pf_fail(400, '사진을 올리지 못했습니다. (5MB 이하로 올려 주세요)');
    if ($f['size'] > 5 * 1024 * 1024) pf_fail(400, '사진은 5MB 이하로 올려 주세요.');
    $info = @getimagesize($f['tmp_name']);
    $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
    if (!$info || !isset($types[$info[2]])) pf_fail(400, 'JPG·PNG·WEBP 사진만 올릴 수 있습니다.');
    if ($info[0] > 8000 || $info[1] > 8000) pf_fail(400, '사진 크기가 너무 큽니다.');

    $sub = date('Y/m');
    $dir = PF_UPLOAD_DIR . '/' . $sub;
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) pf_fail(500, '사진 저장 폴더를 만들 수 없습니다.');
    $name = bin2hex(random_bytes(12));

    if (function_exists('imagecreatetruecolor') && function_exists('imagejpeg')) {
        $src = null;
        if ($info[2] === IMAGETYPE_JPEG && function_exists('imagecreatefromjpeg')) $src = @imagecreatefromjpeg($f['tmp_name']);
        if ($info[2] === IMAGETYPE_PNG && function_exists('imagecreatefrompng')) $src = @imagecreatefrompng($f['tmp_name']);
        if ($info[2] === IMAGETYPE_WEBP && function_exists('imagecreatefromwebp')) $src = @imagecreatefromwebp($f['tmp_name']);
        if ($src) {
            [$w, $h] = [$info[0], $info[1]];
            $scale = min(1, 1200 / max($w, $h));
            $nw = max(1, (int) round($w * $scale));
            $nh = max(1, (int) round($h * $scale));
            $dst = imagecreatetruecolor($nw, $nh);
            imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));   // 투명 배경은 흰색으로
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
            $path = "$dir/$name.jpg";
            imagejpeg($dst, $path, 82);
            imagedestroy($src);
            imagedestroy($dst);
            return "uploads/$sub/$name.jpg";
        }
    }
    $ext = $types[$info[2]];
    if (!move_uploaded_file($f['tmp_name'], "$dir/$name.$ext")) pf_fail(500, '사진을 저장하지 못했습니다.');
    return "uploads/$sub/$name.$ext";
}

function remove_image($rel) {
    if ($rel && preg_match('#^uploads/\d{4}/\d{2}/[a-f0-9]{24}\.(jpg|png|webp)$#', $rel)) {
        @unlink(__DIR__ . '/' . $rel);
    }
}

/* ---------------- 상품 등록·수정 ---------------- */
function api_save_listing($isUpdate) {
    $me = pf_current_user();
    $db = pf_db();
    $p = $_POST;

    $existing = null;
    if ($isUpdate) {
        $id = int_param($p['id'] ?? '', 1, PHP_INT_MAX);
        $st = $db->prepare('SELECT * FROM pf_listings WHERE id = ?');
        $st->execute([$id ?: 0]);
        $existing = $st->fetch();
        if (!$existing || (int) $existing['seller_id'] !== $me['id']) pf_fail(404, '내 상품만 고칠 수 있습니다.');
    } else {
        // 짧은 시간에 너무 많이 올리는 것(도배)을 막습니다.
        $st = $db->prepare('SELECT COUNT(*) FROM pf_listings WHERE seller_id = ? AND created_at > NOW() - INTERVAL 1 HOUR');
        $st->execute([$me['id']]);
        if ((int) $st->fetchColumn() >= 20) pf_fail(429, '한 시간에 20개까지 올릴 수 있습니다. 잠시 후 다시 시도해 주세요.');
    }

    $title = trim((string) ($p['title'] ?? ''));
    $desc = trim((string) ($p['description'] ?? ''));
    $cat = (string) ($p['category'] ?? '');
    $price = int_param($p['price'] ?? '', 0, 100000000);
    $stock = int_param($p['stock'] ?? '', 0, 99999);
    if (mb_strlen($title) < 2 || mb_strlen($title) > 100) pf_fail(400, '상품명은 2~100자로 적어 주세요.');
    if (mb_strlen($desc) > 5000) pf_fail(400, '설명은 5,000자까지 적을 수 있습니다.');
    if (!in_array($cat, PF_CATEGORIES, true)) pf_fail(400, '분류를 골라 주세요.');
    if ($price === null) pf_fail(400, '가격은 0원 ~ 1억 원 사이 숫자로 적어 주세요.');
    if ($stock === null || (!$isUpdate && $stock < 1)) pf_fail(400, '수량을 1개 이상으로 적어 주세요.');

    $image = save_image($_FILES['image'] ?? []);

    if (!$isUpdate) {
        $db->prepare('INSERT INTO pf_listings (seller_id, title, description, category, price, stock, image) VALUES (?,?,?,?,?,?,?)')
           ->execute([$me['id'], $title, $desc, $cat, $price, $stock, $image ?? '']);
        $id = (int) $db->lastInsertId();
    } else {
        $id = (int) $existing['id'];
        $want = (string) ($p['status'] ?? '');
        $status = $want === 'hidden' ? 'hidden' : ($stock > 0 ? 'on' : 'sold');
        $db->prepare('UPDATE pf_listings SET title=?, description=?, category=?, price=?, stock=?, status=?, image=? WHERE id=?')
           ->execute([$title, $desc, $cat, $price, $stock, $status, $image ?? $existing['image'], $id]);
        if ($image && $existing['image'] !== $image) remove_image($existing['image']);
    }
    pf_bump_version();
    pf_send(200, ['ok' => true, 'id' => $id]);
}

function api_delete() {
    $me = pf_current_user();
    $db = pf_db();
    $id = int_param(pf_input()['id'] ?? '', 1, PHP_INT_MAX);
    $st = $db->prepare('SELECT id, seller_id, image, (SELECT COUNT(*) FROM pf_orders WHERE listing_id = pf_listings.id) AS n FROM pf_listings WHERE id = ?');
    $st->execute([$id ?: 0]);
    $l = $st->fetch();
    if (!$l || (int) $l['seller_id'] !== $me['id']) pf_fail(404, '내 상품만 지울 수 있습니다.');
    if ((int) $l['n'] > 0) {
        // 거래 기록이 남아 있는 상품은 지우지 않고 숨깁니다.
        $db->prepare("UPDATE pf_listings SET status = 'hidden' WHERE id = ?")->execute([$id]);
        $result = 'hidden';
    } else {
        $db->prepare('DELETE FROM pf_listings WHERE id = ?')->execute([$id]);
        remove_image($l['image']);
        $result = 'deleted';
    }
    pf_bump_version();
    pf_send(200, ['ok' => true, 'result' => $result]);
}

/* ---------------- 구매 ----------------
 * 여러 사람이 마지막 1개를 동시에 눌러도 한 명만 성공하도록,
 * "재고가 충분할 때만 줄인다"를 UPDATE 한 문장으로 처리합니다(행 잠금). 실패한 사람에게는 품절을 알립니다.
 */
function api_buy() {
    $me = pf_current_user();
    $in = pf_input();
    $id = int_param($in['id'] ?? '', 1, PHP_INT_MAX);
    $qty = int_param($in['qty'] ?? 1, 1, 999);
    $note = trim((string) ($in['note'] ?? ''));
    if (!$id || !$qty) pf_fail(400, '수량을 확인해 주세요.');
    if (mb_strlen($note) > 300) pf_fail(400, '메모는 300자까지 적을 수 있습니다.');

    $db = pf_db();
    $db->beginTransaction();
    $up = $db->prepare(
        "UPDATE pf_listings
            SET stock = stock - ?, sold_count = sold_count + ?, status = IF(stock = 0, 'sold', status)
          WHERE id = ? AND status = 'on' AND stock >= ? AND seller_id <> ?");
    $up->execute([$qty, $qty, $id, $qty, $me['id']]);
    if ($up->rowCount() !== 1) {
        $db->rollBack();
        $st = $db->prepare('SELECT seller_id, stock, status FROM pf_listings WHERE id = ?');
        $st->execute([$id]);
        $l = $st->fetch();
        if (!$l || $l['status'] === 'hidden') pf_fail(404, '판매가 끝난 상품입니다.');
        if ((int) $l['seller_id'] === $me['id']) pf_fail(400, '내가 올린 상품은 살 수 없습니다.');
        if ((int) $l['stock'] === 0) pf_fail(409, '방금 다른 분이 구매해 품절되었습니다.');
        pf_fail(409, '남은 수량은 ' . (int) $l['stock'] . '개입니다.');
    }
    $st = $db->prepare('SELECT seller_id, title, price FROM pf_listings WHERE id = ?');
    $st->execute([$id]);
    $l = $st->fetch();
    $db->prepare('INSERT INTO pf_orders (listing_id, buyer_id, seller_id, title, qty, unit_price, total, buyer_note) VALUES (?,?,?,?,?,?,?,?)')
       ->execute([$id, $me['id'], $l['seller_id'], $l['title'], $qty, $l['price'], $qty * (int) $l['price'], $note]);
    $orderId = (int) $db->lastInsertId();
    $db->commit();
    pf_bump_version();
    pf_send(200, ['ok' => true, 'order_id' => $orderId]);
}

/* ---------------- 주문 목록 ---------------- */
function api_orders() {
    $me = pf_current_user();
    $role = ($_GET['role'] ?? '') === 'seller' ? 'seller' : 'buyer';
    $cursor = int_param($_GET['cursor'] ?? '', 1, PHP_INT_MAX);
    $other = $role === 'seller' ? 'buyer_id' : 'seller_id';
    $sql = "SELECT o.id, o.listing_id, o.title, o.qty, o.unit_price, o.total, o.status, o.buyer_note, o.created_at, o.updated_at,
                   u.nickname AS partner, l.image, l.category
            FROM pf_orders o
            JOIN pf_users u ON u.id = o.$other
            JOIN pf_listings l ON l.id = o.listing_id
            WHERE o.{$role}_id = ?" . ($cursor ? ' AND o.id < ?' : '') . ' ORDER BY o.id DESC LIMIT ' . (PAGE_SIZE + 1);
    $st = pf_db()->prepare($sql);
    $st->execute($cursor ? [$me['id'], $cursor] : [$me['id']]);
    $rows = $st->fetchAll();
    $next = null;
    if (count($rows) > PAGE_SIZE) { array_pop($rows); $next = (string) end($rows)['id']; }
    foreach ($rows as &$r) {
        foreach (['id', 'listing_id', 'qty', 'unit_price', 'total'] as $k) $r[$k] = (int) $r[$k];
    }
    pf_send(200, ['ok' => true, 'role' => $role, 'items' => $rows, 'next' => $next], ['Cache-Control: no-store']);
}

/* ---------------- 주문 처리 ----------------
 *  판매자: 구매 신청 → 발송 완료(ship)
 *  구매자: 발송 완료 → 거래 완료(complete)
 *  둘 다: 구매 신청 단계에서만 취소(cancel) 가능, 취소하면 재고를 되돌립니다.
 */
function api_order_action() {
    $me = pf_current_user();
    $in = pf_input();
    $id = int_param($in['id'] ?? '', 1, PHP_INT_MAX);
    $action = (string) ($in['action'] ?? '');
    $db = pf_db();
    $db->beginTransaction();
    $st = $db->prepare('SELECT * FROM pf_orders WHERE id = ? FOR UPDATE');
    $st->execute([$id ?: 0]);
    $o = $st->fetch();
    if (!$o || ((int) $o['buyer_id'] !== $me['id'] && (int) $o['seller_id'] !== $me['id'])) {
        $db->rollBack();
        pf_fail(404, '주문을 찾을 수 없습니다.');
    }
    $isSeller = (int) $o['seller_id'] === $me['id'];
    $isBuyer = (int) $o['buyer_id'] === $me['id'];

    if ($action === 'ship' && $isSeller && $o['status'] === 'requested') {
        $new = 'shipped';
    } elseif ($action === 'complete' && $isBuyer && $o['status'] === 'shipped') {
        $new = 'completed';
    } elseif ($action === 'cancel' && $o['status'] === 'requested') {
        $new = 'cancelled';
        $db->prepare(
            "UPDATE pf_listings SET stock = stock + ?, sold_count = GREATEST(sold_count, ?) - ?,
                    status = IF(status = 'sold', 'on', status)
              WHERE id = ?")->execute([$o['qty'], $o['qty'], $o['qty'], $o['listing_id']]);
    } else {
        $db->rollBack();
        pf_fail(409, '지금 상태에서는 할 수 없는 처리입니다. 화면을 새로고침해 주세요.');
    }
    $db->prepare('UPDATE pf_orders SET status = ? WHERE id = ?')->execute([$new, $o['id']]);
    $db->commit();
    pf_bump_version();
    pf_send(200, ['ok' => true, 'status' => $new]);
}

/* ---------------- 내 상품 ---------------- */
function api_my_listings() {
    $me = pf_current_user();
    $st = pf_db()->prepare(
        'SELECT l.id, l.title, l.category, l.price, l.stock, l.status, l.image, l.sold_count, l.created_at, ? AS nickname
         FROM pf_listings l WHERE l.seller_id = ? ORDER BY l.id DESC LIMIT 200');
    $st->execute([$me['nickname'], $me['id']]);
    pf_send(200, ['ok' => true, 'items' => array_map('card_row', $st->fetchAll())], ['Cache-Control: no-store']);
}
