export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function hashString(value) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(value).length; i += 1) {
    h ^= String(value).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  return h >>> 0;
}

export function makeRng(seed) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const choice = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

const DIRECTIONS = [
  { dx: 1, dz: 0, dir: 'e', opposite: 'w' },
  { dx: -1, dz: 0, dir: 'w', opposite: 'e' },
  { dx: 0, dz: 1, dir: 's', opposite: 'n' },
  { dx: 0, dz: -1, dir: 'n', opposite: 's' }
];

function key(x, z) { return `${x},${z}`; }

export function generateDungeon(seed, floor = 1) {
  const rng = makeRng((Number(seed) ^ Math.imul(floor, 0x45d9f3b)) >>> 0);
  const rooms = [];
  const occupied = new Map();
  const addRoom = (gx, gz, role = 'room') => {
    const room = {
      id: rooms.length,
      gx, gz, role,
      sizeX: 11.8 + Math.floor(rng() * 3) * 0.55,
      sizeZ: 11.8 + Math.floor(rng() * 3) * 0.55,
      links: { n: null, e: null, s: null, w: null },
      danger: 0,
      monsterSeeds: [],
      visited: false,
      cleared: false,
      opened: false,
      shrineUsed: false
    };
    rooms.push(room);
    occupied.set(key(gx, gz), room);
    return room;
  };
  const connect = (a, b, direction) => {
    a.links[direction.dir] = b.id;
    b.links[direction.opposite] = a.id;
  };

  const start = addRoom(0, 0, 'start');
  let cursor = start;
  const mainLength = clamp(6 + Math.floor(floor * 0.7), 6, 12);
  for (let i = 1; i < mainLength; i += 1) {
    const options = DIRECTIONS
      .map((direction) => ({ direction, x: cursor.gx + direction.dx, z: cursor.gz + direction.dz }))
      .filter((candidate) => !occupied.has(key(candidate.x, candidate.z)));
    let pick = options[Math.floor(rng() * options.length)];
    if (!pick) {
      const anchors = rooms.slice().reverse();
      for (const anchor of anchors) {
        const alt = DIRECTIONS
          .map((direction) => ({ direction, x: anchor.gx + direction.dx, z: anchor.gz + direction.dz, anchor }))
          .filter((candidate) => !occupied.has(key(candidate.x, candidate.z)));
        if (alt.length) { pick = alt[Math.floor(rng() * alt.length)]; cursor = pick.anchor; break; }
      }
    }
    if (!pick) break;
    const room = addRoom(pick.x, pick.z, i === mainLength - 1 ? 'gate' : 'room');
    connect(cursor, room, pick.direction);
    cursor = room;
  }
  if (cursor.role !== 'gate') cursor.role = 'gate';
  const gate = cursor;

  const branches = clamp(2 + Math.floor(floor / 2), 2, 7);
  for (let i = 0; i < branches; i += 1) {
    const anchors = rooms.filter((room) => room.role !== 'gate');
    const anchor = choice(rng, anchors);
    const options = DIRECTIONS
      .map((direction) => ({ direction, x: anchor.gx + direction.dx, z: anchor.gz + direction.dz }))
      .filter((candidate) => !occupied.has(key(candidate.x, candidate.z)));
    if (!options.length) continue;
    const pick = choice(rng, options);
    const roleRoll = rng();
    const role = roleRoll < 0.33 ? 'chest' : roleRoll < 0.58 ? 'shrine' : 'room';
    const room = addRoom(pick.x, pick.z, role);
    connect(anchor, room, pick.direction);
  }

  let totalMonsters = 0;
  for (const room of rooms) {
    if (room.role === 'start') continue;
    const base = room.role === 'gate' ? 3 : room.role === 'chest' ? 2 : 1;
    const count = clamp(base + Math.floor(rng() * (2 + Math.min(3, Math.floor(floor / 2)))), 1, 6);
    room.danger = clamp(0.7 + floor * 0.1 + rng() * 0.65 + (room.role === 'gate' ? 0.35 : 0), 0.7, 3);
    for (let m = 0; m < count; m += 1) room.monsterSeeds.push(Math.floor(rng() * 0xffffffff) >>> 0);
    totalMonsters += count;
  }

  return {
    seed: Number(seed) >>> 0,
    floor,
    rooms,
    startId: start.id,
    gateId: gate.id,
    requiredKills: Math.max(3, Math.ceil(totalMonsters * 0.62)),
    totalMonsters,
    spacing: 12.15
  };
}

const BODY_TYPES = ['crawler', 'brute', 'orb', 'bishop', 'serpent'];
const ABILITIES = ['spit', 'blink', 'rush', 'split', 'leech', 'burst'];
const PREFIXES = ['Wet', 'Velvet', 'Illegal', 'Choir', 'Sideways', 'Taxable', 'Mild', 'Invisible', 'Monday', 'Fermented', 'Polite', 'Inverse'];
const NOUNS = ['Maw', 'Clerk', 'Angel', 'Slug', 'Bishop', 'Chair', 'Witness', 'Moth', 'Accountant', 'Crumb', 'Oracle', 'Intern'];

