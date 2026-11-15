// name: アプリ名 / url: 公開URL / symbol: アイコン（文字・絵文字）
// url が空の項目は、サンプルとして「準備中」を表示します。
const apps = [
  { name: 'アプリ 01', url: '', symbol: '✳', colors: ['#91b7d2', '#537f9e'] },
  { name: 'アプリ 02', url: '', symbol: '◈', colors: ['#edb88d', '#ce8664'] },
  { name: 'アプリ 03', url: '', symbol: '♫', colors: ['#b7add7', '#867aa9'] },
  { name: 'アプリ 04', url: '', symbol: '☀', colors: ['#dfbd68', '#c39b44'] },
  { name: 'アプリ 05', url: '', symbol: '✿', colors: ['#91bba7', '#5f917d'] },
  { name: 'アプリ 06', url: '', symbol: '☁', colors: ['#90b6c6', '#568698'] },
];

const grid = document.querySelector('#apps');
const notice = document.querySelector('#notice');
for (const app of apps) {
  let destination;
  try {
    const candidate = new URL(app.url);
    if (['https:', 'http:'].includes(candidate.protocol)) destination = candidate.href;
  } catch { /* 未設定のURLは準備中として扱う */ }
  const item = document.createElement(destination ? 'a' : 'button');
  item.className = 'app';
  if (destination) {
    item.href = destination;
  } else {
    item.type = 'button';
    item.setAttribute('aria-haspopup', 'dialog');
    item.addEventListener('click', () => notice.showModal());
  }
  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.style.setProperty('--light', app.colors[0]);
  icon.style.setProperty('--dark', app.colors[1]);
  icon.textContent = app.symbol;
  const label = document.createElement('span');
  label.className = 'app-label';
  label.textContent = app.name;
  item.append(icon, label);
  if (!destination) {
    const status = document.createElement('span');
    status.className = 'app-status';
    status.textContent = 'サンプル';
    item.append(status);
  }
  grid.append(item);
}

