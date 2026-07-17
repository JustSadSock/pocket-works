export const APP_STATE_VERSION = 1;
export const SLOT_COUNT = 7;

export const SLOT_META = [
  { id: 0, key: 'chief-left', label: 'левый верх', row: 'chief', column: 'left', x: 29, y: 31 },
  { id: 1, key: 'chief', label: 'глава', row: 'chief', column: 'center', x: 50, y: 25 },
  { id: 2, key: 'chief-right', label: 'правый верх', row: 'chief', column: 'right', x: 71, y: 31 },
  { id: 3, key: 'heart', label: 'сердце', row: 'heart', column: 'center', x: 50, y: 50 },
  { id: 4, key: 'base-left', label: 'левое подножие', row: 'base', column: 'left', x: 34, y: 67 },
  { id: 5, key: 'base', label: 'подножие', row: 'base', column: 'center', x: 50, y: 76 },
  { id: 6, key: 'base-right', label: 'правое подножие', row: 'base', column: 'right', x: 66, y: 67 }
];

export const MIRROR_SLOT = [2, 1, 0, 3, 6, 5, 4];

export const TINCTURES = {
  or: { id: 'or', name: 'золото', short: 'ОР', class: 'metal', color: '#d7aa32', ink: '#3a2910' },
  argent: { id: 'argent', name: 'серебро', short: 'АР', class: 'metal', color: '#e8e1d1', ink: '#252728' },
  gules: { id: 'gules', name: 'червлень', short: 'ГУ', class: 'color', color: '#a9342d', ink: '#fff2d6' },
  azure: { id: 'azure', name: 'лазурь', short: 'АЗ', class: 'color', color: '#244f83', ink: '#f4ebcf' },
  vert: { id: 'vert', name: 'зелень', short: 'ВЕ', class: 'color', color: '#2f6a4b', ink: '#f4ebcf' },
  sable: { id: 'sable', name: 'чернь', short: 'СА', class: 'color', color: '#252a2b', ink: '#f4ebcf' },
  purpure: { id: 'purpure', name: 'пурпур', short: 'ПУ', class: 'color', color: '#6c3d68', ink: '#f4ebcf' }
};

export const CHARGES = {
  lion: { id: 'lion', name: 'Лев', verb: 'рычит', attack: 4, guard: 0, honor: 0, heal: 0, pierce: 0, tags: ['beast', 'assault'] },
  eagle: { id: 'eagle', name: 'Орёл', verb: 'падает с высоты', attack: 3, guard: 1, honor: 0, heal: 0, pierce: 1, tags: ['bird', 'assault'] },
  tower: { id: 'tower', name: 'Башня', verb: 'поднимает стены', attack: 1, guard: 4, honor: 0, heal: 0, pierce: 0, tags: ['fortress', 'guard'] },
  stag: { id: 'stag', name: 'Олень', verb: 'ведёт через чащу', attack: 2, guard: 2, honor: 0, heal: 1, pierce: 0, tags: ['beast', 'balance'] },
  boar: { id: 'boar', name: 'Вепрь', verb: 'ломает строй', attack: 5, guard: 0, honor: 0, heal: 0, pierce: 0, tags: ['beast', 'fury'] },
  fleur: { id: 'fleur', name: 'Лилия', verb: 'возвышает род', attack: 1, guard: 1, honor: 2, heal: 0, pierce: 0, tags: ['flower', 'honor'] },
  cross: { id: 'cross', name: 'Крест', verb: 'держит клятву', attack: 2, guard: 2, honor: 1, heal: 1, pierce: 0, tags: ['sacred', 'balance'] },
  dragon: { id: 'dragon', name: 'Дракон', verb: 'жжёт знамёна', attack: 4, guard: 1, honor: 0, heal: 0, pierce: 1, tags: ['monster', 'assault'] },
  key: { id: 'key', name: 'Ключ', verb: 'отпирает строй', attack: 2, guard: 1, honor: 1, heal: 0, pierce: 2, tags: ['device', 'tactic'] },
  rose: { id: 'rose', name: 'Роза', verb: 'скрепляет союз', attack: 1, guard: 2, honor: 1, heal: 1, pierce: 0, tags: ['flower', 'balance'] }
};

