// 체험판 예시 데이터: 영상 제작 팀 5명의 한 주. 날짜는 열어 본 날을 기준으로 정해져 늘 "요즘" 일처럼 보인다.
import * as Y from './vendor/yjs.mjs';
import { toBase64 } from './lib/textsync.js';

export const ME = 'u00000000000001';
const U = { seo: ME, min: 'u00000000000002', jiho: 'u00000000000003', yuna: 'u00000000000004', daeun: 'u00000000000005' };

const svg = (bg, fg, text) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${bg}"/><rect x="40" y="40" width="560" height="280" rx="12" fill="none" stroke="${fg}" stroke-width="3" stroke-dasharray="12 8"/><text x="320" y="190" font-family="sans-serif" font-size="34" font-weight="700" fill="${fg}" text-anchor="middle">${text}</text></svg>`);
export const FILES = {
  'conti_1_a1b2c3d4e5.svg': svg('#e8efff', '#1d4ed8', 'A사 콘티 1차 — 장면 1~6'),
  'location_f6g7h8i9j0.svg': svg('#fff1e1', '#b45309', 'B사 촬영 장소 — 성수 스튜디오'),
};

const kst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
const day = (n) => kst.format(new Date(Date.now() + n * 86400000));
// day(n)의 한국 시각 hh:mm → 서버 시각 문자열
const at = (n, hm = '00:00') => new Date(`${day(n)}T${hm}:00+09:00`).toISOString().replace('T', ' ');
const ago = (min) => new Date(Date.now() - min * 60000).toISOString().replace('T', ' ');
const rec = (c, id, data, created = ago(600)) => ({ id, collectionId: c, collectionName: c, created, updated: created, ...data });

function docState(text) {
  const d = new Y.Doc();
  d.getText('body').insert(0, text);
  return toBase64(Y.encodeStateAsUpdate(d));
}

