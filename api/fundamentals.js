// /api/fundamentals?symbol=NASDAQ:GOOGL
// 최근 두 분기의 영업이익·현금성자산·차입금(→ 순현금)을 공식 공시에서 가져와 전 분기 대비 증감을 계산합니다.
//  - 미국 종목: SEC EDGAR XBRL (가입·키 불필요)
//  - 한국 종목: 금융감독원 DART 오픈API (Vercel 환경변수 DART_API_KEY 필요)
const zlib = require('zlib');

const UA = 'sjtiger.kr fundamentals (https://www.sjtiger.kr)';
const DAY = 864e5;
let secTickers = null;      // { TICKER: 'CIK0000000000' }
let dartCorpCodes = null;   // { '005930': '00126380' }

function send(res, status, body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', status === 200 ? 's-maxage=21600, stale-while-revalidate=86400' : 'no-store');
    res.status(status).send(JSON.stringify(body));
}

/* ---------------- 미국: SEC ---------------- */
async function secJson(url) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error('SEC ' + r.status);
    return r.json();
}
async function secCik(ticker) {
    if (!secTickers) {
        const j = await secJson('https://www.sec.gov/files/company_tickers.json');
        secTickers = {};
        Object.values(j).forEach((x) => { secTickers[String(x.ticker).toUpperCase()] = String(x.cik_str).padStart(10, '0'); });
    }
    return secTickers[ticker.toUpperCase().replace('.', '-')];
}
// 3개월짜리(분기) 값만 모으고, 4분기는 연간 − (1~3분기)로 계산
function quarterly(units) {
    const q = new Map();
    const years = [];
    (units || []).forEach((e) => {
        if (!e.start || !e.end) return;
        const d = (new Date(e.end) - new Date(e.start)) / DAY;
        if (d >= 80 && d <= 100) {
            const old = q.get(e.end);
            if (!old || e.filed > old.filed) q.set(e.end, { val: e.val, filed: e.filed });
        } else if (d >= 350 && d <= 380) years.push(e);
    });
    years.forEach((y) => {
        if (q.has(y.end)) return;
        const s = new Date(y.start), en = new Date(y.end);
        const inside = [...q.entries()].filter(([end]) => { const x = new Date(end); return x > s && x < en; });
        if (inside.length === 3) q.set(y.end, { val: y.val - inside.reduce((a, [, v]) => a + v.val, 0), filed: y.filed });
    });
    return [...q.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([end, v]) => ({ end, val: v.val }));
}
// 특정 시점 잔액(재무상태표)
function instants(units) {
    const m = new Map();
    (units || []).forEach((e) => {
        if (e.start || !e.end) return;
        const old = m.get(e.end);
        if (!old || e.filed > old.filed) m.set(e.end, { val: e.val, filed: e.filed });
    });
    return m;
}
function usd(facts, name) { const c = facts['us-gaap'] && facts['us-gaap'][name]; return c && c.units && c.units.USD; }
function firstInstants(facts, names) {
    for (const n of names) { const u = usd(facts, n); if (u) { const m = instants(u); if (m.size) return m; } }
    return new Map();
}
async function fromSec(ticker) {
    const cik = await secCik(ticker);
    if (!cik) return { error: 'SEC에서 종목을 찾지 못했습니다' };
    const j = await secJson('https://data.sec.gov/api/xbrl/companyfacts/CIK' + cik + '.json');
    const f = j.facts || {};
    const oiQ = quarterly(usd(f, 'OperatingIncomeLoss'));
    const cash = firstInstants(f, ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']);
    const st = firstInstants(f, ['MarketableSecuritiesCurrent', 'ShortTermInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent']);
    const ltd = firstInstants(f, ['LongTermDebt']);
    const ltdNc = firstInstants(f, ['LongTermDebtNoncurrent']);
    const ltdC = firstInstants(f, ['LongTermDebtCurrent']);
    const cp = firstInstants(f, ['CommercialPaper']);
    const stb = firstInstants(f, ['ShortTermBorrowings']);
    const ends = [...cash.keys()].sort().reverse();
    const bal = ends.slice(0, 2).map((end) => {
        const c = cash.get(end).val + ((st.get(end) || {}).val || 0);
        const debt = (ltd.get(end) ? ltd.get(end).val : ((ltdNc.get(end) || {}).val || 0) + ((ltdC.get(end) || {}).val || 0))
            + ((cp.get(end) || {}).val || 0) + ((stb.get(end) || {}).val || 0);
        return { end, cash: c, debt, netCash: c - debt };
    });
    return {
        source: 'SEC EDGAR',
        currency: 'USD',
        operatingIncome: oiQ.slice(0, 2),
        netCash: bal.map((b) => ({ end: b.end, val: b.netCash, cash: b.cash, debt: b.debt }))
    };
}

/* ---------------- 한국: DART ---------------- */
// corpCode.xml(zip) 안의 파일 하나를 풀어 종목코드 → 고유번호 표를 만듭니다.
function unzipFirst(buf) {
    const sig = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (sig < 0) throw new Error('zip');
    const method = buf.readUInt16LE(sig + 8);
    const compSize = buf.readUInt32LE(sig + 18);
    const nameLen = buf.readUInt16LE(sig + 26), extraLen = buf.readUInt16LE(sig + 28);
    const start = sig + 30 + nameLen + extraLen;
    let data = buf.subarray(start, compSize ? start + compSize : undefined);
    return method === 8 ? zlib.inflateRawSync(data) : data;
}
async function dartCorp(key, stock) {
    if (!dartCorpCodes) {
        const r = await fetch('https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=' + key);
        if (!r.ok) throw new Error('DART corpCode ' + r.status);
        const xml = unzipFirst(Buffer.from(await r.arrayBuffer())).toString('utf8');
        dartCorpCodes = {};
        const re = /<corp_code>(\d+)<\/corp_code>[\s\S]*?<stock_code>\s*(\d{6})\s*<\/stock_code>/g;
        let m; while ((m = re.exec(xml))) dartCorpCodes[m[2]] = m[1];
    }
    return dartCorpCodes[stock];
}
const REPORTS = [['11011', 4], ['11014', 3], ['11012', 2], ['11013', 1]]; // 사업·3분기·반기·1분기
function num(s) { const n = Number(String(s || '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; }
async function dartReport(key, corp, year, code) {
    for (const fs of ['CFS', 'OFS']) {
        const u = 'https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=' + key + '&corp_code=' + corp
            + '&bsns_year=' + year + '&reprt_code=' + code + '&fs_div=' + fs;
        const j = await (await fetch(u)).json();
        if (j.status === '000' && j.list && j.list.length) return j.list;
    }
    return null;
}
function pick(list, sj, ids, names) {
    const row = list.find((r) => (sj.indexOf(r.sj_div) >= 0) && (ids.indexOf(r.account_id) >= 0 || names.indexOf(String(r.account_nm).replace(/\s/g, '')) >= 0));
    return row || null;
}
function sumAccounts(list, ids, names) {
    let total = 0, found = false;
    list.forEach((r) => {
        if (r.sj_div !== 'BS') return;
        if (ids.indexOf(r.account_id) >= 0 || names.indexOf(String(r.account_nm).replace(/\s/g, '')) >= 0) {
            const v = num(r.thstrm_amount); if (v != null) { total += v; found = true; }
        }
    });
    return found ? total : null;
}
function quarterEnd(year, q) { return year + ['-03-31', '-06-30', '-09-30', '-12-31'][q - 1]; }
async function fromDart(stock) {
    const key = process.env.DART_API_KEY;
    if (!key) return { needsKey: true };
    const corp = await dartCorp(key, stock);
    if (!corp) return { error: 'DART에서 종목을 찾지 못했습니다' };
    const out = [];
    const nowY = new Date().getFullYear();
    for (let y = nowY; y >= nowY - 2 && out.length < 3; y--) {
        for (const [code, q] of REPORTS) {
            if (out.length >= 3) break;
            const list = await dartReport(key, corp, y, code);
            if (!list) continue;
            const oiRow = pick(list, ['IS', 'CIS'], ['dart_OperatingIncomeLoss', 'ifrs-full_ProfitLossFromOperatingActivities'], ['영업이익', '영업이익(손실)', '영업손실']);
            const cash = sumAccounts(list, ['ifrs-full_CashAndCashEquivalents', 'dart_ShortTermDepositsNotClassifiedAsCashEquivalents', 'ifrs-full_CurrentFinancialAssetsAtFairValueThroughProfitOrLoss'],
                ['현금및현금성자산', '단기금융상품', '단기투자자산']);
            const debt = sumAccounts(list, ['ifrs-full_ShorttermBorrowings', 'ifrs-full_LongtermBorrowings', 'dart_BondsIssued', 'ifrs-full_CurrentPortionOfLongtermBorrowings', 'dart_CurrentPortionOfBonds'],
                ['단기차입금', '장기차입금', '사채', '유동성장기부채', '유동성장기차입금', '유동성사채']);
            out.push({
                end: quarterEnd(y, q), q: q, year: y,
                // 사업보고서는 연간 값만 주므로 4분기 영업이익은 비워 두고 아래에서 계산
                oi: oiRow ? (q === 4 ? null : num(oiRow.thstrm_amount)) : null,
                oiYear: oiRow && q === 4 ? num(oiRow.thstrm_amount) : null,
                oiCum: oiRow ? num(oiRow.thstrm_add_amount) : null,
                cash, debt
            });
        }
    }
    // 4분기 영업이익 = 연간 − 3분기 누적
    out.forEach((r, i) => {
        if (r.q === 4 && r.oiYear != null) {
            const q3 = out.find((x) => x.year === r.year && x.q === 3);
            if (q3 && q3.oiCum != null) r.oi = r.oiYear - q3.oiCum;
        }
    });
    return {
        source: 'DART',
        currency: 'KRW',
        operatingIncome: out.filter((r) => r.oi != null).slice(0, 2).map((r) => ({ end: r.end, val: r.oi })),
        netCash: out.filter((r) => r.cash != null).slice(0, 2).map((r) => ({ end: r.end, val: r.cash - (r.debt || 0), cash: r.cash, debt: r.debt || 0 }))
    };
}

module.exports = async (req, res) => {
    const symbol = String((req.query && req.query.symbol) || '');
    const m = /^([A-Z]+):([A-Z0-9.\-]+)$/i.exec(symbol);
    if (!m) return send(res, 400, { error: 'symbol 형식: 거래소:종목코드' });
    const ex = m[1].toUpperCase(), code = m[2];
    try {
        if (ex === 'KRX') return send(res, 200, await fromDart(code));
        if (['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA', 'BATS', 'CBOE'].indexOf(ex) >= 0) return send(res, 200, await fromSec(code));
        return send(res, 200, { unsupported: true });
    } catch (e) {
        return send(res, 502, { error: String(e.message || e) });
    }
};
