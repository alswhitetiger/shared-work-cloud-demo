import { html, useState, useEffect, useRef, useCallback } from '../vendor/preact-htm.js';
import * as Y from '../vendor/yjs.mjs';
import { pb, me, users } from '../pb.js';
import { Icon } from '../icons.js';
import { toast } from '../app.js';
import { errorMessage } from '../lib/errors.js';
import { shortWhen } from '../lib/dates.js';
import { diffText, applyDiff } from '../lib/textsync.js';
import { DocSession } from '../lib/docsync.js';

const HERE_MS = 15000;      // "보고 있음" 알림 간격
const MAX_INSERT = 300_000; // 한 번에 붙여 넣을 수 있는 글자 수(서버의 변경분 크기 한도 안)

export function DocTabs({ current }) {
  return html`
    <nav class="subnav" aria-label="문서 메뉴">
      <a href="#/docs" aria-current=${current === 'docs' ? 'page' : undefined}>문서</a>
      <a href="#/files" aria-current=${current === 'files' ? 'page' : undefined}>자료실</a>
    </nav>`;
}

// PocketBase로 서버와 이야기하는 부분(동기화 규칙은 lib/docsync.js)
function pbDocApi(id) {
  const filter = pb.filter('doc = {:id}', { id });
  return {
    getDoc: () => pb.collection('docs').getOne(id, { fields: 'rev,state' }),
    listUpdates: () => pb.collection('doc_updates').getFullList({ filter, sort: 'created', fields: 'id,data' }),
    subscribe: async (onEvent, onReconnect) => {
      const offUpdates = await pb.collection('doc_updates').subscribe('*', (e) => onEvent(e.action, e.record), { filter, fields: 'id,data' });
      // 연결이 끊겼다 다시 붙으면 그 사이 변경을 놓쳤을 수 있으니 처음부터 맞춘다
      const offConnect = await pb.realtime.subscribe('PB_CONNECT', onReconnect);
      return () => { offUpdates(); offConnect(); };
    },
    createUpdate: (data, opts = {}) => pb.collection('doc_updates').create({ doc: id, author: me().id, data }, { fields: 'id', ...opts }),
    compact: (body) => pb.send(`/api/team/docs/${id}/compact`, { method: 'POST', body }),
  };
}

// ---------- 입력칸 ↔ 공유 글. 한글 조합 중에는 다른 사람의 변경을 잠시 미뤄 글자가 깨지지 않게 한다 ----------
function bindTextarea(el, ytext, onReject) {
  const doc = ytext.doc;
  const rel = (i) => Y.createRelativePositionFromTypeIndex(ytext, i);
  const abs = (r) => (r ? Y.createAbsolutePositionFromRelativePosition(r, doc)?.index : null);
  let last = ytext.toString();
  let sel = [rel(0), rel(0)];
  let composing = false, compStart = 0, compRel = null, remoteWhileComposing = false;
  el.value = last;

  const saveSel = () => { sel = [rel(el.selectionStart), rel(el.selectionEnd)]; };
  const render = () => {
    const s = abs(sel[0]), e = abs(sel[1]);
    last = ytext.toString();
    el.value = last;
    if (document.activeElement === el && s != null && e != null) el.setSelectionRange(s, e);
  };
  const sync = () => {
    const change = diffText(last, el.value);
    if (change && change.insert.length > MAX_INSERT) {
      el.value = last; // 너무 큰 붙여 넣기는 받지 않는다
      onReject();
      return;
    }
    if (change) {
      if (remoteWhileComposing && compRel) change.index += (abs(compRel) ?? compStart) - compStart;
      applyDiff(ytext, change, 'local');
      if (remoteWhileComposing) sel = [rel(change.index + change.insert.length), rel(change.index + change.insert.length)];
    }
    remoteWhileComposing = false;
    compRel = null;
    if (el.value !== ytext.toString()) render();
    else { last = el.value; saveSel(); }
  };

  const onInput = (e) => { if (!e.isComposing && !composing) sync(); };
  const onCompStart = () => { composing = true; compStart = el.selectionStart; compRel = rel(compStart); };
  const onCompEnd = () => { composing = false; sync(); };
  const onSel = () => { if (!composing) saveSel(); };
  const observer = (_, tr) => {
    if (tr.origin === 'local') return;
    if (composing) remoteWhileComposing = true;
    else render();
  };
  el.addEventListener('input', onInput);
  el.addEventListener('compositionstart', onCompStart);
  el.addEventListener('compositionend', onCompEnd);
  ['select', 'keyup', 'click', 'focus'].forEach((t) => el.addEventListener(t, onSel));
  ytext.observe(observer);
  return {
    render,
    destroy() {
      el.removeEventListener('input', onInput);
      el.removeEventListener('compositionstart', onCompStart);
      el.removeEventListener('compositionend', onCompEnd);
      ['select', 'keyup', 'click', 'focus'].forEach((t) => el.removeEventListener(t, onSel));
      ytext.unobserve(observer);
    },
  };
}

