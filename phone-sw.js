// 취향컷 폰판 저장 담당 (서비스 워커) — 화면 파일을 폰에 받아 두어 인터넷이 없어도 켜지게 하고, 새 판을 안전하게 받는다
//  - 새 판 받기: 목록(FILES)의 파일을 하나씩 받아 지문(SHA-256)이 맞는지 확인. 하나라도 다르면 이번 판은 버리고 옛 판을 계속 쓴다
//    (GitHub 에 막 올린 직후 인터넷 중간 저장소가 옛 파일을 줄 때 섞이지 않게)
//  - 다 받은 새 판은 기다렸다가, 앱을 새로 켤 때나 '지금 바꾸기'를 누르면 바뀐다
//  - TMDB 포스터 같은 다른 사이트 파일은 건드리지 않는다 (브라우저가 알아서 저장)
// __VERSION__ · __FILES__ 는 tools/publish_phone.js 가 올릴 때 채운다
'use strict';
const VERSION = "2026.10.31-094407";
const FILES = [["app.js","85b502fdfa2762e4"],["assets/art/web/action-1.webp","5f5ac2aa662c8bd2"],["assets/art/web/action-2.webp","b844459ffc196b6e"],["assets/art/web/afterglow-1.webp","aef5cc5ae499fa31"],["assets/art/web/afterglow-2.webp","76a01671ed478fc8"],["assets/art/web/icon-180.png","3147d4ae2c810383"],["assets/art/web/icon-192.png","c15e918bfc9f6c7d"],["assets/art/web/icon-512.png","627d910445a8062b"],["assets/art/web/icon.webp","236bc555b9e28409"],["assets/art/web/laugh-1.webp","0067d5843accb676"],["assets/art/web/laugh-2.webp","4b3120f191509fe9"],["assets/art/web/pace-1.webp","ea6d5e4bcbe81fb3"],["assets/art/web/pace-2.webp","519e36330a5abaf3"],["assets/art/web/story-1.webp","23a759ac43d2717f"],["assets/art/web/story-2.webp","4ec578205378c07d"],["assets/art/web/tension-1.webp","d3ac255e5498edef"],["assets/art/web/tension-2.webp","75112874ed5b3720"],["assets/art/web/welcome.webp","493dc855652d6d85"],["data.bin","a23f6c6c72ee3929"],["engine.js","8634d34f1c4d92ec"],["index.html","745093c1719207d5"],["manifest.webmanifest","01834b22dd15b543"],["news.bin","809e247bca67837a"],["phone.js","19fe45e47c8ab39d"],["styles.css","fbbb5d3781a6a1ca"]]; // [[주소, 지문 앞 16자], ...]
const CACHE = 'tastecut-' + VERSION;

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 지난 판에 받아 둔 파일 중 지문이 같은 것은 다시 받지 않는다 (매일 바뀌는 건 신작 목록 news.bin 정도 — 폰 데이터 아끼기)
    // 같은 판이 두 번 설치될 때도 있다(브라우저가 옛 주소로 확인하다 새 내용을 받은 뒤, 화면이 새 주소로 다시 등록) → 같은 이름 저장소도 먼저 본다
    const olds = await Promise.all((await caches.keys()).filter(k => k.startsWith('tastecut-') && k !== CACHE).map(k => caches.open(k)));
    for (const [file, hash] of FILES) {
      const url = new URL(file, self.registration.scope);
      let buf = null, type = null;
      for (const old of [cache, ...olds]) {
        const r = await old.match(url.href);
        if (!r) continue;
        const b = await r.arrayBuffer();
        if (hex(await crypto.subtle.digest('SHA-256', b)).startsWith(hash)) { buf = b; type = r.headers.get('Content-Type'); break; }
      }
      if (!buf) {
        const res = await fetch(url.href + '?v=' + hash); // 판마다 주소가 달라 옛 파일이 섞일 일이 적고, 방금 화면이 받은 것은 다시 받지 않는다
        if (!res.ok) throw new Error('받기 실패: ' + file);
        buf = await res.arrayBuffer();
        if (!hex(await crypto.subtle.digest('SHA-256', buf)).startsWith(hash)) throw new Error('지문이 달라요: ' + file);
        type = res.headers.get('Content-Type');
      }
      await cache.put(url.href, new Response(buf, { headers: { 'Content-Type': type || 'application/octet-stream' } }));
    }
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('tastecut-') && k !== CACHE) await caches.delete(k);
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (url.pathname.endsWith('/version.json')) return; // 새 판 확인은 늘 인터넷에서
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    let path = url.origin + url.pathname; // 주소 끝 ?v=… 는 무시하고 받아 둔 파일로
    if (path === self.registration.scope.replace(/\/$/, '') || path.endsWith('/')) path = new URL('index.html', self.registration.scope).href;
    return (await cache.match(path)) || fetch(e.request);
  })());
});
