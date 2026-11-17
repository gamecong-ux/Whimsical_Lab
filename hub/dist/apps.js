// 作品を追加するときは、この一覧に name / nameEn / description / url / symbol / color を設定します。
// 作品名は「漢字の名前（name）＋英語の名前（nameEn）」の形にそろえる。nameEn は見出しの横に小さく表示する。
// URL が空の項目は準備中として表示します。画面画像はすべて仮のビジュアルです。
const works = [
  { name: '画像評価帳', nameEn: 'I like it', description: '気に入った画像を集めて、見比べて、残すための小さな道具。', url: 'https://i-like-it-dul.pages.dev/', symbol: '♡', color: '#f3b4c7' },
  { name: 'アプリ 01', description: '新しい作品を準備中です。', url: '', symbol: '✳', color: '#a7c1ff' },
  { name: 'アプリ 02', description: '新しい作品を準備中です。', url: '', symbol: '◈', color: '#f1bb8f' },
  { name: 'アプリ 03', description: '新しい作品を準備中です。', url: '', symbol: '♫', color: '#c2b0fa' },
  { name: 'アプリ 04', description: '新しい作品を準備中です。', url: '', symbol: '☀', color: '#e9ca82' },
  { name: 'アプリ 05', description: '新しい作品を準備中です。', url: '', symbol: '✿', color: '#a8d8bc' },
  { name: 'アプリ 06', description: '新しい作品を準備中です。', url: '', symbol: '☁', color: '#a9cad9' },
];

const items = document.querySelector('#dial-items');
const preview = document.querySelector('#preview');
const title = document.querySelector('#work-title');
const description = document.querySelector('#work-description');
const kind = document.querySelector('#work-kind');
const action = document.querySelector('#open-app');
const counter = document.querySelector('#counter');
const detailNumber = document.querySelector('#detail-number');
const stage = document.querySelector('.stage');
const dial = document.querySelector('.dial-area');
const prism = document.querySelector('.prism');
const lightSvg = document.querySelector('#light');
const step = 360 / works.length;
const DIAL_RADIUS = 0.47; // 円盤の直径に対する記号の配置半径
let selected = -1;

const buttons = works.map((entry, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dial-item';
  const angle = index * 2 * Math.PI / works.length;
  button.style.left = `${50 + DIAL_RADIUS * 100 * Math.cos(angle)}%`;
  button.style.top = `${50 + DIAL_RADIUS * 100 * Math.sin(angle)}%`;
  button.style.setProperty('--item-color', entry.color);
  button.setAttribute('aria-label', `${entry.name}${entry.url ? '' : '、準備中'}を選択`);
  button.title = entry.name;
  const symbol = document.createElement('span');
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = entry.symbol;
  button.append(symbol);
  button.addEventListener('click', () => select(index));
  items.append(button);
  return button;
});

function validUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function render() {
  const work = works[selected];
  const destination = validUrl(work.url);
  stage.style.setProperty('--accent', work.color);
  preview.style.setProperty('--accent', work.color);
  const main = document.createElement('span');
  main.textContent = work.name;
  title.replaceChildren(main);
  if (work.nameEn) {
    const sub = document.createElement('span');
    sub.className = 'work-title-en';
    sub.lang = 'en';
    sub.textContent = work.nameEn;
    title.append(sub);
  }
  description.textContent = work.description;
  kind.textContent = destination ? 'APP' : 'COMING SOON';
  counter.textContent = `APP ${String(selected + 1).padStart(2, '0')} / ${String(works.length).padStart(2, '0')}`;
  detailNumber.textContent = String(selected + 1).padStart(2, '0');
  action.hidden = !destination;
  if (destination) action.href = destination;
  else action.removeAttribute('href');
  buttons.forEach((button, index) => {
    button.classList.toggle('is-selected', index === selected);
    button.setAttribute('aria-pressed', String(index === selected));
  });
  colorLight(work.color);
}

// ───────── ダイヤルの回転 ─────────
// 表示中の角度(current)が目標角度(target)へ毎フレーム近づく。入力は target だけを動かすので、
// ホイール・トラックパッド・ドラッグ・キー操作のどれでも同じなめらかさで回る。
let current = 0;
let target = 0;
let frame = 0;
let lastTime = 0;
let follow = 0.07; // 目標へ近づく速さ（時定数・秒）。小さいほど機敏
let snapTimer;

function applyRotation(value) {
  dial.style.setProperty('--rotation', `${value}deg`);
  dial.style.setProperty('--counter-rotation', `${-value}deg`);
  const next = ((Math.round(-value / step) % works.length) + works.length) % works.length;
  if (next !== selected) { selected = next; render(); }
}

