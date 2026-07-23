export const VERSION = '1.0.0';
export const STORAGE_KEY = 'pocket-works:iznanka:save-v1';
export const TILE = 16;
export const WORLD_W = 52 * TILE;
export const WORLD_H = 42 * TILE;
export const LAYERS = Object.freeze({ BLOOM: 'bloom', ASH: 'ash' });

export const PALETTES = Object.freeze({
  bloom: {
    sky: '#1a211a', floorA: '#46553d', floorB: '#506147', line: '#273126', wall: '#68735a', wallTop: '#84906f', water: '#365e64', waterLight: '#4b7b7d', accent: '#d8b45b', fog: '#81906f'
  },
  ash: {
    sky: '#17151d', floorA: '#3d3748', floorB: '#463e52', line: '#26212e', wall: '#5d5369', wallTop: '#776b84', water: '#292a43', waterLight: '#414568', accent: '#9d86c6', fog: '#756985'
  }
});

const rect = (x, y, w, h) => ({ x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE });
const point = (x, y) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });

export const ZONES = Object.freeze({
  threshold: {
    id: 'threshold', name: 'Порог', chapter: 'ГЛАВА I · РАЗРЫВ', size: [52, 42],
    spawn: point(25, 31), shrine: point(25, 30),
    obstacles: {
      bloom: [rect(0,0,52,2),rect(0,40,52,2),rect(0,0,2,42),rect(50,0,2,42),rect(7,7,13,3),rect(32,7,13,3),rect(10,18,8,2),rect(34,18,8,2),rect(22,11,8,4),rect(6,29,8,3),rect(38,29,8,3),rect(21,36,10,2)],
      ash: [rect(0,0,52,2),rect(0,40,52,2),rect(0,0,2,42),rect(50,0,2,42),rect(7,7,8,3),rect(37,7,8,3),rect(15,13,6,2),rect(31,13,6,2),rect(7,24,12,2),rect(33,24,12,2),rect(20,32,12,2)]
    },
    hazards: { bloom: [], ash: [rect(23,17,6,5)] },
    portals: [
      { id:'to-garden', x:49*TILE, y:17*TILE, w:2*TILE, h:7*TILE, to:'garden', spawn:point(3,21), label:'Войти в Сад Костей', requirement:'tutorial' },
      { id:'to-drowned', x:22*TILE, y:39*TILE, w:8*TILE, h:2*TILE, to:'drowned', spawn:point(26,4), label:'Спуститься к Затопленным улицам', requirement:'tutorial' },
      { id:'to-archive', x:1*TILE, y:17*TILE, w:2*TILE, h:7*TILE, to:'archive', spawn:point(48,21), label:'Открыть Архив Шёпота', requirement:'two-seals' },
      { id:'to-tower', x:22*TILE, y:1*TILE, w:8*TILE, h:2*TILE, to:'tower', spawn:point(26,37), label:'Войти в Башню Шва', requirement:'three-seals' }
    ],
    npcs: [
      { id:'mira', name:'Мира, последняя швея', ...point(25,27), layer:'both', dialogue:'mira' },
      { id:'rag', name:'Раг, торговец пустотами', ...point(10,33), layer:'ash', dialogue:'rag' }
    ],
    chests: [
      { id:'threshold-bloom', ...point(42,12), layer:'bloom', reward:{ threads:35, potion:1 }, label:'Сундучок травницы' },
      { id:'threshold-ash', ...point(9,12), layer:'ash', reward:{ threads:30, relic:'split-knot' }, label:'Зашитый ларец' }
    ],
    enemies: [
      ['hush-a','hush',18,24,'bloom'],['hush-b','hush',31,23,'bloom'],['wisp-a','wisp',17,14,'ash'],['wisp-b','wisp',35,15,'ash'],['hunter-a','hunter',25,20,'both']
    ]
  },
  garden: {
    id:'garden', name:'Сад Костей', chapter:'ГЛАВА II · КОРНИ', size:[52,42], spawn:point(3,21), shrine:point(7,21),
    obstacles:{
      bloom:[rect(0,0,52,2),rect(0,40,52,2),rect(0,0,2,42),rect(50,0,2,42),rect(8,5,3,25),rect(16,12,3,28),rect(24,3,3,27),rect(32,12,3,28),rect(40,3,3,27),rect(8,30,7,3),rect(26,30,5,3),rect(43,30,7,3)],
      ash:[rect(0,0,52,2),rect(0,40,52,2),rect(0,0,2,42),rect(50,0,2,42),rect(8,5,3,15),rect(8,26,3,10),rect(16,2,3,25),rect(24,15,3,25),rect(32,2,3,25),rect(40,15,3,25),rect(12,32,10,3),rect(30,8,10,3)]
    },
    hazards:{ bloom:[rect(12,7,3,3),rect(28,34,3,3),rect(44,10,3,3)], ash:[rect(20,6,3,3),rect(36,30,3,3)] },
    portals:[{ id:'garden-back', x:1*TILE,y:17*TILE,w:2*TILE,h:8*TILE,to:'threshold',spawn:point(47,21),label:'Вернуться на Порог' }],
    npcs:[
      { id:'oss', name:'Осс, садовник без лица', ...point(13,37), layer:'bloom', dialogue:'oss' },
      { id:'child-root', name:'Корневой ребёнок', ...point(38,6), layer:'ash', dialogue:'root-child' }
    ],
    chests:[
      { id:'garden-1', ...point(13,8), layer:'bloom', reward:{threads:45,potion:1}, label:'Садовая шкатулка' },
      { id:'garden-2', ...point(46,35), layer:'ash', reward:{relic:'thorn-heart'}, label:'Сердце терновника' }
    ],
    enemies:[
      ['g-h1','hush',13,17,'bloom'],['g-h2','hush',29,9,'bloom'],['g-b1','brute',22,35,'bloom'],['g-w1','wisp',13,24,'ash'],['g-w2','wisp',37,18,'ash'],['g-hn1','hunter',45,25,'both'],['g-hn2','hunter',29,37,'both'],['garden-boss','gardener',46,20,'both']
    ]
  },
  drowned: {
    id:'drowned', name:'Затопленные улицы', chapter:'ГЛАВА II · ГЛУБИНА', size:[52,42], spawn:point(26,4), shrine:point(26,7),
    obstacles:{
      bloom:[rect(0,0,52,2),rect(0,40,52,2),rect(0,0,2,42),rect(50,0,2,42),rect(6,12,40,4),rect(6,27,40,4),rect(6,16,5,11),rect(20,16,5,11),rect(35,16,5,11)],
      ash:[rect(0,0,52,2),rect(0,40,52,2),rect(0,0,2,42),rect(50,0,2,42),rect(6,12,14,4),rect(30,12,16,4),rect(6,27,17,4),rect(33,27,13,4),rect(6,16,5,11),rect(20,16,5,4),rect(20,23,5,4),rect(35,16,5,11)]
    },
    hazards:{ bloom:[rect(11,16,9,11),rect(25,16,10,11),rect(40,16,6,11)], ash:[rect(21,20,3,3),rect(30,18,3,7)] },
    portals:[{ id:'drowned-back', x:22*TILE,y:1*TILE,w:8*TILE,h:2*TILE,to:'threshold',spawn:point(26,37),label:'Подняться на Порог' }],
    npcs:[
      { id:'ferryman-npc', name:'Паромщица Эвра', ...point(8,36), layer:'bloom', dialogue:'evra' },
      { id:'bellman', name:'Утопленный звонарь', ...point(44,8), layer:'ash', dialogue:'bellman' }
    ],
    chests:[
      { id:'drowned-1', ...point(7,8), layer:'bloom', reward:{threads:55,potion:2}, label:'Сухой сундук' },
      { id:'drowned-2', ...point(44,35), layer:'ash', reward:{relic:'salt-eye'}, label:'Глаз из соли' }
    ],
    enemies:[
      ['d-l1','leech',14,9,'bloom'],['d-l2','leech',42,20,'bloom'],['d-h1','hunter',29,34,'both'],['d-w1','wisp',17,34,'ash'],['d-w2','wisp',31,20,'ash'],['d-b1','brute',44,33,'ash'],['drowned-boss','ferryman',26,35,'both']
    ]
  },
  archive: {
    id:'archive', name:'Архив Шёпота', chapter:'ГЛАВА III · ИМЕНА', size:[52,42], spawn:point(48,21), shrine:point(45,21),
    obstacles:{
      bloom:[rect(0,0,52,2),rect(0,40,52,2),rect(0,0,2,42),rect(50,0,2,42),rect(8,6,5,30),rect(19,3,4,25),rect(19,32,4,6),rect(30,6,4,32),rect(41,3,4,25),rect(41,32,4,6)],
      ash:[rect(0,0,52,2),rect(0,40,52,2),rect(0,0,2,42),rect(50,0,2,42),rect(8,3,5,24),rect(8,31,5,7),rect(19,8,4,30),rect(30,3,4,25),rect(30,32,4,6),rect(41,8,4,30)]
    },
    hazards:{ bloom:[], ash:[rect(14,18,4,5),rect(35,12,4,5)] },
    portals:[{ id:'archive-back', x:49*TILE,y:17*TILE,w:2*TILE,h:8*TILE,to:'threshold',spawn:point(4,21),label:'Вернуться на Порог' }],
    npcs:[
      { id:'scribe', name:'Писец без имени', ...point(37,35), layer:'bloom', dialogue:'scribe' },
      { id:'echo-mira', name:'Эхо Миры', ...point(15,6), layer:'ash', dialogue:'echo-mira' }
    ],
    chests:[
      { id:'archive-1', ...point(25,5), layer:'bloom', reward:{threads:60,potion:1}, label:'Каталог запретных имён' },
      { id:'archive-2', ...point(14,36), layer:'ash', reward:{relic:'paper-moon'}, label:'Бумажная луна' }
    ],
    enemies:[
      ['a-h1','hunter',36,10,'both'],['a-h2','hunter',16,30,'both'],['a-w1','wisp',25,18,'ash'],['a-w2','wisp',38,28,'ash'],['a-b1','brute',26,34,'bloom'],['a-l1','leech',14,14,'bloom'],['archive-boss','archivist',6,21,'both']
    ]
  },
  tower: {
    id:'tower', name:'Башня Шва', chapter:'ФИНАЛ · ЧТО ОСТАНЕТСЯ', size:[52,42], spawn:point(26,37), shrine:point(26,35),
    obstacles:{
      bloom:[rect(0,0,52,2),rect(0,40,52,2),rect(0,0,2,42),rect(50,0,2,42),rect(7,7,8,3),rect(37,7,8,3),rect(7,30,8,3),rect(37,30,8,3),rect(17,13,4,16),rect(31,13,4,16)],
      ash:[rect(0,0,52,2),rect(0,40,52,2),rect(0,0,2,42),rect(50,0,2,42),rect(7,7,8,3),rect(37,7,8,3),rect(7,30,8,3),rect(37,30,8,3),rect(12,18,10,4),rect(30,18,10,4)]
    },
    hazards:{ bloom:[rect(23,12,6,3)], ash:[rect(23,27,6,3)] },
    portals:[{ id:'tower-back', x:22*TILE,y:39*TILE,w:8*TILE,h:2*TILE,to:'threshold',spawn:point(26,4),label:'Покинуть Башню' }],
    npcs:[{ id:'weaver-before', name:'Первый Шов', ...point(26,12), layer:'both', dialogue:'weaver-before' }],
    chests:[{ id:'tower-cache', ...point(43,36), layer:'both', reward:{threads:100,potion:3,relic:'first-thread'}, label:'Запас Первого Шва' }],
    enemies:[
      ['t-h1','hunter',12,25,'both'],['t-h2','hunter',40,25,'both'],['t-b1','brute',12,13,'bloom'],['t-b2','brute',40,13,'ash'],['tower-boss','weaver',26,8,'both']
    ]
  }
});

