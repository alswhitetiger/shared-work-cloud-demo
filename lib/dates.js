const kstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });

// 한국 시간 기준 날짜(YYYY-MM-DD). 서버의 todayKST와 같은 규칙이다.
export function todayKST(now = new Date()) {
  return kstDate.format(now);
}

const timeFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' });

// 오늘이면 "오후 3:05", 아니면 "10월 15일 (수)".
export function shortWhen(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  return todayKST(d) === todayKST(now) ? timeFmt.format(d) : dayFmt.format(d);
}

export function longDay(ymd) {
  return dayFmt.format(new Date(`${ymd}T12:00:00+09:00`));
}

// ---- 달력: 날짜는 한국 시간 "YYYY-MM-DD", 달은 "YYYY-MM" ----
const noon = (ymd) => new Date(`${ymd}T12:00:00+09:00`);
export const weekday = (ymd) => noon(ymd).getUTCDay(); // 0 = 일요일
export const addDays = (ymd, n) => todayKST(new Date(noon(ymd).getTime() + n * 86400000));

export function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// 그 달 달력에 보일 날짜들: 일요일부터 토요일까지 꽉 찬 주(앞뒤 달 날짜 포함)
export function monthDays(month) {
  const first = month + '-01';
  const [y, m] = month.split('-').map(Number);
  const weeks = Math.ceil((weekday(first) + new Date(Date.UTC(y, m, 0)).getUTCDate()) / 7);
  const start = addDays(first, -weekday(first));
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}
