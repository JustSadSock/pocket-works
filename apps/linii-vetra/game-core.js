export const STORAGE_KEY = 'pocket-works:linii-vetra:save';
export const MAX_DAYS = 7;

export const TOWNS = [
  { id: 'spire', name: 'Шпиль', x: .13, y: .56, faction: 'relay' },
  { id: 'mill', name: 'Мельницы', x: .35, y: .27, faction: 'guild' },
  { id: 'quay', name: 'Сухой порт', x: .63, y: .66, faction: 'guild' },
  { id: 'orchard', name: 'Сады', x: .76, y: .28, faction: 'free' },
  { id: 'cliff', name: 'Край', x: .9, y: .52, faction: 'relay' }
];

export const FACTIONS = {
  relay: { name: 'Релейная служба', short: 'РЕЛЕ', color: '#2f6c6a' },
  guild: { name: 'Гильдия фабрик', short: 'ГИЛЬДИЯ', color: '#a15c38' },
  free: { name: 'Свободные поселения', short: 'СВОБОДНЫЕ', color: '#6f6742' }
};

const CARGO = [
  { name: 'сыворотка', title: 'Холодный ящик', risk: .18, reward: 3, copy: 'Хрупкий груз. Потеря высоты опаснее обычного.' },
  { name: 'семена', title: 'Сухие семена', risk: .08, reward: 2, copy: 'Лёгкий груз, но адресат далеко от главных потоков.' },
  { name: 'чертежи', title: 'Запечатанные чертежи', risk: .14, reward: 3, copy: 'Тяжёлый нос и чужой интерес к маршруту.' },
  { name: 'письма', title: 'Связка писем', risk: .04, reward: 2, copy: 'Обычная почта. Необычно сильный боковой ветер.' },
  { name: 'детали', title: 'Шестерни маяка', risk: .2, reward: 4, copy: 'Тяжёлый груз. Зато башня снова увидит фронт.' },
  { name: 'карта', title: 'Карта фронта', risk: .12, reward: 3, copy: 'Нельзя намочить. Маршрут проходит через дождь.' }
];

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function createCampaign(seed = Math.floor(Math.random() * 1e9)) {
  return {
    version: 1,
    seed,
    day: 1,
    maxDays: MAX_DAYS,
    influence: { relay: 0, guild: 0, free: 0 },
    supplies: 4,
    delivered: 0,
    lost: 0,
    bestFlight: 0,
    tutorialDone: false,
    sound: true,
    reduceMotion: false,
    plane: { wing: .58, ballast: .42, crease: 0, finish: 'dry' },
    history: []
  };
}

export function validateCampaign(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return null;
  const base = createCampaign(Number.isFinite(value.seed) ? value.seed : 1);
  return {
    ...base,
    ...value,
    day: clamp(Math.round(value.day || 1), 1, MAX_DAYS + 1),
    supplies: clamp(Math.round(value.supplies ?? 4), 0, 99),
    delivered: clamp(Math.round(value.delivered || 0), 0, 99),
    lost: clamp(Math.round(value.lost || 0), 0, 99),
    influence: {
      relay: clamp(Math.round(value.influence?.relay || 0), -20, 30),
      guild: clamp(Math.round(value.influence?.guild || 0), -20, 30),
      free: clamp(Math.round(value.influence?.free || 0), -20, 30)
    },
    plane: {
      wing: clamp(Number(value.plane?.wing ?? .58), .25, .9),
      ballast: clamp(Number(value.plane?.ballast ?? .42), .15, .85),
      crease: clamp(Number(value.plane?.crease ?? 0), -.45, .45),
      finish: value.plane?.finish === 'wax' ? 'wax' : 'dry'
    },
    history: Array.isArray(value.history) ? value.history.slice(-MAX_DAYS) : []
  };
}

export function missionsForDay(campaign) {
  const random = mulberry32(hashString(`${campaign.seed}:${campaign.day}:missions`));
  const destinations = [...TOWNS.slice(1)].sort(() => random() - .5).slice(0, 3);
  return destinations.map((town, index) => {
    const cargo = CARGO[(Math.floor(random() * CARGO.length) + index) % CARGO.length];
    const weather = ['crosswind', 'thermals', 'rain'][(campaign.day + index + Math.floor(random() * 3)) % 3];
    const distance = Math.round(2450 + town.x * 1450 + campaign.day * 70 + random() * 260);
    return {
      id: `${campaign.day}-${town.id}-${cargo.name}`,
      townId: town.id,
      town,
      faction: town.faction,
      cargo,
      weather,
      distance,
      reward: cargo.reward + (weather === 'rain' ? 1 : 0),
      difficulty: clamp(.28 + campaign.day * .055 + cargo.risk + (weather === 'rain' ? .1 : 0), .35, .88)
    };
  });
}

