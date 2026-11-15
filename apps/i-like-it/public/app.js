import { CONFIG } from './config.js';
import { GoogleAuth, DriveStore, MemoryStore, AuthError } from './store.js';

// ───────── 定数 ─────────
const RATINGS = [
  { key: 'like', name: '好き', desc: '自分の好みとして、どう感じるか' },
  { key: 'want', name: 'やりたい', desc: '自分の作品で取り入れたい・実現したいか' },
  { key: 'objective', name: '客観的', desc: '好みや制作意欲から離れて、完成度や表現の巧さをどう評価するか' },
];
const SCORE_LABELS = { 2: 'いい', 1: 'ややいい', 0: '普通', '-1': 'やや悪い', '-2': '悪い' };
const DEFAULT_SCORE = 0;
const DATA_VERSION = 3; // v3: 評価は -2〜2 の小数（0.01 刻み）。v2 までは 1〜5 の整数
const fmt = (v) => v.toFixed(2);
const labelOf = (v) => SCORE_LABELS[Math.round(v)] ?? '';
const round2 = (v) => Math.round(v * 100) / 100;
const ACCEPT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };
const SORTS = [
  ['created-desc', '登録日が新しい順'],
  ['created-asc', '登録日が古い順'],
  ['updated-desc', '更新日が新しい順'],
  ...RATINGS.flatMap((r) => [[`${r.key}-desc`, `${r.name}が高い順`], [`${r.key}-asc`, `${r.name}が低い順`]]),
];
const THUMB_MAX = 800;

// ───────── 状態 ─────────
const state = {
  records: [],
  pending: [], // アップロード中/失敗した画像
  sort: 'created-desc',
  filters: { like: { min: null, max: null }, want: { min: null, max: null }, objective: { min: null, max: null } },
  conn: 'connected', // connected | reconnect
  save: 'idle', // idle | saving | saved | error
  saveError: null,
  dirty: false,
};
let auth = null;
let store = null;
const root = document.getElementById('app');

// ───────── 小道具 ─────────
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}
const isEditable = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

