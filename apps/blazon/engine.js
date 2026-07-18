export const VERSION = 3;
export const BATTLE_COUNT = 6;

export const TINCTURES = {
  gules: { id: 'gules', name: 'Червлень', color: '#982f35', contrast: '#f2d37d', ink: '#f8e7bd' },
  azure: { id: 'azure', name: 'Лазурь', color: '#214f83', contrast: '#e9ddd0', ink: '#f4ebdb' },
  argent: { id: 'argent', name: 'Серебро', color: '#e6e0d2', contrast: '#8e2730', ink: '#211e1a' },
  sable: { id: 'sable', name: 'Чернь', color: '#202522', contrast: '#d6ad48', ink: '#f4e5bd' }
};

export const FIELDS = {
  gules: { id: 'gules', name: 'Червлень', epithet: 'Обязательство', summary: 'Вступивший в бой отряд доводит атаку до конца.', principle: 'pressure', detail: 'Меньше метаний, больше риска пропустить угрозу на фланге.' },
  azure: { id: 'azure', name: 'Лазурь', epithet: 'Переоценка', summary: 'Отряды регулярно ищут более выгодную цель и маршрут.', principle: 'adaptation', detail: 'Гибкая армия, но её давление легче сбить.' },
  argent: { id: 'argent', name: 'Серебро', epithet: 'Связность', summary: 'Отряды предпочитают сохранять взаимную поддержку.', principle: 'cohesion', detail: 'Строй трудно разорвать, но он склонен уплотняться.' },
  sable: { id: 'sable', name: 'Чернь', epithet: 'Скрытый резерв', summary: 'Часть войск ждёт, пока враг раскроет главный удар.', principle: 'reserve', detail: 'Сильный ответ ценой более тонкой первой линии.' }
};

export const ORDINARIES = {
  pale: { id: 'pale', name: 'Столб', summary: 'Узкий глубокий центр и подача резервов по оси.', principle: 'pressure' },
  fess: { id: 'fess', name: 'Пояс', summary: 'Две широкие линии, способные сменять друг друга.', principle: 'cohesion' },
  bend: { id: 'bend', name: 'Перевязь', summary: 'Косой удар: одно крыло входит в бой раньше.', principle: 'adaptation' },
  chevron: { id: 'chevron', name: 'Стропило', summary: 'Вогнутый фронт принимает врага и закрывает крылья.', principle: 'cohesion' }
};

export const MAINS = {
  lion: { id: 'lion', name: 'Лев', summary: 'Два ближайших отряда совместно уничтожают одну цель.', principle: 'pressure' },
  boar: { id: 'boar', name: 'Вепрь', summary: 'После разрыва строя ратники идут в глубину, а не вязнут по краям.', principle: 'breach' },
  tower: { id: 'tower', name: 'Башня', summary: 'Удержанные позиции становятся точками повторного сбора.', principle: 'recovery' },
  stag: { id: 'stag', name: 'Олень', summary: 'Уступающий отряд отходит к союзнику и возвращается вместе с ним.', principle: 'adaptation' }
};

export const SECONDARIES = {
  eagle: { id: 'eagle', name: 'Орёл', summary: 'Лучники ищут изолированные цели и свободные сектора стрельбы.', principle: 'adaptation' },
  rose: { id: 'rose', name: 'Роза', summary: 'Каждое отделение лучников следует за своим отрядом ратников.', principle: 'cohesion' },
  key: { id: 'key', name: 'Ключ', summary: 'Лучники смещаются к пролому и ведут огонь в его глубину.', principle: 'breach' },
  sun: { id: 'sun', name: 'Солнце', summary: 'Свободные лучники сосредотачивают залп на одной пошатнувшейся цели.', principle: 'pressure' }
};

export const COMMANDS = {
  crown: { id: 'crown', name: 'Корона', summary: 'Один ведущий отряд задаёт соседям цель и направление.', principle: 'cohesion' },
  helmet: { id: 'helmet', name: 'Шлем', summary: 'Первые двадцать секунд армия следует заранее выбранной оси удара.', principle: 'pressure' },
  chain: { id: 'chain', name: 'Цепь ордена', summary: 'Главный инстинкт ждёт первого кризиса и не срабатывает преждевременно.', principle: 'reserve' }
};

