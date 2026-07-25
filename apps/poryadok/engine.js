export const MIN_LOG_SCALE = -15.2;
export const MAX_LOG_SCALE = 27.0;

export const OBJECTS = Object.freeze([
  { id: 'proton', name: 'Протон', size: 8.4e-16, glyph: 'atom', group: 'КВАНТОВЫЙ МИР', note: 'Характерный диаметр протона. Дальше привычная геометрия уже начинает сдавать позиции.' },
  { id: 'atom', name: 'Атом водорода', size: 1.06e-10, glyph: 'atom', group: 'АТОМЫ', note: 'Примерный диаметр основного состояния атома водорода.' },
  { id: 'dna', name: 'Двойная спираль ДНК', size: 2e-9, glyph: 'helix', group: 'МОЛЕКУЛЫ', note: 'Ширина двойной спирали. Её длина может быть несравнимо больше.' },
  { id: 'ribosome', name: 'Рибосома', size: 2.5e-8, glyph: 'cell', group: 'МОЛЕКУЛЯРНЫЕ МАШИНЫ', note: 'Клеточная фабрика белка размером в несколько десятков нанометров.' },
  { id: 'virus', name: 'Вирус', size: 1e-7, glyph: 'virus', group: 'МИКРОМИР', note: 'Характерный размер среднего вируса; реальные значения гуляют на порядок.' },
  { id: 'bacterium', name: 'Бактерия', size: 2e-6, glyph: 'cell', group: 'МИКРОМИР', note: 'Типичная длина небольшой бактерии.' },
  { id: 'blood-cell', name: 'Эритроцит', size: 8e-6, glyph: 'cell', group: 'КЛЕТКИ', note: 'Диаметр красной клетки крови человека.' },
  { id: 'hair', name: 'Человеческий волос', size: 7e-5, glyph: 'fiber', group: 'ВИДИМЫЙ ПОРОГ', note: 'Типичная толщина волоса; отдельные волосы заметно отличаются.' },
  { id: 'salt', name: 'Крупинка соли', size: 3e-4, glyph: 'crystal', group: 'МЕЛКИЕ ПРЕДМЕТЫ', note: 'Небольшой кристалл поваренной соли.' },
  { id: 'ant', name: 'Муравей', size: 5e-3, glyph: 'creature', group: 'ЖИВОЕ', note: 'Длина обычного рабочего муравья.' },
  { id: 'coin', name: 'Монета', size: 2.3e-2, glyph: 'disc', group: 'ПРЕДМЕТЫ', note: 'Диаметр небольшой монеты.' },
  { id: 'hand', name: 'Ладонь', size: 1.8e-1, glyph: 'hand', group: 'ЧЕЛОВЕК', note: 'Длина взрослой ладони от запястья до кончиков пальцев.' },
  { id: 'human', name: 'Человек', size: 1.75, glyph: 'human', group: 'ЧЕЛОВЕК', note: 'Средний человеческий рост, удобная точка отсчёта для повседневного масштаба.' },
  { id: 'bus', name: 'Городской автобус', size: 12, glyph: 'vehicle', group: 'МАШИНЫ', note: 'Длина стандартного городского автобуса.' },
  { id: 'whale', name: 'Синий кит', size: 27, glyph: 'creature', group: 'ЖИВОЕ', note: 'Длина крупного синего кита.' },
  { id: 'field', name: 'Футбольное поле', size: 105, glyph: 'field', group: 'СООРУЖЕНИЯ', note: 'Стандартная длина большого футбольного поля.' },
  { id: 'eiffel', name: 'Эйфелева башня', size: 330, glyph: 'tower', group: 'СООРУЖЕНИЯ', note: 'Высота вместе с антенной.' },
  { id: 'everest', name: 'Эверест', size: 8849, glyph: 'mountain', group: 'РЕЛЬЕФ', note: 'Высота вершины над уровнем моря.' },
  { id: 'city', name: 'Большой город', size: 4e4, glyph: 'city', group: 'ЛАНДШАФТ', note: 'Характерная ширина крупного города вместе с пригородами.' },
  { id: 'italy', name: 'Италия с севера на юг', size: 1.2e6, glyph: 'land', group: 'ПЛАНЕТАРНОЕ', note: 'Приближённая протяжённость страны по длинной оси.' },
  { id: 'moon', name: 'Луна', size: 3.474e6, glyph: 'planet', group: 'ПЛАНЕТЫ', note: 'Диаметр Луны.' },
  { id: 'earth', name: 'Земля', size: 1.2742e7, glyph: 'planet', group: 'ПЛАНЕТЫ', note: 'Средний диаметр Земли.' },
  { id: 'jupiter', name: 'Юпитер', size: 1.3982e8, glyph: 'planet', group: 'ПЛАНЕТЫ', note: 'Экваториальный диаметр крупнейшей планеты Солнечной системы.' },
  { id: 'sun', name: 'Солнце', size: 1.3927e9, glyph: 'star', group: 'ЗВЁЗДЫ', note: 'Диаметр Солнца.' },
  { id: 'earth-orbit', name: 'Орбита Земли', size: 2.992e11, glyph: 'orbit', group: 'СОЛНЕЧНАЯ СИСТЕМА', note: 'Диаметр земной орбиты — две астрономические единицы.' },
  { id: 'neptune-orbit', name: 'Орбита Нептуна', size: 9e12, glyph: 'orbit', group: 'СОЛНЕЧНАЯ СИСТЕМА', note: 'Приближённый диаметр орбиты Нептуна.' },
  { id: 'light-year', name: 'Световой год', size: 9.461e15, glyph: 'beam', group: 'МЕЖЗВЁЗДНОЕ', note: 'Расстояние, которое свет проходит за год.' },
  { id: 'oort', name: 'Облако Оорта', size: 3e16, glyph: 'cloud', group: 'СОЛНЕЧНАЯ СИСТЕМА', note: 'Очень приблизительный диаметр внешнего резервуара комет.' },
  { id: 'stellar-neighborhood', name: 'Окрестность Солнца', size: 1e18, glyph: 'stars', group: 'МЕЖЗВЁЗДНОЕ', note: 'Сфера порядка ста световых лет с ближайшими звёздами.' },
  { id: 'milky-way', name: 'Млечный Путь', size: 1e21, glyph: 'galaxy', group: 'ГАЛАКТИКИ', note: 'Характерный диаметр звёздного диска нашей галактики.' },
  { id: 'local-group', name: 'Местная группа', size: 1e23, glyph: 'cluster', group: 'СКОПЛЕНИЯ', note: 'Группа галактик, куда входят Млечный Путь и Андромеда.' },
  { id: 'virgo-supercluster', name: 'Сверхскопление Девы', size: 1.1e24, glyph: 'cluster', group: 'КОСМИЧЕСКАЯ СЕТЬ', note: 'Крупная структура, частью которой считается Местная группа.' },
  { id: 'laniakea', name: 'Ланиакея', size: 5e24, glyph: 'web', group: 'КОСМИЧЕСКАЯ СЕТЬ', note: 'Гравитационный бассейн множества галактических скоплений.' },
  { id: 'observable-universe', name: 'Наблюдаемая Вселенная', size: 8.8e26, glyph: 'universe', group: 'ПРЕДЕЛ НАБЛЮДЕНИЯ', note: 'Современная оценка диаметра наблюдаемой области Вселенной.' }
].sort((a, b) => a.size - b.size));