export const ENEMY_TYPES = Object.freeze({
  hush: { name:'Безголосый', hp:42, speed:46, damage:9, radius:9, xp:18, threads:[4,8], color:'#d7d0b5', behavior:'chase' },
  wisp: { name:'Синяя искра', hp:32, speed:58, damage:8, radius:7, xp:16, threads:[3,7], color:'#9d86c6', behavior:'orbit' },
  hunter: { name:'Охотник шва', hp:74, speed:52, damage:13, radius:10, xp:30, threads:[8,13], color:'#c48667', behavior:'dash' },
  brute: { name:'Костяной страж', hp:118, speed:30, damage:18, radius:13, xp:45, threads:[12,18], color:'#b8aa8d', behavior:'slam' },
  leech: { name:'Соляная пиявка', hp:55, speed:40, damage:10, radius:8, xp:24, threads:[6,10], color:'#6fa09d', behavior:'shoot' },
  gardener: { name:'Садовник Девяти Корней', hp:430, speed:34, damage:16, radius:18, xp:180, threads:[70,90], color:'#9fa568', behavior:'boss-garden', boss:true, seal:'root' },
  ferryman: { name:'Паромщик Без Берега', hp:470, speed:42, damage:18, radius:18, xp:190, threads:[75,95], color:'#6f9fa0', behavior:'boss-water', boss:true, seal:'depth' },
  archivist: { name:'Архивариус Ненаписанного', hp:520, speed:38, damage:20, radius:18, xp:210, threads:[85,110], color:'#b3a48d', behavior:'boss-archive', boss:true, seal:'name' },
  weaver: { name:'Первый Шов', hp:760, speed:45, damage:22, radius:20, xp:400, threads:[180,220], color:'#d8b45b', behavior:'boss-final', boss:true, final:true }
});

