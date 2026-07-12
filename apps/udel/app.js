import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const VERSION = '1.0.0';
const STORAGE_KEY = 'pocket-works:udel:state';
const SETTINGS_KEY = 'pocket-works:udel:settings';
const app = document.querySelector('#app');

const PROVINCE_SEED = [
  ['Холодный Берег', 'coast', 2, 2],
  ['Волчьи Пущи', 'forest', 1, 1],
  ['Серый Брод', 'river', 2, 1],
  ['Златополье', 'plains', 3, 2],
  ['Каменный Венец', 'hills', 2, 3],
  ['Ржаная Марка', 'plains', 2, 1],
  ['Чернолесье', 'forest', 1, 2],
  ['Солёный Юг', 'coast', 3, 1]
];

const TERRAIN = {
  coast: ['Море', '⚓'], forest: ['Лес', '♠'], river: ['Река', '≈'], plains: ['Равнина', '✦'], hills: ['Холмы', '▲']
};

const RULER_NAMES = ['Радомир', 'Всеволод', 'Мирослав', 'Остромир', 'Борислав', 'Ярополк', 'Святогор', 'Велемир'];
const HEIR_NAMES = ['Лев', 'Яромир', 'Глеб', 'Милан', 'Ростислав', 'Данило', 'Мстислав', 'Тихомир'];
const TRAITS = [
  ['Расчётливый', 'Доход +1 золото'],
  ['Неумолимый', 'Победы дают больше славы'],
  ['Книжник', 'Технологии дешевле'],
  ['Дружелюбный', 'Дипломатия эффективнее'],
  ['Полководец', 'Армия сильнее'],
  ['Благочестивый', 'Духовенство терпеливее']
];

const AMBITIONS = {
  crown: { name: 'Железная корона', desc: 'Покорить все восемь земель до конца кампании.', icon: '♛' },
  dynasty: { name: 'Дом без конца', desc: 'Пережить смену правителя и закончить со стабильностью 65+.', icon: '⚜' },
  enlightenment: { name: 'Век разума', desc: 'Открыть все технологии и принять четыре закона.', icon: '☼' }
};

const TECHS = [
  { id: 'irrigation', icon: '≈', name: 'Каналы', cost: [34, 8], desc: '+1 зерно с равнин и рек.' },
  { id: 'ledgers', icon: '▤', name: 'Счётные книги', cost: [42, 10], desc: '+1 золото с богатых областей.' },
  { id: 'pikes', icon: '♜', name: 'Длинные пики', cost: [52, 15], desc: 'Пехота лучше держит кавалерию.', requires: 'irrigation' },
  { id: 'couriers', icon: '➶', name: 'Гонцы', cost: [55, 18], desc: '+15 к дипломатическим действиям.', requires: 'ledgers' },
  { id: 'standing', icon: '⚔', name: 'Постоянное войско', cost: [70, 22], desc: 'Набор войск не тратит действие.', requires: 'pikes' },
  { id: 'press', icon: '✥', name: 'Печатный двор', cost: [85, 28], desc: '+1 авторитет каждый сезон.', requires: 'couriers' }
];

const LAWS = [
  { id: 'tax', name: 'Налоговый уклад', labels: ['Оброк', 'Подворный сбор', 'Казённая десятина'], desc: ['Спокойные города.', '+2 золота, города недовольны.', '+4 золота, города и знать недовольны.'] },
  { id: 'levy', name: 'Воинская повинность', labels: ['Домовая стража', 'Земское ополчение', 'Всеобщий призыв'], desc: ['Мало войск, знать довольна.', 'Набор дешевле.', 'Большая армия, знать недовольна.'] },
  { id: 'succession', name: 'Наследование', labels: ['Совет рода', 'Первородство', 'Королевская воля'], desc: ['Стабильнее знать.', 'Надёжная передача власти.', 'Сильный правитель, опасная смерть.'] },
  { id: 'faith', name: 'Устройство веры', labels: ['Местные обряды', 'Единый канон', 'Княжеская церковь'], desc: ['Духовенство свободно.', '+1 стабильность.', '+1 авторитет, духовенство злится.'] }
];

const EVENTS = [
  {
    title: 'Неурожай на старых полях', text: 'Старосты просят открыть княжеские амбары. Купцы предлагают сохранить зерно для армии.',
    choices: [
      ['Открыть амбары', s => { s.grain -= 12; s.stability += 7; s.factions.towns += 8; return 'Народ пережил голод без бунта.'; }],
      ['Сохранить запасы', s => { s.gold += 9; s.stability -= 6; s.factions.towns -= 9; return 'Казна цела, но рынки полны злых разговоров.'; }]
    ]
  },
  {
    title: 'Спор о древней меже', text: 'Два рода предъявили разные грамоты на одну и ту же долину.',
    choices: [
      ['Судить по закону', s => { s.authority += 5; s.factions.nobles -= 4; return 'Решение признали справедливым, хотя не все довольны.'; }],
      ['Наградить сильнейшего', s => { s.gold += 8; s.factions.nobles += 5; s.stability -= 3; return 'Сильные благодарны. Слабые запомнили.'; }]
    ]
  },
  {
    title: 'Странствующий мастер', text: 'Чужеземный инженер предлагает построить водяные колёса и просит княжеское покровительство.',
    choices: [
      ['Нанять мастера', s => { s.gold -= 18; s.renown += 7; s.researchDiscount = (s.researchDiscount || 0) + 8; return 'Мастер открыл дворцовую школу механики.'; }],
      ['Отказать', s => { s.gold += 4; return 'Мастер уехал на юг. Казначей доволен экономией.'; }]
    ]
  },
  {
    title: 'Проповедь против роскоши', text: 'Популярный проповедник обвиняет двор в расточительстве.',
    choices: [
      ['Покаяться публично', s => { s.gold -= 10; s.factions.clergy += 10; s.authority += 3; return 'Толпа увидела смирение правителя.'; }],
      ['Запретить проповедь', s => { s.authority += 7; s.factions.clergy -= 12; return 'Тишина восстановлена. Уважение — не совсем.'; }]
    ]
  },
  {
    title: 'Наследник требует похода', text: 'Молодой наследник просит доверить ему отряд и настоящее дело.',
    choices: [
      ['Дать командование', s => { s.heir.martial += 1; s.army.infantry = Math.max(0, s.army.infantry - 10); s.renown += 5; return 'Наследник вернулся опытнее и заметно увереннее.'; }],
      ['Оставить при дворе', s => { s.heir.diplomacy += 1; s.factions.nobles -= 3; return 'Наследник учится терпению. Неохотно.'; }]
    ]
  }
];

