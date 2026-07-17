export const APP_STATE_VERSION = 2;
export const BUILD_STEPS = 4;
export const SLOT_META = [
  { id: 0, key: 'chief-left', label: 'левый верх', x: 30, y: 31 },
  { id: 1, key: 'chief', label: 'глава', x: 50, y: 24 },
  { id: 2, key: 'chief-right', label: 'правый верх', x: 70, y: 31 },
  { id: 3, key: 'heart', label: 'сердце', x: 50, y: 50 },
  { id: 4, key: 'base-left', label: 'левое подножие', x: 34, y: 70 },
  { id: 5, key: 'base', label: 'подножие', x: 50, y: 80 },
  { id: 6, key: 'base-right', label: 'правое подножие', x: 66, y: 70 }
];

export const TINCTURES = {
  or: { id: 'or', name: 'золото', class: 'metal', color: '#d8ad42', ink: '#2a1a08' },
  argent: { id: 'argent', name: 'серебро', class: 'metal', color: '#e8e1d1', ink: '#252321' },
  gules: { id: 'gules', name: 'червлень', class: 'color', color: '#9f302b', ink: '#fff4d9' },
  azure: { id: 'azure', name: 'лазурь', class: 'color', color: '#214a78', ink: '#fff4d9' },
  vert: { id: 'vert', name: 'зелень', class: 'color', color: '#315f45', ink: '#fff4d9' },
  sable: { id: 'sable', name: 'чернь', class: 'color', color: '#242524', ink: '#fff4d9' },
  purpure: { id: 'purpure', name: 'пурпур', class: 'color', color: '#663e66', ink: '#fff4d9' }
};

export const HOUSES = {
  lion: { id: 'lion', name: 'Дом Алого Льва', field: 'gules', founder: 'lion', motto: 'Первым в пролом', gift: 'vanguard', detail: 'Первый зверь в каждой главе получает +2 натиска.' },
  stag: { id: 'stag', name: 'Дом Зелёного Оленя', field: 'vert', founder: 'stag', motto: 'Корни помнят', gift: 'roots', detail: 'Законные фигуры дают ещё +1 достоинство.' },
  raven: { id: 'raven', name: 'Дом Лазурного Ворона', field: 'azure', founder: 'eagle', motto: 'Видим прежде', gift: 'foresight', detail: 'Комбинации с птицами дают +2 хитрости.' }
};