function toast(message, kind = 'info') {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast ${kind}` }, message);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 4600);
}

function confirmDialog({ title, body, ok = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'confirm' },
      h('h2', null, title),
      h('div', { class: 'confirm-body' }, body),
      h('div', { class: 'confirm-actions' },
        h('button', { class: 'btn', onclick: () => dlg.close('cancel') }, 'キャンセル'),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => dlg.close('ok') }, ok)));
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok'); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('.btn').focus();
  });
}

// ───────── 起動・ログイン ─────────
function init() {
  document.title = CONFIG.appName;
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) return startDemo(params.has('demo-fail'));
  renderLogin();
}

function renderLogin() {
  const configured = !!CONFIG.googleClientId;
  const btn = h('button', { class: 'btn primary big', disabled: !configured }, 'Google でログイン');
  const err = h('p', { class: 'login-error', role: 'alert' });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    err.textContent = '';
    try {
      auth = new GoogleAuth(CONFIG.googleClientId);
      await auth.signIn();
      store = new DriveStore(auth);
      await startApp();
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  });
  root.replaceChildren(
    h('div', { class: 'login' },
      h('div', { class: 'login-card' },
        h('h1', null, CONFIG.appName),
        h('p', { class: 'lead' }, '気になった画像を「好き」「やりたい」「客観的」の三つの観点で評価し、保存します。'),
        btn,
        h('p', { class: 'note' }, 'ログイン時に、Google ドライブ内のこのアプリ専用の保存領域へのアクセスを許可してください。ほかのドライブ内ファイルにはアクセスしません。'),
        !configured && h('p', { class: 'note warn' }, 'Google クライアント ID が未設定です。config.js に設定してください（README.md 参照）。'),
        err,
        h('p', { class: 'demo-link' }, h('a', { href: '?demo' }, 'デモモードで試す'), '（データは保存されません）'))));
}

async function startDemo(fail) {
  store = new MemoryStore({ failRate: fail ? 0.4 : 0 });
  auth = null;
  await startApp();
}

async function startApp() {
  root.replaceChildren(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), '記録を読み込み中…'));
  try {
    const data = await store.loadIndex();
    const oldScale = data && (data.version || 1) < 3; // 1〜5 → -2〜2 に読み替え
    state.records = (data?.records || []).map((r) => normalize(r, oldScale));
    if (oldScale && state.records.length) markDirty(0);
    state.conn = 'connected';
    renderMain();
  } catch (e) {
    root.replaceChildren(h('div', { class: 'loading' },
      h('p', null, '記録を読み込めませんでした。'),
      h('p', { class: 'muted' }, e.message),
      h('div', { class: 'row' },
        h('button', {
          class: 'btn primary',
          onclick: async () => {
            if (e instanceof AuthError && auth) { try { await auth.reconnect(); } catch (er) { toast(er.message, 'error'); return; } }
            startApp();
          },
        }, '再試行'),
        auth && h('button', { class: 'btn', onclick: logout }, 'ログアウト'))));
  }
}

function normalize(r, oldScale = false) {
  const validScore = (v) => {
    if (oldScale) v = Number.isInteger(v) && v >= 1 && v <= 5 ? v - 3 : null;
    return typeof v === 'number' && Number.isFinite(v) && v >= -2 && v <= 2 ? round2(v) : DEFAULT_SCORE;
  };
  return {
    id: r.id,
    imageFileId: r.imageFileId,
    thumbFileId: r.thumbFileId,
    fileName: r.fileName || '',
    mime: r.mime || '',
    width: r.width || 1,
    height: r.height || 1,
    size: r.size || 0,
    ratings: {
      like: validScore(r.ratings?.like),
      want: validScore(r.ratings?.want),
      objective: validScore(r.ratings?.objective),
    },
    createdAt: r.createdAt || new Date().toISOString(),
    updatedAt: r.updatedAt || r.createdAt || new Date().toISOString(),
  };
}

function logout() {
  if (state.dirty || state.save === 'error') {
    if (!window.confirm('保存されていない変更があります。ログアウトすると失われます。続けますか？')) return;
  }
  auth?.signOut();
  location.href = location.pathname;
}

// ───────── 保存（自動・再試行） ─────────
let saveTimer = null;
let saving = false;

function touch(rec) {
  rec.updatedAt = new Date().toISOString();
  markDirty();
}
function markDirty(delay = 700) {
  state.dirty = true;
  setSaveStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, delay);
}
async function flush() {
  clearTimeout(saveTimer);
  if (saving || !state.dirty) return;
  saving = true;
  state.dirty = false;
  setSaveStatus('saving');
  try {
    await store.saveIndex({ app: 'image-rating', version: DATA_VERSION, savedAt: new Date().toISOString(), records: state.records });
    saving = false;
    if (state.dirty) flush();
    else setSaveStatus('saved');
  } catch (e) {
    saving = false;
    state.dirty = true;
    state.saveError = e;
    if (e instanceof AuthError) setConn('reconnect');
    setSaveStatus('error');
  }
}
async function ensureConnected() {
  if (!auth || auth.valid) return true;
  try {
    await auth.reconnect();
    setConn('connected');
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}
async function retrySave() {
  if (!(await ensureConnected())) return;
  flush();
}
async function reconnect() {
  if (!auth) return;
  try {
    await auth.reconnect();
    setConn('connected');
    toast('Google ドライブに再接続しました');
    if (state.dirty) flush();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function setSaveStatus(s) {
  state.save = s;
  document.querySelectorAll('.save-status').forEach(renderSaveStatus);
}
function setConn(c) {
  state.conn = c;
  document.querySelectorAll('.conn-dot').forEach((el) => { el.dataset.conn = c; });
  document.querySelectorAll('.conn-label').forEach((el) => {
    el.textContent = c === 'connected' ? '接続中' : '再接続が必要です';
  });
}
function renderSaveStatus(el) {
  el.dataset.status = state.save;
  const s = state.save;
  if (s === 'idle') el.replaceChildren();
  else if (s === 'saving') el.replaceChildren(h('span', { class: 'dot' }), '保存中…');
  else if (s === 'saved') el.replaceChildren(h('span', { class: 'dot' }), '保存済み');
  else {
    el.replaceChildren(
      h('span', { class: 'dot' }),
      h('span', { title: state.saveError?.message || '' }, '保存失敗'),
      h('button', { class: 'btn small', onclick: retrySave }, '再試行'));
  }
}

window.addEventListener('beforeunload', (e) => {
  if (state.dirty || saving || state.pending.some((p) => p.status === 'uploading')) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ───────── 画像の読み込み（キャッシュ・同時数制限） ─────────
const urlCache = new Map();
const inflight = new Map();
const queue = [];
let active = 0;

function loadUrl(fileId) {
  if (urlCache.has(fileId)) return Promise.resolve(urlCache.get(fileId));
  if (inflight.has(fileId)) return inflight.get(fileId);
  const p = new Promise((resolve, reject) => { queue.push({ fileId, resolve, reject }); pump(); });
  inflight.set(fileId, p);
  p.then(() => inflight.delete(fileId), () => inflight.delete(fileId));
  return p;
}
function pump() {
  while (active < 4 && queue.length) {
    const job = queue.shift();
    active++;
    store.download(job.fileId)
      .then((b) => { const u = URL.createObjectURL(b); urlCache.set(job.fileId, u); job.resolve(u); })
      .catch((e) => { if (e instanceof AuthError) setConn('reconnect'); job.reject(e); })
      .finally(() => { active--; pump(); });
  }
}
function forgetUrl(fileId) {
  const u = urlCache.get(fileId);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(fileId);
}

// ───────── 画像の登録 ─────────
const fileInput = h('input', { type: 'file', multiple: true, accept: Object.keys(ACCEPT).join(','), hidden: true });
fileInput.addEventListener('change', () => { addFiles([...fileInput.files]); fileInput.value = ''; });

function pickFiles() { fileInput.click(); }

function addFiles(files) {
  const maxBytes = CONFIG.maxFileSizeMB * 1048576;
  const rejected = [];
  const added = [];
  for (const file of files) {
    if (!ACCEPT[file.type]) { rejected.push(`${file.name}（非対応の形式）`); continue; }
    if (file.size > maxBytes) { rejected.push(`${file.name}（${CONFIG.maxFileSizeMB}MB を超えています）`); continue; }
    // 選択順に登録日を1msずつずらし、同時アップロードでも並び順を保つ
    const addedAt = new Date(Date.now() + added.length).toISOString();
    const p = { tempId: crypto.randomUUID(), file, localUrl: URL.createObjectURL(file), status: 'uploading', width: 1, height: 1, addedAt };
    state.pending.unshift(p);
    added.push(p);
  }
  if (rejected.length) toast(`追加できなかった画像: ${rejected.join('、')}。対応形式は JPEG / PNG / GIF / WebP / AVIF です。`, 'error');
  if (!added.length) return;
  renderGrid();
  updateUploadStatus();
  added.forEach(processPending);
}

async function makeThumb(file) {
  const bmp = await createImageBitmap(file);
  const { width, height } = bmp;
  const scale = Math.min(1, THUMB_MAX / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.85));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  return { width, height, thumb: blob };
}

async function processPending(p) {
  p.status = 'uploading';
  updatePendingTile(p);
  updateUploadStatus();
  try {
    if (!p.meta) {
      const m = await makeThumb(p.file);
      p.meta = m;
      p.width = m.width;
      p.height = m.height;
      renderGrid();
    }
    const id = p.recordId || (p.recordId = crypto.randomUUID());
    const ext = ACCEPT[p.file.type];
    if (!p.imageFileId) p.imageFileId = await store.uploadFile(`img-${id}.${ext}`, p.file);
    if (!p.thumbFileId) p.thumbFileId = await store.uploadFile(`thumb-${id}.${p.meta.thumb.type === 'image/webp' ? 'webp' : 'jpg'}`, p.meta.thumb);
    const rec = normalize({
      id,
      imageFileId: p.imageFileId,
      thumbFileId: p.thumbFileId,
      fileName: p.file.name,
      mime: p.file.type,
      width: p.meta.width,
      height: p.meta.height,
      size: p.file.size,
      createdAt: p.addedAt,
      updatedAt: p.addedAt,
    });
    urlCache.set(p.thumbFileId, p.localUrl); // ローカルの画像をそのまま表示に使う
    state.records.push(rec);
    state.pending = state.pending.filter((x) => x !== p);
    markDirty(200);
    renderGrid();
    renderResultBar();
  } catch (e) {
    if (e instanceof AuthError) setConn('reconnect');
    p.status = 'error';
    p.error = e.message;
    updatePendingTile(p);
  }
  updateUploadStatus();
}

async function retryPending(p) {
  if (!(await ensureConnected())) return;
  processPending(p);
}
function cancelPending(p) {
  // アップロード済みの断片があれば片付ける（失敗しても実害はない）
  [p.imageFileId, p.thumbFileId].filter(Boolean).forEach((id) => store.remove(id).catch(() => {}));
  URL.revokeObjectURL(p.localUrl);
  state.pending = state.pending.filter((x) => x !== p);
  renderGrid();
  updateUploadStatus();
}

function updateUploadStatus() {
  const el = document.querySelector('.upload-status');
  if (!el) return;
  const up = state.pending.filter((p) => p.status === 'uploading').length;
  const failed = state.pending.filter((p) => p.status === 'error').length;
  el.replaceChildren(...[
    up ? h('span', null, h('span', { class: 'spinner tiny' }), ` アップロード中 ${up} 件`) : null,
    failed ? h('span', { class: 'fail' }, `アップロード失敗 ${failed} 件`) : null,
  ].filter(Boolean));
}

// ───────── 一覧画面 ─────────
let gridEl;
let resultBarEl;
let filterPanelEl;
let filterBtnEl;
const tiles = new Map(); // id → { el, update }
const pendingTiles = new Map();

function renderMain() {
  const sort = h('select', {
    class: 'sort', 'aria-label': '並べ替え',
    onchange: (e) => { state.sort = e.target.value; renderGrid(); },
  }, SORTS.map(([v, l]) => h('option', { value: v, selected: v === state.sort }, l)));

  filterBtnEl = h('button', { class: 'btn', 'aria-expanded': 'false', onclick: toggleFilterPanel }, '絞り込み', h('span', { class: 'badge' }));
  filterPanelEl = h('div', { class: 'filter-panel', hidden: true });

  const isDemo = store.kind === 'demo';
  const account = h('div', { class: 'account' });
  const accountBtn = h('button', {
    class: 'account-btn', 'aria-haspopup': 'true',
    onclick: (e) => { e.stopPropagation(); account.classList.toggle('open'); },
  },
  h('span', { class: 'conn-dot', 'data-conn': state.conn }),
  isDemo ? 'デモ' : (auth.user?.picture ? h('img', { src: auth.user.picture, alt: '', referrerpolicy: 'no-referrer' }) : (auth.user?.email || 'アカウント')));
  const menu = h('div', { class: 'account-menu' },
    isDemo
      ? [h('p', null, h('strong', null, 'デモモード')), h('p', { class: 'muted' }, 'データはこのページを閉じると消えます。'),
        h('button', { class: 'btn', onclick: () => { location.href = location.pathname; } }, 'デモを終了')]
      : [
        h('p', { class: 'muted small' }, 'ログイン中のアカウント'),
        h('p', null, h('strong', null, auth.user?.name || ''), h('br'), auth.user?.email || ''),
        h('p', { class: 'muted small' }, 'Google ドライブ'),
        h('p', { class: 'conn-text' }, h('span', { class: 'conn-dot', 'data-conn': state.conn }), h('span', { class: 'conn-label' }, '接続中')),
        h('p', { class: 'muted small' }, 'ドライブ内のこのアプリ専用領域に保存しています（ドライブの画面には表示されません）。'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: reconnect }, '再接続'),
          h('button', { class: 'btn', onclick: logout }, 'ログアウト')),
      ]);
  account.append(accountBtn, menu);

  gridEl = h('div', { class: 'grid' });
  resultBarEl = h('div', { class: 'resultbar' });
  const saveEl = h('div', { class: 'save-status', 'aria-live': 'polite' });
  renderSaveStatus(saveEl);

  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, CONFIG.appName, isDemo && h('span', { class: 'demo-badge' }, 'デモ')),
      h('button', { class: 'btn primary', onclick: pickFiles }, '＋ 画像を追加'),
      h('div', { class: 'filter-wrap' }, filterBtnEl, filterPanelEl),
      sort,
      h('div', { class: 'spacer' }),
      h('div', { class: 'upload-status' }),
      saveEl,
      account),
    resultBarEl,
    h('main', { class: 'grid-wrap' }, gridEl),
    fileInput,
    h('div', { class: 'drop-overlay' }, h('div', null, 'ドロップして画像を追加')));

  document.addEventListener('click', (e) => {
    if (!account.contains(e.target)) account.classList.remove('open');
    // 再描画で外れた要素（パネル内のボタン）のクリックでは閉じない
    if (!filterPanelEl.hidden && e.target.isConnected && !filterPanelEl.parentElement.contains(e.target)) closeFilterPanel();
  });
  setConn(state.conn);
  renderResultBar();
  renderGrid();
  updateUploadStatus();
  setupDropAndPaste();
}

function inRange(v, { min, max }) {
  return (min == null || v >= min - 1e-9) && (max == null || v <= max + 1e-9);
}

function visibleRecords() {
  const f = state.filters;
  const list = state.records.filter((r) => RATINGS.every(({ key }) => inRange(r.ratings[key], f[key])));
  const [field, dir] = state.sort.split('-');
  const sign = dir === 'asc' ? 1 : -1;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  list.sort((a, b) => {
    if (field === 'created' || field === 'updated') return sign * cmp(a[`${field}At`], b[`${field}At`]);
    return sign * (a.ratings[field] - b.ratings[field]) || cmp(b.createdAt, a.createdAt);
  });
  return list;
}

const isActive = (r) => r.min != null || r.max != null;
const rangeText = ({ min, max }) => {
  if (min != null && max != null) return `${fmt(min)}〜${fmt(max)}`;
  if (min != null) return `${fmt(min)} 以上`;
  return `${fmt(max)} 以下`;
};

function filterCount() {
  return RATINGS.reduce((n, r) => n + (isActive(state.filters[r.key]) ? 1 : 0), 0);
}

function renderResultBar() {
  if (!resultBarEl) return;
  const total = state.records.length;
  const shown = visibleRecords().length;
  const f = state.filters;
  const chips = RATINGS.filter(({ key }) => isActive(f[key])).map(({ key, name }) => h('button', {
    class: 'chip active', onclick: () => { f[key].min = null; f[key].max = null; onFilterChange(); },
  }, `${name}: ${rangeText(f[key])}`, h('span', { class: 'x' }, '×')));
  resultBarEl.replaceChildren(
    h('span', { class: 'count' }, chips.length ? `${shown} / ${total} 件` : `${total} 件`),
    ...chips,
    ...(chips.length > 1 ? [h('button', { class: 'link', onclick: clearFilters }, 'すべて解除')] : []));
  const n = filterCount();
  filterBtnEl.querySelector('.badge').textContent = n ? String(n) : '';
  filterBtnEl.classList.toggle('has-filter', n > 0);
}

function clearFilters() {
  RATINGS.forEach((r) => { state.filters[r.key].min = null; state.filters[r.key].max = null; });
  onFilterChange();
}

function onFilterChange() {
  renderGrid();
  renderResultBar();
  if (!filterPanelEl.hidden) renderFilterPanel();
}

function toggleFilterPanel(e) {
  e.stopPropagation();
  if (filterPanelEl.hidden) { renderFilterPanel(); filterPanelEl.hidden = false; filterBtnEl.setAttribute('aria-expanded', 'true'); } else closeFilterPanel();
}
function closeFilterPanel() { filterPanelEl.hidden = true; filterBtnEl.setAttribute('aria-expanded', 'false'); }

// 各項目の「下限〜上限」で絞り込む（空欄は制限なし）
function renderFilterPanel() {
  const f = state.filters;
  const numInput = (key, bound, label) => {
    const el = h('input', {
      type: 'number', min: -2, max: 2, step: 0.01, class: 'range-num', 'aria-label': label,
      placeholder: bound === 'min' ? '-2.00' : '2.00',
      value: f[key][bound] == null ? '' : fmt(f[key][bound]),
    });
    el.addEventListener('change', () => {
      const raw = el.value.trim();
      const v = raw === '' ? null : round2(Math.min(2, Math.max(-2, Number(raw))));
      f[key][bound] = Number.isFinite(v) ? v : null;
      el.value = f[key][bound] == null ? '' : fmt(f[key][bound]);
      // 入力欄はそのまま残し、一覧と件数だけ更新する（入力中のフォーカスを奪わない）
      renderGrid();
      renderResultBar();
    });
    return el;
  };
  const set = (key, min, max) => { f[key].min = min; f[key].max = max; onFilterChange(); };
  filterPanelEl.replaceChildren(
    h('p', { class: 'muted small' }, '各項目の範囲（-2.00〜2.00）を指定します。空欄は制限なし。すべての条件を満たす画像を表示します。'),
    ...RATINGS.map(({ key, name }) => h('div', { class: 'filter-row' },
      h('div', { class: 'filter-name' }, name),
      h('div', { class: 'chips' },
        numInput(key, 'min', `${name}の下限`), h('span', { class: 'muted' }, '〜'), numInput(key, 'max', `${name}の上限`),
        h('span', { class: 'quick' },
          h('button', { class: 'link', onclick: () => set(key, 1, null) }, '1以上'),
          h('button', { class: 'link', onclick: () => set(key, 0, null) }, '0以上'),
          h('button', { class: 'link', onclick: () => set(key, null, -1) }, '-1以下'),
          h('button', { class: 'link', onclick: () => set(key, null, null) }, 'クリア'))))),
    h('div', { class: 'filter-foot' }, h('button', { class: 'btn small', onclick: clearFilters }, '条件をすべて解除')));
}

// ───── タイル ─────
const tileRatio = (w, hgt) => Math.max(w / hgt, 1 / 2.5); // 極端に縦長な画像は高さを抑える（画像全体は収める）

const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    io.unobserve(en.target);
    en.target._load?.();
  }
}, { rootMargin: '600px' });

// 2 が左、-2 が右のスライダー（名前・バー・数字を1行に）
function ratingSlider(rec, { key, name, desc }, onChange) {
  const valueEl = h('span', { class: 'slider-value' });
  const input = h('input', {
    type: 'range', min: -2, max: 2, step: 0.01, value: String(rec.ratings[key]),
    'aria-label': name, title: desc,
  });
  const paint = () => {
    const v = rec.ratings[key];
    input.value = String(v);
    input.setAttribute('aria-valuetext', `${fmt(v)}（${labelOf(v)}）`);
    valueEl.textContent = fmt(v);
    valueEl.title = labelOf(v);
  };
  input.addEventListener('input', () => {
    const v = round2(Number(input.value));
    if (v === rec.ratings[key]) return;
    rec.ratings[key] = v;
    paint();
    onChange();
  });
  paint();
  return {
    el: h('div', { class: 'slider-row' }, h('span', { class: 'slider-name', title: desc }, name), input, valueEl),
    paint,
  };
}

function getTile(rec) {
  let t = tiles.get(rec.id);
  if (t) { t.update(); return t; }
  const img = h('img', { alt: '', decoding: 'async', draggable: 'false' });
  const thumb = h('div', { class: 'thumb loading', style: { aspectRatio: String(tileRatio(rec.width, rec.height)) } }, img);
  const scores = h('div', { class: 'scores' });
  const paintScores = () => scores.replaceChildren(...RATINGS.map(({ key, name }) => h('span', { class: 'score' },
    h('span', { class: 'score-name' }, name), h('span', { class: 'score-val' }, fmt(rec.ratings[key])))));
  const sliders = RATINGS.map((r) => ratingSlider(rec, r, () => { touch(rec); paintScores(); }));
  const del = h('button', { class: 'tile-delete', title: '削除', 'aria-label': `${rec.fileName} を削除`, onclick: () => deleteRecord(rec) }, '×');
  const el = h('div', { class: 'tile', tabindex: '-1' },
    thumb, del,
    h('div', { class: 'tile-foot' }, scores, h('div', { class: 'sliders' }, sliders.map((s) => s.el))));
  // スライダー操作中は、マウスがタイルの外に出ても開いたままにする
  el.addEventListener('pointerdown', (e) => {
    if (e.target.type !== 'range') return;
    el.classList.add('dragging');
    const up = () => { el.classList.remove('dragging'); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointerup', up);
  });
  thumb._load = () => {
    loadUrl(rec.thumbFileId).then((u) => { img.src = u; thumb.classList.remove('loading'); })
      .catch(() => {
        thumb.classList.remove('loading');
        thumb.classList.add('failed');
        thumb.dataset.msg = '読み込み失敗';
        setTimeout(() => { thumb.classList.remove('failed'); io.observe(thumb); }, 8000);
      });
  };
  io.observe(thumb);
  t = { el, update() { paintScores(); sliders.forEach((s) => s.paint()); } };
  paintScores();
  tiles.set(rec.id, t);
  return t;
}

function getPendingTile(p) {
  let t = pendingTiles.get(p.tempId);
  if (!t) {
    const thumb = h('div', { class: 'thumb' }, h('img', { src: p.localUrl, alt: '' }));
    const overlay = h('div', { class: 'pending-overlay' });
    const el = h('div', { class: 'tile pending' }, thumb, overlay);
    t = { el, thumb, overlay };
    pendingTiles.set(p.tempId, t);
  }
  t.thumb.style.aspectRatio = String(tileRatio(p.width, p.height));
  return t;
}
function updatePendingTile(p) {
  const t = pendingTiles.get(p.tempId);
  if (!t) return;
  if (p.status === 'uploading') t.overlay.replaceChildren(h('span', { class: 'spinner tiny' }), ' アップロード中…');
  else {
    t.overlay.replaceChildren(
      h('div', { class: 'fail' }, 'アップロード失敗'),
      h('div', { class: 'muted small' }, p.error || ''),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => retryPending(p) }, '再試行'),
        h('button', { class: 'btn small', onclick: () => cancelPending(p) }, '取り消す')));
  }
}

function renderGrid() {
  if (!gridEl) return;
  const list = visibleRecords();
  const items = [
    ...state.pending.map((p) => { const t = getPendingTile(p); updatePendingTile(p); return { el: t.el, ratio: tileRatio(p.width, p.height) }; }),
    ...list.map((r) => ({ el: getTile(r).el, ratio: tileRatio(r.width, r.height) })),
  ];
  for (const [id] of tiles) if (!state.records.some((r) => r.id === id)) tiles.delete(id);
  for (const [id] of pendingTiles) if (!state.pending.some((p) => p.tempId === id)) pendingTiles.delete(id);

  if (!items.length) {
    gridEl.classList.add('empty');
    gridEl.replaceChildren(state.records.length
      ? h('div', { class: 'empty-state' }, h('p', null, '条件に合う画像がありません。'),
        h('button', { class: 'btn', onclick: clearFilters }, '絞り込みを解除'))
      : h('div', { class: 'empty-state drop-hint', onclick: pickFiles },
        h('div', { class: 'big-plus' }, '＋'),
        h('p', null, h('strong', null, '画像をここにドラッグ＆ドロップ')),
        h('p', { class: 'muted' }, 'または、クリックしてファイルを選択／画像をコピーして Ctrl+V で貼り付け'),
        h('p', { class: 'muted small' }, `JPEG / PNG / GIF / WebP / AVIF、1枚 ${CONFIG.maxFileSizeMB}MB まで。複数枚まとめて追加できます。`)));
    return;
  }
  gridEl.classList.remove('empty');
  const W = gridEl.clientWidth || window.innerWidth - 32;
  const gap = 14;
  const target = W < 640 ? 180 : 240;
  const n = Math.max(1, Math.floor((W + gap) / (target + gap)));
  const colW = (W - gap * (n - 1)) / n;
  const cols = Array.from({ length: n }, () => ({ el: h('div', { class: 'col' }), h: 0 }));
  for (const it of items) {
    const c = cols.reduce((a, b) => (b.h < a.h - 0.5 ? b : a));
    c.el.append(it.el);
    c.h += colW / it.ratio + 52 + gap;
  }
  gridEl.replaceChildren(...cols.map((c) => c.el));
}

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderGrid, 120); });

// ───── ドロップ・貼り付け ─────
let dropSetup = false;
function setupDropAndPaste() {
  if (dropSetup) return;
  dropSetup = true;
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging');
    addFiles([...e.dataTransfer.files]);
  });
  window.addEventListener('paste', (e) => {
    if (isEditable(document.activeElement) && document.activeElement.type !== 'range') return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
    addFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `貼り付け-${stamp}${i ? `-${i}` : ''}.${ACCEPT[f.type] || 'png'}`, { type: f.type }))));
  });
}

// ───── 削除 ─────
async function deleteRecord(rec) {
  const ok = await confirmDialog({
    title: 'この画像を削除しますか？',
    body: [
      h('p', null, `「${rec.fileName}」の画像（元画像・縮小画像）と、三つの評価を Google ドライブから削除します。元に戻すことはできません。`),
    ],
    ok: '削除する',
    danger: true,
  });
  if (!ok) return;
  if (!(await ensureConnected())) return;
  try {
    await store.remove(rec.imageFileId);
    await store.remove(rec.thumbFileId);
  } catch (e) {
    if (e instanceof AuthError) setConn('reconnect');
    toast(`削除できませんでした: ${e.message}`, 'error');
    return;
  }
  forgetUrl(rec.imageFileId);
  forgetUrl(rec.thumbFileId);
  state.records = state.records.filter((r) => r !== rec);
  tiles.delete(rec.id);
  markDirty(0);
  toast('削除しました');
  renderGrid();
  renderResultBar();
}

init();
