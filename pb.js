import PocketBase from './vendor/pocketbase.es.mjs';
import { urlBase64ToUint8Array } from './lib/push.js';

export const pb = new PocketBase('/');
pb.autoCancellation(false); // 한 화면이 여러 목록을 동시에 불러온다

export const me = () => pb.authStore.record;

// ---- 연결 상태: 요청이 네트워크 오류(status 0)로 실패하거나 실시간 연결이 끊기면 오프라인 ----
let online = true;
let polling = null;
const listeners = new Set();

export function onConnection(cb) {
  listeners.add(cb);
  cb(online);
  return () => listeners.delete(cb);
}

function setOnline(value) {
  if (value === online) return;
  online = value;
  listeners.forEach((cb) => cb(value));
  if (!value && !polling) {
    polling = setInterval(async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) {
          clearInterval(polling);
          polling = null;
          setOnline(true);
        }
      } catch {
        /* 아직 꺼져 있음 */
      }
    }, 5000);
  }
}

const send = pb.send.bind(pb);
pb.send = async (path, options) => {
  try {
    const result = await send(path, options);
    setOnline(true);
    return result;
  } catch (err) {
    if (err?.status === 0 && !err?.isAbort) setOnline(false);
    // 로그인이 만료·무효면 다시 로그인하게 한다 (이 기기 알림도 정리)
    if (err?.status === 401 && pb.authStore.token) signOut();
    throw err;
  }
};

// 실시간 연결은 5분간 조용하면 서버가 끊고 곧바로 다시 붙는다. 그때마다 띠가 깜빡이지 않게
// 끊긴 뒤 서버가 실제로 응답하지 않을 때만 오프라인으로 본다.
pb.realtime.onDisconnect = (activeSubscriptions) => {
  if (!activeSubscriptions.length) return;
  setTimeout(() => {
    fetch('/api/health', { cache: 'no-store' }).then((r) => r.ok || setOnline(false)).catch(() => setOnline(false));
  }, 2000);
};

// ---- 이 기기의 알림 구독 ----
async function deviceSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// 이 기기의 알림을 지금 로그인한 사람이 받고 있는지
export async function pushIsMine() {
  const sub = await deviceSubscription().catch(() => null);
  if (!sub || Notification.permission !== 'granted') return false;
  try {
    const rec = await pb.collection('push_subscriptions').getFirstListItem(pb.filter('endpoint = {:e}', { e: sub.endpoint }));
    return rec.user === me()?.id;
  } catch {
    return false;
  }
}

// 이 기기를 구독하고 서버에 지금 로그인한 사람 것으로 저장한다
export async function savePush(reg) {
  const { publicKey } = await pb.send('/api/team/vapid', {});
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const { endpoint, keys } = sub.toJSON();
  await pb.collection('push_subscriptions').create({ user: me().id, endpoint, p256dh: keys.p256dh, auth: keys.auth });
}

// 브라우저가 구독을 바꾸면(sw.js의 pushsubscriptionchange) 서버에는 새 구독이 없다.
// 이 기기 구독이 살아 있는데 서버 기록이 내 것이 아니면 다시 저장한다(앱을 열 때, 서비스 워커가 알릴 때)
export async function resavePush() {
  if (!me() || !('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg || !(await reg.pushManager.getSubscription()) || (await pushIsMine())) return;
  await savePush(reg);
}

// 이 기기의 알림 구독을 끊고 서버 기록도 지운다(로그아웃·로그인 만료·알림 끄기)
export async function dropPush() {
  const sub = await deviceSubscription().catch(() => null);
  if (!sub) return;
  try {
    const rec = await pb.collection('push_subscriptions').getFirstListItem(pb.filter('endpoint = {:e}', { e: sub.endpoint }));
    await pb.collection('push_subscriptions').delete(rec.id);
  } catch {
    /* 이미 없거나 로그인이 끝남: 브라우저 구독만 끊으면 다음 발송 때 서버가 지운다 */
  }
  await sub.unsubscribe().catch(() => {});
}

let signingOut = false;
export async function signOut() {
  if (signingOut) return;
  signingOut = true;
  await dropPush();
  pb.authStore.clear();
  fileToken = ''; // 다음 사람이 앞사람의 파일 열쇠로 파일을 요청하지 않게
  signingOut = false;
}

// ---- 보호된 파일 주소: 서버의 파일 토큰은 1시간짜리라 50분 동안 같은 토큰을 쓴다 ----
let fileToken = '';
let fileTokenAt = 0;

export async function fileURL(record, name, query = {}) {
  if (!fileToken || Date.now() - fileTokenAt > 50 * 60_000) {
    fileToken = await pb.files.getToken();
    fileTokenAt = Date.now();
  }
  return pb.files.getURL(record, name, { token: fileToken, ...query });
}

// ---- 사람 이름 캐시 (담당자·작성자 표시용) ----
let usersCache = null;
export async function users() {
  if (!usersCache) usersCache = pb.collection('users').getFullList({ sort: 'name', fields: 'id,name,disabled' }).catch((e) => { usersCache = null; throw e; });
  return usersCache;
}
export function forgetUsers() {
  usersCache = null;
}
