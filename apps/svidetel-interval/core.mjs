export function permutations(a){if(a.length===0)return [[]];return a.flatMap((x,i)=>permutations(a.filter((_,j)=>j!==i)).map(p=>[x,...p]));}
export function holds(order,c){const a=order.indexOf(c.a),b=order.indexOf(c.b);if(a<0||b<0)return false;switch(c.type){case 'before':return a<b;case 'next':return b-a===1;case 'gap':return b-a===c.gap;case 'apart':return Math.abs(a-b)>1;case 'slot':return a===c.gap;default:return false;}}
export const cases=[
  {
    "title": "Ночной архив",
    "brief": "Сигнализация в хранилище зафиксировала пять событий без времени.",
    "events": [
      "Заперли дверь",
      "Погас свет",
      "Сработал звонок",
      "Открыли сейф",
      "Включили фонарь"
    ],
    "clues": [
      {
        "type": "gap",
        "a": 1,
        "b": 0,
        "gap": 2
      },
      {
        "type": "gap",
        "a": 4,
        "b": 3,
        "gap": 3
      },
      {
        "type": "before",
        "a": 1,
        "b": 4
      }
    ]
  },
  {
    "title": "Последняя почта",
    "brief": "Диспетчер потерял лист с очередностью пяти отправлений.",
    "events": [
      "Пакет с сургучом",
      "Телеграмма",
      "Газетная пачка",
      "Письмо без марки",
      "Посылка"
    ],
    "clues": [
      {
        "type": "gap",
        "a": 3,
        "b": 1,
        "gap": 3
      },
      {
        "type": "gap",
        "a": 0,
        "b": 2,
        "gap": 3
      },
      {
        "type": "next",
        "a": 3,
        "b": 0
      }
    ]
  },
  {
    "title": "Пустой театр",
    "brief": "Режиссёр записал только отношения между шестью репетиционными сигналами.",
    "events": [
      "Занавес",
      "Скрипка",
      "Колокол",
      "Прожектор",
      "Шаги",
      "Аплодисменты"
    ],
    "clues": [
      {
        "type": "gap",
        "a": 2,
        "b": 0,
        "gap": 3
      },
      {
        "type": "next",
        "a": 4,
        "b": 1
      },
      {
        "type": "gap",
        "a": 0,
        "b": 5,
        "gap": 2
      }
    ]
  },
  {
    "title": "Островная станция",
    "brief": "В журнале погоды исчезли часы. Уцелели шесть отметок.",
    "events": [
      "Туман",
      "Радиограмма",
      "Дождь",
      "Смена ветра",
      "Вспышка",
      "Гудок"
    ],
    "clues": [
      {
        "type": "gap",
        "a": 0,
        "b": 2,
        "gap": 3
      },
      {
        "type": "gap",
        "a": 4,
        "b": 3,
        "gap": 2
      },
      {
        "type": "next",
        "a": 2,
        "b": 1
      }
    ]
  },
  {
    "title": "Музей в движении",
    "brief": "Семь предметов сменили залы, а порядок переноса нужно восстановить.",
    "events": [
      "Маска",
      "Глобус",
      "Камень",
      "Часы",
      "Кубок",
      "Гравюра",
      "Ключ"
    ],
    "clues": [
      {
        "type": "gap",
        "a": 5,
        "b": 1,
        "gap": 3
      },
      {
        "type": "gap",
        "a": 1,
        "b": 0,
        "gap": 2
      },
      {
        "type": "gap",
        "a": 1,
        "b": 3,
        "gap": 3
      },
      {
        "type": "next",
        "a": 2,
        "b": 6
      }
    ]
  },
  {
    "title": "День экспедиции",
    "brief": "Семь событий составляют окончательный отчёт исследовательской группы.",
    "events": [
      "Встреча",
      "Проба грунта",
      "Сигнал",
      "Переправа",
      "Зарисовка",
      "Разведка",
      "Отбой"
    ],
    "clues": [
      {
        "type": "gap",
        "a": 1,
        "b": 0,
        "gap": 3
      },
      {
        "type": "gap",
        "a": 3,
        "b": 4,
        "gap": 2
      },
      {
        "type": "gap",
        "a": 0,
        "b": 6,
        "gap": 3
      },
      {
        "type": "apart",
        "a": 1,
        "b": 2
      }
    ]
  }
];
export function solutions(c){return permutations(c.events.map((_,i)=>i)).filter(p=>c.clues.every(cl=>holds(p,cl)));}
export function initial(c){const a=c.events.map((_,i)=>i);if(c.clues.every(cl=>holds(a,cl)))a.push(a.shift());return a;}
export function swap(a,i,j){if(!Number.isInteger(i)||!Number.isInteger(j)||i<0||j<0||i>=a.length||j>=a.length)return a.slice();const b=a.slice();[b[i],b[j]]=[b[j],b[i]];return b;}
export function validOrder(a,c){return Array.isArray(a)&&a.length===c.events.length&&a.every(n=>Number.isInteger(n)&&n>=0&&n<a.length)&&new Set(a).size===a.length;}
