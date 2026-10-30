import { html, useState, useEffect } from '../vendor/preact-htm.js';
import { pb, signOut } from '../pb.js';
import { toast } from '../app.js';
import { AuthShell } from './login.js';

// 메일의 링크(#/reset/토큰)로 들어와 새 비밀번호를 정한다
export function Screen({ params }) {
  // 토큰은 한 번 읽어 두고 주소창·방문 기록에서 지운다(남의 눈이나 기록에 남지 않게)
  const [token] = useState(() => params[0] || '');
  useEffect(() => { if (params[0]) history.replaceState(null, '', '#/reset'); }, []);
  const [pw, setPw] = useState({ password: '', passwordConfirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { const v = e.target.value; setPw((p) => ({ ...p, [k]: v })); };

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (pw.password.length < 10) return setError('새 비밀번호는 10자 이상이어야 합니다');
    if (pw.password !== pw.passwordConfirm) return setError('새 비밀번호 확인이 일치하지 않습니다');
    setBusy(true);
    try {
      await pb.collection('users').confirmPasswordReset(token, pw.password, pw.passwordConfirm);
      await signOut(); // 다른 계정으로 로그인돼 있던 기기라면 정리하고 새 비밀번호로 다시 로그인
      toast('비밀번호를 바꿨습니다. 새 비밀번호로 로그인하세요');
      location.hash = '#/login';
    } catch (err) {
      setError(err?.status === 429
        ? '요청이 너무 많습니다. 잠시 뒤에 다시 시도해 주세요'
        : '링크가 만료되었거나 이미 쓰였습니다. 로그인 화면에서 비밀번호 찾기를 다시 해 주세요');
    } finally {
      setBusy(false);
    }
  }

  return html`
    <${AuthShell}>
      <form class="auth-box" onSubmit=${submit} novalidate>
        <h1>새 비밀번호 정하기</h1>
        <p class="lead">10자 이상으로 정해 주세요.</p>
        <input type="email" autocomplete="username" value="" hidden readonly />
        <div class="field"><label for="r-pw">새 비밀번호</label>
          <input id="r-pw" type="password" autocomplete="new-password" value=${pw.password} onInput=${set('password')} /></div>
        <div class="field"><label for="r-pw2">새 비밀번호 확인</label>
          <input id="r-pw2" type="password" autocomplete="new-password" value=${pw.passwordConfirm} onInput=${set('passwordConfirm')} /></div>
        ${error && html`<p class="error" role="alert">${error}</p>`}
        <button class="btn primary block" type="submit" disabled=${busy || !token}>비밀번호 바꾸기</button>
        <a class="link-btn forgot" href="#/login">로그인 화면으로</a>
      </form>
    </${AuthShell}>`;
}
