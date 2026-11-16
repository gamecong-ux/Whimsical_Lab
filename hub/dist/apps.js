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
const step = 360 / works.length;
let selected = 0;
let rotation = 0;
let settleTimer;
const buttons = works.map((entry, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dial-item';
  const angle = index * 2 * Math.PI / works.length;
  button.style.left = `${50 + 47 * Math.cos(angle)}%`;
  button.style.top = `${50 + 47 * Math.sin(angle)}%`;
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

  works.forEach((_, index) => {
    const button = buttons[index];
    button.classList.toggle('is-selected', index === selected);
    button.setAttribute('aria-pressed', String(index === selected));
  });
}

function updateRotation(nextRotation, interacting = false) {
  rotation = nextRotation;
  dial.classList.toggle('is-interacting', interacting);
  dial.style.setProperty('--rotation', `${rotation}deg`);
  dial.style.setProperty('--counter-rotation', `${-rotation}deg`);
  const nextSelected = ((Math.round(-rotation / step) % works.length) + works.length) % works.length;
  if (nextSelected !== selected) { selected = nextSelected; render(); }
}

function settle() {
  clearTimeout(settleTimer);
  const target = Math.round(rotation / step) * step;
  updateRotation(target);
}

function select(index) {
  clearTimeout(settleTimer);
  const normalized = ((index % works.length) + works.length) % works.length;
  const target = -normalized * step + Math.round((rotation + normalized * step) / 360) * 360;
  updateRotation(target);
}
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); select(selected - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); select(selected + 1); }
});
document.addEventListener('wheel', event => {
  if (event.ctrlKey) return;
  event.preventDefault();
  const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
  updateRotation(rotation - pixels * 0.5, true);
  clearTimeout(settleTimer);
  settleTimer = setTimeout(settle, 180);
}, { passive: false });

let drag = null;
let suppressClick = false;
const pointerAngle = event => {
  const rect = dial.getBoundingClientRect();
  return Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2));
};
dial.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  clearTimeout(settleTimer);
  drag = { id: event.pointerId, angle: pointerAngle(event), moved: false };
  dial.setPointerCapture(event.pointerId);
  dial.classList.add('is-dragging');
  dial.classList.add('is-interacting');
});
dial.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const angle = pointerAngle(event);
  let change = angle - drag.angle;
  if (change > Math.PI) change -= Math.PI * 2;
  if (change < -Math.PI) change += Math.PI * 2;
  drag.angle = angle;
  if (Math.abs(change) < 0.003) return;
  updateRotation(rotation + change * 180 / Math.PI, true);
  drag.moved = true;
});
function endDrag() {
  if (!drag) return;
  suppressClick = drag.moved;
  drag = null;
  dial.classList.remove('is-dragging');
  settle();
  setTimeout(() => { suppressClick = false; }, 0);
}
dial.addEventListener('pointerup', endDrag);
dial.addEventListener('pointercancel', endDrag);
dial.addEventListener('click', event => {
  if (suppressClick) { event.preventDefault(); event.stopPropagation(); }
}, true);
render();
updateRotation(0);
