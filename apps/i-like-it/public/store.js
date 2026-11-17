// Google 認証と保存先（Google ドライブのアプリ専用フォルダー / デモ用メモリ）
//
// 保存方式:
//   ドライブの appDataFolder（利用者からは見えない、このアプリ専用の保存領域）に
//   - records.json          … 全記録（評価・メモ等）のインデックス
//   - img-<id>.<ext>        … 元画像
//   - thumb-<id>.webp       … 一覧用の縮小画像
//   を置く。権限は drive.appdata のみを要求するため、利用者のほかのドライブ内ファイルには
//   アクセスできない（読むことも消すこともできない）。

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SCOPES = ['openid', 'email', 'profile', DRIVE_SCOPE].join(' ');
const INDEX_NAME = 'records.json';

export class AuthError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'AuthError';
    this.code = code;
  }
}

const SESSION_KEY = 'session';
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) {
  try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ }
}

function waitForGis(timeout = 15000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function check() {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - t0 > timeout) return reject(new Error('Google のログイン機能を読み込めませんでした。通信状況を確認してください。'));
      setTimeout(check, 100);
    })();
  });
}

export class GoogleAuth {
  constructor(clientId) {
    this.clientId = clientId;
    this.token = null;
    this.expiresAt = 0;
    this.user = null;
  }

  get valid() { return !!this.token && Date.now() < this.expiresAt - 60_000; }

  // 再読み込みしてもログインを保つため、有効期限（約1時間）内のトークンをブラウザーに保存する
  static restore(clientId) {
    try {
      const s = JSON.parse(lsGet(SESSION_KEY) || 'null');
      if (!s?.token || !s.user?.email) return null;
      const a = new GoogleAuth(clientId);
      Object.assign(a, { token: s.token, expiresAt: Number(s.expiresAt) || 0, user: s.user });
      if (!a.valid) { lsSet(SESSION_KEY, null); return null; }
      return a;
    } catch { lsSet(SESSION_KEY, null); return null; }
  }

  saveSession() {
    if (!this.token || !this.user) return;
    const { email, name, picture } = this.user;
    lsSet(SESSION_KEY, JSON.stringify({ token: this.token, expiresAt: this.expiresAt, user: { email, name, picture } }));
  }

  dropToken() {
    this.token = null;
    lsSet(SESSION_KEY, null);
  }

  async requestToken(prompt) {
    await waitForGis();
    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.error) return reject(new AuthError(resp.error, resp.error_description || 'ログインに失敗しました'));
          if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) {
            return reject(new AuthError('drive_denied', 'Google ドライブへのアクセスが許可されませんでした。保存には許可が必要です。'));
          }
          this.token = resp.access_token;
          this.expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
          this.saveSession();
          resolve();
        },
        error_callback: (err) => {
          const closed = err?.type === 'popup_closed';
          reject(new AuthError(err?.type || 'popup_failed', closed ? 'ログイン画面が閉じられました' : 'ログイン画面を開けませんでした（ポップアップがブロックされていないか確認してください）'));
        },
      });
      const opts = { prompt };
      const hint = lsGet('loginHint');
      if (hint && prompt !== 'select_account') opts.login_hint = hint;
      client.requestAccessToken(opts);
    });
  }

  async signIn() {
    await this.requestToken(lsGet('loginHint') ? '' : 'select_account');
    await this.loadUser();
  }

  async reconnect() {
    await this.requestToken('');
    if (!this.user) await this.loadUser();
  }

  async loadUser() {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!r.ok) throw new AuthError('userinfo', 'アカウント情報を取得できませんでした');
    this.user = await r.json();
    lsSet('loginHint', this.user.email);
    this.saveSession();
  }

  signOut() {
    this.token = null;
    this.expiresAt = 0;
    this.user = null;
    lsSet('loginHint', null);
    lsSet(SESSION_KEY, null);
  }
}

export class DriveStore {
  constructor(auth) {
    this.auth = auth;
    this.indexId = null;
    this.kind = 'drive';
  }

  async api(url, opts = {}) {
    if (!this.auth.valid) throw new AuthError('expired', 'ログインの有効期限が切れました。再接続してください。');
    let res;
    try {
      res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${this.auth.token}` } });
    } catch {
      throw new Error('通信できませんでした。ネットワーク接続を確認してください。');
    }
    if (res.status === 401) {
      this.auth.dropToken();
      throw new AuthError('unauthorized', 'Google ドライブとの接続が切れました。再接続してください。');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Google ドライブでエラーが発生しました（${res.status}）`);
      err.status = res.status;
      err.detail = text.slice(0, 300);
      throw err;
    }
    return res;
  }

  async loadIndex() {
    const q = encodeURIComponent(`name='${INDEX_NAME}' and trashed=false`);
    const r = await this.api(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
    const { files } = await r.json();
    if (!files.length) { this.indexId = null; return null; }
    this.indexId = files[0].id;
    const d = await this.api(`${API}/files/${this.indexId}?alt=media`);
    return d.json();
  }

  async saveIndex(data) {
    const body = new Blob([JSON.stringify(data)], { type: 'application/json' });
    if (this.indexId) {
      await this.api(`${UPLOAD}/files/${this.indexId}?uploadType=media`, { method: 'PATCH', body });
    } else {
      this.indexId = await this.create(INDEX_NAME, body);
    }
  }

  async create(name, blob) {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name, parents: ['appDataFolder'] })], { type: 'application/json' }));
    form.append('file', blob);
    const r = await this.api(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', body: form });
    return (await r.json()).id;
  }

  uploadFile(name, blob) { return this.create(name, blob); }

  async download(fileId) {
    const r = await this.api(`${API}/files/${fileId}?alt=media`);
    return r.blob();
  }

  async remove(fileId) {
    try {
      await this.api(`${API}/files/${fileId}`, { method: 'DELETE' });
    } catch (e) {
      if (e.status === 404) return; // すでに無い
      throw e;
    }
  }
}

// デモ用：メモリにのみ保持（再読み込みで消える）。?demo-fail を付けると保存が時々失敗する。
export class MemoryStore {
  constructor({ failRate = 0 } = {}) {
    this.files = new Map();
    this.index = null;
    this.failRate = failRate;
    this.kind = 'demo';
  }
  async wait(ms = 150) {
    await new Promise((r) => setTimeout(r, ms));
    if (Math.random() < this.failRate) throw new Error('（デモ）保存に失敗しました');
  }
  async loadIndex() { await new Promise((r) => setTimeout(r, 200)); return this.index && JSON.parse(this.index); }
  async saveIndex(data) { await this.wait(300); this.index = JSON.stringify(data); }
  async uploadFile(name, blob) { await this.wait(400); const id = crypto.randomUUID(); this.files.set(id, blob); return id; }
  async download(id) {
    await new Promise((r) => setTimeout(r, 80));
    const b = this.files.get(id);
    if (!b) throw new Error('ファイルが見つかりません');
    return b;
  }
  async remove(id) { await this.wait(150); this.files.delete(id); }
}
