import { html, useState, useEffect, useCallback } from '../vendor/preact-htm.js';
import { pb, me, users } from '../pb.js';
import { Icon } from '../icons.js';
import { toast } from '../app.js';
import { errorMessage } from '../lib/errors.js';
import { todayKST, longDay, addDays, shiftMonth, monthDays, weekday } from '../lib/dates.js';
import { TaskTabs } from './tasks.js';

// 일정과 제작 타임라인을 한 달 달력으로 본다. 일정(하루·여러 날)은 칸에 제작 건 색으로,
// 메일·기록은 칸에 개수만 두고 날짜를 누르면 옆에 펼친다. 메일은 서버가 회사 메일함에서 넣는다(mailfeed.go).
// 날짜는 모두 한국 시간 "YYYY-MM-DD"로 다룬다.

const KIND = { schedule: '일정', note: '기록', mail: '메일' };
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const parse = (iso) => new Date(iso.replace(' ', 'T'));
const kstDay = (iso) => todayKST(parse(iso));
// 시간을 비우면 그날 0시로 둔다(하루 종일): 0시는 시각을 보여 주지 않는다
const shownTime = (iso) => (hm.format(parse(iso)) === '00:00' ? '' : hm.format(parse(iso)));
const toServer = (day, time) => new Date(`${day}T${time || '00:00'}:00+09:00`).toISOString().replace('T', ' ');
const md = (ymd) => `${+ymd.slice(5, 7)}/${+ymd.slice(8)}`;
const lastDay = (item) => (item.end ? kstDay(item.end) : kstDay(item.at));
const isPeriod = (item) => lastDay(item) !== kstDay(item.at);

// 제작 건 이름마다 늘 같은 색
const COLORS = 6;
function colorOf(project) {
  if (!project) return 'pc-none';
  let h = 0;
  for (const ch of project) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return 'pc-' + (h % COLORS);
}

// day 날짜에 걸친 항목을 고르는 서버 조건(여러 날 일정은 끝나는 날까지)
const overlap = (from, to) => pb.filter('at < {:to} && (at >= {:from} || end >= {:from})', { from: toServer(from), to: toServer(to) });

const BLANK = { kind: 'schedule', title: '', day: '', time: '', end: '', project: '', body: '' };

function EntryForm({ editing, day, projects, onDone }) {
  const [form, setForm] = useState(() => editing
    ? { kind: editing.kind, title: editing.title, day: kstDay(editing.at), time: shownTime(editing.at), end: isPeriod(editing) ? lastDay(editing) : '', project: editing.project, body: editing.body }
    : { ...BLANK, day });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) return setError('제목을 적어 주세요');
    const end = form.kind === 'schedule' && form.end && form.end !== form.day ? form.end : '';
    if (end && end < form.day) return setError('끝나는 날이 시작하는 날보다 빠릅니다');
    setBusy(true);
    setError('');
    const data = { kind: form.kind, title: form.title.trim(), at: toServer(form.day, form.time), end: end ? toServer(end) : '', project: form.project.trim(), body: form.body };
    try {
      if (editing) await pb.collection('timeline').update(editing.id, data);
      else await pb.collection('timeline').create({ ...data, created_by: me().id });
      toast(editing ? '고쳤습니다' : `${KIND[form.kind]}을 넣었습니다`);
      onDone(form.day);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return html`
    <form class="panel panel-pad" onSubmit=${submit}>
      <h2 class="section-title mb-12">${editing ? '고치기' : '새로 넣기'}</h2>
      <div class="seg seg-full mb-12" role="group" aria-label="종류">
        ${['schedule', 'note'].map((k) => html`<button type="button" aria-pressed=${form.kind === k} onClick=${() => setForm((f) => ({ ...f, kind: k }))}>
          ${k === 'schedule' ? '일정 (앞으로)' : '기록 (있었던 일)'}</button>`)}
      </div>
      <div class="field"><label for="tl-title">제목</label>
        <input id="tl-title" required maxlength="200" placeholder=${form.kind === 'schedule' ? '예: B사 제품 촬영' : '예: 고객 피드백 받음'} value=${form.title} onInput=${set('title')} /></div>
      <div class="grid-2">
        <div class="field"><label for="tl-day">${form.kind === 'schedule' ? '시작하는 날' : '날짜'}</label><input id="tl-day" type="date" required value=${form.day} onInput=${set('day')} /></div>
        <div class="field"><label for="tl-time">시각 (비우면 하루 종일)</label><input id="tl-time" type="time" value=${form.time} onInput=${set('time')} /></div>
      </div>
      ${form.kind === 'schedule' && html`
        <div class="field"><label for="tl-end">끝나는 날 (여러 날 걸칠 때만)</label>
          <input id="tl-end" type="date" min=${form.day} value=${form.end} onInput=${set('end')} /></div>`}
      <div class="field"><label for="tl-project">제작 건 (선택)</label>
        <input id="tl-project" list="tl-projects" maxlength="60" placeholder="예: A사 홍보영상" value=${form.project} onInput=${set('project')} autocomplete="off" />
        <datalist id="tl-projects">${projects.map((p) => html`<option value=${p} />`)}</datalist></div>
      <div class="field"><label for="tl-body">메모 (선택)</label><textarea id="tl-body" maxlength="5000" value=${form.body} onInput=${set('body')}></textarea></div>
      ${error && html`<p class="error" role="alert">${error}</p>`}
      <div class="row">
        <button class="btn primary" type="submit" disabled=${busy}>${editing ? '고친 내용 저장' : '넣기'}</button>
        <button class="btn" type="button" onClick=${() => onDone()}>그만두기</button>
      </div>
    </form>`;
}

