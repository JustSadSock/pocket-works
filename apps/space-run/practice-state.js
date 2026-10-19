// The offline snapshot is user-controlled localStorage, not a trusted engine state.
// Reject malformed/obsolete saves before they reach context(saved).
export const PRACTICE_KEY = 'pocket-works:space-run:practice';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const list = (value, max) => Array.isArray(value) && value.length <= max;

export function isPracticeState(value) {
  if (!value || typeof value !== 'object' || !value.room || !value.snapshot) return false;
  const {room, snapshot} = value;
  if (typeof room.code !== 'string' || !/^[A-Z0-9]{1,8}$/.test(room.code)) return false;
  if (!['build','shop','combat'].includes(room.phase) || !finite(room.phaseTime)) return false;
  if (!Number.isInteger(room.wave) || room.wave < 0 || room.wave > 100000) return false;
  if (!finite(value.lastTick) || !room.physics || !['x','y','vx','vy','a','av'].every(k=>finite(room.physics[k]))) return false;
  if (!list(room.players,8) || room.players.length < 1 || !room.players.every(
    pair=>Array.isArray(pair) && pair.length===2 && typeof pair[0]==='string' &&
      pair[1] && pair[1].id===pair[0] && typeof pair[1].name==='string'
  )) return false;
  const ship = room.ship;
  if (!ship || !list(ship.cells,5000) || !ship.cells.length ||
      !ship.cells.every(cell=>typeof cell==='string' && /^-?\d+,-?\d+$/.test(cell))) return false;
  if (!list(ship.modules,250) || !list(ship.inventoryModules,500) ||
      !list(ship.inventoryShapes,500) || !Number.isInteger(ship.nextId)) return false;
  if (!['credits','hull','hullMax','energy','energyMax'].every(k=>finite(ship[k]))) return false;
  if (!ship.modules.every(m=>m && typeof m.id==='string' && typeof m.templateId==='string' &&
    finite(m.x) && finite(m.y) && finite(m.hp) && finite(m.maxHp) && finite(m.rotation))) return false;
  if (!list(room.enemies,1000) || !list(room.projectiles,3000) ||
      !list(room.drops,1000) || !list(room.shields,200) ||
      !list(room.offers,100) || !list(room.events,1000)) return false;
  if (!snapshot.ship || !list(snapshot.ship.modules,250) ||
      !list(snapshot.ship.cells,5000) || !list(snapshot.players,8) ||
      !snapshot.physics || !finite(snapshot.physics.x) || !finite(snapshot.physics.y)) return false;
  return true;
}

export function loadPractice(storage) {
  try {
    const raw = storage.getItem(PRACTICE_KEY);
    if (!raw || raw.length > 5_000_000) return null;
    const parsed = JSON.parse(raw);
    return isPracticeState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePractice(storage, state) {
  if (!isPracticeState(state)) return false;
  try {
    storage.setItem(PRACTICE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
