import { html, useState, useEffect, useRef, useCallback } from '../vendor/preact-htm.js';
import { pb, me, users, fileURL } from '../pb.js';
import { Icon } from '../icons.js';
import { setChatDot, toast } from '../app.js';
import { loadRooms, markRead } from '../rooms.js';
import { errorMessage } from '../lib/errors.js';
import { sendLimitError, displayName, isImage } from '../lib/files.js';
import { shortWhen } from '../lib/dates.js';
import { loadDraft, saveDraft, sendWithDraft } from '../lib/drafts.js';
import { NEWEST_FIRST, BEFORE, before, prependOlder, mergeLatest } from '../lib/chat.js';

const PAGE = 50;
const ROOM_ICON = { team: 'chat', group: 'group', dm: 'user' };

function RoomList({ rooms, current, onNew }) {
  return html`
    <aside class="rooms panel" aria-label="대화 목록">
      <div class="panel-pad row"><h1 class="section-title">채팅</h1><span class="spacer"></span>
        <button class="btn small" type="button" onClick=${onNew}><${Icon} name="plus" />새 대화</button></div>
      ${rooms === null ? html`<p class="empty">불러오는 중…</p>` : html`
        <ul class="list">
          ${rooms.map((r) => html`
            <li><a class="row-link" href=${'#/chat/' + r.id} aria-current=${current === r.id ? 'page' : undefined}>
              <${Icon} name=${ROOM_ICON[r.kind]} />
              <span class="spacer">${r.title}${r.kind === 'group' && html` <span class="small muted num">${r.members.length}명</span>`}</span>
              ${r.unread > 0 && html`<span class="badge num" aria-label=${`안 읽은 메시지 ${r.unread}개`}>${r.unread > 99 ? '99+' : r.unread}</span>`}
            </a></li>`)}
        </ul>`}
    </aside>`;
}

// 사람 고르기: 그룹을 만들거나 멤버를 초대할 때 쓴다
function PeoplePicker({ people, chosen, onToggle }) {
  if (people.length === 0) return html`<p class="empty">고를 수 있는 팀원이 없습니다</p>`;
  return html`
    <ul class="list pick-list">
      ${people.map((p) => html`<li><label class="check-row">
        <input type="checkbox" checked=${chosen.includes(p.id)} onChange=${() => onToggle(p.id)} />
        <span>${p.name}</span></label></li>`)}
    </ul>`;
}

