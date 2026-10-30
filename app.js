import { html, render, useState, useEffect, useRef } from './vendor/preact-htm.js';
import { pb, me, onConnection, signOut, resavePush } from './pb.js';
import { Icon } from './icons.js';
import { OFFLINE } from './lib/errors.js';
import { setDraftOwner } from './lib/drafts.js';
import { sameOriginURL } from './lib/push.js';

setDraftOwner(me()?.id);
pb.authStore.onChange(() => setDraftOwner(me()?.id));

// PC 왼쪽 메뉴는 전부, 휴대폰 아래 메뉴는 5개(문서 안에 자료실, 근무 안에 일일 보고)
const RAIL = [
  { key: 'home', label: '홈', icon: 'home' },
  { key: 'tasks', label: '할 일', icon: 'tasks' },
  { key: 'schedule', label: '일정 · 타임라인', icon: 'calendar' },
  { key: 'chat', label: '채팅', icon: 'chat' },
  { key: 'docs', label: '문서', icon: 'doc' },
  { key: 'files', label: '자료실', icon: 'files' },
  { key: 'attendance', label: '출퇴근', icon: 'clock' },
  { key: 'reports', label: '일일 보고', icon: 'report' },
];
const TABS = [
  { key: 'home', label: '홈', icon: 'home' },
  { key: 'tasks', label: '할 일', icon: 'tasks', also: ['schedule'] },
  { key: 'chat', label: '채팅', icon: 'chat' },
  { key: 'docs', label: '문서', icon: 'doc', also: ['files'] },
  { key: 'attendance', label: '근무', icon: 'clock', also: ['reports'] },
];
const TITLES = { home: '홈', tasks: '할 일', schedule: '일정 · 타임라인', chat: '채팅', docs: '문서', files: '자료실', attendance: '근무', reports: '일일 보고', settings: '설정' };
const PUBLIC = ['login', 'reset']; // 로그인 없이 여는 화면

const screens = {
  login: () => import('./screens/login.js'),
  home: () => import('./screens/home.js'),
  tasks: () => import('./screens/tasks.js'),
  schedule: () => import('./screens/schedule.js'),
  files: () => import('./screens/files.js'),
  chat: () => import('./screens/chat.js'),
  reports: () => import('./screens/reports.js'),
  docs: () => import('./screens/docs.js'),
  attendance: () => import('./screens/attendance.js'),
  reset: () => import('./screens/reset.js'),
  settings: () => import('./screens/settings.js'),
};

// ---- 채팅 메뉴의 노란 점 ----
let chatDot = false;
const dotListeners = new Set();
export function setChatDot(on) {
  chatDot = on;
  dotListeners.forEach((cb) => cb(on));
}
function onChatDot(cb) {
  dotListeners.add(cb);
  cb(chatDot);
  return () => dotListeners.delete(cb);
}

// ---- 잠깐 뜨는 안내 ----
let toastSetter = null;
export function toast(text) {
  toastSetter?.(text);
}

function parse() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'home', params: params.map(decodeURIComponent) };
}

function LoadFailed() {
  return html`<div class="empty">화면을 불러오지 못했습니다. 연결을 확인하고 새로고침해 주세요.</div>`;
}

function NavLinks({ items, current, dot }) {
  return items.map((n) => html`
    <a href=${'#/' + n.key} title=${n.label} aria-current=${current === n.key || n.also?.includes(current) ? 'page' : undefined}>
      <${Icon} name=${n.icon} /><span>${n.label}</span>
      ${n.key === 'chat' && dot ? html`<span class="dot" role="img" aria-label="새 메시지"></span>` : null}
    </a>`);
}

