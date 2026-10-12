// СТАПЕЛЬ: 2D planar Mars flight dynamics, SI units.
export const WORLD = Object.freeze({
  radius: 3389500,
  mu: 4.282837e13,
  omega: 2 * Math.PI / 88642.66,
  rho0: 0.020,
  scaleHeight: 11100,
  g0: 9.80665
});
export const TANK = Object.freeze({ propellant: 900, dry: 145, cost: 3.5 });
export const ENGINES = Object.freeze({
  lift: { name: 'АТ-48', role: 'Стартовый', thrust: 48000, mass: 740, ispVac: 334, ispSea: 318, cost: 12 },
  mid:  { name: 'М-24', role: 'Универсальный', thrust: 24000, mass: 385, ispVac: 350, ispSea: 330, cost: 11 },
  vac:  { name: 'ВК-70', role: 'Вакуумный', thrust: 70000, mass: 300, ispVac: 370, ispSea: 295, cost: 10 }
});
export const MISSIONS = Object.freeze([
  { name: 'Первый сигнал', payload: 200, min: 110000, max: 260000, target: 155000, budget: 53, reward: 'Сигнал с орбиты' },
  { name: 'Ретранслятор', payload: 650, min: 140000, max: 330000, target: 195000, budget: 60, reward: 'Связь с колонией' },
  { name: 'Тяжёлый зонд', payload: 1100, min: 170000, max: 410000, target: 245000, budget: 69, reward: 'Тяжёлый вывод' }
]);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const defaultCraft = () => [
  { tanks: 3, engine: 'lift', fins: true },
  { tanks: 2, engine: 'vac', fins: false }
];
export const isValidCraft = (craft) => Array.isArray(craft) && craft.length >= 1 && craft.length <= 3 &&
  craft.every(s => Number.isInteger(s.tanks) && s.tanks >= 1 && s.tanks <= 6 &&
    Object.hasOwn(ENGINES, s.engine) && typeof s.fins === 'boolean');
export const stageDryMass = (stage, separable) =>
  stage.tanks * TANK.dry + ENGINES[stage.engine].mass + (stage.fins ? 65 : 0) + (separable ? 90 : 0);
