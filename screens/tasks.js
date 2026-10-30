import { html, useState, useEffect, useCallback, useRef } from '../vendor/preact-htm.js';
import { pb, me, users, fileURL } from '../pb.js';
import { Icon } from '../icons.js';
import { toast } from '../app.js';
import { errorMessage } from '../lib/errors.js';
import { sendLimitError, displayName } from '../lib/files.js';
import { todayKST, shortWhen } from '../lib/dates.js';
import { loadDraft, saveDraft, sendWithDraft } from '../lib/drafts.js';
import { assigneeOptions } from '../lib/team.js';

export const STATUS = [
  { key: 'todo', label: '할 일' },
  { key: 'doing', label: '진행 중' },
  { key: 'done', label: '완료' },
];

const nameOf = (list, id) => list.find((u) => u.id === id)?.name || '';

// 휴대폰 아래 메뉴에는 "할 일" 하나만 있어서, 일정으로 가는 길을 위에 둔다
export function TaskTabs({ current }) {
  return html`
    <nav class="subnav" aria-label="할 일 메뉴">
      <a href="#/tasks" aria-current=${current === 'tasks' ? 'page' : undefined}>할 일</a>
      <a href="#/schedule" aria-current=${current === 'schedule' ? 'page' : undefined}>일정 · 타임라인</a>
    </nav>`;
}

function Due({ due, status }) {
  if (!due) return null;
  const day = due.slice(0, 10);
  const late = status !== 'done' && day < todayKST();
  return html`<span class=${late ? 'late' : 'muted'}>${late ? '마감 지남 ' : '마감 '}${day.slice(5).replace('-', '/')}</span>`;
}

function Board() {
  const [tasks, setTasks] = useState(null);
  const [people, setPeople] = useState([]);
  const [col, setCol] = useState('todo');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    pb.collection('tasks').getFullList({ sort: '-updated' }).then(setTasks).catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    load();
    users().then(setPeople).catch(() => {});
    const unsub = pb.collection('tasks').subscribe('*', load);
    return () => unsub.then((off) => off()).catch(() => {});
  }, [load]);

  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await pb.collection('tasks').create({ title: title.trim(), status: 'todo', created_by: me().id });
      setTitle('');
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return html`
    <${TaskTabs} current="tasks" />
    <div class="page-head"><h1>할 일</h1></div>
    <form class="row add-row" onSubmit=${add}>
      <label for="new-task" class="sr-only">새 할 일</label>
      <input id="new-task" placeholder="새 할 일 제목" value=${title} onInput=${(e) => setTitle(e.target.value)} enterkeyhint="done" />
      <button class="btn primary" type="submit"><${Icon} name="plus" />추가</button>
    </form>
    ${error && html`<p class="error" role="alert">${error}</p>`}

    <div class="seg board-pick" role="group" aria-label="보여 줄 칸">
      ${STATUS.map((s) => html`<button type="button" aria-pressed=${col === s.key} onClick=${() => setCol(s.key)}>
        ${s.label} <span class="num">${tasks ? tasks.filter((t) => t.status === s.key).length : ''}</span></button>`)}
    </div>

    <div class="board">
      ${STATUS.map((s) => {
        const list = (tasks || []).filter((t) => t.status === s.key);
        return html`
          <section class=${'column' + (col === s.key ? ' on' : '')} aria-label=${s.label}>
            <h2 class="column-head">${s.label} <span class="num muted">${list.length}</span></h2>
            ${tasks === null ? html`<p class="empty">불러오는 중…</p>`
              : list.length === 0 ? html`<p class="empty">${s.key === 'todo' ? '위에서 할 일을 추가해 보세요' : '비어 있음'}</p>`
              : list.map((t) => html`
                <a class="card" href=${'#/tasks/' + t.id}>
                  <span class="card-title">${t.title}</span>
                  <span class="card-meta">
                    <span>${nameOf(people, t.assignee) || '담당자 없음'}</span>
                    <${Due} due=${t.due} status=${t.status} />
                    ${t.files?.length ? html`<span class="muted row"><${Icon} name="clip" /><span class="num">${t.files.length}</span></span>` : null}
                  </span>
                </a>`)}
          </section>`;
      })}
    </div>`;
}