// 揃える動き（スナップ）は、止まった位置から目的の作品まで、決まった時間でゆっくり加速・減速して動く。
// 円盤の動きは操作への反応なので、OS の「アニメーションを減らす」設定でも省かない。
let glide = null;
// 正弦波のカーブで加速・減速する。三次曲線より減速がゆるやかで、止まる直前に急に遅くならない
const easeInOut = t => (1 - Math.cos(Math.PI * t)) / 2;

// 回転中（アニメーション中・ドラッグ中・ホイールで傾けている間）は、光線・分光・アイコンの光を消す
function refreshLight() {
  const rotating = !!frame || !!drag?.moved || wheelBase !== null;
  stage.classList.toggle('is-rotating', rotating);
}

function tick(time) {
  if (glide) {
    if (!glide.start) glide.start = time;
    const t = Math.min(1, (time - glide.start) / glide.duration);
    current = glide.from + (glide.to - glide.from) * easeInOut(t);
    applyRotation(current);
    if (t < 1) { frame = requestAnimationFrame(tick); return; }
    current = target = glide.to;
    glide = null;
    frame = 0; lastTime = 0;
    refreshLight();
    return;
  }
  const dt = Math.min(0.05, (time - (lastTime || time)) / 1000) || 1 / 60;
  lastTime = time;
  current += (target - current) * (1 - Math.exp(-dt / follow));
  if (Math.abs(target - current) < 0.02) current = target;
  applyRotation(current);
  if (current !== target) frame = requestAnimationFrame(tick);
  else { frame = 0; lastTime = 0; refreshLight(); }
}

// 入力に追従する動き（ホイール・ドラッグ中）。進行中のスナップは打ち切る
function moveTo(value, speed) {
  glide = null;
  target = value;
  follow = speed;
  if (!frame) frame = requestAnimationFrame(tick);
  refreshLight();
}

// スナップ：距離に応じた時間（SNAP_MIN〜SNAP_MAX ミリ秒）でなめらかに動く
const SNAP_MIN = 700;
const SNAP_MAX = 1600;
function glideTo(value) {
  const distance = Math.abs(value - current) / step; // 作品何個分か
  target = value;
  glide = {
    from: current,
    to: value,
    start: 0,
    duration: Math.min(SNAP_MAX, SNAP_MIN + 600 * distance),
  };
  if (!frame) frame = requestAnimationFrame(tick);
  refreshLight();
}

const nearest = value => Math.round(value / step) * step;

// ホイールを止めてから揃え始めるまでの待ち時間（ミリ秒）
const SNAP_DELAY = 700;

function snap() {
  clearTimeout(snapTimer);
  // ホイール操作中なら確定済みの作品へ戻す（貯めた途中の量では進めない）
  const goal = wheelBase ?? nearest(target);
  wheelBase = null;
  glideTo(goal);
}

function select(index) {
  clearTimeout(snapTimer);
  wheelBase = null;
  const normalized = ((index % works.length) + works.length) % works.length;
  // 現在の向きから最短の回り方で目的の作品へ
  let goal = -normalized * step;
  goal += Math.round((target - goal) / 360) * 360;
  glideTo(goal);
}

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); select(selected - 1); }
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); select(selected + 1); }
});

