// 취향컷 시험판 화면
// 화면: 시작 → 본 영화 고르기 → 발견(홈) · 영화(추천 이유) · 감상 기록 · 취향 · 찜 · 내 기록
//       + 베타: 계정(로그인·가입) · 영화별 토론 · 개봉 알림 찜 · 관리
// 계산은 engine.js (시험 스크립트와 같은 코드), 데이터는 data/*.js, 내 기록은 이 브라우저(localStorage)에 저장하고
// 베타 계정으로 로그인하면 서버(server/api.js)에도 맞춰 둔다 (폰·PC 같은 기록, 토론 '취향 비슷한 순' 계산용).
(function () {
  'use strict';

  const MV = window.TC_MOVIES, PANEL = window.TC_PANEL, CALIB = window.TC_CALIB;
  const NC = window.TC_NEWCALIB || null; // 신작 확률 계산식 (tools/08_newrelease_experiment.js 시험 결과)
  const HTTP = /^https?:$/.test(location.protocol);
  // 폰판(GitHub 에 올린 홈 화면 앱, app/phone.js 가 켬): 서버 없이 돈다
  //  — 신작은 PC 에서 올릴 때 찍어 둔 목록(TC_NEWSNAP)을 쓰고, 계정·토론·폰 알림은 없다
  const PHONE = !!window.TC_PHONE;
  const SERVER = HTTP && !PHONE; // 취향컷 서버(tools/serve.js)로 켰을 때만 되는 기능
  const NEWS = SERVER || (PHONE && !!window.TC_NEWSNAP); // 신작 목록을 볼 수 있나
  const TMDB_LOGO = 'https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg';
  const app = document.getElementById('app');
  const tabbar = document.getElementById('tabbar');
  const toastEl = document.getElementById('toast');
  const modal = document.getElementById('modal');

  const GOAL = 15;       // 첫 화면 목표 평가 수 (시험에서 15편이면 평균 방식보다 6%p 더 맞힘)
  const MIN_RATED = 5;   // 이보다 적게 평가하면 확률을 보여 주지 않음
  const PREF_TH = 0.15;  // 재미 요소 취향을 '중요/덜 따짐'으로 부르는 기준

  // 재미 요소 6개 — 세 화면(기분 버튼·맞는 포인트·기록 막대)이 모두 이 목록을 쓴다
  const TRAITS = [
    { key: 'laugh', name: '웃음', icon: 'smile', words: ['거의 없음', '적은 편', '보통', '많은 편', '아주 많음'], ends: ['거의 안 웃김', '배꼽 빠짐'] },
    { key: 'tension', name: '몰입', icon: 'target', words: ['느슨함', '약한 편', '보통', '쫄깃한 편', '손에 땀'], ends: ['느슨함', '손에 땀'] },
    { key: 'action', name: '액션', icon: 'flame', words: ['거의 없음', '적은 편', '보통', '많은 편', '화끈함'], ends: ['거의 없음', '화끈함'] },
    { key: 'pace', name: '전개 속도', icon: 'fast', words: ['아주 느림', '느린 편', '보통', '빠른 편', '아주 빠름'], ends: ['아주 느림', '아주 빠름'] },
    { key: 'afterglow', name: '여운', icon: 'moon', words: ['거의 없음', '옅은 편', '보통', '진한 편', '아주 진함'], ends: ['남는 게 없음', '오래 남음'] },
    { key: 'story', name: '개연성', icon: 'book', words: ['아주 허술', '허술한 편', '보통', '탄탄한 편', '아주 탄탄'], ends: ['아주 허술', '아주 탄탄'] },
  ];
  // 맞는 이유·아쉬울 수 있는 점 문장: 많고+중요(goodHigh), 적고+중요(badLow), 많고+덜 좋아함(badHigh), 적고+덜 좋아함(goodLow)
  const WHY = {
    laugh: { goodHigh: '남들보다 중요하게 보는 웃음이 많아요.', badLow: '웃음은 적은 편이에요.', badHigh: '웃음 위주라 진지한 걸 원하면 가벼울 수 있어요.', goodLow: '웃기기보다 진지한 분위기예요.' },
    tension: { goodHigh: '좋아하는 쫄깃한 긴장감이 있어요.', badLow: '긴장감은 약한 편이에요.', badHigh: '긴장감이 커서 편하게 보기엔 무거울 수 있어요.', goodLow: '긴장감이 약해 편하게 볼 수 있어요.' },
    action: { goodHigh: '좋아하는 액션이 화끈해요.', badLow: '액션은 적은 편이에요.', badHigh: '액션이 많아 정신없게 느낄 수 있어요.', goodLow: '액션보다 이야기 중심이에요.' },
    pace: { goodHigh: '전개가 빨라 지루할 틈이 적어요.', badLow: '전개가 느린 편이라 지루할 수 있어요.', badHigh: '전개가 빨라 정신없게 느낄 수 있어요.', goodLow: '차분하게 흘러가요.' },
    afterglow: { goodHigh: '좋아하는 진한 여운이 남아요.', badLow: '보고 나서 남는 여운은 옅은 편이에요.', badHigh: '여운이 진한 편이라 무겁게 느껴질 수 있어요.', goodLow: '여운이 옅어 가볍게 보기 좋아요.' },
    story: { goodHigh: '이야기가 탄탄해요.', badLow: '개연성이 허술한 편이라, 이야기를 꼼꼼히 따지면 아쉬울 수 있어요.', badHigh: '', goodLow: '개연성은 허술한 편이지만, 원래 크게 따지지 않는 편이에요.' },
  };
  const REACT = {
    1: { label: '재밌었어요', cls: 'like', icon: 'happy' },
    0: { label: '보통이에요', cls: 'mid', icon: 'neutral' },
    '-1': { label: '아쉬웠어요', cls: 'dis', icon: 'sad' },
  };
  const PALETTE = [['#ffb547', '#6e3410'], ['#5b7cfa', '#131c45'], ['#ff6a4d', '#4a1210'], ['#2cc6c0', '#0f3a3d'], ['#a78bfa', '#2b1d52'], ['#5fd39a', '#123a2b']];
  const AVATAR = ['#d4f25a', '#b9a3ff', '#ffc061', '#7fd8ff', '#ff9ec7'];

  const PATHS = {
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    flame: '<path d="M12 3c.6 3 4.5 4.6 4.5 9.2A4.5 4.5 0 0 1 12 17a4.5 4.5 0 0 1-4.5-4.6c0-2 1-3.4 2.1-4.4.2 1.5 1 2.4 1.9 2.8-.1-2.8.1-5.2.5-7.8z"/><path d="M6 20.5h12"/>',
    fast: '<path d="M4 6.5l7 5.5-7 5.5zM12.5 6.5l7 5.5-7 5.5z"/>',
    moon: '<path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z"/>',
    book: '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15.5H5.5c-.8 0-1.5.6-1.5 1.4zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15.5h5.5c.8 0 1.5.6 1.5 1.4z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01" stroke-width="2.2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    bookmark: '<path d="M6.5 4h11v16.5l-5.5-3.8-5.5 3.8z"/>',
    people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M15.5 14.4c2.4-.2 4.4 1.2 5 4.1"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    happy: '<circle cx="12" cy="12" r="9"/><path d="M8 13.5c1 1.8 2.3 2.7 4 2.7s3-.9 4-2.7"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>',
    neutral: '<circle cx="12" cy="12" r="9"/><path d="M8.5 15h7"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>',
    sad: '<circle cx="12" cy="12" r="9"/><path d="M8 16.2c1-1.6 2.3-2.4 4-2.4s3 .8 4 2.4"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>',
    eyeoff: '<path d="M4 4l16 16"/><path d="M9.5 5.6a9.8 9.8 0 0 1 2.5-.3c4.6 0 8 3.6 9 6.7-.4 1.2-1.1 2.4-2 3.5M6.6 6.9C4.8 8.1 3.6 9.9 3 12c1 3.1 4.4 6.7 9 6.7 1.5 0 2.9-.4 4.1-1"/>',
    sparkle: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16v4M16.5 18h4"/>',
    film: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4"/>',
    heart: '<path d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6z"/>',
    reply: '<path d="M4.5 5.5h15v10h-9l-4 3.5v-3.5h-2z"/>',
    more: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3"/>',
    bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    share: '<path d="M12 3.5v11M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5v6.5h14v-6.5"/>',
    tv: '<rect x="3" y="5.5" width="18" height="12" rx="2"/><path d="M8.5 20.5h7M12 17.5v3"/>',
    talk: '<path d="M4 5.5h11v8H8.5L5 16.5v-3H4z"/><path d="M15 9.5h5v8h-1v3l-3.5-3H10v-2.5"/>',
    user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-4 3.9-6.2 7.5-6.2s6.7 2.2 7.5 6.2"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
    shield: '<path d="M12 3.5l7 2.8v5.2c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6.3z"/>',
  };
  const icon = (name, attrs) => `<svg viewBox="0 0 24 24" aria-hidden="true"${attrs || ''}>${PATHS[name]}</svg>`;

  // ── 작은 도우미
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = v => Math.round(v * 100) + '%';
  const N = MV.ko.length;
  const title = m => MV.ko[m] || MV.en[m];
  const genres = (m, k) => MV.genres[m].slice(0, k || 2).join('·');
  const meta = m => [MV.year[m], genres(m)].filter(Boolean).join(' · ');
  const lvOf = v => (v < 20 ? 0 : v < 40 ? 1 : v < 60 ? 2 : v < 80 ? 3 : 4);
  const josa = (w, a, b) => {
    const c = w.charCodeAt(w.length - 1);
    return w + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? a : b);
  };
  const norm = s => String(s || '').toLowerCase().replace(/[\s:·\-'".,!?()]/g, '');
  const NORM_KO = MV.ko.map(norm), NORM_EN = MV.en.map(norm);
  // 줄바꿈을 살린 글 (토론 글): 먼저 글자로 바꾼(esc) 다음 줄바꿈만 <br>
  const lines = s => esc(s).replace(/\n/g, '<br>');
  // 날짜: 이 기기 기준 오늘 'YYYY-MM-DD', 개봉까지 남은 날, '3시간 전' 같은 말
  const pad2 = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const daysUntil = day => Math.round((Date.parse(day + 'T00:00:00') - Date.parse(todayStr() + 'T00:00:00')) / 86400000);
  const md = day => { const [, m, d] = String(day).split('-'); return `${+m}월 ${+d}일`; };
  const ddayText = day => { const n = daysUntil(day); return n > 0 ? `D-${n}` : n === 0 ? '오늘 개봉' : '개봉함'; };
  function ago(t) {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return '방금';
    if (s < 3600) return `${Math.floor(s / 60)}분 전`;
    if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
    if (s < 172800) return '어제';
    const d = new Date(t);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }

  // 포스터 자리: TMDB 포스터(세로)·배경 그림(가로)을 쓴다 — 시험판(개인·비상업)이라 출처를 밝히고 씀, 출시 전엔 이용 허락 다시 확인.
  // TMDB 그림이 없거나 못 불러오면 뒤에 깔린 재미 요소 그림(assets/art), 그것도 없으면 그라데이션이 보인다.
  const TP = window.TC_POSTERS || null; // { p: 포스터 경로[], b: 배경 그림 경로[] } (tools/09_tmdb_catalog.js)
  const tmdbImg = (p, w) => `https://image.tmdb.org/t/p/${w}${p}`;
  const ART_OK = {}; // 그림 이름 → 실제로 쓸 파일 주소 (가벼운 web/*.webp 우선, 없으면 원본 png)
  function dominant(m) {
    const tr = MV.traits[m];
    let b = 0;
    for (let t = 1; t < 6; t++) if (tr[t] > tr[b]) b = t;
    return b;
  }
  const artKey = m => `${TRAITS[dominant(m)].key}-${1 + (m % 2)}`;
  // wide: 가로 카드(오늘의 영화·숨은 꿀잼)는 배경 그림, 세로 자리는 포스터
  function posterStyle(m, wide, w) {
    const layers = [];
    const tp = TP && (wide ? TP.b[m] || TP.p[m] : TP.p[m]);
    if (tp) layers.push(`url('${tmdbImg(tp, w || (wide ? 'w780' : 'w185'))}')`);
    const key = artKey(m);
    if (ART_OK[key]) layers.push(`url('${ART_OK[key]}')`);
    if (layers.length) return `background-image:${layers.join(',')};background-size:cover;background-position:center`;
    const [c1, c2] = PALETTE[dominant(m)];
    return `background:radial-gradient(130% 90% at 90% 0%, ${c1} 0%, transparent 62%), linear-gradient(${120 + (m * 47) % 90}deg, ${c2} 0%, #11171c 100%)`;
  }
  function poster(m, size) {
    if (size !== 'hero') {
      // 실제 포스터가 있으면 그대로, 없으면 가장 두드러진 재미 요소 그림·아이콘
      const real = !!(TP && TP.p[m]);
      const t = TRAITS[dominant(m)], art = ART_OK[artKey(m)];
      const w = { sm: 'w154', md: 'w185', big: 'w342' }[size] || 'w185';
      const inner = real ? '' : size === 'sm' ? (art ? '' : icon(t.icon)) : `${art ? '' : icon(t.icon)}<span class="poster-trait">${t.name}</span>`;
      return `<div class="poster poster-${size}${art || real ? ' has-art' : ''}${real ? ' real' : ''}" style="${posterStyle(m, false, w)}" aria-hidden="true">${inner}</div>`;
    }
    return `<div class="poster poster-${size}" style="${posterStyle(m, true, 'w780')}" aria-hidden="true"><div class="poster-title">${esc(title(m))}</div><div class="poster-year">${MV.year[m] || ''}</div></div>`;
  }
  // 가로로 넘기는 줄: PC에서는 양옆 화살표 버튼도 (폰은 손가락으로 넘김)
  const hrow = (inner, busy) => `<div class="hrow"><button class="hbtn prev" data-act="hscroll" data-dir="-1" aria-label="왼쪽으로 넘기기">${icon('back')}</button><div class="hscroll"${busy ? ' aria-busy="true"' : ''}>${inner}</div><button class="hbtn next" data-act="hscroll" data-dir="1" aria-label="오른쪽으로 넘기기">${icon('right')}</button></div>`;
  // 그림 파일이 있는지 한 번 확인하고, 있으면 화면을 다시 그린다
  function probeArt(done) {
    const keys = ['welcome'];
    TRAITS.forEach(t => keys.push(t.key + '-1', t.key + '-2'));
    let left = keys.length, any = false;
    const tryLoad = (k, urls) => {
      const im = new Image();
      im.onload = () => { ART_OK[k] = urls[0]; any = true; if (--left === 0) done(any); };
      im.onerror = () => { if (urls.length > 1) tryLoad(k, urls.slice(1)); else if (--left === 0) done(any); };
      im.src = urls[0];
    };
    keys.forEach(k => tryLoad(k, [`assets/art/web/${k}.webp`, `assets/art/${k}.png`]));
  }

  // ── 데이터 풀기 + 계산 엔진
  function b64(str) {
    const bin = atob(str), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  let engine = null;
  function initEngine() {
    if (MV.traitKeys.join() !== TRAITS.map(t => t.key).join()) throw new Error('재미 요소 순서가 데이터와 다름');
    const traits01 = new Float32Array(N * 6);
    for (let m = 0; m < N; m++) for (let t = 0; t < 6; t++) traits01[m * 6 + t] = MV.traits[m][t] / 100;
    engine = window.TasteEngine.create({
      movieCount: N,
      crowdLike: Float32Array.from(MV.crowdLike),
      crowdLevel: Float32Array.from(MV.crowdLevel),
      offsets: new Uint32Array(b64(PANEL.offsets).buffer),
      items: new Uint16Array(b64(PANEL.items).buffer),
      traits: traits01,
      traitCount: 6,
    }, CALIB && CALIB.settings);
  }

  // ── 내 기록 (이 브라우저에만 저장)
  const KEY = 'tastecut.v1';
  let storageOK = true;
  // newRatings·savedNew: 신작(우리 영화 목록 밖, TMDB 번호로 기록) 평가·찜
  //  savedNew[번호] = { title, poster, kind, at, release(개봉 예정작만 'YYYY-MM-DD'), p(찜할 때 맞을 확률), alerted(개봉 알림을 봤음) }
  // at: 마지막으로 고친 때 — 로그인한 기기끼리 기록을 맞출 때 더 최근 것을 고른다
  // origin: 발견 화면 '전체 · 한국 · 외국' 고르기 ('all' · 'kr' · 'fx')
  // myOtt: 내가 구독하는 OTT(볼 곳 번호), ottOnly: 그 OTT 에서 볼 수 있는 영화만 추천
  const fresh = () => ({ v: 1, ratings: {}, saved: {}, skipped: [], mood: [], origin: 'all', myOtt: [], ottOnly: false, onboarded: false, newRatings: {}, savedNew: {}, at: 0 });
  function loadState() {
    try {
      localStorage.setItem(KEY + '.test', '1');
      localStorage.removeItem(KEY + '.test');
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.v === 1) return Object.assign(fresh(), s);
    } catch (e) { storageOK = false; }
    return fresh();
  }
  function writeLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOK = false; }
  }
  function persist() {
    state.at = Date.now();
    writeLocal();
    scheduleSync();
  }
  let state = loadState();
  const ratedCount = () => Object.keys(state.ratings).length;

  // 계산 결과는 기록이 바뀔 때만 다시 만든다
  let calc = null, selfCache = null;
  function changed() { calc = null; selfCache = null; persist(); }
  function ratingList() { return Object.keys(state.ratings).map(k => [+k, state.ratings[k].s]); }
  function overrides() {
    const o = {};
    for (const k in state.ratings) if (state.ratings[k].traits) o[k] = state.ratings[k].traits.map(v => (v == null ? null : (v - 1) / 4));
    return o;
  }
  function getCalc() {
    if (!calc) {
      const ctx = engine.score(ratingList(), overrides());
      calc = { ctx, all: engine.predictAll(ctx) };
    }
    return calc;
  }

  // ── 알림·창
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
  }
  function openModal(html) {
    modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    modal.hidden = false;
    const f = modal.querySelector('button');
    if (f) f.focus();
  }
  function closeModal() { modal.hidden = true; modal.innerHTML = ''; }

  // ── 베타 계정 · 서버와 기록 맞추기
  //  로그인 정보(입장권)는 이 기기에만 둔다. 비밀번호는 저장하지 않는다.
  const ACC_KEY = 'tastecut.account';
  let account = null;
  try { account = JSON.parse(localStorage.getItem(ACC_KEY) || 'null'); } catch (e) { account = null; }
  function setAccount(a) {
    account = a;
    try { if (a) localStorage.setItem(ACC_KEY, JSON.stringify(a)); else localStorage.removeItem(ACC_KEY); } catch (e) { /* 저장 안 되는 창 */ }
  }
  async function api(method, path, body) {
    if (!SERVER) return { ok: false, status: 0, data: null, error: "베타 기능은 '취향컷 시작.bat'으로 켰을 때만 돼요" };
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (account) headers.Authorization = 'Bearer ' + account.token;
    let r;
    try { r = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); } catch (e) {
      return { ok: false, status: 0, data: null, error: '서버에 연결하지 못했어요. 인터넷 연결이나 서버가 켜져 있는지 확인해 주세요' };
    }
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (r.status === 401 && account && headers.Authorization) {
      setAccount(null); // 입장권이 끊김 (다른 곳에서 비밀번호를 바꿨거나 탈퇴)
      toast('로그인이 풀렸어요. 다시 로그인해 주세요');
    }
    return { ok: r.ok, status: r.status, data, error: (data && data.error) || (r.ok ? null : `문제가 생겼어요 (${r.status})`) };
  }

  // 기록 맞추기: 고칠 때마다 1.2초 뒤 서버로 (여러 번 빨리 고치면 한 번에)
  let syncTimer = 0, syncing = null, syncInfo = { at: 0, error: null };
  function scheduleSync() {
    if (!account || !SERVER) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncNow(); }, 1200);
  }
  async function syncNow() {
    if (!account || !SERVER) return true;
    clearTimeout(syncTimer);
    while (syncing) await syncing;
    syncing = (async () => {
      let r = await api('PUT', '/api/me/state', { state, at: state.at || 0 });
      if (r.ok && r.data && r.data.conflict) {
        // 다른 기기에서 더 나중에 고친 기록이 있음 → 둘을 합친 뒤 다시 보냄 (평가·찜은 더 최근 것을 남김)
        adoptState(mergeStates(state, r.data.state || fresh()), true);
        r = await api('PUT', '/api/me/state', { state, at: state.at });
      }
      syncInfo = r.ok ? { at: Date.now(), error: null } : { at: syncInfo.at, error: r.error };
      return r.ok;
    })();
    try { return await syncing; } finally { syncing = null; }
  }
  function mergeStates(a, b) {
    const out = Object.assign(fresh(), b, { mood: a.mood || b.mood || [] });
    const newer = (x, y) => (!x ? y : !y ? x : (x.at || 0) >= (y.at || 0) ? x : y);
    for (const f of ['ratings', 'newRatings', 'savedNew']) {
      out[f] = Object.assign({}, b[f] || {});
      for (const k in a[f] || {}) out[f][k] = newer(a[f][k], out[f][k]);
    }
    out.saved = Object.assign({}, b.saved || {}, a.saved || {});
    out.skipped = [...new Set([...(b.skipped || []), ...(a.skipped || [])])];
    out.onboarded = !!(a.onboarded || b.onboarded);
    out.at = Date.now();
    return out;
  }
  // 서버 기록으로 바꾸기 (bump: 고친 때를 지금으로 — 합친 기록을 다시 올릴 때)
  function adoptState(s, bump) {
    state = Object.assign(fresh(), s);
    if (bump) state.at = Date.now();
    calc = null; selfCache = null;
    writeLocal();
  }
  const hasLocalData = () => ratedCount() > 0 || Object.keys(state.newRatings).length > 0 || Object.keys(state.saved).length > 0 || Object.keys(state.savedNew).length > 0;

  // 로그인 직후·앱을 열 때: 서버 기록과 이 기기 기록을 맞춘다
  async function pullState(mode) {
    const r = await api('GET', '/api/me/state');
    if (!r.ok) return;
    const server = r.data.state, at = r.data.at || 0;
    const serverHas = server && (Object.keys(server.ratings || {}).length || Object.keys(server.newRatings || {}).length);
    if (!serverHas) { await syncNow(); rerender(); return; } // 계정에 기록이 없음 → 이 기기 기록을 올림
    // 이 기기 평가가 모두 계정에 같은 반응으로 있으면 물어볼 것 없이 계정 기록을 쓴다
    const inServer = (mine, theirs) => Object.keys(mine || {}).every(k => theirs && theirs[k] && theirs[k].s === mine[k].s);
    const covered = inServer(state.ratings, server.ratings) && inServer(state.newRatings, server.newRatings) && Object.keys(state.saved).every(k => server.saved && server.saved[k]) && Object.keys(state.savedNew).every(k => server.savedNew && server.savedNew[k]);
    if (mode === 'login' && hasLocalData() && !covered) {
      const nLocal = ratedCount() + Object.keys(state.newRatings).length;
      const nServer = Object.keys(server.ratings || {}).length + Object.keys(server.newRatings || {}).length;
      pendingMerge = { server, at };
      openModal(`<h3>이 기기 기록을 계정에 합칠까요?</h3>
        <p>이 기기에 평가 ${nLocal}편, 계정에 평가 ${nServer}편이 있어요.</p>
        <p>합치면 둘 다 남고, 같은 영화는 더 최근에 고친 기록을 써요. 다른 사람이 쓰던 기기라면 '계정 기록만 쓰기'를 골라 주세요.</p>
        <div class="sheet-actions"><button class="btn grow" data-act="mergeNo">계정 기록만 쓰기</button><button class="btn primary grow" data-act="mergeYes">합치기</button></div>`);
      return;
    }
    // 로그인: 계정 기록이 이 기기 기록을 다 담고 있으니 계정 기록을 쓴다 / 앱을 다시 열 때: 더 나중에 고친 쪽을 쓴다
    if (mode === 'login' || at > (state.at || 0)) { adoptState(server, false); state.at = at; writeLocal(); rerender(); } else if ((state.at || 0) > at) await syncNow();
  }
  let pendingMerge = null;
  // 지금 화면을 그 자리에서 다시 그린다 (스크롤 유지)
  function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }

  // ── 화면 이동
  const navStack = [];
  const scrollMemo = {};
  let searchQuery = '';
  let recLimit = 5;
  let histFilter = 'all';
  let onbTarget = GOAL;
  let onbUndo = [];

  function parse() {
    const h = location.hash.replace(/^#\/?/, '');
    const i = h.indexOf('/');
    return i < 0 ? { name: h, arg: '' } : { name: h.slice(0, i), arg: h.slice(i + 1) };
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function back() {
    if (navStack.length > 1) history.back();
    else go('#/home');
  }

  const TABS = ['home', 'taste', 'saved', 'history'];
  let currentScreen = '', shownHash = '';
  function render() {
    let { name, arg } = parse();
    if (name === 'login' && currentScreen !== 'login') loginFrom = shownHash; // 로그인 뒤 돌아갈 화면
    // 처음 쓰는 사람: 시작·본 영화 고르기 (로그인 화면과 토론·개봉 알림 화면은 먼저 열어 볼 수 있게)
    if (!state.onboarded && !['welcome', 'onboard', 'login', 'talk', 'new'].includes(name)) name = ratedCount() ? 'onboard' : 'welcome';
    if (state.onboarded && (name === '' || name === 'welcome')) name = 'home';
    const screens = { welcome, onboard, home, movie, rate, taste, saved, history: historyScreen, new: newScreen, login: loginScreen, account: accountScreen, admin: adminScreen, talk: talkScreen, quick: quickScreen, browse: browseScreen };
    app.innerHTML = (screens[name] || home)(arg);
    const tab = TABS.includes(name);
    tabbar.hidden = !tab;
    app.classList.toggle('no-tab', !tab);
    tabbar.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.tab === name));
    const dot = tabbar.querySelector('.tab-dot');
    if (dot) dot.hidden = !dueAlerts().length; // 찜한 영화가 개봉했는데 아직 안 본 알림
    currentScreen = name;
    shownHash = location.hash || '#/home';
    after(name, arg);
    return name;
  }

  // ════════ 시작 화면
  // 앱 표시: 앱 아이콘(Codex 그림). 발견 맨 위는 아이콘만(검색창과 한 줄), 시작 화면은 아이콘 + 이름 (2026-10-24 사용자가 고름)
  const BRAND_ICON = 'assets/art/web/icon.webp';
  const brandMark = `<div class="brand"><img class="brand-icon" src="${BRAND_ICON}" alt="" width="36" height="36"><span class="brand-name">취향컷</span></div>`;
  function welcome() {
    return `<section class="welcome">
      ${ART_OK.welcome ? `<div class="welcome-art" style="background-image:url('${ART_OK.welcome}')" aria-hidden="true"></div>` : ''}
      ${brandMark}
      <h1>남들의 별점보다,<br>나의 취향.</h1>
      <p>본 영화 ${GOAL}편만 알려 주세요. <b class="lime">이번 주 극장 영화와 OTT 신작</b>이 나랑 맞을지 확률로 알려 드려요.</p>
      <div class="steps">
        <div class="step"><b>1</b><span>본 영화를 '재밌었어요 · 보통 · 아쉬웠어요'로 골라요 (1분 정도)</span></div>
        <div class="step"><b>2</b><span>같은 영화에 나처럼 반응한 '취향 쌍둥이'를 찾아요</span></div>
        <div class="step"><b>3</b><span>신작마다 맞을 확률과 이유, 아쉬울 수 있는 점까지 보여 드려요</span></div>
      </div>
      <button class="btn primary block" data-act="start">시작하기</button>
      ${SERVER && !account ? '<a class="btn block" href="#/login">베타 계정이 있어요 · 로그인</a>' : ''}
      ${storageOK ? '' : '<div class="warn-banner">이 브라우저에서는 기록이 저장되지 않아요(사생활 보호 창 등). 창을 닫으면 사라져요.</div>'}
      <p class="notice">시험판이에요. 미국 MovieLens 공개 평가 데이터(관객 1만 명, 2019년까지 나온 영화 ${N.toLocaleString()}편)로 계산해요. 내 기록은 이 기기 브라우저에 저장되고, 베타 계정으로 로그인하면 폰·PC에서 같이 쓸 수 있어요.</p>
    </section>`;
  }

  // ════════ 본 영화 고르기 (첫 화면)
  let ONB_LIST = null;
  function onbList() {
    if (!ONB_LIST) {
      const seen = new Set(MV.onboarding);
      const extra = [];
      for (let m = 0; m < N; m++) if (!seen.has(m) && MV.ko[m] && MV.year[m] >= 1995) extra.push(m);
      extra.sort((a, b) => MV.count[b] - MV.count[a]);
      ONB_LIST = MV.onboarding.concat(extra.slice(0, 300));
    }
    return ONB_LIST;
  }
  function nextOnb() {
    const skipped = new Set(state.skipped);
    return onbList().find(m => !state.ratings[m] && !skipped.has(m));
  }
  function onboard() {
    const n = ratedCount();
    const target = Math.max(onbTarget, state.onboarded ? n + 1 : GOAL);
    if (!state.onboarded && n >= onbTarget) return onboardDone(n);
    const m = nextOnb();
    const top = `<div class="onb-top">
        <button class="icon-btn" data-act="onbUndo" aria-label="방금 고른 것 되돌리기"${onbUndo.length ? '' : ' disabled'}>${icon('back')}</button>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${n}"><i style="width:${Math.min(100, (100 * n) / target)}%"></i></div>
        <div class="onb-count">${n} / ${target}</div>
      </div>`;
    if (m == null) {
      return `${top}<div class="empty">${icon('film')}<p>준비한 영화를 다 봤어요.</p>
        <button class="btn primary" data-act="finishOnboard"${n >= MIN_RATED ? '' : ' disabled'}>추천 보러 가기</button>
        ${n >= MIN_RATED ? '' : `<p class="tiny">${MIN_RATED}편 이상 평가해야 추천할 수 있어요.</p>`}</div>`;
    }
    const left = Math.max(0, GOAL - n);
    return `${top}
      <p class="sub" style="text-align:center;margin:0">${state.onboarded ? '평가가 많을수록 숨은 꿀잼을 더 잘 찾아요' : left ? `본 영화만 골라 주세요 · ${left}편 남았어요` : '거의 다 왔어요'}</p>
      <div class="onb-card">
        ${poster(m, 'big')}
        <h2>${esc(title(m))}</h2>
        <div class="sub">${esc(meta(m))}</div>
        <div class="onb-q">이 영화, 어땠나요?</div>
      </div>
      <div class="react-btns">
        ${[1, 0, -1].map(s => `<button class="react-btn" data-act="onbRate" data-m="${m}" data-s="${s}">${icon(REACT[s].icon)}${REACT[s].label}</button>`).join('')}
      </div>
      <button class="btn block" style="margin-top:10px" data-act="onbSkip" data-m="${m}">${icon('eyeoff')}안 봤어요</button>
      <div class="onb-skip">
        <span class="tiny">안 본 영화 ${state.skipped.length}편 넘김</span>
        ${state.onboarded
          ? '<button class="link-btn" data-act="stopMore">그만하기</button>'
          : n >= MIN_RATED ? '<button class="link-btn" data-act="finishOnboard">이만하고 추천 보기</button>' : ''}
      </div>`;
  }
  function onboardDone(n) {
    const { ctx } = getCalc();
    let twins = 0;
    for (let v = 0; v < ctx.sim.length; v++) if (ctx.sim[v] >= 0.2) twins++;
    const gems = lists(true).gems.length;
    // 숨은 꿀잼을 아직 못 찾았으면 '더 평가하기'를 먼저 권한다 (시험: 평가가 많을수록 더 잘 찾음)
    const more = `<button class="btn${gems ? '' : ' primary'} block" data-act="onbMore">${gems ? '5편 더 평가하기' : '10편 더 평가하고 숨은 꿀잼 찾기'}</button>`;
    const go = `<button class="btn${gems ? ' primary' : ''} block" data-act="finishOnboard">${gems ? '추천 보러 가기' : '이대로 추천 보러 가기'}</button>`;
    return `<section class="welcome">
      ${brandMark}
      <h1>취향 분석 끝!</h1>
      <p>${n}편으로 나와 취향이 꽤 비슷한 관객 <b class="lime">${twins.toLocaleString()}명</b>을 찾았어요.<br>
        ${gems ? `평은 낮지만 내 취향인 <b class="lime">숨은 꿀잼 ${gems}편</b>도 찾았어요.` : '아직 숨은 꿀잼은 못 찾았어요.'}</p>
      <div class="card">${tasteSentence(ctx.prefs)}</div>
      ${gems ? go + more : more + go}
      <p class="tiny" style="margin:0;text-align:center">${gemsHint()}</p>
    </section>`;
  }
  function gemsHint() {
    const g = CALIB && CALIB.gemsByKnown;
    const a = g && g.find(x => x.known === 15), b = g && g.find(x => x.known === 40);
    return a && b ? `평가가 많을수록 숨은 꿀잼을 더 잘 찾아요 (시험: 15편 ${pct(a.found)} → 40편 ${pct(b.found)})` : '평가가 많을수록 숨은 꿀잼을 더 잘 찾아요';
  }

  // ════════ 빠른 평가 (카드 넘기기, 2026-10-24)
  //  본 영화를 금방 많이 평가하게: 오른쪽으로 넘기면 재밌었어요 · 왼쪽 아쉬웠어요 · 위로 보통 · 아래 단추 안 봤어요
  //  PC: → 재밌었어요 · ← 아쉬웠어요 · ↑ 보통 · ↓ 안 봤어요 · Z 되돌리기
  //  보여 줄 순서 = engine.js quickRanker ('안 봤어요'가 많은 연대·인기 구간은 덜, 내 예측이 애매한 영화는 먼저)
  //  QUICK_PARAMS·QUICK_ACC 는 tools/14_quickrate_experiment.js 결과 (시험결과/빠른평가_시험_결과.md)
  const QUICK_PARAMS = { a: 3, b: 1 }; // 시험: 카드 100장에 평가 27.0 → 40.8편, 적중 71.3% → 73.0% ('본 영화 고르기' 순서 대비)
  const QUICK_ACC = [[10, 0.678], [20, 0.695], [40, 0.70], [60, 0.714]]; // 평가 편수별 적중률 (60편까지 간 같은 시험 관객 232명)
  const pct1 = x => (Math.round(x * 1000) / 10).toFixed(1) + '%'; // 정확도 막대는 소수 한 자리 (차이가 1%p 안팎이라)
  // quickQueue: 보여 줄 순서, quickCards: 이번에 넘긴 카드 수(5장마다 순서를 다시 계산), quickPin: 되돌려서 다시 보여 줄 영화
  let quickRank = null, quickQueue = [], quickCards = 0, quickRankedAt = -99, quickPin = null, quickUndo = [], quickDone = 0, quickBusy = false;
  function quickCands() {
    const skipped = new Set(state.skipped), out = [];
    for (let m = 0; m < N; m++) if (MV.ko[m] && (MV.year[m] || 0) >= 1980 && !MV.genres[m].includes('다큐') && !state.ratings[m] && !skipped.has(m)) out.push(m);
    return out;
  }
  // [지금 카드, 그 뒤 카드]
  function quickNext() {
    if (!quickRank) quickRank = window.TasteEngine.quickRanker({ count: MV.count, year: MV.year }, MV.crowdLike, QUICK_PARAMS);
    const skipped = new Set(state.skipped), open = m => m != null && !state.ratings[m] && !skipped.has(m);
    quickQueue = quickQueue.filter(m => open(m) && m !== quickPin);
    if (!quickQueue.length || quickCards - quickRankedAt >= 5) {
      const all = ratedCount() >= MIN_RATED ? getCalc().all : null;
      quickQueue = quickRank(quickCands(), Object.keys(state.ratings).map(Number), state.skipped, all ? m => all.p[m] : null).filter(m => m !== quickPin);
      quickRankedAt = quickCards;
    }
    if (!open(quickPin)) quickPin = null;
    return quickPin != null ? [quickPin, quickQueue[0]] : [quickQueue[0], quickQueue[1]];
  }
  // 정확도 막대: 지금 평가 편수와 다음 목표, 시험에서 그만큼 평가했을 때 적중률
  function quickMeter(n) {
    const next = QUICK_ACC.find(([k]) => k > n), cur = QUICK_ACC.filter(([k]) => k <= n).pop();
    const from = cur ? cur[0] : 0, w = next ? Math.round((100 * (n - from)) / (next[0] - from)) : 100;
    return `<div class="quick-meter">
      <div class="qm-row"><span>평가 <b>${n}편</b>${cur ? ` · 시험에서 이만큼이면 적중 <b class="lime">${pct1(cur[1])}</b>` : ''}</span><span class="tiny">${next ? `${next[0]}편이면 ${pct1(next[1])}` : '충분해요'}</span></div>
      <div class="progress" role="progressbar" aria-label="다음 목표까지" aria-valuemin="${from}" aria-valuemax="${next ? next[0] : n}" aria-valuenow="${n}"><i style="width:${w}%"></i></div>
    </div>`;
  }
  function quickCard(m, cls) {
    return `<div class="qcard${cls ? ' ' + cls : ''}"${cls ? ' aria-hidden="true"' : ` id="qcard" data-m="${m}"`} style="${posterStyle(m, false, 'w342')}">
      ${cls ? '' : `<span class="qstamp like">재밌었어요</span><span class="qstamp dis">아쉬웠어요</span><span class="qstamp mid">보통이에요</span>`}
      <div class="qcard-info"><b>${esc(title(m))}</b><span>${esc(meta(m))}</span></div>
    </div>`;
  }
  function quickScreen() {
    // 다른 화면에서 들어오면 이번 회차 숫자·되돌리기를 새로
    if (currentScreen !== 'quick') { quickDone = 0; quickUndo = []; quickPin = null; quickBusy = false; }
    const n = ratedCount(), [m, after] = quickNext();
    const top = `<div class="quick-top">
        <button class="icon-btn" data-act="quickClose" aria-label="빠른 평가 닫기">${icon('close')}</button>
        <div class="quick-title"><b>빠른 평가</b><span class="tiny">이번에 ${quickDone}편 평가</span></div>
        <button class="icon-btn" data-act="quickUndo" aria-label="방금 넘긴 것 되돌리기"${quickUndo.length ? '' : ' disabled'}>${icon('back')}</button>
      </div>${quickMeter(n)}`;
    if (m == null) return `<section class="quick">${top}<div class="empty">${icon('film')}<p>준비한 영화를 다 넘겼어요.</p><button class="btn primary" data-act="quickClose">닫기</button></div></section>`;
    return `<section class="quick">${top}
      <div class="quick-stack">${after != null ? quickCard(after, 'next') : ''}${quickCard(m)}</div>
      <p class="quick-hint">${matchMedia('(hover: hover) and (pointer: fine)').matches ? '방향키 → 재밌었어요 · ← 아쉬웠어요 · ↑ 보통 · ↓ 안 봤어요 · Z 되돌리기' : '오른쪽으로 넘기면 재밌었어요 · 왼쪽 아쉬웠어요 · 위로 보통'}</p>
      <div class="react-btns quick-btns">
        ${[-1, 0, 1].map(s => `<button class="react-btn ${REACT[s].cls}" data-act="quickRate" data-s="${s}">${icon(REACT[s].icon)}${REACT[s].label}</button>`).join('')}
      </div>
      <button class="btn block" data-act="quickSkip">${icon('eyeoff')}안 봤어요</button>
    </section>`;
  }
  // 카드 하나 처리: s = 1·0·-1 (평가) 또는 'skip'. 카드를 날려 보낸 뒤 다음 카드
  function quickAct(s, fly) {
    const card = document.getElementById('qcard');
    if (!card || quickBusy) return;
    const m = +card.dataset.m;
    quickBusy = true;
    const dir = fly || (s === 1 ? 'right' : s === -1 ? 'left' : s === 0 ? 'up' : 'down');
    card.classList.add('fly-' + dir);
    setTimeout(() => {
      quickBusy = false;
      const before = ratedCount();
      if (s === 'skip') { state.skipped.push(m); quickUndo.push({ type: 'skip', m }); persist(); }
      else { state.ratings[m] = { s, at: Date.now(), pred: null }; quickUndo.push({ type: 'rate', m }); quickDone++; changed(); }
      if (quickPin === m) quickPin = null;
      quickCards++;
      const n = ratedCount(), hit = QUICK_ACC.find(([k]) => before < k && n >= k);
      if (hit) toast(`${hit[0]}편 달성! 시험에서 이만큼 평가하면 적중률 ${pct1(hit[1])}예요`);
      if (currentScreen === 'quick') render();
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  }
  function quickUndoLast() {
    const u = quickUndo.pop();
    if (!u) return;
    if (u.type === 'rate') { delete state.ratings[u.m]; quickDone = Math.max(0, quickDone - 1); changed(); }
    else { state.skipped = state.skipped.filter(x => x !== u.m); persist(); }
    quickPin = u.m; // 되돌린 카드를 바로 다시 보여 준다
    render();
  }
  // 손가락·마우스로 끌기: 오른쪽 재밌었어요 · 왼쪽 아쉬웠어요 · 위 보통 (90px 넘게 끌면)
  function quickGestures() {
    const card = document.getElementById('qcard');
    if (!card) return;
    let sx = 0, sy = 0, on = false;
    const stamp = cls => card.querySelector('.qstamp.' + cls);
    card.addEventListener('pointerdown', e => { if (quickBusy) return; on = true; sx = e.clientX; sy = e.clientY; card.setPointerCapture(e.pointerId); card.classList.add('dragging'); });
    card.addEventListener('pointermove', e => {
      if (!on) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      card.style.transform = `translate(${dx}px, ${Math.min(dy, 40)}px) rotate(${dx / 18}deg)`;
      stamp('like').style.opacity = Math.max(0, Math.min(1, dx / 90));
      stamp('dis').style.opacity = Math.max(0, Math.min(1, -dx / 90));
      stamp('mid').style.opacity = Math.abs(dx) < 70 ? Math.max(0, Math.min(1, -dy / 90)) : 0;
    });
    const end = e => {
      if (!on) return;
      on = false;
      card.classList.remove('dragging');
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (dx > 90) quickAct(1, 'right');
      else if (dx < -90) quickAct(-1, 'left');
      else if (dy < -90 && Math.abs(dx) < 70) quickAct(0, 'up');
      else { card.style.transform = ''; card.querySelectorAll('.qstamp').forEach(x => { x.style.opacity = ''; }); }
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }
  document.addEventListener('keydown', e => {
    if (currentScreen !== 'quick' || e.altKey || e.ctrlKey || e.metaKey || (e.target.closest && e.target.closest('input, textarea'))) return;
    const k = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 0, ArrowDown: 'skip' }[e.key];
    if (k !== undefined) { e.preventDefault(); quickAct(k); }
    else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); quickUndoLast(); }
  });
  // 빠른 평가로 가는 카드 (발견 · 취향 · 내 기록 화면)
  function quickPromo() {
    const n = ratedCount(), next = QUICK_ACC.find(([k]) => k > n);
    return `<a class="card quick-promo" href="#/quick">${icon('sparkle')}<div class="row-main"><b>빠른 평가</b><span class="tiny">넘기기만 하면 돼요 · 지금 ${n}편${next ? ` · ${next[0]}편이면 시험 적중률 ${pct1(next[1])}` : ''}</span></div>${icon('right')}</a>`;
  }

  // ════════ 발견 (홈)
  // 나라 고르기: 발견 화면 전체(신작 4줄 + 지난 영화 추천)에 적용. 검색·찜·기록은 그대로 다 보여 준다
  //  지난 영화는 TMDB '나온 나라'(posters.js 의 kr — tools/09_tmdb_catalog.js), 그게 없으면 위키데이터 제작 나라(movies.js 의 korean)
  //  신작은 newrelease.js 가 붙인 korean, 없으면(옛 목록) 원제에 한글이 있는지로
  const KR_IDX = (window.TC_POSTERS && window.TC_POSTERS.kr) || null;
  const isKoreanIdx = m => (KR_IDX && KR_IDX[m] != null ? KR_IDX[m] === 1 : MV.korean[m] === 1);
  const isKoreanNew = it => (typeof it.korean === 'boolean' ? it.korean : /[가-힣]/.test(it.original != null ? it.original : it.title || ''));
  const KR_TOTAL = MV.ko.reduce((s, _, m) => s + (isKoreanIdx(m) ? 1 : 0), 0);
  const ORIGIN_NAME = { kr: '한국', fx: '외국' };
  const originOK = isKr => !state.origin || state.origin === 'all' || (state.origin === 'kr') === isKr;
  function originBar() {
    const o = ORIGIN_NAME[state.origin] ? state.origin : 'all';
    const btn = (v, label) => `<button class="${o === v ? 'on' : ''}" data-act="origin" data-v="${v}" aria-pressed="${o === v}">${label}</button>`;
    const krExtra = (window.TC_EXTRA ? window.TC_EXTRA.items : []).filter(x => x.k).length;
    const note = o === 'kr' ? `한국 작품만 보여 드려요 · 지난 한국 영화 ${(KR_TOTAL + krExtra).toLocaleString()}편 중에서 골라요.` : o === 'fx' ? '외국 작품만 보여 드려요.' : '';
    return `<div class="origin" role="group" aria-label="어느 나라 작품을 볼까요">${btn('all', '전체')}${btn('kr', '한국')}${btn('fx', '외국')}</div>${note ? `<p class="origin-note">${note}</p>` : ''}`;
  }
  function moodOK(m) {
    for (const k of state.mood) {
      const t = TRAITS.findIndex(x => x.key === k);
      if (MV.traits[m][t] < 60) return false;
    }
    return true;
  }
  function lists(anyOrigin) {
    const { all } = getCalc();
    const cand = [];
    for (let m = 0; m < N; m++) {
      // 홈 추천은 1990년 이후 극영화만 (다큐는 검색으로는 찾을 수 있음). anyOrigin: 나라 고르기와 상관없이 (평가 끝 화면의 숨은 꿀잼 수)
      if (state.ratings[m] || (MV.year[m] || 0) < 1990 || all.conf[m] === 'low' || !moodOK(m) || MV.genres[m].includes('다큐')) continue;
      if (!anyOrigin && (!originOK(isKoreanIdx(m)) || !ottOK({ m }))) continue;
      cand.push(m);
    }
    const p = all.p, c = MV.crowdLike;
    const byP = cand.slice().sort((a, b) => p[b] - p[a]);
    // 오늘의 영화: 남들 평보다 나한테 더 맞는(5%p 이상) 영화 중 확률이 가장 높은 것
    const hero = byP.find(m => p[m] - c[m] >= 0.05);
    if (hero != null) byP.splice(byP.indexOf(hero), 1), byP.unshift(hero);
    return {
      all,
      byP,
      // 시험과 같은 기준: 숨은 꿀잼 = 전체 50% 미만인데 나 60% 이상 / 조심 = 전체 50% 이상인데 나 40% 미만
      gems: cand.filter(m => c[m] < 0.5 && p[m] >= 0.6).sort((a, b) => (p[b] - c[b]) - (p[a] - c[a])),
      caution: cand.filter(m => c[m] >= 0.5 && p[m] < 0.4).sort((a, b) => (c[b] - p[b]) - (c[a] - p[a])),
    };
  }
  function movieRow(m, p, extra) {
    return `<a class="row" href="#/movie/${m}">
      ${poster(m, 'sm')}
      <div class="row-main"><div class="row-title">${esc(title(m))}</div><div class="row-meta">${esc(meta(m))}${extra ? ' · ' + extra : ''}${ottShort({ m }) ? ` · <span class="ott-mini">${esc(ottShort({ m }))}</span>` : ''}</div></div>
      <div class="row-pct${p < 0.5 ? ' low' : ''}"><b>${pct(p)}</b><span>재밌을 확률</span></div>
    </a>`;
  }
  function home() {
    // 맨 위 한 줄: 앱 아이콘 · 검색창 · 안내 (글자 로고 대신 — 위 칸이 줄어 신작이 더 위에 보임)
    const top = `<div class="home-top"><img class="brand-icon" src="${BRAND_ICON}" alt="취향컷" width="38" height="38">
      <div class="search">${icon('search', ' class="s-ico"')}
        <input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="영화 제목 검색" value="${esc(searchQuery)}" aria-label="영화 제목 검색 — 나한테 맞을지 보기">
        <button class="icon-btn s-clear" data-act="clearSearch" aria-label="검색어 지우기"${searchQuery ? '' : ' hidden'}>${icon('close')}</button>
      </div>
      <button class="icon-btn" data-act="about" aria-label="시험판 안내">${icon('info')}</button></div>
      ${storageOK ? '' : '<div class="warn-banner">이 브라우저에서는 기록이 저장되지 않아요(사생활 보호 창 등). 창을 닫으면 사라져요.</div>'}
      <div id="results">${searchQuery.trim() ? searchResults(searchQuery) : ''}</div>`;
    return `${top}<div id="home-body"${searchQuery.trim() ? ' hidden' : ''}>${homeBody()}</div>`;
  }
  function homeBody() {
    const L = lists();
    const p = L.all.p, c = MV.crowdLike;
    const moodNames = TRAITS.filter(t => state.mood.includes(t.key)).map(t => t.name);
    let html = `${alertBanner()}${originBar()}${ottBar()}<div class="new-wrap" id="new-wrap">${newBlockInner()}</div>
      <div id="talk-hot">${hotInner()}</div>
      ${quickPromo()}
      <p class="part-label">지난 영화에서 고르기</p>
      <h2 class="h-xl">오늘은 어떤<br>재미가 필요하세요?</h2>
      <div class="chips scroll" role="group" aria-label="오늘 필요한 재미">
        ${TRAITS.map(t => { const on = state.mood.includes(t.key); return `<button class="chip${on ? ' on' : ''}" data-act="mood" data-k="${t.key}" aria-pressed="${on}">${icon(t.icon)}${t.name}</button>`; }).join('')}
      </div>
      <div class="mood-note">${moodNames.length ? `<span>${esc(josa(moodNames.join('·'), '이', '가'))}${moodNames.length > 1 ? ' 모두' : ''} 많은 영화만 보여 드려요</span><button class="link-btn" data-act="clearMood">선택 지우기</button>` : '<span>여러 개를 함께 고를 수 있어요</span>'}</div>`;
    // 추천 후보 = 우리 목록(취향 쌍둥이로 계산) + 더한 영화(TMDB 한국 영화·2020년 이후, 비슷한 영화 + 평점) — 기분·나라 고르기 적용
    //  (예전엔 우리 목록만 봐서, '한국' + '웃음'처럼 고르면 우리 목록의 한국 영화 75편 안에서만 찾다가 빈 화면이 됐음)
    const pool = recPool({ mood: true }).filter(x => originOK(x.kr) && x.year >= 1990).sort((a, b) => b.p - a.p);
    if (!pool.length) {
      const kr = state.origin === 'kr';
      return html + `<div class="empty">${icon('film')}<p>${kr ? '한국 영화 중에는 ' : ''}이 조합에 맞는 영화가 적어요.<br>${state.mood.length ? '재미 요소를 하나 빼 보세요.' : "위에서 '전체'를 골라 보세요."}</p>${state.mood.length ? '<button class="btn" data-act="clearMood">선택 지우기</button>' : '<button class="btn" data-act="origin" data-v="all">전체 보기</button>'}</div>`;
    }
    // 오늘의 영화: 우리 목록에서 남들 평보다 나한테 더 맞는 영화 (배경 그림이 있는 영화). 없으면 건너뜀
    const h = L.byP.length ? L.byP[0] : null;
    const keyOf = x => (x.m != null ? 'm' + x.m : 'f' + x.it.tmdbId);
    const main = pool.filter(x => x.m !== h);
    if (h != null) html += `<a class="hero" href="#/movie/${h}">
        <div class="poster poster-hero" style="${posterStyle(h, true, 'w780')}">
          <div class="eyebrow">나를 위한 오늘의 영화</div>
          <div class="poster-title">${esc(title(h))}</div>
          <div class="poster-year">${esc(meta(h))}</div>
        </div>
        <div class="hero-body">
          <span class="pill">재밌을 확률 <b>${pct(p[h])}</b></span>
          <span class="tiny">전체 관객 ${pct(c[h])}<br>추천 이유 보기 ›</span>
        </div>
      </a>`;
    const shown = main.slice(0, recLimit);
    html += `<div class="sec-head"><h3 class="h-sec">${moodNames.length ? '오늘 기분 맞춤' : '나를 위한 추천'}</h3><span class="tiny">재밌을 확률 순</span></div>
      <div class="list">${shown.map(recRowList).join('')}</div>
      ${main.length > recLimit ? '<button class="btn block small" data-act="moreRecs">더 보기</button>' : ''}
      ${moreRows(pool, new Set(shown.map(keyOf).concat(h != null ? ['m' + h] : [])))}
      <div class="sec-head"><h3 class="h-sec">숨은 꿀잼</h3><span class="tiny">평은 낮지만 내 취향</span></div>`;
    html += L.gems.length
      ? hrow(L.gems.slice(0, 10).map(m => `<a class="gem" href="#/movie/${m}">
          <div class="poster" style="${posterStyle(m, true, 'w300')}"><div class="poster-title">${esc(title(m))}</div><div class="poster-year">${MV.year[m] || ''}</div></div>
          <div class="gem-body"><div class="gem-cmp"><span>전체 ${pct(c[m])}</span><span aria-hidden="true">→</span><b>${pct(p[m])}</b></div><div class="tiny">나한테 재밌을 확률</div></div>
        </a>`).join(''))
      : `<div class="card"><p class="tiny" style="margin:0 0 10px">아직 숨은 꿀잼을 못 찾았어요. 영화를 더 평가하면 찾기 쉬워져요.</p><a class="btn small block" href="#/quick" data-act="rateMore">빠른 평가로 더 평가하기</a></div>`;
    html += `<div class="sec-head"><h3 class="h-sec">조심하세요</h3><span class="tiny">평은 좋지만 나랑은 안 맞을 수도</span></div>`;
    html += L.caution.length
      ? `<div class="list">${L.caution.slice(0, 3).map(m => movieRow(m, p[m], `전체 ${pct(c[m])}`)).join('')}</div>`
      : '<div class="card tiny">지금은 특별히 조심할 영화가 없어요.</div>';
    html += `<div class="sec-head"><h3 class="h-sec">내 취향 한 줄</h3><a class="more" href="#/taste">자세히 ›</a></div>
      <a class="card taste-mini" href="#/taste">${icon('sparkle')}<div class="row-main">${tasteSentence(getCalc().ctx.prefs)}</div></a>`;
    return html;
  }
  function searchResults(q) {
    const nq = norm(q);
    if (!nq) return '';
    const hits = [];
    for (let m = 0; m < N; m++) {
      const k = NORM_KO[m].indexOf(nq), e = NORM_EN[m].indexOf(nq);
      if (k >= 0 || e >= 0) hits.push({ m, rank: (k === 0 || e === 0 ? 0 : 1), count: MV.count[m] });
    }
    // 더한 영화(TMDB 한국 영화·2020년 이후)에서도 찾는다
    NORM_EX.forEach(([k0, e0], i) => {
      const k = k0.indexOf(nq), e = e0 ? e0.indexOf(nq) : -1;
      if (k >= 0 || e >= 0) hits.push({ it: EXTRA[i], rank: (k === 0 || e === 0 ? 0 : 1), count: EXTRA[i].votes * 10 });
    });
    hits.sort((a, b) => a.rank - b.rank || b.count - a.count);
    if (!hits.length) {
      return `<div class="empty">${icon('search')}<p><b>‘${esc(q)}’</b>${josa(String(q), '은', '는').slice(String(q).length)} 시험판 데이터에 없어요.</p>
        <p class="tiny">시험판에는 2019년까지 나온 영화 ${N.toLocaleString()}편(미국 관객 데이터)과 TMDB 에서 더한 한국 영화·2020년 이후 영화 ${EXTRA.length.toLocaleString()}편이 있어요.<br>출시판은 한국 영화 데이터와 한국 관객 평가로 바뀌어요.</p></div>`;
    }
    const { all } = getCalc();
    return `<p class="tiny" style="margin:0 0 4px">${hits.length}편 찾았어요</p><div class="list">${hits.slice(0, 40).map(({ m, it }) => {
      if (it) {
        const mine = state.newRatings[it.tmdbId], f = newFeatures(it);
        if (mine) return `<a class="row" href="#/new/film/${it.tmdbId}">${npImg(it, 'nposter-sm')}<div class="row-main"><div class="row-title">${esc(it.title)}</div><div class="row-meta">${esc([it.year, it.genres.slice(0, 2).join('·')].filter(Boolean).join(' · '))}</div></div><span class="react ${REACT[mine.s].cls}">${REACT[mine.s].label}</span></a>`;
        return f.p != null ? recRowList({ it, p: f.p }) : `<a class="row" href="#/new/film/${it.tmdbId}">${npImg(it, 'nposter-sm')}<div class="row-main"><div class="row-title">${esc(it.title)}</div><div class="row-meta">${esc([it.year, it.genres.slice(0, 2).join('·')].filter(Boolean).join(' · '))}</div></div><div class="row-pct low"><b style="font-size:14px">판단 일러요</b></div></a>`;
      }
      const mine = state.ratings[m];
      if (mine) return movieRowMine(m, mine);
      return all.conf[m] === 'low'
        ? `<a class="row" href="#/movie/${m}">${poster(m, 'sm')}<div class="row-main"><div class="row-title">${esc(title(m))}</div><div class="row-meta">${esc(meta(m))}</div></div><div class="row-pct low"><b style="font-size:14px">판단 일러요</b></div></a>`
        : movieRow(m, all.p[m], `전체 ${pct(MV.crowdLike[m])}`);
    }).join('')}</div>
    <p class="tiny" style="margin:12px 0 0">찾는 영화가 아닌가요? 시험판에는 2019년까지 미국 관객이 평가한 영화 ${N.toLocaleString()}편과 TMDB 에서 더한 한국 영화·2020년 이후 영화 ${EXTRA.length.toLocaleString()}편이 있어요. 같은 제목의 다른 영화일 수 있으니 연도를 확인해 주세요.</p>`;
  }
  function movieRowMine(m, mine) {
    const R = REACT[mine.s];
    return `<a class="row" href="#/movie/${m}">${poster(m, 'sm')}
      <div class="row-main"><div class="row-title">${esc(title(m))}</div><div class="row-meta">${esc(meta(m))}</div></div>
      <span class="react ${R.cls}">${R.label}</span></a>`;
  }

  function tasteSentence(prefs) {
    if (!prefs || ratedCount() < MIN_RATED) return '영화를 몇 편 더 평가하면 내 취향을 정리해 드려요.';
    const order = TRAITS.map((t, i) => ({ t, v: prefs[i] })).sort((a, b) => b.v - a.v);
    const ups = order.filter(x => x.v >= PREF_TH).slice(0, 2).map(x => x.t.name);
    const downs = order.filter(x => x.v <= -PREF_TH).reverse().slice(0, 2).map(x => x.t.name);
    const parts = [];
    if (ups.length) parts.push(`<b>${esc(ups.join(', '))}</b>${josa(ups[ups.length - 1], '을', '를').slice(ups[ups.length - 1].length)} 남들보다 중요하게 봐요.`);
    if (downs.length) parts.push(`<b>${esc(downs.join(', '))}</b>${josa(downs[downs.length - 1], '은', '는').slice(downs[downs.length - 1].length)} 남들보다 덜 따져요.`);
    return parts.length ? parts.join(' ') : '아직 남들과 크게 다른 점은 없어요. 영화를 더 평가하면 뚜렷해져요.';
  }

  // ════════ 신작 (이번 주 극장 · 넷플릭스) — 메인 콘텐츠
  // 서버(tools/serve.js /api/new)가 KOBIS·TMDB 에서 받아 준 목록에, 내 기록으로 '나랑 맞을 확률'을 붙인다.
  // 신작은 아직 본 사람이 적어서, TMDB 가 비슷하다고 본 옛 영화들에서 내가 남들보다 더 좋아한 정도 + TMDB 평점으로 계산한다
  // (시험: 아무도 안 본 신작 기준 적중 70.5%, 평점만 보면 69.5% — tools/08_newrelease_experiment.js)
  const NEW = { theater: { status: 'idle' }, netflix: { status: 'idle' }, series: { status: 'idle' }, upcoming: { status: 'idle' } };
  // 폰판: 올릴 때 찍어 둔 목록을 바로 쓴다 (서버에 묻지 않음)
  const SNAP = PHONE ? window.TC_NEWSNAP || null : null;
  if (SNAP) for (const k of Object.keys(NEW)) NEW[k] = SNAP[k] ? { status: 'ok', data: SNAP[k] } : { status: 'error', error: '이번 판에는 이 목록이 없어요' };
  // netflix·series: 이름은 옛것 그대로지만 2026-10-24부터 OTT 7곳 신작 (tools/newrelease.js OTT_PROVIDERS)
  const KIND_NAME = { theater: '극장 신작', netflix: 'OTT 영화', series: 'OTT 시리즈', upcoming: '개봉 예정', movie: '영화', film: '영화' };
  const MOVIE_KINDS = ['theater', 'upcoming', 'netflix', 'movie', 'film'];
  const TMDB2IDX = new Map((MV.tmdb || []).map((t, m) => [t, m]).filter(([t]) => t));
  // 작품 번호: 서버(server/catalog.js)와 같은 규칙 — 'movie:TMDB번호' · 'tv:TMDB번호' · (TMDB 번호 없는 옛 영화) 'ml:우리 번호'
  const keyOfIdx = m => (MV.tmdb && MV.tmdb[m] ? 'movie:' + MV.tmdb[m] : 'ml:' + m);
  const keyOfNew = (kind, id) => (kind === 'series' ? 'tv:' : 'movie:') + id;
  function routeOfKey(key) {
    const [type, id] = String(key).split(':');
    if (type === 'ml') return '#/movie/' + id;
    if (type === 'tv') return '#/new/series/' + id;
    const m = TMDB2IDX.get(+id);
    return m != null ? '#/movie/' + m : '#/new/movie/' + id;
  }
  // 이 작품을 내가 평가했나 (이 기기 기록 기준)
  function myReaction(key) {
    const [type, id] = String(key).split(':');
    if (type === 'ml') return state.ratings[id] || null;
    if (type === 'movie' && TMDB2IDX.has(+id)) return state.ratings[TMDB2IDX.get(+id)] || null;
    const r = state.newRatings[id];
    return r && keyOfNew(r.kind, id) === key ? r : null;
  }
  // 목록이 들어오면 지금 화면에서 그 부분만 다시 그린다
  function newArrived() {
    if (currentScreen === 'home') { const w = document.getElementById('new-wrap'); if (w) w.innerHTML = newBlockInner(); }
    else if (['new', 'saved', 'history'].includes(currentScreen)) rerender();
  }
  function loadNew(kind) {
    if (!SERVER || NEW[kind].status === 'loading' || NEW[kind].status === 'ok') return;
    NEW[kind] = { status: 'loading' };
    fetch('/api/new?kind=' + kind)
      .then(r => r.json().then(j => (r.ok ? { status: 'ok', data: j } : { status: 'error', error: j.error || '불러오지 못했어요' })))
      .catch(() => ({ status: 'error', error: '시험판 서버에 연결하지 못했어요' }))
      .then(st => {
        NEW[kind] = st;
        if (kind === 'upcoming' && st.status === 'ok') refreshSavedReleases(st.data.items);
        newArrived();
      });
  }
  // 목록에서 빠진 작품(찜·토론·알림으로 연 작품)은 하나씩 불러온다
  const ONE = {};
  function loadOne(kind, id) {
    const k = (kind === 'series' ? 'tv' : 'movie') + ':' + id;
    if (!SERVER || ONE[k]) return;
    ONE[k] = { status: 'loading' };
    fetch(`/api/new?kind=one&type=${kind === 'series' ? 'tv' : 'movie'}&id=${encodeURIComponent(id)}`)
      .then(r => r.json().then(j => (r.ok ? { status: 'ok', item: j.item } : { status: 'error', error: j.error || '불러오지 못했어요' })))
      .catch(() => ({ status: 'error', error: '시험판 서버에 연결하지 못했어요' }))
      .then(st => { ONE[k] = st; if (currentScreen === 'new') rerender(); });
  }
  // 개봉 예정 목록이 들어오면, 찜해 둔 영화의 개봉일이 바뀌었는지 맞춰 둔다 (개봉일이 미뤄지는 일이 있음)
  function refreshSavedReleases(items) {
    let moved = false;
    for (const it of items) {
      const s = state.savedNew[it.tmdbId];
      if (s && s.release && it.release && s.release !== it.release) { s.release = it.release; if (daysUntil(it.release) > 0) s.alerted = false; moved = true; }
    }
    if (moved) persist();
  }
  const sig = z => 1 / (1 + Math.exp(-z));
  const lgt = q => { const c = Math.min(0.97, Math.max(0.03, q)); return Math.log(c / (1 - c)); };
  function newFeatures(it) {
    if (!NC || !it || !it.tmdbId) return { mode: 'none' };
    const n = ratedCount();
    if (n < MIN_RATED) return { mode: 'need' };
    const { all } = getCalc();
    let likes = 0;
    for (const k in state.ratings) if (state.ratings[k].s === 1) likes++;
    const base = (likes + 1) / (n + 2);
    // 비슷한 영화: 영화는 TMDB 추천 중 우리 목록에 있는 것, 없으면(그리고 시리즈는 항상) 키워드·장르가 겹치는 우리 영화
    let sims = (it.recIdx && it.recIdx.length ? it.recIdx : (it.rec || []).map(id => TMDB2IDX.get(id)).filter(x => x != null)).slice(0, NC.variant.topK);
    let w = NC.simVote, mode = 'sim';
    if ((it.kind === 'series' || !sims.length) && NC.kw && it.kwIdx && it.kwIdx.length) { sims = it.kwIdx.slice(0, 20); w = NC.kw; mode = 'kw'; }
    // 이미 본 비슷한 영화는 예측 대신 실제 기록 (시험과 같은 방식)
    const val = x => { const r = state.ratings[x]; return r ? (r.s === 1 ? 0.9 : r.s === 0 ? 0.45 : 0.1) : all.p[x]; };
    const k = NC.voteShrink, votes = it.votes || 0;
    const vote = ((it.vote || 0) * votes + 6.5 * k) / (votes + k);
    let p, res = null;
    if (sims.length) {
      res = sims.reduce((s, x) => s + val(x) - MV.crowdLike[x], 0) / sims.length;
      p = sig(w[0] + w[1] * lgt(base) + w[2] * res + w[3] * (vote - 6.5));
    } else {
      const w = NC.vote;
      p = sig(w[0] + w[1] * lgt(base) + w[2] * (vote - 6.5));
      mode = 'vote';
    }
    let traits = it.traits || null; // 더한 영화는 미리 맞춰 둔 값 (mapExtraTraits)
    if (!traits && sims.length >= 3) {
      traits = [0, 0, 0, 0, 0, 0];
      sims.forEach(x => MV.traits[x].forEach((v, t) => { traits[t] += v / sims.length; }));
    }
    return { mode, p: Math.min(0.97, Math.max(0.03, p)), sims, res, vote, val, traits };
  }
  function npImg(it, cls) {
    return `<div class="nposter${cls ? ' ' + cls : ''}">${it && it.poster ? `<img src="${esc(it.poster)}" alt="" loading="lazy">` : `<span class="nposter-none">${icon('film')}</span>`}</div>`;
  }
  function newCard(it, f) {
    const val = f.mode === 'need' ? `<span class="tiny">평가 ${MIN_RATED}편 필요</span>`
      : f.p != null ? `<b class="${f.p < 0.5 ? 'low' : ''}">${pct(f.p)}</b><span class="tiny">맞을 확률</span>` : '<span class="tiny">정보 부족</span>';
    // 개봉 예정: 포스터 위에 남은 날, 찜했으면 종 표시
    const up = it.kind === 'upcoming' && it.release;
    const badge = up ? `<span class="nbadge">${ddayText(it.release)}</span>${state.savedNew[it.tmdbId] ? `<span class="nbell" aria-label="개봉 알림 찜함">${icon('bell')}</span>` : ''}` : '';
    // OTT 줄은 제목 아래 볼 곳(내 OTT 먼저, 최대 2곳)
    const ottLine = it.kind === 'netflix' || it.kind === 'series' ? `<div class="ncard-ott">${esc(ottShort(it)) || '&nbsp;'}</div>` : '';
    const inner = `<div class="nposter-wrap">${npImg(it)}${badge}</div><div class="ncard-title">${esc(it.title)}</div>${up ? `<div class="ncard-date">${md(it.release)} 개봉</div>` : ''}${ottLine}<div class="ncard-pct">${val}</div>`;
    return it.tmdbId ? `<a class="ncard" href="#/new/${it.kind}/${it.tmdbId}">${inner}</a>` : `<div class="ncard">${inner}</div>`;
  }
  function newSection(kind) {
    const st = NEW[kind];
    // OTT 줄(netflix·series): OTT 7곳 신작. 내 OTT 만 켜면 그 곳 것만, 이름도 '내 OTT 신작'
    const ottRow = kind === 'netflix' || kind === 'series', mineOn = ottActive(), mineNames = myOtt().map(ottName).join('·');
    const name = { theater: '이번 주 극장', netflix: mineOn ? '내 OTT 신작 영화' : 'OTT 신작 영화', series: mineOn ? '내 OTT 신작 시리즈' : 'OTT 신작 시리즈', upcoming: '개봉 예정' }[kind];
    let sub = { theater: PHONE ? '지금 한국에서 상영 중 인기작' : '어제 박스오피스 10편', netflix: mineOn ? `${mineNames} · 최근 6개월 공개` : '넷플릭스·티빙·웨이브·왓챠·디즈니+ 등 · 최근 6개월 공개', series: mineOn ? `${mineNames} · 최근 6개월 첫 공개` : 'OTT 7곳 · 최근 6개월 첫 공개 드라마', upcoming: '찜하면 개봉날 알려 드려요' }[kind], body;
    if (st.status === 'ok') {
      // 내 OTT 거르기는 OTT 줄에만 (극장·개봉 예정은 극장 작품이라 그대로)
      const items = st.data.items.filter(it => originOK(isKoreanNew(it)) && (!ottRow || ottOK(it))).map(it => ({ it, f: newFeatures(it) }));
      const any = items.some(x => x.f.p != null);
      if (any) { items.sort((a, b) => (b.f.p == null ? -1 : b.f.p) - (a.f.p == null ? -1 : a.f.p)); sub += ' · 나랑 맞을 확률 순'; }
      const none = ottRow && mineOn ? '지금 이 목록에는 내 OTT 에서 볼 수 있는 신작이 없어요.' : ORIGIN_NAME[state.origin] && st.data.items.length ? `지금 이 목록에는 ${ORIGIN_NAME[state.origin]} 작품이 없어요.` : '지금은 보여 줄 작품이 없어요.';
      // OTT 줄은 7곳을 합쳐 길어서 맞을 확률 높은 30편까지만
      body = items.length ? hrow((ottRow ? items.slice(0, 30) : items).map(x => newCard(x.it, x.f)).join('')) : `<div class="card tiny">${none}</div>`;
    } else if (st.status === 'error') {
      body = `<div class="card"><p class="tiny" style="margin:0 0 10px">${esc(st.error)}</p><button class="btn small block" data-act="retryNew" data-k="${kind}">다시 불러오기</button></div>`;
    } else {
      sub = '불러오는 중…';
      body = hrow('<div class="ncard skel"><div class="nposter"></div><div class="skel-line"></div><div class="skel-line short"></div></div>'.repeat(3), true);
    }
    return `<div class="sec-head"><h3 class="h-sec">${name}</h3><span class="tiny">${sub}</span></div>${body}`;
  }
  function newBlockInner() {
    if (!NEWS) {
      return `<div class="sec-head"><h3 class="h-sec">이번 주 극장 · OTT 신작</h3></div>
        <div class="card"><p class="tiny" style="margin:0">${PHONE ? "이번 판에는 신작 목록이 없어요. PC에서 '폰에 올리기'를 다시 해 주세요." : "신작은 바탕화면 › TasteCut › '취향컷 시작.bat'으로 켜야 보여요. 지금은 파일로 바로 열려 있어요."}</p></div>`;
    }
    const src = PHONE ? `목록은 ${esc(SNAP.at)}에 찍어 둔 것` : '극장·개봉 예정 목록 KOBIS';
    return `${newSection('theater')}${newSection('upcoming')}${newSection('netflix')}${newSection('series')}
      <p class="attrib"><img src="${TMDB_LOGO}" alt="TMDB" width="54" height="10" loading="lazy"> 영화 정보·포스터 TMDB · OTT 볼 곳 정보 JustWatch · ${src}</p>`;
  }
  // ════════ 추천 늘리기 (2026-10-24): 우리 목록(MovieLens 3,576편) + 더한 영화(TMDB 한국 영화·2020년 이후, tools/15_extra_catalog.js)
  //  더한 영화는 신작과 같은 방식(newFeatures)으로 맞을 확률을 낸다 — 비슷한 우리 목록 영화에서 나의 반응 + TMDB 평점
  //  평가는 신작처럼 newRatings 에 남는다(취향 계산 엔진은 우리 목록 평가만 씀)
  const EX = window.TC_EXTRA || { items: [], img: '', prov: {} };
  const EXTRA = EX.items.map(o => ({
    kind: 'film', tmdbId: o.id, title: o.t, original: o.o || null, year: o.y || null, release: o.d || null, korean: !!o.k,
    genres: o.g || [], runtime: o.r || null, poster: o.p ? EX.img + o.p : null, overview: o.ov || '', vote: o.v || 0, votes: o.n || 0,
    director: o.dr || [], cast: o.c || [], rec: [], recIdx: o.ri || [], kwIdx: o.kw || [], ott: o.ott || [], netflix: (o.ott || []).includes(8),
  }));
  const EXTRA_BY_ID = new Map(EXTRA.map(it => [String(it.tmdbId), it]));
  const NORM_EX = EXTRA.map(it => [norm(it.title), norm(it.original || '')]);
  // 더한 영화의 재미 요소: 비슷한 우리 목록 영화(없으면 키워드·장르가 겹치는 영화까지, 최대 20편)의 평균.
  //  평균이라 값이 가운데로 몰려서, 우리 목록과 같은 '줄 세운 자리'의 값으로 바꿔 둔다(분위수 맞추기)
  //  → 기분 고르기(60 이상)·예상 재미 요소가 우리 목록과 같은 비율로 걸린다. 예: '웃음 많음'은 양쪽 다 위쪽 약 19%
  (function mapExtraTraits() {
    const T = TRAITS.length;
    const raw = EXTRA.map(it => {
      const sims = it.recIdx.length >= 3 ? it.recIdx : it.recIdx.concat(it.kwIdx).slice(0, 20);
      if (sims.length < 3) return null;
      const a = new Array(T).fill(0);
      sims.forEach(x => MV.traits[x].forEach((v, t) => { a[t] += v / sims.length; }));
      return a;
    });
    for (let t = 0; t < T; t++) {
      const cat = []; for (let m = 0; m < N; m++) if ((MV.year[m] || 0) >= 1990) cat.push(MV.traits[m][t]);
      cat.sort((a, b) => a - b);
      const ex = raw.filter(Boolean).map(a => a[t]).sort((a, b) => a - b);
      const rankOf = v => { let lo = 0, hi = ex.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (ex[mid] < v) lo = mid + 1; else hi = mid; } return lo / Math.max(1, ex.length - 1); };
      raw.forEach((a, i) => { if (!a) return; (EXTRA[i].traits = EXTRA[i].traits || new Array(T))[t] = cat[Math.min(cat.length - 1, Math.round(rankOf(a[t]) * (cat.length - 1)))]; });
    }
  })();
  const moodOKVec = tr => state.mood.every(k => tr && tr[TRAITS.findIndex(t => t.key === k)] >= 60);

  // ════════ 볼 곳 (한국 OTT, 2026-10-24) — 영화마다 구독·대여로 볼 수 있는 곳 (TMDB 의 JustWatch 정보, tools/16_watch_providers.js)
  //  내 OTT(state.myOtt)를 골라 두고 '내 OTT만'(state.ottOnly)을 켜면 지난 영화 추천·전체 보기·OTT 신작 줄을 볼 수 있는 작품으로만 좁힌다
  //  신작은 newrelease.js 가 붙인 ott(매일 새로), 지난 영화·더한 영화는 watch.js(한 달에 한 번쯤 다시 받기). 쿠팡플레이는 JustWatch 한국 목록에 없음
  const WATCH = window.TC_WATCH || { at: '', prov: {}, cat: {}, catRent: {}, ex: {}, exRent: {} };
  const OTT_MAIN = [[8, '넷플릭스'], [1883, '티빙'], [356, '웨이브'], [97, '왓챠'], [337, '디즈니+'], [350, 'Apple TV+'], [119, '프라임 비디오']];
  const OTT_NAME = Object.assign({}, WATCH.prov, EX.prov || {}, { 1796: '넷플릭스', 283: '크런치롤' }, Object.fromEntries(OTT_MAIN));
  const OTT_ORDER = new Map(OTT_MAIN.map(([id], i) => [id, i]));
  const ottName = id => OTT_NAME[id] || 'OTT';
  // x = 추천 후보({m} 또는 {it}) 또는 신작·더한 영화 작품 하나
  function watchSub(x) {
    if (x.m != null) return WATCH.cat[x.m] || [];
    const it = x.it || x;
    const ids = it.kind === 'film' ? WATCH.ex[it.tmdbId] || it.ott || [] : it.ott || [];
    return [...new Set(ids.map(id => (id === 1796 ? 8 : id)))];
  }
  function watchRent(x) {
    if (x.m != null) return WATCH.catRent[x.m] || [];
    const it = x.it || x;
    return it.kind === 'film' ? WATCH.exRent[it.tmdbId] || [] : [];
  }
  const myOtt = () => state.myOtt || [];
  const ottActive = () => !!(state.ottOnly && myOtt().length);
  const ottOK = x => !ottActive() || watchSub(x).some(id => myOtt().includes(id));
  // 목록에 붙일 짧은 볼 곳: 내 OTT 먼저, 큰 OTT 순, 최대 2곳
  function ottShort(x) {
    const mine = myOtt();
    const sub = watchSub(x).slice().sort((a, b) => (mine.includes(b) ? 1 : 0) - (mine.includes(a) ? 1 : 0) || (OTT_ORDER.has(a) ? OTT_ORDER.get(a) : 99) - (OTT_ORDER.has(b) ? OTT_ORDER.get(b) : 99));
    return sub.length ? sub.slice(0, 2).map(ottName).join('·') + (sub.length > 2 ? ` 외 ${sub.length - 2}` : '') : '';
  }
  // '어디서 보나' 칸: 구독으로 볼 수 있는 곳(내 OTT 는 연두) · 대여·구매 · 자세히 보기(TMDB 의 볼 곳 화면)
  function watchCard(x, tmdbId) {
    const sub = watchSub(x), rent = watchRent(x), mine = myOtt();
    const at = x.m != null || (x.kind || (x.it && x.it.kind)) === 'film' ? WATCH.at : '';
    return `<div class="card" id="watch-card"><div class="card-title">${icon('tv')}어디서 보나</div>
      ${sub.length ? `<div class="ott-chips">${sub.map(id => `<span class="ott-chip${mine.includes(id) ? ' mine' : ''}">${esc(ottName(id))}${mine.includes(id) ? ' · 내 OTT' : ''}</span>`).join('')}</div>`
        : '<p style="margin:0;font-size:14px;color:var(--text-2)">구독으로 볼 수 있는 곳을 찾지 못했어요.</p>'}
      ${rent.length ? `<p class="tiny" style="margin:8px 0 0">대여·구매: ${esc(rent.map(ottName).join(' · '))}</p>` : ''}
      ${tmdbId ? `<a class="btn small block" style="margin-top:12px" href="https://www.themoviedb.org/movie/${tmdbId}/watch?locale=KR" target="_blank" rel="noopener">볼 수 있는 곳 자세히 보기</a>` : ''}
      <p class="tiny" style="margin:8px 0 0">제공: JustWatch (TMDB 경유)${at ? ` · ${esc(at)} 기준` : ''} · 바뀌었을 수 있어요 · 쿠팡플레이는 정보가 없어요</p>
      <button class="link-btn" style="padding-left:0" data-act="ottOpen">${mine.length ? '내 OTT 바꾸기' : '내 OTT 고르기'}</button></div>`;
  }
  // 발견·전체 보기 맨 위 '내 OTT' 줄 (누르면 고르는 창)
  function ottBar() {
    const names = myOtt().map(ottName).join('·'), on = ottActive();
    return `<button class="ott-bar${on ? ' on' : ''}" data-act="ottOpen">${icon('tv')}<span>${on ? `내 OTT(${esc(names)})에서 볼 수 있는 것만` : names ? `내 OTT: ${esc(names)} · 모든 영화 보는 중` : '내 OTT 고르기 · 볼 수 있는 영화만 추천'}</span>${icon('right')}</button>`;
  }
  function ottSheet() {
    const mine = myOtt();
    const n = mine.length ? recPool({}).filter(x => watchSub(x).some(id => mine.includes(id))).length : 0;
    return `<h3>내가 구독하는 OTT</h3>
      <p>고른 곳에서 볼 수 있는 영화만 추천해요. 영화 화면 '어디서 보나'에도 표시돼요.</p>
      <div class="ott-pick" role="group" aria-label="구독하는 OTT">${OTT_MAIN.map(([id, name]) => `<button class="chip${mine.includes(id) ? ' on' : ''}" data-act="ottToggle" data-id="${id}" aria-pressed="${mine.includes(id)}">${name}</button>`).join('')}</div>
      <button class="ott-switch${state.ottOnly ? ' on' : ''}" data-act="ottOnly" aria-pressed="${!!state.ottOnly}"${mine.length ? '' : ' disabled'}><span>내 OTT에서 볼 수 있는 영화만 추천</span><i aria-hidden="true"></i></button>
      <p class="tiny">${mine.length ? `고른 곳에서 볼 수 있는 추천 <b>${n.toLocaleString()}편</b> (이미 평가한 영화 빼고)` : 'OTT 를 하나 이상 골라 주세요.'} · 쿠팡플레이는 볼 곳 정보(JustWatch)가 없어서 고를 수 없어요.</p>
      <div class="sheet-actions"><button class="btn primary block" data-act="ottDone">다 했어요</button></div>`;
  }
  // 추천 후보 전부: { m(우리 목록) 또는 it(더한 영화), p, kr, year, genres, votes }. o.mood: 기분 고르기 적용
  function recPool(o = {}) {
    const { all } = getCalc();
    const out = [];
    for (let m = 0; m < N; m++) {
      if (state.ratings[m] || all.conf[m] === 'low' || MV.genres[m].includes('다큐') || (o.mood && !moodOK(m)) || !ottOK({ m })) continue;
      out.push({ m, p: all.p[m], kr: isKoreanIdx(m), year: MV.year[m] || 0, genres: MV.genres[m], votes: MV.count[m] });
    }
    for (const it of EXTRA) {
      if (state.newRatings[it.tmdbId] || !ottOK({ it })) continue;
      const f = newFeatures(it);
      if (f.p == null || (o.mood && state.mood.length && !moodOKVec(f.traits))) continue;
      out.push({ it, p: f.p, kr: it.korean, year: it.year || 0, genres: it.genres, votes: it.votes });
    }
    return out;
  }
  const recHref = x => (x.m != null ? `#/movie/${x.m}` : `#/new/film/${x.it.tmdbId}`);
  const recTitle = x => (x.m != null ? title(x.m) : x.it.title);
  function recCard(x) {
    const img = x.m != null ? (TP && TP.p[x.m] ? tmdbImg(TP.p[x.m], 'w342') : null) : x.it.poster;
    return `<a class="ncard" href="${recHref(x)}"><div class="nposter-wrap">${npImg({ poster: img })}</div><div class="ncard-title">${esc(recTitle(x))}</div><div class="ncard-ott">${esc(ottShort(x)) || '&nbsp;'}</div><div class="ncard-pct"><b class="${x.p < 0.5 ? 'low' : ''}">${pct(x.p)}</b><span class="tiny">맞을 확률</span></div></a>`;
  }
  function recRowList(x) {
    if (x.m != null) return movieRow(x.m, x.p, `전체 ${pct(MV.crowdLike[x.m])}`);
    const it = x.it, metaTxt = [it.year, it.genres.slice(0, 2).join('·')].filter(Boolean).join(' · ');
    return `<a class="row" href="${recHref(x)}">${npImg(it, 'nposter-sm')}<div class="row-main"><div class="row-title">${esc(it.title)}</div><div class="row-meta">${esc(metaTxt)} · TMDB ${it.vote.toFixed(1)}${ottShort(x) ? ` · <span class="ott-mini">${esc(ottShort(x))}</span>` : ''}</div></div><div class="row-pct${x.p < 0.5 ? ' low' : ''}"><b>${pct(x.p)}</b><span>재밌을 확률</span></div></a>`;
  }
  // 내가 좋아한 장르 (우리 목록 평가에서 '재밌었어요'가 많은 순, 2편 이상)
  function favGenres(k) {
    const c = {};
    for (const key in state.ratings) if (state.ratings[key].s === 1 && +key < N) for (const g of MV.genres[+key]) c[g] = (c[g] || 0) + 1;
    return Object.entries(c).filter(([g, n]) => n >= 2 && g !== '다큐').sort((a, b) => b[1] - a[1]).slice(0, k).map(([g]) => g);
  }
  // 발견 '지난 영화' 아래에 더 보여 줄 줄: 한국 영화 · 2020년 이후 · 좋아하는 장르 2개 + 전체 보기
  //  pool: 발견이 쓰는 추천 후보(기분·나라 고르기 적용, 확률 순), shown: 위에 이미 나온 영화 열쇠('m번호'·'fTMDB번호')
  //  같은 영화가 여러 줄에 겹치지 않게 앞 줄에 나온 건 뒤 줄에서 뺀다
  function moreRows(pool, shown) {
    if (!pool.length) return '';
    const used = new Set(shown || []);
    const keyOf = x => (x.m != null ? 'm' + x.m : 'f' + x.it.tmdbId);
    const pick = (test, k) => { const out = []; for (const x of pool) { if (out.length >= k) break; if (!used.has(keyOf(x)) && test(x)) out.push(x); } out.forEach(x => used.add(keyOf(x))); return out; };
    const row = (name, sub, list) => (list.length >= 3 ? `<div class="sec-head"><h3 class="h-sec">${name}</h3><span class="tiny">${sub}</span></div>${hrow(list.map(recCard).join(''))}` : '');
    let html = '';
    if (state.origin !== 'fx') html += row('한국 영화 추천', '맞을 확률 순', pick(x => x.kr, 20));
    html += row('2020년 이후 영화', '맞을 확률 순', pick(x => x.year >= 2020, 20));
    for (const g of favGenres(2)) html += row(`나를 위한 ${esc(g)}`, '자주 재밌어한 장르', pick(x => x.genres.includes(g), 15));
    const total = recPool({}).filter(x => originOK(x.kr)).length; // 전체 보기 화면에 나오는 편수 (기분 고르기 없이, 모든 시대)
    return html + `<a class="btn block browse-all" href="#/browse">${icon('film')}추천 전체 보기 · ${total.toLocaleString()}편</a>`;
  }
  // 추천 전체 보기: 나라 · 장르 · 시대로 고르고, 맞을 확률 · 많이 본 · 최근 순으로
  const browse = { genre: 'all', era: 'all', sort: 'p', limit: 40 };
  const ERAS = [['all', '전체'], ['2020', '2020년 이후'], ['2010', '2010년대'], ['2000', '2000년대'], ['1990', '1990년대'], ['old', '그 전']];
  const eraOK = (y, e) => e === 'all' || (e === 'old' ? y < 1990 : e === '2020' ? y >= 2020 : y >= +e && y < +e + 10);
  function browseScreen() {
    const top = `<div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">${icon('back')}</button><h1>추천 전체 보기</h1><span style="width:44px"></span></div>`;
    if (ratedCount() < MIN_RATED) return `${top}<div class="empty">${icon('film')}<p>영화를 ${MIN_RATED}편 이상 평가하면 추천을 모아 보여 드려요.</p><a class="btn primary" href="#/quick">빠른 평가</a></div>`;
    const pool = recPool({}).filter(x => originOK(x.kr));
    const gc = {};
    for (const x of pool) for (const g of x.genres) if (g !== '다큐' && g !== '다큐멘터리') gc[g] = (gc[g] || 0) + 1;
    const genreList = Object.entries(gc).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([g]) => g);
    if (browse.genre !== 'all' && !genreList.includes(browse.genre)) browse.genre = 'all';
    const list = pool.filter(x => (browse.genre === 'all' || x.genres.includes(browse.genre)) && eraOK(x.year, browse.era));
    list.sort(browse.sort === 'votes' ? (a, b) => b.votes - a.votes : browse.sort === 'new' ? (a, b) => b.year - a.year || b.p - a.p : (a, b) => b.p - a.p);
    const gChip = (v, label) => `<button class="chip${browse.genre === v ? ' on' : ''}" data-act="browseGenre" data-v="${esc(v)}" aria-pressed="${browse.genre === v}">${esc(label)}</button>`;
    const eChip = (v, label) => `<button class="chip${browse.era === v ? ' on' : ''}" data-act="browseEra" data-v="${esc(v)}" aria-pressed="${browse.era === v}">${esc(label)}</button>`;
    const krN = list.filter(x => x.kr).length;
    return `${top}${originBar()}${ottBar()}
      <div class="chips scroll browse-chips" role="group" aria-label="장르">${gChip('all', '모든 장르')}${genreList.map(g => gChip(g, g)).join('')}</div>
      <div class="chips scroll browse-chips" role="group" aria-label="시대">${ERAS.map(([v, l]) => eChip(v, l)).join('')}</div>
      <div class="browse-head"><span><b>${list.length.toLocaleString()}편</b><span class="tiny"> · 한국 ${krN.toLocaleString()}편</span></span>
        <span class="browse-sort">${[['p', '맞을 확률 순'], ['votes', '많이 본 순'], ['new', '최근 순']].map(([v, l]) => `<button class="link-btn${browse.sort === v ? ' on' : ''}" data-act="browseSort" data-v="${v}" aria-pressed="${browse.sort === v}">${l}</button>`).join('')}</span></div>
      ${list.length ? `<div class="list">${list.slice(0, browse.limit).map(recRowList).join('')}</div>` : `<div class="empty">${icon('film')}<p>이 조건에 맞는 영화가 없어요.</p></div>`}
      ${list.length > browse.limit ? `<button class="btn block small" data-act="browseMore">더 보기 (${(list.length - browse.limit).toLocaleString()}편 더)</button>` : ''}
      <p class="tiny" style="margin:14px 0 0">지난 영화 ${N.toLocaleString()}편(미국 관객 평가로 계산) + TMDB 에서 더한 한국 영화·2020년 이후 영화 ${EXTRA.length.toLocaleString()}편(비슷한 영화 + 평점으로 계산). 이미 평가한 영화는 빼고 보여 드려요.</p>`;
  }

  function newCalibLine(p, kind) {
    if (!NC) return '';
    const b = NC.bins.find(x => p * 100 >= x.from && p * 100 < x.to) || NC.bins[NC.bins.length - 1];
    if (!b || b.actual == null) return '';
    // 더한 영화(옛 영화 포함)도 같은 계산법이라 같은 시험 숫자를 쓰되, '신작'이라고 부르지 않는다
    const who = kind === 'film' ? '이 계산법(비슷한 영화 + 평점)이' : '아무도 안 본 신작에';
    return `<div class="calib">${icon('check')}<span>시험에서 ${who} <b>${b.from}~${b.to}%</b>라고 한 경우, 실제로 <b>${Math.round(b.actual * 100)}%</b>가 재밌었다고 했어요 (예측 ${b.count.toLocaleString()}건).</span></div>`;
  }
  function findNew(kind, id) {
    const inList = k => { const st = NEW[k]; return st && st.status === 'ok' ? st.data.items.find(i => String(i.tmdbId) === String(id)) : null; };
    let it = NEW[kind] ? inList(kind) : null;
    // 영화는 다른 목록에도 있을 수 있다 (예: 개봉 예정 → 개봉 후 이번 주 극장)
    if (!it && MOVIE_KINDS.includes(kind)) for (const k of MOVIE_KINDS) if (k !== kind && NEW[k] && (it = inList(k))) break;
    if (!it) { const one = ONE[(kind === 'series' ? 'tv' : 'movie') + ':' + id]; if (one && one.status === 'ok') it = one.item; }
    if (!it && kind !== 'series') it = EXTRA_BY_ID.get(String(id)) || null; // 더한 영화 (TMDB 한국 영화·2020년 이후)
    return it || null;
  }
  function newScreen(arg) {
    const [kind, id] = String(arg || '').split('/');
    const top = `<div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">${icon('back')}</button><h1>${kind === 'film' ? '영화 맞춤 분석' : '신작 맞춤 분석'}</h1><button class="icon-btn" data-act="howNew" aria-label="확률 계산 방법">${icon('info')}</button></div>`;
    if (!KIND_NAME[kind] || !/^\d+$/.test(id || '')) return notFound();
    if (kind === 'film' && !EXTRA_BY_ID.has(String(id))) return notFound();
    if (!NEWS && kind !== 'film') return `${top}<div class="empty">${icon('film')}<p>${PHONE ? '이번 판에는 신작 목록이 없어요.' : "신작은 '취향컷 시작.bat'으로 켜야 보여요."}</p><a class="btn" href="#/home">발견으로 가기</a></div>`;
    let it = findNew(kind, id);
    if (!it && PHONE) {
      const snap = state.savedNew[id] || state.newRatings[id];
      return `${top}<div class="empty">${icon('film')}<p>${snap ? `‘${esc(snap.title)}’은(는) 이번 판 목록에 없어요.` : '작품을 찾지 못했어요.'}</p><p class="tiny">폰판에서는 PC에서 올릴 때 찍어 둔 목록에 있는 작품만 열 수 있어요.</p><a class="btn" href="#/home">발견으로 가기</a></div>`;
    }
    if (!it) {
      // 목록을 아직 못 받았으면 받고, 목록에 없는 작품이면 하나만 따로 불러온다
      const lists = MOVIE_KINDS.includes(kind) ? ['theater', 'upcoming', 'netflix'] : ['series'];
      lists.forEach(loadNew);
      const pending = lists.some(k => NEW[k].status === 'loading' || NEW[k].status === 'idle');
      const one = ONE[(kind === 'series' ? 'tv' : 'movie') + ':' + id];
      if (!pending && !one) loadOne(kind, id);
      if (pending || !one || one.status === 'loading') return `${top}<div class="empty">${icon('film')}<p>작품 정보를 불러오는 중이에요…</p></div>`;
      const snap = state.savedNew[id] || state.newRatings[id];
      return `${top}<div class="empty">${icon('alert')}<p>${snap ? `‘${esc(snap.title)}’ 정보를 불러오지 못했어요.` : '작품을 찾지 못했어요.'}</p><p class="tiny">${esc(one.error || '')}</p><button class="btn" data-act="retryOne" data-k="${kind}" data-id="${esc(id)}">다시 불러오기</button></div>`;
    }
    const f = newFeatures(it);
    const mine = state.newRatings[it.tmdbId];
    const isSaved = !!state.savedNew[it.tmdbId];
    const tkey = keyOfNew(it.kind, it.tmdbId);
    // 아직 개봉 전이면 '봤어요' 대신 개봉 알림 찜
    const pre = it.kind !== 'series' && it.release && daysUntil(it.release) > 0;
    const { ctx } = getCalc();
    let big;
    if (f.mode === 'need') big = `<div class="big-wait">평가를 ${MIN_RATED}편 이상 해 주세요</div><p class="sub" style="margin:6px 0 0">본 영화를 알려 주면 신작도 나랑 맞는지 계산할 수 있어요.</p>`;
    else if (f.p == null) big = '<div class="big-wait">계산할 정보가 부족해요</div>';
    else {
      big = `<div class="tiny" style="font-size:14px;color:var(--text-2)">나랑 맞을 확률</div><div class="big"><div class="big-num">${Math.round(f.p * 100)}<small>%</small></div></div>`;
      // 계산에 들어간 두 가지를 한 줄로: 평점 높낮이 + 비슷한 영화에서 남들보다 더/덜 좋아한 정도
      const voteWord = f.vote >= 7.3 ? '높은 편' : f.vote <= 5.8 ? '낮은 편' : '보통';
      const simName = f.mode === 'kw' ? '키워드가 비슷한 영화' : '비슷한 영화';
      const simWord = f.mode === 'sim' || f.mode === 'kw' ? (f.res >= 0.03 ? `${simName}에서 나는 남들보다 ${Math.round(f.res * 100)}%p 더 좋아함` : f.res <= -0.03 ? `${simName}에서 나는 남들보다 ${Math.round(-f.res * 100)}%p 덜 좋아함` : `${simName}에서 나는 남들과 비슷함`) : '비슷한 영화 정보 없음';
      big += `<p class="sub" style="margin:8px 0 0;font-size:14px">계산: TMDB 평점 ${it.votes ? it.vote.toFixed(1) : '-'} (${voteWord}) + ${simWord}</p>${newCalibLine(f.p, it.kind)}`;
      if (f.mode === 'vote') big += '<p class="tiny" style="margin:10px 0 0">TMDB가 비슷하다고 본 영화가 내 목록에 없어서, 평점과 내 평소 취향으로만 계산했어요.</p>';
    }
    let mineHtml = '';
    if (mine) {
      mineHtml = `<span class="mine-chip">내 기록 · ${REACT[mine.s].label}</span>`;
      if (mine.pred != null) {
        const hit = (mine.pred >= 0.5) === (mine.s === 1);
        mineHtml += ` <span class="tag ${hit ? 'good' : 'bad'}" style="margin-top:8px">${hit ? icon('check') + '예측 적중' : icon('alert') + '예측 빗나감'} (기록 전 ${pct(mine.pred)})</span>`;
      }
    }
    const isSeries = it.kind === 'series';
    const runTxt = isSeries
      ? [it.seasons ? `시즌 ${it.seasons}` : '', it.episodes ? `${it.episodes}화` : '', it.runtime ? `회당 ${it.runtime}분` : ''].filter(Boolean).join(' · ')
      : it.runtime ? it.runtime + '분' : '';
    const subLine = [it.original && it.original !== it.title ? it.original : '', it.year, it.genres.slice(0, 2).join('·'), runTxt].filter(Boolean).join(' · ');
    const people = [it.director.length ? (isSeries ? '제작 ' : '감독 ') + it.director.join(', ') : '', it.cast.join(', ')].filter(Boolean).join(' · ');
    const releaseChip = pre ? `<span class="mine-chip release-chip">${icon('bell')}${md(it.release)} 개봉 · ${ddayText(it.release)}</span>` : '';
    let html = `${top}
      <div class="movie-head">${npImg(it, 'nposter-md')}
        <div><h2>${esc(it.title)}</h2><div class="sub">${esc(subLine)}</div>${people ? `<div class="tiny">${esc(people)}</div>` : ''}${releaseChip}${mineHtml}</div>
      </div>
      <div class="card">${big}</div>
      <div class="card">
        <div class="card-title">남들 평 vs 나</div>
        <div class="cmp"><span class="lbl">TMDB 평점</span><div class="track"><i style="width:${Math.round((it.vote || 0) * 10)}%"></i></div><span class="val">${it.votes ? it.vote.toFixed(1) : '-'}</span></div>
        ${f.p != null ? `<div class="cmp"><span class="lbl lime">나</span><div class="track me"><i style="width:${pct(f.p)}"></i></div><span class="val lime">${pct(f.p)}</span></div>` : ''}
        <p class="tiny" style="margin:8px 0 0">TMDB 평점은 10점 만점, ${it.votes.toLocaleString()}명 평가.${pre && it.votes < 30 ? ' 아직 개봉 전이라 평가가 거의 없어서, 계산할 때는 평균(6.5점) 쪽으로 당겨서 썼어요.' : it.votes < 30 ? ' 아직 평가한 사람이 적어서 계산할 때는 평균(6.5점) 쪽으로 조금 당겨서 썼어요.' : ''}</p>
      </div>`;
    if (f.sims && f.sims.length) {
      const resTxt = f.res >= 0.03 ? `남들보다 평균 <b class="lime">${Math.round(f.res * 100)}%p 더</b> 재밌어했어요` : f.res <= -0.03 ? `남들보다 평균 <b>${Math.round(-f.res * 100)}%p 덜</b> 재밌어했어요` : '남들과 비슷하게 반응했어요';
      const how = f.mode === 'kw'
        ? `TMDB 키워드·장르가 이 ${isSeries ? '시리즈' : '영화'}와 많이 겹치는 영화들에서, 나는 ${resTxt}.`
        : `TMDB가 이 영화와 비슷하다고 본 영화들에서, 나는 ${resTxt}.`;
      html += `<div class="card">
        <div class="card-title">${icon('film')}근거: ${f.mode === 'kw' ? '키워드·장르가 비슷한 영화' : '비슷한 영화'} ${f.sims.length}편</div>
        <p style="margin:0 0 6px;font-size:14px">${how}</p>
        <div class="list">${f.sims.slice(0, 6).map(x => {
          const r = state.ratings[x];
          const right = r ? `<span class="react ${REACT[r.s].cls}">내 기록 · ${REACT[r.s].label}</span>` : `<div class="row-pct${f.val(x) < 0.5 ? ' low' : ''}"><b>${pct(f.val(x))}</b><span>전체 ${pct(MV.crowdLike[x])}</span></div>`;
          return `<a class="row" href="#/movie/${x}">${poster(x, 'sm')}<div class="row-main"><div class="row-title">${esc(title(x))}</div><div class="row-meta">${esc(meta(x))}</div></div>${right}</a>`;
        }).join('')}</div>
      </div>`;
    }
    if (f.traits) {
      const fit = fitRowsVec(f.traits, ctx.prefs);
      html += `<div class="card">
        <div class="card-title">예상 재미 요소 <span class="tiny" style="font-weight:400">비슷한 영화들 기준</span></div>
        <div class="fit">${fit.rows}</div>
        <div class="why">
          <div class="why-box why-good"><h4>${icon('check')}잘 맞을 이유</h4>${fit.good.length ? fit.good.slice(0, 3).map(s => `<p>${esc(s)}</p>`).join('') : '<p>딱히 끌리는 포인트는 아직 없어요.</p>'}</div>
          <div class="why-box why-bad"><h4>${icon('alert')}아쉬울 수 있는 점</h4>${fit.bad.length ? fit.bad.slice(0, 3).map(s => `<p>${esc(s)}</p>`).join('') : '<p>특별히 걸리는 점은 없어요.</p>'}</div>
        </div>
      </div>`;
    }
    html += `<div class="card"><div class="card-title">줄거리</div><p style="margin:0;font-size:14px;color:var(--text-2)">${it.overview ? esc(it.overview) : '줄거리 정보가 아직 없어요.'}</p><p class="tiny" style="margin:8px 0 0">제공: TMDB</p></div>`;
    if (it.kobis) {
      const d = new Date(it.kobis.day);
      html += `<div class="card"><div class="card-title">박스오피스</div>
        <p style="margin:0;font-size:14px">${d.getMonth() + 1}월 ${d.getDate()}일 <b>${it.kobis.rank}위</b> · 하루 관객 ${it.kobis.audiCnt.toLocaleString()}명 · 누적 ${it.kobis.audiAcc.toLocaleString()}명${it.kobis.openDt ? ` · 개봉 ${esc(it.kobis.openDt)}` : ''}</p>
        <p class="tiny" style="margin:8px 0 0">출처: 영화관입장권통합전산망(KOBIS) 오픈API · 열 때마다 새로 불러오고 저장하지 않아요</p></div>`;
    }
    // 어디서 보나: 볼 곳이 있거나 OTT 작품(더한 영화·OTT 영화·시리즈)이면. 극장·개봉 예정인데 볼 곳이 없으면 극장 작품이라 빼둔다
    if (watchSub(it).length || watchRent(it).length || ['film', 'netflix', 'series'].includes(it.kind)) html += watchCard(it, isSeries ? null : it.tmdbId);
    if (SERVER && !pre) html += `<div class="card" id="twins-box">${twinsInner(tkey)}</div>`;
    if (SERVER) html += `<div class="card" id="talk-box" data-key="${tkey}">${talkPreviewInner(tkey)}</div>`;
    if (pre) {
      html += `<div class="card" id="new-rate"><div class="card-title">${icon('bell')}개봉 알림</div>
        <p style="margin:0;font-size:14px">${isSaved ? `찜해 뒀어요. <b>${md(it.release)}</b> 개봉날 알려 드릴게요.` : `찜하면 <b>${md(it.release)}</b> 개봉날 알려 드려요.`}</p>
        <p class="tiny" style="margin:8px 0 0">${!SERVER ? "개봉날 앱을 열면 '발견' 맨 위에 알림이 떠요." : account ? (pushSupported() ? "앱을 열면 '발견' 맨 위에 알림이 뜨고, '찜'에서 폰 알림을 켜면 앱을 닫아도 알려 드려요." : '앱을 열면 \'발견\' 맨 위에 알림이 떠요.') : "앱을 열면 '발견' 맨 위에 알림이 떠요. 베타 계정으로 로그인하면 폰 알림도 받을 수 있어요."} 개봉일이 바뀌면 알림 날짜도 따라 바뀌어요.</p></div>
      <div class="actionbar">
        <a class="btn grow" href="#/talk/${tkey}">${icon('talk')}기대평</a>
        <button class="btn primary grow" data-act="newSave" data-k="${kind}" data-id="${it.tmdbId}" aria-pressed="${isSaved}">${icon('bell', isSaved ? ' style="fill:currentColor"' : '')}${isSaved ? '알림 찜 해제' : '개봉 알림 찜'}</button>
      </div>`;
      return html;
    }
    html += `<div class="card" id="new-rate"><div class="card-title">봤어요? 어땠나요?</div>
        <div class="react-btns">${[1, 0, -1].map(s => `<button class="react-btn${mine && mine.s === s ? ' on' : ''}" data-act="newRate" data-k="${kind}" data-id="${it.tmdbId}" data-s="${s}" aria-pressed="${!!(mine && mine.s === s)}">${icon(REACT[s].icon)}${REACT[s].label}</button>`).join('')}</div>
        <p class="tiny" style="margin:10px 0 0">기록하면 이 예측이 맞았는지 '내 기록'과 '취향'에서 확인할 수 있어요.${account ? ' 토론에 글도 쓸 수 있어요.' : ''}</p></div>
      <div class="actionbar">
        <button class="btn grow" data-act="newSave" data-k="${kind}" data-id="${it.tmdbId}" aria-pressed="${isSaved}" aria-label="${isSaved ? '찜 해제' : '보고 싶은 영화에 담기'}">${icon('bookmark', isSaved ? ' style="fill:currentColor"' : '')}${isSaved ? '찜 해제' : '찜하기'}</button>
        <button class="btn primary grow" data-act="newScrollRate">${mine ? '기록 고치기' : '봤어요 · 기록하기'}</button>
      </div>`;
    return html;
  }

  // ════════ 영화 (추천 이유)
  function calibLine(p) {
    if (!CALIB) return '';
    const b = CALIB.bins.find(x => p * 100 >= x.from && p * 100 < x.to) || CALIB.bins[CALIB.bins.length - 1];
    if (!b || b.actual == null) return '';
    return `<div class="calib">${icon('check')}<span>시험에서 이 앱이 <b>${b.from}~${b.to}%</b>라고 한 영화는 실제로 <b>${Math.round(b.actual * 100)}%</b>가 재밌었다고 했어요 (예측 ${b.count.toLocaleString()}건).</span></div>`;
  }
  function fitRows(m, prefs) { return fitRowsVec(MV.traits[m], prefs); }
  function fitRowsVec(vec, prefs) {
    const good = [], bad = [];
    const rows = TRAITS.map((t, i) => {
      const lv = lvOf(vec[i]);
      const pv = prefs ? prefs[i] : 0;
      let tag = '<span class="tag plain">상관없음</span>';
      if (pv >= PREF_TH && lv >= 3) { good.push(WHY[t.key].goodHigh); tag = `<span class="tag good">${icon('check')}잘 맞음</span>`; }
      else if (pv >= PREF_TH && lv <= 1) { bad.push(WHY[t.key].badLow); tag = `<span class="tag bad">${icon('alert')}아쉬울 수도</span>`; }
      else if (pv <= -PREF_TH && lv >= 3 && WHY[t.key].badHigh) { bad.push(WHY[t.key].badHigh); tag = `<span class="tag bad">${icon('alert')}아쉬울 수도</span>`; }
      else if (pv <= -PREF_TH && lv <= 1 && WHY[t.key].goodLow) { good.push(WHY[t.key].goodLow); tag = `<span class="tag good">${icon('check')}잘 맞음</span>`; }
      else if (pv >= PREF_TH) tag = '<span class="tag me">중요하게 봄</span>';
      else if (pv <= -PREF_TH) tag = '<span class="tag me">덜 따짐</span>';
      const dots = [0, 1, 2, 3, 4].map(k => `<i${k <= lv ? ' class="on"' : ''}></i>`).join('');
      return `<div class="fit-row">${icon(t.icon)}<div><span class="fit-name">${t.name}</span> <span class="fit-level">${t.words[lv]}</span><span class="dots" aria-hidden="true">${dots}</span></div>${tag}</div>`;
    }).join('');
    return { rows, good, bad };
  }
  function movie(arg) {
    const m = +arg;
    if (!(m >= 0 && m < N) || arg === '') return notFound();
    const { ctx } = getCalc();
    const r = engine.predict(ctx, m, 5);
    const mine = state.ratings[m];
    const enough = ratedCount() >= MIN_RATED;
    const ok = enough && r.conf !== 'low';
    const c = MV.crowdLike[m];

    let big;
    if (!enough) {
      big = `<div class="big-wait">평가를 ${MIN_RATED}편 이상 해 주세요</div><p class="sub" style="margin:6px 0 0">본 영화를 알려 주면 나와 취향 비슷한 관객을 찾을 수 있어요.</p>`;
    } else if (!ok) {
      big = `<div class="big-wait">아직 판단 일러요</div><p class="sub" style="margin:6px 0 0">이 영화를 본, 나와 취향 비슷한 관객이 ${r.n}명뿐이에요. 아래 전체 관객 반응만 참고해 주세요.</p>`;
    } else {
      big = `<div class="tiny" style="font-size:14px;color:var(--text-2)">나한테 재밌을 확률</div>
        <div class="big"><div class="big-num">${Math.round(r.p * 100)}<small>%</small></div></div>${calibLine(r.p)}`;
    }
    let mineHtml = '';
    if (mine) {
      const R = REACT[mine.s];
      mineHtml = `<span class="mine-chip">내 기록 · ${R.label}</span>`;
      if (mine.pred != null) {
        const hit = (mine.pred >= 0.5) === (mine.s === 1);
        mineHtml += ` <span class="tag ${hit ? 'good' : 'bad'}" style="margin-top:8px">${hit ? icon('check') + '예측 적중' : icon('alert') + '예측 빗나감'} (기록 전 ${pct(mine.pred)})</span>`;
      }
    }
    const diff = r.p - c;
    // 홈의 '숨은 꿀잼'·'조심하세요'와 같은 기준으로 말한다
    const note = !ok ? ''
      : c < 0.5 && r.p >= 0.6 ? '숨은 꿀잼! 평은 낮지만 나한테는 재밌을 가능성이 높아요.'
      : c >= 0.5 && r.p < 0.4 ? '조심! 평은 좋지만 나한테는 안 맞을 수 있어요.'
      : diff >= 0.08 ? '남들 평보다 나한테 더 잘 맞을 영화예요.'
      : diff <= -0.08 ? '남들 평보다 나한테는 덜 맞을 수 있어요.'
      : '남들 평과 비슷하게 예상돼요.';
    const total = r.likes + r.mids + r.dislikes || 1;
    const fit = fitRows(m, ok ? ctx.prefs : null);
    if (ok && r.p >= 0.6 && r.likes / total >= 0.6) fit.good.push(`나와 취향 비슷한 관객 ${r.n}명 중 ${r.likes}명이 재밌었대요.`);
    if (ok && r.p < 0.5 && r.dislikes / total >= 0.25) fit.bad.push(`나와 취향 비슷한 관객 중 아쉬웠다는 사람이 ${r.dislikes}명이에요.`);
    const isSaved = !!state.saved[m];

    return `<div class="topbar">
        <button class="icon-btn" data-act="back" aria-label="뒤로">${icon('back')}</button>
        <h1>추천 이유</h1>
        <button class="icon-btn" data-act="howCalc" aria-label="확률 계산 방법">${icon('info')}</button>
      </div>
      <div class="movie-head">
        ${poster(m, 'md')}
        <div>
          <h2>${esc(title(m))}</h2>
          <div class="sub">${MV.ko[m] ? esc(MV.en[m]) + ' · ' : ''}${esc(meta(m))}</div>
          <div class="tiny">전체 평균 ★${MV.stars[m].toFixed(1)} · 평가 ${MV.count[m].toLocaleString()}명</div>
          ${mineHtml}
        </div>
      </div>
      <div class="card">${big}</div>
      <div class="card">
        <div class="card-title">남들 평 vs 나</div>
        <div class="cmp"><span class="lbl">전체 관객</span><div class="track"><i style="width:${pct(c)}"></i></div><span class="val">${pct(c)}</span></div>
        ${ok ? `<div class="cmp"><span class="lbl lime">나</span><div class="track me"><i style="width:${pct(r.p)}"></i></div><span class="val lime">${pct(r.p)}</span></div><p class="cmp-note">${note}</p>` : ''}
        <p class="tiny" style="margin:8px 0 0">전체 관객 = 이 영화를 본 사람 중 '재밌었다(별 4개 이상)'고 한 비율</p>
      </div>
      ${watchCard({ m }, MV.tmdb[m])}
      <div class="card">
        <div class="card-title">${icon('people')}근거: 나와 취향 비슷한 관객 ${r.n}명</div>
        ${r.n ? `<div class="stack" role="img" aria-label="재밌었어요 ${r.likes}명, 보통 ${r.mids}명, 아쉬웠어요 ${r.dislikes}명">
          <i class="s-like" style="width:${(100 * r.likes) / total}%"></i><i class="s-mid" style="width:${(100 * r.mids) / total}%"></i><i class="s-dis" style="width:${(100 * r.dislikes) / total}%"></i></div>
        <div class="legend"><span><i style="background:var(--lime)"></i>재밌었어요 ${r.likes}</span><span><i style="background:#8a9199"></i>보통 ${r.mids}</span><span><i style="background:var(--red)"></i>아쉬웠어요 ${r.dislikes}</span></div>
        <p class="tiny" style="margin:10px 0 0">더 비슷한 사람일수록 크게 반영하고, 원래 점수를 후하게 주는 사람은 그만큼 덜 반영해서 확률을 계산했어요.</p>`
        : '<p class="sub" style="margin:0">아직 이 영화를 본 취향 비슷한 관객이 없어요.</p>'}
      </div>
      <div class="card">
        <div class="card-title">내 취향과 맞는 포인트</div>
        <div class="fit">${fit.rows}</div>
        <div class="why">
          <div class="why-box why-good"><h4>${icon('check')}잘 맞는 이유</h4>${fit.good.length ? fit.good.slice(0, 3).map(s => `<p>${esc(s)}</p>`).join('') : '<p>딱히 끌리는 포인트는 아직 없어요.</p>'}</div>
          <div class="why-box why-bad"><h4>${icon('alert')}아쉬울 수 있는 점</h4>${fit.bad.length ? fit.bad.slice(0, 3).map(s => `<p>${esc(s)}</p>`).join('') : '<p>특별히 걸리는 점은 없어요.</p>'}</div>
        </div>
        <p class="tiny" style="margin:10px 0 0">영화의 재미 요소는 다른 관객들이 남긴 특징(MovieLens 태그)으로 계산했어요.</p>
      </div>
      <div class="card">
        <div class="card-title">취향 비슷한 관객 반응</div>
        ${r.neighbors && r.neighbors.length ? r.neighbors.slice().sort((a, b) => b.agree - a.agree).map((nb, i) => {
          const R = REACT[nb.level];
          return `<div class="peer"><div class="avatar" style="background:${AVATAR[i % AVATAR.length]}">${i + 1}</div>
            <div class="peer-main"><b>취향 일치 ${Math.round(nb.agree * 100)}%</b><span class="tiny">함께 본 영화 ${nb.common}편 · 별 ${nb.stars.toFixed(1)}</span></div>
            <span class="react ${R.cls}">${R.label}</span></div>`;
        }).join('') : '<p class="sub" style="margin:0">아직 없어요.</p>'}
        <p class="tiny" style="margin:10px 0 0">익명 관객이에요. '취향 일치'는 함께 본 영화에서 나와 반응이 같았던 정도예요.</p>
      </div>
      ${SERVER ? `<div class="card" id="talk-box" data-key="${keyOfIdx(m)}">${talkPreviewInner(keyOfIdx(m))}</div>` : ''}
      <div class="actionbar">
        <button class="btn grow" data-act="toggleSave" data-m="${m}" aria-pressed="${isSaved}" aria-label="${isSaved ? '찜 해제' : '보고 싶은 영화에 담기'}">${icon('bookmark', isSaved ? ' style="fill:currentColor"' : '')}${isSaved ? '찜 해제' : '찜하기'}</button>
        <a class="btn primary grow" href="#/rate/${m}">${mine ? '기록 고치기' : '봤어요 · 기록하기'}</a>
      </div>`;
  }
  function notFound() {
    return `<div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">${icon('back')}</button><h1>영화</h1><span style="width:44px"></span></div>
      <div class="empty">${icon('film')}<p>영화를 찾지 못했어요.</p><a class="btn" href="#/home">발견으로 가기</a></div>`;
  }

  // ════════ 감상 기록
  let rateOpen = false;
  function rate(arg) {
    const m = +arg;
    if (!(m >= 0 && m < N) || arg === '') return notFound();
    const mine = state.ratings[m];
    // 직접 바꾼 적 있는 요소는 그 값, 아니면 다른 관객 기준(데이터) 단계로 미리 맞춰 둔다
    const vals = TRAITS.map((t, i) => (mine && mine.traits && mine.traits[i] != null ? mine.traits[i] : lvOf(MV.traits[m][i]) + 1));
    return `<div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">${icon('back')}</button><h1>감상 기록</h1><span style="width:44px"></span></div>
      <div class="movie-head">${poster(m, 'md')}<div><h2>${esc(title(m))}</h2><div class="sub">어떤 재미가 남았나요?</div></div></div>
      <h3 class="h-sec" style="margin:4px 0 12px">나에게는 어땠나요?</h3>
      <div class="react-btns">
        ${[1, 0, -1].map(s => `<button class="react-btn${mine && mine.s === s ? ' on' : ''}" data-act="rateSet" data-m="${m}" data-s="${s}" aria-pressed="${!!(mine && mine.s === s)}">${icon(REACT[s].icon)}${REACT[s].label}</button>`).join('')}
      </div>
      ${mine ? `<div class="saved-note">${icon('check')}저장했어요 · 취향에 반영했어요</div>` : '<p class="tiny">하나만 누르면 바로 저장돼요. 아래는 하고 싶을 때만.</p>'}
      <details class="more-box" id="more-box"${rateOpen ? ' open' : ''}>
        <summary>더 알려주기 <span class="tiny" style="margin-left:6px;margin-right:auto">(선택)</span>${icon('chevron')}</summary>
        <div class="more-inner">
          <p class="tiny" style="margin-top:0">${mine ? '다른 관객 기준으로 미리 맞춰 뒀어요. 내가 느낀 대로 바꿔 주세요.' : '먼저 위에서 하나를 골라 주세요.'}</p>
          ${TRAITS.map((t, i) => `<div class="slider">
            <div class="slider-top">${icon(t.icon)}<b>${t.name}</b><output id="out-${i}">${t.words[vals[i] - 1]}</output></div>
            <input type="range" min="1" max="5" step="1" value="${vals[i]}" data-t="${i}" aria-label="${t.name}"${mine ? '' : ' disabled'}>
            <div class="slider-ends"><span>${t.ends[0]}</span><span>${t.ends[1]}</span></div>
          </div>`).join('')}
          <label class="slider-top" for="note" style="margin-top:14px;display:flex"><b>한 줄 감상</b><span class="tiny">선택</span></label>
          <textarea id="note" class="note" maxlength="100" placeholder="예: 생각 없이 웃기 좋았어요"${mine ? '' : ' disabled'}>${esc(mine && mine.note || '')}</textarea>
          <div class="count"><span id="note-count">${(mine && mine.note || '').length}</span>/100</div>
          <button class="btn primary block" style="margin-top:8px" data-act="rateExtra" data-m="${m}"${mine ? '' : ' disabled'}>내 취향에 반영하기</button>
          <div id="feedback"></div>
        </div>
      </details>
      <div class="actionbar"><button class="btn primary block" data-act="rateDone" data-m="${m}"${mine ? '' : ' disabled'}>완료</button></div>`;
  }

  // ════════ 취향
  // ════════ 내 취향 리포트 (2026-10-24 고도화)
  //  취향 유형(재미 요소 취향에서 가장 뚜렷한 것) · 숫자 3개(평가·후한 정도·취향 쌍둥이) · 재미 요소 6개 · 장르별 나 vs 전체 관객
  //  · 남들과 가장 다르게 본 영화 · 반응 나눔 · 내 기록으로 맞혀 보기 · 추천 적중 · 리포트 이미지(저장·공유)
  //  그래프 색은 어두운 카드(#1E242C)에서 색 검사(밝기·채도·색약 구분·대비)를 통과한 그래프용 색:
  //  연두 #73A40A = 나는 더 / 재밌었어요, 보라 #956ED2 = 나는 덜, 파랑 #3C7EBE = 보통, 빨강 #DD5652 = 아쉬웠어요
  const TASTE_TYPES = {
    laugh: { name: '웃음 사냥꾼', adj: '유쾌한', desc: '웃긴 장면이 많을수록 남들보다 더 즐거워해요' },
    tension: { name: '몰입 중독자', adj: '긴장감을 즐기는', desc: '손에 땀을 쥐게 하는 긴장감에 끌려요' },
    action: { name: '액션 마니아', adj: '화끈한', desc: '화끈한 액션이 많을수록 즐거워요' },
    pace: { name: '속도광', adj: '속도감을 즐기는', desc: '빠르게 몰아치는 전개를 좋아해요' },
    afterglow: { name: '여운 수집가', adj: '여운을 아는', desc: '보고 나서 오래 남는 영화를 아껴요' },
    story: { name: '개연성 탐정', adj: '꼼꼼한', desc: '이야기가 탄탄해야 마음이 열려요' },
  };
  // 내 평가(지난 영화)로 만든 리포트 재료
  function tasteReport(prefs) {
    const rows = Object.keys(state.ratings).map(k => ({ m: +k, s: state.ratings[k].s })).filter(r => r.m < N);
    const order = TRAITS.map((t, i) => ({ t, v: prefs ? prefs[i] : 0 })).sort((a, b) => b.v - a.v);
    const ups = order.filter(x => x.v >= PREF_TH), downs = order.filter(x => x.v <= -PREF_TH).reverse();
    const top = ups[0] ? TASTE_TYPES[ups[0].t.key] : null, second = ups[1] ? TASTE_TYPES[ups[1].t.key] : null;
    // 이름 = 꾸밈말(두 번째로 뚜렷한 재미) + 유형(가장 뚜렷한 재미). 줄을 바꿀 때는 꾸밈말과 유형 사이에서만
    const type = top ? { adj: second ? second.adj : '', base: top.name, desc: top.desc, ups: ups.slice(0, 2).map(x => x.t), downs: downs.slice(0, 2).map(x => x.t) }
      : { adj: '', base: '두루두루 관객', desc: '어떤 재미든 고르게 즐겨요. 평가가 늘면 더 뚜렷해질 수 있어요.', ups: [], downs: downs.slice(0, 2).map(x => x.t) };
    type.name = (type.adj ? type.adj + ' ' : '') + type.base;
    // 후한 정도: 내가 평가한 영화에서 '재밌었어요' 비율 − 같은 영화의 전체 관객 비율
    const likeRate = rows.length ? rows.filter(r => r.s === 1).length / rows.length : 0;
    const crowdRate = rows.length ? rows.reduce((s, r) => s + MV.crowdLike[r.m], 0) / rows.length : 0;
    // 장르: 3편 이상 평가한 장르마다 내 '재밌었어요' 비율 vs 같은 영화의 전체 관객 비율
    const g = {};
    for (const r of rows) for (const name of MV.genres[r.m]) { (g[name] = g[name] || { n: 0, like: 0, crowd: 0 }); g[name].n++; g[name].like += r.s === 1 ? 1 : 0; g[name].crowd += MV.crowdLike[r.m]; }
    const genres = Object.entries(g).filter(([, v]) => v.n >= 3).map(([name, v]) => ({ name, n: v.n, me: v.like / v.n, crowd: v.crowd / v.n }))
      .sort((a, b) => (b.me - b.crowd) - (a.me - a.crowd)).slice(0, 8);
    // 남들과 가장 다르게 본 영화
    const mineUp = rows.filter(r => r.s === 1 && MV.crowdLike[r.m] < 0.5).sort((a, b) => MV.crowdLike[a.m] - MV.crowdLike[b.m]).slice(0, 3);
    const mineDown = rows.filter(r => r.s === -1 && MV.crowdLike[r.m] >= 0.5).sort((a, b) => MV.crowdLike[b.m] - MV.crowdLike[a.m]).slice(0, 3);
    return { rows, type, likeRate, crowdRate, generous: likeRate - crowdRate, genres, mineUp, mineDown };
  }
  function taste() {
    const { ctx } = getCalc();
    const n = ratedCount();
    const counts = { 1: 0, 0: 0, '-1': 0 };
    for (const k in state.ratings) counts[state.ratings[k].s]++;
    let twins = 0;
    for (let v = 0; v < ctx.sim.length; v++) if (ctx.sim[v] >= 0.2) twins++;
    const prefs = ctx.prefs;
    const R = n >= MIN_RATED ? tasteReport(prefs) : null;
    const prefRows = TRAITS.map((t, i) => {
      const v = Math.max(-1, Math.min(1, prefs[i] * 2)); // 보기 좋게 2배 (막대 끝 = 아주 뚜렷)
      const left = v < 0 ? 50 + v * 50 : 50, width = Math.abs(v) * 50;
      const word = prefs[i] >= PREF_TH ? '남들보다 중요하게 봐요' : prefs[i] <= -PREF_TH ? '남들보다 덜 따져요' : '남들과 비슷해요';
      return `<div class="pref-row">${icon(t.icon)}<span class="pref-name">${t.name}</span>
        <div class="pref-col"><div class="pref-bar" role="img" aria-label="${t.name}: ${word}"><i class="${v < 0 ? 'down' : 'up'}" style="left:${left}%;width:${width}%"></i></div><div class="pref-word">${word}</div></div></div>`;
    }).join('');
    // 장르: 0~100% 줄 위에 전체 관객(세로 눈금)과 나(점, 더 좋아하면 연두 · 덜 좋아하면 보라)
    const genreRows = R && R.genres.length ? R.genres.map(x => {
      const up = x.me >= x.crowd, lo = Math.min(x.me, x.crowd) * 100, hi = Math.max(x.me, x.crowd) * 100;
      return `<div class="gen-row"><span class="gen-name">${esc(x.name)} <span class="tiny">${x.n}편</span></span>
        <div class="gen-track" role="img" aria-label="${esc(x.name)}: 나 ${pct(x.me)}, 전체 관객 ${pct(x.crowd)}">
          <i class="gen-gap ${up ? 'up' : 'down'}" style="left:${lo}%;width:${hi - lo}%"></i><i class="gen-crowd" style="left:${x.crowd * 100}%"></i><i class="gen-me ${up ? 'up' : 'down'}" style="left:${x.me * 100}%"></i>
        </div><span class="gen-val"><b>${pct(x.me)}</b> <span class="tiny">/ ${pct(x.crowd)}</span></span></div>`;
    }).join('') : '';
    const diffRow = (r, mine) => `<a class="row" href="#/movie/${r.m}">${poster(r.m, 'sm')}<div class="row-main"><div class="row-title">${esc(title(r.m))}</div><div class="row-meta">전체 관객 ${pct(MV.crowdLike[r.m])}가 재밌었다는 영화</div></div><span class="react ${REACT[mine].cls}">${REACT[mine].label}</span></a>`;
    const total = counts[1] + counts[0] + counts['-1'];
    const dist = total ? [[1, 'like'], [0, 'mid'], [-1, 'dis']].map(([s, cls]) => (counts[s] ? `<i class="dist-${cls}" style="flex:${counts[s]}"></i>` : '')).join('') : '';

    let check = '<p class="sub" style="margin:0">' + MIN_RATED + '편 이상 평가하면 보여 드려요.</p>';
    if (n >= MIN_RATED) {
      if (!selfCache) selfCache = engine.selfCheck(ratingList());
      const sc = selfCache;
      const win = sc.taste >= sc.crowd;
      check = `<div class="scorebox">
          <div class="score${win ? ' win' : ''}"><b>${sc.taste}/${sc.n}</b><span>취향 방식 (${pct(sc.taste / sc.n)})</span></div>
          <div class="score${win ? '' : ' win'}"><b>${sc.crowd}/${sc.n}</b><span>평균 별점 방식 (${pct(sc.crowd / sc.n)})</span></div>
        </div>
        <p class="tiny" style="margin:10px 0 0">내가 평가한 ${sc.n}편을 한 편씩 가려 놓고, 나머지 기록만으로 '재밌었을지'를 맞혀 봤어요.${sc.taste > sc.crowd ? ' 내 취향은 평균 별점보다 이 방식이 더 잘 맞혀요.' : sc.taste === sc.crowd ? ' 아직은 두 방식이 비슷해요.' : ' 지금은 평균 별점이 더 잘 맞혀요. 평가가 늘면 달라질 수 있어요.'}</p>`;
    }
    const tracked = Object.values(state.ratings).concat(Object.values(state.newRatings || {})).filter(r => r.pred != null);
    const hits = tracked.filter(r => (r.pred >= 0.5) === (r.s === 1)).length;

    if (!R) {
      return `<h2 class="h-xl" style="margin-top:20px">내 취향 리포트</h2>
        <div class="card"><p style="margin:0">${tasteSentence(prefs)}</p><p class="tiny" style="margin:10px 0 0">${MIN_RATED}편 이상 평가하면 취향 유형·장르·남들과 다르게 본 영화까지 정리해 드려요. 지금 ${n}편.</p></div>
        ${quickPromo()}`;
    }
    return `<h2 class="h-xl" style="margin-top:20px">내 취향 리포트</h2>
      <div class="card type-card">
        <span class="type-eyebrow">${icon('sparkle')}나의 영화 취향 유형</span>
        <h3 class="type-name">${R.type.adj ? `<span class="nb">${esc(R.type.adj)}</span> ` : ''}<span class="nb">${esc(R.type.base)}</span></h3>
        <p class="type-desc">${esc(R.type.desc)}</p>
        <div class="type-chips">${R.type.ups.map(t => `<span class="tchip up">${icon(t.icon)}${t.name} 중요</span>`).join('')}${R.type.downs.map(t => `<span class="tchip down">${icon(t.icon)}${t.name} 덜 따짐</span>`).join('')}</div>
        <button class="btn small block" data-act="shareTaste">${icon('share')}리포트 이미지 만들기</button>
      </div>
      <div class="stat-grid taste-stats">
        <div class="stat"><b>${n}편</b><span>평가</span></div>
        <div class="stat"><b>${R.generous >= 0.08 ? '후한 편' : R.generous <= -0.08 ? '깐깐한 편' : '보통'}</b><span>${R.generous >= 0.08 || R.generous <= -0.08 ? `관객보다 ${R.generous > 0 ? '+' : ''}${Math.round(R.generous * 100)}%p` : '관객과 비슷'}</span></div>
        <div class="stat"><b>${twins.toLocaleString()}명</b><span>취향 쌍둥이</span></div>
      </div>
      <div class="card">
        <div class="card-title">재미 요소별로 남들과 비교</div>
        ${prefRows}
        <p class="tiny legend"><span class="lgi"><i class="lg up"></i>남들보다 중요하게 봐요</span><span class="lgi"><i class="lg down"></i>덜 따져요</span><span class="lgi">가운데 선 = 남들과 같음</span></p>
      </div>
      ${genreRows ? `<div class="card">
        <div class="card-title">장르별 '재밌었어요' 비율</div>
        ${genreRows}
        <p class="tiny legend"><span class="lgi"><i class="lg dot up"></i>나</span><span class="lgi"><i class="lg tick"></i>같은 영화를 본 전체 관객</span><span class="lgi">3편 이상 평가한 장르</span></p>
      </div>` : ''}
      ${R.mineUp.length || R.mineDown.length ? `<div class="card">
        <div class="card-title">남들과 다르게 본 영화</div>
        ${R.mineUp.length ? `<p class="tiny" style="margin:0 0 4px">평은 낮지만 나는 재밌었어요</p><div class="list">${R.mineUp.map(r => diffRow(r, 1)).join('')}</div>` : ''}
        ${R.mineDown.length ? `<p class="tiny" style="margin:12px 0 4px">평은 좋지만 나는 아쉬웠어요</p><div class="list">${R.mineDown.map(r => diffRow(r, -1)).join('')}</div>` : ''}
      </div>` : ''}
      <div class="card">
        <div class="card-title">내 반응 나눔</div>
        <div class="dist" role="img" aria-label="재밌었어요 ${counts[1]}편, 보통 ${counts[0]}편, 아쉬웠어요 ${counts['-1']}편">${dist}</div>
        <p class="tiny legend"><span class="lgi"><i class="lg like"></i>재밌었어요 ${counts[1]}</span><span class="lgi"><i class="lg mid"></i>보통 ${counts[0]}</span><span class="lgi"><i class="lg dis"></i>아쉬웠어요 ${counts['-1']}</span></p><p class="tiny" style="margin:6px 0 0">같은 영화를 본 전체 관객은 ${pct(R.crowdRate)}가 재밌었다고 했어요. 나는 ${pct(R.likeRate)}.</p>
      </div>
      <div class="card">
        <div class="card-title">내 기록으로 맞혀 보기</div>
        ${check}
      </div>
      <div class="card">
        <div class="card-title">추천 적중 기록</div>
        ${tracked.length ? `<p style="margin:0"><b class="lime">${hits}/${tracked.length}</b> 적중 <span class="tiny">(확률을 본 뒤 기록한 영화 기준)</span></p>` : '<p class="sub" style="margin:0">확률을 본 영화를 보고 기록하면 여기에 쌓여요.</p>'}
      </div>
      ${quickPromo()}
      <div class="card" style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
        <button class="btn block" data-act="reset">처음부터 다시</button>
      </div>`;
  }
  // 리포트 이미지 (1080×1350, 인스타 세로): 유형 · 재미 요소 6개 · 숫자 3개. 폰은 공유 창, PC 는 파일로 저장
  async function tasteImage() {
    const { ctx } = getCalc();
    const R = tasteReport(ctx.prefs);
    let twins = 0;
    for (let v = 0; v < ctx.sim.length; v++) if (ctx.sim[v] >= 0.2) twins++;
    const W = 1080, H = 1350, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (!g.roundRect) g.roundRect = (x, y, w, h) => g.rect(x, y, w, h); // 오래된 브라우저: 둥근 모서리 없이
    // 글 줄바꿈: 폭을 넘으면 띄어쓰기에서 다음 줄로 (최대 max 줄)
    const wrap = (text, width, max) => {
      const out = [];
      let cur = '';
      for (const w of String(text).split(' ')) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > width && cur) { out.push(cur); cur = w; } else cur = t; }
      out.push(cur);
      return out.slice(0, max);
    };
    const F = '"Pretendard Variable", Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    try { await Promise.all(['800 92px', '700 40px', '600 34px'].map(f => document.fonts.load(`${f} "Pretendard Variable"`))); } catch (e) { /* 기본 글꼴 */ }
    g.fillStyle = '#151B20'; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W - 120, 140, 40, W - 120, 140, 760);
    glow.addColorStop(0, 'rgba(196,170,244,0.28)'); glow.addColorStop(1, 'rgba(21,27,32,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    const icon0 = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = BRAND_ICON; });
    if (icon0) { g.save(); g.beginPath(); g.roundRect(80, 80, 92, 92, 24); g.clip(); g.drawImage(icon0, 80, 80, 92, 92); g.restore(); }
    g.fillStyle = '#F5F7FA'; g.font = `800 46px ${F}`; g.fillText('취향컷', 196, 142);
    g.fillStyle = '#B4BAC2'; g.font = `700 40px ${F}`; g.fillText('나의 영화 취향 유형', 80, 290);
    // 유형 이름·설명 (길면 두 줄)
    g.fillStyle = '#D2F674'; g.font = `850 88px ${F}`;
    const nameLines = g.measureText(R.type.name).width <= W - 160 || !R.type.adj ? wrap(R.type.name, W - 160, 2) : [R.type.adj, R.type.base];
    nameLines.forEach((l, i) => g.fillText(l, 80, 400 + i * 104));
    let y = 400 + nameLines.length * 104 - 30;
    g.fillStyle = '#B4BAC2'; g.font = `600 36px ${F}`;
    for (const l of wrap(R.type.desc, W - 160, 2)) { g.fillText(l, 80, y); y += 50; }
    y += 44;
    // 재미 요소 6개 (가운데 = 남들과 같음, 연두 = 중요, 보라 = 덜 따짐)
    const x0 = 300, bw = 640, mid = x0 + bw / 2;
    TRAITS.forEach((t, i) => {
      const yy = y + i * 66, v = Math.max(-1, Math.min(1, ctx.prefs[i] * 2));
      g.fillStyle = '#F5F7FA'; g.font = `700 36px ${F}`; g.fillText(t.name, 80, yy + 12);
      g.fillStyle = '#313744'; g.beginPath(); g.roundRect(x0, yy - 10, bw, 22, 11); g.fill();
      if (Math.abs(v) > 0.01) { g.fillStyle = v > 0 ? '#73A40A' : '#956ED2'; const w = Math.abs(v) * bw / 2; g.beginPath(); g.roundRect(v > 0 ? mid : mid - w, yy - 10, w, 22, 11); g.fill(); }
      g.fillStyle = '#8B929B'; g.fillRect(mid - 2, yy - 18, 4, 38);
    });
    y += 5 * 66 + 72;
    g.fillStyle = '#8B929B'; g.font = `600 27px ${F}`; g.fillText('가운데 = 남들과 같음 · 오른쪽 = 남들보다 중요 · 왼쪽 = 덜 따짐', 80, y);
    // 숫자 3개
    y += 30;
    [[`${ratedCount()}편`, '평가'], [R.generous >= 0.08 ? '후한 편' : R.generous <= -0.08 ? '깐깐한 편' : '보통', '관객과 비교'], [`${twins.toLocaleString()}명`, '취향 쌍둥이']].forEach(([b, s], i) => {
      const bx = 80 + i * 316;
      g.fillStyle = '#1E242C'; g.beginPath(); g.roundRect(bx, y, 292, 128, 24); g.fill();
      g.fillStyle = '#F5F7FA'; g.font = `800 46px ${F}`; g.fillText(b, bx + 26, y + 62);
      g.fillStyle = '#8B929B'; g.font = `600 28px ${F}`; g.fillText(s, bx + 26, y + 104);
    });
    g.fillStyle = '#8B929B'; g.font = `600 28px ${F}`; g.fillText('남들의 별점보다, 나의 취향 — 취향컷', 80, H - 44);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }
  async function shareTaste() {
    const blob = await tasteImage();
    if (!blob) { toast('이미지를 만들지 못했어요'); return; }
    const file = new File([blob], '내_취향_리포트.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: '내 영화 취향' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '내_취향_리포트.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('리포트 이미지를 저장했어요');
  }

  // ════════ 찜
  function saved() {
    const ms = Object.keys(state.saved).map(Number);
    const news = Object.keys(state.savedNew || {}).map(id => ({ id, s: state.savedNew[id] }));
    if (!ms.length && !news.length) {
      return `<h2 class="h-xl" style="margin-top:20px">찜</h2><div class="empty">${icon('bookmark')}<p>아직 담은 영화가 없어요.<br>영화 화면에서 '찜하기'를 눌러 보세요.<br>개봉 예정작을 찜하면 개봉날 알려 드려요.</p><a class="btn" href="#/home">추천 보러 가기</a></div>`;
    }
    const { all } = getCalc();
    ms.sort((a, b) => all.p[b] - all.p[a]);
    // 신작 찜: 목록이 불러와져 있으면 지금 확률, 아니면 찜할 때의 확률·이름
    const newRow = ({ id, s }) => {
      const it = findNew(s.kind, id);
      const f = it ? newFeatures(it) : null;
      const p = f && f.p != null ? f.p : s.p;
      const waiting = s.release && daysUntil(s.release) > 0;
      const right = state.newRatings[id] ? `<div class="row-pct"><b>봤어요</b><span>${REACT[state.newRatings[id].s].label}</span></div>`
        : p != null ? `<div class="row-pct${p < 0.5 ? ' low' : ''}"><b>${pct(p)}</b><span>맞을 확률</span></div>` : '<div class="row-pct low"><span>신작</span></div>';
      const meta2 = waiting ? `${icon('bell')}${md(s.release)} 개봉 · ${ddayText(s.release)}` : s.release && !s.alerted ? `<b class="lime">개봉했어요!</b> · ${md(s.release)}` : (KIND_NAME[s.kind] || '신작');
      return `<div class="row" style="padding-right:0">
        <a href="#/new/${s.kind}/${id}" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">${npImg(s, 'nposter-sm')}
          <div class="row-main"><div class="row-title">${esc(s.title)}</div><div class="row-meta row-meta-icon">${meta2}</div></div>${right}</a>
        <button class="icon-btn" data-act="unsaveNew" data-id="${id}" aria-label="${esc(s.title)} 찜 해제">${icon('close')}</button>
      </div>`;
    };
    const waitingList = news.filter(x => x.s.release && daysUntil(x.s.release) > 0).sort((a, b) => a.s.release.localeCompare(b.s.release));
    const others = news.filter(x => !waitingList.includes(x)).sort((a, b) => b.s.at - a.s.at);
    return `<h2 class="h-xl" style="margin-top:20px">찜 <span class="tiny">${ms.length + news.length}편</span></h2>
      ${waitingList.length ? `<div class="sec-head" style="margin-top:4px"><h3 class="h-sec">개봉 알림</h3><span class="tiny">개봉 빠른 순</span></div>
        <div class="list">${waitingList.map(newRow).join('')}</div>
        ${SERVER ? `<div class="card push-card" id="push-box">${pushInner()}</div>` : ''}` : ''}
      ${others.length ? `<div class="sec-head"${waitingList.length ? '' : ' style="margin-top:4px"'}><h3 class="h-sec">신작</h3></div><div class="list">${others.map(newRow).join('')}</div>` : ''}
      ${ms.length ? `<div class="sec-head"><h3 class="h-sec">지난 영화</h3><span class="tiny">재밌을 확률 순</span></div>` : ''}
      <div class="list">${ms.map(m => `<div class="row" style="padding-right:0">
        <a href="#/movie/${m}" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">${poster(m, 'sm')}
          <div class="row-main"><div class="row-title">${esc(title(m))}</div><div class="row-meta">${esc(meta(m))}</div></div>
          <div class="row-pct${all.p[m] < 0.5 ? ' low' : ''}"><b>${state.ratings[m] ? '봤어요' : pct(all.p[m])}</b><span>${state.ratings[m] ? REACT[state.ratings[m].s].label : '재밌을 확률'}</span></div></a>
        <button class="icon-btn" data-act="unsave" data-m="${m}" aria-label="${esc(title(m))} 찜 해제">${icon('close')}</button>
      </div>`).join('')}</div>`;
  }

  // ════════ 내 기록
  function historyScreen() {
    const entries = Object.keys(state.ratings).map(k => ({ m: +k, r: state.ratings[k] }))
      .concat(Object.keys(state.newRatings || {}).map(id => ({ id, r: state.newRatings[id] })));
    const filters = [['all', '전체'], ['1', '재밌었어요'], ['0', '보통'], ['-1', '아쉬웠어요']];
    const list = entries.filter(e => histFilter === 'all' || String(e.r.s) === histFilter).sort((a, b) => (b.r.at || 0) - (a.r.at || 0));
    const date = t => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
    return `<h2 class="h-xl" style="margin-top:20px">내 기록 <span class="tiny">${entries.length}편</span></h2>
      ${accountCard()}
      ${quickPromo()}
      <div class="chips scroll" role="group" aria-label="반응별로 보기">${filters.map(([k, l]) => `<button class="chip${histFilter === k ? ' on' : ''}" data-act="histFilter" data-k="${k}" aria-pressed="${histFilter === k}">${l}</button>`).join('')}</div>
      ${list.length ? `<div class="list" style="margin-top:8px">${list.map(({ m, id, r }) => {
        const R = REACT[r.s];
        const hit = r.pred != null ? ((r.pred >= 0.5) === (r.s === 1)) : null;
        const badge = hit == null ? '' : `<span class="tag ${hit ? 'good' : 'bad'}" style="margin-top:4px">${hit ? '예측 적중' : '예측 빗나감'} · 기록 전 ${pct(r.pred)}</span>`;
        if (id != null) {
          return `<a class="row" href="#/new/${r.kind}/${id}">${npImg(r, 'nposter-sm')}
            <div class="row-main"><div class="row-title">${esc(r.title)}</div><div class="row-meta">${r.at ? date(r.at) + ' · ' : ''}${KIND_NAME[r.kind] || '신작'}</div>${badge}</div>
            <span class="react ${R.cls}">${R.label}</span></a>`;
        }
        return `<a class="row" href="#/movie/${m}">${poster(m, 'sm')}
          <div class="row-main"><div class="row-title">${esc(title(m))}</div>
            <div class="row-meta">${r.at ? date(r.at) + ' · ' : ''}${esc(meta(m))}</div>
            ${r.note ? `<div class="row-meta" style="color:var(--text-2)">“${esc(r.note)}”</div>` : ''}
            ${hit == null ? '' : `<span class="tag ${hit ? 'good' : 'bad'}" style="margin-top:4px">${hit ? '예측 적중' : '예측 빗나감'} · 기록 전 ${pct(r.pred)}</span>`}
          </div><span class="react ${R.cls}">${R.label}</span></a>`;
      }).join('')}</div>` : `<div class="empty">${icon('film')}<p>${entries.length ? '이 반응으로 기록한 영화가 없어요.' : '아직 기록이 없어요.'}</p></div>`}`;
  }

  // ════════ 베타 계정 화면 (가입 · 로그인 · 내 계정)
  const hashStr = s => { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };
  function avatar(nick, cls) {
    const ch = [...String(nick || '?')][0].toUpperCase();
    return `<span class="avatar${cls ? ' ' + cls : ''}" style="background:${AVATAR[hashStr(nick) % AVATAR.length]}" aria-hidden="true">${esc(ch)}</span>`;
  }
  const topbar = (t, right) => `<div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">${icon('back')}</button><h1>${t}</h1>${right || '<span style="width:44px"></span>'}</div>`;
  const syncText = () => (syncInfo.error ? '기록 맞추기를 못 했어요 · 다음에 다시 해요' : syncInfo.at ? `기록 맞춤 ${ago(syncInfo.at)}` : '폰·PC 기록 맞추기 켜짐');
  function formError(el, msg) { if (el) { el.textContent = msg; el.hidden = false; } }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      // 인터넷 주소가 https 가 아니면(같은 와이파이 폰 등) 예전 방식으로 복사
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }
  function loginPrompt(msg) {
    openModal(`<h3>${esc(msg)}</h3><p>베타 계정은 초대 코드가 있어야 만들 수 있어요. 읽기는 로그인 없이도 돼요.</p>
      <div class="sheet-actions"><a class="btn grow" href="#/login/signup">가입</a><a class="btn primary grow" href="#/login">로그인</a></div>`);
  }

  function accountCard() {
    if (!SERVER) return '';
    if (!account) {
      return `<div class="card acct-card">
        <div class="card-title">${icon('user')}베타 계정</div>
        <p class="sub" style="margin:0 0 12px">계정을 만들면 지인들과 영화별로 토론하고, 폰·PC에서 같은 기록을 쓰고, 개봉 알림을 폰으로 받을 수 있어요.</p>
        <div class="btn-row"><a class="btn primary grow" href="#/login/signup">가입하기</a><a class="btn grow" href="#/login">로그인</a></div>
      </div>`;
    }
    return `<a class="card acct-card acct-on" href="#/account">${avatar(account.nick)}<div class="row-main"><b>${esc(account.nick)}</b>${account.admin ? ' <span class="tag me">관리자</span>' : ''}<div class="tiny">${syncText()}</div></div>${icon('right')}</a>`;
  }

  let loginFrom = '';
  function loginScreen(arg) {
    const signup = arg === 'signup';
    const top = topbar('베타 계정');
    if (!SERVER) return `${top}<div class="empty">${icon('user')}<p>베타 계정은 '취향컷 시작.bat'으로 켰을 때만 쓸 수 있어요.</p></div>`;
    if (account) return `${top}<div class="empty">${icon('check')}<p><b>${esc(account.nick)}</b> 계정으로 로그인해 있어요.</p><a class="btn" href="#/account">내 계정 보기</a></div>`;
    return `${top}
      <div class="seg" role="tablist" aria-label="로그인 또는 가입">
        <a role="tab" aria-selected="${!signup}" class="${signup ? '' : 'on'}" href="#/login">로그인</a>
        <a role="tab" aria-selected="${signup}" class="${signup ? 'on' : ''}" href="#/login/signup">가입</a>
      </div>
      <p class="sub" style="margin:0 0 14px">${signup ? '지인 베타예요. 초대한 분께 받은 코드가 있어야 가입할 수 있어요.' : '가입할 때 정한 닉네임과 비밀번호를 넣어 주세요.'}</p>
      <form id="auth-form" class="form" novalidate data-mode="${signup ? 'signup' : 'login'}">
        ${signup ? '<label class="field"><span>초대 코드</span><input name="invite" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="예: K7QX-M3RT"></label>' : ''}
        <label class="field"><span>닉네임</span><input name="nick" autocomplete="username" maxlength="12" spellcheck="false" placeholder="${signup ? '2~12자 · 한글·영문·숫자·밑줄' : ''}"></label>
        <label class="field"><span>비밀번호</span><input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" maxlength="72" placeholder="${signup ? '6자 이상' : ''}"></label>
        ${signup ? `<label class="check"><input type="checkbox" name="agree"><span>개인정보 안내와 토론 규칙을 읽었고 동의해요</span></label>
          <div class="btn-row"><button type="button" class="btn small grow" data-act="showPrivacy">개인정보 안내</button><button type="button" class="btn small grow" data-act="showRules">토론 규칙</button></div>` : ''}
        <p class="form-error" role="alert" hidden></p>
        <button class="btn primary block" type="submit">${signup ? '가입하기' : '로그인'}</button>
      </form>
      <p class="tiny" style="margin-top:14px">${signup ? '다른 사이트에서 쓰는 비밀번호는 쓰지 마세요. 비밀번호는 알아볼 수 없게 바꿔서 저장해요. ' : ''}비밀번호를 잊으면 관리자에게 말해 주세요. 임시 비밀번호를 만들어 드려요.</p>`;
  }
  async function doAuth(f) {
    const mode = f.dataset.mode, E = f.elements, err = f.querySelector('.form-error');
    const body = { nick: E.nick.value.trim(), password: E.password.value };
    if (mode === 'signup') { body.invite = E.invite.value.trim(); body.agree = E.agree.checked; }
    const bad = mode === 'signup' && !body.invite ? '초대 코드를 넣어 주세요'
      : body.nick.length < 2 ? '닉네임을 2자 이상 넣어 주세요'
      : !body.password ? '비밀번호를 넣어 주세요'
      : mode === 'signup' && body.password.length < 6 ? '비밀번호는 6자 이상으로 정해 주세요'
      : mode === 'signup' && !body.agree ? '개인정보 안내와 토론 규칙에 동의해 주세요' : '';
    if (bad) return formError(err, bad);
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    const r = await api('POST', '/api/auth/' + mode, body);
    btn.disabled = false;
    if (!r.ok) return formError(err, r.error);
    setAccount({ token: r.data.token, nick: r.data.user.nick, admin: !!r.data.user.admin });
    toast(mode === 'signup' ? `가입했어요. 반가워요, ${r.data.user.nick}님!` : `${r.data.user.nick}님, 어서 오세요`);
    resetSocial();
    await pullState('login');
    if (!pendingMerge) afterLogin();
  }
  // 로그인 화면으로 오기 전 화면으로 돌아간다
  function afterLogin() { go(loginFrom && !/^#\/login/.test(loginFrom) ? loginFrom : '#/home'); }

  function accountScreen() {
    const top = topbar('내 계정');
    if (!SERVER || !account) return `${top}<div class="empty">${icon('user')}<p>로그인하면 볼 수 있어요.</p><a class="btn primary" href="#/login">로그인</a></div>`;
    return `${top}
      <div class="card acct-head">${avatar(account.nick, 'lg')}<div class="row-main"><h2>${esc(account.nick)}</h2><div class="tiny">${account.admin ? '관리자 · ' : ''}${syncText()}</div></div></div>
      <div class="card">
        <div class="card-title">${icon('check')}폰·PC 기록 맞추기</div>
        <p class="sub" style="margin:0 0 10px">평가·찜·감상을 계정에 저장해요. 다른 기기에서 같은 계정으로 로그인하면 이어서 쓸 수 있어요.</p>
        <button class="btn small block" data-act="syncNow">지금 맞추기</button>
      </div>
      <div class="card" id="push-box">${pushInner()}</div>
      ${account.admin ? `<a class="card link-card" href="#/admin">${icon('shield')}<div class="row-main"><b>관리 화면</b><div class="tiny">초대 코드 · 신고된 글 · 가입자</div></div>${icon('right')}</a>` : ''}
      <div class="card"><div class="card-title">차단한 사람</div><div id="blocks-box">${blocksInner()}</div></div>
      <div class="card">
        <div class="card-title">비밀번호 바꾸기</div>
        <form id="pw-form" class="form" novalidate>
          <label class="field"><span>지금 비밀번호</span><input name="old" type="password" autocomplete="current-password"></label>
          <label class="field"><span>새 비밀번호</span><input name="password" type="password" autocomplete="new-password" maxlength="72" placeholder="6자 이상"></label>
          <p class="form-error" role="alert" hidden></p>
          <button class="btn block" type="submit">비밀번호 바꾸기</button>
        </form>
      </div>
      <div class="card btn-col">
        <button class="btn block" data-act="showPrivacy">개인정보 안내</button>
        <button class="btn block" data-act="showRules">토론 규칙</button>
        <button class="btn block" data-act="logout">로그아웃</button>
        <button class="btn block danger" data-act="deleteAccount">회원 탈퇴</button>
      </div>`;
  }
  async function doPassword(f) {
    const E = f.elements, err = f.querySelector('.form-error');
    if (!E.old.value) return formError(err, '지금 비밀번호를 넣어 주세요');
    if (E.password.value.length < 6) return formError(err, '새 비밀번호는 6자 이상으로 정해 주세요');
    const r = await api('POST', '/api/me/password', { old: E.old.value, password: E.password.value });
    if (!r.ok) return formError(err, r.error);
    f.reset();
    err.hidden = true;
    toast('비밀번호를 바꿨어요. 다른 기기는 다시 로그인해야 해요');
  }
  // 이 기기의 폰 알림 끊기 (withServer: 서버 목록에서도 지움 — 로그인해 있을 때만 가능)
  async function dropPush(withServer) {
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/') : null;
      const sub = reg && await reg.pushManager.getSubscription();
      if (!sub) return;
      if (withServer) await api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint });
      await sub.unsubscribe();
    } catch (e) { /* 알림을 안 켰던 기기 */ }
  }
  // 로그아웃·탈퇴 뒤: 이 기기 기록과 불러온 토론·관리 정보를 비운다
  function clearDevice() {
    setAccount(null);
    state = fresh();
    writeLocal();
    calc = null; selfCache = null; onbUndo = []; onbTarget = GOAL; searchQuery = ''; histFilter = 'all';
    resetSocial();
  }
  async function doLogout(force) {
    if (!force && !(await syncNow())) {
      openModal(`<h3>기록을 맞추지 못했어요</h3><p>서버에 연결되지 않아요. 지금 로그아웃하면 이 기기에서 마지막에 고친 기록이 사라질 수 있어요.</p>
        <div class="sheet-actions"><button class="btn grow" data-act="closeModal">취소</button><button class="btn primary grow" data-act="logoutForce">그래도 로그아웃</button></div>`);
      return;
    }
    await dropPush(true);
    await api('POST', '/api/auth/logout', {});
    clearDevice();
    closeModal();
    toast('로그아웃했어요');
    go('#/welcome');
  }
  async function doDeleteAccount(f) {
    const err = f.querySelector('.form-error');
    if (!f.elements.password.value) return formError(err, '비밀번호를 넣어 주세요');
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    const r = await api('POST', '/api/me/delete', { password: f.elements.password.value });
    btn.disabled = false;
    if (!r.ok) return formError(err, r.error);
    await dropPush(false); // 서버 쪽 알림 주소는 탈퇴와 함께 지워졌다
    clearDevice();
    closeModal();
    toast('탈퇴했어요. 계정과 기록, 글을 모두 지웠어요');
    go('#/welcome');
  }

  let BLOCKS = { status: 'idle', list: [] };
  function loadBlocks() {
    BLOCKS = { status: 'loading', list: BLOCKS.list };
    api('GET', '/api/me/blocks').then(r => {
      BLOCKS = r.ok ? { status: 'ok', list: r.data.blocks } : { status: 'error', error: r.error, list: [] };
      const b = document.getElementById('blocks-box');
      if (b) b.innerHTML = blocksInner();
    });
  }
  function blocksInner() {
    if (BLOCKS.status === 'error') return `<p class="sub" style="margin:0">${esc(BLOCKS.error)}</p>`;
    if (BLOCKS.status !== 'ok') return '<p class="sub" style="margin:0">불러오는 중…</p>';
    if (!BLOCKS.list.length) return '<p class="sub" style="margin:0">차단한 사람이 없어요. 토론 글의 ⋯ 버튼에서 차단할 수 있어요.</p>';
    return BLOCKS.list.map(b => `<div class="peer">${avatar(b.nick)}<div class="peer-main"><b>${esc(b.nick)}</b><span class="tiny">${ago(b.at)} 차단</span></div><button class="btn small" data-act="unblock" data-nick="${esc(b.nick)}">차단 풀기</button></div>`).join('');
  }

  const RULES_HTML = `<h3>토론 규칙</h3>
    <p>1. <b>본 사람끼리</b> 이야기해요. 이 앱에서 그 작품을 평가한 사람만 글을 쓸 수 있어요(개봉 전 작품은 누구나 기대평).</p>
    <p>2. 결말·반전 이야기는 <b>'스포일러 있음'</b>을 켜 주세요. 내용이 가려지고, 누른 사람만 봐요.</p>
    <p>3. 취향은 사람마다 달라요. 다른 취향을 비웃거나 욕하지 않아요. 욕설·비하·괴롭힘, 광고·도배는 안 돼요.</p>
    <p>4. 서로 다른 <b>3명이 신고하면</b> 관리자가 보기 전까지 글이 가려져요. 신고한 사람은 밝히지 않아요.</p>
    <p>5. 보기 싫은 사람은 글의 ⋯ 버튼 → <b>'글 안 보기(차단)'</b>. 그 사람 글이 안 보이고, 그 사람은 내 글에 답글을 못 달아요.</p>
    <p>6. 내 글은 언제든 지울 수 있어요. 탈퇴하면 내 글도 모두 지워져요.</p>
    <div class="sheet-actions"><button class="btn primary block" data-act="closeModal">알겠어요</button></div>`;
  const PRIVACY_HTML = `<h3>개인정보 안내 (지인 베타)</h3>
    <p><b>모으는 것</b>: 닉네임, 비밀번호(알아볼 수 없게 바꾼 값만), 평가·찜·감상 기록, 토론 글·공감·신고·차단, 폰 알림을 켠 기기의 알림 주소.</p>
    <p><b>왜</b>: 폰·PC 기록 맞추기, 토론의 '취향 비슷한 순' 계산, 찜한 영화 개봉 알림. 그 밖의 목적으로 쓰거나 남에게 팔지 않아요.</p>
    <p><b>남에게 보이는 것</b>: 토론에 글을 쓰면 닉네임과 그 작품 반응(재밌었어요 등)이 보여요. '먼저 본 취향 쌍둥이'에는 닉네임 없이 반응만 보여요. 다른 기록은 보이지 않아요.</p>
    <p><b>어디에</b>: 베타 운영자가 관리하는 취향컷 서버. 폰 알림은 알림 회사(구글·애플·마이크로소프트 등)를 거치지만 알림 내용은 우리 서버에서 가져와요.</p>
    <p><b>지우기</b>: '내 기록 › 내 계정 › 회원 탈퇴'를 누르면 계정·기록·글이 바로 지워져요. 서버 사고에 대비한 복사본(백업)에서는 7일 안에 사라져요.</p>
    <p class="tiny">지인끼리 시험하는 베타예요. 정식 출시 전에 정식 개인정보처리방침으로 바꿔요.</p>
    <div class="sheet-actions"><button class="btn primary block" data-act="closeModal">알겠어요</button></div>`;

  // ════════ 관리 (관리자만)
  let ADMIN = { status: 'idle' };
  function loadAdmin() {
    ADMIN = { status: 'loading', data: ADMIN.data };
    api('GET', '/api/admin/overview').then(r => {
      ADMIN = r.ok ? { status: 'ok', data: r.data } : { status: 'error', error: r.error, data: ADMIN.data };
      if (currentScreen === 'admin') rerender();
    });
  }
  function adminScreen() {
    const top = topbar('관리');
    if (!SERVER || !account || !account.admin) return `${top}<div class="empty">${icon('shield')}<p>관리자만 볼 수 있어요.</p></div>`;
    if (ADMIN.status === 'idle') loadAdmin();
    const d = ADMIN.data;
    if (!d) return ADMIN.status === 'error' ? `${top}<div class="empty">${icon('alert')}<p>${esc(ADMIN.error)}</p><button class="btn" data-act="adminReload">다시 불러오기</button></div>` : `${top}<div class="empty">${icon('shield')}<p>불러오는 중…</p></div>`;
    const reasons = r => r.reasons.map(x => `${esc(x.reason)} ${x.n}`).join(' · ') || '신고 없음';
    return `${top}
      <div class="stat-grid">${[['가입', d.stats.users + '명'], ['글', d.stats.posts + '개'], ['토론 작품', d.stats.threads + '편'], ['개봉 찜', d.stats.watch + '개'], ['폰 알림', d.stats.push + '대']].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('')}</div>
      <div class="card">
        <div class="card-title">${icon('user')}초대 코드</div>
        <div class="invite"><code id="invite-code">${esc(d.invite)}</code><button class="btn small" data-act="copyInvite">${icon('copy')}복사</button></div>
        <p class="tiny" style="margin:10px 0">가입할 때 넣는 코드예요. 지인에게만 알려 주세요. 코드가 퍼졌으면 새로 만드세요(이미 가입한 사람은 그대로 써요).</p>
        ${d.inviteFixed ? '<p class="tiny">서버 설정(환경 변수)으로 정한 코드라 여기서는 못 바꿔요.</p>' : '<button class="btn small block" data-act="newInvite">새 코드 만들기</button>'}
      </div>
      <div class="sec-head"><h3 class="h-sec">신고된 글</h3><span class="tiny">3명이 신고하면 자동으로 가려져요</span></div>
      ${d.reported.length ? d.reported.map(r => `<div class="card report">
          <div class="tiny">${esc(r.title || r.key)} · ${r.nick ? esc(r.nick) : '탈퇴한 사용자'} · ${ago(r.created_at)}</div>
          <p class="report-body">${r.deleted ? '<i>지워진 글</i>' : lines(r.body)}</p>
          <div class="tiny">${reasons(r)}${r.hidden ? ' · <b class="warn">가려짐</b>' : ''}</div>
          <div class="btn-row">${r.hidden ? `<button class="btn small grow" data-act="adminPost" data-a="restore" data-id="${r.id}">되살리기</button>` : `<button class="btn small grow" data-act="adminPost" data-a="hide" data-id="${r.id}">가리기</button>`}${r.deleted ? '' : `<button class="btn small grow danger" data-act="adminPost" data-a="delete" data-id="${r.id}">지우기</button>`}</div>
        </div>`).join('') : '<div class="card tiny">신고된 글이 없어요.</div>'}
      <div class="sec-head"><h3 class="h-sec">가입자</h3><span class="tiny">${d.users.length}명 · 최근 가입 순</span></div>
      <div class="card">${d.users.map(u => `<div class="peer">${avatar(u.nick)}<div class="peer-main"><b>${esc(u.nick)}</b>${u.admin ? ' <span class="tag me">관리자</span>' : ''}<span class="tiny">${new Date(u.created_at).toLocaleDateString('ko-KR')} 가입 · 평가 ${u.ratings} · 글 ${u.posts}</span></div>${u.admin ? '' : `<button class="btn small" data-act="resetPw" data-nick="${esc(u.nick)}">비밀번호 초기화</button>`}</div>`).join('')}</div>`;
  }

  // ════════ 개봉 알림 (앱 안): 찜한 개봉 예정작의 개봉일이 되면 '발견' 맨 위 · '찜' 탭 점
  function dueAlerts() {
    const out = [];
    for (const id in state.savedNew) {
      const s = state.savedNew[id];
      if (s && s.release && !s.alerted && daysUntil(s.release) <= 0) out.push({ id, s });
    }
    return out.sort((a, b) => b.s.release.localeCompare(a.s.release));
  }
  function alertBanner() {
    const due = dueAlerts();
    if (!due.length) return '';
    const { id, s } = due[0];
    return `<div class="alert-banner" role="status">${icon('bell')}
      <div class="row-main"><b>찜한 ‘${esc(s.title)}’ ${daysUntil(s.release) === 0 ? '오늘 개봉해요' : '개봉했어요'}</b>
        <span class="tiny">${s.p != null ? `찜할 때 나랑 맞을 확률 ${pct(s.p)}` : '극장에서 볼 수 있어요'}${due.length > 1 ? ` · 외 ${due.length - 1}편` : ''}</span></div>
      <div class="alert-actions"><a class="btn small primary" href="#/new/${esc(s.kind)}/${esc(id)}" data-act="seeAlert" data-id="${esc(id)}">보기</a><button class="btn small" data-act="ackAlert" data-id="${esc(id)}">확인</button></div>
    </div>`;
  }

  // ════════ 폰 알림 (웹 푸시): https 주소(또는 이 PC의 localhost)에서만 된다
  const pushSupported = () => SERVER && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let pushState = 'unknown'; // unknown · on · off · denied · busy
  function pushInner() {
    if (!SERVER) return '';
    const title = `<div class="card-title">${icon('bell')}폰 알림</div>`;
    if (!account) return `${title}<p class="sub" style="margin:0 0 10px">개봉 알림은 앱을 열면 '발견' 맨 위에 떠요. 베타 계정으로 로그인하면 앱을 닫아도 폰 알림으로 받을 수 있어요.</p><a class="btn small block" href="#/login">로그인</a>`;
    if (!pushSupported()) {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const why = !window.isSecureContext ? "폰 알림은 취향컷을 인터넷 주소(https)로 올린 뒤에 켤 수 있어요. 지금은 앱을 열면 '발견' 맨 위에 알림이 떠요."
        : ios ? "아이폰은 Safari의 공유 버튼 → '홈 화면에 추가'로 취향컷을 설치한 뒤, 거기서 알림을 켤 수 있어요."
        : '이 브라우저는 폰 알림을 지원하지 않아요. 크롬이나 엣지로 열어 주세요.';
      return `${title}<p class="sub" style="margin:0">${why}</p>`;
    }
    if (pushState === 'unknown') { refreshPush(); return `${title}<p class="sub" style="margin:0">알림 상태를 확인하는 중…</p>`; }
    if (pushState === 'denied') return `${title}<p class="sub" style="margin:0 0 10px">이 브라우저에서 취향컷 알림이 막혀 있어요. 주소창 왼쪽 자물쇠 → 알림 → '허용'으로 바꾼 뒤 다시 눌러 주세요.</p><button class="btn small block" data-act="pushOn">다시 켜 보기</button>`;
    if (pushState === 'on') return `${title}<p class="sub" style="margin:0 0 10px"><b class="lime">켜짐</b> · 찜한 영화가 개봉하는 날 이 기기로 알려 드려요.</p><div class="btn-row"><button class="btn small grow" data-act="pushTest">시험 알림 보내기</button><button class="btn small grow" data-act="pushOff">끄기</button></div>`;
    return `${title}<p class="sub" style="margin:0 0 10px">켜면 앱을 닫아도, 찜한 영화가 개봉하는 날 이 기기로 알려 드려요.</p><button class="btn small primary block" data-act="pushOn"${pushState === 'busy' ? ' disabled' : ''}>이 기기에서 알림 켜기</button>`;
  }
  function redrawPush() { const b = document.getElementById('push-box'); if (b) b.innerHTML = pushInner(); }
  async function refreshPush() {
    try {
      if (Notification.permission === 'denied') pushState = 'denied';
      else {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const sub = reg && await reg.pushManager.getSubscription();
        if (!sub) pushState = 'off';
        else { const r = await api('POST', '/api/push/check', { endpoint: sub.endpoint }); pushState = r.ok && r.data.subscribed ? 'on' : 'off'; }
      }
    } catch (e) { pushState = 'off'; }
    redrawPush();
  }
  const b64uBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
  async function pushOn() {
    pushState = 'busy';
    redrawPush();
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { pushState = perm === 'denied' ? 'denied' : 'off'; redrawPush(); return; }
      const reg = await navigator.serviceWorker.register('sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const k = await api('GET', '/api/push/key');
      if (!k.ok) throw new Error(k.error);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(k.data.publicKey) });
      const r = await api('POST', '/api/push/subscribe', { endpoint: sub.endpoint });
      if (!r.ok) throw new Error(r.error);
      pushState = 'on';
      toast('알림을 켰어요');
    } catch (e) {
      // 시크릿 창·알림 권한 막힘·알림 회사 연결 실패 등 (브라우저가 영어로 주는 이유는 콘솔에만)
      console.warn('폰 알림 켜기 실패', e);
      pushState = Notification.permission === 'denied' ? 'denied' : 'off';
      toast(e && e.name === 'NotAllowedError' ? '알림을 켜지 못했어요. 시크릿 창이거나 알림이 막힌 브라우저예요' : '알림을 켜지 못했어요. 잠시 뒤 다시 해 보세요');
    }
    redrawPush();
  }

  // ════════ 영화별 토론
  //  TALK[작품 번호] = { status, data(서버가 준 글 목록), sort, at }, REPLIES[글 번호] = { status, list, open }
  const TALK = {}, REPLIES = {}, TWINS = {};
  const SPOIL_OPEN = new Set(); // 이번에 펼쳐 본 스포일러 글
  let currentTalkKey = '';
  let HOT = { status: 'idle', data: null, at: 0 };
  function resetSocial() {
    for (const o of [TALK, REPLIES, TWINS]) for (const k of Object.keys(o)) delete o[k];
    SPOIL_OPEN.clear();
    HOT = { status: 'idle', data: null, at: 0 };
    BLOCKS = { status: 'idle', list: [] };
    ADMIN = { status: 'idle' };
    pushState = 'unknown';
  }
  function loadTalk(key, sort) {
    if (!SERVER) return;
    const cur = TALK[key];
    sort = sort || (cur && cur.sort) || (account ? 'taste' : 'new');
    TALK[key] = { status: 'loading', data: cur && cur.data, sort, at: cur ? cur.at : 0 };
    api('GET', `/api/talk/thread/${encodeURIComponent(key)}?sort=${sort}`).then(r => {
      TALK[key] = r.ok ? { status: 'ok', data: r.data, sort: r.data.sort, at: Date.now() } : { status: 'error', error: r.error, data: cur && cur.data, sort, at: Date.now() };
      redrawTalk(key);
    });
  }
  function redrawTalk(key) {
    if (currentScreen === 'talk' && currentTalkKey === key) {
      const list = document.getElementById('talk-list');
      if (list) list.innerHTML = talkListInner(key);
      const sort = document.getElementById('talk-sort');
      if (sort) sort.innerHTML = sortChips(key);
      const cnt = document.getElementById('talk-count');
      if (cnt) cnt.textContent = TALK[key] && TALK[key].data ? TALK[key].data.count : '';
      const comp = document.getElementById('talk-compose');
      if (comp && comp.dataset.kind !== composerKind(key)) { comp.innerHTML = composerInner(key); comp.dataset.kind = composerKind(key); }
    } else if (['movie', 'new'].includes(currentScreen)) {
      const box = document.getElementById('talk-box');
      if (box && box.dataset.key === key) box.innerHTML = talkPreviewInner(key);
    }
  }
  function findPost(key, id) {
    const d = TALK[key] && TALK[key].data;
    let p = d && d.posts.find(x => x.id === id);
    if (!p) for (const k in REPLIES) { p = (REPLIES[k].list || []).find(x => x.id === id); if (p) break; }
    return p || null;
  }

  // 영화·신작 화면의 '토론' 칸: 글 2개 미리 보기
  function talkPreviewInner(key) {
    if (!SERVER) return '';
    const t = TALK[key];
    if (!t || (t.status === 'ok' && Date.now() - t.at > 20000)) loadTalk(key);
    const d = t && t.data;
    const head = `<div class="card-title">${icon('talk')}토론${d && d.count ? ` <span class="tiny">글 ${d.count}개</span>` : ''}</div>`;
    if (!d) return head + (t && t.status === 'error' ? `<p class="sub" style="margin:0">${esc(t.error)}</p>` : '<p class="sub" style="margin:0">불러오는 중…</p>');
    const posts = d.posts.filter(p => !p.deleted).slice(0, 2);
    const body = posts.length
      ? `<p class="tiny" style="margin:-6px 0 6px">${d.sort === 'taste' ? '나랑 취향 비슷한 사람 글부터' : '최신 글부터'}</p>${posts.map(p => postHtml(p, key, { compact: true })).join('')}`
      : `<p class="sub" style="margin:0 0 12px">${d.pre ? '아직 기대평이 없어요. 첫 기대평을 남겨 보세요.' : '아직 글이 없어요. 이 작품을 봤다면 첫 글을 남겨 보세요.'}</p>`;
    return `${head}${body}<a class="btn small block" style="margin-top:12px" href="#/talk/${esc(key)}">${d.count ? `토론 글 ${d.count}개 모두 보기` : '토론 열기'}</a>`;
  }

  function talkInfo(key, d) {
    const [type, id] = key.split(':');
    const m = type === 'ml' ? +id : type === 'movie' ? TMDB2IDX.get(+id) : null;
    if (m != null && m >= 0 && m < N) return { title: title(m), sub: meta(m), poster: poster(m, 'sm') };
    const it = findNew(type === 'tv' ? 'series' : 'movie', id);
    const name = it ? it.title : d && d.title ? d.title : '작품';
    const sub = it ? [it.year, it.genres.slice(0, 2).join('·')].filter(Boolean).join(' · ') : d && d.release ? `${md(d.release)} 개봉` : '';
    return { title: name, sub, poster: npImg(it || { poster: null }, 'nposter-sm') };
  }
  function composerKind(key) {
    if (!account) return 'login';
    const d = TALK[key] && TALK[key].data;
    if (!d) return 'wait';
    return d.canPost || d.pre || myReaction(key) ? 'form' : 'rate';
  }
  function composerInner(key) {
    const kind = composerKind(key);
    if (kind === 'login') return `<div class="card compose-gate"><p class="sub" style="margin:0 0 10px">글을 쓰려면 베타 계정으로 로그인해 주세요. 읽기는 로그인 없이도 돼요.</p><div class="btn-row"><a class="btn small primary grow" href="#/login">로그인</a><a class="btn small grow" href="#/login/signup">가입</a></div></div>`;
    if (kind === 'wait') return '';
    if (kind === 'rate') return `<div class="card compose-gate"><p class="sub" style="margin:0 0 10px">이 작품을 평가한 사람만 글을 쓸 수 있어요. 본 사람끼리 이야기하려고요.</p><a class="btn small primary block" href="${routeOfKey(key)}">평가하러 가기</a></div>`;
    const d = TALK[key].data, mine = myReaction(key);
    return `<form class="card compose" id="compose-form" data-key="${esc(key)}" novalidate>
      <div class="compose-who">${avatar(account.nick)}<b>${esc(account.nick)}</b>${mine ? `<span class="react ${REACT[mine.s].cls} sm">${REACT[mine.s].label}</span>` : d.pre ? '<span class="tag me">개봉 전 · 기대평</span>' : ''}</div>
      <textarea name="body" class="note" maxlength="1000" placeholder="${d.pre ? '기대되는 점, 걱정되는 점을 남겨 주세요' : '어땠는지 자유롭게 남겨 주세요. 결말 이야기는 아래 스포일러를 켜 주세요'}" aria-label="토론 글"></textarea>
      <div class="compose-foot"><label class="check small"><input type="checkbox" name="spoiler"><span>스포일러 있음 (내용 가리기)</span></label><span class="count"><span class="cnt">0</span>/1000</span></div>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn primary block" type="submit">올리기</button>
    </form>`;
  }
  function sortChips(key) {
    const t = TALK[key], cur = t ? t.sort : account ? 'taste' : 'new';
    const opts = (account ? [['taste', '취향 비슷한 순']] : []).concat([['new', '최신'], ['top', '공감']]);
    return opts.map(([k, l]) => `<button class="chip${cur === k ? ' on' : ''}" data-act="talkSort" data-k="${k}" data-key="${esc(key)}" aria-pressed="${cur === k}">${l}</button>`).join('');
  }
  function talkScreen(arg) {
    const key = decodeURIComponent(arg || '');
    const top = topbar('토론', `<button class="icon-btn" data-act="showRules" aria-label="토론 규칙">${icon('info')}</button>`);
    if (!/^(movie|tv):\d{1,9}$|^ml:\d{1,5}$/.test(key)) return notFound();
    if (!SERVER) return `${top}<div class="empty">${icon('talk')}<p>토론은 '취향컷 시작.bat'으로 켰을 때만 볼 수 있어요.</p></div>`;
    currentTalkKey = key;
    const t = TALK[key];
    if (!t || t.status !== 'loading') loadTalk(key); // 들어올 때마다 새 글을 다시 받는다 (받는 동안은 지난 목록)
    const d = t && t.data, info = talkInfo(key, d), mine = myReaction(key);
    return `${top}
      <a class="card talk-head" href="${routeOfKey(key)}">${info.poster}<div class="row-main"><div class="row-title">${esc(info.title)}</div><div class="row-meta">${esc(info.sub)}</div>${mine ? `<span class="react ${REACT[mine.s].cls} sm">내 기록 · ${REACT[mine.s].label}</span>` : ''}</div>${icon('right')}</a>
      <div id="talk-compose" data-kind="${composerKind(key)}">${composerInner(key)}</div>
      <div class="sec-head"><h3 class="h-sec">글 <span id="talk-count">${d ? d.count : ''}</span></h3></div>
      <div class="chips talk-sort" id="talk-sort" role="group" aria-label="글 순서">${sortChips(key)}</div>
      <div id="talk-list">${talkListInner(key)}</div>`;
  }
  function talkListInner(key) {
    const t = TALK[key], d = t && t.data;
    if (!d) return t && t.status === 'error' ? `<div class="empty">${icon('alert')}<p>${esc(t.error)}</p><button class="btn" data-act="talkSort" data-k="${t.sort}" data-key="${esc(key)}">다시 불러오기</button></div>` : `<div class="empty">${icon('talk')}<p>불러오는 중…</p></div>`;
    if (!d.posts.length) return `<div class="empty">${icon('talk')}<p>${d.pre ? '아직 기대평이 없어요. 첫 기대평을 남겨 보세요.' : '아직 글이 없어요.'}</p></div>`;
    const note = d.sort === 'taste' ? "<p class=\"tiny talk-note\">나랑 취향 비슷한 사람 글부터 보여요. <b class=\"lime\">취향 쌍둥이</b> = 같이 본 영화에서 남들과 다르게 반응한 방향이 나와 같은 사람</p>" : '';
    return note + d.posts.map(p => postHtml(p, key)).join('');
  }

  // 글 하나. compact: 미리 보기(버튼 없음), reply: 답글
  function postHtml(p, key, opts) {
    const o = opts || {};
    const k = esc(key);
    if (p.deleted) {
      const open = REPLIES[p.id] && REPLIES[p.id].open;
      return `<article class="post deleted" id="post-${p.id}"><p class="tiny" style="margin:0">삭제된 글이에요</p>
        ${!o.compact && p.replies ? `<footer class="post-foot"><button class="pbtn" data-act="replies" data-id="${p.id}" data-key="${k}" aria-expanded="${!!open}">${icon('reply')}답글 ${p.replies}</button></footer><div class="replies" id="rep-${p.id}"${open ? '' : ' hidden'}>${repliesInner(p.id, key)}</div>` : ''}</article>`;
    }
    const R = p.s != null ? REACT[p.s] : null, tw = p.twin;
    const twinTxt = !tw ? '' : tw.twin ? `<span class="twin-tag">취향 쌍둥이 · 일치 ${pct(tw.agree)}</span>` : tw.opposite ? `<span class="twin-tag opp">반대 취향 · 일치 ${pct(tw.agree)}</span>` : `<span class="twin-tag plain">취향 일치 ${pct(tw.agree)}</span>`;
    const sub = [tw ? `같이 본 영화 ${tw.common}편` : '', ago(p.at)].filter(Boolean).join(' · ');
    const head = `<header class="post-head">${avatar(p.nick)}<div class="post-who">
        <div class="post-name"><b>${esc(p.nick || '알 수 없음')}</b>${p.mine ? '<span class="tag me">나</span>' : ''}${R ? `<span class="react ${R.cls} sm">${R.label}</span>` : p.pre ? '<span class="tag plain">개봉 전</span>' : ''}</div>
        <div class="tiny">${twinTxt}${twinTxt && sub ? ' · ' : ''}${sub}</div></div></header>`;
    const showBody = !p.spoiler || p.mine || SPOIL_OPEN.has(p.id);
    const body = showBody ? `<div class="post-body${o.compact ? ' clamp' : ''}">${lines(p.body)}</div>`
      : o.compact ? `<p class="post-spoil">${icon('eyeoff')}스포일러가 있는 글이에요</p>`
      : `<button class="spoil-btn" data-act="reveal" data-id="${p.id}" data-key="${k}">${icon('eyeoff')}스포일러가 있는 글이에요 · 눌러서 보기</button>`;
    if (o.compact) return `<article class="post compact">${head}${body}</article>`;
    const hiddenNote = p.hidden ? `<p class="post-note">${icon('alert')}신고가 쌓여 가려진 글이에요. ${p.mine ? '나와 관리자' : '글쓴이와 관리자'}에게만 보여요.</p>` : '';
    const open = REPLIES[p.id] && REPLIES[p.id].open;
    const foot = `<footer class="post-foot">
        ${p.mine ? `<span class="pstat">${icon('heart')}공감 ${p.likes}</span>` : `<button class="pbtn${p.liked ? ' on' : ''}" data-act="like" data-id="${p.id}" data-key="${k}" aria-pressed="${!!p.liked}">${icon('heart')}공감 ${p.likes}</button>`}
        ${o.reply ? '' : `<button class="pbtn" data-act="replies" data-id="${p.id}" data-key="${k}" aria-expanded="${!!open}">${icon('reply')}답글 ${p.replies}</button>`}
        <span class="grow"></span>
        ${p.mine ? `<button class="pbtn" data-act="delPost" data-id="${p.id}" data-key="${k}" data-parent="${o.reply ? o.parent : ''}">지우기</button>` : `<button class="pbtn more" data-act="postMenu" data-id="${p.id}" data-key="${k}" data-nick="${esc(p.nick || '')}" aria-label="신고·차단">${icon('more')}</button>`}
      </footer>`;
    return `<article class="post${o.reply ? ' reply' : ''}${p.hidden ? ' is-hidden' : ''}" id="post-${p.id}">${head}${hiddenNote}${body}${foot}${o.reply ? '' : `<div class="replies" id="rep-${p.id}"${open ? '' : ' hidden'}>${repliesInner(p.id, key)}</div>`}</article>`;
  }
  function loadReplies(id, key) {
    const R = REPLIES[id];
    R.status = 'loading';
    api('GET', `/api/talk/post/${id}/replies`).then(r => {
      if (r.ok) { R.status = 'ok'; R.list = r.data.replies; } else { R.status = 'error'; R.error = r.error; }
      redrawReplies(id, key);
    });
  }
  function redrawReplies(id, key) {
    const box = document.getElementById('rep-' + id), R = REPLIES[id];
    if (!box || !R) return;
    box.hidden = !R.open;
    box.innerHTML = repliesInner(id, key);
  }
  function repliesInner(id, key) {
    const R = REPLIES[id];
    if (!R || !R.open) return '';
    const list = R.status === 'ok' ? (R.list.length ? R.list.map(p => postHtml(p, key, { reply: true, parent: id })).join('') : '<p class="tiny" style="margin:0 0 8px">아직 답글이 없어요.</p>')
      : R.status === 'error' ? `<p class="tiny">${esc(R.error)}</p>` : '<p class="tiny">불러오는 중…</p>';
    const kind = composerKind(key);
    const form = kind === 'form'
      ? `<form class="reply-form" data-id="${id}" data-key="${esc(key)}" novalidate><textarea name="body" class="note small" maxlength="500" placeholder="답글 달기" aria-label="답글"></textarea>
          <div class="compose-foot"><label class="check small"><input type="checkbox" name="spoiler"><span>스포일러</span></label><button class="btn small primary" type="submit">답글 달기</button></div><p class="form-error" role="alert" hidden></p></form>`
      : kind === 'login' ? '<p class="tiny" style="margin:0">로그인하면 답글을 달 수 있어요.</p>' : kind === 'rate' ? '<p class="tiny" style="margin:0">이 작품을 평가하면 답글을 달 수 있어요.</p>' : '';
    return list + form;
  }
  async function doPost(f) {
    const key = f.dataset.key, body = f.elements.body.value.trim(), err = f.querySelector('.form-error');
    if (body.length < 2) return formError(err, '두 글자 이상 써 주세요');
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    await syncNow(); // 방금 한 평가가 서버에 먼저 가 있어야 글쓰기가 허락된다
    const r = await api('POST', `/api/talk/thread/${encodeURIComponent(key)}`, { body, spoiler: f.elements.spoiler.checked });
    btn.disabled = false;
    if (!r.ok) return formError(err, r.error);
    f.reset();
    err.hidden = true;
    f.querySelector('.cnt').textContent = '0';
    toast('올렸어요');
    HOT.status = 'idle';
    loadTalk(key, TALK[key] && TALK[key].sort === 'top' ? 'new' : undefined); // 공감순이면 내 글이 안 보일 수 있어 최신순으로
  }
  async function doReply(f) {
    const id = +f.dataset.id, key = f.dataset.key, body = f.elements.body.value.trim(), err = f.querySelector('.form-error');
    if (!body) return formError(err, '내용을 써 주세요');
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    await syncNow();
    const r = await api('POST', `/api/talk/post/${id}/replies`, { body, spoiler: f.elements.spoiler.checked });
    btn.disabled = false;
    if (!r.ok) return formError(err, r.error);
    toast('답글을 달았어요');
    HOT.status = 'idle';
    REPLIES[id].open = true;
    loadReplies(id, key);
    loadTalk(key);
  }
  async function doReport(f) {
    const reason = (f.querySelector('input[name=reason]:checked') || {}).value;
    const r = await api('POST', `/api/talk/post/${f.dataset.id}/report`, { reason });
    if (!r.ok) return formError(f.querySelector('.form-error'), r.error);
    closeModal();
    toast(r.data.hidden ? '신고했어요. 신고가 쌓여 글이 가려졌어요' : '신고했어요. 관리자가 확인할게요');
    loadTalk(f.dataset.key);
  }

  // '요즘 토론' (발견): 글이 최근에 올라온 작품
  function loadHot() {
    if (!SERVER || HOT.status === 'loading') return;
    HOT = { status: 'loading', data: HOT.data, at: HOT.at };
    api('GET', '/api/talk/hot').then(r => {
      HOT = r.ok ? { status: 'ok', data: r.data.threads, at: Date.now() } : { status: 'error', data: HOT.data, at: Date.now() };
      const w = document.getElementById('talk-hot');
      if (w && currentScreen === 'home') w.innerHTML = hotInner();
    });
  }
  function hotInner() {
    if (!SERVER) return '';
    if (HOT.status === 'idle' || (HOT.status !== 'loading' && Date.now() - HOT.at > 60000)) loadHot();
    const list = HOT.data || [];
    if (!list.length) return '';
    return `<div class="sec-head"><h3 class="h-sec">요즘 토론</h3><span class="tiny">글이 최근에 올라온 순</span></div>
      <div class="list">${list.slice(0, 5).map(t => `<a class="row" href="#/talk/${esc(t.key)}"><div class="nposter nposter-sm">${t.poster ? `<img src="${esc(t.poster)}" alt="" loading="lazy">` : `<span class="nposter-none">${icon('film')}</span>`}</div>
        <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-meta">글 ${t.posts}개 · ${ago(t.last_at)}</div></div>${icon('right')}</a>`).join('')}</div>`;
  }

  // ════════ 먼저 본 취향 쌍둥이 (신작 화면): 이 작품을 먼저 평가한 앱 사용자와 나의 취향 비교 (닉네임은 안 보여 줌)
  function loadTwins(key) {
    TWINS[key] = { status: 'loading' };
    api('GET', '/api/twins?key=' + encodeURIComponent(key)).then(r => {
      TWINS[key] = r.ok ? { status: 'ok', data: r.data } : { status: 'error', error: r.error };
      const b = document.getElementById('twins-box');
      if (b && currentScreen === 'new') b.innerHTML = twinsInner(key);
    });
  }
  function twinsInner(key) {
    const head = `<div class="card-title">${icon('people')}먼저 본 취향 쌍둥이</div>`;
    const warm = NC ? ` (시험: 먼저 본 사람의 평가가 쌓이면 적중률 ${pct(NC.test.warm)}까지)` : '';
    if (!account) return `${head}<p class="sub" style="margin:0 0 10px">베타 계정으로 로그인하면, 이 작품을 먼저 본 앱 사용자 중 나랑 취향 비슷한 사람들의 반응을 볼 수 있어요.${warm}</p><a class="btn small block" href="#/login">로그인</a>`;
    const t = TWINS[key];
    if (!t) { loadTwins(key); return `${head}<p class="sub" style="margin:0">불러오는 중…</p>`; }
    if (t.status === 'loading') return `${head}<p class="sub" style="margin:0">불러오는 중…</p>`;
    if (t.status === 'error') return `${head}<p class="sub" style="margin:0">${esc(t.error)}</p>`;
    const d = t.data;
    if (!d.total) return `${head}<p class="sub" style="margin:0">아직 이 작품을 평가한 앱 사용자가 없어요. 먼저 보고 기록하면 취향 비슷한 사람들에게 도움이 돼요.${warm}</p>`;
    const twins = d.people.filter(p => p.sim >= d.twinAt), liked = twins.filter(p => p.s === 1).length;
    const total = d.count[1] + d.count[0] + d.count['-1'] || 1;
    return `${head}
      <p style="margin:0 0 10px;font-size:14px">먼저 본 앱 사용자 <b>${d.total}명</b> 중 나랑 취향 쌍둥이 <b class="lime">${twins.length}명</b>${twins.length ? ` · 그중 <b class="lime">${liked}명</b>이 재밌었대요` : ''}</p>
      <div class="stack" role="img" aria-label="재밌었어요 ${d.count[1]}명, 보통 ${d.count[0]}명, 아쉬웠어요 ${d.count['-1']}명"><i class="s-like" style="width:${(100 * d.count[1]) / total}%"></i><i class="s-mid" style="width:${(100 * d.count[0]) / total}%"></i><i class="s-dis" style="width:${(100 * d.count['-1']) / total}%"></i></div>
      <div class="legend"><span><i style="background:var(--lime)"></i>재밌었어요 ${d.count[1]}</span><span><i style="background:#8a9199"></i>보통 ${d.count[0]}</span><span><i style="background:var(--red)"></i>아쉬웠어요 ${d.count['-1']}</span></div>
      ${d.people.slice(0, 5).map((p, i) => `<div class="peer"><div class="avatar" style="background:${AVATAR[i % AVATAR.length]}">${i + 1}</div>
        <div class="peer-main"><b>${p.sim >= d.twinAt ? '취향 쌍둥이' : p.sim <= -0.1 ? '반대 취향' : '앱 사용자'}${p.agree != null ? ` · 일치 ${pct(p.agree)}` : ''}</b><span class="tiny">같이 본 영화 ${p.common}편</span></div>
        <span class="react ${REACT[p.s].cls}">${REACT[p.s].label}</span></div>`).join('')}
      <p class="tiny" style="margin:10px 0 0">나랑 취향 비슷한 순이에요. 닉네임은 밝히지 않아요. 이 반응은 위 확률에 섞지 않고 따로 보여 줘요 — 시험해 보니 지인 규모(먼저 본 사람 30명까지)에선 섞어도 거의 차이가 없었고, 내가 평가를 더 하는 쪽이 훨씬 잘 맞았어요(20편→40편: 적중 68.8%→70.4%).</p>`;
  }

  // ── 화면을 그린 뒤 붙이는 것들 (입력창·막대)
  function after(name, arg) {
    if (name === 'home') {
      const q = document.getElementById('q');
      q.addEventListener('input', () => {
        searchQuery = q.value;
        document.getElementById('results').innerHTML = searchQuery.trim() ? searchResults(searchQuery) : '';
        document.getElementById('home-body').hidden = !!searchQuery.trim();
        app.querySelector('.s-clear').hidden = !searchQuery;
      });
      window.scrollTo(0, scrollMemo.home || 0);
    }
    if (name === 'rate') {
      app.querySelectorAll('input[type=range]').forEach(el => el.addEventListener('input', () => {
        const i = +el.dataset.t;
        el.dataset.changed = '1'; // 직접 움직인 막대만 내 취향 계산에 반영
        document.getElementById('out-' + i).textContent = TRAITS[i].words[+el.value - 1];
      }));
      const note = document.getElementById('note');
      note.addEventListener('input', () => { document.getElementById('note-count').textContent = note.value.length; });
      const box = document.getElementById('more-box');
      box.addEventListener('toggle', () => { rateOpen = box.open; });
    }
    if (name === 'account' && account && SERVER) loadBlocks();
    if (name === 'quick') quickGestures();
  }

  // ── 글쓰기 칸들: 보내기(엔터·버튼)와 글자 수
  document.addEventListener('submit', e => {
    const f = e.target;
    if (!(f instanceof HTMLFormElement)) return;
    e.preventDefault();
    if (f.id === 'auth-form') doAuth(f);
    else if (f.id === 'pw-form') doPassword(f);
    else if (f.id === 'compose-form') doPost(f);
    else if (f.classList.contains('reply-form')) doReply(f);
    else if (f.id === 'report-form') doReport(f);
    else if (f.id === 'delete-form') doDeleteAccount(f);
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches && t.matches('#compose-form textarea')) { const c = t.form.querySelector('.cnt'); if (c) c.textContent = t.value.length; }
    if (t.closest && t.closest('form') && t.closest('form').querySelector('.form-error')) { const er = t.closest('form').querySelector('.form-error'); if (!er.hidden) er.hidden = true; }
  });

  // ── PC에서 마우스로 끌어서 움직이기 (폰에서 손가락으로 미는 것처럼)
  //  가로 줄 위에서 옆으로 끌면 그 줄이 좌우로, 그 밖에서는 화면이 위아래로 움직인다. 끈 뒤에는 클릭으로 치지 않는다.
  let drag = null, suppressClick = false;
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('input, textarea, select, .modal, .hbtn, .qcard')) return;
    const row = e.target.closest('.hscroll');
    drag = { x: e.clientX, y: e.clientY, row, left: row ? row.scrollLeft : 0, top: window.scrollY, moved: false, axis: null };
  });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      drag.axis = drag.row && Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      document.body.classList.add('dragging');
      if (drag.axis === 'x') drag.row.style.scrollSnapType = 'none';
    }
    if (drag.axis === 'x') drag.row.scrollLeft = drag.left - dx;
    else window.scrollTo(0, drag.top - dy);
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.moved) {
      const row = drag.row;
      if (row) row.style.scrollSnapType = '';
      document.body.classList.remove('dragging');
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
    }
    drag = null;
  });
  document.addEventListener('click', e => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; } }, true);
  document.addEventListener('dragstart', e => { if (e.target.closest('a, img')) e.preventDefault(); }); // 링크·그림이 끌려 나가지 않게

  // ── 누르기 처리 (모든 버튼이 여기로 모인다)
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) {
      if (e.target === modal) closeModal();
      return;
    }
    const act = el.dataset.act;
    const m = el.dataset.m != null ? +el.dataset.m : null;
    switch (act) {
      case 'start':
        go('#/onboard');
        break;
      case 'onbRate': {
        state.ratings[m] = { s: +el.dataset.s, at: Date.now(), pred: null };
        onbUndo.push({ type: 'rate', m });
        changed();
        render();
        break;
      }
      case 'onbSkip':
        state.skipped.push(m);
        onbUndo.push({ type: 'skip', m });
        persist();
        render();
        break;
      case 'onbUndo': {
        const u = onbUndo.pop();
        if (!u) break;
        if (u.type === 'rate') { delete state.ratings[u.m]; changed(); } else { state.skipped = state.skipped.filter(x => x !== u.m); persist(); }
        render();
        break;
      }
      case 'onbMore':
        onbTarget = ratedCount() + (lists(true).gems.length ? 5 : 10);
        render();
        break;
      case 'finishOnboard':
        state.onboarded = true;
        onbUndo = [];
        persist();
        go('#/home');
        break;
      case 'rateMore': // '영화 더 평가하기' → 빠른 평가 (2026-10-24부터)
        e.preventDefault();
        go('#/quick');
        break;
      case 'quickRate':
        quickAct(+el.dataset.s);
        break;
      case 'quickSkip':
        quickAct('skip');
        break;
      case 'quickUndo':
        quickUndoLast();
        break;
      case 'quickClose':
        back();
        break;
      case 'shareTaste':
        shareTaste();
        break;
      case 'browseGenre':
      case 'browseEra':
      case 'browseSort':
        browse[{ browseGenre: 'genre', browseEra: 'era', browseSort: 'sort' }[act]] = el.dataset.v;
        browse.limit = 40;
        rerender();
        break;
      case 'browseMore':
        browse.limit += 40;
        rerender();
        break;
      case 'ottOpen':
        openModal(ottSheet());
        break;
      case 'ottToggle': {
        const id = +el.dataset.id, was = myOtt().length;
        state.myOtt = myOtt().includes(id) ? myOtt().filter(x => x !== id) : myOtt().concat(id);
        if (!was && state.myOtt.length) state.ottOnly = true; // 처음 고르면 '내 OTT만' 바로 켬
        persist();
        rerender();
        modal.querySelector('.sheet').innerHTML = ottSheet();
        break;
      }
      case 'ottOnly':
        state.ottOnly = !state.ottOnly;
        persist();
        rerender();
        modal.querySelector('.sheet').innerHTML = ottSheet();
        break;
      case 'ottDone':
        closeModal();
        rerender();
        break;
      case 'stopMore':
        onbUndo = [];
        go('#/taste');
        break;
      case 'mood': {
        const k = el.dataset.k;
        state.mood = state.mood.includes(k) ? state.mood.filter(x => x !== k) : state.mood.concat(k);
        recLimit = 5;
        persist();
        scrollMemo.home = window.scrollY;
        render();
        break;
      }
      case 'clearMood':
        state.mood = [];
        persist();
        render();
        break;
      case 'origin':
        state.origin = ORIGIN_NAME[el.dataset.v] ? el.dataset.v : 'all';
        recLimit = 5;
        persist();
        scrollMemo.home = window.scrollY;
        render();
        break;
      case 'moreRecs':
        recLimit += 10;
        scrollMemo.home = window.scrollY;
        render();
        break;
      case 'clearSearch':
        searchQuery = '';
        render();
        document.getElementById('q').focus();
        break;
      case 'back':
        back();
        break;
      case 'toggleSave':
        if (state.saved[m]) { delete state.saved[m]; toast('찜에서 뺐어요'); } else { state.saved[m] = Date.now(); toast('찜에 담았어요'); }
        persist();
        render();
        break;
      case 'unsave':
        delete state.saved[m];
        persist();
        toast('찜에서 뺐어요');
        render();
        break;
      case 'rateSet': {
        const s = +el.dataset.s;
        const prev = state.ratings[m];
        let pred = prev ? prev.pred : null;
        if (!prev && ratedCount() >= MIN_RATED) {
          const r = engine.predict(getCalc().ctx, m);
          if (r.conf !== 'low') pred = r.p; // 기록 전에 앱이 말한 확률을 남겨 '적중'을 잰다
        }
        state.ratings[m] = Object.assign({}, prev, { s, at: Date.now(), pred });
        changed();
        render();
        toast('저장했어요 · 취향에 반영했어요');
        break;
      }
      case 'rateExtra': {
        const before = Array.from(getCalc().ctx.prefs);
        const prevTraits = (state.ratings[m] && state.ratings[m].traits) || [];
        const sliders = Array.from(app.querySelectorAll('input[type=range]'));
        const vals = sliders.map((x, i) => (x.dataset.changed ? +x.value : prevTraits[i] != null ? prevTraits[i] : null));
        const note = document.getElementById('note').value.trim().slice(0, 100);
        state.ratings[m] = Object.assign({}, state.ratings[m], { traits: vals.some(v => v != null) ? vals : null, note });
        changed();
        const afterP = getCalc().ctx.prefs;
        // 이번에 직접 움직인 요소 중 내 취향 계산이 가장 크게 바뀐 것을 알려 준다
        const moved = sliders.map((x, i) => (x.dataset.changed ? i : -1)).filter(i => i >= 0);
        let msg, sub;
        if (moved.length) {
          const top = moved.map(i => ({ t: TRAITS[i], d: afterP[i] - before[i] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
          if (Math.abs(top.d) >= 0.005) {
            msg = top.d > 0 ? `${josa(top.t.name, '을', '를')} 더 중요하게 반영할게요.` : `${josa(top.t.name, '은', '는')} 덜 중요하게 반영할게요.`;
            sub = "영화 화면의 '맞는 포인트'와 '잘 맞는 이유'가 이 기준으로 바뀌어요.";
          } else {
            msg = `${top.t.name} 느낌을 저장했어요.`;
            sub = '평가가 쌓일수록 내 취향 계산에 더 크게 반영돼요.';
          }
        } else {
          msg = note ? '한 줄 감상을 저장했어요.' : '바꾼 것이 없어요.';
          sub = note ? '내 기록에서 다시 볼 수 있어요.' : '막대를 움직이거나 한 줄 감상을 적어 주세요.';
        }
        document.getElementById('feedback').innerHTML = `<div class="feedback">${icon('sparkle')}<div><b>${esc(msg)}</b><span>${esc(sub)}</span></div></div>`;
        toast('반영했어요');
        break;
      }
      case 'rateDone':
        rateOpen = false;
        go('#/movie/' + m);
        break;
      case 'histFilter':
        histFilter = el.dataset.k;
        render();
        break;
      case 'about':
        openModal(`<h3>시험판 안내</h3>
          <p>· 계산 데이터: 미국 미네소타대 GroupLens의 MovieLens 25M 공개 데이터(연구·시험용) 중 관객 ${PANEL.users.toLocaleString()}명의 평가, 영화 ${N.toLocaleString()}편(2019년까지).</p>
          <p>· 한국어 제목: 위키데이터. 지난 영화는 포스터 대신 재미 요소 그림을 써요.</p>
          ${CALIB ? `<p>· 알고리즘 시험(시험용 관객 2,000명, 15편 평가): 취향 방식 적중률 <b class="lime">${pct(CALIB.main.taste)}</b> / 평균 별점 방식 ${pct(CALIB.main.crowd)}</p>` : ''}
          ${PHONE ? `<p>· 폰판: 신작 목록은 PC에서 올릴 때(${esc(SNAP ? SNAP.at : '-')}) 찍어 둔 TMDB 목록이에요. 계정·토론·폰 알림은 PC 서버판에서만 돼요. 넷플릭스 등 볼 수 있는 곳 정보는 JustWatch 제공이에요.</p>`
            : '<p>· 신작: 극장 목록은 영화관입장권통합전산망(KOBIS) 오픈API에서 열 때마다 불러오고 저장하지 않아요. 넷플릭스 등 볼 수 있는 곳 정보는 JustWatch 제공이에요.</p>'}
          <p><img src="${TMDB_LOGO}" alt="TMDB" width="80" height="14" style="vertical-align:middle"> 신작의 영화 정보·포스터·평점은 TMDB API를 써요. 이 앱은 TMDB의 승인이나 인증을 받지 않았어요. (개인 시험용)</p>
          <p>· 내 기록은 이 기기의 브라우저에 저장돼요. 베타 계정으로 로그인하면 폰·PC에서 같이 쓰도록 취향컷 서버에도 저장해요(그 밖의 곳으로는 보내지 않아요).</p>
          <div class="sheet-actions"><button class="btn primary block" data-act="closeModal">닫기</button></div>`);
        break;
      case 'howNew':
        openModal(`<h3>신작 확률은 이렇게 계산해요</h3>
          <p>신작은 아직 본 사람이 적어서 '취향 쌍둥이'의 반응이 없어요. 그래서 두 가지를 합쳐요.</p>
          <p>1. <b>비슷한 영화</b>: TMDB가 이 영화와 비슷하다고 본 영화 중 내 목록에 있는 영화들에서, 내가 남들보다 얼마나 더(덜) 좋아하는지</p>
          <p>2. <b>남들 평</b>: TMDB 평점. 평가한 사람이 적으면 평균 쪽으로 조금 당겨요.</p>
          <p><b>OTT 시리즈</b>는 TMDB가 '비슷한 영화'를 따로 알려 주지 않아서, TMDB 키워드·장르가 많이 겹치는 영화로 1번을 대신해요.${NC && NC.kwTest ? ` 이 방법을 영화로 시험했을 때 적중률 ${pct(NC.kwTest.acc)}였어요.` : ''} 시리즈 자체로 시험한 건 아니라서 참고용이에요.</p>
          ${NC ? `<p class="tiny">시험: 2014년 이후 영화 211편을 '아무도 안 본 신작'처럼 가리고 맞혀 봤어요(시험용 관객 598명, 14,378건). 적중률 — 이 방식 <b class="lime">${pct(NC.test.simVote)}</b>, 평점만 ${pct(NC.test.vote)}, 아무 정보 없이 ${pct(NC.test.base)}. 평점이 낮은 신작 중 재밌어한 영화를 평점만 볼 때 ${pct(NC.gems.vote)} 찾았다면 이 방식은 ${pct(NC.gems.simVote)} 찾았어요(찾은 것 중 ${pct(NC.gems.precision)}가 실제로 재밌었음). 사용자 평가가 쌓이면 ${pct(NC.test.warm)}까지 올라가요.</p>` : ''}
          <div class="sheet-actions"><button class="btn primary block" data-act="closeModal">알겠어요</button></div>`);
        break;
      case 'retryNew': {
        const k = el.dataset.k;
        NEW[k] = { status: 'idle' };
        loadNew(k);
        if (currentScreen === 'home') { const w = document.getElementById('new-wrap'); if (w) w.innerHTML = newBlockInner(); } else render();
        break;
      }
      case 'newRate': {
        const id = el.dataset.id, kind = el.dataset.k, s = +el.dataset.s;
        const it = findNew(kind, id);
        const prev = state.newRatings[id];
        const f = it ? newFeatures(it) : null;
        // 기록 전에 앱이 말한 확률을 남겨 '적중'을 잰다
        state.newRatings[id] = { s, at: Date.now(), pred: prev ? prev.pred : (f && f.p != null ? f.p : null), title: it ? it.title : prev && prev.title, poster: it ? it.poster : prev && prev.poster, kind };
        persist();
        const y = window.scrollY;
        render();
        window.scrollTo(0, y);
        toast('저장했어요');
        break;
      }
      case 'newSave': {
        const id = el.dataset.id, kind = el.dataset.k;
        if (state.savedNew[id]) { delete state.savedNew[id]; toast('찜에서 뺐어요'); } else {
          const it = findNew(kind, id);
          const s = { title: it ? it.title : '', poster: it ? it.poster : null, kind, at: Date.now() };
          // 개봉 전 영화: 개봉일과 지금 맞을 확률을 같이 적어 둔다 (개봉날 알림에 씀)
          if (it && it.kind !== 'series' && it.release && daysUntil(it.release) > 0) {
            const f = newFeatures(it);
            Object.assign(s, { release: it.release, p: f.p != null ? Math.round(f.p * 1000) / 1000 : null, alerted: false });
          }
          state.savedNew[id] = s;
          toast(s.release ? `찜했어요. ${md(s.release)} 개봉날 알려 드릴게요` : '찜에 담았어요');
        }
        persist();
        const y = window.scrollY;
        render();
        window.scrollTo(0, y);
        break;
      }
      case 'unsaveNew':
        delete state.savedNew[el.dataset.id];
        persist();
        toast('찜에서 뺐어요');
        render();
        break;
      case 'hscroll': {
        const row = el.parentElement.querySelector('.hscroll');
        if (row) row.scrollBy({ left: +el.dataset.dir * row.clientWidth * 0.8, behavior: 'smooth' });
        break;
      }
      case 'newScrollRate': {
        const box = document.getElementById('new-rate');
        if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
      case 'howCalc':
        openModal(`<h3>확률은 이렇게 계산해요</h3>
          <p>1. 나와 같은 영화를 본 관객 중, <b>남들 평균과 다르게 반응한 방향이 나와 같은 사람</b>(취향 쌍둥이)을 찾아요. 모두가 좋아하는 영화를 같이 좋아한 것보다, 평이 갈리는 영화에서 같은 편이었던 게 더 중요해요.</p>
          <p>2. 그 사람들이 이 영화를 어떻게 봤는지 모아요. 더 비슷한 사람일수록 크게 반영해요.</p>
          <p>3. 전체 관객 비율에서 그만큼 올리거나 내리고, 내가 남들보다 후하게 주는 편인지도 반영해요. (재미 요소는 확률에는 넣지 않고 이유 설명과 기분 고르기에 써요. 시험에서 확률에 넣어도 더 맞지 않았어요.)</p>
          <p class="tiny">시험(관객 2,000명)에서 확률대별 실제 비율이 거의 같게 나왔어요. 예: 80~90%라고 한 영화는 실제로 약 85%가 재밌었다고 했어요.</p>
          <div class="sheet-actions"><button class="btn primary block" data-act="closeModal">알겠어요</button></div>`);
        break;
      case 'reset':
        openModal(`<h3>처음부터 다시 할까요?</h3><p>평가·찜·감상 기록이 모두 지워져요.${account ? ' 계정에 저장된 기록도 함께 지워져요(토론 글은 남아요).' : ''} 되돌릴 수 없어요.</p>
          <div class="sheet-actions"><button class="btn grow" data-act="closeModal">취소</button><button class="btn primary grow" data-act="resetYes">지우기</button></div>`);
        break;
      case 'resetYes':
        state = fresh();
        persist();
        calc = null; selfCache = null; onbUndo = []; onbTarget = GOAL; searchQuery = ''; histFilter = 'all';
        closeModal();
        go('#/welcome');
        break;
      // ── 베타 계정
      case 'mergeYes':
      case 'mergeNo': {
        const pm = pendingMerge;
        pendingMerge = null;
        closeModal();
        if (pm) {
          if (act === 'mergeYes') { adoptState(mergeStates(state, pm.server), true); syncNow(); }
          else { adoptState(pm.server, false); state.at = pm.at; writeLocal(); }
        }
        afterLogin();
        break;
      }
      case 'showPrivacy':
        openModal(PRIVACY_HTML);
        break;
      case 'showRules':
        openModal(RULES_HTML);
        break;
      case 'syncNow':
        syncNow().then(ok => { toast(ok ? '기록을 맞췄어요' : '맞추지 못했어요. 인터넷 연결을 확인해 주세요'); rerender(); });
        break;
      case 'logout':
        openModal(`<h3>로그아웃할까요?</h3><p>이 기기의 기록(평가·찜)은 지워지고, 다시 로그인하면 계정에서 돌아와요. 이 기기의 폰 알림도 꺼져요.</p>
          <div class="sheet-actions"><button class="btn grow" data-act="closeModal">취소</button><button class="btn primary grow" data-act="logoutYes">로그아웃</button></div>`);
        break;
      case 'logoutYes':
      case 'logoutForce':
        doLogout(act === 'logoutForce');
        break;
      case 'deleteAccount':
        openModal(`<h3>정말 탈퇴할까요?</h3><p>계정, 평가·찜 기록, 내가 쓴 토론 글이 모두 지워지고 되돌릴 수 없어요. 확인을 위해 비밀번호를 넣어 주세요.</p>
          <form id="delete-form" class="form" novalidate>
            <label class="field"><span>비밀번호</span><input name="password" type="password" autocomplete="current-password"></label>
            <p class="form-error" role="alert" hidden></p>
            <div class="sheet-actions"><button type="button" class="btn grow" data-act="closeModal">취소</button><button type="submit" class="btn grow danger">탈퇴하기</button></div>
          </form>`);
        break;
      case 'unblock':
        api('DELETE', `/api/users/${encodeURIComponent(el.dataset.nick)}/block`).then(r => {
          if (!r.ok) return toast(r.error);
          toast('차단을 풀었어요');
          for (const k of Object.keys(TALK)) delete TALK[k];
          loadBlocks();
        });
        break;
      // ── 폰 알림
      case 'pushOn':
        pushOn();
        break;
      case 'pushOff':
        dropPush(true).then(() => { pushState = 'off'; redrawPush(); toast('이 기기의 알림을 껐어요'); });
        break;
      case 'pushTest':
        api('POST', '/api/push/test', {}).then(r => toast(r.ok ? (r.data.ok ? '시험 알림을 보냈어요. 잠시 뒤에 떠요' : '알림 회사에 보내지 못했어요. 끄고 다시 켜 보세요') : r.error));
        break;
      // ── 개봉 알림 (앱 안)
      case 'seeAlert':
      case 'ackAlert': {
        const s = state.savedNew[el.dataset.id];
        if (s) { s.alerted = true; persist(); }
        if (act === 'ackAlert') rerender(); // '보기'는 링크라 그 영화 화면으로 넘어간다
        break;
      }
      case 'retryOne': {
        const k = el.dataset.k, id = el.dataset.id;
        delete ONE[(k === 'series' ? 'tv' : 'movie') + ':' + id];
        loadOne(k, id);
        render();
        break;
      }
      // ── 토론
      case 'talkSort':
        loadTalk(el.dataset.key, el.dataset.k);
        redrawTalk(el.dataset.key);
        break;
      case 'reveal': {
        const id = +el.dataset.id, p = findPost(el.dataset.key, id);
        SPOIL_OPEN.add(id);
        if (p) el.outerHTML = `<div class="post-body">${lines(p.body)}</div>`;
        break;
      }
      case 'like': {
        if (!account) { loginPrompt('공감하려면 로그인해 주세요'); break; }
        const id = +el.dataset.id, key = el.dataset.key;
        el.disabled = true;
        api('POST', `/api/talk/post/${id}/like`, {}).then(r => {
          el.disabled = false;
          if (!r.ok) return toast(r.error);
          const p = findPost(key, id);
          if (p) { p.liked = r.data.liked; p.likes = r.data.likes; }
          el.classList.toggle('on', r.data.liked);
          el.setAttribute('aria-pressed', r.data.liked);
          el.innerHTML = `${icon('heart')}공감 ${r.data.likes}`;
        });
        break;
      }
      case 'replies': {
        const id = +el.dataset.id, key = el.dataset.key;
        const R = REPLIES[id] || (REPLIES[id] = { status: 'idle', list: [], open: false });
        R.open = !R.open;
        el.setAttribute('aria-expanded', R.open);
        if (R.open && R.status !== 'ok' && R.status !== 'loading') loadReplies(id, key);
        redrawReplies(id, key);
        break;
      }
      case 'delPost':
        openModal(`<h3>이 글을 지울까요?</h3><p>지운 글은 되돌릴 수 없어요.${el.dataset.parent ? '' : " 답글이 달린 글은 '삭제된 글' 자리만 남아요."}</p>
          <div class="sheet-actions"><button class="btn grow" data-act="closeModal">취소</button><button class="btn primary grow" data-act="delPostYes" data-id="${esc(el.dataset.id)}" data-key="${esc(el.dataset.key)}" data-parent="${esc(el.dataset.parent || '')}">지우기</button></div>`);
        break;
      case 'delPostYes': {
        const key = el.dataset.key, parent = el.dataset.parent;
        api('DELETE', `/api/talk/post/${encodeURIComponent(el.dataset.id)}`).then(r => {
          closeModal();
          if (!r.ok) return toast(r.error);
          toast('지웠어요');
          HOT.status = 'idle';
          if (parent && REPLIES[parent]) loadReplies(+parent, key);
          loadTalk(key);
        });
        break;
      }
      case 'postMenu':
        if (!account) { loginPrompt('신고·차단은 로그인한 뒤에 할 수 있어요'); break; }
        openModal(`<h3>이 글을</h3>
          <div class="btn-col">
            <button class="btn block" data-act="reportPost" data-id="${esc(el.dataset.id)}" data-key="${esc(el.dataset.key)}">${icon('alert')}신고하기</button>
            ${el.dataset.nick ? `<button class="btn block" data-act="blockUser" data-nick="${esc(el.dataset.nick)}" data-key="${esc(el.dataset.key)}">${icon('eyeoff')}${esc(el.dataset.nick)}님 글 안 보기 (차단)</button>` : ''}
          </div>
          <div class="sheet-actions"><button class="btn block" data-act="closeModal">닫기</button></div>`);
        break;
      case 'reportPost':
        openModal(`<h3>신고 이유를 골라 주세요</h3>
          <form id="report-form" data-id="${esc(el.dataset.id)}" data-key="${esc(el.dataset.key)}" novalidate>
            ${[['spoiler', '스포일러를 가리지 않았어요'], ['abuse', '욕설·비하·괴롭힘'], ['spam', '광고·도배'], ['etc', '그 밖에 토론 규칙 위반']].map(([v, l], i) => `<label class="radio"><input type="radio" name="reason" value="${v}"${i ? '' : ' checked'}><span>${l}</span></label>`).join('')}
            <p class="tiny">서로 다른 3명이 신고하면 관리자가 보기 전까지 글이 가려져요. 신고한 사람은 밝히지 않아요.</p>
            <p class="form-error" role="alert" hidden></p>
            <div class="sheet-actions"><button type="button" class="btn grow" data-act="closeModal">취소</button><button type="submit" class="btn primary grow">신고하기</button></div>
          </form>`);
        break;
      case 'blockUser':
        openModal(`<h3>${esc(el.dataset.nick)}님 글을 안 볼까요?</h3><p>이 사람의 글과 답글이 나에게 안 보이고, 이 사람은 내 글에 답글을 달 수 없어요. 상대에게 알리지 않아요. '내 계정'에서 언제든 풀 수 있어요.</p>
          <div class="sheet-actions"><button class="btn grow" data-act="closeModal">취소</button><button class="btn primary grow" data-act="blockYes" data-nick="${esc(el.dataset.nick)}" data-key="${esc(el.dataset.key)}">차단하기</button></div>`);
        break;
      case 'blockYes': {
        const key = el.dataset.key;
        api('POST', `/api/users/${encodeURIComponent(el.dataset.nick)}/block`, {}).then(r => {
          closeModal();
          if (!r.ok) return toast(r.error);
          toast('차단했어요');
          for (const k of Object.keys(REPLIES)) delete REPLIES[k];
          BLOCKS.status = 'idle';
          HOT.status = 'idle';
          loadTalk(key);
        });
        break;
      }
      // ── 관리
      case 'adminReload':
        loadAdmin();
        render();
        break;
      case 'copyInvite': {
        const code = ADMIN.data && ADMIN.data.invite;
        if (code) copyText(code).then(ok => toast(ok ? '초대 코드를 복사했어요' : '복사하지 못했어요. 코드를 길게 눌러 복사해 주세요'));
        break;
      }
      case 'copyText':
        copyText(el.dataset.text || '').then(ok => toast(ok ? '복사했어요' : '복사하지 못했어요. 길게 눌러 복사해 주세요'));
        break;
      case 'newInvite':
        openModal(`<h3>초대 코드를 새로 만들까요?</h3><p>지금 코드로는 더 이상 가입할 수 없어요. 이미 가입한 사람은 그대로 써요.</p>
          <div class="sheet-actions"><button class="btn grow" data-act="closeModal">취소</button><button class="btn primary grow" data-act="newInviteYes">새로 만들기</button></div>`);
        break;
      case 'newInviteYes':
        api('POST', '/api/admin/invite', {}).then(r => {
          closeModal();
          if (!r.ok) return toast(r.error);
          if (ADMIN.data) ADMIN.data.invite = r.data.invite;
          toast('새 초대 코드를 만들었어요');
          rerender();
        });
        break;
      case 'adminPost': {
        const a = el.dataset.a;
        api('POST', `/api/admin/post/${encodeURIComponent(el.dataset.id)}/${a}`, {}).then(r => {
          if (!r.ok) return toast(r.error);
          toast({ hide: '가렸어요', restore: '되살렸어요', delete: '지웠어요' }[a]);
          for (const k of Object.keys(TALK)) delete TALK[k];
          HOT.status = 'idle';
          loadAdmin();
        });
        break;
      }
      case 'resetPw':
        openModal(`<h3>${esc(el.dataset.nick)}님 비밀번호를 초기화할까요?</h3><p>임시 비밀번호를 만들어 보여 드려요. 그 사람에게 직접 전해 주고, 로그인한 뒤 '내 계정 › 비밀번호 바꾸기'로 바꾸라고 알려 주세요. 그 사람이 로그인해 둔 기기는 모두 로그아웃돼요.</p>
          <div class="sheet-actions"><button class="btn grow" data-act="closeModal">취소</button><button class="btn primary grow" data-act="resetPwYes" data-nick="${esc(el.dataset.nick)}">초기화</button></div>`);
        break;
      case 'resetPwYes':
        api('POST', `/api/admin/user/${encodeURIComponent(el.dataset.nick)}/reset`, {}).then(r => {
          if (!r.ok) { closeModal(); return toast(r.error); }
          openModal(`<h3>${esc(r.data.nick)}님 임시 비밀번호</h3><div class="invite"><code>${esc(r.data.temp)}</code><button class="btn small" data-act="copyText" data-text="${esc(r.data.temp)}">${icon('copy')}복사</button></div>
            <p class="tiny" style="margin-top:10px">이 창을 닫으면 다시 볼 수 없어요. 그 사람에게만 전해 주세요.</p>
            <div class="sheet-actions"><button class="btn primary block" data-act="closeModal">다 전했어요</button></div>`);
        });
        break;
      case 'closeModal':
        closeModal();
        break;
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  window.addEventListener('hashchange', () => {
    if (!modal.hidden && !pendingMerge) closeModal(); // 창 안의 링크(로그인 등)를 누르면 창은 닫는다
    if (currentScreen === 'home') scrollMemo.home = lastScroll; // 홈에서 떠날 때 위치를 기억했다가 돌아오면 복원
    const h = location.hash;
    if (navStack.length > 1 && navStack[navStack.length - 2] === h) navStack.pop(); else navStack.push(h);
    const name = render();
    if (name !== 'home') window.scrollTo(0, 0);
  });
  let lastScroll = 0;
  window.addEventListener('scroll', () => { lastScroll = window.scrollY; }, { passive: true });
  // 다른 기기에서 쓰다가 이 화면으로 돌아오면 기록을 다시 맞춘다 (1분에 한 번까지, 글을 쓰는 중이면 건너뜀)
  let lastPull = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !account || !SERVER || Date.now() - lastPull < 60000) return;
    if (document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName)) return;
    lastPull = Date.now();
    pullState('boot');
  });

  // ── 시작
  function boot() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; // 새로고침 때 브라우저가 멋대로 스크롤을 옮기지 않게
    try {
      if (!MV || !PANEL) throw new Error('데이터 파일을 못 찾았어요 (app/data 폴더 확인)');
      initEngine();
      navStack.push(location.hash);
      render();
      probeArt(any => { if (any) { const y = window.scrollY; render(); window.scrollTo(0, y); } });
      loadNew('theater');
      loadNew('upcoming');
      loadNew('netflix');
      loadNew('series');
      if (SNAP && NEW.upcoming.status === 'ok') refreshSavedReleases(NEW.upcoming.data.items); // 폰판: 찜한 영화 개봉일이 바뀌었으면 맞춤
      if (account && SERVER) pullState('boot'); // 다른 기기에서 고친 기록 받아오기
    } catch (err) {
      app.innerHTML = `<div class="empty">${icon('alert')}<p>시험판을 여는 중 문제가 생겼어요.</p><p class="tiny">${esc(err.message)}</p></div>`;
      console.error(err);
    }
  }
  setTimeout(boot, 30);
  // 점검 프로그램(tools/shoot.js · check_social.js)이 쓰는 손잡이
  window.__tastecut = { engine: () => engine, state: () => state, getCalc, persist, render, account: () => account };
})();
