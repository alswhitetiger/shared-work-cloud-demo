import { html, useState, useEffect, useCallback, useRef } from '../vendor/preact-htm.js';
import { pb, me, users } from '../pb.js';
import { Icon } from '../icons.js';
import { toast } from '../app.js';
import { errorMessage } from '../lib/errors.js';
import { todayKST, longDay } from '../lib/dates.js';
import { workMinutes, formatMinutes, kstTime, monthDays, toCSV, pickShift } from '../lib/attendance.js';

// 내 출퇴근 카드용: 오늘 기록, 없으면 아직 안 닫은 어제 야간 근무
export async function loadMyShift() {
  const today = todayKST(), yesterday = todayKST(new Date(Date.now() - 864e5));
  const recs = await pb.collection('attendance').getFullList({ filter: pb.filter('user = {:me} && date >= {:y}', { me: me().id, y: yesterday }) });
  return pickShift(recs, me().id, today, yesterday);
}

export function WorkTabs({ current }) {
  return html`
    <nav class="subnav" aria-label="근무 메뉴">
      <a href="#/attendance" aria-current=${current === 'attendance' ? 'page' : undefined}>출퇴근</a>
      <a href="#/reports" aria-current=${current === 'reports' ? 'page' : undefined}>일일 보고</a>
    </nav>`;
}

// 출근·퇴근 버튼 공용: 서버 시각으로 남기고 화면을 새로 고친다
function useClock(onChange) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function clock(kind) {
    setBusy(true);
    setError('');
    try {
      await pb.send('/api/team/attendance/' + kind, { method: 'POST' });
      toast(kind === 'in' ? '출근을 기록했습니다' : '퇴근을 기록했습니다');
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, clock };
}

// 홈에도 쓰는 오늘 출퇴근 버튼
export function ClockCard({ shift, onChange }) {
  const record = shift?.record;
  const { busy, error, clock } = useClock(onChange);
  const inAt = kstTime(record?.clock_in), outAt = kstTime(record?.clock_out);
  return html`
    <section class="panel panel-pad clock-card">
      <h2 class="section-title">오늘 출퇴근</h2>
      ${shift?.overnight && html`<p class="small muted">어제 출근한 야간 근무입니다. 퇴근을 눌러 마무리하세요.</p>`}
      <dl class="clock-times">
        <div><dt>출근</dt><dd class="num">${inAt || '—'}</dd></div>
        <div><dt>퇴근</dt><dd class="num">${outAt || '—'}</dd></div>
      </dl>
      ${!inAt ? html`<button class="btn primary block" type="button" disabled=${busy} onClick=${() => clock('in')}><${Icon} name="clock" />출근하기</button>`
        : !outAt ? html`<button class="btn primary block" type="button" disabled=${busy} onClick=${() => clock('out')}><${Icon} name="clock" />퇴근하기</button>`
        : html`<p class="muted">오늘 ${formatMinutes(workMinutes(record))} 일했습니다.</p>`}
      ${error && html`<p class="error" role="alert">${error}</p>`}
    </section>`;
}

const askKey = () => 'clockAsked:' + me().id;
export function askedOn() {
  try { return localStorage.getItem(askKey()); } catch { return null; }
}

// 그날 처음 홈을 열면 묻는 창. 어떻게 닫든 이 기기에서는 오늘 다시 묻지 않는다.
export function ClockPrompt({ onChange }) {
  const ref = useRef(null);
  const { busy, error, clock } = useClock(() => ref.current?.close());
  useEffect(() => { ref.current.showModal(); }, []);
  function closed() {
    try { localStorage.setItem(askKey(), todayKST()); } catch { /* 저장하지 못하면 다음에 한 번 더 묻는다 */ }
    onChange();
  }
  return html`
    <dialog ref=${ref} class="prompt" aria-labelledby="cp-title" onClose=${closed}>
      <h2 id="cp-title" class="section-title">출근할까요?</h2>
      <p class="section-desc">지금 누르면 ${kstTime(new Date().toISOString())} 출근으로 남습니다.</p>
      <div class="prompt-actions">
        <button class="btn ghost" type="button" onClick=${() => ref.current.close()}>나중에</button>
        <button class="btn primary" type="button" autofocus disabled=${busy} onClick=${() => clock('in')}><${Icon} name="clock" />출근하기</button>
      </div>
      ${error && html`<p class="error" role="alert">${error}</p>`}
    </dialog>`;
}

function CorrectForm({ onDone, onCancel, initial }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const set = (k) => (e) => { const v = e.target.value; setForm((f) => ({ ...f, [k]: v })); };
  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await pb.send('/api/team/attendance/correct', { method: 'POST', body: form });
      toast('기록을 고쳤습니다');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return html`
    <form class="panel panel-pad" onSubmit=${submit}>
      <h2 class="section-title mb-12">기록 고치기</h2>
      <div class="grid-3">
        <div class="field"><label for="c-date">날짜</label><input id="c-date" type="date" max=${todayKST()} value=${form.date} onInput=${set('date')} required /></div>
        <div class="field"><label for="c-in">출근</label><input id="c-in" type="time" value=${form.clock_in} onInput=${set('clock_in')} /></div>
        <div class="field"><label for="c-out">퇴근</label><input id="c-out" type="time" value=${form.clock_out} onInput=${set('clock_out')} /></div>
      </div>
      <div class="field"><label for="c-note">고친 이유</label>
        <input id="c-note" maxlength="500" placeholder="예: 출입 카드를 두고 와서 못 찍음…" value=${form.note} onInput=${set('note')} required />
        <p class="hint">고친 기록에는 "수정됨"과 이유가 팀에 함께 보입니다.</p></div>
      ${error && html`<p class="error" role="alert">${error}</p>`}
      <div class="row"><button class="btn primary" type="submit">저장</button><button class="btn ghost" type="button" onClick=${onCancel}>취소</button></div>
    </form>`;
}