export const MATERIALS = Object.freeze([
  { id: 'aerogel', name: 'Аэрогель', density: 1.5, note: 'Один из самых лёгких твёрдых материалов.' },
  { id: 'cork', name: 'Пробка', density: 240, note: 'Лёгкий природный материал с большим объёмом воздуха.' },
  { id: 'ice', name: 'Лёд', density: 917, note: 'Менее плотный, чем жидкая вода, поэтому плавает.' },
  { id: 'water', name: 'Вода', density: 1000, note: 'Удобная базовая плотность: тонна на кубический метр.' },
  { id: 'aluminium', name: 'Алюминий', density: 2700, note: 'Лёгкий конструкционный металл.' },
  { id: 'iron', name: 'Железо', density: 7874, note: 'Плотный массовый металл и основа стали.' },
  { id: 'tungsten', name: 'Вольфрам', density: 19250, note: 'Очень плотный металл с высокой температурой плавления.' },
  { id: 'osmium', name: 'Осмий', density: 22590, note: 'Самый плотный из устойчивых элементов при обычных условиях.' }
]);

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function objectLog(object) {
  return Math.log10(object.size);
}

export function nearestObject(logScale) {
  return OBJECTS.reduce((best, candidate) => (
    Math.abs(objectLog(candidate) - logScale) < Math.abs(objectLog(best) - logScale) ? candidate : best
  ), OBJECTS[0]);
}

