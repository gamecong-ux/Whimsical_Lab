// 作品を追加するときは、この一覧に name / description / url / symbol / color を設定します。
// URL が空の項目は準備中として表示します。画面画像はすべて仮のビジュアルです。
const works = [
  { name: '画像評価帳', description: '気に入った画像を集めて、見比べて、残すための小さな道具。', url: 'https://i-like-it-dul.pages.dev/', symbol: '♡', color: '#f3b4c7' },
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
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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
  title.textContent = work.name;
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

function tick(time) {
  const dt = Math.min(0.05, (time - (lastTime || time)) / 1000) || 1 / 60;
  lastTime = time;
  const k = reducedMotion.matches ? 1 : 1 - Math.exp(-dt / follow);
  current += (target - current) * k;
  if (Math.abs(target - current) < 0.02) current = target;
  applyRotation(current);
  if (current !== target) frame = requestAnimationFrame(tick);
  else { frame = 0; lastTime = 0; }
}

function moveTo(value, speed) {
  target = value;
  follow = speed;
  if (!frame) frame = requestAnimationFrame(tick);
}

const nearest = value => Math.round(value / step) * step;

function snap() {
  clearTimeout(snapTimer);
  moveTo(nearest(target), 0.09);
}

function select(index) {
  clearTimeout(snapTimer);
  const normalized = ((index % works.length) + works.length) % works.length;
  // 現在の向きから最短の回り方で目的の作品へ
  let goal = -normalized * step;
  goal += Math.round((target - goal) / 360) * 360;
  moveTo(goal, 0.09);
}

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); select(selected - 1); }
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); select(selected + 1); }
});

// マウスホイール：7刻みで次の作品。トラックパッド：指の移動量に比例して連続的に回る（約260pxで1作品）。
// 入力が途切れたら、すぐ（マウス 0.16秒／トラックパッド 0.12秒）最寄りの作品へ素早く揃える。
const NOTCHES_PER_WORK = 7;
const PIXELS_PER_WORK = 260;
document.addEventListener('wheel', event => {
  if (event.ctrlKey) return; // ピンチ操作・ブラウザのズームは妨げない
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  let amount;
  let isNotch;
  if (event.deltaMode === 1) { amount = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / 3)) / NOTCHES_PER_WORK; isNotch = true; }
  else if (event.deltaMode === 2) { amount = Math.sign(delta); isNotch = true; }
  else {
    // 一般的なマウスは1刻み=100px前後の整数。トラックパッドは小さな値や小数が連続で届く
    isNotch = Math.abs(delta) >= 50 && Number.isInteger(delta);
    amount = isNotch
      ? Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / 100)) / NOTCHES_PER_WORK
      : delta / PIXELS_PER_WORK;
  }
  moveTo(target - amount * step, isNotch ? 0.08 : 0.045);
  clearTimeout(snapTimer);
  snapTimer = setTimeout(snap, isNotch ? 160 : 120);
}, { passive: false });

// ドラッグ：指・マウスに直接追従し、離したら最寄りの作品へ
let drag = null;
let suppressClick = false;
const pointerAngle = event => {
  const rect = dial.getBoundingClientRect();
  return Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2));
};
dial.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  clearTimeout(snapTimer);
  drag = { id: event.pointerId, angle: pointerAngle(event), moved: false };
  dial.setPointerCapture(event.pointerId);
  dial.classList.add('is-dragging');
});
dial.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const angle = pointerAngle(event);
  let change = angle - drag.angle;
  if (change > Math.PI) change -= Math.PI * 2;
  if (change < -Math.PI) change += Math.PI * 2;
  drag.angle = angle;
  if (Math.abs(change) < 0.003) return;
  moveTo(target + change * 180 / Math.PI, 0.02);
  drag.moved = true;
});
function endDrag() {
  if (!drag) return;
  suppressClick = drag.moved;
  drag = null;
  dial.classList.remove('is-dragging');
  snap();
  setTimeout(() => { suppressClick = false; }, 0);
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
const rayGlow = svgEl('line', { class: 'ray-glow', filter: 'url(#blur-ray)' });
const rayCore = svgEl('line', { class: 'ray-core' });
const exitGlow = svgEl('circle', { class: 'exit-glow', r: '14', filter: 'url(#blur-soft)' });
lightSvg.append(defs, softGroup, beamGroup, rayGlow, rayCore, exitGlow);

function colorLight(accent) {
  BANDS.forEach((band, i) => {
    const color = mixHex(band, accent, ACCENT_MIX);
    softBands[i].setAttribute('fill', color);
    beamBands[i].setAttribute('fill', color);
  });
  exitGlow.setAttribute('fill', mixHex('#ffffff', accent, 0.3));
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

  // 分光の行き先：プレビュー全体。プレビューが光より左にある狭い画面では、画面右端へ伸ばす
  const pvLocal = { left: pv.left - box.left, right: pv.right - box.left, top: pv.top - box.top, bottom: pv.bottom - box.top };
  const towardPreview = pvLocal.left > start.x + 120;
  const far = towardPreview
    ? { left: pvLocal.left, right: Math.min(pvLocal.right, box.width), top: pvLocal.top + pv.height * 0.06, bottom: pvLocal.bottom - pv.height * 0.04 }
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
    // プリズムの内側から始めて、出口のつなぎ目を自然に見せる
    const points = `${exit.x - 6},${y0} ${far.right},${ty0 - 6} ${far.right},${ty1 + 6} ${exit.x - 6},${y1}`;
    beamBands[i].setAttribute('points', points);
    // ぼかした層は少し太く、上下にも広げる
    const pad = span * 0.08;
    softBands[i].setAttribute('points', `${exit.x - 10},${y0 - 6} ${far.right},${ty0 - pad} ${far.right},${ty1 + pad} ${exit.x - 10},${y1 + 6}`);
  });

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
