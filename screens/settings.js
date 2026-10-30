import { html, useState, useEffect } from '../vendor/preact-htm.js';
import { pb, me, forgetUsers, dropPush, pushIsMine, savePush, signOut } from '../pb.js';
import { toast } from '../app.js';
import { errorMessage } from '../lib/errors.js';
import { themeChoice, setTheme, onTheme } from '../lib/theme.js';

const SETTINGS_ID = 'teamsettings001';
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function newCode() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => abc[n % abc.length]).join('');
}

function Push() {
  const [state, setState] = useState('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!pushSupported()) return setState('unsupported');
    // 브라우저 구독만이 아니라 서버 기록이 지금 로그인한 사람 것인지까지 본다(공용 기기)
    pushIsMine().then((mine) => setState(mine ? 'on' : 'off')).catch(() => setState('off'));
  }, []);

  async function enable() {
    setError('');
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      if ((await Notification.requestPermission()) !== 'granted') {
        return setError('알림이 허용되지 않았습니다. 브라우저 설정에서 이 사이트의 알림을 허용한 뒤 다시 눌러 주세요');
      }
      await savePush(reg);
      setState('on');
      toast('이 기기에서 알림을 켰습니다');
    } catch (err) {
      setError(err?.status !== undefined ? errorMessage(err) : '알림을 켜지 못했습니다. 잠시 후 다시 시도해 주세요');
    }
  }

  async function disable() {
    await dropPush();
    setState('off');
    toast('이 기기에서 알림을 껐습니다');
  }

  return html`
    <section class="panel panel-pad">
      <h2 class="section-title">휴대폰 알림</h2>
      <p class="section-desc">1:1 메시지, 팀방 공지, 나에게 배정된 할 일, 내 카드의 댓글이 오면 알려 줍니다. 주 PC가 켜져 있을 때만 갑니다.</p>
      ${state === 'unsupported' && html`
        <div class="hint-box">
          <p><strong>아이폰이라면</strong> 사파리 아래쪽 공유 버튼을 누르고 "홈 화면에 추가"를 고르세요. 홈 화면에 생긴 아이콘으로 다시 열어 이 화면에서 알림을 켜면 됩니다(iOS 16.4 이상).</p>
          <p class="mt-8">그 밖의 기기라면 크롬이나 엣지 최신 버전으로 열어 주세요.</p>
        </div>`}
      ${state === 'on' && html`<p class="ok mb-12">이 기기에서 알림이 켜져 있습니다.</p><button class="btn" type="button" onClick=${disable}>이 기기 알림 끄기</button>`}
      ${state === 'off' && html`<button class="btn primary" type="button" onClick=${enable}>이 기기에서 알림 켜기</button>`}
      ${error && html`<p class="error" role="alert">${error}</p>`}
    </section>`;
}

const WEEK = [['mon', '월'], ['tue', '화'], ['wed', '수'], ['thu', '목'], ['fri', '금'], ['sat', '토'], ['sun', '일']];