let settings = loadSettings();
let state = loadState();
let currentTab = 'map';
let selectedProvince = null;
let toastTimer = null;
let audioContext = null;
let battle = null;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uid() { return Math.random().toString(36).slice(2, 8); }
function totalArmy(army = state.army) { return army.infantry + army.archers + army.cavalry; }
function enemyName(owner) { return owner === 'north' ? 'Северный союз' : 'Южное княжество'; }
function ownerLabel(owner) { return owner === 'player' ? state?.house || 'Ваш дом' : owner === 'north' ? 'Север' : 'Юг'; }
function relationKey(owner) { return owner === 'north' ? 'north' : 'south'; }
function unitIcon(type) { return type === 'infantry' ? '♟' : type === 'archers' ? '➶' : '♞'; }
function unitName(type) { return type === 'infantry' ? 'Пехота' : type === 'archers' ? 'Лучники' : 'Конница'; }

function loadSettings() {
  try { return { sound: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { sound: true }; }
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw?.version === VERSION && raw.game?.provinces?.length === 8) return raw.game;
  } catch (error) { console.warn('UDЕL save ignored', error); }
  return null;
}
function saveState() {
  if (!state) return;
  state.savedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, game: state }));
}

function newGame(house, ambition) {
  const trait = pick(TRAITS);
  const provinces = PROVINCE_SEED.map((p, index) => ({
    id: `p${index}`, name: p[0], terrain: p[1], wealth: p[2], fort: p[3], loyalty: index >= 2 && index <= 4 ? 68 + Math.floor(Math.random() * 12) : 55 + Math.floor(Math.random() * 12),
    owner: index < 2 ? 'north' : index > 4 ? 'south' : 'player', development: p[2], unrest: 0
  }));
  state = {
    version: VERSION, id: uid(), house: house || 'Дом Ясеня', ambition, season: 1, maxSeasons: 24, actions: 2,
    gold: 62, grain: 48, authority: 44, renown: 5, stability: 58,
    ruler: { name: pick(RULER_NAMES), age: 38 + Math.floor(Math.random() * 9), martial: 3 + Math.floor(Math.random() * 3), diplomacy: 2 + Math.floor(Math.random() * 4), stewardship: 3 + Math.floor(Math.random() * 3), health: 78, trait: trait[0], traitDesc: trait[1] },
    heir: { name: pick(HEIR_NAMES), age: 15 + Math.floor(Math.random() * 8), martial: 2 + Math.floor(Math.random() * 3), diplomacy: 2 + Math.floor(Math.random() * 3), stewardship: 2 + Math.floor(Math.random() * 3) },
    factions: { nobles: 55, clergy: 53, towns: 57 },
    laws: { tax: 0, levy: 0, succession: 0, faith: 0 }, techs: [], provinces,
    army: { infantry: 70, archers: 35, cavalry: 20 }, relations: { north: 5, south: 10 }, wars: { north: false, south: false },
    score: 0, log: [{ season: 1, text: `${house || 'Дом Ясеня'} вступил в борьбу за пограничные земли.` }], pendingEvent: null, gameOver: false, victory: false
  };
  saveState();
  tone('start');
  render();
}

function tone(kind = 'tap') {
  if (!settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    osc.type = kind === 'war' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(kind === 'success' ? 520 : kind === 'war' ? 115 : kind === 'start' ? 240 : 310, now);
    if (kind === 'success') osc.frequency.exponentialRampToValueAtTime(760, now + .16);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.055, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .2);
    osc.connect(gain).connect(audioContext.destination);
    osc.start(now); osc.stop(now + .22);
  } catch {}
}

function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.append(el); }
  el.textContent = message; requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function spendAction() {
  if (state.actions <= 0) { toast('В этом сезоне решения закончились'); return false; }
  state.actions -= 1; return true;
}
function canAfford(gold = 0, authority = 0, renown = 0, grain = 0) {
  return state.gold >= gold && state.authority >= authority && state.renown >= renown && state.grain >= grain;
}
function spend(gold = 0, authority = 0, renown = 0, grain = 0) {
  state.gold -= gold; state.authority -= authority; state.renown -= renown; state.grain -= grain;
}
function addLog(text) { state.log.unshift({ season: state.season, text }); state.log = state.log.slice(0, 30); }
function provinceCount(owner = 'player') { return state.provinces.filter(p => p.owner === owner).length; }
function adjacentEnemy(province) {
  const idx = state.provinces.indexOf(province);
  return [state.provinces[idx - 1], state.provinces[idx + 1]].some(p => p && p.owner !== province.owner);
}

function render() {
  if (!state) return renderMenu();
  if (battle) return renderBattle();
  if (state.gameOver) return renderEnding();
  app.innerHTML = `
    <section class="screen">
      ${renderTopbar()}
      <div class="content" data-touch-action="pan-y">${renderTab()}</div>
      ${renderBottomNav()}
    </section>
    <div class="action-drawer" id="drawer"></div>
    ${state.pendingEvent ? renderEventModal(state.pendingEvent) : ''}
  `;
  bindCommon();
  saveState();
}

function renderMenu() {
  const hasSave = Boolean(loadState());
  app.innerHTML = `
    <section class="menu-screen">
      <div class="menu-crest">♜</div>
      <h1>УДЕЛ</h1>
      <p class="subtitle">Двадцать четыре сезона, одна династия и слишком много соседей, уверенных, что ваша земля — временное недоразумение.</p>
      <div class="menu-actions">
        ${hasSave ? '<button class="ink-button primary" data-action="continue"><strong>Продолжить летопись</strong><small>Вернуться к последнему сезону</small></button>' : ''}
        <button class="ink-button" data-action="setup"><strong>Новая династия</strong><small>Процедурная кампания на 24 сезона</small></button>
        <button class="ink-button" data-action="toggle-sound"><strong>Звук: ${settings.sound ? 'включён' : 'выключен'}</strong><small>Тихие сигналы приказов и событий</small></button>
      </div>
      <div class="menu-foot"><a href="../../" data-app-control data-native-press>← Вернуться в Pocket Works</a></div>
    </section>`;
  app.querySelector('[data-action="continue"]')?.addEventListener('click', () => { state = loadState(); tone('tap'); render(); });
  app.querySelector('[data-action="setup"]').addEventListener('click', renderSetup);
  app.querySelector('[data-action="toggle-sound"]').addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); tone('tap'); renderMenu(); });
}

