export const STORY = [
  { id: 'arrival', chapter: 'I · ТИШИНА', objective: 'Доберись до Рыночного резонатора' },
  { id: 'market', chapter: 'I · ТИШИНА', objective: 'Настрой три кольца Рыночного резонатора' },
  { id: 'foundry', chapter: 'II · ЖАР', objective: 'Пройди в Литейную и запусти давление' },
  { id: 'archive', chapter: 'II · ЖАР', objective: 'Найди архивиста Ивена у подъёмника' },
  { id: 'chase', chapter: 'III · ОХОТА', objective: 'Уйди от Смотрителя через крыши' },
  { id: 'tower', chapter: 'III · ОХОТА', objective: 'Восстанови башенный резонатор' },
  { id: 'ascent', chapter: 'IV · ПОСЛЕДНИЙ УДАР', objective: 'Поднимись к Великому Колоколу' },
  { id: 'finale', chapter: 'IV · ПОСЛЕДНИЙ УДАР', objective: 'Реши судьбу Беллфорджа' },
  { id: 'complete', chapter: 'ЭПИЛОГ', objective: 'История завершена' }
];

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
export function damp(current, target, lambda, dt) { return current + (target - current) * (1 - Math.exp(-lambda * dt)); }
export function stageIndex(id) { const index = STORY.findIndex((stage) => stage.id === id); return index < 0 ? 0 : index; }
export function stageFor(run) { return STORY[stageIndex(run.stage)]; }
export function normalizeRing(values) {
  return Array.from({ length: 3 }, (_, index) => {
    const value = Number(values?.[index]);
    return Number.isFinite(value) ? ((Math.trunc(value) % 8) + 8) % 8 : 0;
  });
}
export function createRun(raw = {}) {
  const stage = STORY.some((entry) => entry.id === raw.stage) ? raw.stage : 'arrival';
  return {
    stage,
    marketAligned: normalizeRing(raw.marketAligned),
    pressure: Number.isFinite(Number(raw.pressure)) ? clamp(Number(raw.pressure), 0, 1) : 0,
    towerAligned: normalizeRing(raw.towerAligned),
    choice: raw.choice === 'ring' || raw.choice === 'silence' ? raw.choice : null,
    completedRuns: Number.isFinite(Number(raw.completedRuns)) ? Math.max(0, Math.trunc(Number(raw.completedRuns))) : 0
  };
}
export function ringSolved(values, target = [2,5,1]) {
  const normalized = normalizeRing(values);
  return normalized.every((value, i) => value === normalizeRing(target)[i]);
}
export function applyStoryEvent(run, event) {
  const next = { ...run }, index = stageIndex(run.stage);
  const expected = {
    arrival:'reach-market', market:'market-solved', foundry:'foundry-pressurized', archive:'archive-met',
    chase:'chase-escaped', tower:'tower-solved', ascent:'reach-bell', finale:'final-choice'
  }[run.stage];
  if (event === expected && index < STORY.length - 1) next.stage = STORY[index + 1].id;
  if (event === 'final-choice' && run.stage === 'finale') {
    next.stage = 'complete';
    next.completedRuns = (next.completedRuns || 0) + 1;
  }
  return next;
}
export function nearestInteractable(position, items, maxDistance = 3.1) {
  let best = null, bestDistance = maxDistance;
  for (const item of items) {
    if (item.enabled === false) continue;
    const dx = position.x - item.position.x, dy = position.y - item.position.y, dz = position.z - item.position.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < bestDistance) { best = item; bestDistance = distance; }
  }
  return best ? { item: best, distance: bestDistance } : null;
}
export function qualityProfile(hardwareConcurrency = 4, minDimension = 390) {
  // CSS viewport size matters more than reported core count on phones. A modern
  // phone can expose 8+ logical cores while still having a much tighter thermal
  // and draw-call budget than a tablet/desktop. Keep full geometry/materials,
  // but reserve the expensive shadow/particle tiers for physically larger screens.
  if (hardwareConcurrency >= 8 && minDimension >= 700) return { tier:'high', scale:1.15, shadows:1024, particles:1 };
  if (hardwareConcurrency >= 6 && minDimension >= 520) return { tier:'medium', scale:1.45, shadows:768, particles:.7 };
  return { tier:'low', scale:1.8, shadows:512, particles:.42 };
}