function Detail({ id }) {
  const [task, setTask] = useState(null);
  const [form, setForm] = useState(null);
  const [people, setPeople] = useState([]);
  const [comments, setComments] = useState([]);
  const [links, setLinks] = useState({});
  const [comment, setComment] = useState(loadDraft('comment:' + id) || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 저장하지 않은 입력이 있으면 상태 변경·파일 올리기 뒤 다시 불러와도 덮어쓰지 않는다
  const dirty = useRef(false);

  const load = useCallback(async () => {
    try {
      const t = await pb.collection('tasks').getOne(id);
      setTask(t);
      if (!dirty.current) setForm({ title: t.title, description: t.description, assignee: t.assignee, due: t.due ? t.due.slice(0, 10) : '' });
      const urls = {};
      for (const f of t.files || []) urls[f] = await fileURL(t, f);
      setLinks(urls);
      setComments(await pb.collection('comments').getFullList({ filter: pb.filter('task = {:id}', { id }), sort: 'created' }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    load();
    users().then(setPeople).catch(() => {});
  }, [load]);

  if (error && !task) return html`<a class="back" href="#/tasks"><${Icon} name="back" />할 일 목록</a><p class="error" role="alert">${error}</p>`;
  if (!task || !form) return html`<p class="empty">불러오는 중…</p>`;

  const set = (k) => (e) => {
    dirty.current = true;
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function update(data, done) {
    setBusy(true);
    setError('');
    try {
      await pb.collection('tasks').update(id, data);
      await load();
      if (done) toast(done);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function save(e) {
    e.preventDefault();
    if (!form.title.trim()) return setError('제목을 적어 주세요');
    dirty.current = false;
    update({ title: form.title.trim(), description: form.description, assignee: form.assignee, due: form.due ? form.due + ' 00:00:00.000Z' : '' }, '저장했습니다');
  }

  function addFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const limit = sendLimitError(files);
    if (limit) return setError(limit);
    const data = new FormData();
    files.forEach((f) => data.append('files+', f));
    update(data, '파일을 올렸습니다');
  }

  async function addComment(e) {
    e.preventDefault();
    const body = comment.trim();
    if (!body) return;
    try {
      await sendWithDraft('comment:' + id, body, () => pb.collection('comments').create({ task: id, author: me().id, body }));
      setComment('');
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove() {
    if (!confirm(`"${task.title}"을(를) 지울까요? 첨부파일과 댓글도 함께 지워집니다.`)) return;
    try {
      await pb.collection('tasks').delete(id);
      toast('할 일을 지웠습니다');
      location.hash = '#/tasks';
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return html`
    <a class="back" href="#/tasks"><${Icon} name="back" />할 일 목록</a>
    <div class="detail">
      <form class="panel panel-pad" onSubmit=${save}>
        <div class="field">
          <label for="t-title">제목</label>
          <input id="t-title" value=${form.title} onInput=${set('title')} />
        </div>
        <div class="field">
          <span class="label">상태</span>
          <div class="seg" role="group" aria-label="상태">
            ${STATUS.map((s) => html`<button type="button" aria-pressed=${task.status === s.key} disabled=${busy}
              onClick=${() => task.status !== s.key && update({ status: s.key }, `"${s.label}"(으)로 옮겼습니다`)}>${s.label}</button>`)}
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="t-assignee">담당자</label>
            <select id="t-assignee" value=${form.assignee} onChange=${set('assignee')}>
              <option value="">담당자 없음</option>
              ${assigneeOptions(people, task.assignee).map((p) => html`<option value=${p.id}>${p.label}</option>`)}
            </select>
          </div>
          <div class="field">
            <label for="t-due">마감일</label>
            <input id="t-due" type="date" value=${form.due} onInput=${set('due')} />
          </div>
        </div>
        <div class="field">
          <label for="t-desc">설명</label>
          <textarea id="t-desc" value=${form.description} onInput=${set('description')}></textarea>
        </div>
        ${error && html`<p class="error" role="alert">${error}</p>`}
        <div class="row">
          <button class="btn primary" type="submit" disabled=${busy}>저장</button>
          <span class="spacer"></span>
          ${task.created_by === me()?.id && html`<button class="btn danger" type="button" onClick=${remove}><${Icon} name="trash" />지우기</button>`}
        </div>
        <p class="small muted mt-12">${nameOf(people, task.created_by)} 님이 만듦, 마지막 수정 ${shortWhen(task.updated)}</p>
      </form>

      <div class="stack">
        <section class="panel">
          <div class="panel-pad row">
            <h2 class="section-title">첨부파일</h2><span class="spacer"></span>
            <label class="btn small" for="t-files"><${Icon} name="clip" />파일 올리기</label>
            <input id="t-files" class="sr-only" type="file" multiple onChange=${addFiles} />
          </div>
          ${(task.files || []).length === 0 ? html`<p class="empty">결과물 파일을 올려 팀과 나눠 보세요</p>` : html`
            <ul class="list">
              ${[...task.files].reverse().map((f) => html`
                <li><a class="row-link" href=${links[f]} download=${displayName(task, f)}>
                  <${Icon} name="download" /><span>${displayName(task, f)}</span></a></li>`)}
            </ul>`}
        </section>

        <section class="panel">
          <div class="panel-pad"><h2 class="section-title">댓글 <span class="num muted">${comments.length}</span></h2></div>
          <ul class="list">
            ${comments.map((c) => html`
              <li class="comment"><strong>${nameOf(people, c.author)}</strong> <span class="small muted">${shortWhen(c.created)}</span>
                <p>${c.body}</p></li>`)}
          </ul>
          <form class="panel-pad" onSubmit=${addComment}>
            <label for="t-comment" class="sr-only">댓글</label>
            <textarea id="t-comment" placeholder="댓글을 남기면 담당자와 만든 사람에게 알림이 갑니다" value=${comment}
              onInput=${(e) => { setComment(e.target.value); saveDraft('comment:' + id, e.target.value); }}></textarea>
            <button class="btn mt-8" type="submit">댓글 남기기</button>
          </form>
        </section>
      </div>
    </div>`;
}

export function Screen({ params }) {
  return params[0] ? html`<${Detail} id=${params[0]} />` : html`<${Board} />`;
}