function renderSetup() {
  let selected = 'crown';
  app.innerHTML = `
    <section class="setup-screen">
      <a class="back-link" href="#" data-action="back">←</a>
      <h1>Основание дома</h1>
      <p>Выберите не бонус, а смысл кампании. Побеждать можно по-разному; облажаться — тоже.</p>
      <label><span class="subhead">Имя династии</span><input class="name-input" maxlength="24" value="Дом Ясеня" aria-label="Имя династии"></label>
      <div class="subhead">Главная амбиция</div>
      <div class="ambition-list">
        ${Object.entries(AMBITIONS).map(([id, a], index) => `<button class="ambition ${index === 0 ? 'selected' : ''}" data-ambition="${id}"><h3>${a.icon} ${a.name}</h3><p>${a.desc}</p></button>`).join('')}
      </div>
      <button class="ink-button primary" style="width:100%;margin-top:16px;text-align:center" data-action="begin"><strong>Начать летопись</strong><small>Карта и соседи будут созданы заново</small></button>
    </section>`;
  app.querySelector('[data-action="back"]').addEventListener('click', e => { e.preventDefault(); renderMenu(); });
  app.querySelectorAll('[data-ambition]').forEach(btn => btn.addEventListener('click', () => { selected = btn.dataset.ambition; app.querySelectorAll('[data-ambition]').forEach(x => x.classList.toggle('selected', x === btn)); tone('tap'); }));
  app.querySelector('[data-action="begin"]').addEventListener('click', () => newGame(app.querySelector('.name-input').value.trim() || 'Дом Ясеня', selected));
}

function renderTopbar() {
  return `<header class="topbar">
    <a class="back-link" href="../../" data-app-control data-native-press aria-label="В Pocket Works">←</a>
    <div class="title-stack"><strong>${state.house}</strong><small>${state.ruler.name}, ${state.ruler.age} лет · действий ${state.actions}/2</small></div>
    <button class="icon-button" data-action="menu" aria-label="Меню">☰</button>
    <div class="resource-strip">
      ${resource('¤', state.gold, 'золото')}${resource('✦', state.grain, 'зерно')}${resource('♛', state.authority, 'власть')}${resource('✧', state.renown, 'слава')}${resource('◆', state.stability, 'порядок')}
    </div>
  </header>`;
}
function resource(icon, value, label) { return `<div class="resource"><b>${icon} ${Math.round(value)}</b><span>${label}</span></div>`; }

function renderBottomNav() {
  const items = [['map','⌖','Земли'],['court','♛','Двор'],['laws','⚖','Законы'],['tech','✥','Знания'],['war','⚔','Война']];
  return `<nav class="bottom-nav">${items.map(i => `<button class="nav-button ${currentTab === i[0] ? 'active' : ''}" data-tab="${i[0]}"><span>${i[1]}</span><small>${i[2]}</small></button>`).join('')}</nav>`;
}
function renderTab() {
  if (currentTab === 'court') return renderCourt();
  if (currentTab === 'laws') return renderLaws();
  if (currentTab === 'tech') return renderTech();
  if (currentTab === 'war') return renderWar();
  return renderMap();
}

function renderMap() {
  return `<section class="map-view">
    <div class="map-head"><div><h2>Пограничье</h2><p>${provinceCount()} из 8 земель · ${state.wars.north || state.wars.south ? 'идёт война' : 'хрупкий мир'}</p></div><div class="turn-seal"><div><b>${state.season}</b><small>сезон</small></div></div></div>
    <div class="realm-map">
      ${state.provinces.map(p => `<button class="province ${p.owner} ${selectedProvince === p.id ? 'selected' : ''} ${p.owner !== 'player' && state.wars[relationKey(p.owner)] && adjacentEnemy(p) ? 'border-war' : ''}" data-province="${p.id}">
        <div class="province-top"><div><h3>${TERRAIN[p.terrain][1]} ${p.name}</h3></div><span class="owner">${ownerLabel(p.owner)}</span></div>
        <div class="province-stats"><span>¤ ${p.wealth + p.development}</span><span>♜ ${p.fort}</span><span>◆ ${Math.round(p.loyalty)}</span></div>
      </button>`).join('')}
    </div>
    <button class="end-turn" data-action="end-turn"><b>↻</b>Завершить<br>сезон</button>
  </section>`;
}

function renderCourt() {
  const r = state.ruler, h = state.heir;
  return `<section class="section">
    <div class="section-title"><h2>Двор</h2><p>Люди здесь опаснее армий: армия хотя бы честно носит копья.</p></div>
    <div class="ruler-banner"><div class="portrait">${r.trait === 'Книжник' ? '✥' : r.trait === 'Полководец' ? '⚔' : '♛'}</div><div><h3>${r.name}</h3><p>${r.age} лет · здоровье ${Math.round(r.health)} · ${r.traitDesc}</p><div class="traits"><span class="trait">${r.trait}</span><span class="trait">правитель</span></div>
      <div class="stats-grid">${stat('⚔', r.martial, 'война')}${stat('☏', r.diplomacy, 'слово')}${stat('¤', r.stewardship, 'казна')}${stat('♥', Math.round(r.health/10), 'тело')}</div></div></div>
    <div class="subhead">Наследник</div>
    <div class="ruler-banner" style="grid-template-columns:66px 1fr"><div class="portrait" style="height:78px;font-size:34px">⚜</div><div><h3>${h.name}</h3><p>${h.age} лет · война ${h.martial}, слово ${h.diplomacy}, казна ${h.stewardship}</p><button class="small-action" data-action="educate">Обучить<br>¤ 16</button></div></div>
    <div class="subhead">Сословия</div>
    ${faction('nobles','Знать','Даёт конницу и создаёт заговоры.')}${faction('clergy','Духовенство','Удерживает порядок и любит вмешиваться.')}${faction('towns','Города','Наполняют казну и требуют вольностей.')}
    <div class="subhead">Последние записи</div><div class="timeline">${state.log.slice(0,7).map(l => `<div class="log-entry"><b>Сезон ${l.season}</b>${l.text}</div>`).join('')}</div>
  </section>`;
}
function stat(icon, value, label) { return `<div class="stat-cell"><b>${icon} ${value}</b><span>${label}</span></div>`; }
function faction(id, name, desc) { const v = state.factions[id]; return `<div class="faction-row"><div><h3>${name}</h3><p>${desc}</p></div><div class="opinion ${v >= 55 ? 'good' : v < 35 ? 'bad' : ''}">${Math.round(v)}</div></div>`; }