export const UPGRADES = Object.freeze([
  { id:'strong-thread', name:'Тугая нить', text:'+18% урона обычных атак', apply:s=>{s.stats.attack*=1.18;} },
  { id:'deep-pocket', name:'Глубокий карман', text:'+25 максимального здоровья и полное лечение', apply:s=>{s.stats.maxHp+=25;s.stats.hp=s.stats.maxHp;} },
  { id:'quick-foot', name:'Короткий стежок', text:'Рывок восстанавливается на 20% быстрее', apply:s=>{s.stats.dashCooldown*=0.8;} },
  { id:'long-needle', name:'Длинная игла', text:'+35% урона Иглы и +20% дальности', apply:s=>{s.stats.skill*=1.35;s.stats.projectileRange*=1.2;} },
  { id:'hungry-seam', name:'Голодный шов', text:'Разрыв лечит 5% максимального здоровья', apply:s=>{s.stats.ruptureHeal+=0.05;} },
  { id:'quiet-breath', name:'Тихое дыхание', text:'Решимость восстанавливается быстрее', apply:s=>{s.stats.resolveRegen+=4;} },
  { id:'second-skin', name:'Вторая кожа', text:'Получаемый урон снижен на 12%', apply:s=>{s.stats.damageTaken*=0.88;} },
  { id:'open-wound', name:'Открытый разрыв', text:'Урон разрыва увеличен на 35%', apply:s=>{s.stats.rupture*=1.35;} },
  { id:'thread-collector', name:'Собиратель нитей', text:'+30% добываемых нитей', apply:s=>{s.stats.threadGain*=1.3;} }
]);