function ClockRemind() {
  const user = me();
  const [days, setDays] = useState(user.work_days || []);
  const [at, setAt] = useState(user.remind_at || '');
  const [error, setError] = useState('');
  const toggle = (k) => setDays((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      await pb.collection('users').update(user.id, { work_days: days, remind_at: at });
      await pb.collection('users').authRefresh();
      toast('출근 알림을 저장했습니다');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return html`
    <section class="panel panel-pad">
      <h2 class="section-title">출근 알림</h2>
      <p class="section-desc">근무하는 날 홈을 처음 열면 출근할지 묻습니다. 알림 시각을 정하면 그때까지 출근을 누르지 않았을 때 휴대폰으로 알려 줍니다(알림을 켠 기기로).</p>
      <form onSubmit=${save}>
        <fieldset class="day-picks">
          <legend class="label">근무 요일 (고르지 않으면 매일)</legend>
          ${WEEK.map(([k, label]) => html`
            <label><input type="checkbox" checked=${days.includes(k)} onChange=${() => toggle(k)} />${label}</label>`)}
        </fieldset>
        <div class="field"><label for="s-remind">알림 시각 (비우면 알림 없음)</label>
          <input id="s-remind" type="time" value=${at} onInput=${(e) => setAt(e.target.value)} /></div>
        <button class="btn" type="submit">저장</button>
      </form>
      ${error && html`<p class="error" role="alert">${error}</p>`}
    </section>`;
}

function Invite() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    pb.collection('team_settings').getOne(SETTINGS_ID).then((s) => setCode(s.invite_code)).catch((e) => setError(errorMessage(e)));
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast('초대 코드를 복사했습니다');
    } catch {
      setError('복사하지 못했습니다. 코드를 길게 눌러 직접 복사해 주세요');
    }
  }

  async function renew() {
    if (!confirm('새 코드를 만들면 지금 코드로는 더 이상 가입할 수 없습니다. 바꿀까요?')) return;
    try {
      const s = await pb.collection('team_settings').update(SETTINGS_ID, { invite_code: newCode() });
      setCode(s.invite_code);
      toast('새 초대 코드를 만들었습니다');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return html`
    <section class="panel panel-pad">
      <h2 class="section-title">팀 초대 코드</h2>
      <p class="section-desc">새 팀원은 가입할 때 이 코드를 넣습니다. 이 프로그램 주소와 함께 알려 주세요.</p>
      <p class="invite-code num">${code || '…'}</p>
      <div class="row wrap mt-12">
        <button class="btn" type="button" onClick=${copy} disabled=${!code}>복사</button>
        <button class="btn ghost" type="button" onClick=${renew}>새 코드 만들기</button>
      </div>
      ${error && html`<p class="error" role="alert">${error}</p>`}
    </section>`;
}

function Profile() {
  const user = me();
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ oldPassword: '', password: '', passwordConfirm: '' });
  const [error, setError] = useState('');

  async function saveName(e) {
    e.preventDefault();
    if (!name.trim()) return setError('이름을 적어 주세요');
    try {
      await pb.collection('users').update(user.id, { name: name.trim() });
      await pb.collection('users').authRefresh();
      forgetUsers();
      toast('이름을 바꿨습니다');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setError('');
    if (pw.password.length < 10) return setError('새 비밀번호는 10자 이상이어야 합니다');
    if (pw.password !== pw.passwordConfirm) return setError('새 비밀번호 확인이 일치하지 않습니다');
    try {
      await pb.collection('users').update(user.id, pw);
      // 비밀번호를 바꾸면 기존 로그인이 끊기므로 새 비밀번호로 다시 로그인한다
      await pb.collection('users').authWithPassword(user.email, pw.password);
      setPw({ oldPassword: '', password: '', passwordConfirm: '' });
      toast('비밀번호를 바꿨습니다');
    } catch (err) {
      setError(err?.response?.data?.oldPassword ? '지금 비밀번호가 맞지 않습니다' : errorMessage(err));
    }
  }

  const setP = (k) => (e) => { const v = e.target.value; setPw((p) => ({ ...p, [k]: v })); };
  return html`
    <section class="panel panel-pad">
      <h2 class="section-title mb-12">내 정보</h2>
      <form onSubmit=${saveName} class="row end mb-20">
        <div class="field spacer m-0"><label for="s-name">이름</label>
          <input id="s-name" autocomplete="name" value=${name} onInput=${(e) => setName(e.target.value)} /></div>
        <button class="btn" type="submit">이름 저장</button>
      </form>
      <form onSubmit=${savePassword}>
        <input type="email" autocomplete="username" value=${user.email} hidden readonly />
        <div class="field"><label for="s-old">지금 비밀번호</label>
          <input id="s-old" type="password" autocomplete="current-password" value=${pw.oldPassword} onInput=${setP('oldPassword')} /></div>
        <div class="grid-2">
          <div class="field"><label for="s-new">새 비밀번호</label>
            <input id="s-new" type="password" autocomplete="new-password" value=${pw.password} onInput=${setP('password')} /></div>
          <div class="field"><label for="s-new2">새 비밀번호 확인</label>
            <input id="s-new2" type="password" autocomplete="new-password" value=${pw.passwordConfirm} onInput=${setP('passwordConfirm')} /></div>
        </div>
        <button class="btn" type="submit">비밀번호 바꾸기</button>
      </form>
      ${error && html`<p class="error" role="alert">${error}</p>`}
    </section>`;
}

function Theme() {
  const [choice, setChoice] = useState(themeChoice);
  useEffect(() => onTheme(() => setChoice(themeChoice())), []); // 메뉴의 밝기 단추로 바꿔도 맞춘다
  const pickTheme = (c) => { setTheme(c); setChoice(c); };
  return html`
    <section class="panel panel-pad">
      <h2 class="section-title">화면 밝기</h2>
      <p class="section-desc">이 기기에서만 바뀝니다. "기기 설정"을 고르면 휴대폰·PC의 밝게/어둡게 설정을 따라갑니다.</p>
      <div class="seg" role="group" aria-label="화면 밝기">
        ${[['dark', '어둡게'], ['light', '밝게'], ['system', '기기 설정']].map(([c, l]) => html`
          <button type="button" aria-pressed=${choice === c} onClick=${() => pickTheme(c)}>${l}</button>`)}
      </div>
    </section>`;
}

export function Screen() {
  async function logout() {
    await signOut();
    location.hash = '#/login';
  }
  return html`
    <div class="page-head"><h1>설정</h1></div>
    <div class="settings">
      <${Theme} />
      <${Push} />
      <${ClockRemind} />
      <${Invite} />
      <${Profile} />
      <section class="panel panel-pad">
        <h2 class="section-title">로그아웃</h2>
        <p class="section-desc">이 기기의 알림도 함께 꺼집니다.</p>
        <button class="btn danger" type="button" onClick=${logout}>로그아웃</button>
      </section>
    </div>`;
}