export const ORDINARIES = {
  pale: { id: 'pale', name: 'Столб', verb: 'собирает середину', slots: [1, 3, 5], attack: 1, guard: 1, honor: 1, role: 'balanced' },
  bend: { id: 'bend', name: 'Перевязь', verb: 'ведёт удар по диагонали', slots: [0, 3, 6], attack: 2, guard: 0, honor: 0, role: 'assault' },
  chevron: { id: 'chevron', name: 'Стропило', verb: 'подпирает подножие', slots: [4, 5, 6], attack: 0, guard: 3, honor: 0, role: 'guard' },
  chief: { id: 'chief', name: 'Глава', verb: 'венчает щит', slots: [0, 1, 2], attack: 1, guard: 1, honor: 1, role: 'honor' },
  saltire: { id: 'saltire', name: 'Косой крест', verb: 'сводит четыре угла', slots: [0, 2, 3, 4, 6], attack: 1, guard: 1, honor: 1, role: 'balanced' },
  bordure: { id: 'bordure', name: 'Кайма', verb: 'замыкает границу', slots: [0, 1, 2, 3, 4, 5, 6], attack: 0, guard: 2, honor: 1, role: 'guard' }
};

export const HOUSES = {
  lion: {
    id: 'lion', name: 'Дом Алого Льва', short: 'АЛЫЙ ЛЕВ', field: 'gules', charge: 'lion',
    motto: 'Первым в пролом', passive: 'Атакующие фигуры в главе щита получают +1 натиск.',
    passiveId: 'vanguard'
  },
  stag: {
    id: 'stag', name: 'Дом Зелёного Оленя', short: 'ЗЕЛЁНЫЙ ОЛЕНЬ', field: 'vert', charge: 'stag',
    motto: 'Тише корней, крепче дуба', passive: 'Каждая вторая законная фигура лечит ещё 1 славу.',
    passiveId: 'renewal'
  },
  raven: {
    id: 'raven', name: 'Дом Лазурного Ворона', short: 'ЛАЗУРНЫЙ ВОРОН', field: 'azure', charge: 'eagle',
    motto: 'Видим раньше', passive: 'Фигуры в центральной колонне получают +1 честь и +1 пробитие.',
    passiveId: 'foresight'
  }
};

export const OPPONENTS = [
  {
    id: 'boar', name: 'Дом Чёрного Вепря', short: 'ЧЁРНЫЙ ВЕПРЬ', field: 'sable', charge: 'boar',
    motto: 'Закон пишут выжившие', passive: 'Еретические фигуры получают ещё +1 натиск.', passiveId: 'heresy',
    style: 'aggressive', maxRenown: 22
  },
  {
    id: 'tower', name: 'Дом Серебряной Башни', short: 'СЕРЕБРЯНАЯ БАШНЯ', field: 'gules', charge: 'tower',
    motto: 'Стоим, пока мир рушится', passive: 'Защитные фигуры в подножии дают +1 щит.', passiveId: 'bastion',
    style: 'defensive', maxRenown: 25
  },
  {
    id: 'eagle', name: 'Дом Золотого Орла', short: 'ЗОЛОТОЙ ОРЁЛ', field: 'purpure', charge: 'eagle',
    motto: 'Высота судит всех', passive: 'Законные фигуры с пробитием получают +1 натиск.', passiveId: 'dominion',
    style: 'honorable', maxRenown: 27
  }
];

