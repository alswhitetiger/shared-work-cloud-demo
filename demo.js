// 체험판: 서버 없이 브라우저 안에서 PocketBase 서버 흉내를 낸다(GitHub Pages용).
// 화면 코드는 그대로 두고 fetch·EventSource만 가로챈다. 데이터는 이 브라우저(localStorage)에만 남는다.
// 실제 프로그램(pb_public)에는 들어가지 않는다: demo/build.mjs가 체험판을 묶을 때만 넣는다.
import { pb } from './pb.js';
import { SEED, ME, FILES } from './demo-data.js';

const KEY = 'demo-db-v1';
const TEAM_ROOM = 'r00000000000000';
let db = load();
const blobs = new Map(); // 이번에 올린 파일(새로고침하면 사라진다)

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* 처음 */ }
  return structuredClone(SEED());
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 저장소가 가득 참: 이번 화면에서만 유지 */ } }

// ---------- 공통 ----------
const stamp = (d = new Date()) => d.toISOString().replace('T', ' ');
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const kstDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
const table = (c) => (db[c] ||= []);
const find = (c, id) => table(c).find((r) => r.id === id);
const me = () => pb.authStore.record?.id || '';
const fail = (status, message) => ({ status, body: { status, message, data: {} } });
const ok = (body, status = 200) => ({ status, body });
const b64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const token = (id) => `${b64({ alg: 'none' })}.${b64({ id, type: 'auth', collectionId: 'users', exp: Math.floor(Date.now() / 1000) + 30 * 86400 })}.demo`;
const pub = (c, r) => (c === 'users' ? { ...r, password: undefined } : r);

// 관계 칸: 필터의 room.kind, members.id 같은 경로를 따라가려고 둔다
const REL = { room: 'rooms', author: 'users', members: 'users', user: 'users', doc: 'docs', task: 'tasks', assignee: 'users', created_by: 'users' };