export const MOTTOS = {
  breach: { id: 'breach', name: 'IN RUPTURAM', label: 'В пролом', summary: 'Первый свободный резерв немедленно входит в открывшийся разрыв.', principle: 'breach' },
  banner: { id: 'banner', name: 'SIGNUM PRIMUM', label: 'Знамя прежде', summary: 'При угрозе знамени два ближайших отряда бросают текущие задачи.', principle: 'recovery' },
  together: { id: 'together', name: 'UNA STAMUS', label: 'Стать вместе', summary: 'Два пошатнувшихся отряда сходятся и образуют новую линию.', principle: 'cohesion' },
  volley: { id: 'volley', name: 'ULTIMA SAGITTA', label: 'Последний залп', summary: 'Перед первым общим отходом лучники дают единый залп.', principle: 'pressure' }
};

export const SLOT_ORDER = ['main', 'secondary', 'command', 'motto'];
export const CATALOGS = { field: FIELDS, ordinary: ORDINARIES, main: MAINS, secondary: SECONDARIES, command: COMMANDS, motto: MOTTOS };

function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
export function normalizeSeed(seed) { const n = Number(seed); return Number.isFinite(n) ? (Math.abs(Math.floor(n)) || 1) >>> 0 : (Date.now() >>> 0); }
function rand(state) { state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0; return state.rng / 4294967296; }
function pick(state, items) { return items[Math.floor(rand(state) * items.length)] ?? items[0]; }
function shuffled(state, items) { const out = [...items]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand(state) * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }

export function emptyDoctrine(field = 'gules', ordinary = 'pale') {
  return { field, ordinary, main: null, secondary: null, command: null, motto: null, axis: 'center' };
}

export function createCampaign(field = 'gules', ordinary = 'pale', seed = Date.now()) {
  const s = normalizeSeed(seed);
  return {
    version: VERSION, seed: s, rng: s, battleIndex: 0, integrity: 3, victories: 0,
    doctrine: emptyDoctrine(field, ordinary), phase: 'briefing', completed: false,
    currentEnemy: null, currentSeed: null, lastResult: null, offers: [], revisionSlot: null
  };
}

export function hydrateCampaign(value) {
  if (!value || value.version !== VERSION || !value.doctrine) return null;
  const campaign = clone(value);
  campaign.integrity = Math.max(0, Math.min(3, Number(campaign.integrity) || 0));
  campaign.battleIndex = Math.max(0, Math.min(BATTLE_COUNT - 1, Number(campaign.battleIndex) || 0));
  return campaign;
}

export function doctrineLayers(doctrine) {
  return ['field', 'ordinary', 'main', 'secondary', 'command', 'motto'].map((slot) => ({ slot, id: doctrine[slot], definition: doctrine[slot] ? CATALOGS[slot][doctrine[slot]] : null }));
}

export function doctrineName(doctrine) {
  const main = doctrine.main ? MAINS[doctrine.main].name : 'Безымянное знамя';
  const field = FIELDS[doctrine.field]?.epithet || '';
  return `${main} · ${field}`;
}

export function nextUpgradeSlot(campaign) {
  if (campaign.battleIndex >= 1 && campaign.battleIndex <= SLOT_ORDER.length) return SLOT_ORDER[campaign.battleIndex - 1];
  if (campaign.battleIndex === 5) return 'revision';
  return null;
}

export function generateOffers(campaign) {
  const state = campaign;
  const slot = nextUpgradeSlot(campaign);
  if (!slot) return [];
  if (slot !== 'revision') {
    const ids = Object.keys(CATALOGS[slot]);
    return shuffled(state, ids).slice(0, 3).map((id) => ({ slot, id, definition: CATALOGS[slot][id], replaces: campaign.doctrine[slot] || null }));
  }
  const replaceable = ['field', 'ordinary', 'main', 'secondary'].filter((key) => campaign.doctrine[key]);
  const candidates = [];
  for (const key of shuffled(state, replaceable)) {
    const alternatives = shuffled(state, Object.keys(CATALOGS[key]).filter((id) => id !== campaign.doctrine[key]));
    if (alternatives[0]) candidates.push({ slot: key, id: alternatives[0], definition: CATALOGS[key][alternatives[0]], replaces: campaign.doctrine[key], revision: true });
    if (candidates.length >= 3) break;
  }
  return candidates;
}

