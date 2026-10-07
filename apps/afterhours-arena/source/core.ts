// Combat is independent of sprite art so the cast can be replaced later.
export type FighterId = 'rook' | 'vesper';
export type Move = 'punch' | 'kick' | 'special';
export type Mode = 'menu' | 'intro' | 'fight' | 'paused' | 'round' | 'result';
export interface Input { left: boolean; right: boolean; jump: boolean; block: boolean; punch: boolean; kick: boolean; special: boolean }
export const blankInput = (): Input => ({ left: false, right: false, jump: false, block: false, punch: false, kick: false, special: false });
export const CAST = {
  rook: { name: 'ROOK', subtitle: 'Кулаки порта', color: '#ef854d', special: 'Портовая волна', speed: 92 },
  vesper: { name: 'VESPER', subtitle: 'Тихая буря', color: '#87cbbb', special: 'Нефритовый импульс', speed: 108 }
};
export const MOVES = {
  punch: { startup: .09, active: .09, recovery: .18, damage: 8, reach: 37, stun: .23, push: 17 },
  kick: { startup: .18, active: .10, recovery: .30, damage: 13, reach: 54, stun: .32, push: 27 },
  special: { startup: .28, active: .08, recovery: .42, damage: 20, reach: 0, stun: .42, push: 38 }
};
export interface Fighter {
  id: FighterId; x: number; y: number; vy: number; facing: number; hp: number; energy: number;
  wins: number; move: Move | null; elapsed: number; connected: boolean; stun: number;
  blocking: boolean; walking: boolean; combo: number; comboAge: number; jumpHeld: boolean;
}
export interface Shot { owner: number; x: number; y: number; dir: number; age: number }
export interface CombatEvent { type: 'hit' | 'block' | 'attack' | 'jump' | 'land' | 'special' | 'round'; x: number; y: number; fighter: number; heavy?: boolean }
export interface Match {
  mode: Mode; resumeMode: 'fight' | 'intro'; fighters: [Fighter, Fighter]; time: number; intro: number;
  round: number; winner: number | null; roundWinner: number | null; shots: Shot[];
  events: CombatEvent[]; hitstop: number; age: number; aiClock: number; aiInput: Input; seed: number;
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function fighter(id: FighterId, x: number, facing: number): Fighter {
  return { id, x, y: 0, vy: 0, facing, hp: 100, energy: 60, wins: 0, move: null, elapsed: 0, connected: false, stun: 0, blocking: false, walking: false, combo: 0, comboAge: 0, jumpHeld: false };
}
export function createMatch(id: FighterId = 'rook', menu = false): Match {
  return { mode: menu ? 'menu' : 'intro', resumeMode: 'fight', fighters: [fighter(id, 157, 1), fighter(id === 'rook' ? 'vesper' : 'rook', 323, -1)], time: 60, intro: 1.65, round: 1, winner: null, roundWinner: null, shots: [], events: [], hitstop: 0, age: 0, aiClock: .65, aiInput: blankInput(), seed: 1729 };
}
export function nextRound(s: Match) {
  const wins = s.fighters.map(f => f.wins);
  s.fighters = [fighter(s.fighters[0].id, 157, 1), fighter(s.fighters[1].id, 323, -1)];
  s.fighters.forEach((f, i) => f.wins = wins[i]);
  s.round++; s.time = 60; s.intro = 1.65; s.mode = 'intro'; s.shots = []; s.hitstop = 0;
  s.roundWinner = null; s.aiClock = .65; s.aiInput = blankInput();
}
function random(s: Match) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
function ai(s: Match, dt: number): Input {
  s.aiClock -= dt;
  if (s.aiClock <= 0) {
    const a = s.fighters[1], p = s.fighters[0], distance = Math.abs(a.x - p.x), r = random(s);
    const input = blankInput();
    if ((p.move && distance < 90 && r < .60) || (s.shots.length && r < .48)) input.block = true;
    else if (distance > 48) { input.left = a.x > p.x; input.right = a.x < p.x; if (a.energy >= 60 && distance > 90 && r < .22) input.special = true; }
    else if (r < .20) { input.left = a.x < p.x; input.right = a.x > p.x; }
    else if (r < .52) input.punch = true;
    else if (r < .91) input.kick = true;
    else input.jump = true;
    s.aiInput = input; s.aiClock = .18 + random(s) * .27;
  }
  return s.aiInput;
}
function event(s: Match, type: CombatEvent['type'], i: number, heavy = false) {
  const f = s.fighters[i]; s.events.push({ type, fighter: i, x: f.x, y: 210 - f.y - 28, heavy });
}
function hit(s: Match, i: number, move: Move, direction = s.fighters[i].facing) {
  const a = s.fighters[i], b = s.fighters[1 - i], spec = MOVES[move];
  const blocked = b.blocking && b.y === 0 && b.facing === -direction;
  b.hp = Math.max(0, b.hp - (blocked ? (move === 'special' ? 3 : 0) : spec.damage));
  b.stun = blocked ? .11 : spec.stun; b.x = clamp(b.x + direction * (blocked ? 6 : spec.push), 30, 450);
  b.energy = clamp(b.energy + (blocked ? 7 : 10), 0, 100);
  a.energy = clamp(a.energy + (move === 'special' ? 0 : blocked ? 4 : 12), 0, 100);
  if (!blocked) { b.move = null; b.blocking = false; a.combo = a.comboAge < 1.1 ? a.combo + 1 : 1; a.comboAge = 0; }
  s.hitstop = blocked ? .025 : move === 'punch' ? .045 : .07;
  s.events.push({ type: blocked ? 'block' : 'hit', fighter: 1 - i, x: b.x, y: 210 - b.y - 31, heavy: move !== 'punch' });
}
function finishRound(s: Match) {
  const [a, b] = s.fighters;
  s.roundWinner = a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1;
  if (s.roundWinner !== null) s.fighters[s.roundWinner].wins++;
  s.winner = a.wins >= 2 ? 0 : b.wins >= 2 ? 1 : null;
  s.mode = s.winner === null ? 'round' : 'result'; s.shots = []; event(s, 'round', s.roundWinner ?? 0);
}
export function stepMatch(s: Match, input: Input, dt: number, opponent?: Input) {
  dt = clamp(dt, 0, 1 / 30); s.events = [];
  if (s.mode === 'paused' || s.mode === 'round' || s.mode === 'result') return;
  s.age += dt;
  if (s.mode === 'menu') return;
  if (s.mode === 'intro') { s.intro -= dt; if (s.intro <= 0) s.mode = 'fight'; return; }
  if (s.hitstop > 0) { s.hitstop -= dt; return; }
  s.time = Math.max(0, s.time - dt);
  const inputs = [input, opponent ?? ai(s, dt)];
  s.fighters.forEach((f, i) => {
    const control = inputs[i], other = s.fighters[1 - i];
    f.stun = Math.max(0, f.stun - dt); f.comboAge += dt;
    if (!f.move) f.facing = other.x >= f.x ? 1 : -1;
    f.blocking = control.block && f.y === 0 && !f.move && f.stun === 0;
    f.walking = false;
    if (f.y > 0 || f.vy !== 0) { f.vy -= 550 * dt; f.y = Math.max(0, f.y + f.vy * dt); if (f.y === 0) { f.vy = 0; event(s, 'land', i); } }
    if (!f.move && f.stun === 0 && !f.blocking) {
      const direction = Number(control.right) - Number(control.left);
      f.x = clamp(f.x + direction * CAST[f.id].speed * dt, 30, 450); f.walking = direction !== 0;
      if (control.jump && !f.jumpHeld && f.y === 0) { f.vy = 225; f.y = 1; event(s, 'jump', i); }
      const move: Move | null = control.special && f.energy >= 60 && f.y === 0 ? 'special' : control.kick ? 'kick' : control.punch ? 'punch' : null;
      if (move) { f.move = move; f.elapsed = 0; f.connected = false; if (move === 'special') f.energy -= 60; event(s, 'attack', i, move !== 'punch'); }
    }
    f.jumpHeld = control.jump;
    if (f.move) {
      const move = f.move, spec = MOVES[move]; f.elapsed += dt;
      if (f.elapsed >= spec.startup && !f.connected) {
        if (move === 'special') { s.shots.push({ owner: i, x: f.x + f.facing * 28, y: 24, dir: f.facing, age: 0 }); f.connected = true; event(s, 'special', i, true); }
        else if (f.elapsed <= spec.startup + spec.active && Math.abs(f.x - other.x) <= spec.reach && Math.abs(f.y - other.y) < 32 && Math.sign(other.x - f.x) === f.facing) { f.connected = true; hit(s, i, move); }
      }
      if (f.elapsed >= spec.startup + spec.active + spec.recovery) f.move = null;
    }
  });
  const [a, b] = s.fighters;
  if (Math.abs(a.y - b.y) < 32 && Math.abs(a.x - b.x) < 25) {
    const side = a.x <= b.x ? -1 : 1, mid = clamp((a.x + b.x) / 2, 43, 437);
    a.x = mid + side * 12.5; b.x = mid - side * 12.5;
  }
  s.shots = s.shots.filter(shot => {
    shot.age += dt; shot.x += shot.dir * (s.fighters[shot.owner].id === 'vesper' ? 200 : 155) * dt;
    const target = s.fighters[1 - shot.owner];
    if (Math.abs(shot.x - target.x) < 19 && Math.abs(target.y - shot.y) < 32) { hit(s, shot.owner, 'special', shot.dir); return false; }
    return shot.x > 0 && shot.x < 480 && shot.age < 3;
  });
  if (a.hp <= 0 || b.hp <= 0 || s.time <= 0) finishRound(s);
}

