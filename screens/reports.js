import { html, useState, useEffect, useCallback } from '../vendor/preact-htm.js';
import { pb, me, users } from '../pb.js';
import { toast } from '../app.js';
import { errorMessage } from '../lib/errors.js';
import { todayKST, longDay } from '../lib/dates.js';
import { loadDraft, saveDraft, sendWithDraft } from '../lib/drafts.js';
import { WorkTabs } from './attendance.js';

const FIELDS = [
  { key: 'done', label: '오늘 한 일' },
  { key: 'next', label: '내일 할 일' },
  { key: 'blocked', label: '막힌 점' },
];
const EMPTY = { done: '', next: '', blocked: '' };

function MyReport({ date, existing, onSaved }) {
  // 날짜를 넣지 않는다: 자정을 넘겨 보내기에 실패해도 다음 날 폼에서 쓰던 글이 다시 보인다
  const key = 'report';
  // 처음 열 때 한 번만 읽는다: 보내지 못한 글이 있으면 그걸 우선한다
  const [draft] = useState(() => { try { return JSON.parse(loadDraft(key) || 'null'); } catch { return null; } });
  const [form, setForm] = useState(draft || (existing ? { done: existing.done, next: existing.next, blocked: existing.blocked } : EMPTY));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(k, v) {
    setForm((cur) => {
      const next = { ...cur, [k]: v };
      saveDraft(key, JSON.stringify(next));
      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.done.trim() && !form.next.trim() && !form.blocked.trim()) return setError('한 칸 이상 적어 주세요');
    setBusy(true);
    setError('');
    try {
      await sendWithDraft(key, JSON.stringify(form), () => existing
        ? pb.collection('reports').update(existing.id, form)
        : pb.collection('reports').create({ ...form, author: me().id, date }));
      toast(existing ? '보고를 고쳤습니다' : '보고를 냈습니다');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return html`
    <form class="panel panel-pad" onSubmit=${submit}>
      <h2 class="section-title mb-12">${existing ? '내 보고 고치기' : '내 보고 쓰기'}</h2>
      ${draft && html`<p class="hint mb-12">보내지 않은 내용을 불러왔습니다.</p>`}
      ${FIELDS.map((f) => html`
        <div class="field">
          <label for=${'r-' + f.key}>${f.label}</label>
          <textarea id=${'r-' + f.key} value=${form[f.key]} onInput=${(e) => set(f.key, e.target.value)}></textarea>
        </div>`)}
      ${error && html`<p class="error" role="alert">${error}</p>`}
      <button class="btn primary" type="submit" disabled=${busy}>${existing ? '고친 내용 저장' : '보고 내기'}</button>
    </form>`;
}

export function Screen() {
  const today = todayKST();
  const [date, setDate] = useState(today);
  const [reports, setReports] = useState(null);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setReports(null);
    pb.collection('reports').getFullList({ filter: pb.filter('date = {:date}', { date }) })
      .then(setReports).catch((e) => setError(errorMessage(e)));
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { users().then((u) => setPeople(u.filter((p) => !p.disabled))).catch(() => {}); }, []);

  const mine = reports?.find((r) => r.author === me().id);
  const missing = reports ? people.filter((p) => !reports.some((r) => r.author === p.id)) : [];
  const nameOf = (id) => people.find((p) => p.id === id)?.name || '';

  return html`
    <${WorkTabs} current="reports" />
    <div class="page-head">
      <div><h1>일일 보고</h1>
        <p class="date-line">${date === today ? `오늘, ${longDay(date)}` : longDay(date)}</p></div>
      <div class="field m-0">
        <label for="r-date">날짜</label>
        <input id="r-date" type="date" value=${date} max=${today} onInput=${(e) => e.target.value && setDate(e.target.value)} />
      </div>
    </div>
    ${error && html`<p class="error" role="alert">${error}</p>`}

    <div class="detail">
      ${date === today && reports && html`<${MyReport} key=${date + (mine?.id || '')} date=${date} existing=${mine} onSaved=${load} />`}
      <section class="stack">
        ${reports === null ? html`<p class="empty">불러오는 중…</p>` : html`
          ${reports.length === 0 && html`<div class="panel empty">이 날 낸 보고가 없습니다</div>`}
          ${reports.map((r) => html`
            <article class="panel panel-pad report">
              <h3>${nameOf(r.author)}${r.author === me().id ? ' (나)' : ''}</h3>
              ${FIELDS.map((f) => r[f.key] && html`<div class="report-part"><span class="label">${f.label}</span><p>${r[f.key]}</p></div>`)}
            </article>`)}
          ${missing.length > 0 && html`<p class="small muted">아직 안 낸 사람: ${missing.map((p) => p.name).join(', ')}</p>`}`}
      </section>
    </div>`;
}
