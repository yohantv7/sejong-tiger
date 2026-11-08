<?php
/*
 * hpmaker 플랫폼 공통 함수: 설정, DB 연결, JSON 응답, Firebase 로그인 확인, 빠른 응답용 캐시
 * 가비아 웹호스팅(Apache + PHP + MySQL) 환경을 기준으로 작성했습니다.
 */

// PHP 경고·안내 문구가 화면으로 나가면 JSON 응답이 깨지므로, 화면에는 내보내지 않고 서버 기록에만 남깁니다.
@ini_set('display_errors', '0');
@ini_set('log_errors', '1');

const PF_CATEGORIES = ['design', 'web', 'ai', 'doc', 'digital', 'used', 'etc'];
const PF_CACHE_DIR = __DIR__ . '/../cache';
const PF_UPLOAD_DIR = __DIR__ . '/../uploads';

function pf_config() {
    static $cfg = null;
    if ($cfg === null) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) pf_fail(500, 'config.php 가 없습니다. inc/config.sample.php 를 복사해 만들어 주세요.');
        $cfg = require $file;
    }
    return $cfg;
}

/** DB 연결 (요청 하나에서 한 번만 연결) */
function pf_db() {
    static $pdo = null;
    if ($pdo === null) {
        $c = pf_config();
        try {
            $pdo = new PDO(
                'mysql:host=' . $c['DB_HOST'] . ';dbname=' . $c['DB_NAME'] . ';charset=utf8mb4',
                $c['DB_USER'], $c['DB_PASS'],
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::ATTR_STRINGIFY_FETCHES => false,
                ]
            );
            // DB 시간을 한국 시간(+09:00)으로 맞춥니다.
            $pdo->exec("SET time_zone = '+09:00'");
        } catch (PDOException $e) {
            error_log('pf db connect: ' . $e->getMessage());
            pf_fail(503, '데이터베이스에 연결할 수 없습니다.');
        }
    }
    return $pdo;
}

function pf_send($status, $body, $extraHeaders = []) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    foreach ($extraHeaders as $h) header($h);
    echo is_string($body) ? $body : json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function pf_fail($status, $message) {
    pf_send($status, ['ok' => false, 'error' => $message], ['Cache-Control: no-store']);
}

/** 요청 본문(JSON) 읽기 */
function pf_input() {
    static $in = null;
    if ($in === null) {
        $raw = file_get_contents('php://input');
        $in = $raw ? json_decode($raw, true) : [];
        if (!is_array($in)) $in = [];
    }
    return $in;
}

/* ---------------- 파일 캐시 ----------------
 * 목록·상세처럼 여러 사람이 똑같이 보는 결과는 잠깐 파일로 저장해 두고 DB 를 다시 부르지 않습니다.
 * 상품이나 주문이 바뀌면 "버전" 숫자를 올려 예전 캐시를 한꺼번에 무효로 만듭니다.
 */
function pf_cache_path($name) {
    if (!is_dir(PF_CACHE_DIR)) @mkdir(PF_CACHE_DIR, 0755, true);
    return PF_CACHE_DIR . '/' . preg_replace('/[^A-Za-z0-9._-]/', '_', $name);
}
function pf_data_version() {
    $p = pf_cache_path('_version');
    return is_file($p) ? trim((string) @file_get_contents($p)) : '0';
}
function pf_bump_version() {
    @file_put_contents(pf_cache_path('_version'), (string) (microtime(true) * 1000), LOCK_EX);
}
function pf_cache_get($key, $ttl) {
    $p = pf_cache_path('q_' . md5($key . '|' . pf_data_version()));
    if (is_file($p) && (time() - filemtime($p)) < $ttl) {
        $v = @file_get_contents($p);
        if ($v !== false && $v !== '') return $v;
    }
    return null;
}
function pf_cache_put($key, $json) {
    @file_put_contents(pf_cache_path('q_' . md5($key . '|' . pf_data_version())), $json, LOCK_EX);
}
/** 오래된 캐시 파일 정리 (가끔 한 번씩) */
function pf_cache_gc() {
    if (mt_rand(1, 200) !== 1) return;
    foreach (glob(PF_CACHE_DIR . '/q_*') ?: [] as $f) {
        if (time() - @filemtime($f) > 600) @unlink($f);
    }
}

/** 공개 JSON 을 ETag 와 함께 보냅니다. 내용이 같으면 304 로 본문 없이 응답해 더 빠릅니다. */
function pf_send_public_json($json, $maxAge = 5) {
    $etag = '"p2-' . md5($json) . '"';   // p2: PHP 8.5 수정 이후 버전 (예전에 저장된 응답을 다시 쓰지 않도록)
    header('ETag: ' . $etag);
    header('Cache-Control: public, max-age=' . $maxAge);
    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
        http_response_code(304);
        exit;
    }
    pf_send(200, $json);
}

