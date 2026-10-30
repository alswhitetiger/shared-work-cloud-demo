import { html, useState, useEffect } from '../vendor/preact-htm.js';
import { pb, me, users } from '../pb.js';
import { Icon } from '../icons.js';
import { errorMessage } from '../lib/errors.js';
import { todayKST, longDay } from '../lib/dates.js';
import { teamStatus } from '../lib/team.js';
import { ClockCard, ClockPrompt, askedOn, loadMyShift } from './attendance.js';
import { shouldAskClockIn } from '../lib/attendance.js';

const TEAM_ROOM = 'r00000000000000';

export function Screen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [ask, setAsk] = useState(false);
  const today = todayKST();

  const load = () => {
    Promise.all([
      users(),
      pb.collection('reports').getFullList({ filter: pb.filter('date = {:today}', { today }) }),
      pb.collection('tasks').getFullList({ filter: "status != 'done'", sort: 'due' }),
      pb.collection('messages').getList(1, 3, { filter: pb.filter('room = {:room} && pinned = true', { room: TEAM_ROOM }), sort: '-updated' }),
      loadMyShift(),
    ])
      .then(([people, reports, tasks, pins, shift]) => {
        setData({ people, reports, tasks, pins: pins.items, shift });
        setAsk(shouldAskClockIn(shift, me().work_days, today, askedOn()));
      })
      .catch((e) => setError(errorMessage(e)));
  };
  useEffect(load, []);

  const user = me();
  if (error) return html`<p class="error" role="alert">${error}</p>`;
  if (!data) return html`<p class="empty">불러오는 중…</p>`;

  const mine = data.tasks.filter((t) => t.assignee === user.id);
  const reported = data.reports.some((r) => r.author === user.id);
  const team = teamStatus(data.people, data.reports, data.tasks);

  return html`
    ${ask && html`<${ClockPrompt} onChange=${load} />`}
    <div class="page-head">
      <div><h1>${user.name}님의 오늘</h1><p class="date-line">${longDay(today)}</p></div>
    </div>

    ${data.pins.length > 0 && html`
      <a class="notice" href=${'#/chat/' + TEAM_ROOM}>
        <${Icon} name="pin" />
        <span>${data.pins.map((p) => html`<span class="notice-line">${p.body || '파일 공지'}</span>`)}</span>
      </a>`}

    <div class="home-grid">
      <section class="panel">
        <div class="panel-pad row"><h2 class="section-title">내 할 일 <span class="num muted">${mine.length}</span></h2>
          <span class="spacer"></span><a class="small" href="#/tasks">전체 보기</a></div>
        ${mine.length === 0 ? html`<p class="empty">맡은 일이 없습니다</p>` : html`
          <ul class="list">${mine.map((t) => html`
            <li><a class="row-link stacked" href=${'#/tasks/' + t.id}>
              <span class="row-title">${t.title}</span>
              <span class="small muted">${t.status === 'doing' ? '진행 중' : '할 일'}${t.due ? `, 마감 ${t.due.slice(5, 10).replace('-', '/')}` : ''}</span>
            </a></li>`)}</ul>`}
      </section>

      <div class="stack">
      <${ClockCard} shift=${data.shift} onChange=${load} />
      <section class="panel panel-pad report-cta">
        <h2 class="section-title">오늘 보고</h2>
        ${reported
          ? html`<p>오늘 보고를 냈습니다. 오늘 안에는 고칠 수 있습니다.</p><a class="btn" href="#/reports">보고 보기</a>`
          : html`<p>아직 오늘 보고를 쓰지 않았습니다.</p><a class="btn primary" href="#/reports">오늘 보고 쓰기</a>`}
      </section>
      </div>
    </div>

    <section class="panel mt-16">
      <div class="panel-pad"><h2 class="section-title">팀 현황</h2></div>
      <table class="team-table">
        <thead><tr><th scope="col">이름</th><th scope="col">오늘 보고</th><th scope="col" class="num">진행 중</th></tr></thead>
        <tbody>${team.map((p) => html`
          <tr>
            <th scope="row">${p.name}${p.id === user.id ? ' (나)' : ''}</th>
            <td>${p.reported ? html`<span class="ok">냈음</span>` : html`<span class="muted">아직</span>`}</td>
            <td class="num">${p.doing}</td>
          </tr>`)}</tbody>
      </table>
    </section>`;
}