// ホイール・トラックパッド：回している間に作品を送る方式。
// - スクロール量を貯め、ADVANCE_PIXELS に届いた時点で、その場で次の作品へなめらかに送る（止めた後に勝手に進まない）
// - 届くまでは、貯めた量に応じて円盤が少しだけ傾き（最大 LEAN 作品分）、回している手応えを返す
// - 届かずに止めると、0.7秒後に元の作品へゆっくり戻る
// マウスの1刻みは環境により1回で100px前後届くことも、細かく分かれて届くこともあるため、機器の種類は判定しない。
// 1刻み133px（画面拡大率の大きいWindowsで一般的）のマウスなら3刻みで次の作品へ（2刻みでは移らない）。
// 1刻み100pxのマウスなら4刻み、125pxなら3刻み。
// 1回の操作（手を止めて揃うまで）で動くのは、操作を始めた作品から前後1作品まで。続けて回しても2個先へは行かない。
const ADVANCE_PIXELS = 333;
const LEAN = 0.4;
const LINE_PIXELS = 40; // 行単位（deltaMode 1）で届くときの1行あたりの量
let wheelBase = null; // ホイール操作中の、確定している作品の角度
let wheelOrigin = 0; // この操作を始めたときの作品の角度
let wheelAccum = 0;
document.addEventListener('wheel', event => {
  if (event.ctrlKey) return; // ピンチ操作・ブラウザのズームは妨げない
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  const pixels = event.deltaMode === 1 ? delta * LINE_PIXELS
    : event.deltaMode === 2 ? Math.sign(delta) * ADVANCE_PIXELS
      : delta;
  if (wheelBase === null) { wheelBase = wheelOrigin = nearest(target); wheelAccum = 0; }
  clearTimeout(snapTimer);
  snapTimer = setTimeout(snap, SNAP_DELAY);
  // この向きにすでに1作品進んでいれば、それ以上は進めない（傾きも出さず、送る動きを邪魔しない）
  const nextBase = wheelBase - Math.sign(pixels) * step;
  if (Math.abs(nextBase - wheelOrigin) > step + 0.01) { wheelAccum = 0; return; }
  // 逆向きに回し始めたら、それまでの貯めをいったん捨てて素直に反応させる
  if (Math.sign(pixels) !== Math.sign(wheelAccum)) wheelAccum = 0;
  wheelAccum += pixels;
  if (Math.abs(wheelAccum) >= ADVANCE_PIXELS) {
    wheelBase -= Math.sign(wheelAccum) * step;
    wheelAccum = 0;
    glideTo(wheelBase);
  } else {
    moveTo(wheelBase - wheelAccum / ADVANCE_PIXELS * LEAN * step, 0.08);
  }
}, { passive: false });

// ドラッグ：指・マウスに直接追従し、離したら最寄りの作品へ。
// 動かさずに離した（タップ・クリックした）ときは、押したアイコンの作品へなめらかに回す。
// 指のわずかなぶれで回らないよう、DRAG_START_PX 動くまではドラッグとみなさない。
const DRAG_START_PX = 6;
let drag = null;
let suppressClick = false;
const pointerAngle = event => {
  const rect = dial.getBoundingClientRect();
  return Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2));
};
dial.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  clearTimeout(snapTimer);
  wheelBase = null;
  const item = event.target.closest('.dial-item');
  drag = {
    id: event.pointerId,
    angle: pointerAngle(event),
    x: event.clientX,
    y: event.clientY,
    moved: false,
    index: item ? buttons.indexOf(item) : -1,
  };
  dial.setPointerCapture(event.pointerId);
});
dial.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  if (!drag.moved) {
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_START_PX) return;
    drag.moved = true;
    drag.angle = pointerAngle(event); // ここから回し始める（それまでのぶれは反映しない）
    dial.classList.add('is-dragging');
    refreshLight();
    return;
  }
  const angle = pointerAngle(event);
  let change = angle - drag.angle;
  if (change > Math.PI) change -= Math.PI * 2;
  if (change < -Math.PI) change += Math.PI * 2;
  drag.angle = angle;
  moveTo(target + change * 180 / Math.PI, 0.02);
});
function endDrag(event) {
  if (!drag) return;
  const { moved, index } = drag;
  drag = null;
  dial.classList.remove('is-dragging');
  // 円盤でつかんだ操作のあとに届くクリックは、ここで処理済みなので無視する
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  if (moved) snap();
  else if (index >= 0 && event.type === 'pointerup') select(index);
  else snap();
  refreshLight();
}
dial.addEventListener('pointerup', endDrag);
dial.addEventListener('pointercancel', endDrag);
dial.addEventListener('click', event => {
  if (suppressClick) { event.preventDefault(); event.stopPropagation(); }
}, true);

// ───────── 光線とプリズム、分光 ─────────
// 円盤の選択位置から水平な光線がプリズムの左面に当たり、右面から分かれた光が詳細のプレビューへ広がる。
// 位置は画面サイズに合わせて計算し、SVG で描く。
const SVG_NS = 'http://www.w3.org/2000/svg';
// prism.png（1448×1086）上の、左面と右面の中点（画像サイズに対する割合）
const PRISM_ENTRY = { x: 0.347, y: 0.428 };
const PRISM_EXIT = { x: 0.649, y: 0.502 };
// 上から下へ並ぶ光の帯。作品の色を一定の割合で混ぜる
const BANDS = ['#ff7eb6', '#b28cff', '#7fb6ff', '#f4f1ff', '#ffd27a', '#ff9a6b'];
const ACCENT_MIX = 0.35;

const svgEl = (name, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

function mixHex(a, b, amount) {
  const parse = hex => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
  };
  try {
    const [x, y] = [parse(a), parse(b)];
    if ([...x, ...y].some(Number.isNaN)) return a;
    return `#${x.map((v, i) => Math.round(v + (y[i] - v) * amount).toString(16).padStart(2, '0')).join('')}`;
  } catch { return a; }
}

