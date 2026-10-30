// 홈의 팀 현황: 정지되지 않은 사람마다 오늘 보고를 냈는지, 진행 중인 일이 몇 개인지.
export function teamStatus(people, todayReports, tasks) {
  const reported = new Set(todayReports.map((r) => r.author));
  return people
    .filter((p) => !p.disabled)
    .map((p) => ({
      id: p.id,
      name: p.name,
      reported: reported.has(p.id),
      doing: tasks.filter((t) => t.assignee === p.id && t.status === 'doing').length,
    }));
}

// 할 일 담당자 고르기: 정지되지 않은 사람, 그리고 지금 담당자가 정지됐으면 그 사람도 "(정지됨)"으로 남긴다
// (목록에서 빠지면 '담당자 없음'으로 보여 오해한다)
export function assigneeOptions(people, current) {
  return people
    .filter((p) => !p.disabled || p.id === current)
    .map((p) => ({ id: p.id, label: p.disabled ? `${p.name} (정지됨)` : p.name }));
}
