// 근무 기록 계산과 내보내기. 날짜·시각은 모두 한국 시간으로 보여 준다.

const parse = (iso) => (iso ? new Date(iso.replace(' ', 'T')) : null);
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function workMinutes(r) {
  const a = parse(r.clock_in), b = parse(r.clock_out);
  return a && b && b > a ? Math.floor((b - a) / 60000) : 0;
}

export function formatMinutes(m) {
  const h = Math.floor(m / 60), mm = m % 60;
  if (!h) return `${mm}분`;
  return mm ? `${h}시간 ${mm}분` : `${h}시간`;
}

export function kstTime(iso) {
  const d = parse(iso);
  return d ? timeFmt.format(d) : '';
}

// '2026-02' → ['2026-02-01', …, '2026-02-28']
export function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
}

// 엑셀에서 바로 열리는 CSV. =, +, -, @ 로 시작하는 칸은 수식으로 실행되지 않게 앞에 '를 붙인다.
export function toCSV(rows) {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// 지금 출퇴근 카드에 보여 줄 기록: 오늘 출근한 기록, 없으면 아직 안 닫은 어제 야간 근무(18시간 안)
export function pickShift(records, me, today, yesterday, nowMs = Date.now()) {
  const mine = records.filter((r) => r.user === me);
  const t = mine.find((r) => r.date === today);
  if (t?.clock_in) return { record: t, overnight: false };
  const y = mine.find((r) => r.date === yesterday);
  const inAt = parse(y?.clock_in);
  if (y && inAt && !y.clock_out && nowMs - inAt.getTime() <= 18 * 3600 * 1000) return { record: y, overnight: true };
  return { record: t, overnight: false };
}

// 홈에서 출근할지 물을지: 오늘 기록·야간 근무가 없고, 근무 요일(비었으면 매일)이고, 이 기기에서 오늘 아직 묻지 않았다
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export function shouldAskClockIn(shift, workDays, today, askedOn) {
  if (shift?.record || askedOn === today) return false;
  const [y, m, d] = today.split('-').map(Number);
  return !workDays?.length || workDays.includes(DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]);
}