export const AUGMENTS = {
  crown: { id: 'crown', name: 'Корона достоинства', detail: 'Законная фигура в сердце щита получает +2 натиск.' },
  mantle: { id: 'mantle', name: 'Мантия рода', detail: 'Первый полученный в каждой дуэли урон уменьшается на 2.' },
  motto: { id: 'motto', name: 'Боевой девиз', detail: 'Когда ход приносит 2+ чести, восстанови 1 славу.' },
  standard: { id: 'standard', name: 'Большой штандарт', detail: 'Начинай каждую дуэль с 3 щита.' },
  spur: { id: 'spur', name: 'Золотая шпора', detail: 'Первая атакующая фигура в главе получает +2 натиск.' },
  seal: { id: 'seal', name: 'Тайная печать', detail: 'Первая ересь в дуэли не ранит собственный род.' },
  chain: { id: 'chain', name: 'Цепь вассалов', detail: 'Башни, кресты и защитные фигуры получают +1 щит.' }
};

const CHARGE_IDS = Object.keys(CHARGES);
const ORDINARY_IDS = Object.keys(ORDINARIES);
const METALS = Object.values(TINCTURES).filter((item) => item.class === 'metal').map((item) => item.id);
const COLORS = Object.values(TINCTURES).filter((item) => item.class === 'color').map((item) => item.id);

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function normalizeSeed(seed) {
  const numeric = Number(seed);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric) >>> 0;
  return (Date.now() ^ 0x9e3779b9) >>> 0;
}

function randomFrom(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}

function pick(state, items) {
  return items[Math.floor(randomFrom(state) * items.length)] ?? items[0];
}