/* ---------------- HTTP ---------------- */
function pf_http_get($url) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_HEADER => true,
        ]);
        $res = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $hsize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        if ($res === false) return [0, '', ''];
        return [$code, substr($res, $hsize), substr($res, 0, $hsize)];
    }
    $ctx = stream_context_create(['http' => ['timeout' => 10, 'ignore_errors' => true]]);
    $body = @file_get_contents($url, false, $ctx);
    $headers = isset($http_response_header) ? implode("\n", $http_response_header) : '';
    return [$body === false ? 0 : 200, (string) $body, $headers];
}

/* ---------------- Firebase 로그인 확인 ----------------
 * 화면에서 받은 Firebase ID 토큰(JWT)의 서명을 구글 공개 인증서로 확인합니다.
 * 세종호랑이와 같은 계정으로 로그인하므로 회원가입을 따로 받지 않습니다.
 */
function pf_b64url_decode($s) {
    $s = strtr($s, '-_', '+/');
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    return base64_decode($s, true);
}

function pf_google_certs() {
    $p = pf_cache_path('_firebase_certs.json');
    if (is_file($p)) {
        $c = json_decode((string) @file_get_contents($p), true);
        if (is_array($c) && isset($c['exp'], $c['keys']) && $c['exp'] > time()) return $c['keys'];
    }
    [$code, $body, $headers] = pf_http_get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    $keys = $code === 200 ? json_decode($body, true) : null;
    if (!is_array($keys) || !$keys) pf_fail(503, '로그인 확인 서버에 연결할 수 없습니다.');
    $ttl = 3600;
    if (preg_match('/max-age=(\d+)/i', $headers, $m)) $ttl = max(300, (int) $m[1]);
    @file_put_contents($p, json_encode(['exp' => time() + $ttl, 'keys' => $keys]), LOCK_EX);
    return $keys;
}

/** 토큰이 올바르면 Firebase 사용자 정보(uid, email) 를, 아니면 null 을 돌려줍니다. */
function pf_verify_firebase_token($jwt) {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) return null;
    $header = json_decode((string) pf_b64url_decode($parts[0]), true);
    $payload = json_decode((string) pf_b64url_decode($parts[1]), true);
    $sig = pf_b64url_decode($parts[2]);
    if (!is_array($header) || !is_array($payload) || $sig === false) return null;
    if (($header['alg'] ?? '') !== 'RS256' || empty($header['kid'])) return null;

    $keys = pf_google_certs();
    $cert = $keys[$header['kid']] ?? null;
    if (!$cert) return null;
    if (openssl_verify($parts[0] . '.' . $parts[1], $sig, $cert, OPENSSL_ALGO_SHA256) !== 1) return null;

    $pid = pf_config()['FIREBASE_PROJECT_ID'];
    $now = time();
    if (($payload['aud'] ?? '') !== $pid) return null;
    if (($payload['iss'] ?? '') !== 'https://securetoken.google.com/' . $pid) return null;
    if (empty($payload['sub']) || !is_string($payload['sub']) || strlen($payload['sub']) > 128) return null;
    if (($payload['exp'] ?? 0) < $now) return null;
    if (($payload['iat'] ?? PHP_INT_MAX) > $now + 300) return null;
    return ['uid' => $payload['sub'], 'email' => (string) ($payload['email'] ?? '')];
}

/** 로그인한 사용자를 플랫폼 회원으로 가져옵니다(처음이면 자동 등록). 로그인이 필요 없으면 $required=false */
function pf_current_user($required = true) {
    static $user = false;
    if ($user !== false) return $user;
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$auth && function_exists('apache_request_headers')) {
        $h = array_change_key_case(apache_request_headers(), CASE_LOWER);
        $auth = $h['authorization'] ?? '';
    }
    $fb = null;
    if (preg_match('/^Bearer\s+(\S+)$/', $auth, $m)) $fb = pf_verify_firebase_token($m[1]);
    if (!$fb) {
        if ($required) pf_fail(401, '로그인이 필요합니다.');
        return $user = null;
    }

    $db = pf_db();
    $st = $db->prepare('SELECT id, nickname, email FROM pf_users WHERE firebase_uid = ?');
    $st->execute([$fb['uid']]);
    $row = $st->fetch();
    if (!$row) {
        // 처음 들어온 회원: 이메일 앞부분으로 별명을 만들고, 겹치면 숫자를 붙입니다.
        $base = preg_replace('/[^\p{L}\p{N}_]/u', '', explode('@', $fb['email'])[0]) ?: '회원';
        $base = mb_substr($base, 0, 20);
        for ($i = 0; $i < 20; $i++) {
            $nick = $i === 0 ? $base : $base . mt_rand(100, 9999);
            try {
                $db->prepare('INSERT INTO pf_users (firebase_uid, email, nickname) VALUES (?, ?, ?)')
                   ->execute([$fb['uid'], $fb['email'], $nick]);
                break;
            } catch (PDOException $e) {
                if ($e->errorInfo[1] != 1062) throw $e;           // 1062 = 중복
                $st->execute([$fb['uid']]);
                if ($st->fetch()) break;                          // 같은 사람이 동시에 두 번 요청한 경우
            }
        }
        $st->execute([$fb['uid']]);
        $row = $st->fetch();
    }
    return $user = ['id' => (int) $row['id'], 'nickname' => $row['nickname'], 'email' => $row['email']];
}