function renderLaws() {
  return `<section class="section"><div class="section-title"><h2>Законы</h2><p>Каждый новый порядок делает кого-то богаче, а кого-то будущим мятежником.</p></div>
    ${LAWS.map(l => { const level = state.laws[l.id]; return `<div class="law-row"><div><h3>${l.name}</h3><p><b>${l.labels[level]}</b> — ${l.desc[level]}</p><div class="level-track">${[0,1,2].map(i => `<i class="${i <= level ? 'on' : ''}"></i>`).join('')}</div></div><button class="small-action" data-law="${l.id}" ${level >= 2 || state.actions <= 0 || !canAfford(0,12 + level*7) ? 'disabled' : ''}>Изменить<br>♛ ${12 + level*7}</button></div>`; }).join('')}
  </section>`;
}

function renderTech() {
  return `<section class="section"><div class="section-title"><h2>Знания</h2><p>Технологии меняют правила государства, а не только рисуют плюсик в углу.</p></div>
    ${TECHS.map(t => { const unlocked = state.techs.includes(t.id); const blocked = t.requires && !state.techs.includes(t.requires); const cost = Math.max(5, t.cost[0] - (state.researchDiscount || 0) - (state.ruler.trait === 'Книжник' ? 8 : 0)); return `<div class="tech-row ${unlocked ? 'unlocked' : ''}"><div style="display:grid;grid-template-columns:48px 1fr;gap:10px;align-items:center"><div class="tech-sigil">${t.icon}</div><div><h3>${t.name}</h3><p>${t.desc}${blocked ? ' Требуется предыдущее знание.' : ''}</p></div></div><button class="small-action" data-tech="${t.id}" ${unlocked || blocked || state.actions <= 0 || !canAfford(cost,0,t.cost[1]) ? 'disabled' : ''}>${unlocked ? 'Открыто' : `¤ ${cost}<br>✧ ${t.cost[1]}`}</button></div>`; }).join('')}
  </section>`;
}

function renderWar() {
  return `<section class="section"><div class="section-title"><h2>Война</h2><p>Сначала дипломатия не работает. Потом работает логистика.</p></div>
    <div class="army-total"><span>Сила дружины</span><b>${totalArmy()}</b></div>
    ${armyRow('infantry','♟','Пехота','Держит строй и крепости.',12,8)}${armyRow('archers','➶','Лучники','Сильны до соприкосновения.',16,10)}${armyRow('cavalry','♞','Конница','Ломает слабые фланги.',24,13)}
    <div class="subhead">Соседи</div>
    ${diplomacyRow('north','Северный союз','Два суровых рода за лесами.')}${diplomacyRow('south','Южное княжество','Богатые порты и дорогая кавалерия.')}
  </section>`;
}
function armyRow(id, icon, name, desc, gold, grain) { const count = state.army[id]; const noAction = state.techs.includes('standing'); return `<div class="army-row"><div><h3>${icon} ${name} · ${count}</h3><p>${desc}</p></div><button class="small-action" data-recruit="${id}" ${(!noAction && state.actions <= 0) || !canAfford(gold,0,0,grain) ? 'disabled' : ''}>+10<br>¤ ${gold} ✦ ${grain}</button></div>`; }
function diplomacyRow(id, name, desc) { const war = state.wars[id], rel = state.relations[id]; return `<div class="diplomacy-row"><div><h3>${name} · ${rel > 20 ? 'дружелюбны' : rel < -20 ? 'враждебны' : 'насторожены'}</h3><p>${desc} Отношение ${Math.round(rel)}.</p></div><div style="display:grid;gap:5px"><button class="small-action" data-diplomacy="${id}" ${war || state.actions <= 0 || !canAfford(10) ? 'disabled' : ''}>Посольство<br>¤ 10</button><button class="small-action ${war ? '' : 'danger'}" data-war="${id}" ${state.actions <= 0 ? 'disabled' : ''}>${war ? 'Просить мир' : 'Объявить войну'}</button></div></div>`; }

function renderDrawer(province) {
  const drawer = app.querySelector('#drawer');
  if (!drawer) return;
  const terrain = TERRAIN[province.terrain][0];
  let actions = '';
  if (province.owner === 'player') {
    actions = `<button class="ink-button" data-province-action="develop" ${state.actions <= 0 || !canAfford(18) ? 'disabled' : ''}><strong>Развить землю</strong><small>¤ 18 · доход и богатство</small></button>
      <button class="ink-button" data-province-action="fortify" ${state.actions <= 0 || !canAfford(22) ? 'disabled' : ''}><strong>Укрепить рубеж</strong><small>¤ 22 · крепость +1</small></button>
      <button class="ink-button" data-province-action="feast" ${state.actions <= 0 || !canAfford(12,0,0,8) ? 'disabled' : ''}><strong>Устроить торг</strong><small>¤ 12 ✦ 8 · лояльность +12</small></button>`;
  } else {
    const atWar = state.wars[relationKey(province.owner)];
    const isBorder = state.provinces.some((p, idx) => p.id === province.id && [state.provinces[idx-1],state.provinces[idx+1]].some(n => n?.owner === 'player'));
    actions = `<button class="ink-button primary" data-province-action="attack" ${!atWar || !isBorder || totalArmy() < 25 ? 'disabled' : ''}><strong>Начать поход</strong><small>${!atWar ? 'Сначала объявите войну' : !isBorder ? 'Нет общей границы' : 'Расставить войска и атаковать'}</small></button>`;
  }
  drawer.innerHTML = `<div class="drawer-head"><div><h3>${province.name}</h3><p>${terrain} · богатство ${province.wealth + province.development} · крепость ${province.fort} · лояльность ${Math.round(province.loyalty)}</p></div><button class="icon-button" data-action="close-drawer">×</button></div><div class="drawer-actions">${actions}</div>`;
  drawer.classList.add('open');
  drawer.querySelector('[data-action="close-drawer"]').addEventListener('click', closeDrawer);
  drawer.querySelectorAll('[data-province-action]').forEach(btn => btn.addEventListener('click', () => provinceAction(province, btn.dataset.provinceAction)));
}
function closeDrawer() { selectedProvince = null; app.querySelector('#drawer')?.classList.remove('open'); app.querySelectorAll('.province').forEach(p => p.classList.remove('selected')); }

