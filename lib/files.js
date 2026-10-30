// 한 번에 95MB까지: Cloudflare 무료 요금제가 한 번에 받는 양이 100MB까지라 여유를 둔다(서버 파일 칸과 같은 값)
export const MAX_SEND_BYTES = 95 * 1024 * 1024;

// 한 번에 보내려는 파일들이 한도를 넘으면 안내 문구를, 괜찮으면 빈 글을 돌려준다
export function sendLimitError(files) {
  const list = Array.from(files);
  const big = list.filter((f) => f.size > MAX_SEND_BYTES).map((f) => f.name);
  if (big.length) return `95MB를 넘는 파일은 올릴 수 없습니다: ${big.join(', ')}`;
  if (list.reduce((sum, f) => sum + f.size, 0) > MAX_SEND_BYTES) return '한 번에 95MB까지 보낼 수 있습니다. 나눠서 보내 주세요';
  return '';
}

// PocketBase가 저장 이름에 붙이는 "_영숫자10자"를 뗀다(원래 이름 기록이 없을 때의 대안).
export function originalName(stored) {
  return stored.replace(/_[a-z0-9]{10}(\.[^.]+)?$/, '$1');
}

// 서버가 기록한 원래 이름(file_names)을 먼저 쓴다.
export function displayName(record, stored) {
  return record?.file_names?.[stored] || originalName(stored);
}

const IMAGE = /\.(jpe?g|png|gif|webp)$/i;
export const isImage = (name) => IMAGE.test(name);