export const ELEMENTS = {
  pale: { id: 'pale', type: 'ordinary', name: 'Столб', blazon: 'столб', rarity: 'common', tags: ['formation'], power: 1, ward: 2, prestige: 1, slots: [1,3,5] },
  bend: { id: 'bend', type: 'ordinary', name: 'Перевязь', blazon: 'перевязь', rarity: 'common', tags: ['formation'], power: 2, ward: 1, prestige: 0, slots: [0,3,6] },
  chief: { id: 'chief', type: 'ordinary', name: 'Глава', blazon: 'глава', rarity: 'common', tags: ['formation'], power: 0, ward: 1, prestige: 3, slots: [0,1,2] },
  chevron: { id: 'chevron', type: 'ordinary', name: 'Стропило', blazon: 'стропило', rarity: 'uncommon', tags: ['formation'], power: 1, ward: 3, prestige: 1, slots: [4,5,6] },
  bordure: { id: 'bordure', type: 'ordinary', name: 'Кайма', blazon: 'кайма', rarity: 'uncommon', tags: ['formation','boundary'], power: 0, ward: 4, prestige: 1, slots: [0,1,2,3,4,5,6] },

  lion: { id: 'lion', type: 'charge', name: 'Лев', blazon: 'лев восстающий', rarity: 'common', tags: ['beast','assault','royal'], power: 4, ward: 0, prestige: 1 },
  eagle: { id: 'eagle', type: 'charge', name: 'Орёл', blazon: 'орёл распластанный', rarity: 'common', tags: ['bird','assault','sky'], power: 3, ward: 1, prestige: 1 },
  tower: { id: 'tower', type: 'charge', name: 'Башня', blazon: 'башня о трёх зубцах', rarity: 'common', tags: ['fortress','city'], power: 1, ward: 5, prestige: 1 },
  stag: { id: 'stag', type: 'charge', name: 'Олень', blazon: 'олень шествующий', rarity: 'common', tags: ['beast','wild'], power: 2, ward: 2, prestige: 2 },
  rose: { id: 'rose', type: 'charge', name: 'Роза', blazon: 'роза пятилистная', rarity: 'common', tags: ['flower','union'], power: 0, ward: 1, prestige: 3 },
  cross: { id: 'cross', type: 'charge', name: 'Крест', blazon: 'крест уширенный', rarity: 'common', tags: ['sacred','oath'], power: 2, ward: 2, prestige: 2 },
  sword: { id: 'sword', type: 'charge', name: 'Меч', blazon: 'меч остриём вверх', rarity: 'uncommon', tags: ['weapon','assault'], power: 5, ward: 0, prestige: 0 },
  key: { id: 'key', type: 'charge', name: 'Ключ', blazon: 'ключ бородкой наружу', rarity: 'uncommon', tags: ['device','city'], power: 1, ward: 1, prestige: 2, requires: { any: ['tower','bordure'], text: 'Нужна башня или кайма: ключ обязан что-то отпирать.' } },
  sun: { id: 'sun', type: 'charge', name: 'Солнце', blazon: 'солнце в славе', rarity: 'uncommon', tags: ['sky','sacred'], power: 2, ward: 0, prestige: 4, requires: { any: ['eagle','crown'], text: 'Нужен орёл или корона: солнце должно быть знаком высшей власти.' } },
  dragon: { id: 'dragon', type: 'charge', name: 'Дракон', blazon: 'дракон крылатый', rarity: 'rare', tags: ['monster','assault'], power: 8, ward: 1, prestige: -2, scandal: 2 },
  serpent: { id: 'serpent', type: 'charge', name: 'Змей', blazon: 'змей кольцом', rarity: 'rare', tags: ['monster','secret'], power: 4, ward: 1, prestige: 0, scandal: 1 },
  fleur: { id: 'fleur', type: 'charge', name: 'Лилия', blazon: 'лилия', rarity: 'uncommon', tags: ['flower','royal'], power: 1, ward: 1, prestige: 4 },

  helmet: { id: 'helmet', type: 'ornament', name: 'Турнирный шлем', blazon: 'шлем впрямь', rarity: 'common', tags: ['rank'], power: 0, ward: 2, prestige: 2 },
  crown: { id: 'crown', type: 'ornament', name: 'Корона достоинства', blazon: 'корона о пяти листьях', rarity: 'rare', tags: ['rank','royal'], power: 2, ward: 0, prestige: 5, requires: { any: ['helmet'], minPrestige: 7, text: 'Нужен шлем или 7 достоинства.' } },
  chain: { id: 'chain', type: 'ornament', name: 'Цепь усмирения', blazon: 'цепь вокруг щита', rarity: 'uncommon', tags: ['order'], power: 0, ward: 3, prestige: 2, requires: { any: ['dragon','serpent'], text: 'Цепь имеет смысл только рядом с чудовищем.' } },
  supporters: { id: 'supporters', type: 'ornament', name: 'Щитодержатели', blazon: 'два зверя-щитодержателя', rarity: 'rare', tags: ['rank','beast'], power: 3, ward: 3, prestige: 3, requires: { tagCount: ['beast', 2], text: 'Нужны два зверя в щите.' } },
  mantle: { id: 'mantle', type: 'ornament', name: 'Княжеская мантия', blazon: 'мантия с горностаем', rarity: 'rare', tags: ['rank'], power: 0, ward: 5, prestige: 4, requires: { any: ['crown'], text: 'Мантия полагается только коронованному гербу.' } },
  motto_gate: { id: 'motto_gate', type: 'motto', name: '«Врата знают своих»', blazon: 'девиз на ленте', rarity: 'uncommon', tags: ['motto','city'], power: 1, ward: 2, prestige: 3, requires: { all: ['tower','key'], text: 'Девиз открывается связкой Башня + Ключ.' } },
  motto_flame: { id: 'motto_flame', type: 'motto', name: '«Пламя подчинено крови»', blazon: 'девиз на ленте', rarity: 'rare', tags: ['motto','monster'], power: 4, ward: 0, prestige: 1, requires: { all: ['dragon','chain'], text: 'Нужны Дракон и Цепь.' } },
  motto_union: { id: 'motto_union', type: 'motto', name: '«Две крови — один щит»', blazon: 'девиз на ленте', rarity: 'rare', tags: ['motto','union'], power: 1, ward: 1, prestige: 5, requires: { any: ['rose'], tagCount: ['beast', 2], text: 'Нужна Роза и два разных зверя.' } }
};

