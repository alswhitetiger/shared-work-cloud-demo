// 공유 문서 연결: 서버의 합친 상태 + 변경분을 받고, 내 변경을 모아 보낸다.
// 서버와의 통신은 api 객체로 받는다(화면은 PocketBase, 테스트는 가짜 서버).
//   api.getDoc() → { rev, state }          api.listUpdates() → [{ id, data }] (만든 순서)
//   api.subscribe(onEvent(action, rec), onReconnect) → 구독 해제 함수
//   api.createUpdate(data, { keepalive }) → { id }     api.compact(body) → { rev }
import * as Y from '../vendor/yjs.mjs';
import { diffText, applyDiff, toBase64, fromBase64 } from './textsync.js';

export const FLUSH_MS = 300;      // 이만큼 모아서 보낸다
export const COMPACT_AFTER = 100; // 변경분이 이만큼 쌓이면 합쳐서 저장한다
const MAX_APPLIED = 2000;         // 한 번 정리할 때 지우는 변경분 수(서버와 같음)
const RETRY_MS = 5000;

export class DocSession {
  constructor(doc, api, onStatus = () => {}) {
    this.api = api;
    this.onStatus = onStatus;
    this.ydoc = new Y.Doc();
    this.ytext = this.ydoc.getText('body');
    this.applied = new Set(); // 받은 변경분 id(만든 순서). 정리되면 빠진다
    this.pending = [];
    this.timer = null;
    this.retryTimer = null;
    this.dirty = false; // 마지막 정리 뒤에 내가 고친 것이 있는지
    this.safeApply(doc.state);
  }

  // 깨진 데이터 하나 때문에 문서가 열리지 않거나 저장이 멈추지 않게 한다
  safeApply(b64) {
    if (!b64) return;
    try {
      Y.applyUpdate(this.ydoc, fromBase64(b64), 'remote');
    } catch {
      /* 건너뛴다: 다음 정리가 올바른 상태로 덮어쓴다 */
    }
  }

  apply(rec) {
    if (this.applied.has(rec.id)) return;
    this.applied.add(rec.id);
    this.safeApply(rec.data);
  }

  // 서버의 현재 상태를 다시 받는다. 여러 번 받아도 Yjs가 겹친 것은 무시한다.
  async resync() {
    const d = await this.api.getDoc();
    this.safeApply(d.state);
    (await this.api.listUpdates()).forEach((u) => this.apply(u));
  }

  // 구독을 먼저 걸고 나서 불러온다: 그 사이에 생긴 변경도 놓치지 않는다. 다시 연결되면 처음부터 맞춘다.
  async start() {
    this.unsub = await this.api.subscribe((action, rec) => {
      if (action === 'create') this.apply(rec);
      if (action === 'delete') this.applied.delete(rec.id);
    }, () => this.resync().catch(() => {}));
    await this.resync();
    this.ydoc.on('update', (update, origin) => {
      if (origin === 'remote') return;
      this.pending.push(update);
      this.dirty = true;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), FLUSH_MS);
      this.onStatus('saving');
    });
  }

  hasPending() {
    return this.pending.length > 0 || Boolean(this.flushing);
  }

  async flush(opts = {}) {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending.length) return;
    if (this.flushing) { this.again = true; return; } // 보내는 중에 쓴 글은 이번 전송이 끝나면 이어서 보낸다
    this.flushing = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const batch = this.pending;
    this.pending = [];
    try {
      const rec = await this.api.createUpdate(toBase64(Y.mergeUpdates(batch)), opts);
      this.applied.add(rec.id);
      this.onStatus(this.pending.length ? 'saving' : 'saved');
      if (this.applied.size >= COMPACT_AFTER) this.compact();
    } catch (e) {
      this.pending = [...batch, ...this.pending]; // 보내지 못한 변경은 남겨 둔다
      if (e?.status >= 400 && e?.status < 500) {
        this.onStatus('failed'); // 서버가 거절함: 같은 것을 계속 보내지 않는다
      } else {
        this.onStatus(e?.status === 0 ? 'offline' : 'error');
        this.retryTimer = setTimeout(() => this.flush(), RETRY_MS);
      }
    } finally {
      this.flushing = false;
      if (this.again) { this.again = false; if (!this.retryTimer) this.flush(); }
    }
  }

  // 서버의 합친 상태를 먼저 받아 내 문서에 합친 뒤 저장한다. 다른 사람이 먼저 저장했으면(409) 한 번 더 한다.
  // snapshot: 10분 간격과 상관없이 지금 내용을 버전으로 남긴다(되돌리기 직전).
  // 이미 정리 중이면 일반 정리는 그 결과를 기다리고, snapshot 정리는 그게 끝난 뒤 한 번 더 한다.
  compact(opts = {}) {
    if (this.compacting && !opts.snapshot) return this.compacting;
    const run = Promise.resolve(this.compacting).catch(() => false).then(() => this.runCompact(opts));
    const tracked = run.finally(() => { if (this.compacting === tracked) this.compacting = null; });
    this.compacting = tracked;
    return run;
  }

  async runCompact({ snapshot = false }) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const server = await this.api.getDoc();
        this.safeApply(server.state);
        const ids = [...this.applied].slice(0, MAX_APPLIED); // 오래된 것부터: 여러 번에 걸쳐 모두 지워진다
        const res = await this.api.compact({
          rev: server.rev || 0, state: toBase64(Y.encodeStateAsUpdate(this.ydoc)), text: this.ytext.toString(), applied: ids, snapshot,
        });
        ids.forEach((id) => this.applied.delete(id));
        this.dirty = false;
        return Boolean(res);
      } catch (e) {
        if (e?.status !== 409) return false;
      }
    }
    return false;
  }

  // 지금 내용을 버전으로 남긴 뒤 예전 내용으로 바꾼다
  async restore(text) {
    await this.flush();
    await this.compact({ snapshot: true });
    applyDiff(this.ytext, diffText(this.ytext.toString(), text), 'local');
    await this.flush();
  }

  stop() {
    clearTimeout(this.timer);
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.unsub) Promise.resolve(this.unsub).then((off) => off?.()).catch(() => {});
    // 나가기 전에 남은 글을 보내고, 고친 것이 있으면 정리해서 버전·미리보기를 갱신한다
    const leave = async () => {
      if (this.pending.length) await this.flush({ keepalive: true });
      if (this.dirty) await this.compact();
    };
    leave().catch(() => {});
  }
}
