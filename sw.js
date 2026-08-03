// Service Worker：云端离线版专用。缓存应用外壳 + 主 HTML，实现"添加到主屏幕后离线可用"
// 策略分流（v20 起）：
//   - 导航请求/主 HTML：network-first（网络优先，失败才回退缓存）
//     原因：旧版对 HTML 也用 cache-first，导致每次发新版用户仍看到旧缓存页面，
//           必须彻底关闭再开第二次才生效 —— 表现为"修复了但没变化"。
//   - 静态大资源（OCR 分片、图标、manifest）：cache-first（体积大且极少变动，保证离线秒开）
const CACHE = 'dandan-bridge-offline-v29';
const PRECACHE = ['./manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './favicon.ico', './app-core-1.js', './app-core-2.js', './app-core-3.js', './app-core-4.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 允许页面主动要求 SW 立即接管（配合页面端的更新提示）
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // 只处理同源资源

  // 是否为"页面文档"请求（地址栏打开、PWA 启动、刷新）
  const isDoc = e.request.mode === 'navigate' ||
    (e.request.destination === 'document') ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html');

  if (isDoc) {
    // 网络优先：始终尝试拿最新 HTML，成功即回写缓存；断网时才用缓存
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res && res.status === 200) {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, cp));
        }
        return res;
      }).catch(() => caches.match(e.request).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // version.json：永远走网络，保证“检查更新”拿到最新版本号，不被 SW 缓存
  if (url.pathname.endsWith('version.json')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 504 })));
    return;
  }

  // 静态资源：缓存优先 + 后台刷新
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res && res.status === 200) {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, cp));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