function provinceAction(p, action) {
  if (action === 'attack') { battle = createBattle(p, false); closeDrawer(); tone('war'); renderBattle(); return; }
  if (!spendAction()) return;
  if (action === 'develop' && canAfford(18)) { spend(18); p.development += 1; p.wealth += p.development % 2 === 0 ? 1 : 0; p.loyalty += 3; addLog(`${p.name} получила новый рынок и мастерские.`); toast('Земля стала богаче'); }
  if (action === 'fortify' && canAfford(22)) { spend(22); p.fort += 1; state.authority += 2; addLog(`В ${p.name} усилены стены и сторожевые башни.`); toast('Рубеж укреплён'); }
  if (action === 'feast' && canAfford(12,0,0,8)) { spend(12,0,0,8); p.loyalty = clamp(p.loyalty + 12,0,100); state.factions.towns += 3; addLog(`Большой торг примирил жителей области ${p.name}.`); toast('Лояльность выросла'); }
  tone('success'); saveState(); closeDrawer(); render();
}

function bindCommon() {
  app.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => { currentTab = btn.dataset.tab; selectedProvince = null; tone('tap'); render(); }));
  app.querySelectorAll('[data-province]').forEach(btn => btn.addEventListener('click', () => { selectedProvince = btn.dataset.province; app.querySelectorAll('.province').forEach(x => x.classList.toggle('selected', x === btn)); renderDrawer(state.provinces.find(p => p.id === selectedProvince)); tone('tap'); }));
  app.querySelector('[data-action="end-turn"]')?.addEventListener('click', endSeason);
  app.querySelector('[data-action="menu"]')?.addEventListener('click', openGameMenu);
  app.querySelector('[data-action="educate"]')?.addEventListener('click', educateHeir);
  app.querySelectorAll('[data-law]').forEach(btn => btn.addEventListener('click', () => changeLaw(btn.dataset.law)));
  app.querySelectorAll('[data-tech]').forEach(btn => btn.addEventListener('click', () => research(btn.dataset.tech)));
  app.querySelectorAll('[data-recruit]').forEach(btn => btn.addEventListener('click', () => recruit(btn.dataset.recruit)));
  app.querySelectorAll('[data-diplomacy]').forEach(btn => btn.addEventListener('click', () => diplomacy(btn.dataset.diplomacy)));
  app.querySelectorAll('[data-war]').forEach(btn => btn.addEventListener('click', () => toggleWar(btn.dataset.war)));
  app.querySelectorAll('[data-event-choice]').forEach(btn => btn.addEventListener('click', () => resolveEvent(Number(btn.dataset.eventChoice))));
}

function educateHeir() {
  if (!canAfford(16) || state.actions <= 0) return toast('Нужны золото и свободное решение');
  spend(16); spendAction(); const key = pick(['martial','diplomacy','stewardship']); state.heir[key] += 1; state.heir.age += 1; addLog(`${state.heir.name} завершил новый этап обучения.`); tone('success'); render();
}
function changeLaw(id) {
  const level = state.laws[id]; const cost = 12 + level * 7;
  if (level >= 2 || !canAfford(0,cost) || !spendAction()) return;
  spend(0,cost); state.laws[id] += 1;
  if (id === 'tax') { state.factions.towns -= 6 + level * 3; state.factions.nobles -= level * 2; }
  if (id === 'levy') state.factions.nobles -= 7 + level * 3;
  if (id === 'succession') { state.factions.nobles -= 4; state.stability += 4; }
  if (id === 'faith') { state.factions.clergy -= 5 + level * 4; state.authority += 2; }
  addLog(`Принят новый уровень закона: ${LAWS.find(l => l.id === id).labels[level+1]}.`); tone('success'); render();
}
function research(id) {
  const t = TECHS.find(x => x.id === id); const cost = Math.max(5, t.cost[0] - (state.researchDiscount || 0) - (state.ruler.trait === 'Книжник' ? 8 : 0));
  if (state.techs.includes(id) || (t.requires && !state.techs.includes(t.requires)) || !canAfford(cost,0,t.cost[1]) || !spendAction()) return;
  spend(cost,0,t.cost[1]); state.techs.push(id); state.renown += 4; addLog(`Мастера освоили знание «${t.name}».`); tone('success'); render();
}
function recruit(id) {
  const data = { infantry:[12,8], archers:[16,10], cavalry:[24,13] }[id]; const noAction = state.techs.includes('standing');
  if (!canAfford(data[0],0,0,data[1]) || (!noAction && !spendAction())) return;
  spend(data[0],0,0,data[1]); state.army[id] += 10; state.factions.nobles += id === 'cavalry' ? 1 : 0; addLog(`Набрано 10 воинов: ${unitName(id)}.`); tone('success'); render();
}
function diplomacy(id) {
  if (!canAfford(10) || !spendAction()) return;
  spend(10); const bonus = state.techs.includes('couriers') ? 15 : 0; const gain = 10 + state.ruler.diplomacy * 2 + bonus; state.relations[id] = clamp(state.relations[id] + gain, -100, 100); state.renown += 2; addLog(`Посольство улучшило отношения с державой «${enemyName(id)}».`); tone('success'); render();
}
function toggleWar(id) {
  if (!spendAction()) return;
  if (state.wars[id]) {
    const chance = 45 + state.ruler.diplomacy * 5 + state.relations[id] * .25;
    if (Math.random()*100 < chance) { state.wars[id] = false; state.relations[id] = -10; addLog(`Заключён мир с державой «${enemyName(id)}».`); toast('Мир заключён'); }
    else { state.authority -= 5; addLog(`${enemyName(id)} отверг мирные условия.`); toast('Условия отвергнуты'); }
  } else {
    state.wars[id] = true; state.relations[id] = -60; state.authority += 3; state.factions.nobles += 4; addLog(`Объявлена война: ${enemyName(id)}.`); toast('Война началась'); tone('war');
  }
  render();
}

function endSeason() {
  closeDrawer();
  const income = calculateIncome();
  state.gold += income.gold; state.grain += income.grain; state.authority += income.authority;
  state.season += 1; state.actions = 2;
  state.ruler.age += state.season % 4 === 0 ? 1 : 0; state.heir.age += state.season % 4 === 0 ? 1 : 0;
  state.ruler.health -= Math.max(.5, (state.ruler.age - 42) * .08);
  state.stability += state.laws.faith >= 1 ? 1 : 0;
  if (state.techs.includes('press')) state.authority += 1;
  state.provinces.filter(p => p.owner === 'player').forEach(p => { p.loyalty = clamp(p.loyalty + (state.stability - 50) * .025 - p.unrest, 0, 100); });
  factionDrift();
  enemyTurn('north'); enemyTurn('south');
  maybeSuccession();
  checkCollapse();
  if (!state.gameOver && state.season > state.maxSeasons) finishCampaign();
  if (!state.gameOver && !battle && state.season % 2 === 0 && Math.random() < .68) state.pendingEvent = Math.floor(Math.random() * EVENTS.length);
  addLog(`Сезон завершён: казна +${income.gold}, зерно +${income.grain}.`);
  tone('tap'); saveState(); render();
}