const STATUS = {
  saved: '저장됨', saving: '저장하는 중…',
  offline: '연결이 끊겼습니다. 이 창을 닫지 않으면 다시 연결될 때 보냅니다',
  error: '저장하지 못했습니다. 다시 시도하는 중…',
  failed: '저장하지 못했습니다. 고친 내용을 복사해 두고 새로고침해 주세요',
};

function Versions({ docId, session, binding, nameOf, onClose }) {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    pb.collection('doc_versions').getList(1, 50, { filter: pb.filter('doc = {:id}', { id: docId }), sort: '-created' })
      .then((r) => setList(r.items)).catch(() => setList([]));
  }, [docId]);
  async function restore(v) {
    if (!confirm(`${shortWhen(v.created)} 내용으로 되돌릴까요? 지금 내용은 버전 기록에 남습니다.`)) return;
    await session.restore(v.text);
    binding.render();
    toast('되돌렸습니다');
    onClose();
  }
  return html`
    <aside class="panel versions" aria-label="버전 기록">
      <div class="panel-pad row"><h2 class="section-title">버전 기록</h2><span class="spacer"></span>
        <button class="btn small ghost" type="button" onClick=${onClose}>닫기</button></div>
      <p class="section-desc panel-pad pad-top-0">저장할 때 10분에 한 번씩 남기고, 되돌리기 직전 내용도 남깁니다(최근 50개).</p>
      ${list === null ? html`<p class="empty">불러오는 중…</p>`
        : list.length === 0 ? html`<p class="empty">아직 남은 버전이 없습니다</p>`
        : html`<ul class="list">${list.map((v) => html`
          <li class="version">
            <div class="row"><span class="spacer"><strong class="num">${shortWhen(v.created)}</strong> <span class="small muted">${nameOf(v.saved_by)}</span></span>
              <button class="link-btn" type="button" aria-expanded=${open === v.id} onClick=${() => setOpen(open === v.id ? null : v.id)}>${open === v.id ? '접기' : '보기'}</button>
              <button class="link-btn" type="button" onClick=${() => restore(v)}>되돌리기</button></div>
            ${open === v.id && html`<pre class="version-text">${v.text || '(빈 문서)'}</pre>`}
          </li>`)}</ul>`}
    </aside>`;
}