function App() {
  const [route, setRoute] = useState(parse);
  const [authed, setAuthed] = useState(pb.authStore.isValid);
  const [online, setOnline] = useState(true);
  const [dot, setDot] = useState(false);
  // 불러온 화면과 그 화면 이름을 함께 둔다: 새 화면 코드가 오기 전에 이전 화면이 새 주소로 그려지지 않게
  const [loaded, setLoaded] = useState({ name: null, C: null });
  const [note, setNote] = useState('');
  const [backupWarn, setBackupWarn] = useState('');
  const mainRef = useRef(null);

  useEffect(() => {
    const onHash = () => setRoute(parse());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => pb.authStore.onChange(() => setAuthed(pb.authStore.isValid)), []);
  useEffect(() => onConnection(setOnline), []);
  useEffect(() => onChatDot(setDot), []);
  useEffect(() => {
    toastSetter = (text) => {
      setNote(text);
      clearTimeout(toastSetter.t);
      toastSetter.t = setTimeout(() => setNote(''), 3500);
    };
  }, []);

  // 시작할 때와 화면으로 돌아올 때 로그인을 연장한다. 정지·만료면 로그아웃(이 기기 알림도 정리).
  // 연결이 끊긴 경우(status 0)에는 그대로 둔다.
  useEffect(() => {
    const check = () => {
      if (!pb.authStore.token) return;
      if (!pb.authStore.isValid) return signOut();
      pb.collection('users').authRefresh().catch((err) => {
        if (err?.status === 401 || err?.status === 403) signOut();
      });
    };
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // 주 PC에서 열었을 때만 답이 온다(바깥에서는 404): 구글 드라이브 백업이 멈췄으면 위쪽에 알린다.
  // 창을 며칠씩 켜 두어도 놓치지 않게 창으로 돌아올 때와 한 시간마다 다시 보고, 고쳐졌으면 띠를 지운다.
  useEffect(() => {
    if (!authed) return;
    const check = () => fetch('/api/setup/backup-health', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => h && setBackupWarn(h.configured && (h.error || h.stale) ? h.error || '구글 드라이브에 3일 넘게 새 백업 사본이 없습니다' : ''))
      .catch(() => {});
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    const hourly = setInterval(check, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(hourly);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authed]);

  // 새 메시지를 앱 전체에서 지켜본다: 채팅 점 표시 + 실시간 연결이 끊기면 연결 안내가 뜬다
  useEffect(() => {
    if (!authed) return;
    import('./rooms.js')
      .then(({ loadRooms }) => loadRooms())
      .then((list) => setChatDot(list.some((r) => r.unread > 0)))
      .catch(() => {});
    const unsub = pb.collection('messages').subscribe('*', (e) => {
      if (e.action !== 'create' || e.record.author === me()?.id) return;
      if (location.hash !== `#/chat/${e.record.room}`) setChatDot(true);
    });
    return () => unsub.then((off) => off()).catch(() => {});
  }, [authed]);

  // 앱을 열(로그인할) 때 브라우저가 바꿔 둔 알림 구독이 있으면 서버에 다시 저장한다(sw.js 참고)
  useEffect(() => {
    if (authed) resavePush().catch(() => {});
  }, [authed]);

  const name = route.name === 'reset' ? 'reset' : !authed ? 'login' : route.name === 'login' ? 'home' : route.name;
  useEffect(() => {
    if (authed && route.name === 'login') location.replace('#/home');
  }, [authed, route.name]);

  useEffect(() => {
    let alive = true;
    setLoaded({ name: null, C: null });
    (screens[name] || screens.home)()
      .then((m) => alive && setLoaded({ name, C: m.Screen }))
      .catch(() => alive && setLoaded({ name, C: LoadFailed }));
    return () => {
      alive = false;
    };
  }, [name]);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [route.name, route.params.join('/')]);

  const Screen = loaded.name === name ? loaded.C : null;
  const banner = !online && html`<div class="banner" role="alert">${OFFLINE}</div>`;
  const toastEl = note && html`<div class="toast" role="status">${note}</div>`;

  if (PUBLIC.includes(name)) {
    return html`${banner}${Screen && html`<${Screen} params=${route.params} />`}${toastEl}`;
  }

  const user = me();
  return html`
    <div class="app">
      <button class="skip" type="button" onClick=${() => mainRef.current?.focus()}>본문으로 건너뛰기</button>
      <aside class="rail" aria-label="주 메뉴">
        <div class="brand" title="공용작업클라우드"><span class="brand-mark" aria-hidden="true">공</span><span class="sr-only">공용작업클라우드</span></div>
        <nav class="nav"><${NavLinks} items=${RAIL} current=${name} dot=${dot} /></nav>
        <div class="bottom nav">
          <a href="#/settings" title=${'설정 · ' + (user?.name || '')} aria-current=${name === 'settings' ? 'page' : undefined}>
            <${Icon} name="settings" /><span>${user?.name || '설정'}</span>
          </a>
        </div>
      </aside>
      <div class="main">
        ${banner}
        ${backupWarn && html`<a class="banner warn" href="/setup">${backupWarn} · 눌러서 확인하기</a>`}
        <header class="topbar">
          <span class="title">${TITLES[name] || ''}</span>
          <a class="btn ghost icon" href="#/settings" aria-label="설정"><${Icon} name="settings" /></a>
        </header>
        <main class="content" id="main" tabindex="-1" ref=${mainRef}>
          ${Screen && html`<${Screen} params=${route.params} />`}
        </main>
      </div>
      <nav class="tabbar" aria-label="주 메뉴"><${NavLinks} items=${TABS} current=${name} dot=${dot} /></nav>
      ${toastEl}
    </div>`;
}

// 서비스 워커: 홈 화면 설치와 푸시 알림 수신. 알림을 누르면 그 화면으로 이동한다.
if ('serviceWorker' in navigator) {
  Promise.reject(new Error('체험판')).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open') {
      const href = sameOriginURL(e.data.url, location.origin);
      if (href) location.href = href;
    }
    if (e.data?.type === 'push-resave') resavePush().catch(() => {});
  });
}

render(html`<${App} />`, document.getElementById('root'));