function Entry({ item, people, projects, onEdit, reload }) {
  const mine = item.created_by === me().id;
  const run = (p, msg) => p.then(() => { if (msg) toast(msg); reload(); }).catch((e) => toast(errorMessage(e)));
  const remove = () => confirm(item.kind === 'mail' ? '이 메일을 타임라인에서 뺄까요? (메일함의 메일은 그대로 있습니다)' : `"${item.title}"을 지울까요?`)
    && run(pb.collection('timeline').delete(item.id), '지웠습니다');
  const who = item.kind === 'mail' ? item.mail_from : people.find((u) => u.id === item.created_by)?.name;
  const period = isPeriod(item);
  return html`
    <li class=${'entry kind-' + item.kind + (item.done ? ' is-done' : '')}>
      <div class="entry-time">${period ? '기간' : shownTime(item.at) || '종일'}</div>
      <div class="entry-main">
        <div class="row wrap">
          ${item.kind === 'schedule'
            ? html`<label class="entry-check"><input type="checkbox" checked=${item.done} onChange=${(e) => run(pb.collection('timeline').update(item.id, { done: e.target.checked }))} />
                <span class="row-title">${item.title}</span></label>`
            : html`<span class="tag">${KIND[item.kind]}</span><span class="row-title">${item.title}</span>`}
        </div>
        <div class="card-meta">
          ${period && html`<span>${md(kstDay(item.at))} ~ ${md(lastDay(item))}</span>`}
          ${who && html`<span>${who}</span>`}
          ${item.kind === 'mail'
            ? html`<label class="sr-only" for=${'p-' + item.id}>제작 건</label>
                <select id=${'p-' + item.id} class="mini-select" value=${item.project} onChange=${(e) => run(pb.collection('timeline').update(item.id, { project: e.target.value }), '제작 건에 넣었습니다')}>
                  <option value="">제작 건 없음</option>
                  ${projects.map((p) => html`<option value=${p}>${p}</option>`)}
                </select>`
            : item.project && html`<span class=${'project-chip ' + colorOf(item.project)}>${item.project}</span>`}
        </div>
        ${item.body && html`<p class="entry-body">${item.body}</p>`}
        <div class="msg-actions">
          ${item.link && html`<a class="link-btn" href=${item.link} target="_blank" rel="noopener noreferrer">Gmail에서 열기</a>`}
          ${item.kind !== 'mail' && html`<button class="link-btn" type="button" onClick=${() => onEdit(item)}>고치기</button>`}
          ${(mine || item.kind === 'mail') && html`<button class="link-btn" type="button" onClick=${remove}>지우기</button>`}
        </div>
      </div>
    </li>`;
}

// 한 칸: 일정(여러 날은 이어지는 막대)은 색 띠로, 메일·기록은 개수만
// 여러 날 일정마다 줄을 정해 둔다: 앞 막대가 끝나도 뒤 막대가 윗줄로 튀지 않게
function lanes(items) {
  const ends = [];
  const lane = new Map();
  for (const it of items.filter((x) => x.kind === 'schedule' && isPeriod(x)).sort((a, b) => (a.at < b.at ? -1 : 1))) {
    let i = ends.findIndex((last) => last < kstDay(it.at));
    if (i < 0) i = ends.length;
    ends[i] = lastDay(it);
    lane.set(it.id, i);
  }
  return lane;
}