function calculateIncome() {
  let gold = 2 + state.ruler.stewardship, grain = 3, authority = 0;
  for (const p of state.provinces.filter(x => x.owner === 'player')) {
    gold += p.wealth + p.development;
    grain += p.terrain === 'plains' || p.terrain === 'river' ? 3 : 1;
    if (state.techs.includes('irrigation') && (p.terrain === 'plains' || p.terrain === 'river')) grain += 1;
    if (state.techs.includes('ledgers') && p.wealth >= 3) gold += 1;
  }
  gold += state.laws.tax * 2;
  return { gold, grain, authority };
}
function factionDrift() {
  const avg = (state.factions.nobles + state.factions.clergy + state.factions.towns) / 3;
  state.stability = clamp(state.stability + (avg - 50) * .03 - (state.wars.north || state.wars.south ? 1 : 0), 0, 100);
  for (const key of Object.keys(state.factions)) state.factions[key] = clamp(state.factions[key] + (50 - state.factions[key]) * .05, 0, 100);
}
function enemyTurn(id) {
  const owned = provinceCount(id); if (!owned) { state.wars[id] = false; return; }
  if (!state.wars[id]) {
    state.relations[id] = clamp(state.relations[id] + (Math.random()*7-3), -100, 100);
    if (state.relations[id] < -45 && Math.random() < .18) { state.wars[id] = true; addLog(`${enemyName(id)} объявляет войну вашему дому.`); }
    return;
  }
  if (Math.random() < .23) {
    const targets = state.provinces.filter((p, idx) => p.owner === 'player' && [state.provinces[idx-1],state.provinces[idx+1]].some(n => n?.owner === id));
    if (targets.length && !battle) { const target = pick(targets); battle = createBattle(target, true, id); addLog(`${enemyName(id)} вторгается в область ${target.name}.`); }
  }
}
function maybeSuccession() {
  const deathRisk = state.ruler.health < 25 ? .22 : state.ruler.age > 62 ? .08 : .01;
  if (Math.random() < deathRisk) {
    const old = state.ruler.name; const heir = state.heir; const trait = pick(TRAITS);
    state.ruler = { ...heir, health: 82, trait: trait[0], traitDesc: trait[1] };
    state.heir = { name: pick(HEIR_NAMES.filter(n => n !== heir.name)), age: 10 + Math.floor(Math.random()*8), martial: 2, diplomacy: 2, stewardship: 2 };
    const successionLoss = state.laws.succession === 0 ? 14 : state.laws.succession === 1 ? 7 : 11;
    state.stability -= successionLoss; state.authority -= 8; state.renown += 8;
    addLog(`${old} умер. ${state.ruler.name} наследует власть.`);
    state.pendingEvent = { special: 'succession', title: 'Смена правителя', text: `${old} скончался. ${state.ruler.name} принимает печать дома. Стабильность потеряна: ${successionLoss}.` };
  }
}
function checkCollapse() {
  if (provinceCount() === 0 || state.stability <= 0) { state.gameOver = true; state.victory = false; }
  if (provinceCount() === 8) { state.gameOver = true; state.victory = true; state.score += 300; }
}
function finishCampaign() {
  const success = state.ambition === 'crown' ? provinceCount() === 8 : state.ambition === 'dynasty' ? state.stability >= 65 && state.season > 12 : state.techs.length === TECHS.length && Object.values(state.laws).filter(x => x > 0).length >= 4;
  state.gameOver = true; state.victory = success;
  state.score = provinceCount()*35 + state.techs.length*22 + state.renown*3 + state.stability*2 + (success ? 250 : 0);
}

function renderEventModal(eventRef) {
  if (typeof eventRef === 'object' && eventRef.special) return `<div class="modal-backdrop"><div class="modal"><span class="kicker">Династия</span><h2>${eventRef.title}</h2><p>${eventRef.text}</p><button class="ink-button primary" style="width:100%;text-align:center" data-event-choice="0"><strong>Принять печать</strong><small>Летопись продолжается</small></button></div></div>`;
  const e = EVENTS[eventRef];
  return `<div class="modal-backdrop"><div class="modal"><span class="kicker">Событие · сезон ${state.season}</span><h2>${e.title}</h2><p>${e.text}</p><div class="choice-list">${e.choices.map((c,i) => `<button class="ink-button ${i===0?'primary':''}" data-event-choice="${i}"><strong>${c[0]}</strong><small>Последствия станут частью летописи</small></button>`).join('')}</div></div></div>`;
}
function resolveEvent(index) {
  if (typeof state.pendingEvent === 'object') { state.pendingEvent = null; tone('success'); render(); return; }
  const e = EVENTS[state.pendingEvent]; const result = e.choices[index][1](state); addLog(`${e.title}: ${result}`); state.pendingEvent = null; tone('success'); render();
}