export function planeStats(config) {
  const wing = clamp(config.wing, .25, .9);
  const ballast = clamp(config.ballast, .15, .85);
  const crease = clamp(config.crease, -.45, .45);
  const wax = config.finish === 'wax';
  return {
    lift: clamp(.42 + wing * .66 - ballast * .12, .35, 1),
    stability: clamp(.78 - Math.abs(crease) * .65 + ballast * .22 - wing * .12, .25, 1),
    speed: clamp(.98 - wing * .38 + ballast * .24 + (wax ? .04 : 0), .35, 1),
    rain: wax ? .82 : .36,
    turn: clamp(.42 + (1 - wing) * .58 + Math.abs(crease) * .2, .3, 1)
  };
}

export function createFlight(mission, config, launch = { power: .7, angle: -.12 }) {
  const stats = planeStats(config);
  const speed = 104 + stats.speed * 68 + clamp(launch.power, .35, 1) * 48;
  const angle = clamp(launch.angle, -.5, .28);
  return {
    x: 110,
    y: 285,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    pitch: angle,
    integrity: 1,
    water: 0,
    deformation: 0,
    distance: 0,
    elapsed: 0,
    score: 0,
    collisions: 0,
    complete: false,
    success: false,
    reason: '',
    stats,
    mission,
    config: { ...config },
    inputPitch: 0,
    inputShift: 0,
    gustFlash: 0,
    lastImpact: -99
  };
}

export function terrainHeight(worldX, width, height, mission) {
  const base = height * .88;
  const hill = Math.sin(worldX * .0023 + mission.difficulty * 3) * 24 + Math.sin(worldX * .0061) * 10;
  const ridge1 = Math.max(0, 1 - Math.abs(worldX - mission.distance * .36) / 430) * (46 + mission.difficulty * 38);
  const ridge2 = Math.max(0, 1 - Math.abs(worldX - mission.distance * .68) / 360) * (34 + mission.difficulty * 30);
  const landingFlatten = clamp((worldX - (mission.distance - 420)) / 300, 0, 1);
  return lerp(base - hill - ridge1 - ridge2, base - 8, landingFlatten);
}

export function windAt(worldX, y, time, mission, viewportHeight = 600) {
  const wave = Math.sin(worldX * .0047 + time * 1.7) + Math.sin(worldX * .0019 - time * .8) * .6;
  let wx = 16 + mission.difficulty * 14 + wave * 7;
  let wy = Math.sin(worldX * .006 + time * 2.1) * 5;
  const thermalA = Math.exp(-Math.pow((worldX - mission.distance * .28) / 260, 2));
  const thermalB = Math.exp(-Math.pow((worldX - mission.distance * .61) / 210, 2));
  if (mission.weather === 'thermals') wy -= (thermalA * 24 + thermalB * 30) * clamp(1 - y / viewportHeight, .25, 1);
  if (mission.weather === 'crosswind') { wx += Math.sin(time * 3.4 + worldX * .003) * 12; wy += Math.sin(time * 2.7) * 11; }
  if (mission.weather === 'rain') { wx -= 4; wy += 5 + Math.sin(time * 1.3) * 4; }
  return { x: wx, y: wy, thermal: thermalA + thermalB };
}