function DayCell({ day, month, items, laneOf, selected, onPick }) {
  const today = todayKST();
  const plans = items.filter((it) => it.kind === 'schedule');
  const rows = []; // 막대는 제 줄에, 빈 줄은 null, 하루짜리는 그 아래
  for (const it of plans.filter(isPeriod)) rows[laneOf.get(it.id)] = it;
  for (let i = 0; i < rows.length; i++) rows[i] ??= null;
  rows.push(...plans.filter((it) => !isPeriod(it)).sort((a, b) => (a.at < b.at ? -1 : 1)));
  const mails = items.filter((it) => it.kind === 'mail').length;
  const notes = items.filter((it) => it.kind === 'note').length;
  const shown = rows.slice(0, 3);
  const hidden = plans.length - shown.filter(Boolean).length;
  const label = `${longDay(day)}, 일정 ${plans.length}개${mails ? `, 메일 ${mails}통` : ''}${notes ? `, 기록 ${notes}개` : ''}`;
  return html`
    <button type="button" aria-pressed=${selected} aria-label=${label} onClick=${() => onPick(day)}
      class=${'cal-day' + (day.slice(0, 7) !== month ? ' other' : '') + (day === today ? ' today' : '') + (selected ? ' sel' : '')}>
      <span class="cal-num">${+day.slice(8)}</span>
      ${shown.map((it) => {
        if (!it) return html`<span class="cal-chip gap" aria-hidden="true"> </span>`;
        const start = kstDay(it.at) === day;
        const end = lastDay(it) === day;
        const head = start || weekday(day) === 0; // 주가 바뀌면 이름을 다시 쓴다
        // 칸이 좁아 이름만 쓴다(시각은 날짜를 누르면 옆에 나온다)
        return html`<span class=${'cal-chip ' + colorOf(it.project) + (isPeriod(it) ? ' span' + (start ? ' s' : '') + (end ? ' e' : '') : '') + (it.done ? ' done' : '')}
          title=${it.title}>${head ? it.title : ' '}</span>`;
      })}
      ${hidden > 0 && html`<span class="cal-more">+${hidden}</span>`}
      ${(mails || notes) ? html`<span class="cal-count">${mails ? `메일 ${mails}` : ''}${mails && notes ? ' · ' : ''}${notes ? `기록 ${notes}` : ''}</span>` : null}
      <span class="cal-dots" aria-hidden="true">${plans.slice(0, 4).map((it) => html`<i class=${colorOf(it.project)}></i>`)}${mails ? html`<i class="mail"></i>` : null}</span>
    </button>`;
}

// 제작 트랙: 영상 편집 프로그램처럼 제작 건마다 줄을 두고 일정을 기간 막대로 놓는다. 오늘 위치에 빨간 재생선.
// 같은 줄에서 겹치는 일정은 아래 줄로 내린다(앞에서부터 빈 줄을 찾는다).
// 하루짜리는 이름이 옆 칸까지 보이게 두므로 이틀 자리를 비워 둔다
const reach = (it) => (isPeriod(it) ? lastDay(it) : addDays(kstDay(it.at), 1));
function packRows(list) {
  const rows = [];
  for (const it of [...list].sort((a, b) => (a.at < b.at ? -1 : 1))) {
    const row = rows.find((r) => reach(r.at(-1)) < kstDay(it.at));
    if (row) row.push(it); else rows.push([it]);
  }
  return rows.length ? rows : [[]];
}

