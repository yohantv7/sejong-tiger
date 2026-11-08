/* =========================================================
   hpmaker 플랫폼 화면 — 프레임워크 없이 순수 JavaScript (가볍고 빠르게)
   - 로그인: 세종호랑이와 같은 Firebase 계정 (같은 주소 sjtiger.kr 이라 로그인 상태도 이어집니다)
   - 데이터: 같은 폴더의 api.php (PHP + MySQL)
   ========================================================= */
(function () {
  'use strict';

  firebase.initializeApp({
    apiKey: 'AIzaSyAZhCOrlVWiTj-xuYprTciXlUbxnFeSE9E',
    authDomain: 'my-home-74cf5.firebaseapp.com',
    projectId: 'my-home-74cf5',
    storageBucket: 'my-home-74cf5.firebasestorage.app',
    messagingSenderId: '7963220432',
    appId: '1:7963220432:web:1541c1437b859e8023c1d5'
  });
  const auth = firebase.auth();

  const CATS = [
    { key: 'design', label: '디자인', c: ['#f4c7c3', '#f7e3a3', '#c9d9f2'] },
    { key: 'web', label: '웹개발', c: ['#c9d9f2', '#e1e4ea', '#f4c7c3'] },
    { key: 'ai', label: 'AI 스킬·에이전트', c: ['#ddd2f0', '#c9d9f2', '#f7e3a3'] },
    { key: 'doc', label: '전자책·문서', c: ['#f7e3a3', '#ecdfcf', '#cfe8d5'] },
    { key: 'digital', label: '디지털 굿즈', c: ['#cfe8d5', '#f4c7c3', '#ddd2f0'] },
    { key: 'used', label: '중고물품', c: ['#ecdfcf', '#c9d9f2', '#e1e4ea'] },
    { key: 'etc', label: '기타', c: ['#e1e4ea', '#f7e3a3', '#cfe8d5'] }
  ];
  const CAT = Object.fromEntries(CATS.map(c => [c.key, c]));
  const ORDER_ST = { requested: '구매 신청', shipped: '발송 완료', completed: '거래 완료', cancelled: '취소됨' };
  const LIST_ST = { on: '판매 중', sold: '품절', hidden: '숨김' };

  const $ = (s, el) => (el || document).querySelector(s);
  const view = $('#view');
  const state = {
    authReady: false,
    me: null,                   // 플랫폼 회원 정보 (별명 등)
    filters: { q: '', cat: '', sort: 'new' },
    list: null,                 // 마지막으로 본 목록 (뒤로 가기 때 바로 보여 주기)
    items: new Map(),           // 미리 받아 둔 상품 상세
    timers: []
  };

  /* ---------------- 작은 도구들 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  const won = p => (p === 0 ? '무료' : p.toLocaleString('ko-KR') + '원');
  function ago(s) {
    const t = new Date(String(s).replace(' ', 'T') + '+09:00').getTime();
    const d = Math.max(0, (Date.now() - t) / 1000);
    if (d < 60) return '방금 전';
    if (d < 3600) return Math.floor(d / 60) + '분 전';
    if (d < 86400) return Math.floor(d / 3600) + '시간 전';
    if (d < 86400 * 30) return Math.floor(d / 86400) + '일 전';
    return String(s).slice(0, 10);
  }
  const safeImg = p => (/^uploads\/\d{4}\/\d{2}\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(p || '') ? p : '');

  function thumb(item, eager) {
    const img = safeImg(item.image);
    if (img) return `<img src="${img}" alt="" ${eager ? '' : 'loading="lazy"'} decoding="async">`;
    const c = (CAT[item.category] || CATS[6]).c;
    return `<span class="ph" aria-hidden="true"><i style="background:${c[0]};grid-row:1/3"></i><i style="background:${c[1]}"></i><i style="background:${c[2]}"></i><b>${esc((CAT[item.category] || CATS[6]).label)}</b></span>`;
  }

  let toastTimer;
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast' + (bad ? ' bad' : ''); }, 2800);
  }

  /** api.php 호출. 로그인한 상태면 Firebase 토큰을 함께 보냅니다. */
  async function api(action, opt) {
    opt = opt || {};
    const qs = new URLSearchParams(Object.assign({ a: action }, opt.params || {}));
    const headers = {};
    const user = auth.currentUser;
    if (user && opt.auth !== false) headers.Authorization = 'Bearer ' + await user.getIdToken();
    let body;
    if (opt.form) body = opt.form;
    else if (opt.body) { body = JSON.stringify(opt.body); headers['Content-Type'] = 'application/json'; }
    let res;
    try {
      res = await fetch('api.php?' + qs, { method: body ? 'POST' : 'GET', headers, body, signal: opt.signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error('인터넷 연결을 확인해 주세요.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* 빈 응답 */ }
    if (!res.ok || !data || !data.ok) {
      const err = new Error((data && data.error) || '잠시 후 다시 시도해 주세요.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function stopTimers() { state.timers.forEach(clearInterval); state.timers = []; }
  function every(ms, fn) { state.timers.push(setInterval(() => { if (!document.hidden) fn(); }, ms)); }

  /* ---------------- 로그인 ---------------- */
  const dlg = $('#loginDlg');
  let signupMode = false;
  let afterLogin = null;

  function openLogin(then) {
    afterLogin = then || null;
    $('#loginErr').textContent = '';
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(() => dlg.querySelector('input[name=email]').focus(), 30);
  }
  $('#auth-btn').addEventListener('click', async () => {
    if (auth.currentUser) { await auth.signOut(); toast('로그아웃했습니다.'); location.hash = '#/'; return; }
    setMode(false); openLogin();
  });
  $('#signup-btn').addEventListener('click', () => { setMode(true); openLogin(); });
  $('#switchMode').addEventListener('click', () => setMode(!signupMode));
  function setMode(signup) {
    signupMode = signup;
    $('#loginTitle').textContent = signupMode ? '회원가입' : '로그인';
    $('#loginSubmit').textContent = signupMode ? '가입하고 시작하기' : '로그인';
    $('#switchText').textContent = signupMode ? '이미 계정이 있으신가요?' : '아직 계정이 없으신가요?';
    $('#switchMode').textContent = signupMode ? '로그인' : '회원가입';
    dlg.querySelector('input[name=password]').autocomplete = signupMode ? 'new-password' : 'current-password';
  }
  const FB_ERR = {
    'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않습니다.',
    'auth/wrong-password': '이메일 또는 비밀번호가 맞지 않습니다.',
    'auth/user-not-found': '가입되지 않은 이메일입니다.',
    'auth/email-already-in-use': '이미 가입된 이메일입니다. 로그인해 주세요.',
    'auth/weak-password': '비밀번호는 6자 이상으로 정해 주세요.',
    'auth/invalid-email': '이메일 형식을 확인해 주세요.',
    'auth/too-many-requests': '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  };
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const btn = $('#loginSubmit');
    btn.disabled = true;
    $('#loginErr').textContent = '';
    try {
      if (signupMode) await auth.createUserWithEmailAndPassword(f.email.value.trim(), f.password.value);
      else await auth.signInWithEmailAndPassword(f.email.value.trim(), f.password.value);
      dlg.close();
      f.reset();
      toast(signupMode ? '가입을 환영합니다!' : '로그인했습니다.');
      const next = afterLogin; afterLogin = null;
      if (next) next();
    } catch (err) {
      $('#loginErr').textContent = FB_ERR[err.code] || '로그인하지 못했습니다. (' + (err.code || err.message) + ')';
    } finally {
      btn.disabled = false;
    }
  });

  async function refreshMe() {
    if (!auth.currentUser) { state.me = null; paintBadge(); return; }
    try {
      state.me = (await api('me')).me;
    } catch (e) { /* 다음 번에 다시 */ }
    paintBadge();
  }
  function paintBadge() {
    const n = state.me ? state.me.to_ship + state.me.to_confirm : 0;
    document.querySelectorAll('[data-badge]').forEach(b => {
      b.hidden = !n;
      b.textContent = n > 99 ? '99+' : n;
    });
  }
  /** 상단바 로그인 표시: 메인(sjtiger.kr)과 같이 'OOO님, 환영합니다!' + 로그아웃 */
  function paintAuth(user) {
    const name = user ? (user.displayName || (state.me && state.me.nickname) || (user.email || '').split('@')[0]) : '';
    $('#user-info').textContent = user ? name + '님, 환영합니다!' : '';
    $('#auth-btn').textContent = user ? '로그아웃' : '로그인';
    $('#signup-btn').hidden = !!user;
  }

  let firstAuth = true;
  auth.onAuthStateChanged(async user => {
    paintAuth(user);
    state.authReady = true;
    await refreshMe();
    paintAuth(user);
    if (firstAuth) { firstAuth = false; route(); return; }
    // 로그인 상태가 바뀌면 지금 화면을 다시 그립니다(내 상품 여부 등이 달라지므로).
    if (!/^#\/sell/.test(location.hash)) route();
  });
  setInterval(() => { if (!document.hidden && auth.currentUser) refreshMe(); }, 30000);

  /** 로그인이 필요한 화면: 로그인 창을 띄우고, 로그인 후 그 화면으로 돌아옵니다. */
  function needLogin(message) {
    if (auth.currentUser) return false;
    view.innerHTML = `<div class="empty"><h2>로그인이 필요합니다</h2><p>${esc(message)}</p><button class="btn btn-dark" id="needLoginBtn">로그인</button></div>`;
    $('#needLoginBtn').addEventListener('click', () => openLogin(route));
    openLogin(route);
    return true;
  }

  /* ---------------- 화면 이동 ---------------- */
  window.addEventListener('hashchange', route);
  function route() {
    if (!state.authReady) return;
    stopTimers();
    const h = location.hash || '#/';
    const isList = !/^#\/(item|sell|my)/.test(h);
    $('#top').classList.toggle('is-full', isList);       // 목록 화면에서만 사진을 화면 가득
    $('#hero').hidden = !isList;
    view.classList.toggle('list-page', isList);
    let m;
    if ((m = h.match(/^#\/item\/(\d+)$/))) return showItem(+m[1]);
    if ((m = h.match(/^#\/sell(?:\/(\d+))?$/))) return showSell(m[1] ? +m[1] : null);
    if ((m = h.match(/^#\/my(?:\/(\w+))?$/))) return showMy(m[1] || 'buyer');
    return showList();
  }
  function setTitle(t) { document.title = (t ? t + ' — ' : '') + 'hpmaker 플랫폼'; }

  /* ---------------- 목록 ---------------- */
  let listAbort = null;

  function showList() {
    setTitle('');
    const f = state.filters;
    view.innerHTML = `
      <div class="shop" id="results">
        <aside class="side" aria-label="분류와 정렬">
          <h2 class="side-title">분류</h2>
          <div class="cat-list" role="group" aria-label="분류">
            <button class="chip" data-cat="" aria-pressed="${!f.cat}">전체</button>
            ${CATS.map(c => `<button class="chip" data-cat="${c.key}" aria-pressed="${f.cat === c.key}">${esc(c.label)}</button>`).join('')}
          </div>
          <label class="side-sort">정렬
            <select class="sort" id="sort">
              <option value="new">최신순</option><option value="popular">많이 팔린 순</option>
              <option value="low">낮은 가격순</option><option value="high">높은 가격순</option>
            </select>
          </label>
          <div class="side-actions">
            <a class="btn btn-amber" href="#/sell">판매하기</a>
            <a class="btn btn-line" href="#/my">내 거래<span class="badge" data-badge hidden></span></a>
          </div>
        </aside>
        <section class="shop-main">
          <div class="results-head" id="resultsHead"></div>
          <div class="grid" id="grid"></div>
          <div class="more"><button class="btn btn-line" id="moreBtn" hidden>더 보기</button></div>
        </section>
      </div>`;
    paintBadge();
    paintHead();
    $('#sort').value = f.sort;
    // 분류·정렬을 바꿔도 화면을 맨 위로 올리지 않고 목록만 새로 읽습니다.
    view.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
      f.cat = b.dataset.cat; state.list = null;
      view.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === b));
      paintHead(); loadList(false);
    }));
    $('#sort').addEventListener('change', e => { f.sort = e.target.value; state.list = null; loadList(false); });
    $('#moreBtn').addEventListener('click', () => loadList(true));

    const key = JSON.stringify(f);
    if (state.list && state.list.key === key) {
      paintCards(state.list.items, false);
      $('#moreBtn').hidden = !state.list.next;
      requestAnimationFrame(() => window.scrollTo(0, state.list.scroll || 0));
      loadList(false, true);          // 화면은 바로 보여 주고, 뒤에서 조용히 새 내용 확인
    } else {
      window.scrollTo(0, 0);
      loadList(false);
    }
  }

  function paintHead() {
    const f = state.filters;
    const head = $('#resultsHead');
    if (!head) return;
    const label = f.cat ? (CAT[f.cat] || {}).label : '전체 상품';
    head.innerHTML = f.q
      ? `<h2>‘${esc(f.q)}’ 검색 결과${f.cat ? ` <span class="muted">· ${esc(label)}</span>` : ''}</h2><button class="linkish" id="clearQ">검색 지우기</button>`
      : `<h2>${esc(label)}</h2>`;
    const c = $('#clearQ');
    if (c) c.addEventListener('click', () => { $('#q').value = ''; state.filters.q = ''; state.list = null; paintHead(); loadList(false); });
  }

  function skeleton(n) {
    return Array.from({ length: n }, () => '<div class="card skel"><div class="thumb"></div><div class="card-body"><div class="sk" style="width:90%"></div><div class="sk" style="width:60%"></div><div class="sk" style="width:40%"></div></div></div>').join('');
  }

  async function loadList(more, quiet) {
    const f = state.filters;
    const key = JSON.stringify(f);
    const grid = $('#grid');
    if (!grid) return;
    if (listAbort) listAbort.abort();
    listAbort = new AbortController();
    const params = { sort: f.sort };
    if (f.q) params.q = f.q;
    if (f.cat) params.cat = f.cat;
    if (more && state.list && state.list.next) params.cursor = state.list.next;
    const btn = $('#moreBtn');
    if (!more && !quiet) grid.innerHTML = skeleton(8);
    if (more) { btn.disabled = true; btn.textContent = '불러오는 중…'; }
    try {
      const data = await api('list', { params, auth: false, signal: listAbort.signal });
      const items = more ? state.list.items.concat(data.items) : data.items;
      state.list = { key, items, next: data.next, scroll: more ? state.list.scroll : 0 };
      if (!$('#grid')) return;
      paintCards(items, !more && !quiet);
      btn.hidden = !data.next;
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (!quiet) grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h2>목록을 불러오지 못했습니다</h2><p>${esc(e.message)}</p></div>`;
    } finally {
      btn.disabled = false; btn.textContent = '더 보기';
    }
  }

  function paintCards(items, eagerFirst) {
    const grid = $('#grid');
    if (!items.length) {
      const f = state.filters;
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h2>${f.q || f.cat ? '찾는 상품이 아직 없어요' : '첫 번째 판매자가 되어 보세요'}</h2>
        <p>${f.q || f.cat ? '다른 검색어나 분류로 찾아보세요.' : '아직 올라온 상품이 없습니다.'}</p><a class="btn btn-amber" href="#/sell">판매하기</a></div>`;
      return;
    }
    grid.innerHTML = items.map((it, i) => `
      <a class="card" href="#/item/${it.id}" data-id="${it.id}">
        <div class="thumb">${thumb(it, eagerFirst && i < 4)}${it.status === 'sold' ? '<span class="tag-sold">품절</span>' : ''}</div>
        <div class="card-body">
          <div class="card-title">${esc(it.title)}</div>
          <div class="price">${won(it.price)}</div>
          <div class="meta"><span>${esc(it.seller)}</span><span>${it.sold ? '판매 ' + it.sold + ' · ' : ''}${ago(it.created)}</span></div>
        </div>
      </a>`).join('');
  }

  // 카드에 마우스를 올리거나 손가락을 대는 순간 상세를 미리 받아 두어, 누르면 바로 열립니다.
  function prefetch(id) {
    if (state.items.has(id)) return;
    const p = api('item', { params: { id }, auth: false }).then(d => d.item);
    p.catch(() => state.items.delete(id));
    state.items.set(id, p);
    setTimeout(() => state.items.delete(id), 15000);
  }
  ['mouseover', 'touchstart', 'focusin'].forEach(ev => document.addEventListener(ev, e => {
    const a = e.target.closest && e.target.closest('a.card[data-id]');
    if (a) prefetch(+a.dataset.id);
  }, { passive: true }));
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('a.card') && state.list) state.list.scroll = window.scrollY;
  });

  // 검색: 사진 위 검색창. 글자를 칠 때마다 0.25초 뒤 목록을 바꾸고, Enter(검색)를 누르면 결과로 내려갑니다.
  let searchTimer;
  function runSearch(scroll) {
    state.filters.q = $('#q').value.trim();
    state.list = null;
    if (!$('#grid')) { location.hash = '#/'; return; }
    paintHead();
    loadList(false);
    if (scroll) $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(false), 250); });
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); clearTimeout(searchTimer); runSearch(true); });

  /* ---------------- 상단 메뉴 (메인 sjtiger.kr 과 같은 동작) ----------------
   * 큰 화면: 상단바에 마우스를 올리면 하위 메뉴가 펼쳐지고, 벗어나면 닫힘
   * 휴대폰·키보드: 메뉴를 누르면 열고 다시 누르면 닫음 */
  (function () {
    const panel = $('#mega');
    const btns = document.querySelectorAll('.menu-btn[data-menu]');
    if (!panel) return;
    const head = panel.closest('.top-head');
    const grid = panel.querySelector('.mega-grid');
    let current = null;
    function layout() {
      if (panel.hidden || !grid) return;
      const narrow = matchMedia('(max-width: 720px)').matches;
      const base = grid.getBoundingClientRect().left;
      const list = Array.prototype.slice.call(btns);
      let tallest = 0;
      panel.querySelectorAll('.mega-col').forEach(col => {
        const i = list.findIndex(x => x.dataset.menu === col.dataset.col);
        const b = list[i], next = list[i + 1];
        if (narrow || !b) { col.style.left = ''; col.style.maxWidth = ''; return; }
        const r = b.getBoundingClientRect();
        const inset = b.clientLeft + parseFloat(getComputedStyle(b).paddingLeft || 0);
        col.style.left = (r.left + inset - base) + 'px';
        const nr = next && next.getBoundingClientRect();
        col.style.maxWidth = (nr && Math.abs(nr.top - r.top) < 4) ? (nr.left - r.left - 16) + 'px' : '220px';
        tallest = Math.max(tallest, col.offsetHeight);
      });
      grid.style.minHeight = narrow ? '' : tallest + 'px';
    }
    addEventListener('resize', layout);
    function close() {
      head.classList.remove('is-open');
      panel.hidden = true; current = null;
      btns.forEach(b => b.setAttribute('aria-expanded', 'false'));
    }
    function open(key) {
      panel.hidden = false; current = key;
      head.classList.add('is-open');
      btns.forEach(b => b.setAttribute('aria-expanded', b.dataset.menu === key ? 'true' : 'false'));
      layout();
    }
    const hoverMode = matchMedia('(hover: hover) and (min-width: 721px)');
    let leaveTimer = null;
    head.addEventListener('mouseenter', () => { if (!hoverMode.matches) return; clearTimeout(leaveTimer); if (panel.hidden) open(null); });
    head.addEventListener('mouseleave', () => { if (!hoverMode.matches) return; leaveTimer = setTimeout(close, 120); });
    btns.forEach(b => b.addEventListener('click', () => {
      if (hoverMode.matches) { open(b.dataset.menu); return; }
      current === b.dataset.menu ? close() : open(b.dataset.menu);
    }));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !panel.hidden) { const b = current && document.querySelector('.menu-btn[data-menu="' + current + '"]'); close(); if (b) b.focus(); }
    });
    document.addEventListener('click', e => { if (!panel.hidden && !head.contains(e.target)) close(); });
  })();

  /* ---------------- 상세 ---------------- */
  async function showItem(id) {
    window.scrollTo(0, 0);
    view.innerHTML = `<a class="back" href="#/">← 목록으로</a><div class="detail"><div class="thumb skel"><div class="thumb"></div></div><div class="panel skel"><div class="sk" style="width:30%"></div><div class="sk" style="width:80%;height:24px"></div><div class="sk" style="width:40%;height:28px"></div></div></div>`;
    let item;
    try {
      const pre = state.items.get(id);
      item = pre ? await pre.catch(() => null) : null;
      if (!item || item.status === 'hidden') item = (await api('item', { params: { id } })).item;
    } catch (e) {
      state.items.delete(id);
      view.innerHTML = `<div class="empty"><h2>상품을 찾을 수 없습니다</h2><p>${esc(e.message)}</p><a class="btn btn-line" href="#/">목록으로</a></div>`;
      return;
    }
    state.items.delete(id);
    setTitle(item.title);
    const mine = state.me && state.me.id === item.seller_id;
    const cat = CAT[item.category] || CATS[6];
    const canBuy = item.status === 'on' && item.stock > 0;

    let action;
    if (mine) {
      action = `<div class="buybox">
          <p class="notice">내가 올린 상품입니다. 들어온 주문은 ‘내 거래 → 판매 주문’에서 처리하세요.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a class="btn btn-dark" href="#/sell/${item.id}">수정하기</a>
            <a class="btn btn-line" href="#/my/seller">판매 주문 보기</a>
            <button class="btn btn-red" id="delBtn">삭제</button>
          </div></div>`;
    } else if (canBuy) {
      action = `<form class="buybox form" id="buyForm">
          <div class="qty"><label style="display:flex;align-items:center;gap:10px">수량 <input type="number" name="qty" min="1" max="${Math.min(item.stock, 999)}" value="1" required></label>
            <span class="muted" id="sum">합계 ${won(item.price)}</span></div>
          <label>판매자에게 전할 말 <span class="hint">연락처, 받을 곳, 원하는 거래 방법 등 (300자 이내)</span>
            <textarea name="note" maxlength="300" style="min-height:80px" placeholder="예) 010-0000-0000 / 계좌이체로 보내 드릴게요"></textarea></label>
          <p class="err" id="buyErr" role="alert"></p>
          <button class="btn btn-amber btn-block" type="submit" id="buyBtn">구매 신청하기</button>
          <p class="notice">구매 신청 후 판매자가 연락해 대금과 전달 방법을 안내합니다. 물건(파일)을 받은 뒤 ‘수령 확인’을 눌러 거래를 마쳐 주세요.</p>
        </form>`;
    } else {
      action = `<button class="btn btn-line btn-block" disabled>${item.status === 'hidden' ? '판매 중지된 상품' : '품절되었습니다'}</button>`;
    }

    view.innerHTML = `
      <a class="back" href="#/">← 목록으로</a>
      <article class="detail">
        <div class="thumb">${thumb(item, true)}</div>
        <div class="panel">
          <span class="cat-pill" style="background:${cat.c[0]}">${esc(cat.label)}</span>
          ${mine ? ` <span class="st st-${item.status}">${LIST_ST[item.status]}</span>` : ''}
          <h1>${esc(item.title)}</h1>
          <div class="price">${won(item.price)}</div>
          <dl class="facts">
            <dt>판매자</dt><dd>${esc(item.seller)} <span class="muted">· 거래 완료 ${item.seller_deals}건</span></dd>
            <dt>남은 수량</dt><dd>${item.stock}개${item.sold ? ` <span class="muted">· ${item.sold}개 판매됨</span>` : ''}</dd>
            <dt>올린 때</dt><dd>${ago(item.created)}</dd>
          </dl>
          ${action}
        </div>
      </article>
      ${item.description ? `<section class="panel desc" style="margin-top:24px">${esc(item.description)}</section>` : ''}`;

    const buyForm = $('#buyForm');
    if (buyForm) {
      buyForm.qty.addEventListener('input', () => {
        const q = Math.max(1, parseInt(buyForm.qty.value, 10) || 1);
        $('#sum').textContent = '합계 ' + won(q * item.price);
      });
      buyForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (needLoginInline()) return;
        const btn = $('#buyBtn');
        btn.disabled = true; btn.textContent = '신청하는 중…';
        $('#buyErr').textContent = '';
        try {
          await api('buy', { body: { id: item.id, qty: +buyForm.qty.value, note: buyForm.note.value } });
          state.list = null;
          toast('구매 신청을 보냈습니다. 판매자의 연락을 기다려 주세요.');
          refreshMe();
          location.hash = '#/my/buyer';
        } catch (err) {
          $('#buyErr').textContent = err.message;
          btn.disabled = false; btn.textContent = '구매 신청하기';
          if (err.status === 409) setTimeout(() => showItem(id), 1500);
        }
      });
    }
    const del = $('#delBtn');
    if (del) del.addEventListener('click', async () => {
      if (!confirm('이 상품을 삭제할까요? 거래 기록이 있으면 삭제 대신 숨김 처리됩니다.')) return;
      try {
        const r = await api('delete', { body: { id: item.id } });
        state.list = null;
        toast(r.result === 'hidden' ? '거래 기록이 있어 숨김 처리했습니다.' : '삭제했습니다.');
        location.hash = '#/my/listings';
      } catch (err) { toast(err.message, true); }
    });
  }

  /** 버튼을 눌렀는데 로그인이 안 되어 있으면 로그인 창을 띄웁니다. */
  function needLoginInline() {
    if (auth.currentUser) return false;
    openLogin(() => route());
    return true;
  }

  /* ---------------- 판매 등록·수정 ---------------- */
  async function showSell(editId) {
    setTitle(editId ? '상품 수정' : '판매하기');
    window.scrollTo(0, 0);
    if (needLogin('상품을 올리려면 로그인해 주세요.')) return;
    let item = null;
    if (editId) {
      view.innerHTML = '<div class="sell-wrap"><p class="muted">불러오는 중…</p></div>';
      try {
        item = (await api('item', { params: { id: editId } })).item;
        if (!state.me || item.seller_id !== state.me.id) throw new Error('내가 올린 상품만 고칠 수 있습니다.');
      } catch (e) {
        view.innerHTML = `<div class="empty"><h2>고칠 수 없습니다</h2><p>${esc(e.message)}</p></div>`;
        return;
      }
    }
    const v = item || { title: '', category: '', price: '', stock: 1, description: '', status: 'on' };
    view.innerHTML = `
      <div class="sell-wrap">
        <h1>${item ? '상품 수정' : '무엇을 판매하시나요?'}</h1>
        <form class="form panel" id="sellForm" novalidate>
          <div class="drop" id="drop">
            ${safeImg(v.image) ? `<img src="${safeImg(v.image)}" alt="" id="preview">` : '<div id="dropText"><strong>사진 올리기</strong><br><span class="hint">눌러서 고르거나 끌어다 놓으세요 · JPG·PNG·WEBP</span></div>'}
            <input type="file" name="image" accept="image/jpeg,image/png,image/webp" aria-label="상품 사진">
          </div>
          <label>상품명<input name="title" maxlength="100" required value="${esc(v.title)}" placeholder="예) 반응형 랜딩페이지 디자인 템플릿"></label>
          <div class="row2">
            <label>분류<select name="category" required>
              <option value="">고르세요</option>
              ${CATS.map(c => `<option value="${c.key}" ${v.category === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
            </select></label>
            <label>가격 (원) <span class="hint">0원이면 무료 나눔</span><input name="price" type="number" inputmode="numeric" min="0" max="100000000" step="100" required value="${esc(v.price)}"></label>
          </div>
          <div class="row2">
            <label>수량<input name="stock" type="number" inputmode="numeric" min="${item ? 0 : 1}" max="99999" required value="${esc(v.stock)}"></label>
            ${item ? `<label>판매 상태<select name="status"><option value="on" ${v.status !== 'hidden' ? 'selected' : ''}>판매하기 (수량 0이면 품절)</option><option value="hidden" ${v.status === 'hidden' ? 'selected' : ''}>숨기기</option></select></label>` : '<div></div>'}
          </div>
          <label>설명 <span class="hint">상태, 구성, 전달 방법(택배·직거래·파일 전송) 등을 적어 주세요</span><textarea name="description" maxlength="5000">${esc(v.description)}</textarea></label>
          <p class="err" id="sellErr" role="alert"></p>
          <button class="btn btn-amber btn-block" type="submit" id="sellBtn">${item ? '수정 내용 저장' : '판매 시작하기'}</button>
        </form>
      </div>`;

    const form = $('#sellForm');
    const drop = $('#drop');
    let photo = null;   // 줄여 둔 사진 (Blob)
    const fileInput = form.image;
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, () => drop.classList.add('over')));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('over')));
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      if (!f) return;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast('JPG·PNG·WEBP 사진만 올릴 수 있습니다.', true); return; }
      try { photo = await shrink(f); } catch (e) { photo = f; }
      const url = URL.createObjectURL(photo);
      drop.querySelectorAll('img,#dropText').forEach(n => n.remove());
      drop.insertAdjacentHTML('afterbegin', `<img src="${url}" alt="" id="preview">`);
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const err = $('#sellErr');
      err.textContent = '';
      const t = form.title.value.trim();
      if (t.length < 2) { err.textContent = '상품명을 2자 이상 적어 주세요.'; form.title.focus(); return; }
      if (!form.category.value) { err.textContent = '분류를 골라 주세요.'; form.category.focus(); return; }
      if (form.price.value === '' || +form.price.value < 0) { err.textContent = '가격을 적어 주세요.'; form.price.focus(); return; }
      if (form.stock.value === '' || (!item && +form.stock.value < 1)) { err.textContent = '수량을 적어 주세요.'; form.stock.focus(); return; }
      const fd = new FormData();
      ['title', 'category', 'price', 'stock', 'description'].forEach(k => fd.append(k, form[k].value.trim()));
      if (item) { fd.append('id', item.id); fd.append('status', form.status.value); }
      if (photo) fd.append('image', photo, 'photo.jpg');
      const btn = $('#sellBtn');
      btn.disabled = true; btn.textContent = '저장하는 중…';
      try {
        const r = await api(item ? 'update' : 'create', { form: fd });
        state.list = null;
        toast(item ? '수정했습니다.' : '상품을 올렸습니다!');
        location.hash = '#/item/' + r.id;
      } catch (e2) {
        err.textContent = e2.message;
        btn.disabled = false; btn.textContent = item ? '수정 내용 저장' : '판매 시작하기';
      }
    });
  }

  /** 사진을 올리기 전에 긴 변 1600px 로 줄여 업로드 시간을 줄입니다. */
  function shrink(file) {
    return new Promise((resolve, reject) => {
      if (file.size < 400 * 1024) return resolve(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        c.toBlob(b => (b ? resolve(b) : reject()), 'image/jpeg', 0.86);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /* ---------------- 내 거래 ---------------- */
  function showMy(tab) {
    setTitle('내 거래');
    if (needLogin('내 거래를 보려면 로그인해 주세요.')) return;
    const tabs = [['buyer', '구매 내역'], ['seller', '판매 주문'], ['listings', '내 상품'], ['profile', '내 정보']];
    if (!tabs.some(t => t[0] === tab)) tab = 'buyer';
    view.innerHTML = `
      <section class="hero"><div><h1>내 거래</h1><p>${esc(state.me ? state.me.nickname : '')} 님의 구매·판매 현황입니다. 새 주문은 자동으로 반영됩니다.</p></div>
        <a class="btn btn-amber" href="#/sell">새 상품 올리기</a></section>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a class="tab" role="tab" href="#/my/${k}" aria-selected="${k === tab}">${l}${k === 'seller' && state.me && state.me.to_ship ? `<span class="badge">${state.me.to_ship}</span>` : ''}${k === 'buyer' && state.me && state.me.to_confirm ? `<span class="badge">${state.me.to_confirm}</span>` : ''}</a>`).join('')}</div>
      <div id="myBody"><div class="list">${'<div class="order skel"><div class="mini thumb"></div><div><div class="sk" style="width:60%"></div><div class="sk" style="width:30%"></div></div></div>'.repeat(3)}</div></div>`;
    if (tab === 'profile') return showProfile();
    if (tab === 'listings') return loadMyListings();
    loadOrders(tab, false);
    every(15000, () => loadOrders(tab, true));   // 15초마다 새 주문·상태 확인
  }

  let ordersState = null;
  async function loadOrders(role, quiet, more) {
    const body = $('#myBody');
    try {
      const params = { role };
      if (more && ordersState && ordersState.next) params.cursor = ordersState.next;
      const d = await api('orders', { params });
      const items = more ? ordersState.items.concat(d.items) : d.items;
      if (quiet && ordersState && JSON.stringify(ordersState.items.slice(0, d.items.length)) === JSON.stringify(d.items)) return;
      ordersState = { role, items, next: d.next };
      if (!$('#myBody')) return;
      paintOrders(role);
      if (quiet) refreshMe();
    } catch (e) {
      if (!quiet) body.innerHTML = `<div class="empty"><h2>불러오지 못했습니다</h2><p>${esc(e.message)}</p></div>`;
    }
  }

  function paintOrders(role) {
    const body = $('#myBody');
    const items = ordersState.items;
    if (!items.length) {
      body.innerHTML = role === 'buyer'
        ? '<div class="empty"><h2>아직 구매한 상품이 없어요</h2><p>마음에 드는 상품을 찾아보세요.</p><a class="btn btn-dark" href="#/">둘러보기</a></div>'
        : '<div class="empty"><h2>아직 들어온 주문이 없어요</h2><p>상품을 올리면 주문이 여기에 쌓입니다.</p><a class="btn btn-amber" href="#/sell">상품 올리기</a></div>';
      return;
    }
    body.innerHTML = `<div class="list">${items.map(o => {
      const acts = [];
      if (role === 'seller' && o.status === 'requested') acts.push(`<button class="btn btn-dark btn-sm" data-act="ship" data-id="${o.id}">발송 완료로 바꾸기</button>`);
      if (role === 'buyer' && o.status === 'shipped') acts.push(`<button class="btn btn-amber btn-sm" data-act="complete" data-id="${o.id}">수령 확인</button>`);
      if (o.status === 'requested') acts.push(`<button class="btn btn-line btn-sm" data-act="cancel" data-id="${o.id}">주문 취소</button>`);
      return `<div class="order">
        <a class="mini" href="#/item/${o.listing_id}">${thumb({ image: o.image, category: o.category })}</a>
        <div>
          <span class="st st-${o.status}">${ORDER_ST[o.status]}</span>
          <h3><a href="#/item/${o.listing_id}">${esc(o.title)}</a></h3>
          <div class="sub">${o.qty}개 · ${won(o.total)} · ${role === 'seller' ? '구매자' : '판매자'} ${esc(o.partner)} · ${ago(o.created_at)}</div>
          ${o.buyer_note ? `<div class="note">${role === 'seller' ? '구매자 메모: ' : '내 메모: '}${esc(o.buyer_note)}</div>` : ''}
        </div>
        <div class="acts">${acts.join('')}</div>
      </div>`;
    }).join('')}</div>${ordersState.next ? '<div class="more"><button class="btn btn-line" id="moreOrders">더 보기</button></div>' : ''}`;
    body.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => orderAction(+b.dataset.id, b.dataset.act, role, b)));
    const m = $('#moreOrders');
    if (m) m.addEventListener('click', () => loadOrders(role, false, true));
  }

  async function orderAction(id, act, role, btn) {
    const ask = { ship: '물건(파일)을 보냈나요? 발송 완료로 바꿉니다.', complete: '물건을 잘 받으셨나요? 거래를 완료합니다.', cancel: '이 주문을 취소할까요?' }[act];
    if (!confirm(ask)) return;
    btn.disabled = true;
    try {
      await api('order', { body: { id, action: act } });
      toast({ ship: '발송 완료로 바꿨습니다.', complete: '거래가 완료되었습니다. 감사합니다!', cancel: '주문을 취소했습니다.' }[act]);
      state.list = null;
      await loadOrders(role, false);
      refreshMe();
    } catch (e) {
      toast(e.message, true);
      btn.disabled = false;
      loadOrders(role, false);
    }
  }

  async function loadMyListings() {
    const body = $('#myBody');
    try {
      const d = await api('my_listings');
      if (!$('#myBody')) return;
      if (!d.items.length) {
        body.innerHTML = '<div class="empty"><h2>올린 상품이 없어요</h2><p>첫 상품을 올려 보세요.</p><a class="btn btn-amber" href="#/sell">상품 올리기</a></div>';
        return;
      }
      body.innerHTML = `<div class="list">${d.items.map(it => `
        <div class="order">
          <a class="mini" href="#/item/${it.id}">${thumb(it)}</a>
          <div><span class="st st-${it.status}">${LIST_ST[it.status]}</span>
            <h3><a href="#/item/${it.id}">${esc(it.title)}</a></h3>
            <div class="sub">${won(it.price)} · 남은 수량 ${it.stock}개 · 판매 ${it.sold}개 · ${ago(it.created)}</div></div>
          <div class="acts"><a class="btn btn-line btn-sm" href="#/sell/${it.id}">수정</a></div>
        </div>`).join('')}</div>`;
    } catch (e) {
      body.innerHTML = `<div class="empty"><h2>불러오지 못했습니다</h2><p>${esc(e.message)}</p></div>`;
    }
  }

  function showProfile() {
    const me = state.me || {};
    $('#myBody').innerHTML = `
      <form class="form panel profile" id="nickForm">
        <label>별명 <span class="hint">상품과 주문에 판매자·구매자 이름으로 보입니다</span>
          <input name="nickname" maxlength="20" value="${esc(me.nickname || '')}" required></label>
        <p class="muted" style="margin:0;font-size:14px">로그인 이메일: ${esc(me.email || '')}</p>
        <p class="err" id="nickErr" role="alert"></p>
        <button class="btn btn-dark" type="submit">저장</button>
      </form>`;
    $('#nickForm').addEventListener('submit', async e => {
      e.preventDefault();
      $('#nickErr').textContent = '';
      try {
        const r = await api('nickname', { body: { nickname: e.target.nickname.value.trim() } });
        if (state.me) state.me.nickname = r.nickname;
        state.list = null;
        toast('별명을 바꿨습니다.');
      } catch (err) { $('#nickErr').textContent = err.message; }
    });
  }
})();
