export const SHIFT_DURATION = 180;
export const DISTRICT_KEYS = ['hospital', 'metro', 'homes'];

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function serviceFactor(mode) {
  if (mode === 2) return 1;
  if (mode === 1) return 0.72;
  return 0;
}

export function computeFrequency(supply, requested) {
  return clamp(50 + (supply - requested) * 0.055, 44, 56);
}

export function frequencyQuality(frequency) {
  const error = Math.abs(frequency - 50);
  if (error <= 0.22) return 1;
  if (error <= 0.5) return 0.75;
  if (error <= 1) return 0.35;
  return 0;
}

export function rankShift(score, completed, integrity, trust) {
  if (!completed) return { grade: 'АВАРИЯ', title: 'Смена сорвана' };
  const floor = Math.min(integrity, trust);
  if (score >= 7800 && floor >= 65) return { grade: 'А', title: 'Сеть держится как часы' };
  if (score >= 6100 && floor >= 45) return { grade: 'Б', title: 'Город пережил пик' };
  if (score >= 4300) return { grade: 'В', title: 'Смена закрыта с потерями' };
  return { grade: 'Г', title: 'Формально свет не погас' };
}

export function buildEventDeck(seed) {
  const random = mulberry32(seed ^ 0x50c7c7);
  const templates = [
    { id: 'surgery', district: 'hospital', label: 'Срочная операция', detail: 'Больнице нужно ещё 18 МВт', delta: 18, duration: 18, tone: 'critical' },
    { id: 'rush', district: 'metro', label: 'Час пик', detail: 'Метро поднимает нагрузку на 22 МВт', delta: 22, duration: 20, tone: 'warning' },
    { id: 'cold', district: 'homes', label: 'Резкое похолодание', detail: 'Жилой сектор просит ещё 17 МВт', delta: 17, duration: 22, tone: 'warning' },
    { id: 'line-fault', district: null, label: 'Повреждение линии', detail: 'Предел генератора временно снижен', maxSupplyDelta: -24, duration: 17, tone: 'critical' },
    { id: 'maintenance', district: null, label: 'Техническое окно', detail: 'Генератор охлаждается быстрее', cooling: 1.5, duration: 16, tone: 'good' },
    { id: 'stadium', district: 'homes', label: 'Матч закончился', detail: 'Город одновременно включает свет', delta: 24, duration: 15, tone: 'warning' },
    { id: 'train', district: 'metro', label: 'Резервный состав', detail: 'Метро забирает ещё 15 МВт', delta: 15, duration: 16, tone: 'warning' },
    { id: 'calm', district: null, label: 'Нагрузка спадает', detail: 'Короткое окно для охлаждения', globalDelta: -14, duration: 14, tone: 'good' }
  ];

  const deck = [];
  let cursor = 18;
  let previous = '';
  while (cursor < SHIFT_DURATION - 12) {
    let candidate = templates[Math.floor(random() * templates.length)];
    if (candidate.id === previous) candidate = templates[(templates.indexOf(candidate) + 1) % templates.length];
    deck.push({ ...candidate, startsAt: cursor, endsAt: cursor + candidate.duration });
    previous = candidate.id;
    cursor += 17 + Math.floor(random() * 9);
  }
  return deck;
}

export function districtDemand(key, elapsed, seed, activeEvent) {
  const phase = ((seed >>> 3) % 97) / 97 * Math.PI * 2;
  const minute = elapsed;
  let base = 0;
  if (key === 'hospital') base = 34 + Math.sin(minute * 0.11 + phase) * 3;
  if (key === 'metro') base = 26 + Math.sin(minute * 0.075 + phase * 0.7) * 5 + Math.min(18, elapsed * 0.11);
  if (key === 'homes') base = 31 + Math.sin(minute * 0.052 + phase * 1.3) * 7 + Math.max(0, elapsed - 75) * 0.08;
  if (activeEvent?.district === key) base += activeEvent.delta || 0;
  if (activeEvent?.globalDelta) base += activeEvent.globalDelta / 3;
  return Math.max(8, base);
}

export function summarizeDemand(districts) {
  return DISTRICT_KEYS.reduce((sum, key) => sum + districts[key].demand * serviceFactor(districts[key].mode), 0);
}