function NewChat({ onClose }) {
  const [mode, setMode] = useState('dm');
  const [people, setPeople] = useState(null);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    users().then((u) => setPeople(u.filter((p) => !p.disabled && p.id !== me().id))).catch((e) => setError(errorMessage(e)));
  }, []);

  async function start(user) {
    try {
      const room = await pb.send('/api/team/dm', { method: 'POST', body: { user } });
      onClose();
      location.hash = '#/chat/' + room.id;
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function createGroup(e) {
    e.preventDefault();
    if (!name.trim()) return setError('방 이름을 적어 주세요');
    try {
      const room = await pb.send('/api/team/rooms', { method: 'POST', body: { name: name.trim(), members: chosen } });
      onClose();
      toast('그룹방을 만들었습니다');
      location.hash = '#/chat/' + room.id;
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const toggle = (id) => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  return html`
    <div class="panel picker">
      <div class="panel-pad row"><h2 class="section-title">새 대화</h2><span class="spacer"></span>
        <button class="btn small ghost" type="button" onClick=${onClose}>닫기</button></div>
      <div class="panel-pad pad-top-0">
        <div class="seg seg-full" role="group" aria-label="대화 종류">
          <button type="button" aria-pressed=${mode === 'dm'} onClick=${() => { setMode('dm'); setError(''); }}>1:1 대화</button>
          <button type="button" aria-pressed=${mode === 'group'} onClick=${() => { setMode('group'); setError(''); }}>그룹방 만들기</button>
        </div>
      </div>
      ${error && html`<p class="error panel-pad" role="alert">${error}</p>`}
      ${mode === 'dm' ? html`
        <ul class="list">
          ${(people || []).map((p) => html`<li><button class="row-link plain" type="button" onClick=${() => start(p.id)}>
            <${Icon} name="user" />${p.name}</button></li>`)}
        </ul>
        ${people && people.length === 0 && html`<p class="empty">아직 다른 팀원이 없습니다. 설정에서 초대 코드를 확인해 공유해 보세요</p>`}`
      : html`
        <form onSubmit=${createGroup}>
          <div class="panel-pad pad-top-0">
            <label for="g-name">방 이름</label>
            <input id="g-name" maxlength="60" placeholder="예: 기획팀…" value=${name} onInput=${(e) => setName(e.target.value)} />
            <p class="label mt-16">함께할 사람 <span class="muted num">${chosen.length}명 선택</span></p>
          </div>
          <${PeoplePicker} people=${people || []} chosen=${chosen} onToggle=${toggle} />
          <div class="panel-pad"><button class="btn primary block" type="submit">그룹방 만들기</button></div>
        </form>`}
    </div>`;
}

// 그룹방 정보: 멤버 보기, 초대, 이름 바꾸기, 나가기(남을 내보낼 수는 없다)
function GroupPanel({ room, people, onChanged, onClose }) {
  const [name, setName] = useState(room.name);
  const [chosen, setChosen] = useState([]);
  const [error, setError] = useState('');
  const members = people.filter((p) => room.members.includes(p.id));
  const others = people.filter((p) => !p.disabled && !room.members.includes(p.id));

  async function update(data, done) {
    setError('');
    try {
      await pb.collection('rooms').update(room.id, data);
      toast(done);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function rename(e) {
    e.preventDefault();
    if (!name.trim()) return setError('방 이름을 적어 주세요');
    update({ name: name.trim() }, '방 이름을 바꿨습니다');
  }
  async function invite() {
    if (!chosen.length) return;
    await update({ 'members+': chosen }, `${chosen.length}명을 초대했습니다`);
    setChosen([]);
  }
  async function leave() {
    if (!confirm(`"${room.name}" 방에서 나갈까요? 다시 들어오려면 멤버가 초대해야 합니다.`)) return;
    try {
      await pb.collection('rooms').update(room.id, { 'members-': me().id });
      toast('방에서 나왔습니다');
      location.hash = '#/chat';
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const toggle = (id) => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  return html`
    <div class="group-panel">
      <div class="row"><h3 class="section-title">방 정보</h3><span class="spacer"></span>
        <button class="btn small ghost" type="button" onClick=${onClose}>닫기</button></div>
      <form class="row end mt-12" onSubmit=${rename}>
        <div class="field spacer m-0"><label for="room-name">방 이름</label>
          <input id="room-name" maxlength="60" value=${name} onInput=${(e) => setName(e.target.value)} /></div>
        <button class="btn" type="submit">이름 저장</button>
      </form>
      <p class="label mt-16">멤버 <span class="muted num">${members.length}명</span></p>
      <p class="member-names">${members.map((p) => p.name).join(', ')}</p>
      ${others.length > 0 && html`
        <p class="label mt-16">초대하기</p>
        <${PeoplePicker} people=${others} chosen=${chosen} onToggle=${toggle} />
        <button class="btn mt-8" type="button" disabled=${!chosen.length} onClick=${invite}>선택한 사람 초대</button>`}
      ${error && html`<p class="error" role="alert">${error}</p>`}
      <div class="mt-16"><button class="btn danger" type="button" onClick=${leave}>이 방에서 나가기</button></div>
    </div>`;
}

function Attachments({ message }) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let alive = true;
    Promise.all(message.files.map((f) => fileURL(message, f).then((u) => [f, u])))
      .then((pairs) => alive && setUrls(Object.fromEntries(pairs)))
      .catch(() => {});
    return () => { alive = false; };
  }, [message.id]);
  return message.files.map((f) => {
    const name = displayName(message, f);
    if (!urls[f]) return html`<span class="file-chip">${name}</span>`;
    return isImage(name)
      ? html`<a href=${urls[f]} target="_blank" rel="noopener"><img class="chat-img" src=${urls[f]} alt=${name} loading="lazy" /></a>`
      : html`<a class="file-chip" href=${urls[f]} download=${name}><${Icon} name="download" />${name}</a>`;
  });
}

function Conversation({ roomId, rooms, onRead }) {
  const [room, setRoom] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [pinnedOld, setPinnedOld] = useState([]);
  const [more, setMore] = useState(false);
  const [people, setPeople] = useState([]);
  const [text, setText] = useState(loadDraft('chat:' + roomId) || '');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { id, text }
  const [info, setInfo] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const nameOf = (id) => people.find((u) => u.id === id)?.name || '';

  // 입력창은 한 줄로 시작해 글이 늘면 160px까지 커지고, 그 뒤에만 스크롤이 생긴다
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, 160) + 'px';
    el.style.overflowY = el.scrollHeight + 2 > 160 ? 'auto' : 'hidden';
  }, [text, room]);

  const read = useCallback((list) => {
    const last = list[list.length - 1];
    if (last) markRead(roomId, last.created).then(onRead).catch(() => {});
  }, [roomId, onRead]);

  const reloadRoom = useCallback(() => {
    pb.collection('rooms').getOne(roomId).then(setRoom).catch(() => {});
    onRead();
  }, [roomId, onRead]);

  useEffect(() => {
    let alive = true;
    setRoom(null); setMsgs([]); setError(''); setFiles([]); setEditing(null); setInfo(false);
    setText(loadDraft('chat:' + roomId) || '');
    users().then(setPeople).catch(() => {});
    (async () => {
      try {
        const r = await pb.collection('rooms').getOne(roomId);
        const res = await pb.collection('messages').getList(1, PAGE, { filter: pb.filter('room = {:roomId}', { roomId }), sort: NEWEST_FIRST });
        if (!alive) return;
        const list = res.items.reverse();
        const pins = r.kind !== 'dm'
          ? await pb.collection('messages').getFullList({ filter: pb.filter('room = {:roomId} && pinned = true', { roomId }), sort: 'created' })
          : [];
        if (!alive) return;
        setPinnedOld(pins);
        setRoom(r); setMsgs(list); setMore(res.totalPages > 1);
        read(list);
        requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end' }));
      } catch (e) {
        alive && setError(errorMessage(e));
      }
    })();
    const unsub = pb.collection('messages').subscribe('*', (e) => {
      if (e.record.room !== roomId) return;
      setPinnedOld((cur) => (e.action === 'delete' || !e.record.pinned
        ? cur.filter((p) => p.id !== e.record.id)
        : cur.some((p) => p.id === e.record.id) ? cur : [...cur, e.record]));
      setMsgs((cur) => {
        if (e.action === 'delete') return cur.filter((m) => m.id !== e.record.id);
        if (e.action === 'update') return cur.map((m) => (m.id === e.record.id ? e.record : m));
        if (cur.some((m) => m.id === e.record.id)) return cur;
        const next = [...cur, e.record];
        read(next);
        requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
        return next;
      });
    });
    // 연결이 잠깐 끊겼다 이어지면(휴대폰 통신망이 바뀌는 등) 그사이 온 메시지를 다시 받아 합친다
    const unsubConnect = pb.realtime.subscribe('PB_CONNECT', async () => {
      try {
        const res = await pb.collection('messages').getList(1, PAGE, { filter: pb.filter('room = {:roomId}', { roomId }), sort: NEWEST_FIRST });
        if (alive) setMsgs((cur) => { const next = mergeLatest(cur, res.items); read(next); return next; });
      } catch { /* 다음 연결 때 다시 받는다 */ }
    });
    return () => {
      alive = false;
      unsub.then((off) => off()).catch(() => {});
      unsubConnect.then((off) => off()).catch(() => {});
    };
  }, [roomId]);

  async function older() {
    try {
      const res = await pb.collection('messages').getList(1, PAGE, { filter: pb.filter(BEFORE, before(msgs)), sort: NEWEST_FIRST });
      setMsgs((cur) => prependOlder(cur, res.items));
      setMore(res.totalPages > 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function pick(e) {
    const chosen = Array.from(e.target.files || []);
    e.target.value = '';
    const limit = sendLimitError([...files, ...chosen]); // 한 메시지에 붙인 파일을 합쳐서 본다
    if (limit) return setError(limit);
    setError('');
    setFiles([...files, ...chosen]);
  }

  async function send(e) {
    e?.preventDefault();
    const body = text.trim();
    if ((!body && files.length === 0) || busy) return;
    setBusy(true);
    setError('');
    const data = new FormData();
    data.append('room', roomId);
    data.append('author', me().id);
    data.append('body', body);
    const sending = files;
    sending.forEach((f) => data.append('files', f));
    try {
      const created = await sendWithDraft('chat:' + roomId, body, () => pb.collection('messages').create(data));
      // 큰 파일을 올리는 동안 새로 쓴 글이나 고른 파일은 남긴다
      setText((cur) => (cur.trim() === body ? '' : cur));
      setFiles((cur) => cur.filter((f) => !sending.includes(f)));
      setMsgs((cur) => (cur.some((m) => m.id === created.id) ? cur : [...cur, created]));
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end' }));
    } catch (err) {
      setError(`${errorMessage(err)}. 쓰던 글은 남겨 두었습니다`);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e) {
    // 한글 조합 중 Enter는 글자 확정이라 보내지 않는다
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) send(e);
  }

  async function saveEdit(e) {
    e.preventDefault();
    const body = editing.text.trim();
    const m = msgs.find((x) => x.id === editing.id);
    if (!m || body === m.body) return setEditing(null);
    try {
      const saved = await pb.collection('messages').update(m.id, { body });
      setMsgs((cur) => cur.map((x) => (x.id === saved.id ? saved : x)));
      setEditing(null);
      toast('메시지를 고쳤습니다');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function editKey(e) {
    if (e.key === 'Escape') setEditing(null);
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) saveEdit(e);
  }

  async function pin(m, on) {
    try {
      await pb.collection('messages').update(m.id, { pinned: on });
      toast(on ? '공지로 고정했습니다' : '고정을 풀었습니다');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(m) {
    if (!confirm('이 메시지를 지울까요? 첨부파일도 함께 지워집니다.')) return;
    try {
      await pb.collection('messages').delete(m.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (error && !room) return html`<section class="convo panel"><a class="back mobile-only" href="#/chat"><${Icon} name="back" />대화 목록</a><p class="error panel-pad" role="alert">${error}</p></section>`;
  if (!room) return html`<section class="convo panel"><p class="empty">불러오는 중…</p></section>`;

  const canPin = room.kind !== 'dm';
  const title = room.kind === 'group' ? room.name : rooms?.find((r) => r.id === roomId)?.title || (room.kind === 'team' ? '팀 전체방' : '');
  // 화면에 불러온 50개보다 오래된 공지도 보여야 하므로 따로 불러온 목록과 합친다
  const pinned = [...pinnedOld.filter((p) => !msgs.some((m) => m.id === p.id)), ...msgs.filter((m) => m.pinned)];

  return html`
    <section class="convo panel" aria-label=${title}>
      <header class="convo-head">
        <a class="btn ghost icon mobile-only" href="#/chat" aria-label="대화 목록"><${Icon} name="back" /></a>
        <h2 class="section-title">${title}</h2>
        <span class="spacer"></span>
        ${room.kind === 'group' && html`
          <button class="btn small ghost" type="button" aria-expanded=${info} onClick=${() => setInfo(!info)}>
            <${Icon} name="group" /><span class="num">${room.members.length}명</span></button>`}
      </header>
      ${info && room.kind === 'group' && html`<${GroupPanel} room=${room} people=${people} onChanged=${reloadRoom} onClose=${() => setInfo(false)} />`}
      ${pinned.length > 0 && html`
        <div class="pinned" aria-label="고정된 공지">
          ${pinned.map((m) => html`<p><${Icon} name="pin" /> <span class="pinned-body">${m.body || '파일'}</span>
            <span class="small muted"> ${nameOf(m.pinned_by)} 님이 고정</span></p>`)}
        </div>`}
      <ol class="messages">
        ${more && html`<li class="older"><button class="btn small" type="button" onClick=${older}>이전 메시지</button></li>`}
        ${msgs.length === 0 && html`<li class="empty">첫 메시지를 보내 보세요</li>`}
        ${msgs.map((m) => {
          const mine = m.author === me().id;
          const isEditing = editing?.id === m.id;
          return html`
            <li class=${'msg' + (mine ? ' mine' : '')}>
              <div class="msg-meta small">${!mine && html`<strong>${nameOf(m.author)}</strong>`} <span class="muted num">${shortWhen(m.created)}</span>
                ${m.edited_at && html` <span class="muted">(수정됨)</span>`}</div>
              ${isEditing ? html`
                <form class="edit-form" onSubmit=${saveEdit}>
                  <label class="sr-only" for=${'edit-' + m.id}>메시지 고치기</label>
                  <textarea id=${'edit-' + m.id} value=${editing.text} onInput=${(e) => setEditing({ ...editing, text: e.target.value })} onKeyDown=${editKey}></textarea>
                  <div class="row mt-8">
                    <button class="btn small primary" type="submit">저장</button>
                    <button class="btn small ghost" type="button" onClick=${() => setEditing(null)}>취소</button>
                  </div>
                </form>`
              : m.body && html`<p class="bubble">${m.body}</p>`}
              ${m.files?.length > 0 && html`<div class="msg-files"><${Attachments} message=${m} /></div>`}
              ${!isEditing && html`<div class="msg-actions">
                ${canPin && html`<button class="link-btn" type="button" onClick=${() => pin(m, !m.pinned)}>${m.pinned ? '고정 풀기' : '공지로 고정'}</button>`}
                ${mine && m.body && html`<button class="link-btn" type="button" onClick=${() => setEditing({ id: m.id, text: m.body })}>고치기</button>`}
                ${mine && html`<button class="link-btn" type="button" onClick=${() => remove(m)}>지우기</button>`}
              </div>`}
            </li>`;
        })}
        <li ref=${endRef} aria-hidden="true"></li>
      </ol>
      <form class="composer" onSubmit=${send}>
        ${files.length > 0 && html`<div class="chips">${files.map((f, i) => html`
          <button type="button" class="file-chip" onClick=${() => setFiles(files.filter((_, j) => j !== i))} aria-label=${f.name + ' 빼기'}>${f.name} ✕</button>`)}</div>`}
        ${error && html`<p class="error" role="alert">${error}</p>`}
        <div class="row">
          <button class="btn icon" type="button" aria-label="파일 첨부" onClick=${() => fileRef.current?.click()}><${Icon} name="clip" /></button>
          <input ref=${fileRef} class="sr-only" type="file" multiple onChange=${pick} tabindex="-1" aria-hidden="true" />
          <label for="chat-input" class="sr-only">메시지</label>
          <textarea id="chat-input" ref=${inputRef} rows="1" placeholder="메시지 입력" enterkeyhint="send" value=${text}
            onInput=${(e) => { setText(e.target.value); saveDraft('chat:' + roomId, e.target.value); }} onKeyDown=${onKey}></textarea>
          <button class="btn primary icon" type="submit" aria-label="보내기" disabled=${busy}><${Icon} name="send" /></button>
        </div>
      </form>
    </section>`;
}

export function Screen({ params }) {
  const roomId = params[0];
  const [rooms, setRooms] = useState(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    loadRooms().then((list) => {
      setRooms(list);
      setChatDot(list.some((r) => r.unread > 0));
    }).catch((e) => setError(errorMessage(e)));
  }, []);

  // 지금 열린 방의 새 메시지는 읽음 처리(onRead)가 목록을 다시 불러오므로 여기서는 다른 방만 본다.
  // 누가 나를 그룹방에 초대하면(방 변경) 목록도 다시 불러온다.
  useEffect(() => {
    refresh();
    const unsubMsg = pb.collection('messages').subscribe('*', (e) => {
      if (e.action === 'create' && e.record.room !== roomId) refresh();
    });
    const unsubRooms = pb.collection('rooms').subscribe('*', refresh);
    return () => {
      unsubMsg.then((off) => off()).catch(() => {});
      unsubRooms.then((off) => off()).catch(() => {});
    };
  }, [refresh, roomId]);

  return html`
    ${error && html`<p class="error" role="alert">${error}</p>`}
    <div class=${'chat' + (roomId ? ' in-room' : '')}>
      ${picking ? html`<${NewChat} onClose=${() => setPicking(false)} />`
        : html`<${RoomList} rooms=${rooms} current=${roomId} onNew=${() => setPicking(true)} />`}
      ${roomId ? html`<${Conversation} roomId=${roomId} rooms=${rooms} onRead=${refresh} />`
        : html`<section class="convo panel desktop-only"><p class="empty">왼쪽에서 대화를 고르세요</p></section>`}
    </div>`;
}
