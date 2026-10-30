// 이전 메시지는 페이지 번호가 아니라 지금 가진 가장 오래된 메시지보다 앞선 것만 불러온다.
// 그래야 그사이 새 메시지가 와도 겹치거나 빠지지 않는다. 같은 시각에 온 메시지는 id로 가른다.
export const NEWEST_FIRST = '-created,-id';
export const BEFORE = 'room = {:room} && (created < {:created} || (created = {:created} && id < {:id}))';

export function before(list) {
  const { room, created, id } = list[0];
  return { room, created, id };
}

// 서버가 최신순으로 준 이전 메시지를 앞에 붙인다(같은 응답이 두 번 와도 겹치지 않게)
export function prependOlder(cur, newestFirst) {
  const have = new Set(cur.map((m) => m.id));
  return [...newestFirst.filter((m) => !have.has(m.id)).reverse(), ...cur];
}

// 연결이 끊겼다 이어진 뒤 받은 최신 메시지(최신순)를 합친다: 고친 것은 바꾸고, 그사이 온 것은 순서대로 끼운다
export function mergeLatest(cur, newestFirst) {
  const byId = new Map(cur.map((m) => [m.id, m]));
  for (const m of newestFirst) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
}