export const RELICS = Object.freeze({
  'split-knot': { name:'Расколотый узел', text:'После смены слоя следующий удар наносит +35% урона.' },
  'thorn-heart': { name:'Сердце терновника', text:'Каждое третье комбо выпускает веер шипов.' },
  'salt-eye': { name:'Глаз из соли', text:'Игла пробивает двух противников.' },
  'paper-moon': { name:'Бумажная луна', text:'Рывок оставляет режущий след на изнанке.' },
  'first-thread': { name:'Первая нить', text:'Разрыв на боссе возвращает всю решимость.' }
});

export function createInitialSave() {
  return {
    version: VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    playTime: 0,
    zone: 'threshold',
    layer: LAYERS.BLOOM,
    position: { ...ZONES.threshold.spawn },
    checkpoint: { zone:'threshold', position:{...ZONES.threshold.shrine} },
    quest: { stage:0, tutorialKills:0, tutorialRuptures:0, seals:[], decisions:{ garden:null, drowned:null, archive:null }, ending:null },
    stats: {
      level:1, xp:0, nextXp:70, hp:100, maxHp:100, resolve:100, maxResolve:100,
      attack:1, skill:1, rupture:1, damageTaken:1, dashCooldown:1.15, resolveRegen:7, ruptureHeal:0, projectileRange:1, threadGain:1
    },
    inventory: { threads:0, potions:2, relics:[], equipped:[] },
    upgrades: [],
    world: { bosses:{}, chests:{}, talked:{}, shrineSeen:false },
    settings: { sound:true, haptics:true, joystick:'floating' }
  };
}

