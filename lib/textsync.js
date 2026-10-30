// 글 입력칸과 Yjs 공유 글(Y.Text)을 잇는 작은 도구들.

const isHigh = (c) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c) => c >= 0xdc00 && c <= 0xdfff;

// 이전 글과 새 글 사이에서 바뀐 한 구간을 찾는다(입력칸은 한 번에 한 곳만 바뀐다).
// 이모지처럼 두 칸짜리 글자를 반으로 자르지 않는다.
export function diffText(before, after) {
  if (before === after) return null;
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  if (start > 0 && isHigh(before.charCodeAt(start - 1))) start--;
  let end = 0;
  while (end < max - start && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
  if (end > 0 && isLow(before.charCodeAt(before.length - end))) end--;
  return { index: start, remove: before.length - start - end, insert: after.slice(start, after.length - end) };
}

export function applyDiff(ytext, change, origin = null) {
  if (!change) return;
  const run = () => {
    if (change.remove) ytext.delete(change.index, change.remove);
    if (change.insert) ytext.insert(change.index, change.insert);
  };
  ytext.doc ? ytext.doc.transact(run, origin) : run();
}

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
