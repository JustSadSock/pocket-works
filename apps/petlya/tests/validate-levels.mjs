import assert from 'node:assert/strict';
import { LEVELS, MOVES, parseLevel, isEchoOnlyPlate } from '../levels.js';

const SOLUTIONS = {
  '01': ['RR'],
  '02': ['R', 'RRRR'],
  '03': ['R', 'RRR', 'RRRR'],
  '04': ['R', 'RRRRR'],
  '05': ['UR', 'DRRU'],
  '06': ['R', 'RRR', 'RRRRRR'],
  '07': ['DD', 'RRRRR'],
  '08': ['RRD', 'DRRRR', 'RRRRRRR'],
  '09': ['RRD', 'RRWRRR', 'DDRRWWRRR'],
  '10': ['UURR', 'RRRRRUU', 'RRRRWWW'],
  '11': ['RRRR', 'RRWW'],
  '12': ['RRD', 'RRWRRR', 'RRWRRRRRR', 'RRWRRRRRRR'],
  '13': ['R', 'RRR'],
  '14': ['R', 'RRRRR'],
  '15': ['R', 'RRR', 'RRRRR'],
  '16': ['RRD', 'RRWRRR', 'RRWRRRR'],
  '17': ['UU', 'UURRR', 'UURRRRRR', 'RRRRRWWW'],
  '18': ['RRD', 'RRWRRR', 'RRWRRRRRR', 'RRWRRRRRRR']
};

function same(a, b) { return a.x === b.x && a.y === b.y; }
function tileAt(level, position) { return level.map[position.y]?.[position.x] || '#'; }
function active(level, positions, key) {
  return (level.plates.get(key) || []).some((plate) => positions.some((actor) => same(actor.position, plate) && (!isEchoOnlyPlate(key) || actor.echo)));
}
function simulate(level, echoes, route) {
  const actors = [
    ...echoes.map((moves) => ({ echo: true, moves, position: { ...level.start } })),
    { echo: false, moves: route, position: { ...level.start } }
  ];
  let success = false;
  for (let step = 0; step < route.length; step += 1) {
    const gateState = new Map([...level.gates.keys()].map((key) => [key, active(level, actors, key)]));
    for (const actor of actors) {
      const code = actor.moves[step] || 'W';
      const move = MOVES[code];
      assert(move, `Unknown move ${code}`);
      const next = { x: actor.position.x + move.dx, y: actor.position.y + move.dy };
      const tile = tileAt(level, next);
      const blocked = tile === '#' || (/[ABCUVW]/.test(tile) && !gateState.get(tile.toLowerCase()));
      if (!blocked) actor.position = next;
    }
    const required = level.required.every((key) => active(level, actors, key));
    const current = actors.at(-1);
    if (same(current.position, level.exit) && required) { success = true; break; }
  }
  return success;
}

for (const raw of LEVELS) {
  const level = parseLevel(raw);
  assert.equal(level.map.filter((row) => row.includes('@')).length, 1, `${level.id}: one start row`);
  assert.equal(level.map.filter((row) => row.includes('E')).length, 1, `${level.id}: one exit row`);
  assert(level.loop >= 4 && level.loop <= 12, `${level.id}: loop bounds`);
  assert(level.par <= level.maxEchoes, `${level.id}: par <= maxEchoes`);
  for (const [key] of level.gates) assert(level.plates.has(key), `${level.id}: gate ${key} needs plate`);
  for (const key of level.required) assert(level.plates.has(key), `${level.id}: required ${key} needs plate`);

  const routes = SOLUTIONS[level.id];
  assert(routes, `${level.id}: missing solution`);
  const echoes = [];
  let solved = false;
  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    assert(route.length <= level.loop, `${level.id}: route ${i} exceeds loop`);
    solved = simulate(level, echoes, route);
    if (solved) break;
    echoes.push(route);
    assert(echoes.length <= level.maxEchoes, `${level.id}: exceeds echo cap`);
  }
  assert(solved, `${level.id}: supplied solution does not solve`);
}

console.log(`Validated ${LEVELS.length} PETLYA levels.`);
