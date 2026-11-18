// 가족 보드 - 서비스 워커
// 1) 앱 화면 파일을 기억해 두었다가 빨리 열어요 (서버 요청은 기억하지 않아요)
// 2) Firebase 알림을 받아서 알림창에 보여주고, 누르면 그 메뉴를 열어요
//
// 화면 파일을 고치면 아래 VERSION 숫자를 올려 주세요. 그래야 새 파일로 바뀌어요.
const VERSION = 'fb-1.0.4';
const FILES = [
  './', 'index.html', 'manifest.json', 'css/app.css', 'icons/icon.svg',
  'js/api.js', 'js/app.js', 'js/config.js', 'js/events.js', 'js/icons.js', 'js/import.js', 'js/menu.js', 'js/photo.js', 'js/push.js',
  'js/state.js', 'js/theme.js', 'js/ui.js',
  'js/views/approve.js', 'js/views/budget.js', 'js/views/calendar.js', 'js/views/chat.js', 'js/views/home.js',
  'js/views/missions.js', 'js/views/settings-notify.js', 'js/views/settings.js', 'js/views/wiki.js', 'js/views/stamps.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 같은 주소의 화면 파일만: 먼저 인터넷에서 받고, 안 되면 기억해 둔 파일
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});

/* ---------- 알림 ---------- */
// 서버(Notify.gs)는 data 메시지 { title, body, url, tag } 로 보내요.
self.addEventListener('push', (e) => {
  let d = {};
  try { const j = e.data ? e.data.json() : {}; d = j.data || j.notification || j; } catch (err) { d = { title: '가족 보드', body: e.data ? e.data.text() : '' }; }
  const title = d.title || '가족 보드';
  const opts = {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: 'icons/icon.svg', badge: 'icons/icon.svg', data: { url: d.url || '#home' },
  };
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const visible = list.some((c) => c.visibilityState === 'visible');
    list.forEach((c) => c.postMessage({ type: 'push', data: d }));
    // 앱을 보고 있으면 소리 없이
    return self.registration.showNotification(title, visible ? { ...opts, silent: true } : opts);
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.url) || '#home';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list.find((x) => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'go', url: hash }); return c.focus(); }
    return self.clients.openWindow(self.registration.scope + hash);
  }));
});