export const COMBINATIONS = [
  { id: 'gatekeeper', name: 'Хранитель врат', requires: ['tower','key'], detail: 'Башня получает ключ и перестаёт быть просто кирпичом.', power: 2, ward: 5, prestige: 2 },
  { id: 'march-wall', name: 'Пограничная марка', requires: ['bordure','tower','key'], detail: 'Кайма становится границей, башня — заставой, ключ — правом прохода.', power: 2, ward: 7, prestige: 3 },
  { id: 'crowned-beast', name: 'Коронованный зверь', requiresTags: ['beast'], requires: ['crown'], detail: 'Зверь объявляет притязание на престол.', power: 5, ward: 0, prestige: 4 },
  { id: 'bound-wyrm', name: 'Зверь в цепях', requiresAny: ['dragon','serpent'], requires: ['chain'], detail: 'Чудовище больше не пожирает честь рода.', power: 6, ward: 4, prestige: 2, scandal: -3 },
  { id: 'two-bloods', name: 'Союз двух кровей', requires: ['rose'], requiresDistinctBeasts: 2, detail: 'Роза связывает две воинские линии.', power: 3, ward: 2, prestige: 6 },
  { id: 'high-dominion', name: 'Высшее владычество', requires: ['eagle','sun','crown'], detail: 'Небо, свет и право власти сходятся в одной формуле.', power: 5, ward: 1, prestige: 7 },
  { id: 'crusader', name: 'Меч клятвы', requires: ['cross','sword'], detail: 'Клятва направляет оружие, а не наоборот.', power: 7, ward: 2, prestige: 2 },
  { id: 'three-lions', name: 'Три льва похода', count: ['lion',3], detail: 'Фигура превращается в династическую программу.', power: 8, ward: 0, prestige: 4 }
];

export const TRIALS = [
  { id: 'tourney', name: 'Турнир трёх копий', type: 'power', opponent: 'Дом Чёрного Вепря', field: 'sable', sigil: 'boar', threshold: 18, copy: 'Знать смотрит не на обещания, а на то, кто останется в седле.' },
  { id: 'siege', name: 'Осада Серебряных ворот', type: 'ward', opponent: 'Дом Серебряной Башни', field: 'gules', sigil: 'tower', threshold: 27, copy: 'Герб должен выдержать голод, подкоп и третью ночь под огнём.' },
  { id: 'court', name: 'Суд двенадцати герольдов', type: 'prestige', opponent: 'Капитул Золотой Лилии', field: 'purpure', sigil: 'fleur', threshold: 34, copy: 'Здесь ересь не убивает сразу. Она просто становится доказательством.' },
  { id: 'war', name: 'Война великих знамён', type: 'total', opponent: 'Имперский Золотой Орёл', field: 'azure', sigil: 'eagle', threshold: 53, copy: 'Последний герб останется не рисунком, а законом нового порядка.' }
];

export const PATRONAGE = {
  enamel: { id: 'enamel', name: 'Эмаль мастера Лоренцо', detail: 'Все законные фигуры дают +1 достоинство.' },
  iron: { id: 'iron', name: 'Железо маршала', detail: 'Первая комбинация в испытании даёт +3 натиска.' },
  archive: { id: 'archive', name: 'Архив старых прав', detail: 'Требования одного элемента можно игнорировать в каждой главе.' },
  relic: { id: 'relic', name: 'Реликварий клятв', detail: 'Кресты и девизы дают +2 защиты.' },
  blackbook: { id: 'blackbook', name: 'Чёрный гербовник', detail: 'Ересь даёт ещё +2 натиска, но +1 скандал.' },
  compass: { id: 'compass', name: 'Циркуль герольда', detail: 'Заполненная формация ординария даёт двойной бонус.' }
};

const ELEMENT_IDS = Object.keys(ELEMENTS);
const TINCTURE_IDS = Object.keys(TINCTURES);