function shuffled(state, items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFrom(state) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function combatantFromHouse(house, maxRenown, augments = []) {
  return {
    id: house.id,
    name: house.name,
    short: house.short,
    field: house.field,
    charge: house.charge,
    motto: house.motto,
    passive: house.passive,
    passiveId: house.passiveId,
    style: house.style || 'balanced',
    maxRenown,
    renown: maxRenown,
    guard: augments.includes('standard') ? 3 : 0,
    honor: 0,
    fury: 0,
    legalStreak: 0,
    legalCount: 0,
    board: Array(SLOT_COUNT).fill(null),
    ordinary: null,
    hand: [],
    augments: [...augments],
    used: { mantle: false, spur: false, seal: false }
  };
}

export function createCampaign(houseId = 'lion', seed = Date.now()) {
  const house = HOUSES[houseId] || HOUSES.lion;
  const campaign = {
    version: APP_STATE_VERSION,
    id: `campaign-${normalizeSeed(seed).toString(36)}`,
    seed: normalizeSeed(seed),
    rng: normalizeSeed(seed),
    houseId: house.id,
    stage: 0,
    victories: 0,
    augments: [],
    completed: false,
    startedAt: Date.now(),
    battle: null,
    rewards: []
  };
  campaign.battle = createBattle(campaign);
  return campaign;
}

export function createBattle(campaign) {
  const source = clone(campaign);
  const playerHouse = HOUSES[source.houseId] || HOUSES.lion;
  const opponent = OPPONENTS[Math.min(source.stage, OPPONENTS.length - 1)];
  const battle = {
    version: APP_STATE_VERSION,
    seed: source.rng,
    rng: source.rng,
    stage: source.stage,
    turn: 1,
    maxTurns: 7,
    phase: 'player',
    winner: null,
    resultReason: null,
    player: combatantFromHouse(playerHouse, 24, source.augments),
    enemy: combatantFromHouse(opponent, opponent.maxRenown, []),
    lastClash: null,
    history: []
  };
  battle.player.hand = drawHand(battle, 'player');
  battle.enemy.hand = drawHand(battle, 'enemy');
  source.rng = battle.rng;
  return battle;
}

function nextCardId(state, side, kind, device) {
  const token = Math.floor(randomFrom(state) * 0xffffff).toString(36).padStart(4, '0');
  return `${side}-${state.turn}-${kind}-${device}-${token}`;
}

function oppositeTincturePool(underTincture, legal) {
  const underClass = TINCTURES[underTincture]?.class || 'color';
  if (legal) return underClass === 'metal' ? COLORS : METALS;
  return underClass === 'metal' ? METALS : COLORS;
}

function makeChargeCard(state, side, legalIntent) {
  const owner = state[side];
  const chargeId = pick(state, CHARGE_IDS);
  const under = owner.field;
  const tincture = pick(state, oppositeTincturePool(under, legalIntent));
  return {
    id: nextCardId(state, side, 'charge', chargeId),
    kind: 'charge',
    device: chargeId,
    tincture,
    legalIntent
  };
}

function makeOrdinaryCard(state, side, legalIntent) {
  const owner = state[side];
  const ordinaryId = pick(state, ORDINARY_IDS);
  const tincture = pick(state, oppositeTincturePool(owner.field, legalIntent));
  return {
    id: nextCardId(state, side, 'ordinary', ordinaryId),
    kind: 'ordinary',
    device: ordinaryId,
    tincture,
    legalIntent
  };
}

export function drawHand(state, side) {
  const legalPattern = shuffled(state, [true, true, false]);
  const hand = legalPattern.map((legalIntent, index) => {
    const ordinaryChance = index === 2 ? 0.42 : 0.2;
    return randomFrom(state) < ordinaryChance
      ? makeOrdinaryCard(state, side, legalIntent)
      : makeChargeCard(state, side, legalIntent);
  });
  if (!hand.some((card) => card.kind === 'charge')) hand[0] = makeChargeCard(state, side, true);
  return hand;
}

export function cardDefinition(card) {
  return card?.kind === 'ordinary' ? ORDINARIES[card.device] : CHARGES[card?.device];
}

export function ordinaryCovers(ordinary, slot) {
  if (!ordinary || !Number.isInteger(slot)) return false;
  return ORDINARIES[ordinary.device]?.slots.includes(slot) || false;
}

export function underTinctureFor(combatant, card, slot = null) {
  if (card.kind === 'ordinary') return combatant.field;
  if (combatant.ordinary && ordinaryCovers(combatant.ordinary, slot)) return combatant.ordinary.tincture;
  return combatant.field;
}

export function isLegalPlacement(combatant, card, slot = null) {
  const under = underTinctureFor(combatant, card, slot);
  return TINCTURES[under]?.class !== TINCTURES[card.tincture]?.class;
}

export function validTargets(battle, side, card) {
  if (!battle || !card) return [];
  if (card.kind === 'ordinary') return ['ordinary'];
  return SLOT_META.map((slot) => slot.id);
}

function placementSnapshot(combatant, card, slot) {
  const next = clone(combatant);
  if (card.kind === 'ordinary') next.ordinary = clone(card);
  else next.board[slot] = clone(card);
  return next;
}

function symmetryBonus(combatant, card, slot) {
  if (card.kind !== 'charge') return { attack: 0, guard: 0, honor: 0, label: null };
  const mirror = MIRROR_SLOT[slot];
  if (mirror === slot) return { attack: 0, guard: 0, honor: 0, label: null };
  const other = combatant.board[mirror];
  if (!other || other.kind !== 'charge') return { attack: 0, guard: 0, honor: 0, label: null };
  const sameDevice = other.device === card.device;
  const sameClass = TINCTURES[other.tincture]?.class === TINCTURES[card.tincture]?.class;
  if (sameDevice) return { attack: 2, guard: 2, honor: 0, label: 'Парные фигуры' };
  if (sameClass) return { attack: 0, guard: 1, honor: 1, label: 'Единая ливрея' };
  return { attack: 1, guard: 1, honor: 0, label: 'Зеркальный строй' };
}

function ordinarySynergy(combatant, card, slot) {
  if (card.kind !== 'charge' || !combatant.ordinary || !ordinaryCovers(combatant.ordinary, slot)) {
    return { attack: 0, guard: 0, honor: 0, label: null };
  }
  const ordinary = ORDINARIES[combatant.ordinary.device];
  if (ordinary.role === 'assault') return { attack: 2, guard: 0, honor: 0, label: ordinary.name };
  if (ordinary.role === 'guard') return { attack: 0, guard: 2, honor: 0, label: ordinary.name };
  if (ordinary.role === 'honor') return { attack: 1, guard: 0, honor: 1, label: ordinary.name };
  return { attack: 1, guard: 1, honor: 0, label: ordinary.name };
}

function housePassiveBonus(combatant, card, slot, legal) {
  const bonus = { attack: 0, guard: 0, honor: 0, heal: 0, pierce: 0, label: null };
  const def = cardDefinition(card);
  if (combatant.passiveId === 'vanguard' && card.kind === 'charge' && SLOT_META[slot]?.row === 'chief' && def.tags.includes('assault')) {
    bonus.attack += 1; bonus.label = 'Передовой строй';
  }
  if (combatant.passiveId === 'renewal' && legal && (combatant.legalCount + 1) % 2 === 0) {
    bonus.heal += 1; bonus.label = 'Возвращение весны';
  }
  if (combatant.passiveId === 'foresight' && card.kind === 'charge' && SLOT_META[slot]?.column === 'center') {
    bonus.honor += 1; bonus.pierce += 1; bonus.label = 'Предвидение';
  }
  if (combatant.passiveId === 'heresy' && !legal) {
    bonus.attack += 1; bonus.label = 'Закон выживших';
  }
  if (combatant.passiveId === 'bastion' && card.kind === 'charge' && SLOT_META[slot]?.row === 'base' && def.tags.includes('guard')) {
    bonus.guard += 1; bonus.label = 'Каменное подножие';
  }
  if (combatant.passiveId === 'dominion' && legal && def.pierce > 0) {
    bonus.attack += 1; bonus.label = 'Господство высоты';
  }
  return bonus;
}

function augmentBonus(combatant, card, slot, legal, def) {
  const bonus = { attack: 0, guard: 0, honor: 0, heal: 0, pierce: 0, selfDamageReduction: 0, labels: [] };
  if (combatant.augments.includes('crown') && legal && slot === 3 && card.kind === 'charge') {
    bonus.attack += 2; bonus.labels.push('Корона достоинства');
  }
  if (combatant.augments.includes('motto') && legal && (def.honor || 0) + 2 >= 2) {
    bonus.heal += 1; bonus.labels.push('Боевой девиз');
  }
  if (combatant.augments.includes('spur') && !combatant.used.spur && card.kind === 'charge' && SLOT_META[slot]?.row === 'chief' && def.tags.includes('assault')) {
    bonus.attack += 2; bonus.labels.push('Золотая шпора');
  }
  if (combatant.augments.includes('seal') && !combatant.used.seal && !legal) {
    bonus.selfDamageReduction = 1; bonus.labels.push('Тайная печать');
  }
  if (combatant.augments.includes('chain') && (def.tags?.includes('guard') || card.device === 'tower' || card.device === 'cross')) {
    bonus.guard += 1; bonus.labels.push('Цепь вассалов');
  }
  return bonus;
}

export function previewAction(battle, side, card, target) {
  const combatant = battle[side];
  if (!combatant || !card) return null;
  const slot = card.kind === 'ordinary' ? null : Number(target);
  const legal = isLegalPlacement(combatant, card, slot);
  const def = cardDefinition(card);
  const symmetry = symmetryBonus(combatant, card, slot);
  const ordinary = ordinarySynergy(combatant, card, slot);
  const passive = housePassiveBonus(combatant, card, slot, legal);
  const augment = augmentBonus(combatant, card, slot, legal, def);
  let attack = def.attack || 0;
  let guard = def.guard || 0;
  let honor = def.honor || 0;
  let heal = def.heal || 0;
  let pierce = def.pierce || 0;
  const labels = [];

  if (card.kind === 'charge') {
    if (SLOT_META[slot]?.row === 'chief') attack += 1;
    if (SLOT_META[slot]?.row === 'base') guard += 1;
    if (slot === 3) honor += 1;
  }

  if (legal) {
    honor += 2;
  } else {
    attack += 2;
  }

  attack += symmetry.attack + ordinary.attack + passive.attack + augment.attack;
  guard += symmetry.guard + ordinary.guard + passive.guard + augment.guard;
  honor += symmetry.honor + ordinary.honor + passive.honor + augment.honor;
  heal += passive.heal + augment.heal;
  pierce += passive.pierce + augment.pierce;
  if (symmetry.label) labels.push(symmetry.label);
  if (ordinary.label) labels.push(ordinary.label);
  if (passive.label) labels.push(passive.label);
  labels.push(...augment.labels);

  const projectedStreak = legal ? combatant.legalStreak + 1 : 0;
  if (projectedStreak > 0 && projectedStreak % 3 === 0) {
    attack += 2;
    guard += 2;
    labels.push('Тройная согласованность');
  }

  return {
    side,
    card: clone(card),
    target: card.kind === 'ordinary' ? 'ordinary' : slot,
    legal,
    underTincture: underTinctureFor(combatant, card, slot),
    attack,
    guard,
    honor,
    heal,
    pierce,
    selfDamage: legal ? 0 : Math.max(0, 1 - augment.selfDamageReduction),
    labels,
    description: `${def.name} ${def.verb}`
  };
}

function consumeAugments(combatant, action) {
  if (combatant.augments.includes('spur') && action.labels.includes('Золотая шпора')) combatant.used.spur = true;
  if (combatant.augments.includes('seal') && action.labels.includes('Тайная печать')) combatant.used.seal = true;
}

function applyPlacement(combatant, card, target, action) {
  if (card.kind === 'ordinary') combatant.ordinary = clone(card);
  else combatant.board[target] = clone(card);
  combatant.legalStreak = action.legal ? combatant.legalStreak + 1 : 0;
  combatant.legalCount += action.legal ? 1 : 0;
  combatant.honor = Math.max(0, combatant.honor + action.honor);
  combatant.fury = Math.max(0, combatant.fury + (action.legal ? 0 : 2));
  consumeAugments(combatant, action);
}

function absorbAttack(defender, incoming, pierce) {
  const pierced = Math.min(incoming, Math.max(0, pierce));
  const blockable = Math.max(0, incoming - pierced);
  const absorbed = Math.min(defender.guard, blockable);
  defender.guard -= absorbed;
  return pierced + Math.max(0, blockable - absorbed);
}

function applyMantle(defender, damage) {
  if (!defender.augments.includes('mantle') || defender.used.mantle || damage <= 0) return damage;
  defender.used.mantle = true;
  return Math.max(0, damage - 2);
}

function battleScore(combatant) {
  return combatant.renown * 3 + combatant.guard + combatant.honor * 2 - combatant.fury;
}

function determineWinner(battle) {
  if (battle.player.renown <= 0 && battle.enemy.renown <= 0) {
    const playerScore = battleScore(battle.player);
    const enemyScore = battleScore(battle.enemy);
    battle.winner = playerScore >= enemyScore ? 'player' : 'enemy';
    battle.resultReason = 'mutual-fall';
    return;
  }
  if (battle.enemy.renown <= 0) {
    battle.winner = 'player'; battle.resultReason = 'broken-banner'; return;
  }
  if (battle.player.renown <= 0) {
    battle.winner = 'enemy'; battle.resultReason = 'broken-banner'; return;
  }
  if (battle.turn > battle.maxTurns) {
    const playerScore = battleScore(battle.player);
    const enemyScore = battleScore(battle.enemy);
    battle.winner = playerScore >= enemyScore ? 'player' : 'enemy';
    battle.resultReason = 'judgement';
  }
}

function resolveRound(battle, playerAction, enemyAction) {
  const player = battle.player;
  const enemy = battle.enemy;

  player.guard = Math.min(14, player.guard + playerAction.guard);
  enemy.guard = Math.min(14, enemy.guard + enemyAction.guard);

  let damageToEnemy = absorbAttack(enemy, playerAction.attack, playerAction.pierce);
  let damageToPlayer = absorbAttack(player, enemyAction.attack, enemyAction.pierce);
  damageToEnemy = applyMantle(enemy, damageToEnemy);
  damageToPlayer = applyMantle(player, damageToPlayer);

  player.renown = Math.min(player.maxRenown, player.renown - damageToPlayer - playerAction.selfDamage + playerAction.heal);
  enemy.renown = Math.min(enemy.maxRenown, enemy.renown - damageToEnemy - enemyAction.selfDamage + enemyAction.heal);

  battle.lastClash = {
    turn: battle.turn,
    player: playerAction,
    enemy: enemyAction,
    damageToEnemy,
    damageToPlayer,
    playerRenown: player.renown,
    enemyRenown: enemy.renown
  };
  battle.history.push(clone(battle.lastClash));
  battle.turn += 1;
  determineWinner(battle);
  if (battle.winner) {
    battle.phase = battle.winner === 'player' ? 'reward' : 'result';
    return;
  }
  player.hand = drawHand(battle, 'player');
  enemy.hand = drawHand(battle, 'enemy');
  battle.phase = 'player';
}

export function playRound(battleInput, playerCardId, playerTarget, enemyChoice) {
  const battle = clone(battleInput);
  if (battle.winner || battle.phase !== 'player') return { ok: false, error: 'Ход сейчас недоступен.', battle: battleInput };
  const playerCard = battle.player.hand.find((card) => card.id === playerCardId);
  if (!playerCard) return { ok: false, error: 'Фигура больше не находится в руке.', battle: battleInput };
  const playerTargets = validTargets(battle, 'player', playerCard);
  if (!playerTargets.includes(playerCard.kind === 'ordinary' ? 'ordinary' : Number(playerTarget))) {
    return { ok: false, error: 'Эту фигуру нельзя поставить сюда.', battle: battleInput };
  }
  const enemyCard = battle.enemy.hand.find((card) => card.id === enemyChoice?.cardId);
  if (!enemyCard) return { ok: false, error: 'Соперник не выбрал фигуру.', battle: battleInput };
  const enemyTarget = enemyCard.kind === 'ordinary' ? 'ordinary' : Number(enemyChoice.target);
  if (!validTargets(battle, 'enemy', enemyCard).includes(enemyTarget)) {
    return { ok: false, error: 'Соперник выбрал невозможную позицию.', battle: battleInput };
  }

  const playerAction = previewAction(battle, 'player', playerCard, playerTarget);
  const enemyAction = previewAction(battle, 'enemy', enemyCard, enemyTarget);
  applyPlacement(battle.player, playerCard, playerCard.kind === 'ordinary' ? null : Number(playerTarget), playerAction);
  applyPlacement(battle.enemy, enemyCard, enemyCard.kind === 'ordinary' ? null : enemyTarget, enemyAction);
  battle.player.hand = battle.player.hand.filter((card) => card.id !== playerCard.id);
  battle.enemy.hand = battle.enemy.hand.filter((card) => card.id !== enemyCard.id);
  resolveRound(battle, playerAction, enemyAction);
  return { ok: true, battle, playerAction, enemyAction, clash: battle.lastClash };
}

export function rankEnemyActions(battle) {
  const enemy = battle.enemy;
  const weights = {
    aggressive: { attack: 2.2, guard: 0.7, honor: 0.45, heal: 0.8, legal: 0.2, illegal: 1.0 },
    defensive: { attack: 1.1, guard: 1.9, honor: 0.7, heal: 1.3, legal: 1.0, illegal: -0.8 },
    honorable: { attack: 1.5, guard: 1.2, honor: 1.5, heal: 1.0, legal: 2.0, illegal: -1.8 },
    balanced: { attack: 1.6, guard: 1.3, honor: 0.9, heal: 1.0, legal: 1.0, illegal: -0.5 }
  }[enemy.style] || { attack: 1.6, guard: 1.3, honor: 0.9, heal: 1.0, legal: 1.0, illegal: -0.5 };

  const actions = [];
  for (const card of enemy.hand) {
    for (const target of validTargets(battle, 'enemy', card)) {
      const action = previewAction(battle, 'enemy', card, target);
      const potentialDamage = Math.max(0, action.attack - Math.max(0, battle.player.guard - action.pierce));
      const lethal = potentialDamage >= battle.player.renown ? 1000 : 0;
      const score =
        action.attack * weights.attack +
        action.guard * weights.guard +
        action.honor * weights.honor +
        action.heal * weights.heal +
        (action.legal ? weights.legal : weights.illegal) +
        action.labels.length * 0.4 +
        lethal;
      actions.push({ cardId: card.id, target, action, score });
    }
  }
  return actions.sort((a, b) => b.score - a.score);
}

export function chooseEnemyAction(battleInput) {
  const battle = clone(battleInput);
  const ranked = rankEnemyActions(battle);
  if (!ranked.length) return null;
  const pool = ranked.slice(0, Math.min(3, ranked.length));
  const choice = pool[Math.floor(randomFrom(battle) ** 1.8 * pool.length)] || pool[0];
  battleInput.rng = battle.rng;
  return { cardId: choice.cardId, target: choice.target };
}

function rewardPool(campaign) {
  const owned = new Set(campaign.augments);
  return Object.keys(AUGMENTS).filter((id) => !owned.has(id));
}

export function generateRewards(campaignInput, count = 3) {
  const campaign = clone(campaignInput);
  const pool = shuffled(campaign, rewardPool(campaign));
  return { rewards: pool.slice(0, Math.min(count, pool.length)), rng: campaign.rng };
}

export function finishBattle(campaignInput, battleInput) {
  const campaign = clone(campaignInput);
  const battle = clone(battleInput);
  campaign.battle = battle;
  campaign.rng = battle.rng;
  if (battle.winner !== 'player') return campaign;
  campaign.victories += 1;
  if (campaign.stage >= OPPONENTS.length - 1) {
    campaign.completed = true;
    campaign.battle.phase = 'complete';
    campaign.rewards = [];
    return campaign;
  }
  const generated = generateRewards(campaign, 3);
  campaign.rng = generated.rng;
  campaign.rewards = generated.rewards;
  return campaign;
}

export function chooseReward(campaignInput, rewardId) {
  const campaign = clone(campaignInput);
  if (!campaign.rewards.includes(rewardId) || campaign.completed) return campaign;
  campaign.augments.push(rewardId);
  campaign.stage += 1;
  campaign.rewards = [];
  campaign.battle = createBattle(campaign);
  campaign.rng = campaign.battle.rng;
  return campaign;
}

export function restartBattle(campaignInput) {
  const campaign = clone(campaignInput);
  campaign.battle = createBattle(campaign);
  campaign.rng = campaign.battle.rng;
  campaign.rewards = [];
  return campaign;
}

export function hydrateCampaign(value) {
  if (!value || value.version !== APP_STATE_VERSION || !HOUSES[value.houseId]) return null;
  if (!Array.isArray(value.augments) || !value.battle) return null;
  return clone(value);
}

export function campaignSummary(campaign) {
  if (!campaign) return null;
  const opponent = OPPONENTS[Math.min(campaign.stage, OPPONENTS.length - 1)];
  return {
    house: HOUSES[campaign.houseId],
    opponent,
    stage: campaign.stage,
    victories: campaign.victories,
    completed: campaign.completed,
    augments: campaign.augments.map((id) => AUGMENTS[id]).filter(Boolean)
  };
}
