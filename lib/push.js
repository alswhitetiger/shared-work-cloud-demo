// 서버의 알림 공개 키(base64url)를 브라우저 pushManager가 받는 바이트 배열로 바꾼다.
export function urlBase64ToUint8Array(s) {
  const base64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// 알림이 알려 준 이동 주소는 이 서버 안(같은 origin)일 때만 따라간다.
// 그래야 알림 내용이 바뀌어도 javascript:·다른 사이트로 넘어가지 않는다(CSP가 한 번 더 막지만 이중으로).
export function sameOriginURL(raw, origin) {
  if (!raw) return null;
  try {
    const u = new URL(raw, origin);
    return u.origin === origin ? u.href : null;
  } catch {
    return null;
  }
}
