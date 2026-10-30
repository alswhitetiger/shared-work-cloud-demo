// 화면 밝기 고르기: 'dark'(처음 값) | 'light' | 'system'(기기 설정 따르기). 처음 값은 /theme.js가 정한다.
const query = window.matchMedia('(prefers-color-scheme: light)');
const listeners = new Set();

export function themeChoice() {
  try { return localStorage.getItem('theme') || 'dark'; } catch { return 'dark'; }
}
export const currentTheme = () => document.documentElement.dataset.theme;

export function setTheme(choice) {
  try { localStorage.setItem('theme', choice); } catch { /* 저장 못 해도 이번 화면은 바뀐다 */ }
  apply(choice);
}

function apply(choice = themeChoice()) {
  const t = choice === 'system' ? (query.matches ? 'light' : 'dark') : choice;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#ffffff' : '#0b0d10');
  listeners.forEach((cb) => cb(t));
}

// 밝기가 바뀌면 알려 준다(메뉴 단추·설정 화면이 서로 맞춰지게)
export function onTheme(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// 기기 설정을 따르는 중이면 기기가 바뀔 때 같이 바꾼다
query.addEventListener('change', () => { if (themeChoice() === 'system') apply(); });