export function applyOffer(campaign, offer) {
  const next = clone(campaign);
  next.doctrine[offer.slot] = offer.id;
  next.offers = [];
  next.phase = 'briefing';
  next.lastResult = null;
  return next;
}

function doctrineForStage(state, stage) {
  const doctrine = emptyDoctrine(pick(state, Object.keys(FIELDS)), pick(state, Object.keys(ORDINARIES)));
  if (stage >= 1) doctrine.main = pick(state, Object.keys(MAINS));
  if (stage >= 2) doctrine.secondary = pick(state, Object.keys(SECONDARIES));
  if (stage >= 3) doctrine.command = pick(state, Object.keys(COMMANDS));
  if (stage >= 4) doctrine.motto = pick(state, Object.keys(MOTTOS));
  doctrine.axis = pick(state, ['left', 'center', 'right']);
  return doctrine;
}

export function prepareBattle(campaign) {
  const next = clone(campaign);
  if (!next.currentEnemy) next.currentEnemy = doctrineForStage(next, next.battleIndex);
  if (!next.currentSeed) next.currentSeed = (next.seed ^ Math.imul(next.battleIndex + 1, 0x9e3779b9)) >>> 0;
  next.phase = 'briefing';
  return next;
}

export function recordBattle(campaign, result) {
  const next = clone(campaign);
  next.lastResult = clone(result);
  next.currentEnemy = null;
  next.currentSeed = null;
  if (result.winner === 'player') next.victories += 1;
  else next.integrity -= 1;
  if (next.integrity <= 0 || next.battleIndex >= BATTLE_COUNT - 1) {
    next.completed = true;
    next.phase = 'ending';
    return next;
  }
  next.battleIndex += 1;
  next.phase = 'reward';
  next.offers = generateOffers(next);
  return next;
}

const SIDE_SIGN = { player: 1, enemy: -1 };

function formationPositions(side, ordinary) {
  const dir = SIDE_SIGN[side];
  const baseX = side === 'player' ? 235 : 765;
  const ys = [150, 250, 350, 450];
  let xs;
  switch (ordinary) {
    case 'pale': xs = [baseX + dir * 34, baseX + dir * 2, baseX - dir * 30, baseX - dir * 62]; break;
    case 'fess': xs = [baseX + dir * 20, baseX + dir * 20, baseX - dir * 25, baseX - dir * 25]; break;
    case 'bend': xs = [baseX + dir * 54, baseX + dir * 18, baseX - dir * 18, baseX - dir * 54]; break;
    case 'chevron': xs = [baseX + dir * 44, baseX - dir * 18, baseX - dir * 18, baseX + dir * 44]; break;
    default: xs = [baseX, baseX, baseX, baseX];
  }
  return ys.map((y) => ({ x: xs.shift(), y }));
}

function createArmy(side, doctrine) {
  const positions = formationPositions(side, doctrine.ordinary);
  const dir = SIDE_SIGN[side];
  const infantry = positions.map((p, i) => ({
    id: `${side}-i${i}`, side, type: 'infantry', index: i, x: p.x, y: p.y, homeX: p.x, homeY: p.y,
    strength: 8, morale: 1, state: 'advance', targetId: null, lockedTarget: null, anchor: null,
    cooldown: 0, retarget: 0, rally: 0, breach: false, leader: i === 1, reserve: doctrine.field === 'sable' && i === 3,
    lastRule: 'ordinary'
  }));
  const archers = positions.map((p, i) => ({
    id: `${side}-a${i}`, side, type: 'archer', index: i, x: p.x - dir * 88, y: p.y, homeX: p.x - dir * 88, homeY: p.y,
    strength: 4, morale: 1, state: 'support', targetId: null, cooldown: 0.4 + i * 0.25, retarget: 0,
    reserve: doctrine.field === 'sable' && i === 3, pairedId: `${side}-i${i}`, lastRule: 'ordinary'
  }));
  return { side, doctrine: clone(doctrine), infantry, archers, banner: { x: side === 'player' ? 105 : 895, y: 300, capture: 0 }, brokenCount: 0, mottoUsed: false, crisis: false };
}