const defs = svgEl('defs');
const blurSoft = svgEl('filter', { id: 'blur-soft', x: '-20%', y: '-60%', width: '140%', height: '220%' });
blurSoft.append(svgEl('feGaussianBlur', { stdDeviation: '34' }));
const blurBeam = svgEl('filter', { id: 'blur-beam', x: '-20%', y: '-60%', width: '140%', height: '220%' });
blurBeam.append(svgEl('feGaussianBlur', { stdDeviation: '9' }));
const blurRay = svgEl('filter', { id: 'blur-ray', x: '-10%', y: '-400%', width: '120%', height: '900%' });
blurRay.append(svgEl('feGaussianBlur', { stdDeviation: '3.5' }));
defs.append(blurSoft, blurBeam, blurRay);

// 分光の明るさは横方向のグラデーションで決める（プリズム付近で最大、プレビューの右へ向かって消える）
const fadeBeam = svgEl('linearGradient', { id: 'fade-beam', gradientUnits: 'userSpaceOnUse' });
const fadeSoft = svgEl('linearGradient', { id: 'fade-soft', gradientUnits: 'userSpaceOnUse' });
const beamMask = svgEl('mask', { id: 'mask-beam', maskUnits: 'userSpaceOnUse' });
const softMask = svgEl('mask', { id: 'mask-soft', maskUnits: 'userSpaceOnUse' });
const beamMaskRect = svgEl('rect', { fill: 'url(#fade-beam)' });
const softMaskRect = svgEl('rect', { fill: 'url(#fade-soft)' });
beamMask.append(beamMaskRect);
softMask.append(softMaskRect);
defs.append(fadeBeam, fadeSoft, beamMask, softMask);
const setStops = (gradient, stops) => {
  gradient.replaceChildren(...stops.map(([offset, opacity]) => svgEl('stop', { offset, 'stop-color': '#fff', 'stop-opacity': opacity })));
};
setStops(fadeBeam, [['0', 1], ['0.45', 0.85], ['0.72', 0.35], ['1', 0]]);
setStops(fadeSoft, [['0', 0.8], ['0.35', 0.95], ['0.7', 0.55], ['1', 0]]);

const softGroup = svgEl('g', { filter: 'url(#blur-soft)', mask: 'url(#mask-soft)', class: 'light-soft' });
const beamGroup = svgEl('g', { filter: 'url(#blur-beam)', mask: 'url(#mask-beam)', class: 'light-beam' });
const softBands = BANDS.map(() => softGroup.appendChild(svgEl('polygon')));
const beamBands = BANDS.map(() => beamGroup.appendChild(svgEl('polygon')));
const rayGlow = svgEl('line', { class: 'ray-glow', filter: 'url(#blur-ray)', pathLength: '1' });
const rayCore = svgEl('line', { class: 'ray-core', pathLength: '1' }); // pathLength=1：線が伸びる演出を長さに関係なく同じ指定で行う
const exitGlow = svgEl('circle', { class: 'exit-glow', r: '14', filter: 'url(#blur-soft)' });
lightSvg.append(defs, softGroup, beamGroup, rayGlow, rayCore, exitGlow);

function colorLight(accent) {
  BANDS.forEach((band, i) => {
    const color = mixHex(band, accent, ACCENT_MIX);
    softBands[i].setAttribute('fill', color);
    beamBands[i].setAttribute('fill', color);
  });
  exitGlow.setAttribute('fill', mixHex('#ffffff', accent, 0.3));
  // 光のスクリーンにも同じ色を渡す（CSS の --l1〜--l6）
  BANDS.forEach((band, i) => preview.style.setProperty(`--l${i + 1}`, mixHex(band, accent, ACCENT_MIX)));
}

