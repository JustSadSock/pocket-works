(() => {
  const STORAGE_KEY = 'pocket-works:sled:profile';
  const MIGRATION_KEY = 'pocket-works:sled:migration:double-fracture-1.1.0';

  function migrateProfile() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || { version: 1 };
      raw.version = 1;
      raw.lastSetup = { ...(raw.lastSetup || {}), pieRule: false };
      if (localStorage.getItem(MIGRATION_KEY) !== 'done') {
        raw.savedMatch = null;
        localStorage.setItem(MIGRATION_KEY, 'done');
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    } catch (error) {
      console.warn('СЛЕД не смог применить балансную миграцию', error);
    }
  }

  function installStyles() {
    if (document.querySelector('link[data-sled-balance]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './balance.css?v=1.1.0';
    link.dataset.sledBalance = '';
    document.head.append(link);
  }

  function parseMask(value) {
    try { return BigInt(`0x${String(value || '0').replace(/^0x/, '') || '0'}`); }
    catch { return 0n; }
  }

  function countBits(value) {
    let bits = value;
    let count = 0;
    while (bits) {
      bits &= bits - 1n;
      count += 1;
    }
    return count;
  }

  function readSavedGame() {
    try {
      const profile = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return profile?.savedMatch?.game || null;
    } catch {
      return null;
    }
  }

  function syncBoardDamage() {
    const game = readSavedGame();
    if (!game) return;
    const cracked = parseMask(game.cracked);
    const burned = parseMask(game.burned);
    const cells = document.querySelectorAll('#board .cell');
    cells.forEach((cell, index) => {
      const bit = 1n << BigInt(index);
      cell.classList.toggle('is-cracked', (cracked & bit) !== 0n && (burned & bit) === 0n);
    });
    const meter = document.getElementById('burnedCount');
    if (meter) meter.textContent = `${countBits(burned)} сожжено · ${countBits(cracked)} треснуло`;
  }

  function rewriteCopy() {
    const pieButton = document.getElementById('pieRuleButton');
    const pieLine = pieButton?.closest('.switch-line');
    if (pieLine) pieLine.hidden = true;

    const rules = document.querySelectorAll('.rules-list article');
    const secondTitle = rules[1]?.querySelector('h3');
    const secondCopy = rules[1]?.querySelector('p');
    if (secondTitle) secondTitle.textContent = 'Клетка ломается в два этапа';
    if (secondCopy) secondCopy.textContent = 'После первого ухода она трескается, но остаётся проходимой. После второго — проваливается навсегда.';

    const note = document.querySelector('.pie-note');
    if (note) {
      note.innerHTML = '<b>ЗАЧЕМ ДВОЙНОЙ ИЗЛОМ</b><p>Раньше первый шаг навсегда запрещал движение назад: игрок, получивший направление открытия, просто проталкивал камень к своему краю. Теперь соперник может развернуть ход через треснувшую клетку, но второй проход уничтожит её.</p><div class="fracture-legend"><span><i></i>треснула</span><span><i></i>провалилась</span></div>';
    }

    const lead = document.querySelector('.menu-lead');
    if (lead) lead.textContent = 'Уходя впервые, ты трескаешь клетку. Уходя второй раз — уничтожаешь её. Путь можно развернуть, но за возврат придётся заплатить полем.';
  }

  migrateProfile();
  installStyles();
  document.addEventListener('DOMContentLoaded', () => {
    rewriteCopy();
    syncBoardDamage();
    window.setInterval(syncBoardDamage, 90);
  });
})();