export function createMonsterGenome(seed, floor = 1, danger = 1, inherited = null) {
  const rng = makeRng((Number(seed) ^ Math.imul(floor + 11, 0x27d4eb2d)) >>> 0);
  const body = inherited?.body || choice(rng, BODY_TYPES);
  const ability = inherited?.ability || choice(rng, ABILITIES);
  const hue = inherited ? (inherited.hue + (rng() * 36 - 18) + 360) % 360 : Math.floor(rng() * 360);
  const size = clamp((inherited?.size || 1) * (0.78 + rng() * 0.52), 0.55, 1.65);
  const threat = clamp(danger * (0.84 + rng() * 0.38), 0.55, 4);
  const elite = rng() < Math.min(0.08 + floor * 0.012, 0.24);
  return {
    seed: Number(seed) >>> 0,
    body,
    ability,
    hue,
    accentHue: (hue + 90 + Math.floor(rng() * 190)) % 360,
    size: elite ? size * 1.14 : size,
    eyes: clamp(1 + Math.floor(rng() * 5), 1, 5),
    horns: Math.floor(rng() * 5),
    limbs: body === 'orb' ? 0 : [2, 4, 6][Math.floor(rng() * 3)],
    wobble: 0.35 + rng() * 1.45,
    phase: rng() * Math.PI * 2,
    elite,
    maxHp: Math.round((18 + floor * 5.2) * threat * (elite ? 1.8 : 1) * (0.8 + size * 0.3)),
    speed: clamp((2.0 + rng() * 1.7 + floor * 0.045) / Math.sqrt(size), 1.35, 5.2),
    damage: Math.round((5 + floor * 1.3) * threat * (elite ? 1.3 : 1)),
    cooldown: clamp(1.15 + rng() * 1.8 - floor * 0.025, 0.62, 3.2),
    name: `${elite ? 'EXALTED ' : ''}${choice(rng, PREFIXES)} ${choice(rng, NOUNS)}`
  };
}

export const RELICS = [
  { id: 'tax-boots', name: 'Boots of Tax Evasion', copy: '+12% movement speed. Authorities hate this.', stat: 'speed', amount: 0.12 },
  { id: 'unstable-spoon', name: 'Unstable Spoon', copy: '+18% weapon damage. It bends you back.', stat: 'damage', amount: 0.18 },
  { id: 'pocket-spine', name: 'Pocket Spine', copy: '+18 max HP and an upsetting sense of posture.', stat: 'maxHp', amount: 18 },
  { id: 'wet-key', name: 'Wet Key', copy: '+8% critical chance. It opens nothing obvious.', stat: 'crit', amount: 0.08 },
  { id: 'necromancy-diploma', name: 'Questionable Necromancy Diploma', copy: 'Kills restore 1.5 HP. Accreditation pending.', stat: 'lifesteal', amount: 1.5 },
  { id: 'moon-receipt', name: 'Receipt for One Moon', copy: '-18% dash cooldown. Non-refundable.', stat: 'dash', amount: 0.18 }
];

export const POTIONS = [
  { id: 'prophecy-mouthwash', name: 'Mouthwash of Prophecy', copy: 'Heal 28. See six seconds slightly too far sideways.', effect: 'heal-warp' },
  { id: 'liquid-tuesday', name: 'Liquid Tuesday', copy: 'Enemies move 40% slower for seven seconds.', effect: 'slow' },
  { id: 'bottle-maybe', name: 'Bottle of Maybe', copy: 'Could heal. Could hurt. Could improve your career.', effect: 'maybe' },
  { id: 'gravity-yogurt', name: 'Anti-Gravity Yogurt', copy: 'Speed surges and dash cooldown collapses for eight seconds.', effect: 'speed' },
  { id: 'screaming-tea', name: 'Screaming Tea', copy: 'Double damage for six seconds. The tea knows.', effect: 'rage' }
];

export function rollLoot(seed, floor = 1, forced = null) {
  const rng = makeRng((Number(seed) ^ Math.imul(floor + 3, 0x9e3779b1)) >>> 0);
  const type = forced || (rng() < 0.42 ? 'relic' : 'potion');
  if (type === 'relic') return { type, item: RELICS[Math.floor(rng() * RELICS.length)] };
  return { type: 'potion', item: POTIONS[Math.floor(rng() * POTIONS.length)] };
}

export function roomByPoint(dungeon, x, z) {
  const spacing = dungeon.spacing;
  let nearest = null;
  let best = Infinity;
  for (const room of dungeon.rooms) {
    const rx = room.gx * spacing, rz = room.gz * spacing;
    const dx = Math.abs(x - rx), dz = Math.abs(z - rz);
    if (dx <= room.sizeX * 0.55 && dz <= room.sizeZ * 0.55) {
      const distance = dx + dz;
      if (distance < best) { best = distance; nearest = room; }
    }
  }
  return nearest;
}
