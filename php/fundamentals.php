<?php
/*
 * /api/fundamentals?symbol=NASDAQ:GOOGL   (루트 .htaccess 가 이 파일로 연결)
 * 가비아 웹호스팅(PHP)용. Vercel 의 api/fundamentals.js 와 같은 결과(JSON)를 돌려줍니다.
 * 최근 두 분기의 영업이익·매출·순현금(현금성자산 − 차입금)을 공식 공시에서 가져옵니다.
 *  - 미국 종목: SEC EDGAR XBRL (가입·키 불필요)
 *  - 한국 종목: 금융감독원 DART 오픈API (php/config.php 의 DART_API_KEY 필요)
 * 결과는 php/cache 폴더에 6시간 저장해 같은 종목을 다시 부를 때 빠르게 응답합니다.
 */

const UA = 'sjtiger.kr fundamentals (https://www.sjtiger.kr)';
const CACHE_DIR = __DIR__ . '/cache';
const RESULT_TTL = 21600;      // 종목별 결과 6시간
const LIST_TTL = 86400;        // 종목 목록(SEC 티커, DART 고유번호) 1일

@ini_set('memory_limit', '256M');
@set_time_limit(60);

function send($status, $body) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: ' . ($status === 200 ? 'public, max-age=21600' : 'no-store'));
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

/* ---------------- 공통: 캐시와 HTTP ---------------- */
function cache_path($name) {
    if (!is_dir(CACHE_DIR)) @mkdir(CACHE_DIR, 0755, true);
    return CACHE_DIR . '/' . preg_replace('/[^A-Za-z0-9._-]/', '_', $name);
}
function cache_get($name, $ttl) {
    $p = cache_path($name);
    if (is_file($p) && (time() - filemtime($p)) < $ttl) {
        $v = json_decode((string) file_get_contents($p), true);
        if ($v !== null) return $v;
    }
    return null;
}
function cache_put($name, $value) {
    @file_put_contents(cache_path($name), json_encode($value, JSON_UNESCAPED_UNICODE), LOCK_EX);
}

/** GET 요청. [상태코드, 본문] 을 돌려줍니다. */
function http_get($url, $headers = []) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 40,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_ENCODING => '',               // gzip 자동 해제
            CURLOPT_USERAGENT => UA,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false) throw new Exception('네트워크 오류: ' . $err);
        return [$code, $body];
    }
    $ctx = stream_context_create(['http' => [
        'header' => implode("\r\n", array_merge(['User-Agent: ' . UA], $headers)),
        'timeout' => 40, 'ignore_errors' => true,
    ]]);
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false) throw new Exception('네트워크 오류');
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $code = (int) $m[1];
    return [$code, $body];
}
function http_json($url, $label) {
    [$code, $body] = http_get($url, ['Accept: application/json']);
    if ($code === 404) return null;
    if ($code < 200 || $code >= 300) throw new Exception($label . ' ' . $code);
    $j = json_decode($body, true);
    if (!is_array($j)) throw new Exception($label . ' 응답 해석 실패');
    return $j;
}