export function createBattleState(playerDoctrine, enemyDoctrine, seed = 1) {
  const state = {
    version: 1, rng: normalizeSeed(seed), time: 0, status: 'running', winner: null,
    player: createArmy('player', playerDoctrine), enemy: createArmy('enemy', enemyDoctrine),
    events: [], arrows: [], decisive: [], globalRetreat: { player: false, enemy: false }
  };
  event(state, 'both', 'deployment', 'Знамёна подняты. Доктрины вступили в силу.');
  return state;
}

function event(state, side, rule, text) {
  const item = { time: state.time, side, rule, text };
  state.events.push(item);
  if (rule !== 'movement' && state.decisive.length < 8) state.decisive.push(item);
}
function enemyArmy(state, side) { return side === 'player' ? state.enemy : state.player; }
function living(squad) { return squad.strength > 0.15 && squad.morale > 0.05; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function moveToward(squad, target, speed, dt) {
  const dx = target.x - squad.x, dy = target.y - squad.y, d = Math.hypot(dx, dy) || 1;
  squad.x += dx / d * Math.min(d, speed * dt); squad.y += dy / d * Math.min(d, speed * dt);
}
function nearest(list, source, predicate = living) {
  let best = null, bestD = Infinity;
  for (const item of list) { if (!predicate(item)) continue; const d = dist(source, item); if (d < bestD) { best = item; bestD = d; } }
  return best;
}
function findById(state, id) {
  for (const army of [state.player, state.enemy]) for (const squad of [...army.infantry, ...army.archers]) if (squad.id === id) return squad;
  return null;
}
function activeMain(army) { return army.doctrine.main && !(army.doctrine.command === 'chain' && !army.crisis); }
function threatNearBanner(state, army) { return enemyArmy(state, army.side).infantry.some((s) => living(s) && dist(s, army.banner) < 150); }
function gapExists(enemy) {
  const live = enemy.infantry.filter(living).sort((a, b) => a.y - b.y);
  if (live.length < 3) return true;
  for (let i = 1; i < live.length; i++) if (Math.abs(live[i].y - live[i - 1].y) > 135) return true;
  return false;
}
function gapPoint(enemy) {
  const live = enemy.infantry.filter(living).sort((a, b) => a.y - b.y);
  if (live.length < 2) return { x: enemy.banner.x, y: 300 };
  let best = { size: 0, y: 300 };
  const bounds = [75, ...live.map((s) => s.y), 525];
  for (let i = 1; i < bounds.length; i++) { const size = bounds[i] - bounds[i - 1]; if (size > best.size) best = { size, y: (bounds[i] + bounds[i - 1]) / 2 }; }
  const frontline = live.reduce((sum, s) => sum + s.x, 0) / live.length;
  return { x: frontline, y: best.y };
}
function supportCount(army, squad, radius = 125) { return army.infantry.filter((s) => s !== squad && living(s) && dist(s, squad) < radius).length; }
function nearbyEnemies(enemy, squad, radius = 95) { return enemy.infantry.filter((s) => living(s) && dist(s, squad) < radius).length; }

function applyMotto(state, army) {
  if (!army.doctrine.motto || army.mottoUsed) return;
  const motto = army.doctrine.motto;
  if (motto === 'banner' && threatNearBanner(state, army)) {
    const defenders = army.infantry.filter(living).sort((a, b) => dist(a, army.banner) - dist(b, army.banner)).slice(0, 2);
    for (const s of defenders) { s.state = 'defend-banner'; s.targetId = null; s.lastRule = 'motto'; }
    army.mottoUsed = true; event(state, army.side, 'motto', '«Знамя прежде»: два отряда возвращаются к знамени.');
  }
  if (motto === 'together') {
    const shaken = army.infantry.filter((s) => living(s) && s.morale < 0.38);
    if (shaken.length >= 2) {
      const point = { x: (shaken[0].x + shaken[1].x) / 2, y: (shaken[0].y + shaken[1].y) / 2 };
      for (const s of shaken.slice(0, 2)) { s.state = 'join'; s.joinPoint = point; s.lastRule = 'motto'; }
      army.mottoUsed = true; event(state, army.side, 'motto', '«Стать вместе»: пошатнувшиеся отряды сходятся в новую линию.');
    }
  }
  if (motto === 'breach' && gapExists(enemyArmy(state, army.side))) {
    const reserve = army.infantry.find((s) => living(s) && (s.reserve || s.index === 3));
    if (reserve) {
      reserve.reserve = false; reserve.state = 'breach'; reserve.breachPoint = gapPoint(enemyArmy(state, army.side)); reserve.lastRule = 'motto';
      army.mottoUsed = true; event(state, army.side, 'motto', '«В пролом»: резерв направлен в разрыв строя.');
    }
  }
  if (motto === 'volley' && state.globalRetreat[army.side]) {
    for (const a of army.archers.filter(living)) a.cooldown = 0;
    army.mottoUsed = true; event(state, army.side, 'motto', '«Последний залп»: лучники стреляют перед отходом.');
  }
}

function chooseInfantryTarget(state, army, squad) {
  const enemy = enemyArmy(state, army.side);
  const doctrine = army.doctrine;
  if (squad.state === 'defend-banner') return nearest(enemy.infantry, squad);
  if (doctrine.field === 'gules' && squad.lockedTarget) {
    const locked = findById(state, squad.lockedTarget); if (locked && living(locked)) return locked;
  }
  if (doctrine.command === 'crown' && !squad.leader) {
    const leader = army.infantry.find((s) => s.leader && living(s));
    if (leader?.targetId) { const target = findById(state, leader.targetId); if (target && living(target)) return target; }
  }
  if (activeMain(army) === 'lion') {
    const allyTargetCounts = new Map();
    for (const ally of army.infantry) if (ally.targetId) allyTargetCounts.set(ally.targetId, (allyTargetCounts.get(ally.targetId) || 0) + 1);
    const focused = [...enemy.infantry].filter(living).sort((a, b) => (allyTargetCounts.get(b.id) || 0) - (allyTargetCounts.get(a.id) || 0) || dist(squad, a) - dist(squad, b))[0];
    if (focused) return focused;
  }
  if (doctrine.field === 'azure') {
    return [...enemy.infantry].filter(living).sort((a, b) => (supportCount(enemy, a) - supportCount(enemy, b)) || dist(squad, a) - dist(squad, b))[0] || null;
  }
  return nearest(enemy.infantry, squad);
}

function updateInfantry(state, army, squad, dt) {
  if (!living(squad)) return;
  const enemy = enemyArmy(state, army.side);
  const doctrine = army.doctrine;
  const dir = SIDE_SIGN[army.side];
  squad.cooldown -= dt; squad.retarget -= dt;
  if (squad.reserve) {
    const trigger = enemy.infantry.some((s) => living(s) && ((army.side === 'player' && s.x < 570) || (army.side === 'enemy' && s.x > 430))) || army.crisis;
    if (!trigger) { moveToward(squad, { x: squad.homeX - dir * 55, y: squad.homeY }, 13, dt); squad.lastRule = 'field'; return; }
    squad.reserve = false; event(state, army.side, 'field', 'Скрытый резерв вступил в бой.');
  }
  if (squad.state === 'defend-banner') {
    moveToward(squad, army.banner, 24, dt);
    if (dist(squad, army.banner) < 70) squad.state = 'advance';
    return;
  }
  if (squad.state === 'join' && squad.joinPoint) {
    moveToward(squad, squad.joinPoint, 20, dt);
    if (dist(squad, squad.joinPoint) < 20) { squad.morale = Math.min(0.65, squad.morale + 0.18); squad.state = 'advance'; }
    return;
  }
  if (squad.state === 'rout') {
    const rallyTarget = activeMain(army) === 'tower' && squad.anchor ? squad.anchor : army.banner;
    moveToward(squad, rallyTarget, 28, dt);
    if (dist(squad, rallyTarget) < 55) { squad.rally += dt; if (squad.rally > 3.2) { squad.morale = 0.34; squad.state = 'advance'; squad.rally = 0; event(state, army.side, 'recovery', 'Разбитый отряд собрался под знаком герба.'); } }
    return;
  }
  if (activeMain(army) === 'stag' && nearbyEnemies(enemy, squad, 95) > supportCount(army, squad, 105) + 1) {
    const ally = nearest(army.infantry, squad, (s) => s !== squad && living(s));
    if (ally) { moveToward(squad, { x: ally.x - dir * 35, y: ally.y }, 22, dt); squad.lastRule = 'main'; return; }
  }
  if ((activeMain(army) === 'boar' || squad.state === 'breach') && gapExists(enemy)) {
    const gp = squad.breachPoint || gapPoint(enemy);
    moveToward(squad, { x: gp.x + dir * 80, y: gp.y }, 22, dt); squad.lastRule = squad.state === 'breach' ? 'motto' : 'main';
    if ((army.side === 'player' && squad.x > gp.x + 45) || (army.side === 'enemy' && squad.x < gp.x - 45)) moveToward(squad, enemy.banner, 24, dt);
  }
  if (doctrine.field === 'argent') {
    const ally = nearest(army.infantry, squad, (s) => s !== squad && living(s));
    if (ally && dist(ally, squad) > 150) { moveToward(squad, ally, 17, dt); squad.lastRule = 'field'; return; }
  }
  let target = squad.targetId ? findById(state, squad.targetId) : null;
  if (!target || !living(target) || squad.retarget <= 0) {
    target = chooseInfantryTarget(state, army, squad);
    squad.targetId = target?.id || null; squad.retarget = doctrine.field === 'azure' ? 1.2 : 2.8;
    if (doctrine.field === 'gules' && target) squad.lockedTarget = target.id;
  }
  if (!target) { moveToward(squad, enemy.banner, 18, dt); return; }
  const d = dist(squad, target);
  if (d > 42) {
    let destination = target;
    if (doctrine.command === 'helmet' && state.time < 20) {
      const axisY = doctrine.axis === 'left' ? 170 : doctrine.axis === 'right' ? 430 : 300;
      destination = { x: target.x, y: axisY * 0.65 + target.y * 0.35 }; squad.lastRule = 'command';
    }
    moveToward(squad, destination, 20, dt);
  } else if (squad.cooldown <= 0) {
    const power = 0.0038 * squad.strength * (0.65 + squad.morale * 0.35);
    target.morale -= power;
    if (rand(state) < 0.18 + squad.strength * 0.006) target.strength -= 0.28 + rand(state) * 0.22;
    squad.cooldown = 0.62;
    squad.morale = Math.min(1, squad.morale + 0.008);
  }
  if (activeMain(army) === 'tower' && !squad.anchor && state.time > 8 && dist(squad, { x: squad.homeX, y: squad.homeY }) > 45) {
    squad.anchor = { x: squad.x, y: squad.y }; event(state, army.side, 'main', 'Башня закрепила новую точку сбора.');
  }
}

function clearShot(army, archer, target) {
  for (const ally of army.infantry) {
    if (!living(ally)) continue;
    const total = dist(archer, target);
    const d1 = dist(archer, ally), d2 = dist(ally, target);
    if (Math.abs((d1 + d2) - total) < 30 && d1 < total) return false;
  }
  return true;
}
function chooseArcherTarget(state, army, archer) {
  const enemy = enemyArmy(state, army.side);
  const candidates = enemy.infantry.filter((s) => living(s) && dist(archer, s) < 285 && clearShot(army, archer, s));
  if (!candidates.length) return null;
  const secondary = army.doctrine.secondary;
  if (secondary === 'sun') return candidates.sort((a, b) => a.morale - b.morale || a.strength - b.strength)[0];
  if (secondary === 'eagle') return candidates.sort((a, b) => supportCount(enemy, a) - supportCount(enemy, b) || a.morale - b.morale)[0];
  if (secondary === 'key' && gapExists(enemy)) {
    const gp = gapPoint(enemy); return candidates.sort((a, b) => Math.abs(a.y - gp.y) - Math.abs(b.y - gp.y))[0];
  }
  return candidates.sort((a, b) => dist(archer, a) - dist(archer, b))[0];
}
function updateArcher(state, army, archer, dt) {
  if (!living(archer)) return;
  const enemy = enemyArmy(state, army.side);
  const dir = SIDE_SIGN[army.side];
  archer.cooldown -= dt; archer.retarget -= dt;
  if (archer.reserve) {
    if (!army.crisis && !gapExists(enemy)) { moveToward(archer, { x: archer.homeX - dir * 40, y: archer.homeY }, 12, dt); return; }
    archer.reserve = false;
  }
  const close = nearest(enemy.infantry, archer);
  if (close && dist(close, archer) < 72) {
    moveToward(archer, { x: archer.x - dir * 90, y: clamp(archer.y + (archer.y < close.y ? -40 : 40), 55, 545) }, 25, dt);
    archer.morale -= 0.015 * dt; archer.lastRule = 'base'; return;
  }
  if (army.doctrine.secondary === 'rose') {
    const pair = findById(state, archer.pairedId);
    if (pair && living(pair)) {
      const desired = { x: pair.x - dir * 95, y: pair.y };
      if (dist(archer, desired) > 34) { moveToward(archer, desired, 17, dt); archer.lastRule = 'secondary'; }
    }
  } else if (army.doctrine.secondary === 'eagle') {
    const target = chooseArcherTarget(state, army, archer);
    if (!target) {
      const flankY = archer.index < 2 ? 80 + archer.index * 55 : 520 - (3 - archer.index) * 55;
      moveToward(archer, { x: archer.x + dir * 6, y: flankY }, 14, dt); archer.lastRule = 'secondary';
    }
  } else if (army.doctrine.secondary === 'key' && gapExists(enemy)) {
    const gp = gapPoint(enemy); moveToward(archer, { x: gp.x - dir * 150, y: gp.y }, 16, dt); archer.lastRule = 'secondary';
  }
  let target = archer.targetId ? findById(state, archer.targetId) : null;
  if (!target || !living(target) || archer.retarget <= 0 || !clearShot(army, archer, target)) {
    target = chooseArcherTarget(state, army, archer); archer.targetId = target?.id || null; archer.retarget = army.doctrine.secondary === 'eagle' ? 0.9 : 1.6;
  }
  if (target && archer.cooldown <= 0) {
    target.morale -= 0.0042 * archer.strength;
    if (rand(state) < 0.11 + archer.strength * 0.008) target.strength -= 0.18 + rand(state) * 0.15;
    archer.cooldown = 1.65;
    state.arrows.push({ side: army.side, x1: archer.x, y1: archer.y, x2: target.x, y2: target.y, life: 0.34 });
  }
}

function resolveMorale(state, army) {
  let broken = 0;
  for (const s of army.infantry) {
    s.strength = clamp(s.strength, 0, 8); s.morale = clamp(s.morale, 0, 1);
    if (s.strength <= 0.2 || s.morale <= 0.08) {
      broken++;
      if (s.state !== 'rout' && s.strength > 0.2) { s.state = 'rout'; s.targetId = null; s.lockedTarget = null; s.rally = 0; event(state, army.side, 'break', `Отряд ${s.index + 1} потерял строй.`); }
    }
  }
  army.brokenCount = broken;
  if (broken > 0 && !army.crisis) { army.crisis = true; event(state, army.side, 'crisis', 'Первый кризис раскрыл удержанные правила доктрины.'); }
  if (broken >= 2) state.globalRetreat[army.side] = true;
}
function updateCapture(state, army, enemy, dt) {
  const attackers = army.infantry.filter((s) => living(s) && s.state !== 'rout' && dist(s, enemy.banner) < 48);
  const defenders = enemy.infantry.filter((s) => living(s) && s.state !== 'rout' && dist(s, enemy.banner) < 105);
  if (attackers.length && !defenders.length) enemy.banner.capture += dt;
  else enemy.banner.capture = Math.max(0, enemy.banner.capture - dt * 0.7);
}

export function stepBattle(state, dt = 0.1) {
  if (!state || state.status !== 'running') return state;
  dt = Math.min(0.2, Math.max(0.02, dt)); state.time += dt;
  for (const army of [state.player, state.enemy]) applyMotto(state, army);
  for (const army of [state.player, state.enemy]) {
    for (const squad of army.infantry) updateInfantry(state, army, squad, dt);
    for (const archer of army.archers) updateArcher(state, army, archer, dt);
  }
  for (const arrow of state.arrows) arrow.life -= dt;
  state.arrows = state.arrows.filter((a) => a.life > 0);
  resolveMorale(state, state.player); resolveMorale(state, state.enemy);
  updateCapture(state, state.player, state.enemy, dt); updateCapture(state, state.enemy, state.player, dt);
  let winner = null;
  if (state.enemy.banner.capture >= 3 || state.enemy.brokenCount >= 3) winner = 'player';
  if (state.player.banner.capture >= 3 || state.player.brokenCount >= 3) winner = winner ? (state.player.banner.capture < state.enemy.banner.capture ? 'player' : 'enemy') : 'enemy';
  if (!winner && state.time >= 95) {
    const p = state.player.infantry.reduce((s, q) => s + q.strength * q.morale, 0) + (3 - state.player.banner.capture);
    const e = state.enemy.infantry.reduce((s, q) => s + q.strength * q.morale, 0) + (3 - state.enemy.banner.capture);
    winner = p >= e ? 'player' : 'enemy';
  }
  if (winner) { state.status = 'finished'; state.winner = winner; event(state, winner, 'victory', winner === 'player' ? 'Вражеский строй окончательно разрушен.' : 'Твой строй окончательно разрушен.'); }
  return state;
}

export function simulateBattle(playerDoctrine, enemyDoctrine, seed = 1, maxSeconds = 100) {
  const state = createBattleState(playerDoctrine, enemyDoctrine, seed);
  while (state.status === 'running' && state.time < maxSeconds) stepBattle(state, 0.1);
  return summarizeBattle(state);
}

export function summarizeBattle(state) {
  const squadScore = (army) => army.infantry.reduce((sum, s) => sum + Math.max(0, s.strength) * Math.max(0, s.morale), 0);
  return {
    winner: state.winner, duration: Math.round(state.time * 10) / 10,
    playerRemaining: Math.round(squadScore(state.player) * 10) / 10,
    enemyRemaining: Math.round(squadScore(state.enemy) * 10) / 10,
    playerBroken: state.player.brokenCount, enemyBroken: state.enemy.brokenCount,
    events: state.events.slice(-18), decisive: state.decisive.slice(-5), seed: state.rng
  };
}

export function randomDoctrine(seed = 1, completeness = 4) {
  const state = { rng: normalizeSeed(seed) };
  return doctrineForStage(state, completeness);
}

export function botAudit(iterations = 100, seed = 1) {
  const results = { player: 0, enemy: 0, averageDuration: 0, timeouts: 0 };
  for (let i = 0; i < iterations; i++) {
    const a = randomDoctrine(seed + i * 31, 4); const b = randomDoctrine(seed + i * 31 + 7, 4);
    const r1 = simulateBattle(a, b, seed + i * 97); const r2 = simulateBattle(b, a, seed + i * 97);
    results[r1.winner]++; results[r2.winner]++;
    results.averageDuration += r1.duration + r2.duration;
    if (r1.duration >= 95) results.timeouts++;
    if (r2.duration >= 95) results.timeouts++;
  }
  results.averageDuration = Math.round(results.averageDuration / (iterations * 2) * 10) / 10;
  return results;
}
