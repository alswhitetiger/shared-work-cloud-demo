import { pb, me, users } from './pb.js';

// 내가 볼 수 있는 방(팀방 + 내 1:1 방)과 방별 안 읽은 수.
// 안 읽은 수 = 내가 마지막으로 읽은 메시지 시각 이후에 남이 보낸 메시지 수
export async function loadRooms() {
  const [rooms, reads, people] = await Promise.all([
    pb.collection('rooms').getFullList({ sort: '-created' }),
    pb.collection('reads').getFullList(),
    users(),
  ]);
  const lastRead = Object.fromEntries(reads.map((r) => [r.room, r.last_read_at]));
  const nameOf = (id) => people.find((u) => u.id === id)?.name || '알 수 없음';

  const list = await Promise.all(rooms.map(async (room) => {
    const since = lastRead[room.id];
    const filter = pb.filter('room = {:room} && author != {:me}' + (since ? ' && created > {:since}' : ''), { room: room.id, me: me().id, since });
    const { totalItems } = await pb.collection('messages').getList(1, 1, { filter, fields: 'id' });
    const other = room.members.find((m) => m !== me().id);
    const title = room.kind === 'team' ? '팀 전체방' : room.kind === 'group' ? room.name : nameOf(other);
    return { ...room, title, other, unread: totalItems };
  }));
  // 팀 전체방, 그룹방, 1:1 순서
  const order = { team: 0, group: 1, dm: 2 };
  return list.sort((a, b) => order[a.kind] - order[b.kind]);
}

// 방을 읽음으로 표시한다. 기기 시계 대신 서버가 매긴 마지막 메시지 시각을 쓴다.
export async function markRead(roomId, lastCreated) {
  if (!lastCreated) return;
  const filter = pb.filter('room = {:room} && user = {:me}', { room: roomId, me: me().id });
  try {
    const r = await pb.collection('reads').getFirstListItem(filter);
    if (r.last_read_at < lastCreated) await pb.collection('reads').update(r.id, { last_read_at: lastCreated });
  } catch (e) {
    if (e?.status !== 404) throw e;
    await pb.collection('reads').create({ room: roomId, user: me().id, last_read_at: lastCreated });
  }
}
