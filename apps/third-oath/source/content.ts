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
  sunLetter: { id: 'sun-letter', name: 'Письмо с печатью', note: 'Солнце, пробитое стрелой. Подпись выскоблена ножом.' },
  bellClapper: { id: 'bell-clapper', name: 'Язык колокола', note: 'Тяжёлое железо. На ударной грани выцарапаны десятки имён.' },
  archiveLeaf: { id: 'archive-leaf', name: 'Лист реестра', note: 'Смотрители Рассвета научились вырезать отдельное имя, не разрушая всю клятву.' },
  sealShard: { id: 'seal-shard', name: 'Осколок печати', note: 'Холодный камень из башенной печати. После боя он больше не шепчет.' }
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

  'tower-name': {
    id: 'tower-name',
    speaker: 'ЭЛИН',
    text: '«Ты всё-таки поднялся. Имя, которое ты отдал внизу, уже успели записать выше.» Голос идёт из камня, не из комнаты.',
    options: [{ id: 'answer', label: '«Тогда покажи, где его держат.»', effect: 'enter-tower' }]
  },
  'tower-silence': {
    id: 'tower-silence',
    speaker: 'ЭЛИН',
    text: '«Хорошо. Ты умеешь не отвечать, когда башня просит имя. Это пригодится.» Выше один раз ударяет колокол без языка.',
    options: [{ id: 'go', label: 'Подняться на звук.', effect: 'enter-tower' }]
  },
  'tower-neutral': {
    id: 'tower-neutral',
    speaker: 'ЭЛИН',
    text: '«Башня записывает не слова. Она записывает того, кто их произносит.» Следы босых ног уходят вверх.',
    options: [{ id: 'follow', label: 'Идти по следам.', effect: 'enter-tower' }]
  },
  archive: {
    id: 'archive',
    speaker: 'АРХИВ',
    text: 'Кожаные корешки срезаны ножом. В каждом реестре одна и та же третья строка: «Я отдаю имя, чтобы клятва пережила меня».',
    options: [
      { id: 'letter', label: 'Сопоставить печать солнца и стрелы с пометками на полях.', next: 'archive-letter', requiresItem: 'sun-letter' },
      { id: 'clapper', label: 'Сверить имена на языке колокола с пустыми строками.', next: 'archive-clapper', requiresItem: 'bell-clapper' },
      { id: 'insight', label: '[Проницательность] Восстановить порядок выскобленных записей.', next: 'archive-insight', failNext: 'archive-fail', skill: 'insight', difficulty: 15, checkId: 'archive-order' },
      { id: 'leave', label: 'Оставить реестры как есть.' }
    ]
  },
  'archive-letter': {
    id: 'archive-letter',
    speaker: 'АРХИВ',
    text: 'Печать принадлежала Смотрителям Рассвета. Они не пытались уничтожить клятву — они научились вырезать из неё одно имя, не обрушивая остальные.',
    options: [{ id: 'take', label: 'Вырезать страницу с их методом.', effect: 'take-archive-leaf' }]
  },
  'archive-clapper': {
    id: 'archive-clapper',
    speaker: 'АРХИВ',
    text: 'Имена на железе совпадают с пустыми строками. Колокол не созывал рыцарей — он подтверждал, что башня уже забрала очередное имя.',
    options: [{ id: 'understand', label: 'Разомкнуть верхнюю печать по последовательности имён.', effect: 'learn-archive-truth' }]
  },
  'archive-insight': {
    id: 'archive-insight',
    speaker: 'АРХИВ',
    text: 'Записи шли не по годам, а по именам. Пустые строки — люди, которых башня уже забрала. Третью клятву принимали именно здесь.',
    options: [{ id: 'remember', label: 'Запомнить устройство печати.', effect: 'learn-archive-truth' }]
  },
  'archive-fail': {
    id: 'archive-fail',
    speaker: 'АРХИВ',
    text: 'Чернила слишком старые, а нож работал слишком тщательно. Остаётся только смысл третьей строки и грубая схема замка на обороте.',
    options: [{ id: 'force', label: 'Использовать схему, чтобы открыть верхний проход.', effect: 'learn-archive-basic' }]
  },
  'elin-meet-name': {
    id: 'elin-meet-name',
    speaker: 'ЭЛИН',
    text: 'За печатью стоит босая фигура в сером. «Ты назвался мне. Поэтому я могу найти тебя даже здесь. Не делай этого второй раз.»',
    options: [{ id: 'truth', label: '«Зачем тебе реестр?»', next: 'elin-truth' }]
  },
  'elin-meet-silent': {
    id: 'elin-meet-silent',
    speaker: 'ЭЛИН',
    text: 'За печатью стоит босая фигура в сером. «Ты промолчал внизу. Значит, понимаешь хотя бы половину того, что здесь делают с именами.»',
    options: [{ id: 'truth', label: '«Объясни вторую половину.»', next: 'elin-truth' }]
  },
  'elin-meet-neutral': {
    id: 'elin-meet-neutral',
    speaker: 'ЭЛИН',
    text: 'За печатью стоит босая фигура в сером. На запястье — выжженное пустое место, где должна быть надпись.',
    options: [{ id: 'truth', label: '«Ты тоже отказался от третьей клятвы?»', next: 'elin-truth' }]
  },
  'elin-truth': {
    id: 'elin-truth',
    speaker: 'ЭЛИН',
    text: '«Да. Первая связывает поступок. Вторая — боль. Третья делает человека расходным материалом. Когда имя отдано, клятву можно носить дальше уже без тебя.»',
    options: [
      { id: 'break', label: '[Воля] Разбить печать и выпустить все имена.', effect: 'choose-break', skill: 'will', difficulty: 14, checkId: 'break-seal-will', failNext: 'elin-break-cost' },
      { id: 'bind', label: 'Укрепить печать. Клятва опасна, но хаос опаснее.', effect: 'choose-bind' },
      { id: 'cut', label: 'Использовать метод Смотрителей: вырезать только связанные с вами имена.', effect: 'choose-cut', requiresItem: 'archive-leaf' }
    ]
  },
  'elin-break-cost': {
    id: 'elin-break-cost',
    speaker: 'ЭЛИН',
    text: 'Печать не ломается от одного желания. Камень отвечает ударом, и что-то тяжёлое просыпается по ту сторону.',
    options: [{ id: 'again', label: 'Не отступать.', effect: 'choose-break-costly' }]
  },
  'chapter2-break': {
    id: 'chapter2-break',
    speaker: 'ЭЛИН',
    text: 'Имена выходят из камня не голосами — коротким тёплым воздухом. На секунду башня становится просто старым зданием.',
    options: [{ id: 'finish', label: 'Оставить башню.', effect: 'finish-chapter2' }]
  },
  'chapter2-bind': {
    id: 'chapter2-bind',
    speaker: 'ЭЛИН',
    text: 'Печать снова замыкается. «Ты сохранил клетку. Возможно, однажды это окажется правильным решением.» Элин не благодарит.',
    options: [{ id: 'finish', label: 'Оставить башню.', effect: 'finish-chapter2' }]
  },
  'chapter2-cut': {
    id: 'chapter2-cut',
    speaker: 'ЭЛИН',
    text: 'Из реестра исчезают две строки. Остальные остаются. Элин долго смотрит на пустое место, где раньше было его имя.',
    options: [{ id: 'finish', label: 'Забрать осколок печати и уйти.', effect: 'finish-chapter2' }]
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
  { id: 'tower-threshold', name: 'СТАРАЯ БАШНЯ', kicker: 'ЗА ДВЕРЬЮ', minY: 80, maxY: 330 },
  { id: 'tower-vestibule', name: 'ПРИТВОР БАШНИ', kicker: 'СЛЕДЫ ВЕДУТ ВВЕРХ', minY: -280, maxY: 80 },
  { id: 'bell-floor', name: 'КОЛОКОЛЬНЫЙ ЯРУС', kicker: 'КОЛОКОЛ БЕЗ ЯЗЫКА', minY: -900, maxY: -280 },
  { id: 'archive', name: 'РЕЕСТР ИМЁН', kicker: 'ВЫСКОБЛЕННЫЕ СТРОКИ', minY: -1540, maxY: -900 },
  { id: 'seal-room', name: 'ПЕЧАТЬ', kicker: 'ТРЕТЬЯ КЛЯТВА', minY: -1880, maxY: -1540 }
] as const;
