// v0.2 deterministic PRNG; no Math.random or ambient time in simulation.
export function normalizeSeed(seed) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Seed must be an unsigned 32-bit integer');
  return seed >>> 0;
}
export function randomInt(world, limit) {
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 0xffffffff) throw new RangeError('Invalid random limit');
  let x = world.rngState >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  world.rngState = x >>> 0;
  return world.rngState % limit;
}
export function initialRngState(seed) {
  const s = normalizeSeed(seed);
  return s === 0 ? 0x6d2b79f5 : s;
}