// ---------- 필터: PocketBase 필터 글을 읽어 레코드에 맞춰 본다(화면이 쓰는 만큼만) ----------
function tokenize(s) {
  const out = [];
  const re = /\s*(\(|\)|&&|\|\||\?!=|\?=|!=|>=|<=|!~|=|>|<|~|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[\w@.:]+(?:\([^)]*\))?)/y;
  let m;
  while (re.lastIndex < s.length && (m = re.exec(s))) out.push(m[1]);
  return out;
}
function value(tok, rec) {
  if (/^['"]/.test(tok)) return tok.slice(1, -1).replace(/\\(.)/g, '$1');
  if (tok === 'true' || tok === 'false') return tok === 'true';
  if (tok === 'null') return '';
  if (/^-?\d+(\.\d+)?$/.test(tok)) return +tok;
  if (tok === '@request.auth.id') return me();
  const [path, mod] = tok.split(':');
  let vals = [rec];
  const parts = path.split('.');
  parts.forEach((p, i) => {
    vals = vals.flatMap((v) => {
      const x = v?.[p];
      if (i < parts.length - 1 && REL[p]) return [].concat(x ?? []).map((id) => find(REL[p], id)).filter(Boolean);
      return [x];
    });
  });
  if (mod === 'length') return [].concat(vals[0] ?? []).length;
  return parts.length > 1 || Array.isArray(vals[0]) ? vals.flat() : vals[0] ?? '';
}
function compare(a, op, b) {
  if (op.startsWith('?')) return [].concat(a).some((x) => compare(x, op.slice(1), b));
  if (Array.isArray(a)) a = a[0] ?? '';
  switch (op) {
    case '=': return a === b || String(a) === String(b);
    case '!=': return !(a === b || String(a) === String(b));
    case '>': return a > b; case '>=': return a >= b; case '<': return a < b; case '<=': return a <= b;
    case '~': return String(a).toLowerCase().includes(String(b).toLowerCase());
    case '!~': return !String(a).toLowerCase().includes(String(b).toLowerCase());
  }
  return false;
}
function matches(filter, rec) {
  if (!filter) return true;
  const t = tokenize(filter);
  let i = 0;
  const or = () => { let v = and(); while (t[i] === '||') { i++; const r = and(); v = v || r; } return v; };
  const and = () => { let v = atom(); while (t[i] === '&&') { i++; const r = atom(); v = v && r; } return v; };
  const atom = () => {
    if (t[i] === '(') { i++; const v = or(); i++; return v; }
    const a = value(t[i++], rec), op = t[i++], b = value(t[i++], rec);
    return compare(a, op, b);
  };
  return or();
}
function sorter(sort) {
  const keys = (sort || '').split(',').filter(Boolean).map((k) => (k[0] === '-' ? [k.slice(1), -1] : [k.replace(/^\+/, ''), 1]));
  return (a, b) => { for (const [k, d] of keys) { if (a[k] < b[k]) return -d; if (a[k] > b[k]) return d; } return 0; };
}

// ---------- 읽기 권한: 1:1·그룹방은 그 방 사람만(서버 규칙과 같게) ----------
const canSeeRoom = (room) => room && (room.kind === 'team' || room.members?.includes(me()));
function visible(c, r) {
  if (c === 'rooms') return canSeeRoom(r);
  if (c === 'messages' || c === 'reads') return canSeeRoom(find('rooms', r.room)) && (c !== 'reads' || r.user === me());
  if (c === 'push_subscriptions') return r.user === me();
  return true;
}
function expand(rec, exp) {
  if (!exp) return rec;
  const out = { ...rec, expand: {} };
  for (const f of exp.split(',')) { const target = REL[f] && [].concat(rec[f] ?? []).map((id) => find(REL[f], id)).filter(Boolean); if (target?.length) out.expand[f] = Array.isArray(rec[f]) ? target : target[0]; }
  return out;
}

// ---------- 바꾸기(만들기·고치기·지우기)와 실시간 알림 ----------
const sources = new Set();
function notify(c, action, rec) {
  setTimeout(() => {
    for (const es of sources) for (const type of Object.keys(es.l)) {
      const [topic, qs] = type.split('?');
      if (topic !== c + '/*' && topic !== c + '/' + rec.id) continue;
      const q = qs ? JSON.parse(decodeURIComponent(qs.replace(/^options=/, ''))).query || {} : {};
      if (!visible(c, rec) || (q.filter && !matches(q.filter, rec))) continue;
      es.emit(type, { action, record: pub(c, rec) });
    }
  }, 0);
}
function save(c, rec, action) { persist(); notify(c, action, rec); return rec; }
function create(c, data) {
  const now = stamp();
  const rec = { id: data.id || newId(), collectionId: c, collectionName: c, created: now, updated: now, ...data };
  table(c).push(rec);
  return save(c, rec, 'create');
}
function update(c, rec, data) { Object.assign(rec, data, { updated: stamp() }); return save(c, rec, 'update'); }
function remove(c, rec) { db[c] = table(c).filter((r) => r !== rec); persist(); notify(c, 'delete', rec); }

// 요청 몸통: JSON 또는 파일이 든 FormData. 파일은 이번 화면에서만 볼 수 있는 주소로 둔다
async function readBody(init) {
  const body = init?.body;
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  if (!(body instanceof FormData)) return body;
  const out = {};
  for (const [k, v] of body.entries()) {
    if (k === '@jsonPayload') { Object.assign(out, JSON.parse(v)); continue; }
    if (v instanceof File) { const name = `${v.name.replace(/\.[^.]*$/, '')}_${newId().slice(0, 10)}${/\.[^.]*$/.exec(v.name)?.[0] || ''}`; blobs.set(name, URL.createObjectURL(v)); (out[k] ||= []).push(name); (out.file_names ||= {})[name] = v.name; continue; }
    out[k] = v;
  }
  return out;
}

// 서버 훅이 하던 일: 작성자·날짜를 서버가 정하고, 맞지 않는 요청은 거절한다
function hookCreate(c, data) {
  if (c === 'messages' && !data.body?.trim() && !data.files?.length) return fail(400, '보낼 내용을 적어 주세요');
  if (c === 'messages') data.author = me();
  if (c === 'reports' && data.date !== kstDay()) return fail(400, '오늘 보고만 쓰고 고칠 수 있습니다');
  if (c === 'docs') Object.assign(data, { rev: 0, state: '', text: '', created_by: me() });
  if (c === 'timeline' && data.kind === 'mail') return fail(400, '메일은 서버만 넣을 수 있습니다');
  if (c === 'timeline' && data.end && data.end < data.at) return fail(400, '끝나는 날이 시작하는 날보다 빠릅니다');
  if (c === 'users') { if ((data.password || '').length < 10) return fail(400, '비밀번호는 10자 이상으로 정해 주세요'); Object.assign(data, { disabled: false }); }
  return null;
}
function hookUpdate(c, rec, data) {
  if (c === 'messages' && rec.author !== me()) return fail(404, '찾을 수 없습니다');
  if (c === 'messages' && 'body' in data && data.body !== rec.body) data.edited_at = stamp();
  if (c === 'timeline' && rec.kind === 'mail' && ['title', 'body', 'at', 'end'].some((k) => k in data)) return fail(404, '찾을 수 없습니다');
  // 파일 칸: "files-"는 빼기, "files+"는 더하기
  for (const k of Object.keys(data)) {
    if (k.endsWith('-')) { rec[k.slice(0, -1)] = [].concat(rec[k.slice(0, -1)] || []).filter((n) => ![].concat(data[k]).includes(n)); delete data[k]; }
    if (k.endsWith('+')) { rec[k.slice(0, -1)] = [].concat(rec[k.slice(0, -1)] || [], data[k]); delete data[k]; }
  }
  if (data.files && rec.files) { data.files = [...[].concat(rec.files || []), ...[].concat(data.files)].filter((n, i, a) => a.indexOf(n) === i); }
  if (data.file_names) data.file_names = { ...(rec.file_names || {}), ...data.file_names };
  return null;
}

// ---------- 화면 전용 API(/api/team/*) ----------
function team(path, body) {
  const today = kstDay();
  const hm = (d) => new Date(`${body.date}T${d}:00+09:00`).toISOString().replace('T', ' ');
  if (path === '/api/team/attendance/in' || path === '/api/team/attendance/out') {
    const rec = table('attendance').find((r) => r.user === me() && r.date === today);
    if (path.endsWith('/in')) {
      if (rec?.clock_in) return fail(400, '오늘은 이미 출근을 기록했습니다');
      return ok(rec ? update('attendance', rec, { clock_in: stamp() }) : create('attendance', { user: me(), date: today, clock_in: stamp(), clock_out: '', note: '', corrected: false }));
    }
    if (!rec?.clock_in) return fail(400, '먼저 출근을 눌러 주세요');
    return ok(update('attendance', rec, { clock_out: stamp() }));
  }
  if (path === '/api/team/attendance/correct') {
    if (!body.note?.trim()) return fail(400, '고친 이유를 적어 주세요');
    if (body.date > today) return fail(400, '앞으로의 날짜는 고칠 수 없습니다');
    const rec = table('attendance').find((r) => r.user === me() && r.date === body.date);
    const data = { note: body.note.trim(), corrected: true, ...(body.clock_in && { clock_in: hm(body.clock_in) }), ...(body.clock_out && { clock_out: hm(body.clock_out) }) };
    return ok(rec ? update('attendance', rec, data) : create('attendance', { user: me(), date: body.date, clock_in: '', clock_out: '', ...data }));
  }
  if (path === '/api/team/dm') {
    if (body.user === me()) return fail(400, '나 자신과는 대화방을 만들 수 없습니다');
    const pair = [me(), body.user].sort();
    return ok(table('rooms').find((r) => r.kind === 'dm' && [...r.members].sort().join() === pair.join()) || create('rooms', { kind: 'dm', members: pair, name: '', created_by: me() }));
  }
  if (path === '/api/team/rooms') return ok(create('rooms', { kind: 'group', name: body.name, members: [...new Set([me(), ...(body.members || [])])], created_by: me() }));
  const doc = /^\/api\/team\/docs\/(\w+)\/(compact|here)$/.exec(path);
  if (doc) {
    const d = find('docs', doc[1]);
    if (!d) return fail(404, '문서를 찾을 수 없습니다');
    if (doc[2] === 'here') return ok({ people: [me()] });
    if ((d.rev || 0) !== body.rev) return fail(409, '다른 사람이 먼저 정리했습니다. 다시 시도합니다');
    db.doc_updates = table('doc_updates').filter((u) => !(u.doc === d.id && body.applied?.includes(u.id)));
    const last = table('doc_versions').filter((v) => v.doc === d.id).sort(sorter('-created'))[0];
    if (!last || last.text !== body.text) create('doc_versions', { doc: d.id, text: body.text, saved_by: me() });
    update('docs', d, { rev: d.rev + 1, state: body.state, text: body.text });
    return ok({ rev: d.rev });
  }
  if (path === '/api/team/vapid') return fail(400, '체험판에서는 휴대폰 알림을 켤 수 없습니다');
  return fail(404, '체험판에는 없는 기능입니다');
}

// ---------- 주소별로 나누기 ----------
async function route(url, init) {
  const method = (init?.method || 'GET').toUpperCase();
  const path = url.pathname.replace(/^.*?(\/api\/)/, '$1');
  const q = Object.fromEntries(url.searchParams);
  const body = method === 'GET' ? {} : await readBody(init);
  if (path === '/api/health') return ok({ code: 200, message: 'API is healthy.' });
  if (path === '/api/realtime') return ok(null, 204);
  if (path === '/api/files/token') return ok({ token: 'demo' });
  if (path.startsWith('/api/setup')) return fail(404, '');
  if (path.startsWith('/api/team/')) return team(path, body);

  const m = /^\/api\/collections\/(\w+)\/(records(?:\/(\w+))?|auth-with-password|auth-refresh|request-password-reset|confirm-password-reset)$/.exec(path);
  if (!m) return fail(404, '체험판에는 없는 기능입니다');
  const [, c, what, id] = m;
  if (what === 'auth-with-password') {
    const u = table('users').find((x) => x.email.toLowerCase() === String(body.identity).trim().toLowerCase());
    if (!u || (body.password || '').length < 1) return fail(400, '이메일이나 비밀번호가 맞지 않습니다');
    return ok({ token: token(u.id), record: pub(c, u) });
  }
  if (what === 'auth-refresh') { const u = find('users', me()); return u ? ok({ token: token(u.id), record: pub(c, u) }) : fail(401, '다시 로그인해 주세요'); }
  if (what.startsWith('request-password') || what.startsWith('confirm-password')) return ok(null, 204);
  if (!me() && !(c === 'users' && method === 'POST')) return fail(401, '로그인해 주세요');

  if (!id && method === 'GET') {
    const page = +q.page || 1, per = +q.perPage || 30;
    const all = table(c).filter((r) => visible(c, r) && matches(q.filter, r)).sort(sorter(q.sort));
    return ok({ page, perPage: per, totalItems: all.length, totalPages: Math.ceil(all.length / per), items: all.slice((page - 1) * per, page * per).map((r) => expand(pub(c, r), q.expand)) });
  }
  if (!id && method === 'POST') {
    const bad = hookCreate(c, body);
    if (bad) return bad;
    delete body.passwordConfirm; delete body.inviteCode;
    return ok(pub(c, create(c, body)));
  }
  const rec = find(c, id);
  if (!rec || !visible(c, rec)) return fail(404, '찾을 수 없습니다');
  if (method === 'GET') return ok(expand(pub(c, rec), q.expand));
  if (method === 'PATCH') { const bad = hookUpdate(c, rec, body); return bad || ok(pub(c, update(c, rec, body))); }
  if (method === 'DELETE') {
    if (['tasks', 'docs', 'messages'].includes(c) && (rec.created_by || rec.author) !== me()) return fail(404, '찾을 수 없습니다');
    if (c === 'timeline' && rec.kind !== 'mail' && rec.created_by !== me()) return fail(404, '찾을 수 없습니다');
    remove(c, rec);
    return ok(null, 204);
  }
  return fail(405, '');
}

// ---------- 가로채기 ----------
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (!url.pathname.includes('/api/')) return realFetch(input, init);
  try {
    const { status, body } = await route(url, init);
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('demo', err);
    return new Response(JSON.stringify({ status: 400, message: '체험판에서 처리하지 못했습니다', data: {} }), { status: 400 });
  }
};

// 실시간 연결: 진짜 서버 대신 이 브라우저 안에서 바뀐 것을 바로 알려 준다
window.EventSource = class {
  constructor() { this.l = {}; sources.add(this); setTimeout(() => this.emit('PB_CONNECT', { clientId: 'demo' }, 'demo'), 0); }
  addEventListener(t, f) { (this.l[t] ||= []).push(f); }
  removeEventListener(t, f) { this.l[t] = (this.l[t] || []).filter((x) => x !== f); if (!this.l[t].length) delete this.l[t]; }
  close() { sources.delete(this); }
  emit(t, data, id = '') { for (const f of this.l[t] || []) f({ data: JSON.stringify(data), lastEventId: id }); }
};

// 파일 주소: 예시 파일은 그림 주소, 이번에 올린 파일은 브라우저 안 주소
const realURL = pb.files.getURL.bind(pb.files);
pb.files.getURL = (rec, name, query) => blobs.get(name) || FILES[name] || realURL(rec, name, query);

// 처음 들어오면 이서연으로 로그인해 둔다(로그아웃 뒤에는 로그인 화면의 안내대로)
if (!localStorage.getItem('demo-seen')) {
  localStorage.setItem('demo-seen', '1');
  const u = find('users', ME);
  pb.authStore.save(token(u.id), pub('users', u));
}

// 체험판 표시와 처음으로 되돌리기
const bar = document.createElement('div');
bar.className = 'demo-bar';
bar.innerHTML = '<span>체험판 · 로그인 seoyeon@demo.team / 아무 비밀번호</span><button type="button">처음 상태로</button>';
bar.title = '예시 데이터이며 이 브라우저에만 저장됩니다';
bar.querySelector('button').onclick = () => { localStorage.removeItem(KEY); localStorage.removeItem('demo-seen'); pb.authStore.clear(); location.reload(); };
document.body.prepend(bar);
