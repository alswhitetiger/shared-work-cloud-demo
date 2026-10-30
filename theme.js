// 화면을 그리기 전에 밝기를 정한다(다른 밝기가 잠깐 번쩍이지 않게). 처음에는 어둡게,
// "기기 설정"을 골랐으면 휴대폰·PC 설정을 따른다. 바꾸는 쪽은 lib/theme.js.
// 보안 설정상 HTML 안에 스크립트를 쓸 수 없어 작은 파일로 둔다.
(function () {
  var t = null;
  try { t = localStorage.getItem('theme'); } catch (e) { /* 저장소를 못 쓰면 어둡게 */ }
  if (t === 'system') t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
})();
