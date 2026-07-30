// Service Worker：单文件离线版专用。缓存应用外壳 + 主 HTML，实现“添加到主屏幕后离线可用”
// 策略：stale-while-revalidate（先返回缓存，同时后台刷新缓存），保证离线即时可用、线上更新能自动下发
const CACHE = 'dandan-bridge-offline-v17';
const PRECACHE = ['./manifest.webmanifest', './icon-192.png', './icon-512.png', './favicon.ico', './app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // 只缓存同源资源（主 HTML、manifest、icon）
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res && res.status === 200) {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, cp));
        }
        return res;
      }).catch(() => cached);
      // 先返回缓存(若有)，同时在后台刷新缓存（既保证离线即时，又保证线上更新能下发）
      return cached || network;
    })
  );
});