export function Screen() {
  const today = todayKST();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [records, setRecords] = useState(null);
  const [todays, setTodays] = useState([]);
  const [people, setPeople] = useState([]);
  const [fixing, setFixing] = useState(null);
  const [shift, setShift] = useState(null);
  const [error, setError] = useState('');
  const myId = me().id;

  const load = useCallback(() => {
    Promise.all([
      pb.collection('attendance').getFullList({ filter: pb.filter('date >= {:a} && date <= {:b}', { a: month + '-01', b: month + '-31' }), sort: 'date' }),
      pb.collection('attendance').getFullList({ filter: pb.filter('date = {:d}', { d: today }) }),
    ]).then(([m, t]) => { setRecords(m); setTodays(t); }).catch((e) => setError(errorMessage(e)));
    loadMyShift().then(setShift).catch(() => {});
  }, [month, today]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { users().then((u) => setPeople(u.filter((p) => !p.disabled))).catch(() => {}); }, []);
  useEffect(() => {
    const unsub = pb.collection('attendance').subscribe('*', load);
    return () => unsub.then((off) => off()).catch(() => {});
  }, [load]);

  const nameOf = (id) => people.find((p) => p.id === id)?.name || '';
  const mine = (records || []).filter((r) => r.user === myId);
  const byDate = Object.fromEntries(mine.map((r) => [r.date, r]));
  const total = mine.reduce((s, r) => s + workMinutes(r), 0);

  function download() {
    const rows = [['이름', '날짜', '출근', '퇴근', '근무 시간(분)', '수정됨', '메모']];
    for (const r of records || []) {
      rows.push([nameOf(r.user), r.date, kstTime(r.clock_in), kstTime(r.clock_out), workMinutes(r), r.corrected ? '예' : '', r.note]);
    }
    const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `근무기록-${month}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const fixFor = (date) => {
    const r = byDate[date];
    setFixing({ date, clock_in: kstTime(r?.clock_in), clock_out: kstTime(r?.clock_out), note: '' });
  };

  return html`
    <div class="page-head">
      <div><h1>근무</h1><p class="date-line">${longDay(today)}</p></div>
      <${WorkTabs} current="attendance" />
    </div>
    ${error && html`<p class="error" role="alert">${error}</p>`}

    <div class="home-grid">
      <section class="panel">
        <div class="panel-pad"><h2 class="section-title">오늘 팀 출퇴근</h2></div>
        <table class="team-table">
          <thead><tr><th scope="col">이름</th><th scope="col" class="num">출근</th><th scope="col" class="num">퇴근</th></tr></thead>
          <tbody>${people.map((p) => {
            const r = todays.find((x) => x.user === p.id);
            return html`<tr>
              <th scope="row">${p.name}${p.id === myId ? ' (나)' : ''}</th>
              <td class="num">${kstTime(r?.clock_in) || html`<span class="muted">아직</span>`}</td>
              <td class="num">${kstTime(r?.clock_out) || html`<span class="muted">—</span>`}</td>
            </tr>`;
          })}</tbody>
        </table>
      </section>
      <${ClockCard} shift=${shift} onChange=${load} />
    </div>

    ${fixing && html`<div class="mt-16"><${CorrectForm} initial=${fixing} onCancel=${() => setFixing(null)} onDone=${() => { setFixing(null); load(); }} /></div>`}

    <section class="panel mt-16">
      <div class="panel-pad row wrap">
        <h2 class="section-title">내 근무 기록</h2>
        <span class="small muted num">합계 ${formatMinutes(total)}</span>
        <span class="spacer"></span>
        <label class="sr-only" for="a-month">달</label>
        <input id="a-month" class="month-input" type="month" max=${today.slice(0, 7)} value=${month} onInput=${(e) => e.target.value && setMonth(e.target.value)} />
        <button class="btn small" type="button" onClick=${() => fixFor(today)}><${Icon} name="edit" />기록 고치기</button>
        <button class="btn small" type="button" disabled=${!records?.length} onClick=${download}><${Icon} name="download" />팀 전체 CSV</button>
      </div>
      ${records === null ? html`<p class="empty">불러오는 중…</p>` : html`
        <table class="team-table">
          <thead><tr><th scope="col">날짜</th><th scope="col" class="num">출근</th><th scope="col" class="num">퇴근</th><th scope="col" class="num">근무</th></tr></thead>
          <tbody>${monthDays(month).filter((d) => d <= today).reverse().map((d) => {
            const r = byDate[d];
            return html`<tr>
              <th scope="row"><button class="link-btn day-btn" type="button" onClick=${() => fixFor(d)} aria-label=${`${longDay(d)} 기록 고치기`}>${longDay(d)}</button>
                ${r?.corrected && html`<span class="small muted" title=${r.note}> 수정됨: ${r.note}</span>`}</th>
              <td class="num">${kstTime(r?.clock_in) || html`<span class="muted">—</span>`}</td>
              <td class="num">${kstTime(r?.clock_out) || html`<span class="muted">—</span>`}</td>
              <td class="num">${r && workMinutes(r) ? formatMinutes(workMinutes(r)) : ''}</td>
            </tr>`;
          })}</tbody>
        </table>`}
    </section>`;
}