function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
export function normalizeSeed(seed) { const n = Number(seed); return Number.isFinite(n) ? (Math.abs(Math.floor(n)) || 1) >>> 0 : 1; }
function random(state) { state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0; return state.rng / 4294967296; }
function pick(state, list) { return list[Math.floor(random(state) * list.length)] ?? list[0]; }
function shuffle(state, list) { const copy = [...list]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random(state) * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }
function unique(list) { return [...new Set(list)]; }

export function allPlacedIds(board) {
  return [board.ordinary?.device, ...board.charges.map((x) => x?.device), ...board.ornaments.map((x) => x.device), board.motto?.device].filter(Boolean);
}

function allPlacedElements(board) {
  const items = [];
  if (board.ordinary) items.push(board.ordinary);
  board.charges.forEach((item) => item && items.push(item));
  board.ornaments.forEach((item) => items.push(item));
  if (board.motto) items.push(board.motto);
  return items;
}

function tagCount(board, tag) {
  return allPlacedElements(board).filter((item) => ELEMENTS[item.device]?.tags?.includes(tag)).length;
}

function distinctBeastCount(board) {
  return unique(board.charges.filter(Boolean).filter((item) => ELEMENTS[item.device]?.tags?.includes('beast')).map((item) => item.device)).length;
}

export function requirementStatus(campaign, device) {
  const def = ELEMENTS[device];
  const requirement = def?.requires;
  if (!requirement) return { ok: true, text: '' };
  if (campaign.chapterBypassAvailable && campaign.patronage.includes('archive')) return { ok: true, bypass: true, text: 'Архив позволяет один раз обойти требование.' };
  const ids = allPlacedIds(campaign.board);
  const prestige = evaluateHeraldry(campaign).prestige;
  const checks = [];
  if (requirement.all) checks.push(requirement.all.every((id) => ids.includes(id)));
  if (requirement.any) checks.push(requirement.any.some((id) => ids.includes(id)) || (requirement.minPrestige ? prestige >= requirement.minPrestige : false));
  else if (requirement.minPrestige) checks.push(prestige >= requirement.minPrestige);
  if (requirement.tagCount) checks.push(tagCount(campaign.board, requirement.tagCount[0]) >= requirement.tagCount[1]);
  return { ok: checks.every(Boolean), text: requirement.text || 'Условия не выполнены.' };
}

export function isLegalTincture(foreground, background) {
  const a = TINCTURES[foreground]; const b = TINCTURES[background];
  if (!a || !b) return true;
  return a.class !== b.class;
}

export function backgroundAtSlot(board, slot) {
  if (board.ordinary && ELEMENTS[board.ordinary.device]?.slots?.includes(slot)) return board.ordinary.tincture;
  return board.field;
}

export function availableSlots(campaign, item) {
  if (!item || ELEMENTS[item.device]?.type !== 'charge') return [];
  const free = SLOT_META.filter((slot) => !campaign.board.charges[slot.id]).map((slot) => slot.id);
  if (free.length) return free;
  return SLOT_META.filter((slot) => !campaign.board.charges[slot.id]?.founder).map((slot) => slot.id);
}

function makeItem(state, device) {
  const def = ELEMENTS[device];
  const tincture = def.type === 'ornament' || def.type === 'motto' ? null : pick(state, TINCTURE_IDS);
  return { id: `${device}-${state.chapter}-${state.step}-${Math.floor(random(state) * 1e7).toString(36)}`, device, tincture };
}

function structurallyAvailable(campaign, id) {
  const def = ELEMENTS[id];
  if (def.type === 'ordinary') return !campaign.board.ordinary;
  if (def.type === 'charge') return campaign.board.charges.some((slot) => !slot || !slot.founder);
  if (def.type === 'ornament') return !campaign.board.ornaments.some((item) => item.device === id);
  if (def.type === 'motto') return !campaign.board.motto;
  return true;
}

function weightedPool(campaign) {
  const chapter = campaign.chapter;
  return ELEMENT_IDS.filter((id) => {
    const rarity = ELEMENTS[id].rarity;
    const unlocked = rarity === 'rare' ? chapter >= 1 : true;
    return unlocked && structurallyAvailable(campaign, id);
  });
}