function openGameMenu() {
  app.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="game-menu"><div class="modal"><span class="kicker">Пауза</span><h2>${state.house}</h2><p>Сезон ${state.season}. Сохранение происходит автоматически после каждого решения.</p><div class="choice-list"><button class="ink-button primary" data-menu-action="resume"><strong>Продолжить</strong></button><button class="ink-button" data-menu-action="sound"><strong>Звук: ${settings.sound ? 'включён' : 'выключен'}</strong></button><a class="ink-button" href="../../" data-app-control data-native-press style="text-decoration:none"><strong>В Pocket Works</strong></a><button class="ink-button danger" data-menu-action="reset"><strong>Начать заново</strong><small>Текущее сохранение будет удалено</small></button></div></div></div>`);
  const menu = app.querySelector('#game-menu');
  menu.querySelector('[data-menu-action="resume"]').addEventListener('click', () => menu.remove());
  menu.querySelector('[data-menu-action="sound"]').addEventListener('click', () => { settings.sound=!settings.sound; saveSettings(); menu.remove(); render(); });
  menu.querySelector('[data-menu-action="reset"]').addEventListener('click', () => { menu.querySelector('.choice-list').innerHTML = `<button class="ink-button danger" data-confirm-reset><strong>Удалить летопись окончательно</strong></button><button class="ink-button" data-cancel-reset><strong>Отмена</strong></button>`; menu.querySelector('[data-confirm-reset]').addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); state=null; battle=null; renderMenu(); }); menu.querySelector('[data-cancel-reset]').addEventListener('click', () => { menu.remove(); openGameMenu(); }); });
}

function createBattle(target, defending, attackerOwner = null) {
  const enemyOwner = attackerOwner || target.owner;
  const enemyScale = 45 + provinceCount(enemyOwner)*12 + target.fort*6 + state.season*1.5;
  const playerScale = Math.max(30, totalArmy());
  const composition = ['infantry','archers','cavalry'];
  return {
    targetId: target.id, defending, enemyOwner, phase: 'deploy', time: 22, command: 45, activeOrder: null,
    deploy: ['infantry','archers','cavalry'], enemyDeploy: composition.sort(() => Math.random()-.5),
    playerUnits: {}, enemyUnits: {}, playerScale, enemyScale, lastTick: 0, interval: null
  };
}

function renderBattle() {
  const target = state.provinces.find(p => p.id === battle.targetId);
  if (battle.phase === 'deploy') {
    app.innerHTML = `<section class="battle-screen"><header class="battle-head"><div class="battle-head-row"><div><h2>${battle.defending ? 'Оборона' : 'Поход'}: ${target.name}</h2><p>Крепость ${target.fort} · противник ${enemyName(battle.enemyOwner)}</p></div><button class="icon-button" data-battle="retreat" aria-label="Отступить">×</button></div></header><div class="deployment"><h2>Расставьте три полка</h2><p>Пехота держит конницу, лучники режут пехоту, конница добирается до лучников. Тапните тип войск в каждом фланге.</p>${['Левый фланг','Центр','Правый фланг'].map((name,lane) => `<div class="deploy-row"><b>${name}</b><div class="deploy-options">${['infantry','archers','cavalry'].map(type => `<button class="deploy-option ${battle.deploy[lane]===type?'selected':''}" data-deploy-lane="${lane}" data-deploy-type="${type}">${unitIcon(type)}<small style="display:block;font:700 8px system-ui">${unitName(type)}</small></button>`).join('')}</div></div>`).join('')}<button class="ink-button primary" style="width:100%;margin-top:16px;text-align:center" data-battle="start"><strong>Поднять знамёна</strong><small>Бой займёт около двадцати секунд</small></button></div><div class="command-panel"><a href="../../" data-app-control data-native-press style="color:inherit;font:800 10px system-ui">← Pocket Works</a></div></section>`;
    app.querySelectorAll('[data-deploy-type]').forEach(btn => btn.addEventListener('click', () => { battle.deploy[Number(btn.dataset.deployLane)] = btn.dataset.deployType; tone('tap'); renderBattle(); }));
    app.querySelector('[data-battle="start"]').addEventListener('click', startBattle);
    app.querySelector('[data-battle="retreat"]').addEventListener('click', retreatBattle);
    return;
  }
  app.innerHTML = `<section class="battle-screen"><header class="battle-head"><div class="battle-head-row"><div><h2>${target.name}</h2><p id="battle-status">Строй сошёлся. Приказы расходуют командование.</p></div><div class="battle-timer" id="battle-timer">${Math.ceil(battle.time)}</div></div></header><div class="battlefield">${[0,1,2].map(renderLane).join('')}</div><div class="command-panel"><div class="command-meter"><i id="command-fill" style="width:${battle.command}%"></i></div><div class="orders">${orderButton('advance','↠','Натиск',25)}${orderButton('hold','▰','Стена',20)}${orderButton('volley','➶','Залп',30)}${orderButton('charge','♞','Удар',40)}</div></div></section>`;
  app.querySelectorAll('[data-order]').forEach(btn => btn.addEventListener('click', () => issueOrder(btn.dataset.order)));
  updateBattleDom();
}
function renderLane(lane) {
  const pu = battle.playerUnits[lane], eu = battle.enemyUnits[lane];
  return `<div class="lane"><span class="lane-label">${lane===0?'левый фланг':lane===1?'центр':'правый фланг'}</span>${renderUnit(pu,'player')}${renderUnit(eu,'enemy')}</div>`;
}
function renderUnit(u, side) { return `<div class="unit ${side} ${u.hp<=0?'routed':''}" id="${side}-${u.lane}" style="left:${side==='player'?u.pos:100-u.pos}%"><div><b>${unitIcon(u.type)}</b><small>${Math.ceil(u.hp)}</small></div><span class="unit-hp"><i style="width:${clamp(u.hp/u.maxHp*100,0,100)}%"></i></span></div>`; }
function orderButton(id, icon, name, cost) { return `<button class="order" data-order="${id}" ${battle.command<cost?'disabled':''}><b>${icon}</b><small>${name}<br>${cost}</small></button>`; }

function startBattle() {
  const weights = { infantry:.42, archers:.3, cavalry:.28 };
  battle.deploy.forEach((type,lane) => { const maxHp = battle.playerScale * weights[type] * (1 + state.ruler.martial*.04); battle.playerUnits[lane] = { lane,type,hp:maxHp,maxHp,pos:16,morale:100 }; });
  battle.enemyDeploy.forEach((type,lane) => { const maxHp = battle.enemyScale * weights[type]; battle.enemyUnits[lane] = { lane,type,hp:maxHp,maxHp,pos:16,morale:100 }; });
  battle.phase='fight'; battle.lastTick=performance.now(); renderBattle();
  battle.interval = requestAnimationFrame(battleLoop);
}
function matchup(attacker, defender) {
  if (attacker === 'infantry' && defender === 'cavalry') return state.techs.includes('pikes') ? 1.45 : 1.18;
  if (attacker === 'archers' && defender === 'infantry') return 1.3;
  if (attacker === 'cavalry' && defender === 'archers') return 1.45;
  if (attacker === defender) return 1;
  return .78;
}
function battleLoop(now) {
  if (!battle || battle.phase !== 'fight') return;
  const dt = Math.min(.1, (now - battle.lastTick)/1000); battle.lastTick=now; battle.time -= dt; battle.command = clamp(battle.command + dt*5.5,0,100);
  for (let lane=0; lane<3; lane++) {
    const p=battle.playerUnits[lane], e=battle.enemyUnits[lane]; if (!p || !e) continue;
    if (p.hp>0) p.pos=clamp(p.pos+dt*(battle.activeOrder==='advance'?8:3),8,48);
    if (e.hp>0) e.pos=clamp(e.pos+dt*3,8,48);
    const distance = 100-p.pos-e.pos;
    const pRange = p.type==='archers'?38:9, eRange=e.type==='archers'?38:9;
    if (p.hp>0 && distance<pRange) { let d=dt*3.4*matchup(p.type,e.type); if (battle.activeOrder==='volley'&&p.type==='archers') d*=2; if (battle.activeOrder==='charge'&&p.type==='cavalry') d*=2.1; if (battle.activeOrder==='hold') d*=.72; e.hp-=d; e.morale-=d*.65; }
    if (e.hp>0 && distance<eRange) { let d=dt*3.15*matchup(e.type,p.type); if (battle.activeOrder==='hold') d*=.58; p.hp-=d; p.morale-=d*.7; }
    if (p.morale<20) p.hp-=dt*1.4; if (e.morale<20) e.hp-=dt*1.4;
  }
  if (battle.activeOrder && now > battle.orderUntil) battle.activeOrder=null;
  updateBattleDom();
  const playerAlive=Object.values(battle.playerUnits).some(u=>u.hp>0), enemyAlive=Object.values(battle.enemyUnits).some(u=>u.hp>0);
  if (battle.time<=0 || !playerAlive || !enemyAlive) return finishBattle();
  battle.interval=requestAnimationFrame(battleLoop);
}
function issueOrder(order) {
  const cost={advance:25,hold:20,volley:30,charge:40}[order]; if (battle.command<cost) return;
  battle.command-=cost; battle.activeOrder=order; battle.orderUntil=performance.now()+2600; tone(order==='charge'?'war':'tap');
  app.querySelector('#battle-status').textContent={advance:'Знамёна идут вперёд.',hold:'Строй сомкнулся и гасит удар.',volley:'Лучники выпускают общий залп.',charge:'Конница бросается в прорыв.'}[order];
}
function updateBattleDom() {
  if (!battle || battle.phase!=='fight') return;
  const timer=app.querySelector('#battle-timer'); if(timer) timer.textContent=Math.max(0,Math.ceil(battle.time));
  const fill=app.querySelector('#command-fill'); if(fill) fill.style.width=`${battle.command}%`;
  for (const side of ['player','enemy']) for (let lane=0;lane<3;lane++) { const u=side==='player'?battle.playerUnits[lane]:battle.enemyUnits[lane], el=app.querySelector(`#${side}-${lane}`); if(!u||!el)continue; el.style.left=`${side==='player'?u.pos:100-u.pos}%`; el.classList.toggle('routed',u.hp<=0); el.querySelector('small').textContent=Math.max(0,Math.ceil(u.hp)); el.querySelector('.unit-hp i').style.width=`${clamp(u.hp/u.maxHp*100,0,100)}%`; }
  app.querySelectorAll('[data-order]').forEach(btn=>btn.disabled=battle.command<{advance:25,hold:20,volley:30,charge:40}[btn.dataset.order]);
}
function finishBattle() {
  cancelAnimationFrame(battle.interval);
  const pHp=Object.values(battle.playerUnits).reduce((a,u)=>a+Math.max(0,u.hp),0), eHp=Object.values(battle.enemyUnits).reduce((a,u)=>a+Math.max(0,u.hp),0);
  const won=pHp>eHp; const target=state.provinces.find(p=>p.id===battle.targetId);
  const initial=Object.values(battle.playerUnits).reduce((a,u)=>a+u.maxHp,0); const lossRatio=clamp(1-pHp/initial,.08,.75);
  for(const type of ['infantry','archers','cavalry']) state.army[type]=Math.max(0,Math.round(state.army[type]*(1-lossRatio*(type==='cavalry'?.8:1))));
  if (won) {
    if (battle.defending) { state.renown+=10; state.authority+=5; addLog(`Войско отбило вторжение в ${target.name}.`); }
    else { target.owner='player'; target.loyalty=38; target.unrest=.35; state.renown+=14; state.authority+=8; addLog(`${target.name} присоединена к владениям дома.`); }
  } else {
    state.stability-=7; state.authority-=5;
    if (battle.defending) { target.owner=battle.enemyOwner; target.loyalty=50; addLog(`${target.name} потеряна после поражения.`); }
    else addLog(`Поход на ${target.name} закончился отступлением.`);
  }
  const result={won,target:target.name,loss:Math.round(lossRatio*100)}; battle=null; checkCollapse(); saveState(); renderBattleResult(result);
}
function renderBattleResult(result) {
  app.innerHTML=`<section class="menu-screen"><div class="menu-crest" style="background:${result.won?'var(--player)':'var(--danger)'}">${result.won?'⚔':'☠'}</div><h1 style="font-size:42px;letter-spacing:.04em">${result.won?'ПОБЕДА':'ПОРАЖЕНИЕ'}</h1><p class="subtitle">${result.won?`Земля ${result.target} осталась за вашим знаменем.`:`Войско не удержало рубеж ${result.target}.`} Потери дружины: около ${result.loss}%.</p><div class="menu-actions"><button class="ink-button primary" data-result-continue><strong>Вернуться к карте</strong></button><a class="ink-button" href="../../" data-app-control data-native-press style="text-decoration:none;text-align:center"><strong>В Pocket Works</strong></a></div></section>`;
  app.querySelector('[data-result-continue]').addEventListener('click',()=>{tone(result.won?'success':'tap');render();});
}
function retreatBattle() { state.authority-=3; state.stability-=2; addLog(`Войско отказалось от битвы за ${state.provinces.find(p=>p.id===battle.targetId).name}.`); battle=null; saveState(); render(); }

