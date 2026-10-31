// 취향컷 폰판(홈 화면 앱) 시작 파일 — 폰 크롬이 GitHub 에 올린 취향컷을 열 때 맨 먼저 실행된다
//  1) 열쇠: 처음 한 번 PC '폰에 설치하기' 화면의 열쇠 코드를 넣는다(또는 열쇠가 붙은 링크로 연다). 이 폰에만 저장
//  2) 데이터 풀기: 미국 관객 평가·영화 정보·신작 목록은 암호화해서 올렸다(남이 못 쓰게) → 열쇠로 풀어 계산 엔진·화면을 켠다
//  3) 새 판: 켤 때와 15분 넘게 지나 돌아올 때 version.json 만 확인 → 새 판이면 phone-sw.js 가 받아 지문까지 검사
//     → 앱을 새로 켤 때는 알아서 새 판, 쓰는 중이면 '지금 바꾸기'
//  4) 인터넷이 없으면 마지막에 받아 둔 판으로 켜진다 (phone-sw.js 가 저장)
// __VERSION__ · __SALT__ · __FILES__ 는 tools/publish_phone.js 가 올릴 때 채운다
(function () {
  'use strict';
  const VERSION = "2026.10.31-094407";
  const SALT = "jLrRceYG-3T6wMLT_B90xQ";
  const FILES = {"data.bin":"a23f6c6c72ee3929","news.bin":"809e247bca67837a","engine.js":"8634d34f1c4d92ec","app.js":"85b502fdfa2762e4"}; // { 'app.js': 지문, ... } — 처음 받을 때 옛 파일이 섞이지 않게 주소 끝에 붙인다
  const KEY_STORE = 'tastecut.phoneKey';
  const CHECK_EVERY = 15 * 60e3;
  window.TC_PHONE = { version: VERSION };
  const app = document.getElementById('app');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const b64u = { enc: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0)) };
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 저장 안 되는 창 */ } }, del: k => { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } } };

  function show(html) { app.innerHTML = html; }
  const BRAND = '<div class="brand"><img class="brand-icon" src="assets/art/web/icon.webp" alt="" width="36" height="36"><span class="brand-name">취향컷</span></div>';
  function loading(msg) { show(`<div class="boot">${BRAND}<p>${esc(msg)}</p></div>`); }

  // ── 열쇠: 코드(예: K7QX-M3RT-9FDA) → PBKDF2(30만 번) → AES 열쇠. 코드가 아니라 만든 열쇠만 이 폰에 저장
  const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  async function keyFromCode(code) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normCode(code)), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64u.dec(SALT), iterations: 300000 }, base, 256);
  }
  // data.bin(영화 데이터) · news.bin(신작 목록) = 앞 12바이트(IV) + 암호문(+확인 꼬리 16바이트). 풀고 나면 gzip 을 한 번 더 풀어 글자로
  async function openBin(name, key) {
    const res = await fetch(name + '?v=' + FILES[name]);
    if (!res.ok) throw new Error(name + ' 을 받지 못했어요 (' + res.status + ')');
    const buf = new Uint8Array(await res.arrayBuffer());
    let zipped;
    try { zipped = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12)); } catch (e) { const err = new Error('열쇠가 맞지 않아요'); err.badKey = true; throw err; }
    const stream = new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  async function openData(rawKey) {
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
    const [data, news] = await Promise.all([openBin('data.bin', key), openBin('news.bin', key)]);
    return data + '\n' + news;
  }
  function runScript(src, text) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      const url = text != null ? URL.createObjectURL(new Blob([text], { type: 'text/javascript' })) : null;
      s.src = url || src;
      s.onload = () => { if (url) URL.revokeObjectURL(url); resolve(); };
      s.onerror = () => reject(new Error((src || '데이터') + ' 를 불러오지 못했어요'));
      document.body.appendChild(s);
    });
  }

  function askKey(msg) {
    show(`<section class="welcome">
      ${BRAND}
      <h1>열쇠 코드를 넣어 주세요</h1>
      <p>PC의 바탕화면 › TasteCut › <b>폰에 설치하기</b>를 열면 나오는 12자리 코드예요. 이 폰에서 처음 한 번만 넣으면 돼요.</p>
      <form id="key-form" class="form" novalidate>
        <label class="field"><span>열쇠 코드</span><input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="예: K7QX-M3RT-9FDA"></label>
        <p class="form-error" role="alert"${msg ? '' : ' hidden'}>${msg ? esc(msg) : ''}</p>
        <button class="btn primary block" type="submit">열기</button>
      </form>
      <p class="notice">개인 시험판이에요. 영화 데이터는 암호화해서 올려 두었고, 열쇠가 있어야 풀려요. 열쇠 코드는 다른 사람에게 보내지 마세요.</p>
    </section>`);
    const f = document.getElementById('key-form');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const code = f.elements.code.value;
      const err = f.querySelector('.form-error');
      if (normCode(code).length < 8) { err.textContent = '코드를 끝까지 넣어 주세요'; err.hidden = false; return; }
      f.querySelector('button').disabled = true;
      err.textContent = '여는 중이에요… (몇 초 걸려요)'; err.hidden = false;
      await tryKey(code);
    });
  }
  async function tryKey(code) {
    loading('열쇠를 확인하는 중이에요…');
    const raw = await keyFromCode(code);
    try {
      const text = await openData(raw);
      store.set(KEY_STORE, b64u.enc(raw));
      await launch(text);
    } catch (e) {
      if (e.badKey) askKey('열쇠 코드가 맞지 않아요. PC 화면의 코드를 다시 확인해 주세요');
      else fail(e);
    }
  }
  function fail(e) {
    show(`<div class="empty"><p>취향컷을 여는 중 문제가 생겼어요.</p><p class="tiny">${esc(e && e.message || e)}</p><button class="btn" id="retry">다시 해 보기</button></div>`);
    document.getElementById('retry').addEventListener('click', () => location.reload());
  }

  async function launch(text) {
    loading('취향 계산 준비 중…');
    await runScript(null, text);                       // TC_MOVIES · TC_PANEL · TC_CALIB · TC_NEWCALIB · TC_POSTERS · TC_NEWSNAP
    await runScript('engine.js?v=' + FILES['engine.js']);
    await runScript('app.js?v=' + FILES['app.js']);    // 화면 시작 (app.js 가 TC_PHONE 을 보고 서버 기능을 숨김)
  }

  // ── 새 판 받기 (phone-sw.js 와 짝)
  let reg = null, lastCheck = 0;
  function banner() {
    if (document.getElementById('update-banner')) return;
    const b = document.createElement('div');
    b.id = 'update-banner';
    b.className = 'update-banner';
    b.setAttribute('role', 'status');
    b.innerHTML = '<span>새 판이 있어요</span><button class="btn small primary" type="button">지금 바꾸기</button>';
    b.querySelector('button').addEventListener('click', () => {
      const w = reg && reg.waiting;
      if (w) w.postMessage('skipWaiting'); else location.reload();
    });
    document.body.appendChild(b);
  }
  function watchInstall(r) {
    r.addEventListener('updatefound', () => {
      const w = r.installing;
      if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) banner(); });
    });
  }
  async function checkUpdate() {
    lastCheck = Date.now();
    try {
      const res = await fetch('version.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const v = await res.json();
      // 새 판: 판 번호를 붙인 주소로 알림 담당을 다시 등록 → 인터넷 중간 저장소(CDN)의 옛 파일 대신 새 파일을 받는다
      if (v.version !== VERSION) reg = await navigator.serviceWorker.register('phone-sw.js?v=' + encodeURIComponent(v.version));
    } catch (e) { /* 인터넷 없음 — 받아 둔 판으로 계속 */ }
  }
  async function setupWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const hadController = !!navigator.serviceWorker.controller; // 처음 설치 때는 화면을 다시 켜지 않는다
      reg = await navigator.serviceWorker.register('phone-sw.js?v=' + encodeURIComponent(VERSION));
      watchInstall(reg);
      if (reg.waiting && hadController) banner();
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
      checkUpdate();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - lastCheck > CHECK_EVERY) checkUpdate(); });
    } catch (e) { console.warn('새 판 받기 준비 실패', e); }
  }

  async function start() {
    // 지난번에 다 받아 둔 새 판이 있으면 켜기 전에 바로 바꾼다 (앱을 새로 켤 때는 알아서 새 화면으로)
    if ('serviceWorker' in navigator) {
      try {
        const r = await navigator.serviceWorker.getRegistration();
        if (r && r.waiting && navigator.serviceWorker.controller) {
          loading('새 판으로 바꾸는 중이에요…');
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
          r.waiting.postMessage('skipWaiting');
          return;
        }
      } catch (e) { /* 그냥 켠다 */ }
    }
    // 열쇠가 붙은 링크(…#k=코드)로 열었으면 열쇠를 저장하고 주소에서 지운다
    const m = /(?:^#|&)k=([A-Za-z0-9-]+)/.exec(location.hash);
    if (m) {
      history.replaceState(null, '', location.pathname + location.search);
      await tryKey(m[1]);
      setupWorker();
      return;
    }
    const saved = store.get(KEY_STORE);
    if (!saved) { askKey(); setupWorker(); return; }
    loading('데이터를 푸는 중이에요…');
    try {
      await launch(await openData(b64u.dec(saved)));
    } catch (e) {
      if (e.badKey) { store.del(KEY_STORE); askKey('열쇠가 바뀌었어요. 새 열쇠 코드를 넣어 주세요'); } else fail(e);
    }
    setupWorker();
  }
  if (!window.crypto || !crypto.subtle || typeof DecompressionStream === 'undefined') {
    show('<div class="empty"><p>이 브라우저에서는 열 수 없어요.</p><p class="tiny">폰의 크롬(또는 삼성 인터넷 최신판)으로 열어 주세요.</p></div>');
  } else {
    start();
  }
})();
