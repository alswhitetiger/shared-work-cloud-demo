// 쓰던 글을 브라우저에 임시 저장한다. 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도 오류 없이 지나간다.
// 임시 저장은 로그인한 사람별로 나뉜다: 같은 기기를 다음 사람이 써도 앞사람 글이 보이지 않는다.
const local = () => globalThis.localStorage;
let owner = '';

export function setDraftOwner(id) {
  owner = id || '';
}

const full = (key) => `draft:${owner}:${key}`;

export function loadDraft(key, storage = local()) {
  try {
    return storage.getItem(full(key));
  } catch {
    return null;
  }
}

export function saveDraft(key, text, storage = local()) {
  try {
    if (text) storage.setItem(full(key), text);
    else storage.removeItem(full(key));
  } catch {
    /* 임시 저장은 편의 기능이라 실패해도 넘어간다 */
  }
}

export function clearDraft(key, storage = local()) {
  saveDraft(key, '', storage);
}

// send가 성공했을 때만 임시 저장을 지운다. 실패하면 글을 남겨 두고 오류를 그대로 던진다.
// 보내는 동안 새로 쓴 글이 있으면 그 글은 지우지 않는다.
export async function sendWithDraft(key, text, send, storage = local()) {
  saveDraft(key, text, storage);
  const result = await send();
  if (loadDraft(key, storage) === text) clearDraft(key, storage);
  return result;
}
