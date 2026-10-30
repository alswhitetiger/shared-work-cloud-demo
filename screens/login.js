import { html, useState } from '../vendor/preact-htm.js';
import { pb } from '../pb.js';
import { errorMessage } from '../lib/errors.js';

// 서버의 영어 검증 코드를 한국어 안내로 바꾼다
const FIELD_ERRORS = {
  validation_not_unique: '이미 가입된 이메일입니다',
  validation_is_email: '이메일 주소를 확인해 주세요',
  validation_length_out_of_range: '비밀번호는 10자 이상이어야 합니다',
  validation_values_mismatch: '비밀번호 확인이 일치하지 않습니다',
  validation_required: '빈칸을 채워 주세요',
};

function signupError(err) {
  const data = err?.response?.data || {};
  const first = Object.values(data).find((f) => f?.code);
  return (first && FIELD_ERRORS[first.code]) || errorMessage(err);
}

function loginError(err) {
  if (err?.status === 400) return '이메일이나 비밀번호가 맞지 않습니다';
  if (err?.status === 403) return '사용이 정지된 계정입니다. 주 PC 담당자에게 문의해 주세요';
  return errorMessage(err);
}

export function Screen() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', passwordConfirm: '', invite_code: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 자동 완성이 여러 칸을 한꺼번에 채워도 앞 칸이 지워지지 않게 이전 값에 이어 붙인다
  const set = (key) => (e) => { const v = e.target.value; setForm((f) => ({ ...f, [key]: v })); };
  const signup = mode === 'signup';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (signup) {
        try {
          await pb.collection('users').create({ ...form, name: form.name.trim(), invite_code: form.invite_code.trim() });
        } catch (err) {
          setError(signupError(err));
          return;
        }
      }
      await pb.collection('users').authWithPassword(form.email.trim(), form.password);
      location.hash = '#/home';
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'forgot') return html`<${AuthShell}><${Forgot} email=${form.email} onBack=${() => setMode('login')} /></${AuthShell}>`;

  return html`
    <${AuthShell}>
      <form class="auth-box" onSubmit=${submit} novalidate>
        <h1>${signup ? '팀에 가입하기' : '로그인'}</h1>
        <p class="lead">${signup ? '팀원에게 받은 초대 코드가 필요합니다.' : '팀 계정으로 로그인하세요.'}</p>
        <div class="seg" role="group" aria-label="로그인 또는 가입">
          <button type="button" aria-pressed=${!signup} onClick=${() => { setMode('login'); setError(''); }}>로그인</button>
          <button type="button" aria-pressed=${signup} onClick=${() => { setMode('signup'); setError(''); }}>가입</button>
        </div>

        ${signup && html`
          <div class="field">
            <label for="name">이름</label>
            <input id="name" autocomplete="name" required value=${form.name} onInput=${set('name')} />
          </div>`}
        <div class="field">
          <label for="email">이메일</label>
          <input id="email" type="email" autocomplete=${signup ? 'email' : 'username'} autocapitalize="none" required
            value=${form.email} onInput=${set('email')} />
        </div>
        <div class="field">
          <label for="password">비밀번호</label>
          <input id="password" type="password" autocomplete=${signup ? 'new-password' : 'current-password'} required
            value=${form.password} onInput=${set('password')} />
          ${signup && html`<p class="hint">10자 이상</p>`}
        </div>
        ${signup && html`
          <div class="field">
            <label for="password2">비밀번호 확인</label>
            <input id="password2" type="password" autocomplete="new-password" required value=${form.passwordConfirm} onInput=${set('passwordConfirm')} />
          </div>
          <div class="field">
            <label for="code">팀 초대 코드</label>
            <input id="code" autocapitalize="none" autocorrect="off" spellcheck="false" required
              value=${form.invite_code} onInput=${set('invite_code')} />
            <p class="hint">팀원에게 받은 코드입니다. 설정 화면에서 누구나 확인할 수 있습니다.</p>
          </div>`}

        ${error && html`<p class="error" role="alert">${error}</p>`}
        <button class="btn primary block" type="submit" disabled=${busy}>
          ${signup ? '가입하고 시작하기' : '로그인'}
        </button>
        ${!signup && html`<button class="link-btn forgot" type="button" onClick=${() => { setMode('forgot'); setError(''); }}>비밀번호를 잊으셨나요?</button>`}
      </form>
    </${AuthShell}>`;
}

export function AuthShell({ children }) {
  return html`
    <div class="auth">
      <section class="auth-brand">
        <p class="wordmark"><span class="brand-mark" aria-hidden="true"></span>공용작업클라우드</p>
        <p class="auth-copy">팀의 할 일, 문서, 대화, 근무 기록을 한곳에서 관리합니다.</p>
      </section>
      ${children}
    </div>`;
}

// 비밀번호 찾기: 가입된 주소인지 알려 주지 않는다(누구에게나 같은 안내)
function Forgot({ email: initial, onBack }) {
  const [email, setEmail] = useState(initial);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) return setError('이메일을 적어 주세요');
    setBusy(true);
    setError('');
    try {
      await pb.collection('users').requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err?.status === 429 ? '요청이 너무 많습니다. 10분 뒤에 다시 시도해 주세요' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return html`
    <form class="auth-box" onSubmit=${submit} novalidate>
      <h1>비밀번호 찾기</h1>
      ${sent ? html`
        <p class="lead">가입된 주소라면 비밀번호를 다시 정하는 메일을 보냈습니다. 메일함과 스팸함을 확인해 주세요. 링크는 30분 동안 쓸 수 있습니다.</p>
        <p class="hint">메일이 오지 않으면 주 PC 담당자에게 알려 주세요. 메일 보내기 설정이 안 되어 있을 수 있습니다.</p>`
      : html`
        <p class="lead">가입한 이메일을 적으면 새 비밀번호를 정하는 링크를 보내 드립니다.</p>
        <div class="field">
          <label for="f-email">이메일</label>
          <input id="f-email" type="email" autocomplete="username" autocapitalize="none" value=${email} onInput=${(e) => setEmail(e.target.value)} />
        </div>
        ${error && html`<p class="error" role="alert">${error}</p>`}
        <button class="btn primary block" type="submit" disabled=${busy}>재설정 메일 보내기</button>`}
      <button class="link-btn forgot" type="button" onClick=${onBack}>로그인으로 돌아가기</button>
    </form>`;
}