/* ---------------- 미국: SEC ---------------- */
function sec_cik($ticker) {
    $map = cache_get('sec_tickers.json', LIST_TTL);
    if ($map === null) {
        $j = http_json('https://www.sec.gov/files/company_tickers.json', 'SEC');
        $map = [];
        foreach ((array) $j as $x) {
            $map[strtoupper((string) $x['ticker'])] = str_pad((string) $x['cik_str'], 10, '0', STR_PAD_LEFT);
        }
        cache_put('sec_tickers.json', $map);
    }
    $t = str_replace('.', '-', strtoupper($ticker));
    return $map[$t] ?? null;
}
/** 회사 전체 공시(수 MB) 대신 필요한 항목만 하나씩 받아 메모리를 아낍니다. */
function sec_usd($cik, $concept) {
    $j = http_json('https://data.sec.gov/api/xbrl/companyconcept/CIK' . $cik . '/us-gaap/' . $concept . '.json', 'SEC');
    return ($j && isset($j['units']['USD'])) ? $j['units']['USD'] : null;
}
function days_between($start, $end) {
    return (strtotime($end . ' UTC') - strtotime($start . ' UTC')) / 86400;
}
/** 3개월짜리(분기) 값만 모으고, 4분기는 연간 − (1~3분기)로 계산. 최근 순으로 [{end,val}] */
function quarterly($units) {
    $q = []; $years = [];
    foreach ((array) $units as $e) {
        if (empty($e['start']) || empty($e['end'])) continue;
        $d = days_between($e['start'], $e['end']);
        if ($d >= 80 && $d <= 100) {
            $old = $q[$e['end']] ?? null;
            if (!$old || strcmp($e['filed'], $old['filed']) > 0) $q[$e['end']] = ['val' => $e['val'], 'filed' => $e['filed']];
        } elseif ($d >= 350 && $d <= 380) {
            $years[] = $e;
        }
    }
    foreach ($years as $y) {
        if (isset($q[$y['end']])) continue;
        $sum = 0; $n = 0;
        foreach ($q as $end => $v) {
            if ($end > $y['start'] && $end < $y['end']) { $sum += $v['val']; $n++; }
        }
        if ($n === 3) $q[$y['end']] = ['val' => $y['val'] - $sum, 'filed' => $y['filed']];
    }
    krsort($q, SORT_STRING);
    $out = [];
    foreach ($q as $end => $v) $out[] = ['end' => $end, 'val' => $v['val']];
    return $out;
}
/** 특정 시점 잔액(재무상태표): [end => val] */
function instants($units) {
    $m = [];
    foreach ((array) $units as $e) {
        if (!empty($e['start']) || empty($e['end'])) continue;
        $old = $m[$e['end']] ?? null;
        if (!$old || strcmp($e['filed'], $old['filed']) > 0) $m[$e['end']] = ['val' => $e['val'], 'filed' => $e['filed']];
    }
    $r = [];
    foreach ($m as $end => $v) $r[$end] = $v['val'];
    return $r;
}
function first_instants($cik, $names) {
    foreach ($names as $n) {
        $u = sec_usd($cik, $n);
        if ($u) { $m = instants($u); if ($m) return $m; }
    }
    return [];
}
function from_sec($ticker) {
    $cik = sec_cik($ticker);
    if (!$cik) return ['error' => 'SEC에서 종목을 찾지 못했습니다'];
    $oiQ = quarterly(sec_usd($cik, 'OperatingIncomeLoss'));
    $revQ = [];
    foreach (['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'] as $n) {
        $qq = quarterly(sec_usd($cik, $n));
        if ($qq && $oiQ && $qq[0]['end'] === $oiQ[0]['end']) { $revQ = $qq; break; }
    }
    $cash = first_instants($cik, ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']);
    $st = first_instants($cik, ['MarketableSecuritiesCurrent', 'ShortTermInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent']);
    $ltd = first_instants($cik, ['LongTermDebt']);
    $ltdNc = first_instants($cik, ['LongTermDebtNoncurrent']);
    $ltdC = first_instants($cik, ['LongTermDebtCurrent']);
    $cp = first_instants($cik, ['CommercialPaper']);
    $stb = first_instants($cik, ['ShortTermBorrowings']);
    $ends = array_keys($cash);
    rsort($ends, SORT_STRING);
    $net = [];
    foreach (array_slice($ends, 0, 2) as $end) {
        $c = $cash[$end] + ($st[$end] ?? 0);
        $debt = (isset($ltd[$end]) ? $ltd[$end] : (($ltdNc[$end] ?? 0) + ($ltdC[$end] ?? 0)))
            + ($cp[$end] ?? 0) + ($stb[$end] ?? 0);
        $net[] = ['end' => $end, 'val' => $c - $debt, 'cash' => $c, 'debt' => $debt];
    }
    return [
        'source' => 'SEC EDGAR',
        'currency' => 'USD',
        'operatingIncome' => array_slice($oiQ, 0, 2),
        'revenue' => array_slice($revQ, 0, 2),
        'netCash' => $net,
    ];
}

/* ---------------- 한국: DART ---------------- */
/** zip 안의 첫 파일을 풉니다 (ZipArchive 가 없어도 동작). */
function unzip_first($buf) {
    $sig = strpos($buf, "PK\x03\x04");
    if ($sig === false) throw new Exception('DART 고유번호 파일 형식 오류');
    $h = unpack('vmethod', substr($buf, $sig + 8, 2));
    $s = unpack('Vsize', substr($buf, $sig + 18, 4));
    $l = unpack('vname/vextra', substr($buf, $sig + 26, 4));
    $start = $sig + 30 + $l['name'] + $l['extra'];
    $data = $s['size'] ? substr($buf, $start, $s['size']) : substr($buf, $start);
    if ($h['method'] === 8) {
        $out = @gzinflate($data);
        if ($out === false) throw new Exception('DART 고유번호 파일 압축 해제 실패');
        return $out;
    }
    return $data;
}
function dart_corp($key, $stock) {
    $map = cache_get('dart_corp.json', LIST_TTL);
    if ($map === null) {
        [$code, $body] = http_get('https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=' . urlencode($key));
        if ($code < 200 || $code >= 300) throw new Exception('DART corpCode ' . $code);
        $xml = unzip_first($body);
        unset($body);
        $map = [];
        // <list> 하나가 회사 하나. 상장사(종목코드 6자리)만 표에 넣습니다.
        $pos = 0;
        while (($a = strpos($xml, '<list>', $pos)) !== false) {
            $b = strpos($xml, '</list>', $a);
            if ($b === false) break;
            $item = substr($xml, $a, $b - $a);
            if (preg_match('#<stock_code>\s*(\d{6})\s*</stock_code>#', $item, $sm)
                && preg_match('#<corp_code>\s*(\d+)\s*</corp_code>#', $item, $cm)) {
                $map[$sm[1]] = $cm[1];
            }
            $pos = $b + 7;
        }
        unset($xml);
        if ($map) cache_put('dart_corp.json', $map);
    }
    return $map[$stock] ?? null;
}
function num($s) {
    $t = str_replace(',', '', trim((string) $s));
    return ($t !== '' && is_numeric($t)) ? $t + 0 : null;
}
function dart_report($key, $corp, $year, $code) {
    foreach (['CFS', 'OFS'] as $fs) {
        $u = 'https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=' . urlencode($key) . '&corp_code=' . $corp
            . '&bsns_year=' . $year . '&reprt_code=' . $code . '&fs_div=' . $fs;
        $j = http_json($u, 'DART');
        if ($j && ($j['status'] ?? '') === '000' && !empty($j['list'])) return $j['list'];
    }
    return null;
}
function nospace($s) { return preg_replace('/\s/u', '', (string) $s); }
function pick($list, $sj, $ids, $names) {
    foreach ($list as $r) {
        if (in_array($r['sj_div'] ?? '', $sj, true)
            && (in_array($r['account_id'] ?? '', $ids, true) || in_array(nospace($r['account_nm'] ?? ''), $names, true))) return $r;
    }
    return null;
}
function sum_accounts($list, $ids, $names) {
    $total = 0; $found = false;
    foreach ($list as $r) {
        if (($r['sj_div'] ?? '') !== 'BS') continue;
        if (in_array($r['account_id'] ?? '', $ids, true) || in_array(nospace($r['account_nm'] ?? ''), $names, true)) {
            $v = num($r['thstrm_amount'] ?? null);
            if ($v !== null) { $total += $v; $found = true; }
        }
    }
    return $found ? $total : null;
}
function quarter_end($year, $q) { return $year . ['-03-31', '-06-30', '-09-30', '-12-31'][$q - 1]; }
function from_dart($stock) {
    $key = dart_key();
    if (!$key) return ['needsKey' => true];
    $corp = dart_corp($key, $stock);
    if (!$corp) return ['error' => 'DART에서 종목을 찾지 못했습니다'];
    $reports = [['11011', 4], ['11014', 3], ['11012', 2], ['11013', 1]]; // 사업·3분기·반기·1분기
    $out = [];
    $nowY = (int) gmdate('Y', time() + 9 * 3600);
    for ($y = $nowY; $y >= $nowY - 2 && count($out) < 3; $y--) {
        foreach ($reports as [$code, $q]) {
            if (count($out) >= 3) break;
            $list = dart_report($key, $corp, $y, $code);
            if (!$list) continue;
            $oiRow = pick($list, ['IS', 'CIS'], ['dart_OperatingIncomeLoss', 'ifrs-full_ProfitLossFromOperatingActivities'], ['영업이익', '영업이익(손실)', '영업손실']);
            $cash = sum_accounts($list, ['ifrs-full_CashAndCashEquivalents', 'dart_ShortTermDepositsNotClassifiedAsCashEquivalents', 'ifrs-full_CurrentFinancialAssetsAtFairValueThroughProfitOrLoss'],
                ['현금및현금성자산', '단기금융상품', '단기투자자산']);
            $debt = sum_accounts($list, ['ifrs-full_ShorttermBorrowings', 'ifrs-full_LongtermBorrowings', 'dart_BondsIssued', 'ifrs-full_CurrentPortionOfLongtermBorrowings', 'dart_CurrentPortionOfBonds'],
                ['단기차입금', '장기차입금', '사채', '유동성장기부채', '유동성장기차입금', '유동성사채']);
            $revRow = pick($list, ['IS', 'CIS'], ['ifrs-full_Revenue'], ['매출액', '수익(매출액)', '영업수익', '매출']);
            $out[] = [
                'end' => quarter_end($y, $q), 'q' => $q, 'year' => $y,
                'rev' => ($revRow && $q !== 4) ? num($revRow['thstrm_amount'] ?? null) : null,
                // 사업보고서는 연간 값만 주므로 4분기 영업이익은 비워 두고 아래에서 계산
                'oi' => $oiRow ? ($q === 4 ? null : num($oiRow['thstrm_amount'] ?? null)) : null,
                'oiYear' => ($oiRow && $q === 4) ? num($oiRow['thstrm_amount'] ?? null) : null,
                'oiCum' => $oiRow ? num($oiRow['thstrm_add_amount'] ?? null) : null,
                'cash' => $cash, 'debt' => $debt,
            ];
        }
    }
    // 4분기 영업이익 = 연간 − 3분기 누적
    foreach ($out as $i => $r) {
        if ($r['q'] === 4 && $r['oiYear'] !== null) {
            foreach ($out as $x) {
                if ($x['year'] === $r['year'] && $x['q'] === 3 && $x['oiCum'] !== null) { $out[$i]['oi'] = $r['oiYear'] - $x['oiCum']; break; }
            }
        }
    }
    $oi = []; $rev = []; $net = [];
    foreach ($out as $r) {
        if ($r['oi'] !== null && count($oi) < 2) $oi[] = ['end' => $r['end'], 'val' => $r['oi']];
        if ($r['rev'] !== null && count($rev) < 2) $rev[] = ['end' => $r['end'], 'val' => $r['rev']];
        if ($r['cash'] !== null && count($net) < 2) $net[] = ['end' => $r['end'], 'val' => $r['cash'] - ($r['debt'] ?? 0), 'cash' => $r['cash'], 'debt' => $r['debt'] ?? 0];
    }
    return ['source' => 'DART', 'currency' => 'KRW', 'operatingIncome' => $oi, 'revenue' => $rev, 'netCash' => $net];
}
/** DART 키: 서버 환경변수 → php/config.php 순서로 찾습니다. config.php 는 저장소에 올리지 않습니다. */
function dart_key() {
    $k = getenv('DART_API_KEY');
    if ($k) return $k;
    $cfg = __DIR__ . '/config.php';
    if (is_file($cfg)) {
        $c = include $cfg;
        if (is_array($c) && !empty($c['DART_API_KEY'])) return $c['DART_API_KEY'];
    }
    return '';
}

/* ---------------- 진입점 ---------------- */
if (PHP_SAPI !== 'cli' || getenv('FUNDAMENTALS_RUN')) {
    $symbol = (string) ($_GET['symbol'] ?? (getenv('FUNDAMENTALS_SYMBOL') ?: ''));
    if (!preg_match('/^([A-Z]+):([A-Z0-9.\-]+)$/i', $symbol, $m)) send(400, ['error' => 'symbol 형식: 거래소:종목코드']);
    $ex = strtoupper($m[1]);
    $code = $m[2];
    $cacheName = 'r_' . $ex . '_' . strtoupper($code) . '.json';
    $hit = cache_get($cacheName, RESULT_TTL);
    if ($hit !== null) send(200, $hit);
    try {
        if ($ex === 'KRX') $res = from_dart($code);
        elseif (in_array($ex, ['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA', 'BATS', 'CBOE'], true)) $res = from_sec($code);
        else $res = ['unsupported' => true];
        if (empty($res['error']) && empty($res['needsKey'])) cache_put($cacheName, $res);
        send(200, $res);
    } catch (Throwable $e) {
        send(502, ['error' => $e->getMessage()]);
    }
}
