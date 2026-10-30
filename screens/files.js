import { html, useState, useEffect } from '../vendor/preact-htm.js';
import { pb, me, users, fileURL } from '../pb.js';
import { Icon } from '../icons.js';
import { DocTabs } from './docs.js';
import { errorMessage } from '../lib/errors.js';
import { displayName } from '../lib/files.js';
import { shortWhen } from '../lib/dates.js';

// 할 일 첨부와 내가 볼 수 있는 채팅방의 첨부를 최신순으로 모은다 (볼 수 없는 방은 서버 규칙이 걸러 준다)
async function collect() {
  const [tasks, messages, people] = await Promise.all([
    // 여러 파일 칸은 "files != ''"로는 걸러지지 않는다(빈 목록도 통과): 개수로 거른다
    pb.collection('tasks').getFullList({ filter: 'files:length > 0', sort: '-updated' }),
    pb.collection('messages').getFullList({ filter: 'files:length > 0', sort: '-created', expand: 'room' }),
    users(),
  ]);
  const nameOf = (id) => people.find((u) => u.id === id)?.name || '';
  const roomLabel = (room) => {
    if (!room || room.kind === 'team') return '채팅: 팀방';
    if (room.kind === 'group') return '채팅: ' + room.name;
    return '채팅: ' + nameOf(room.members.find((m) => m !== me().id));
  };

  const items = [];
  for (const t of tasks) {
    for (const f of t.files) items.push({ record: t, stored: f, when: t.updated, source: '할 일: ' + t.title, href: '#/tasks/' + t.id });
  }
  for (const m of messages) {
    for (const f of m.files) items.push({ record: m, stored: f, when: m.created, source: roomLabel(m.expand?.room), href: '#/chat/' + m.room });
  }
  items.sort((a, b) => (a.when < b.when ? 1 : -1));
  for (const it of items) {
    it.name = displayName(it.record, it.stored);
    it.url = await fileURL(it.record, it.stored);
  }
  return items;
}

export function Screen() {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    collect().then(setItems).catch((e) => setError(errorMessage(e)));
  }, []);

  const needle = q.trim().toLowerCase();
  const shown = (items || []).filter((it) => !needle || it.name.toLowerCase().includes(needle));

  return html`
    <${DocTabs} current="files" />
    <div class="page-head"><h1>자료실</h1></div>
    <div class="search">
      <${Icon} name="search" />
      <label for="file-q" class="sr-only">파일 이름으로 찾기</label>
      <input id="file-q" type="search" placeholder="파일 이름으로 찾기" value=${q} onInput=${(e) => setQ(e.target.value)} enterkeyhint="search" />
    </div>
    ${error && html`<p class="error" role="alert">${error}</p>`}
    <div class="panel mt-16">
      ${items === null && !error ? html`<p class="empty">불러오는 중…</p>`
        : shown.length === 0 ? html`<p class="empty">${needle ? `"${q}"이(가) 들어간 파일이 없습니다` : '아직 올라온 파일이 없습니다. 할 일이나 채팅에서 파일을 올려 보세요'}</p>`
        : html`<ul class="list">
            ${shown.map((it) => html`
              <li class="file-row">
                <a class="file-name" href=${it.url} download=${it.name}><${Icon} name="download" /><span>${it.name}</span></a>
                <span class="file-meta small muted"><a href=${it.href}>${it.source}</a> <span class="num">${shortWhen(it.when)}</span></span>
              </li>`)}
          </ul>`}
    </div>`;
}
