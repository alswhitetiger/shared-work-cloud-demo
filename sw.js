// 푸시 알림을 받아 띄우고, 누르면 해당 화면을 연다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let n = {};
  try {
    n = e.data.json();
  } catch {
    n = { body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(self.registration.showNotification(n.title || '공용작업클라우드', {
    body: n.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: n.url || '/#/home' },
  }));
});

// 브라우저가 알림 구독을 바꾸면(만료·갱신) 새 구독을 서버에 다시 저장해야 한다.
// 서비스 워커에는 로그인 토큰이 없으므로 저장은 앱 화면이 한다: 열린 화면이 있으면 지금, 없으면 다음 실행 때
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const key = e.oldSubscription?.options?.applicationServerKey;
    if (!e.newSubscription && key) {
      await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).catch(() => {});
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach((w) => w.postMessage({ type: 'push-resave' }));
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/#/home', self.location.origin).href;
  e.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) {
      open.postMessage({ type: 'open', url });
      return open.focus();
    }
    return self.clients.openWindow(url);
  })());
});