function renderEnding() {
  const score=Math.round(state.score || provinceCount()*35+state.techs.length*22+state.renown*3+state.stability*2);
  app.innerHTML=`<section class="menu-screen"><div class="menu-crest" style="background:${state.victory?'var(--player)':'var(--danger)'}">${state.victory?AMBITIONS[state.ambition].icon:'✝'}</div><h1 style="font-size:44px;letter-spacing:.05em">${state.victory?'ЛЕТОПИСЬ СОСТОЯЛАСЬ':'ДОМ ПАЛ'}</h1><p class="subtitle">${state.victory?`Амбиция «${AMBITIONS[state.ambition].name}» исполнена.`:'Земли или порядок были потеряны. Историки уже пишут, что всё было неизбежно.'}<br><br>Счёт: <b>${score}</b> · земли ${provinceCount()}/8 · технологии ${state.techs.length}/${TECHS.length}</p><div class="menu-actions"><button class="ink-button primary" data-ending-new><strong>Новая династия</strong></button><a class="ink-button" href="../../" data-app-control data-native-press style="text-decoration:none;text-align:center"><strong>В Pocket Works</strong></a></div></section>`;
  app.querySelector('[data-ending-new]').addEventListener('click',()=>{localStorage.removeItem(STORAGE_KEY);state=null;renderSetup();});
}

window.addEventListener('pagehide', saveState);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveState(); });
window.__UDEL__ = { getState: () => structuredClone(state), reset: () => { localStorage.removeItem(STORAGE_KEY); state=null; battle=null; renderMenu(); } };

render();