export function SEED() {
  const conti = '1. 오프닝 — 사옥 외경 드론 컷 (5초)\n2. 대표 인터뷰 — 회의실, 정면 바스트\n3. 작업 현장 — 실내로 변경(고객 확인 완료)\n4. 제품 클로즈업 — 슬라이더 이동\n5. 직원 인터뷰 2명\n6. 엔딩 — 로고, 슬로건 자막';
  const user = (id, name, email) => rec('users', id, { name, email, disabled: false, remind_at: '', work_days: [] }, ago(60 * 24 * 30));
  return {
    users: [user(U.seo, '이서연', 'seoyeon@demo.team'), user(U.min, '김민준', 'minjun@demo.team'), user(U.jiho, '박지호', 'jiho@demo.team'), user(U.yuna, '최유나', 'yuna@demo.team'), user(U.daeun, '정다은', 'daeun@demo.team')],
    team_settings: [rec('team_settings', 'teamsettings001', { invite_code: 'DEMO-2026-TEAM' })],
    rooms: [
      rec('rooms', 'r00000000000000', { kind: 'team', members: [], name: '' }, ago(60 * 24 * 30)),
      rec('rooms', 'r00000000000010', { kind: 'group', name: '편집팀', members: [U.seo, U.min, U.jiho], created_by: U.min }, ago(60 * 24 * 10)),
      rec('rooms', 'r00000000000011', { kind: 'dm', members: [U.seo, U.yuna], name: '' }, ago(60 * 24 * 5)),
    ],
    messages: [
      rec('messages', 'm00000000000001', { room: 'r00000000000000', author: U.min, body: '이번 주 금요일 A사 홍보영상 납품입니다. 최종 파일은 자료실에 올려 주세요.', pinned: true, pinned_by: U.min, files: [] }, ago(60 * 26)),
      rec('messages', 'm00000000000002', { room: 'r00000000000000', author: U.yuna, body: 'B사 촬영 장소가 성수 스튜디오로 바뀌었어요. 지도 올립니다.', files: ['location_f6g7h8i9j0.svg'], file_names: { 'location_f6g7h8i9j0.svg': '촬영장소_성수스튜디오.svg' } }, ago(60 * 3)),
      rec('messages', 'm00000000000003', { room: 'r00000000000000', author: U.jiho, body: '확인했습니다! 장비는 제가 챙길게요.', files: [] }, ago(150)),
      rec('messages', 'm00000000000004', { room: 'r00000000000000', author: U.daeun, body: '오늘 3시 내부 시사회 회의실 B입니다 🙂', files: [] }, ago(40)),
      rec('messages', 'm00000000000005', { room: 'r00000000000010', author: U.min, body: 'A사 2차 수정 사항: 로고 크기 줄이기, 자막 색 변경', files: [] }, ago(90)),
      rec('messages', 'm00000000000006', { room: 'r00000000000010', author: U.jiho, body: '자막은 제가 오늘 안에 바꿔 둘게요.', files: [] }, ago(70)),
      rec('messages', 'm00000000000007', { room: 'r00000000000011', author: U.yuna, body: '서연님, 내일 촬영 콜타임 8시 맞죠?', files: [] }, ago(25)),
    ],
    reads: [],
    tasks: [
      rec('tasks', 't00000000000001', { title: 'A사 2차 시안 수정 반영', description: '로고 크기 10% 줄이기, 자막 색 흰색으로', assignee: U.jiho, due: at(1), status: 'doing', created_by: U.min, files: ['conti_1_a1b2c3d4e5.svg'], file_names: { 'conti_1_a1b2c3d4e5.svg': 'A사_콘티_1차.svg' } }, ago(60 * 30)),
      rec('tasks', 't00000000000002', { title: 'B사 촬영 장비 체크리스트', description: '조명 2세트, 짐벌, 무선 마이크 3개', assignee: U.seo, due: at(4), status: 'todo', created_by: U.yuna, files: [] }, ago(60 * 20)),
      rec('tasks', 't00000000000003', { title: 'C사 브랜드필름 레퍼런스 정리', description: '', assignee: U.daeun, due: at(6), status: 'todo', created_by: U.seo, files: [] }, ago(60 * 10)),
      rec('tasks', 't00000000000004', { title: 'A사 촬영 원본 백업', description: '외장 SSD 2개에 복사', assignee: U.min, due: at(-3), status: 'done', created_by: U.min, files: [] }, ago(60 * 80)),
      rec('tasks', 't00000000000005', { title: '견적서 송부 (B사)', description: '', assignee: U.seo, due: at(-1), status: 'todo', created_by: U.seo, files: [] }, ago(60 * 50)),
    ],
    comments: [rec('comments', 'c00000000000001', { task: 't00000000000001', author: U.min, body: '고객이 금요일 오전까지 받고 싶다고 합니다.' }, ago(60 * 5))],
    reports: [
      rec('reports', 'p00000000000001', { author: U.min, date: day(0), done: 'A사 2차 수정 사항 정리, 고객 통화', next: '최종 렌더링 확인', blocked: '' }, ago(60)),
      rec('reports', 'p00000000000002', { author: U.jiho, date: day(0), done: '자막 색 변경, 로고 크기 조정', next: 'B사 촬영 장비 점검', blocked: '자막 폰트 라이선스 확인 필요' }, ago(30)),
    ],
    attendance: [
      rec('attendance', 'a00000000000001', { user: U.min, date: day(0), clock_in: at(0, '08:52'), clock_out: '', note: '', corrected: false }),
      rec('attendance', 'a00000000000002', { user: U.jiho, date: day(0), clock_in: at(0, '09:05'), clock_out: '', note: '', corrected: false }),
      rec('attendance', 'a00000000000003', { user: U.daeun, date: day(0), clock_in: at(0, '08:40'), clock_out: '', note: '', corrected: false }),
      rec('attendance', 'a00000000000004', { user: U.seo, date: day(-1), clock_in: at(-1, '08:58'), clock_out: at(-1, '18:12'), note: '', corrected: false }),
      rec('attendance', 'a00000000000005', { user: U.seo, date: day(-2), clock_in: at(-2, '09:01'), clock_out: at(-2, '19:30'), note: '', corrected: false }),
    ],
    docs: [rec('docs', 'd00000000000001', { title: 'A사 홍보영상 촬영 콘티', created_by: U.seo, rev: 0, state: docState(conti), text: conti }, ago(60 * 48)),
      rec('docs', 'd00000000000002', { title: 'B사 제품컷 촬영 일정표', created_by: U.yuna, rev: 0, state: docState('촬영일: 성수 스튜디오\n콜타임 08:00\n제품 12종, 컷당 3앵글'), text: '촬영일: 성수 스튜디오\n콜타임 08:00\n제품 12종, 컷당 3앵글' }, ago(60 * 20))],
    doc_updates: [],
    doc_versions: [],
    push_subscriptions: [],
    timeline: [
      rec('timeline', 'tl0000000000001', { kind: 'schedule', title: 'A사 촬영', at: at(-10, '09:00'), end: at(-8), project: 'A사 홍보영상', done: true, created_by: U.min }),
      rec('timeline', 'tl0000000000002', { kind: 'schedule', title: 'C사 미팅', at: at(-7, '11:00'), project: 'C사 브랜드필름', created_by: U.daeun }),
      rec('timeline', 'tl0000000000003', { kind: 'schedule', title: 'A사 편집', at: at(-3), end: at(4), project: 'A사 홍보영상', created_by: U.jiho }),
      rec('timeline', 'tl0000000000004', { kind: 'note', title: '콘티 확정 — 고객 확인 완료', at: at(-1, '11:00'), project: 'A사 홍보영상', body: '3번 장면만 실내로 바꾸기로 함', created_by: U.seo }),
      rec('timeline', 'tl0000000000005', { kind: 'mail', title: '[A사] 2차 시안 수정 요청드립니다', at: at(0, '10:20'), project: 'A사 홍보영상', mail_from: '김담당 <kim@a-corp.co.kr>', mail_id: 'demo1@a-corp', body: '안녕하세요.\n로고 크기를 조금 줄여 주시고 자막 색을 바꿔 주세요.\n금요일까지 가능할까요?' }),
      rec('timeline', 'tl0000000000006', { kind: 'mail', title: '[B사] 촬영 장소 변경 안내', at: at(0, '09:05'), project: 'B사 제품컷', mail_from: '이수진 <lee@b-corp.co.kr>', mail_id: 'demo2@b-corp', body: '촬영 장소가 성수 스튜디오로 바뀌었습니다.\n주소는 첨부 지도를 참고해 주세요.' }),
      rec('timeline', 'tl0000000000007', { kind: 'schedule', title: '내부 시사회', at: at(0, '15:00'), project: 'A사 홍보영상', created_by: U.daeun }),
      rec('timeline', 'tl0000000000008', { kind: 'schedule', title: 'B사 색보정', at: at(1), end: at(6), project: 'B사 제품컷', created_by: U.yuna }),
      rec('timeline', 'tl0000000000009', { kind: 'schedule', title: 'B사 제품 촬영', at: at(5, '10:00'), project: 'B사 제품컷', body: '조명 2세트, 제품 12종', created_by: U.yuna }),
      rec('timeline', 'tl0000000000010', { kind: 'schedule', title: 'A사 최종 납품', at: at(2), project: 'A사 홍보영상', created_by: U.min }),
    ],
  };
}