function Tracks({ days, items, sel, onPick }) {
  const today = todayKST();
  const n = days.length;
  const col = (d) => days.indexOf(d) + 1;
  const place = (it) => `${col(kstDay(it.at)) || 1} / ${(col(lastDay(it)) || n) + 1}`;
  const names = [...new Set(items.map((it) => it.project))].sort((a, b) => (!a) - (!b) || a.localeCompare(b));
  const ti = col(today);
  return html`
    <div class="trk-wrap">
      <div class="trk" style=${`--n:${n}`}>
        <span class="trk-corner"></span>
        ${days.map((d, i) => html`<button type="button" class=${'trk-day' + (weekday(d) === 0 ? ' sun' : '') + (d === today ? ' today' : '') + (d === sel ? ' sel' : '')}
          aria-pressed=${d === sel} aria-label=${longDay(d)} onClick=${() => onPick(d)}><span>${d === today ? '오늘' : WEEK[weekday(d)]}</span><b>${i === 0 || d.endsWith('-01') ? md(d) : +d.slice(8)}</b></button>`)}
        ${names.map((p) => {
          const mine = items.filter((it) => it.project === p);
          const marks = days.map((d) => [d, mine.filter((it) => it.kind !== 'schedule' && kstDay(it.at) === d).length]).filter(([, c]) => c);
          return html`
            <span class=${'trk-name ' + colorOf(p)}><i></i>${p || '제작 건 없음'}</span>
            ${packRows(mine.filter((it) => it.kind === 'schedule')).map((row, i) => html`
              ${i > 0 && html`<span class="trk-name sub"></span>`}
              <div class="trk-lane">${row.map((it) => html`<button type="button" class=${'trk-clip ' + colorOf(p) + (isPeriod(it) ? '' : ' one') + (it.done ? ' done' : '')} style=${`grid-column:${place(it)}`}
                title=${it.title} onClick=${() => onPick(col(kstDay(it.at)) ? kstDay(it.at) : days[0])}>${it.title}</button>`)}</div>`)}
            ${marks.length > 0 && html`
              <span class="trk-name sub">메일·기록</span>
              <div class="trk-lane">${marks.map(([d, c]) => html`<button type="button" class="trk-mk" style=${`grid-column:${col(d)}`} aria-label=${`${longDay(d)} 메일·기록 ${c}개`} onClick=${() => onPick(d)}>${c}</button>`)}</div>`}`;
        })}
        ${names.length === 0 && html`<p class="trk-empty">이 기간에는 일정이 없습니다</p>`}
        ${ti > 0 && html`<span class="trk-play" style=${`--x:${(ti - 0.5) / n}`} aria-hidden="true"></span>`}
      </div>
    </div>`;
}

const monday = (d) => addDays(d, -((weekday(d) + 6) % 7));