function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function validateSave(raw) {
  const base = createInitialSave();
  if (!raw || typeof raw !== 'object') return base;
  const zone = ZONES[raw.zone] ? raw.zone : base.zone;
  const layer = raw.layer === LAYERS.ASH ? LAYERS.ASH : LAYERS.BLOOM;
  const stats = { ...base.stats, ...(raw.stats || {}) };
  stats.level = clamp(Math.floor(finite(stats.level,1)),1,50);
  stats.maxHp = clamp(finite(stats.maxHp,100),50,1000);
  stats.hp = clamp(finite(stats.hp,stats.maxHp),1,stats.maxHp);
  stats.maxResolve = clamp(finite(stats.maxResolve,100),50,300);
  stats.resolve = clamp(finite(stats.resolve,stats.maxResolve),0,stats.maxResolve);
  stats.nextXp = Math.max(50, finite(stats.nextXp, xpNeeded(stats.level)));
  const position = raw.position && Number.isFinite(raw.position.x) && Number.isFinite(raw.position.y)
    ? { x:clamp(raw.position.x,TILE*2,WORLD_W-TILE*2), y:clamp(raw.position.y,TILE*2,WORLD_H-TILE*2) }
    : { ...ZONES[zone].spawn };
  const quest = { ...base.quest, ...(raw.quest || {}) };
  quest.seals = [...new Set(Array.isArray(quest.seals) ? quest.seals.filter(v=>['root','depth','name'].includes(v)) : [])];
  quest.decisions = { ...base.quest.decisions, ...(quest.decisions || {}) };
  const inventory = { ...base.inventory, ...(raw.inventory || {}) };
  inventory.threads = Math.max(0, Math.floor(finite(inventory.threads,0)));
  inventory.potions = clamp(Math.floor(finite(inventory.potions,2)),0,99);
  inventory.relics = [...new Set(Array.isArray(inventory.relics) ? inventory.relics.filter(id=>RELICS[id]) : [])];
  inventory.equipped = Array.isArray(inventory.equipped) ? inventory.equipped.filter(id=>inventory.relics.includes(id)).slice(0,2) : [];
  return {
    ...base, ...raw, version:VERSION, zone, layer, position, stats, quest, inventory,
    checkpoint: raw.checkpoint && ZONES[raw.checkpoint.zone] ? raw.checkpoint : base.checkpoint,
    world: { ...base.world, ...(raw.world || {}), bosses:{...(raw.world?.bosses||{})}, chests:{...(raw.world?.chests||{})}, talked:{...(raw.world?.talked||{})} },
    settings: { ...base.settings, ...(raw.settings || {}) },
    upgrades: Array.isArray(raw.upgrades) ? raw.upgrades.filter(id=>UPGRADES.some(u=>u.id===id)) : []
  };
}

export function xpNeeded(level) { return Math.round(70 * Math.pow(level, 1.35)); }
export function addXp(save, amount) {
  save.stats.xp += Math.max(0, amount);
  let levels = 0;
  while (save.stats.xp >= save.stats.nextXp && save.stats.level < 50) {
    save.stats.xp -= save.stats.nextXp;
    save.stats.level += 1;
    save.stats.nextXp = xpNeeded(save.stats.level);
    levels += 1;
  }
  return levels;
}

export function computeHitDamage(save, kind='attack', combo=1, target=null) {
  const base = kind === 'skill' ? 24 * save.stats.skill : (15 + combo * 3) * save.stats.attack;
  let damage = base;
  if (save._shiftEmpower) damage *= 1.35;
  if (target?.boss && kind !== 'rupture') damage *= 0.72;
  return Math.max(1, Math.round(damage));
}

export function computeRuptureDamage(save, baseDamage, target=null) {
  let damage = baseDamage * 2.2 * save.stats.rupture;
  if (target?.boss) damage *= 1.15;
  return Math.round(damage);
}

export function questObjective(save) {
  const q = save.quest;
  if (q.ending) return { chapter:'ИСТОРИЯ ЗАВЕРШЕНА', text:'Финал сохранён. Можно продолжить исследование.' };
  if (q.stage === 0) return { chapter:'ПРОЛОГ', text:'Найди Миру у костра' };
  if (q.stage === 1 && !save.world.shrineSeen) return { chapter:'ПРОЛОГ', text:'Коснись Святилища Шва' };
  if (q.stage === 1 && q.tutorialKills < 3) return { chapter:'ПРОЛОГ', text:`Победи Безголосых: ${q.tutorialKills}/3` };
  if (q.stage === 1 && q.tutorialRuptures < 1) return { chapter:'ПРОЛОГ', text:'Отметь врага в одном слое и ударь в другом' };
  if (q.stage < 2) return { chapter:'ПРОЛОГ', text:'Вернись к Мире' };
  if (q.seals.length < 2) return { chapter:'ГЛАВА II', text:`Добудь Печати Корня и Глубины: ${q.seals.length}/2` };
  if (q.seals.length < 3) return { chapter:'ГЛАВА III', text:'Архив открыт. Найди Печать Имени' };
  if (!save.world.bosses.weaver) return { chapter:'ФИНАЛ', text:'Поднимись в Башню Шва' };
  return { chapter:'ФИНАЛ', text:'Реши судьбу двух миров' };
}