export function generateOffer(campaign) {
  if (campaign.pendingTrial || campaign.pendingPatronage || campaign.completed || campaign.failed) return [];
  const state = clone(campaign);
  const pool = shuffle(state, weightedPool(state));
  const placed = allPlacedIds(state.board);
  const preferred = pool.sort((a, b) => {
    const ar = requirementStatus(state, a).ok ? 0 : 1;
    const br = requirementStatus(state, b).ok ? 0 : 1;
    const ad = placed.includes(a) ? 1 : 0;
    const bd = placed.includes(b) ? 1 : 0;
    return ar - br || ad - bd;
  });
  const picked = unique(preferred).slice(0, 3).map((id) => makeItem(state, id));
  campaign.rng = state.rng;
  campaign.offer = picked;
  return clone(picked);
}

export function createCampaign(houseId = 'lion', seed = Date.now()) {
  const house = HOUSES[houseId] || HOUSES.lion;
  const rng = normalizeSeed(seed);
  const campaign = {
    version: APP_STATE_VERSION,
    id: `blazon-${rng.toString(36)}`,
    houseId: house.id,
    rng,
    chapter: 0,
    step: 0,
    integrity: 3,
    renown: 0,
    scandalHistory: 0,
    patronage: [],
    scars: [],
    board: {
      field: house.field,
      ordinary: null,
      charges: Array(7).fill(null),
      ornaments: [],
      motto: null
    },
    offer: [],
    history: [],
    pendingTrial: false,
    pendingPatronage: false,
    chapterBypassAvailable: true,
    completed: false,
    failed: false,
    lastTrial: null,
    startedAt: Date.now()
  };
  campaign.board.charges[3] = { id: `founder-${house.founder}`, device: house.founder, tincture: house.field === 'gules' ? 'or' : 'argent', founder: true };
  generateOffer(campaign);
  return campaign;
}

export function hydrateCampaign(value) {
  if (!value || value.version !== APP_STATE_VERSION) return null;
  const campaign = clone(value);
  campaign.board.charges = Array.from({ length: 7 }, (_, i) => campaign.board.charges?.[i] || null);
  campaign.board.ornaments ||= [];
  campaign.patronage ||= [];
  campaign.scars ||= [];
  campaign.history ||= [];
  campaign.offer ||= [];
  if (!campaign.offer.length && !campaign.pendingTrial && !campaign.pendingPatronage && !campaign.completed && !campaign.failed) generateOffer(campaign);
  return campaign;
}

export function canPlaceElement(campaign, item, slot = null) {
  const def = ELEMENTS[item?.device];
  if (!def) return { ok: false, reason: 'Неизвестный элемент.' };
  const requirement = requirementStatus(campaign, item.device);
  if (!requirement.ok) return { ok: false, reason: requirement.text };
  if (def.type === 'ordinary' && campaign.board.ordinary) return { ok: false, reason: 'На щите уже есть главный ординарий.' };
  if (def.type === 'charge') {
    if (!Number.isInteger(slot) || slot < 0 || slot >= 7) return { ok: false, reason: 'Выбери место на щите.' };
    const occupied = campaign.board.charges[slot];
    const freeExists = campaign.board.charges.some((entry) => !entry);
    if (occupied?.founder) return { ok: false, reason: 'Сердце щита хранит знак основателя.' };
    if (occupied && freeExists) return { ok: false, reason: 'Пока есть свободные места, фигуры не заменяют друг друга.' };
  }
  if (def.type === 'ornament' && campaign.board.ornaments.some((x) => x.device === item.device)) return { ok: false, reason: 'Такое украшение уже пожаловано.' };
  if (def.type === 'motto' && campaign.board.motto) return { ok: false, reason: 'У рода уже есть девиз.' };
  return { ok: true, bypass: requirement.bypass };
}