export function objectById(id) {
  return OBJECTS.find((object) => object.id === id) || null;
}

export function materialById(id) {
  return MATERIALS.find((material) => material.id === id) || MATERIALS[0];
}

export function cubeSideForMass(massKg, densityKgM3) {
  const safeMass = clamp(Number(massKg) || 0.001, 0.001, 1000000);
  const safeDensity = Math.max(0.001, Number(densityKgM3) || 1);
  return Math.cbrt(safeMass / safeDensity);
}

export function formatLength(meters) {
  const value = Math.abs(meters);
  const units = [
    { limit: 1e-12, factor: 1e15, unit: 'фм' },
    { limit: 1e-9, factor: 1e12, unit: 'пм' },
    { limit: 1e-6, factor: 1e9, unit: 'нм' },
    { limit: 1e-3, factor: 1e6, unit: 'мкм' },
    { limit: 1e-2, factor: 1e3, unit: 'мм' },
    { limit: 1, factor: 1e2, unit: 'см' },
    { limit: 1e3, factor: 1, unit: 'м' },
    { limit: 1e6, factor: 1e-3, unit: 'км' },
    { limit: 1e11, factor: 1e-6, unit: 'тыс. км' },
    { limit: 1e13, factor: 1 / 1.496e11, unit: 'а.е.' },
    { limit: 1e18, factor: 1 / 9.461e15, unit: 'св. лет' },
    { limit: Infinity, factor: 1 / 9.461e15, unit: 'св. лет' }
  ];
  const entry = units.find((candidate) => value < candidate.limit) || units.at(-1);
  const scaled = meters * entry.factor;
  const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  return `${scaled.toLocaleString('ru-RU', { maximumFractionDigits: digits })} ${entry.unit}`;
}

export function formatScientific(value) {
  if (!Number.isFinite(value) || value === 0) return '0';
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const coefficient = value / (10 ** exponent);
  return `${coefficient.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} × 10${superscript(exponent)}`;
}

export function formatRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return '—';
  if (ratio < 1) return `1 : ${formatCompact(1 / ratio)}`;
  return `${formatCompact(ratio)} : 1`;
}

export function formatCompact(value) {
  if (value < 1000) return value.toLocaleString('ru-RU', { maximumFractionDigits: value < 10 ? 1 : 0 });
  const exponent = Math.floor(Math.log10(value));
  const coefficient = value / (10 ** exponent);
  return `${coefficient.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}×10${superscript(exponent)}`;
}

export function superscript(value) {
  const map = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return String(value).split('').map((character) => map[character] || character).join('');
}

export function massFromLog(logMassKg) {
  return 10 ** clamp(logMassKg, -3, 3);
}

export function sanitizeState(candidate) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const pinned = Array.isArray(source.pinnedIds)
    ? [...new Set(source.pinnedIds.filter((id) => objectById(id)))].slice(0, 4)
    : ['human', 'earth'];
  return {
    schema: 1,
    logScale: clamp(Number(source.logScale) || 0, MIN_LOG_SCALE, MAX_LOG_SCALE),
    selectedId: objectById(source.selectedId)?.id || nearestObject(Number(source.logScale) || 0).id,
    pinnedIds: pinned,
    compareBaseId: objectById(source.compareBaseId)?.id || pinned[0] || 'human',
    massLogKg: clamp(Number(source.massLogKg) || 1, -3, 3),
    materialId: materialById(source.materialId).id,
    screen: ['scale', 'compare', 'matter'].includes(source.screen) ? source.screen : 'scale',
    onboarded: Boolean(source.onboarded),
    settings: {
      sound: source.settings?.sound !== false,
      haptics: source.settings?.haptics !== false
    }
  };
}
