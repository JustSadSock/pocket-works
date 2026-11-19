export const AMMO = Object.freeze({
  stone: { label: 'Камень', power: 2, description: 'Точный удар · 2 урона' },
  fire: { label: 'Горшок', power: 1, description: 'Осколки по площади · 1 урон' },
  bolt: { label: 'Болт', power: 3, description: 'Пронзает защиту · 3 урона' }
});

export const LEVELS = Object.freeze([
  { name: 'Каменные врата', subtitle: 'Начни с ворот, затем бей в донжон', wind: [0, 1, 0, -1, 1, 0], ammo: { stone: 3, fire: 1, bolt: 1 }, gate: 3, keep: 5, towers: 2, walls: 2 },
  { name: 'Двойной бастион', subtitle: 'Пламя заденет несколько укреплений', wind: [1, -1, 2, 0, -2, 1, 0], ammo: { stone: 4, fire: 2, bolt: 1 }, gate: 4, keep: 6, towers: 3, walls: 3 },
  { name: 'Последняя цитадель', subtitle: 'Ветер меняется после каждого выстрела', wind: [-2, 2, -1, 2, 1, -2, 0, 1, -1], ammo: { stone: 5, fire: 2, bolt: 2 }, gate: 5, keep: 8, towers: 4, walls: 3 }
]);

const STRUCTURES = [
  { id: 'keep', kind: 'keep', x: 0, y: -174, radius: 73, width: 176, height: 132, z: 0 },
  { id: 'wall-left', kind: 'wall', x: -136, y: -48, radius: 69, width: 151, height: 77, z: 1 },
  { id: 'wall-right', kind: 'wall', x: 136, y: -48, radius: 69, width: 151, height: 77, z: 1 },
  { id: 'gate', kind: 'gate', x: 0, y: -30, radius: 78, width: 142, height: 90, z: 2 },
  { id: 'tower-left', kind: 'tower', x: -254, y: -98, radius: 66, width: 116, height: 162, z: 3 },
  { id: 'tower-right', kind: 'tower', x: 254, y: -98, radius: 66, width: 116, height: 162, z: 3 }
];

export function createLevel(index = 0) {
  const i = Math.max(0, Math.min(LEVELS.length - 1, Math.floor(index)));
  const level = LEVELS[i];
  return {
    level: i,
    turn: 0,
    ammo: { ...level.ammo },
    structures: STRUCTURES.map(s => ({ ...s, maxHp: s.kind === 'gate' ? level.gate : s.kind === 'keep' ? level.keep : s.kind === 'tower' ? level.towers : level.walls, hp: s.kind === 'gate' ? level.gate : s.kind === 'keep' ? level.keep : s.kind === 'tower' ? level.towers : level.walls })),
    phase: 'playing'
  };
}

export const shotsLeft = state => Object.values(state.ammo).reduce((n, value) => n + Math.max(0, value), 0);
export const currentWind = state => LEVELS[state.level].wind[state.turn % LEVELS[state.level].wind.length];
export const findStructure = (state, id) => state.structures.find(s => s.id === id);
export function validState(input) {
  if (!input || !Number.isInteger(input.level) || input.level < 0 || input.level >= LEVELS.length || !Number.isInteger(input.turn) || input.turn < 0 || input.turn > 50) return false;
  if (!['playing', 'won', 'lost'].includes(input.phase)) return false;
  const base = createLevel(input.level);
  if (!input.ammo || !Object.keys(AMMO).every(k => Number.isInteger(input.ammo[k]) && input.ammo[k] >= 0 && input.ammo[k] <= LEVELS[input.level].ammo[k])) return false;
  if (!Array.isArray(input.structures) || input.structures.length !== base.structures.length) return false;
  return input.structures.every((s, i) => s && s.id === base.structures[i].id && Number.isInteger(s.hp) && s.hp >= 0 && s.hp <= base.structures[i].maxHp);
}

const distance = (a, x, y) => Math.hypot(a.x - x, a.y - y);
const gateProtects = (state, target, type) => target.kind === 'keep' && findStructure(state, 'gate').hp > 0 && type !== 'bolt';

export function resolveShot(state, type, aimX, aimY) {
  if (state.phase !== 'playing' || !AMMO[type] || state.ammo[type] <= 0) return { ok: false, reason: 'Недоступный боеприпас' };
  if (!Number.isFinite(aimX) || !Number.isFinite(aimY)) return { ok: false, reason: 'Неверные координаты' };
  const impactX = Math.max(-370, Math.min(370, aimX + currentWind(state) * 24));
  const impactY = Math.max(-300, Math.min(75, aimY));
  const next = {
    ...state,
    ammo: { ...state.ammo, [type]: state.ammo[type] - 1 },
    turn: state.turn + 1,
    structures: state.structures.map(s => ({ ...s }))
  };
  const alive = next.structures.filter(s => s.hp > 0).sort((a, b) => distance(a, impactX, impactY) - distance(b, impactX, impactY));
  const hits = [];
  let shielded = false;
  if (type === 'fire') {
    for (const target of alive) {
      if (distance(target, impactX, impactY) > target.radius + 54) continue;
      if (gateProtects(next, target, type)) { shielded = true; continue; }
      target.hp = Math.max(0, target.hp - 1);
      hits.push({ id: target.id, damage: 1, destroyed: target.hp === 0 });
    }
  } else {
    const target = alive.find(s => distance(s, impactX, impactY) <= s.radius);
    if (target) {
      if (gateProtects(next, target, type)) shielded = true;
      else {
        const damage = Math.min(target.hp, AMMO[type].power);
        target.hp -= damage;
        hits.push({ id: target.id, damage, destroyed: target.hp === 0 });
      }
    }
  }
  if (findStructure(next, 'keep').hp === 0) next.phase = 'won';
  else if (!shotsLeft(next)) next.phase = 'lost';
  return { ok: true, state: next, x: impactX, y: impactY, hits, shielded, missed: hits.length === 0 && !shielded };
}