export function stepFlight(state, dt, viewport) {
  if (state.complete) return state;
  const { width, height } = viewport;
  const ground = terrainHeight(state.x, width, height, state.mission);
  const wind = windAt(state.x, state.y, state.elapsed, state.mission, height);
  const rx = state.vx - wind.x;
  const ry = state.vy - wind.y;
  const airspeed = Math.max(1, Math.hypot(rx, ry));
  const gamma = Math.atan2(ry, rx);
  const trimBias = state.config.crease * .28 + (state.config.ballast - .5) * .18;
  const targetPitch = gamma + trimBias - state.inputPitch * .48 + state.inputShift * .06;
  const turnRate = (1.15 + state.stats.turn * 2.15) * (0.45 + state.integrity * .55);
  state.pitch += clamp(targetPitch - state.pitch, -turnRate * dt, turnRate * dt);

  const alpha = clamp(state.pitch - gamma, -.42, .48);
  const damageLift = .45 + state.integrity * .55;
  const waterPenalty = 1 - state.water * .32;
  const liftCoefficient = clamp(.15 - alpha * 2.8, -.45, 1.15) * state.stats.lift * damageLift * waterPenalty;
  const lift = .00132 * airspeed * airspeed * liftCoefficient;
  const dragCoefficient = .00032 + state.config.wing * .00022 + state.water * .00022 + state.deformation * .0003;
  const drag = dragCoefficient * airspeed * airspeed;
  const mass = .88 + state.config.ballast * .48;
  const inv = 1 / airspeed;
  let ax = (ry * inv * lift - rx * inv * drag) / mass;
  let ay = (-rx * inv * lift - ry * inv * drag) / mass + 20.5;

  const gust = Math.sin(state.elapsed * 5.1 + state.x * .008) * state.mission.difficulty;
  ax += gust * 2.2;
  ay += gust * 1.4;
  state.vx += ax * dt;
  state.vy += ay * dt;
  state.vx = clamp(state.vx, 58, 240);
  state.vy = clamp(state.vy, -105, 125);
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.elapsed += dt;
  state.distance = Math.max(0, state.x - 110);

  if (state.mission.weather === 'rain') {
    const inRain = state.x > state.mission.distance * .42 && state.x < state.mission.distance * .73;
    if (inRain) state.water = clamp(state.water + dt * (.032 + state.mission.difficulty * .018) * (1.25 - state.stats.rain), 0, 1);
  } else state.water = clamp(state.water - dt * .02, 0, 1);

  const newGround = terrainHeight(state.x, width, height, state.mission);
  if (state.y > newGround - 7 && state.elapsed - state.lastImpact > .24) {
    const impact = Math.abs(state.vy) + Math.max(0, 125 - state.vx) * .22;
    state.lastImpact = state.elapsed;
    state.collisions += 1;
    state.integrity = clamp(state.integrity - clamp(.035 + impact / 650, .045, .18), 0, 1);
    state.deformation = clamp(state.deformation + .18 + impact / 420, 0, 1);
    state.y = newGround - 10;
    state.vy = -Math.abs(state.vy) * .42 - 28;
    state.vx *= .86;
    state.pitch -= .18;
    state.gustFlash = 1;
  }

  if (state.y < 22) { state.y = 22; state.vy = Math.abs(state.vy) * .35; state.pitch += .12; }
  state.gustFlash = Math.max(0, state.gustFlash - dt * 2.4);
  state.score = Math.round(state.distance * .7 + state.integrity * 500 + Math.max(0, 1 - state.water) * 160);

  if (state.integrity <= .02) {
    state.complete = true; state.success = false; state.reason = 'Самолётик больше не держит форму.';
  } else if (state.x >= state.mission.distance) {
    state.complete = true;
    state.success = true;
    const targetY = height * .48;
    const accuracy = clamp(1 - Math.abs(state.y - targetY) / (height * .5), 0, 1);
    state.score += Math.round(accuracy * 600);
    state.reason = accuracy > .72 ? 'Посылка поймана прямо с воздуха.' : accuracy > .35 ? 'Груз дошёл, хотя приземление было нервным.' : 'Самолётик добрался на последнем дыхании.';
  }
  return state;
}

export function applyFlightResult(campaign, flight) {
  const next = validateCampaign(campaign);
  const mission = flight.mission;
  const quality = flight.success ? clamp((flight.integrity * .62 + (1 - flight.water) * .2 + Math.min(1, flight.score / 2800) * .18), 0, 1) : 0;
  const influenceGain = flight.success ? Math.max(1, Math.round(mission.reward * (.65 + quality * .55))) : -1;
  next.influence[mission.faction] = clamp(next.influence[mission.faction] + influenceGain, -20, 30);
  const rivals = Object.keys(next.influence).filter(key => key !== mission.faction);
  if (flight.success && quality > .72) next.influence[rivals[next.day % rivals.length]] = clamp(next.influence[rivals[next.day % rivals.length]] - 1, -20, 30);
  next.supplies = clamp(next.supplies + (flight.success ? Math.max(1, mission.reward - 1) : -1), 0, 99);
  next.delivered += flight.success ? 1 : 0;
  next.lost += flight.success ? 0 : 1;
  next.bestFlight = Math.max(next.bestFlight, flight.score);
  next.history.push({ day: next.day, missionId: mission.id, town: mission.town.name, faction: mission.faction, success: flight.success, quality, score: flight.score });
  next.day += 1;
  return next;
}

export function campaignEnding(campaign) {
  const entries = Object.entries(campaign.influence).sort((a, b) => b[1] - a[1]);
  const [leader, score] = entries[0];
  const margin = score - entries[1][1];
  if (campaign.delivered <= 2) return { title: 'Небо умолкло', text: 'Служба не выдержала недели. Маршруты распались, а города снова стали островами.' };
  if (margin <= 2) return { title: 'Нейтральное небо', text: 'Никто не получил монополию на маршруты. Курьерская служба стала редким местом, где ещё разговаривают все.' };
  if (leader === 'relay') return { title: 'Сеть над горами', text: 'Релейная служба связала башни в единый контур. Ветер теперь читают раньше, чем он приходит.' };
  if (leader === 'guild') return { title: 'Небо по расписанию', text: 'Гильдия превратила маршруты в промышленную систему. Быстро, надёжно и почти без свободных решений.' };
  return { title: 'Вольные линии', text: 'Поселения удержали воздух открытым. Карты ветра копируют от руки и передают тем, кому они нужнее всего.' };
}
