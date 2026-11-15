(() => {
  const themes = ['obsidian', 'silk', 'glass', 'matte'];
  const storageKey = 'whimsical-lab-background';
  let selected = 'obsidian';
  try {
    const saved = localStorage.getItem(storageKey);
    if (themes.includes(saved)) selected = saved;
  } catch { /* 保存できない環境でも切り替えは利用できる */ }
  document.documentElement.dataset.theme = selected;

  document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('.theme-picker button');
    const update = () => {
      document.documentElement.dataset.theme = selected;
      buttons.forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.theme === selected));
      });
    };
    buttons.forEach(button => button.addEventListener('click', () => {
      selected = button.dataset.theme;
      update();
      try { localStorage.setItem(storageKey, selected); } catch { /* 任意の保存 */ }
    }));
    update();
  });
})();
