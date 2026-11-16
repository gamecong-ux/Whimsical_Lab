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
let selected = 0;
const buttons = works.map((entry, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dial-item';
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
    const offset = (index - selected + works.length) % works.length;
    const angle = offset * 2 * Math.PI / works.length;
    const button = buttons[index];
    button.classList.toggle('is-selected', index === selected);
    button.style.left = `${50 + 47 * Math.cos(angle)}%`;
    button.style.top = `${50 + 47 * Math.sin(angle)}%`;
    button.setAttribute('aria-pressed', String(index === selected));
  });
}

function select(index) { selected = (index + works.length) % works.length; render(); }
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); select(selected - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); select(selected + 1); }
});
let wheelDelta = 0;
dial.addEventListener('wheel', event => {
  event.preventDefault();
  if (Math.sign(wheelDelta) !== Math.sign(event.deltaY)) wheelDelta = 0;
  wheelDelta += event.deltaY;
  if (Math.abs(wheelDelta) >= 65) {
    select(selected + Math.sign(wheelDelta));
    wheelDelta = 0;
  }
}, { passive: false });

let drag = null;
let suppressClick = false;
const pointerAngle = event => {
  const rect = dial.getBoundingClientRect();
  return Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2));
};
dial.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  drag = { id: event.pointerId, angle: pointerAngle(event), travel: 0, moved: false };
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
  drag.travel += change;
  if (Math.abs(drag.travel) >= Math.PI / 9) {
    select(selected + (drag.travel < 0 ? 1 : -1));
    drag.travel = 0;
    drag.moved = true;
  }
});
function endDrag() {
  if (!drag) return;
  suppressClick = drag.moved;
  drag = null;
  dial.classList.remove('is-dragging');
  setTimeout(() => { suppressClick = false; }, 0);
}
dial.addEventListener('pointerup', endDrag);
dial.addEventListener('pointercancel', endDrag);
dial.addEventListener('click', event => {
  if (suppressClick) { event.preventDefault(); event.stopPropagation(); }
}, true);
render();
