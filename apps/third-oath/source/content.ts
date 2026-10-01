import type { Skill } from './state';

export interface DialogueOption {
  id: string;
  label: string;
  next?: string;
  failNext?: string;
  skill?: Skill;
  difficulty?: number;
  checkId?: string;
  effect?: string;
  requiresItem?: string;
  requiresFlag?: string;
}

export interface DialogueNode {
  id: string;
  speaker: string;
  text: string;
  options: DialogueOption[];
}

export const ITEMS = {
  oathStone: { id: 'oath-stone', name: 'Камень Клятвы', note: 'Тяжёлый, почти чёрный. На грани вырезана одна ровная линия.' },
  tearStone: { id: 'tear-stone', name: 'Слеза', note: 'Полупрозрачный камень. Внутри будто застывшая капля.' },
  sunLetter: { id: 'sun-letter', name: 'Письмо с печатью', note: 'Солнце, пробитое стрелой. Подпись выскоблена ножом.' }
} as const;

export const DIALOGUES: Record<string, DialogueNode> = {
  altar: {
    id: 'altar',
    speaker: 'КАПЕЛЛА',
    text: 'Воск на подсвечнике ещё мягкий. Под алтарной плитой — свежая полоска каменной пыли.',
    options: [
      {
        id: 'read-seam',
        label: '[Проницательность] Проверить шов под плитой.',
        next: 'altar-success',
        failNext: 'altar-fail',
        skill: 'insight',
        difficulty: 13,
        checkId: 'altar-seam'
      },
      { id: 'leave', label: 'Не трогать алтарь.' }
    ]
  },
  'altar-success': {
    id: 'altar-success',
    speaker: 'КАПЕЛЛА',
    text: 'Плита двигается только с одного края. Под ней лежит чёрный камень, обёрнутый в истлевшую ткань.',
    options: [{ id: 'take', label: 'Взять камень.', effect: 'take-oath-stone' }]
  },
  'altar-fail': {
    id: 'altar-fail',
    speaker: 'КАПЕЛЛА',
    text: 'Камень не поддаётся. На коже остаётся белая пыль, а в щели чувствуется холодный воздух.',
    options: [
      { id: 'bare-hand', label: 'Снять перчатку и провести пальцами по краю.', next: 'altar-success' },
      { id: 'leave', label: 'Отойти.' }
    ]
  },
  sarcophagus: {
    id: 'sarcophagus',
    speaker: 'КРИПТА',
    text: 'Крышку уже сдвигали. Внутри нет тела — только сложенное письмо и след от мокрой босой ступни.',
    options: [
      { id: 'take-letter', label: 'Забрать письмо.', effect: 'take-letter' },
      { id: 'trace', label: '[Проницательность] Осмотреть след.', next: 'trace', skill: 'insight', difficulty: 12, checkId: 'barefoot-trace' },
      { id: 'leave', label: 'Закрыть крышку.' }
    ]
  },
  trace: {
    id: 'trace',
    speaker: 'КРИПТА',
    text: 'След поверх пыли. Человек прошёл здесь совсем недавно и не возвращался назад.',
    options: [{ id: 'remember', label: 'Запомнить направление.', effect: 'mark-barefoot' }]
  },
  echo: {
    id: 'echo',
    speaker: 'НЕИЗВЕСТНЫЙ ГОЛОС',
    text: 'Имя приходит не как звук. Оно уже было у тебя во рту: Элин.',
    options: [
      { id: 'ask', label: '«Кто ты?»', next: 'echo-answer' },
      { id: 'resist', label: '[Воля] Не отвечать.', next: 'echo-silence', failNext: 'echo-answer', skill: 'will', difficulty: 14, checkId: 'elin-will' },
      { id: 'name', label: 'Назвать своё имя.', effect: 'gave-name' }
    ]
  },
  'echo-answer': {
    id: 'echo-answer',
    speaker: 'ЭЛИН',
    text: 'Никто не отвечает. Но за дверью башни кто-то медленно переносит вес с одной ноги на другую.',
    options: [{ id: 'close', label: 'Слушать.' }]
  },
  'echo-silence': {
    id: 'echo-silence',
    speaker: '—',
    text: 'Ты не отвечаешь. Шёпот отступает первым.',
    options: [{ id: 'close', label: 'Идти дальше.', effect: 'kept-silence' }]
  }
};

export const RITUAL_LINES = [
  'ТЫ ПРИНЯЛ КЛЯТВУ.',
  'ТЫ ПРИНЯЛ БОЛЬ.',
  'НО ТРЕТЬЕ ТЫ ОТВЕРГ.',
  'ПОКА.'
];

export const ZONES = [
  { id: 'chapel', name: 'КАПЕЛЛА', kicker: 'НИЖНИЙ ПРИХОД', minY: 1650, maxY: 2290 },
  { id: 'passage', name: 'СКРЫТЫЙ ПРОХОД', kicker: 'ПОД АЛТАРЁМ', minY: 1440, maxY: 1650 },
  { id: 'crypt', name: 'КРИПТА', kicker: 'НИЖЕ ФУНДАМЕНТА', minY: 1010, maxY: 1440 },
  { id: 'descent', name: 'НИЖНИЙ СПУСК', kicker: 'ВОЗДУХ ХОЛОДНЕЕТ', minY: 850, maxY: 1010 },
  { id: 'hall', name: 'ЗАЛ КЛЯТВ', kicker: 'ТРИ ПЬЕДЕСТАЛА', minY: 330, maxY: 850 },
  { id: 'tower', name: 'СТАРАЯ БАШНЯ', kicker: 'ЗА ДВЕРЬЮ', minY: 80, maxY: 330 }
] as const;
