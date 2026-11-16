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
  kind.textContent = destination ? 'WEB APP' : 'COMING SOON';
  counter.textContent = `${String(selected + 1).padStart(2, '0')} / ${String(works.length).padStart(2, '0')}`;
  detailNumber.textContent = String(selected + 1).padStart(2, '0');
  action.hidden = !destination;
  if (destination) action.href = destination;
  else action.removeAttribute('href');

  works.forEach((entry, index) => {
    const offset = (index - selected + works.length) % works.length;
    const angle = (-52 + offset * 360 / works.length) * Math.PI / 180;
    const button = buttons[index];
    button.classList.toggle('is-selected', index === selected);
    button.style.left = `${50 + 43 * Math.cos(angle)}%`;
    button.style.top = `${50 + 43 * Math.sin(angle)}%`;
    button.setAttribute('aria-pressed', String(index === selected));
  });
}

function select(index) { selected = (index + works.length) % works.length; render(); }
document.querySelector('#prev').addEventListener('click', () => select(selected - 1));
document.querySelector('#next').addEventListener('click', () => select(selected + 1));
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); select(selected - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); select(selected + 1); }
});
let startX = null;
dial.addEventListener('pointerdown', event => { startX = event.clientX; });
dial.addEventListener('pointerup', event => {
  if (startX === null) return;
  const distance = event.clientX - startX;
  startX = null;
  if (Math.abs(distance) > 55) select(selected + (distance < 0 ? 1 : -1));
});
dial.addEventListener('pointercancel', () => { startX = null; });
render();