export function Screen() {
  const today = todayKST();
  const [view, setView] = useState(() => { try { return localStorage.getItem('schedule-view') || 'tracks'; } catch { return 'tracks'; } });
  const [span, setSpan] = useState(14);
  const [from, setFrom] = useState(() => monday(today));
  const [month, setMonth] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(today);
  const [project, setProject] = useState('');
  const [monthItems, setMonthItems] = useState([]);
  const [dayItems, setDayItems] = useState(null);
  const [projects, setProjects] = useState([]);
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState(null); // null | { editing } | { day }
  const [error, setError] = useState('');
  const days = view === 'month' ? monthDays(month) : Array.from({ length: span }, (_, i) => addDays(from, i));

  const load = useCallback(() => {
    const only = project ? pb.filter(' && project = {:p}', { p: project }) : '';
    const tl = pb.collection('timeline');
    Promise.all([
      // 달력 칸에는 이름·날짜만 필요하다
      tl.getFullList({ filter: overlap(days[0], addDays(days.at(-1), 1)) + only, fields: 'id,kind,title,at,end,project,done', sort: 'at' }),
      tl.getFullList({ filter: overlap(sel, addDays(sel, 1)) + only, sort: 'at' }),
      tl.getFullList({ filter: "project != ''", fields: 'project' }),
    ]).then(([inMonth, inDay, ps]) => {
      setMonthItems(inMonth);
      setDayItems(inDay);
      setProjects([...new Set(ps.map((r) => r.project))].sort());
    }).catch((e) => setError(errorMessage(e)));
  }, [view, span, from, month, sel, project]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { users().then(setPeople).catch(() => {}); }, []);
  useEffect(() => {
    // 다른 사람이 넣거나 메일이 들어오면 바로 다시 불러온다
    const unsub = pb.collection('timeline').subscribe('*', () => load());
    return () => unsub.then((off) => off()).catch(() => {});
  }, [load]);

  const pick = (day) => {
    setSel(day);
    setForm(null);
    if (day.slice(0, 7) !== month) setMonth(day.slice(0, 7));
    if (view === 'tracks' && (day < from || day > addDays(from, span - 1))) setFrom(monday(day));
  };
  const goMonth = (n) => {
    if (view === 'tracks') {
      const next = addDays(from, n * 7);
      setFrom(next);
      return pick(next <= today && today <= addDays(next, span - 1) ? today : next);
    }
    const next = shiftMonth(month, n);
    setMonth(next);
    setSel(next === today.slice(0, 7) ? today : next + '-01');
    setForm(null);
  };
  const switchView = (v) => {
    setView(v);
    try { localStorage.setItem('schedule-view', v); } catch { /* 저장 못 해도 이번에는 바뀐다 */ }
  };
  const laneOf = lanes(monthItems);
  const itemsOn = (day) => monthItems.filter((it) => kstDay(it.at) <= day && lastDay(it) >= day);
  const shown = new Set(monthItems.filter((it) => it.project).map((it) => it.project));
  const [y, m] = month.split('-');

  return html`
    <${TaskTabs} current="schedule" />
    <div class="page-head">
      <h1>일정 · 타임라인</h1>
      <div class="field m-0">
        <label for="tl-filter">제작 건</label>
        <select id="tl-filter" value=${project} onChange=${(e) => setProject(e.target.value)}>
          <option value="">모두 보기</option>
          ${projects.map((p) => html`<option value=${p}>${p}</option>`)}
        </select>
      </div>
    </div>
    ${error && html`<p class="error" role="alert">${error}</p>`}
    <div class="cal-layout">
      <section class="panel cal-panel">
        <div class="cal-bar">
          <div class="seg" role="group" aria-label="보기">
            ${[['tracks', '타임라인'], ['month', '달력']].map(([v, l]) => html`<button type="button" aria-pressed=${view === v} onClick=${() => switchView(v)}>${l}</button>`)}
          </div>
          <button class="btn ghost icon" type="button" aria-label=${view === 'month' ? '지난달' : '지난주'} onClick=${() => goMonth(-1)}><${Icon} name="back" /></button>
          <h2 class="cal-title" aria-live="polite">${view === 'month' ? `${y}년 ${+m}월` : `${md(days[0])} – ${md(days.at(-1))}`}</h2>
          <button class="btn ghost icon flip" type="button" aria-label=${view === 'month' ? '다음 달' : '다음 주'} onClick=${() => goMonth(1)}><${Icon} name="back" /></button>
          <span class="spacer"></span>
          ${view === 'tracks' && html`<div class="seg" role="group" aria-label="보이는 기간">
            ${[[7, '1주'], [14, '2주'], [21, '3주']].map(([n, l]) => html`<button type="button" aria-pressed=${span === n} onClick=${() => setSpan(n)}>${l}</button>`)}
          </div>`}
          ${(month !== today.slice(0, 7) || sel !== today || from !== monday(today)) && html`<button class="btn" type="button" onClick=${() => { setFrom(monday(today)); pick(today); }}>오늘</button>`}
        </div>
        ${view === 'month' ? html`
          <div class="cal">
            ${WEEK.map((w) => html`<span class="cal-head" aria-hidden="true">${w}</span>`)}
            ${days.map((d) => html`<${DayCell} key=${d} day=${d} month=${month} items=${itemsOn(d)} laneOf=${laneOf} selected=${d === sel} onPick=${pick} />`)}
          </div>` : html`<${Tracks} days=${days} items=${monthItems} sel=${sel} onPick=${pick} />`}
        ${shown.size > 0 && html`<p class="cal-legend">${[...shown].sort().map((p) => html`<span class=${'project-chip ' + colorOf(p)}>${p}</span>`)}</p>`}
      </section>

      <section class="stack">
        ${form
          ? html`<${EntryForm} key=${form.editing?.id || 'new-' + form.day} editing=${form.editing} day=${form.day} projects=${projects}
              onDone=${(day) => { setForm(null); if (day) pick(day); load(); }} />`
          : html`<button class="btn primary add-day" type="button" onClick=${() => setForm({ day: sel })}><${Icon} name="plus" />${md(sel)} 일정·기록 넣기</button>`}
        <div class="panel panel-pad">
          <h2 class="section-title">${sel === today ? '오늘 · ' : ''}${longDay(sel)}</h2>
          ${dayItems === null ? html`<p class="empty">불러오는 중…</p>`
            : dayItems.length === 0 ? html`<p class="empty">이날은 비어 있습니다</p>`
            : html`<ul class="list entries">${dayItems.map((it) => html`<${Entry} key=${it.id} item=${it} people=${people} projects=${projects}
                reload=${load} onEdit=${(e) => { setForm({ editing: e }); scrollTo({ top: 0, behavior: 'smooth' }); }} />`)}</ul>`}
        </div>
      </section>
    </div>`;
}