export function placeElement(campaign, itemId, slot = null) {
  const item = campaign.offer.find((x) => x.id === itemId);
  if (!item) return { ok: false, reason: 'Этого пожалования больше нет.' };
  const verdict = canPlaceElement(campaign, item, slot);
  if (!verdict.ok) return verdict;
  const def = ELEMENTS[item.device];
  if (verdict.bypass) campaign.chapterBypassAvailable = false;
  if (def.type === 'ordinary') campaign.board.ordinary = clone(item);
  if (def.type === 'charge') {
    const replaced = campaign.board.charges[slot];
    campaign.board.charges[slot] = clone(item);
    if (replaced) campaign.history.push({ kind: 'replace', chapter: campaign.chapter, step: campaign.step, removed: clone(replaced), item: clone(item), slot });
  }
  if (def.type === 'ornament') campaign.board.ornaments.push(clone(item));
  if (def.type === 'motto') campaign.board.motto = clone(item);
  campaign.history.push({ kind: 'place', chapter: campaign.chapter, step: campaign.step, item: clone(item), slot });
  campaign.step += 1;
  campaign.offer = [];
  const evaluation = evaluateHeraldry(campaign);
  campaign.scandalHistory = Math.max(campaign.scandalHistory, evaluation.scandal);
  if (campaign.step >= BUILD_STEPS) campaign.pendingTrial = true;
  else generateOffer(campaign);
  return { ok: true, evaluation, pendingTrial: campaign.pendingTrial };
}

export function rejectOffer(campaign) {
  if (!campaign.offer.length || campaign.pendingTrial) return false;
  campaign.renown = Math.max(0, campaign.renown - 1);
  generateOffer(campaign);
  return true;
}

function combinationActive(board, combo) {
  const ids = allPlacedIds(board);
  if (combo.requires && !combo.requires.every((id) => ids.includes(id))) return false;
  if (combo.requiresAny && !combo.requiresAny.some((id) => ids.includes(id))) return false;
  if (combo.requiresTags && !combo.requiresTags.every((tag) => tagCount(board, tag) > 0)) return false;
  if (combo.requiresDistinctBeasts && distinctBeastCount(board) < combo.requiresDistinctBeasts) return false;
  if (combo.count && ids.filter((id) => id === combo.count[0]).length < combo.count[1]) return false;
  return true;
}

export function evaluateHeraldry(campaign) {
  const board = campaign.board;
  const house = HOUSES[campaign.houseId] || HOUSES.lion;
  let power = 0; let ward = 0; let prestige = 0; let scandal = 0; let legalCount = 0;
  const notes = [];
  const items = allPlacedElements(board);
  items.forEach((item) => {
    const def = ELEMENTS[item.device];
    power += def.power || 0; ward += def.ward || 0; prestige += def.prestige || 0; scandal += def.scandal || 0;
    if (def.type === 'charge' || def.type === 'ordinary') {
      const background = def.type === 'ordinary' ? board.field : backgroundAtSlot(board, board.charges.indexOf(item));
      const legal = isLegalTincture(item.tincture, background);
      if (legal) { legalCount += 1; prestige += campaign.patronage.includes('enamel') ? 2 : 1; if (house.gift === 'roots') prestige += 1; }
      else { power += campaign.patronage.includes('blackbook') ? 4 : 2; scandal += campaign.patronage.includes('blackbook') ? 2 : 1; notes.push(`${def.name}: нарушение закона тинктур`); }
    }
  });

  const combos = COMBINATIONS.filter((combo) => combinationActive(board, combo)).map((combo) => {
    power += combo.power || 0; ward += combo.ward || 0; prestige += combo.prestige || 0; scandal += combo.scandal || 0;
    if (campaign.patronage.includes('iron')) power += 3;
    if (house.gift === 'foresight' && (combo.requires?.includes('eagle') || combo.id === 'high-dominion')) prestige += 2;
    return clone(combo);
  });

  if (board.ordinary) {
    const def = ELEMENTS[board.ordinary.device];
    const occupied = def.slots.filter((slot) => board.charges[slot]).length;
    if (occupied >= Math.min(3, def.slots.length)) {
      const multiplier = campaign.patronage.includes('compass') ? 2 : 1;
      power += (def.power || 0) * multiplier;
      ward += (def.ward || 0) * multiplier;
      prestige += (def.prestige || 0) * multiplier;
      notes.push(`Формация «${def.name}» заполнена`);
    }
  }

  if (house.gift === 'vanguard') {
    const firstBeast = board.charges.find((item) => item && ELEMENTS[item.device]?.tags?.includes('beast'));
    if (firstBeast) power += 2;
  }
  if (campaign.patronage.includes('relic')) {
    const sacred = items.filter((item) => item.device === 'cross' || ELEMENTS[item.device]?.type === 'motto').length;
    ward += sacred * 2;
  }
  scandal = Math.max(0, scandal);
  const total = power + ward + prestige - scandal * 2;
  return { power, ward, prestige, scandal, legalCount, total, combos, notes };
}

