export const OFFLINE = '서버(주 PC)에 연결할 수 없습니다';

// 서버의 영어 검증 코드를 한국어 안내로 바꾼다
const CODES = {
  validation_required: '빈칸을 채워 주세요',
  validation_max_text_constraint: '글자 수가 너무 많습니다',
  validation_min_text_constraint: '글자 수가 너무 적습니다',
  validation_not_unique: '이미 있는 내용입니다',
  validation_too_many_files: '파일은 한 번에 20개까지 올릴 수 있습니다',
  validation_file_size_limit: '100MB를 넘는 파일은 올릴 수 없습니다',
};

// 서버 오류를 사람이 읽을 문장으로 바꾼다.
export function errorMessage(err) {
  const status = err?.status;
  if (status === 0) return OFFLINE;
  if (status === 403 || status === 404) return '권한이 없습니다';
  if (status === 400 && err?.response?.message) {
    const fields = Object.values(err.response.data || {}).filter((f) => f?.code);
    if (fields.length) return [...new Set(fields.map((f) => CODES[f.code] || '입력한 내용을 확인해 주세요'))].join('. ');
    // 팀 규칙(훅)이 보낸 한국어 문구는 그대로, 영어 문구는 감춘다
    return /[가-힣]/.test(err.response.message) ? err.response.message : '요청을 처리하지 못했습니다';
  }
  return '잠시 후 다시 시도해 주세요';
}