export const stageWetMass = (stage, separable) => stageDryMass(stage, separable) + stage.tanks * TANK.propellant;
export function totalMass(stages, payload, from = 0, fuel = null) {
  let mass = payload;
  for (let i = from; i < stages.length; i++) {
    mass += stageDryMass(stages[i], i < stages.length - 1);
    mass += fuel ? fuel[i] : stages[i].tanks * TANK.propellant;
  }
  return mass;
}
export function stageCost(stage, separable) {
  return stage.tanks * TANK.cost + ENGINES[stage.engine].cost + (stage.fins ? 2.5 : 0) + (separable ? 2 : 0);
}
export function craftStats(stages, payload) {
  let deltaV = 0, cost = 0;
  for (let i = 0; i < stages.length; i++) {
    const m0 = totalMass(stages, payload, i);
    const m1 = m0 - stages[i].tanks * TANK.propellant;
    deltaV += ENGINES[stages[i].engine].ispVac * WORLD.g0 * Math.log(m0 / m1);
    cost += stageCost(stages[i], i < stages.length - 1);
  }
  const mass = totalMass(stages, payload);
  const twr = ENGINES[stages[0].engine].thrust * 0.968 / (mass * (WORLD.mu / WORLD.radius ** 2));
  return { deltaV, cost, mass, twr };
}
export function orbitalElements(x, y, vx, vy) {
  const r = Math.hypot(x, y);
  const speed2 = vx * vx + vy * vy;
  const energy = speed2 / 2 - WORLD.mu / r;
  const h = x * vy - y * vx;
  const eccentricity = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (WORLD.mu * WORLD.mu)));
  const peri = h * h / (WORLD.mu * (1 + eccentricity));
  const apo = energy >= 0 || eccentricity >= 1 ? Infinity :
    h * h / (WORLD.mu * Math.max(1e-9, 1 - eccentricity));
  const semimajor = energy < 0 ? -WORLD.mu / (2 * energy) : Infinity;
  return { periAlt: peri - WORLD.radius, apoAlt: apo - WORLD.radius, eccentricity,
    period: Number.isFinite(semimajor) ? 2 * Math.PI * Math.sqrt(semimajor ** 3 / WORLD.mu) : Infinity,
    speed: Math.sqrt(speed2), altitude: r - WORLD.radius,
    verticalSpeed: (x * vx + y * vy) / r, h };
}
export function createFlight(craft, missionIndex = 0) {
  const stages = craft.map(s => ({ ...s }));
  const m = MISSIONS[missionIndex];
  return { stages, missionIndex, fuel: stages.map(s => s.tanks * TANK.propellant),
    stageIndex: 0, x: 0, y: WORLD.radius + 2, vx: WORLD.omega * WORLD.radius, vy: 0,
    t: 0, pitch: 0, throttle: 1, auto: true, mode: 'ascent',
    maxAlt: 0, maxQ: 0, outcome: null, reason: '', events: ['Зажигание · марсианская база'],
    maxG: 0, peakSpeed: 0, delivered: false, trail: [] };
}
export const altitude = f => Math.hypot(f.x, f.y) - WORLD.radius;
export const currentStage = f => f.stages[f.stageIndex];
export const remainingFuel = f => f.fuel.reduce((v, x, i) => v + (i >= f.stageIndex ? x : 0), 0);
export function separateStage(f) {
  if (f.outcome || f.stageIndex >= f.stages.length - 1) return false;
  f.fuel[f.stageIndex] = 0;
  f.stageIndex++;
  f.events.push('Отделение · ступень ' + f.stageIndex);
  f.events = f.events.slice(-6);
  return true;
}
export function guidance(f) {
  if (!f.auto || f.outcome) return;
  const m = MISSIONS[f.missionIndex];
  const orb = orbitalElements(f.x, f.y, f.vx, f.vy);
  const alt = Math.max(0, orb.altitude);
  if (f.mode === 'ascent') {
    // Pitch from local zenith towards the eastward tangent; no fake orbit forces.
    f.pitch = clamp((alt - 7000) / 65000 * 88, 0, 88);
    f.throttle = 1;
    if (orb.apoAlt >= m.target && alt > 25000) {
      f.mode = 'coast'; f.throttle = 0; f.pitch = 90;
      f.events.push('Апогей запланирован · ожидание');
    }
  } else if (f.mode === 'coast') {
    f.throttle = 0; f.pitch = 90;
    if (orb.altitude > 60000 && (orb.verticalSpeed <= 25 && alt > m.min - 30000)) {
      f.mode = 'circularize'; f.events.push('Торможение подъёма · разгон по касательной');
    }
  } else {
    f.pitch = 90;
    f.throttle = 1;
    if (orb.periAlt >= m.min && Number.isFinite(orb.apoAlt) && orb.apoAlt <= m.max) {
      f.throttle = 0; f.outcome = 'success'; f.delivered = true;
      f.events.push('Орбита устойчива · груз доставлен');
    }
  }
  if (!f.outcome && f.throttle > 0 && f.fuel[f.stageIndex] <= 0.01 && f.stageIndex < f.stages.length - 1) {
    separateStage(f);
  }
  f.events = f.events.slice(-6);
}
export function simulateStep(f, dt) {
  if (f.outcome || dt <= 0) return;
  if (f.auto) guidance(f);
  if (f.outcome) return;
  const r = Math.hypot(f.x, f.y);
  const alt = r - WORLD.radius;
  const upx = f.x / r, upy = f.y / r;
  const eastx = upy, easty = -upx;
  const angle = f.pitch * Math.PI / 180;
  const dirx = Math.cos(angle) * upx + Math.sin(angle) * eastx;
  const diry = Math.cos(angle) * upy + Math.sin(angle) * easty;
  const current = currentStage(f);
  const engine = ENGINES[current.engine];
  const pressure = Math.exp(-Math.max(0, alt) / WORLD.scaleHeight);
  const isp = engine.ispVac - (engine.ispVac - engine.ispSea) * pressure;
  const thrust = engine.thrust * (1 - .032 * pressure);
  const mass0 = totalMass(f.stages, MISSIONS[f.missionIndex].payload, f.stageIndex, f.fuel);
  const required = (f.throttle * thrust / (isp * WORLD.g0)) * dt;
  const burnt = Math.min(Math.max(0, f.fuel[f.stageIndex]), required);
  f.fuel[f.stageIndex] = Math.max(0, f.fuel[f.stageIndex] - burnt);
  const realThrust = required > 0 ? f.throttle * thrust * burnt / required : 0;
  const mass = mass0 - burnt / 2;
  const airVx = WORLD.omega * f.y, airVy = -WORLD.omega * f.x;
  const airDx = f.vx - airVx, airDy = f.vy - airVy;
  const airSpeed = Math.hypot(airDx, airDy);
  const rho = WORLD.rho0 * pressure;
  const q = .5 * rho * airSpeed * airSpeed;
  const area = .7 + (current.fins ? .2 : 0) + Math.abs(Math.sin(angle)) * .08;
  const dragAcc = .5 * rho * area * airSpeed / mass;
  const grav = -WORLD.mu / (r * r * r);
  const ax = grav * f.x + dirx * realThrust / mass - dragAcc * airDx;
  const ay = grav * f.y + diry * realThrust / mass - dragAcc * airDy;
  f.vx += ax * dt;
  f.vy += ay * dt;
  f.x += f.vx * dt; f.y += f.vy * dt;
  f.t += dt;
  const newAlt = altitude(f);
  f.maxAlt = Math.max(f.maxAlt, newAlt);
  f.maxQ = Math.max(f.maxQ, q);
  f.peakSpeed = Math.max(f.peakSpeed, Math.hypot(f.vx, f.vy));
  f.maxG = Math.max(f.maxG, Math.hypot(ax - grav * f.x, ay - grav * f.y) / WORLD.g0);
  if (f.t > 2 && newAlt < 0) { f.outcome = 'crash'; f.reason = 'Аппарат столкнулся с поверхностью'; }
  if (f.t > 2400) { f.outcome = 'fail'; f.reason = 'Окно испытания завершилось'; }
  if (newAlt > 5000000) { f.outcome = 'fail'; f.reason = 'Аппарат покинул район испытаний'; }
  if (!f.outcome) {
    const orb = orbitalElements(f.x, f.y, f.vx, f.vy);
    const m = MISSIONS[f.missionIndex];
    if (orb.periAlt >= m.min && orb.apoAlt <= m.max && newAlt >= 70000) {
      f.outcome = 'success'; f.throttle = 0; f.delivered = true;
      f.events.push('Орбита устойчива · груз доставлен');
    }
  }
}
export function advanceFlight(f, dt) {
  let left = clamp(dt, 0, 3);
  while (left > 1e-8 && !f.outcome) {
    const h = Math.min(left, 0.15);
    simulateStep(f, h);
    left -= h;
  }
}