export function currentTrial(campaign) { return TRIALS[Math.min(campaign.chapter, TRIALS.length - 1)]; }

export function trialPreview(campaign) {
  const trial = currentTrial(campaign);
  const stats = evaluateHeraldry(campaign);
  const weights = trial.type === 'power' ? [1.5,.5,.5] : trial.type === 'ward' ? [.5,1.5,.5] : trial.type === 'prestige' ? [.4,.5,1.6] : [1,1,1];
  const base = stats.power * weights[0] + stats.ward * weights[1] + stats.prestige * weights[2] - stats.scandal * (trial.type === 'prestige' ? 4 : 2);
  return { trial, stats, base: Math.round(base), threshold: trial.threshold };
}

export function resolveTrial(campaign, command = 'oath') {
  if (!campaign.pendingTrial) return { ok: false, reason: 'Испытание ещё не началось.' };
  const preview = trialPreview(campaign);
  const commandBonus = {
    charge: preview.stats.power >= preview.stats.ward ? 6 : 2,
    hold: preview.stats.ward >= preview.stats.power ? 6 : 2,
    oath: preview.stats.prestige >= preview.stats.scandal * 3 ? 6 : -1
  }[command] ?? 0;
  const score = preview.base + commandBonus;
  const won = score >= preview.threshold;
  const phases = [
    { title: 'Оглашение', text: campaign.board.motto ? `${ELEMENTS[campaign.board.motto.device].name} произнесён перед строем.` : 'Род выходит без девиза; говорит только композиция щита.', value: preview.stats.prestige },
    { title: 'Построение', text: campaign.board.ordinary ? `${ELEMENTS[campaign.board.ordinary.device].name} связывает фигуры в единый порядок.` : 'Фигуры действуют без ординария и общей оси.', value: preview.stats.ward },
    { title: 'Выход фигур', text: preview.stats.combos.length ? preview.stats.combos.map((x) => x.name).join(' · ') : 'Ни одна формула не завершена; каждый знак сражается отдельно.', value: preview.stats.power },
    { title: 'Суд знамени', text: won ? 'Герб признан сильнее требования испытания.' : 'Композиция ломается в решающий момент и оставляет шрам в хронике.', value: score }
  ];

  campaign.pendingTrial = false;
  campaign.lastTrial = { chapter: campaign.chapter, command, score, threshold: preview.threshold, won, phases, trialId: preview.trial.id };
  campaign.history.push({ kind: 'trial', ...clone(campaign.lastTrial) });
  if (won) { campaign.renown += 5 + preview.stats.combos.length * 2; }
  else {
    campaign.integrity -= 1;
    campaign.scars.push({ chapter: campaign.chapter, name: preview.trial.name, penalty: 'Потеряна одна целостность рода.' });
  }

  if (campaign.integrity <= 0) {
    campaign.failed = true;
  } else if (campaign.chapter >= TRIALS.length - 1) {
    campaign.completed = won;
    if (!won) campaign.failed = true;
  } else {
    campaign.pendingPatronage = true;
    campaign.patronageOffer = shuffle(campaign, Object.keys(PATRONAGE).filter((id) => !campaign.patronage.includes(id))).slice(0, 3);
  }
  return { ok: true, won, score, phases, trial: preview.trial, completed: campaign.completed, failed: campaign.failed };
}

export function choosePatronage(campaign, id) {
  if (!campaign.pendingPatronage || !campaign.patronageOffer?.includes(id)) return false;
  campaign.patronage.push(id);
  campaign.pendingPatronage = false;
  campaign.patronageOffer = [];
  campaign.chapter += 1;
  campaign.step = 0;
  campaign.chapterBypassAvailable = true;
  generateOffer(campaign);
  return true;
}

export function campaignSummary(campaign) {
  if (!campaign) return null;
  const evaluation = evaluateHeraldry(campaign);
  return {
    house: HOUSES[campaign.houseId]?.name,
    chapter: campaign.chapter + 1,
    step: campaign.step,
    integrity: campaign.integrity,
    renown: campaign.renown,
    combinations: evaluation.combos.length,
    power: evaluation.power,
    ward: evaluation.ward,
    prestige: evaluation.prestige,
    scandal: evaluation.scandal,
    completed: campaign.completed,
    failed: campaign.failed
  };
}