export function requirementMet(requirement, save) {
  if (!requirement) return true;
  if (requirement === 'tutorial') return save.quest.stage >= 2;
  if (requirement === 'two-seals') return save.quest.seals.length >= 2;
  if (requirement === 'three-seals') return save.quest.seals.length >= 3;
  return false;
}

export function isBlocked(zoneId, layer, x, y, radius=7) {
  const zone = ZONES[zoneId];
  if (!zone) return true;
  const maxX = zone.size[0] * TILE;
  const maxY = zone.size[1] * TILE;
  if (x-radius < 0 || y-radius < 0 || x+radius > maxX || y+radius > maxY) return true;
  const obstacles = zone.obstacles[layer] || [];
  return obstacles.some(r => circleRect(x,y,radius,r));
}

export function isHazard(zoneId, layer, x, y, radius=5) {
  const zone = ZONES[zoneId];
  return (zone?.hazards[layer] || []).some(r => circleRect(x,y,radius,r));
}

export function circleRect(x,y,radius,r) {
  const cx = clamp(x,r.x,r.x+r.w);
  const cy = clamp(y,r.y,r.y+r.h);
  const dx=x-cx, dy=y-cy;
  return dx*dx+dy*dy < radius*radius;
}

export function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
export function normalize(x,y) { const d=Math.hypot(x,y)||1; return {x:x/d,y:y/d}; }
export function seeded(seed) {
  let value = (seed >>> 0) || 1;
  return () => { value = Math.imul(1664525, value) + 1013904223 | 0; return (value >>> 0) / 4294967296; };
}
export function hashString(text) { let h=2166136261; for (let i=0;i<text.length;i++) { h^=text.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }

export function makeEnemy(tuple, save) {
  const [id,type,tx,ty,layer] = tuple;
  const def = ENEMY_TYPES[type];
  const bossKey = def.final ? 'weaver' : type === 'gardener' ? 'garden' : type === 'ferryman' ? 'drowned' : type === 'archivist' ? 'archive' : null;
  if (bossKey && save.world.bosses[bossKey]) return null;
  return {
    id,type,name:def.name,x:tx*TILE+8,y:ty*TILE+8,spawnX:tx*TILE+8,spawnY:ty*TILE+8,layer,
    hp:def.hp,maxHp:def.hp,speed:def.speed,damage:def.damage,radius:def.radius,xp:def.xp,color:def.color,behavior:def.behavior,boss:!!def.boss,final:!!def.final,seal:def.seal,
    vx:0,vy:0,hitFlash:0,attackCooldown:0,aiTimer:0,stun:0,markLayer:null,markUntil:0,phase:1,dead:false
  };
}

export function createZoneEnemies(zoneId, save) {
  return ZONES[zoneId].enemies.map(e=>makeEnemy(e,save)).filter(Boolean);
}

export function randomUpgradeChoices(save, count=3) {
  const available = UPGRADES.filter(u=>!save.upgrades.includes(u.id));
  const rng = seeded(hashString(`${save.createdAt}:${save.stats.level}:${save.upgrades.length}`));
  const pool = [...available];
  const out=[];
  while (pool.length && out.length<count) out.push(pool.splice(Math.floor(rng()*pool.length),1)[0]);
  return out.length ? out : UPGRADES.slice(0,count);
}

export function applyUpgrade(save, id) {
  const upgrade = UPGRADES.find(u=>u.id===id);
  if (!upgrade) return false;
  upgrade.apply(save);
  if (!save.upgrades.includes(id)) save.upgrades.push(id);
  return true;
}

export function applyChestReward(save, reward={}) {
  const gained=[];
  if (reward.threads) { save.inventory.threads += Math.round(reward.threads * save.stats.threadGain); gained.push(`${reward.threads} нитей`); }
  if (reward.potion) { save.inventory.potions += reward.potion; gained.push(`${reward.potion} настой`); }
  if (reward.relic && RELICS[reward.relic] && !save.inventory.relics.includes(reward.relic)) { save.inventory.relics.push(reward.relic); if (save.inventory.equipped.length<2) save.inventory.equipped.push(reward.relic); gained.push(RELICS[reward.relic].name); }
  return gained;
}

export function sealForBoss(type) { return ENEMY_TYPES[type]?.seal || null; }
