export const MOVES = Object.freeze({
  U: { dx: 0, dy: -1, label: '↑' },
  D: { dx: 0, dy: 1, label: '↓' },
  L: { dx: -1, dy: 0, label: '←' },
  R: { dx: 1, dy: 0, label: '→' },
  W: { dx: 0, dy: 0, label: '•' }
});

export const CHAPTERS = Object.freeze([
  { id: 'imprint', number: 'I', title: 'ОТПЕЧАТКИ', copy: 'Научись оставлять себя в прошлом.' },
  { id: 'shutters', number: 'II', title: 'ЗАТВОРЫ', copy: 'Прошлое держит двери для настоящего.' },
  { id: 'ghostwork', number: 'III', title: 'ПРИЗРАЧНАЯ РАБОТА', copy: 'Некоторые печати слышат только эхо.' }
]);

export const LEVELS = Object.freeze([
  {
    id: '01', chapter: 'imprint', title: 'ПЕРВЫЙ ШАГ', loop: 4, maxEchoes: 1, par: 0,
    required: [], hint: 'Проведи пальцем вправо или нажми стрелку.',
    map: ['#####', '#@.E#', '#####']
  },
  {
    id: '02', chapter: 'imprint', title: 'ОСТАНЬСЯ', loop: 5, maxEchoes: 1, par: 1,
    required: ['a'], hint: 'Запиши один шаг на печать, затем дойди до выхода.',
    map: ['#######', '#@a..E#', '#######']
  },
  {
    id: '03', chapter: 'imprint', title: 'ДВА СВИДЕТЕЛЯ', loop: 5, maxEchoes: 2, par: 2,
    required: ['a', 'b'], hint: 'Каждой печати — своя кнопка.',
    map: ['#######', '#@a.bE#', '#######']
  },
  {
    id: '04', chapter: 'imprint', title: 'ЗАТВОР', loop: 6, maxEchoes: 1, par: 1,
    required: ['a'], hint: 'Печать на кнопке удержит решётку открытой.',
    map: ['#########', '#@a.A.E.#', '#########']
  },
  {
    id: '05', chapter: 'imprint', title: 'ОБХОД', loop: 6, maxEchoes: 1, par: 1,
    required: ['a'], hint: 'Одна версия идёт наверх, другая — вокруг стены.',
    map: ['#######', '#..a..#', '#.@#E.#', '#.....#', '#######']
  },
  {
    id: '06', chapter: 'imprint', title: 'СБОРКА', loop: 7, maxEchoes: 2, par: 2,
    required: ['a', 'b'], hint: 'Сначала ближняя печать, затем дальняя.',
    map: ['##########', '#@a.bA.E.#', '##########']
  },
  {
    id: '07', chapter: 'shutters', title: 'НИЖНИЙ КЛЮЧ', loop: 6, maxEchoes: 1, par: 1,
    required: ['a'], hint: 'Кнопка спрятана под стартом. Выход — по верхнему коридору.',
    map: ['########', '#@..A.E#', '#.#.#..#', '#a.....#', '########']
  },
  {
    id: '08', chapter: 'shutters', title: 'ДВОЙНОЙ ПРОПУСК', loop: 7, maxEchoes: 2, par: 2,
    required: ['a', 'b'], hint: 'Обе кнопки доступны снизу, но выход лежит за двумя затворами.',
    map: ['#########', '#@..A.BE#', '#..a.b..#', '#########']
  },
  {
    id: '09', chapter: 'shutters', title: 'ЭСТАФЕТА', loop: 9, maxEchoes: 2, par: 2,
    required: ['a', 'b'], hint: 'Вторая запись проходит через первый затвор. Настоящему придётся подождать.',
    map: ['#########', '#@..A.b##', '#..a#..##', '#...B.E##', '#########']
  },
  {
    id: '10', chapter: 'shutters', title: 'РАЗВИЛКА', loop: 7, maxEchoes: 2, par: 2,
    required: ['a', 'b'], hint: 'Одна печать обходит стену слева, другая — справа.',
    map: ['#########', '#..a#.b.#', '#..#.#..#', '#@...E..#', '#########']
  },
  {
    id: '11', chapter: 'shutters', title: 'РАННИЙ ВЫХОД', loop: 5, maxEchoes: 1, par: 1,
    required: ['a'], hint: 'Можно прийти к выходу раньше. Просто дождись прошлого.',
    map: ['#######', '#@.E.a#', '#######']
  },
  {
    id: '12', chapter: 'shutters', title: 'ТРИ ЗАТВОРA', loop: 10, maxEchoes: 3, par: 3,
    required: ['a', 'b', 'c'], hint: 'Каждая новая запись проходит дальше предыдущей.',
    map: ['############', '#@..A.bB.cE#', '#..a########', '############']
  },
  {
    id: '13', chapter: 'ghostwork', title: 'ГЛУХАЯ ПЕЧАТЬ', loop: 5, maxEchoes: 1, par: 1,
    required: ['u'], hint: 'Пунктирная печать реагирует только на эхо, не на тебя.',
    map: ['######', '#@u.E#', '######']
  },
  {
    id: '14', chapter: 'ghostwork', title: 'НЕВЕСОМЫЙ КЛЮЧ', loop: 6, maxEchoes: 1, par: 1,
    required: ['u'], hint: 'Запиши себя на призрачной печати, затем пройди через её затвор.',
    map: ['########', '#@u.U.E#', '########']
  },
  {
    id: '15', chapter: 'ghostwork', title: 'РАЗНЫЕ ВЕСА', loop: 7, maxEchoes: 2, par: 2,
    required: ['a', 'u'], hint: 'Обычная кнопка терпит кого угодно. Пунктирная — только запись.',
    map: ['########', '#@a.u.E#', '########']
  },
  {
    id: '16', chapter: 'ghostwork', title: 'ПОСЛЕ ЗАТВОРА', loop: 8, maxEchoes: 2, par: 2,
    required: ['a', 'u'], hint: 'Сначала открой путь к глухой печати, потом преврати маршрут в эхо.',
    map: ['#########', '#@..A.uE#', '#..a#####', '#########']
  },
  {
    id: '17', chapter: 'ghostwork', title: 'ХОР', loop: 8, maxEchoes: 3, par: 3,
    required: ['u', 'v', 'w'], hint: 'Три эха наверху. Настоящий идёт к выходу по нижней линии.',
    map: ['#########', '#u..v..w#', '#.......#', '#@....E.#', '#########']
  },
  {
    id: '18', chapter: 'ghostwork', title: 'ПЕТЛЯ ЗАМКНУТА', loop: 10, maxEchoes: 3, par: 3,
    required: ['a', 'u', 'v'], hint: 'Открой первый затвор, запиши глухую печать, затем протяни эхо до конца.',
    map: ['############', '#@..A.uU.vE#', '#..a########', '############']
  }
]);

export function parseLevel(level) {
  const rows = level.map.length;
  const cols = level.map[0].length;
  const cells = [];
  const plates = new Map();
  const gates = new Map();
  let start = null;
  let exit = null;

  level.map.forEach((row, y) => {
    if (row.length !== cols) throw new Error(`Level ${level.id} has a ragged map`);
    [...row].forEach((type, x) => {
      cells.push({ x, y, type });
      if (type === '@') start = { x, y };
      if (type === 'E') exit = { x, y };
      if (/[abcuvw]/.test(type)) {
        if (!plates.has(type)) plates.set(type, []);
        plates.get(type).push({ x, y });
      }
      if (/[ABCUVW]/.test(type)) {
        const key = type.toLowerCase();
        if (!gates.has(key)) gates.set(key, []);
        gates.get(key).push({ x, y });
      }
    });
  });

  if (!start || !exit) throw new Error(`Level ${level.id} must contain @ and E`);
  return { ...level, rows, cols, cells, plates, gates, start, exit };
}

export function isEchoOnlyPlate(type) {
  return /[uvw]/.test(type);
}