function Editor({ id }) {
  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('saved');
  const [here, setHere] = useState([]);
  const [people, setPeople] = useState([]);
  const [showVersions, setShowVersions] = useState(false);
  const [error, setError] = useState('');
  const areaRef = useRef(null);
  const sessionRef = useRef(null);
  const bindingRef = useRef(null);
  const nameOf = (uid) => people.find((p) => p.id === uid)?.name || '';

  useEffect(() => {
    let alive = true;
    let session;
    users().then(setPeople).catch(() => {});
    (async () => {
      try {
        const d = await pb.collection('docs').getOne(id);
        if (!alive) return;
        session = new DocSession(d, pbDocApi(id), setStatus);
        await session.start();
        if (!alive) return session.stop();
        sessionRef.current = session;
        setDoc(d);
        setTitle(d.title);
      } catch (e) {
        alive && setError(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
      bindingRef.current?.destroy();
      bindingRef.current = null;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, [id]);

  // 입력칸이 그려진 뒤 공유 글과 잇는다
  useEffect(() => {
    if (doc && areaRef.current && sessionRef.current && !bindingRef.current) {
      bindingRef.current = bindTextarea(areaRef.current, sessionRef.current.ytext, () => toast('한 번에 붙여 넣을 수 있는 글은 30만 자까지입니다'));
    }
  }, [doc]);

  // 보내지 못한 글이 있는데 창을 닫으려 하면 알리고, 닫히는 순간 남은 글을 보낸다
  useEffect(() => {
    if (!doc) return;
    const warn = (e) => { if (sessionRef.current?.hasPending()) { e.preventDefault(); e.returnValue = ''; } };
    const leave = () => sessionRef.current?.flush({ keepalive: true });
    addEventListener('beforeunload', warn);
    addEventListener('pagehide', leave);
    return () => { removeEventListener('beforeunload', warn); removeEventListener('pagehide', leave); };
  }, [doc]);

  // 함께 보고 있는 사람
  useEffect(() => {
    if (!doc) return;
    const ping = () => pb.send(`/api/team/docs/${id}/here`, { method: 'POST' }).then((r) => setHere(r.people)).catch(() => {});
    ping();
    const t = setInterval(ping, HERE_MS);
    return () => clearInterval(t);
  }, [doc, id]);

  // 다른 사람이 제목을 바꾸거나 문서를 지우면 반영
  useEffect(() => {
    if (!doc) return;
    const unsub = pb.collection('docs').subscribe(id, (e) => {
      if (e.action === 'delete') { toast('문서가 지워졌습니다'); location.hash = '#/docs'; }
      else if (document.activeElement?.id !== 'doc-title') setTitle(e.record.title);
    }, { fields: 'id,title' }); // 합친 상태(최대 20MB)를 매번 받지 않게
    return () => unsub.then((off) => off()).catch(() => {});
  }, [doc, id]);

  async function saveTitle() {
    const t = title.trim();
    if (!t) return setTitle(doc.title);
    if (t === doc.title) return;
    try {
      setDoc(await pb.collection('docs').update(id, { title: t }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove() {
    if (!confirm(`"${doc.title}" 문서를 지울까요? 모든 버전 기록도 함께 지워집니다.`)) return;
    try {
      await pb.collection('docs').delete(id);
      toast('문서를 지웠습니다');
      location.hash = '#/docs';
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error && !doc) return html`<a class="back" href="#/docs"><${Icon} name="back" />문서 목록</a><p class="error" role="alert">${error}</p>`;
  if (!doc) return html`<p class="empty">불러오는 중…</p>`;

  const others = here.filter((p) => p.id !== me().id);
  return html`
    <a class="back" href="#/docs"><${Icon} name="back" />문서 목록</a>
    <div class=${'doc-layout' + (showVersions ? ' with-side' : '')}>
      <section class="panel doc-sheet">
        <div class="doc-bar">
          <label class="sr-only" for="doc-title">문서 제목</label>
          <input id="doc-title" class="doc-title" maxlength="200" value=${title} onInput=${(e) => setTitle(e.target.value)}
            onBlur=${saveTitle} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />
          <div class="row wrap doc-meta">
            <span class=${'doc-status small' + (status === 'offline' || status === 'error' ? ' warn' : '')} role="status">${STATUS[status]}</span>
            <span class="spacer"></span>
            ${others.length > 0 && html`<span class="small muted">함께 보는 중: <strong>${others.map((p) => p.name).join(', ')}</strong></span>`}
            <button class="btn small ghost" type="button" aria-expanded=${showVersions} onClick=${() => setShowVersions(!showVersions)}><${Icon} name="history" />버전 기록</button>
            ${doc.created_by === me().id && html`<button class="btn small ghost danger" type="button" onClick=${remove}><${Icon} name="trash" />지우기</button>`}
          </div>
        </div>
        <label class="sr-only" for="doc-body">문서 내용</label>
        <textarea id="doc-body" class="doc-body" ref=${areaRef} placeholder="여기에 내용을 적으면 팀원에게 바로 보입니다…" spellcheck="false"></textarea>
      </section>
      ${showVersions && html`<${Versions} docId=${id} session=${sessionRef.current} binding=${bindingRef.current} nameOf=${nameOf} onClose=${() => setShowVersions(false)} />`}
    </div>`;
}

function List() {
  const [docs, setDocs] = useState(null);
  const [people, setPeople] = useState([]);
  const [q, setQ] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    pb.collection('docs').getList(1, 200, { sort: '-created', fields: 'id,title,created,created_by,text:excerpt(120,true)' })
      .then((r) => setDocs(r.items)).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    load();
    users().then(setPeople).catch(() => {});
    const unsub = pb.collection('docs').subscribe('*', load, { fields: 'id' });
    return () => unsub.then((off) => off()).catch(() => {});
  }, [load]);

  async function create(e) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const d = await pb.collection('docs').create({ title: title.trim(), created_by: me().id });
      location.hash = '#/docs/' + d.id;
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const nameOf = (uid) => people.find((p) => p.id === uid)?.name || '';
  const needle = q.trim().toLowerCase();
  const shown = (docs || []).filter((d) => !needle || d.title.toLowerCase().includes(needle) || (d.text || '').toLowerCase().includes(needle));
  return html`
    <${DocTabs} current="docs" />
    <div class="page-head"><h1>문서</h1></div>
    <form class="row add-row" onSubmit=${create}>
      <label for="new-doc" class="sr-only">새 문서 제목</label>
      <input id="new-doc" placeholder="새 문서 제목…" value=${title} onInput=${(e) => setTitle(e.target.value)} enterkeyhint="done" />
      <button class="btn primary" type="submit"><${Icon} name="plus" />만들기</button>
    </form>
    <div class="search">
      <${Icon} name="search" />
      <label for="doc-q" class="sr-only">문서 찾기</label>
      <input id="doc-q" type="search" placeholder="제목이나 내용으로 찾기…" value=${q} onInput=${(e) => setQ(e.target.value)} enterkeyhint="search" />
    </div>
    ${error && html`<p class="error" role="alert">${error}</p>`}
    <div class="panel mt-16">
      ${docs === null ? html`<p class="empty">불러오는 중…</p>`
        : shown.length === 0 ? html`<p class="empty">${needle ? `"${q}"이(가) 들어간 문서가 없습니다` : '아직 문서가 없습니다. 위에서 제목을 적고 만들어 보세요'}</p>`
        : html`<ul class="list">${shown.map((d) => html`
          <li><a class="row-link stacked" href=${'#/docs/' + d.id}>
            <span class="row-title"><${Icon} name="doc" /> ${d.title}</span>
            ${d.text && html`<span class="small muted doc-excerpt">${d.text}</span>`}
            <span class="small muted">${nameOf(d.created_by)} 님이 만듦, ${shortWhen(d.created)}</span>
          </a></li>`)}</ul>`}
    </div>`;
}

export function Screen({ params }) {
  return params[0] ? html`<${Editor} id=${params[0]} />` : html`<${List} />`;
}