function layoutLight() {
  const box = stage.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const dialBox = dial.getBoundingClientRect();
  const pv = preview.getBoundingClientRect();
  const local = (x, y) => ({ x: x - box.left, y: y - box.top });
  lightSvg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  lightSvg.setAttribute('width', box.width);
  lightSvg.setAttribute('height', box.height);

  // 光の出発点：円盤の選択位置（右端、水平方向）にある記号のすぐ右
  const itemSize = buttons[0].offsetWidth || 47;
  const start = local(dialBox.left + dialBox.width * (0.5 + DIAL_RADIUS) + itemSize * 0.55, dialBox.top + dialBox.height / 2);

  // 分光の行き先：光のスクリーンの左端。分光はスクリーンの左端の縦幅いっぱいに広がり、スクリーンの中へ溶け込む。
  // スクリーンは右へ向かって手前に回した台形なので、左端の高さは回転前の高さ（offsetHeight）のまま
  const pvLocal = { left: pv.left - box.left, right: pv.right - box.left, top: pv.top - box.top, bottom: pv.bottom - box.top };
  const towardPreview = pvLocal.left > start.x + 120;
  // screen.webp（端がぼけた画像）の左端：半透明になる位置は幅の約6%、そこでの縦の範囲は高さの 29%〜75%。分光の幅をここに合わせる
  const far = towardPreview
    ? { left: pvLocal.left + pv.width * 0.06, right: Math.min(pvLocal.left + pv.width * 0.32, box.width), top: pvLocal.top + pv.height * 0.29, bottom: pvLocal.top + pv.height * 0.75 }
    : { left: box.width * 0.85, right: box.width, top: start.y - 140, bottom: start.y + 140 };

  // プリズム：左面の中点が光線の高さに来るように置く
  const pw = prism.offsetWidth;
  const ph = prism.offsetHeight;
  const entryX = start.x + (far.left - start.x) * (towardPreview ? 0.36 : 0.3);
  const prismLeft = entryX - pw * PRISM_ENTRY.x;
  const prismTop = start.y - ph * PRISM_ENTRY.y;
  prism.style.left = `${prismLeft}px`;
  prism.style.top = `${prismTop}px`;
  const exit = { x: prismLeft + pw * PRISM_EXIT.x, y: prismTop + ph * PRISM_EXIT.y };

  for (const line of [rayGlow, rayCore]) {
    line.setAttribute('x1', start.x);
    line.setAttribute('y1', start.y);
    line.setAttribute('x2', entryX);
    line.setAttribute('y2', start.y);
  }
  exitGlow.setAttribute('cx', exit.x);
  exitGlow.setAttribute('cy', exit.y);

  // 帯ごとに、出口の細い幅から行き先の縦幅を分け合う扇形をつくる
  const n = BANDS.length;
  const span = far.bottom - far.top;
  const origin = 3; // 出口での1本あたりの幅
  BANDS.forEach((_, i) => {
    const y0 = exit.y + (i - n / 2) * origin;
    const y1 = y0 + origin;
    const ty0 = far.top + span * i / n;
    const ty1 = far.top + span * (i + 1) / n;
    // プリズムの内側から始め、スクリーンの左端でちょうど左端の高さいっぱいに広がり、
    // そこから先はスクリーンの中へまっすぐ入って溶ける（分光とスクリーンの幅を合わせる）
    const points = `${exit.x - 6},${y0} ${far.left},${ty0} ${far.right},${ty0} ${far.right},${ty1} ${far.left},${ty1} ${exit.x - 6},${y1}`;
    beamBands[i].setAttribute('points', points);
    // ぼかした層は、左端の範囲から大きくはみ出さない程度に少しだけ太くする
    const pad = span * 0.03;
    softBands[i].setAttribute('points', `${exit.x - 10},${y0 - 4} ${far.left},${ty0 - pad} ${far.right},${ty0 - pad} ${far.right},${ty1 + pad} ${far.left},${ty1 + pad} ${exit.x - 10},${y1 + 4}`);
  });

  // スクリーンの左端（s）までは明るく、そこから先はスクリーンの光へ溶け込むように消す
  const s = Math.min(0.95, Math.max(0.3, (far.left - exit.x) / (far.right - exit.x)));
  setStops(fadeBeam, [['0', 1], [String(s * 0.7), 0.85], [String(s), 0.55], ['1', 0]]);
  setStops(fadeSoft, [['0', 0.8], [String(s), 0.95], ['1', 0]]);
  for (const [gradient, rect] of [[fadeBeam, beamMaskRect], [fadeSoft, softMaskRect]]) {
    gradient.setAttribute('x1', exit.x);
    gradient.setAttribute('x2', far.right);
    gradient.setAttribute('y1', 0);
    gradient.setAttribute('y2', 0);
    // ぼかしがはみ出す分まで覆い、マスクの端で光が切れないようにする
    rect.setAttribute('x', -box.width);
    rect.setAttribute('y', -box.height);
    rect.setAttribute('width', box.width * 3);
    rect.setAttribute('height', box.height * 3);
  }
}

new ResizeObserver(layoutLight).observe(stage);
window.addEventListener('resize', layoutLight);
document.fonts?.ready.then(layoutLight);

applyRotation(0);
layoutLight();
// 読み込み直後は光が消えた状態（is-rotating）から始め、配置が決まったら光が伸びる演出を見せる
setTimeout(refreshLight, 250);
