// Rayleigh–Plesset spherical model. SI internally; no wall pressure or jet CFD inferred.
export const WATER = Object.freeze({ density: 998.2, viscosity: 0.001002, surfaceTension: 0.0728, vaporPressure: 2339 });
export const DEFAULTS = Object.freeze({ radiusMm: 0.9, pressureBar: 1.8, standOff: 1.65 });
export const PRESETS = Object.freeze({
  wall: { radiusMm: 0.9, pressureBar: 1.8, standOff: 1.65 },
  free: { radiusMm: 1.25, pressureBar: 1.1, standOff: 4.0 },
  gentle: { radiusMm: 1.6, pressureBar: 0.45, standOff: 2.7 }
});
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function sanitize(raw = {}) {
  return {
    radiusMm: clamp(Number.isFinite(+raw.radiusMm) ? +raw.radiusMm : DEFAULTS.radiusMm, 0.25, 2.5),
    pressureBar: clamp(Number.isFinite(+raw.pressureBar) ? +raw.pressureBar : DEFAULTS.pressureBar, 0.3, 4),
    standOff: clamp(Number.isFinite(+raw.standOff) ? +raw.standOff : DEFAULTS.standOff, 1.15, 4)
  };
}
export function rayleighTimeUs(radiusMm, pressureBar) {
  return 1e6 * 0.915 * radiusMm * 0.001 * Math.sqrt(WATER.density / (pressureBar * 1e5));
}

export function simulateBubble(raw = {}, opts = {}) {
  const config = sanitize(raw);
  const R0 = config.radiusMm * 0.001;
  const dp = config.pressureBar * 1e5;
  const scale = R0 * Math.sqrt(WATER.density / dp);
  const gas = opts.gasPressurePa ?? 5000; // initial noncondensible gas pressure at maximum radius
  const viscosity = opts.viscosity ?? WATER.viscosity;
  const tension = opts.surfaceTension ?? WATER.surfaceTension;
  const kappa = 1.4;
  let x = 1, u = 0, tau = 0;
  let minX = 1, maxWallSpeed = 0, firstMinimum = null;
  let previousU = 0;
  const samples = [{ t: 0, radius: 1, velocity: 0 }];
  const slope = (r, v) => {
    const radius = Math.max(0.028, r);
    const pg = gas * Math.pow(radius, -3 * kappa);
    const pDrive = (pg - dp - 2 * tension / (R0 * radius) - 4 * viscosity * v / (scale * radius)) / dp;
    const acceleration = (pDrive - 1.5 * v * v) / radius;
    return [v, clamp(acceleration, -2e7, 2e7)];
  };
  let lastSaved = 0;
  for (let step = 0; step < 100000 && tau < 2.7; step++) {
    const [, acc] = slope(x, u);
    let dt = Math.min(0.003, 0.018 * x / (Math.abs(u) + 0.5), 0.085 * Math.sqrt(x / (Math.abs(acc) + 1)));
    dt = clamp(dt, 0.00000035, 0.003);
    dt = Math.min(dt, 2.7 - tau);
    if (dt <= 0) break;
    const [a1, b1] = slope(x, u);
    const [a2, b2] = slope(x + dt * a1 * 0.5, u + dt * b1 * 0.5);
    const [a3, b3] = slope(x + dt * a2 * 0.5, u + dt * b2 * 0.5);
    const [a4, b4] = slope(x + dt * a3, u + dt * b3);
    const nx = Math.max(0.028, x + dt * (a1 + 2 * a2 + 2 * a3 + a4) / 6);
    const nu = clamp(u + dt * (b1 + 2 * b2 + 2 * b3 + b4) / 6, -1800, 1800);
    previousU = u;
    x = nx; u = nu; tau += dt;
    minX = Math.min(minX, x);
    maxWallSpeed = Math.max(maxWallSpeed, Math.abs(u * R0 / scale));
    if (firstMinimum === null && previousU < 0 && u >= 0) firstMinimum = tau;
    if (tau - lastSaved > 0.002 || firstMinimum !== null && tau - lastSaved > 0.001 || tau >= 2.699) {
      samples.push({ t: tau, radius: x, velocity: u });
      lastSaved = tau;
    }
    if (!Number.isFinite(x) || !Number.isFinite(u)) throw new Error('Nonfinite bubble solution');
    if (x <= 0.029) {
      if (firstMinimum === null) firstMinimum = tau;
      break; // Outside reliable incompressible regime.
    }
    if (firstMinimum !== null && tau > firstMinimum + 0.75 && u <= 0 && x < 0.11) break;
  }
  if (samples[samples.length - 1].t !== tau) samples.push({ t: tau, radius: x, velocity: u });
  const jetFactor = clamp((2.8 - config.standOff) / 1.65, 0, 1);
  const minTime = firstMinimum ?? samples[samples.length - 1].t;
  return {
    config, samples, scaleUs: scale * 1e6,
    collapseTimeUs: minTime * scale * 1e6,
    rayleighTimeUs: rayleighTimeUs(config.radiusMm, config.pressureBar),
    firstMinimumTau: minTime, durationTau: samples[samples.length - 1].t,
    minRadiusMm: minX * config.radiusMm, minRatio: minX,
    maxWallSpeed, jetFactor,
    truncated: firstMinimum === null || minX <= 0.029,
    assumptions: 'Spherical Rayleigh–Plesset model (incompressible water, adiabatic residual gas). Jet near rigid wall is qualitative only.'
  };
}
export function sampleAt(solution, timeTau) {
  const arr = solution.samples;
  const t = clamp(timeTau, 0, solution.durationTau);
  let lo = 0, hi = arr.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t < t) lo = mid; else hi = mid;
  }
  if (t <= 0) return { ...arr[0] };
  const a = arr[lo], b = arr[hi];
  const k = clamp((t - a.t) / Math.max(1e-9, b.t - a.t), 0, 1);
  return { t, radius: a.radius + k * (b.radius - a.radius), velocity: a.velocity + k * (b.velocity - a.velocity) };
}
