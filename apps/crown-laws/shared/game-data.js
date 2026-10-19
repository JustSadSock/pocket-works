export const BOARD_WIDTH = 5;
export const BOARD_HEIGHT = 7;
export const THRONE = { x: 2, y: 3 };
export const SLOT_TYPES = ["champion", "guard", "beast", "priest", "thief"];
export const PLAYER_ORDER = ["p1", "p2"];

export const SLOT_LABELS = {
  champion: "Закон Чемпионов",
  guard: "Закон Стражника",
  beast: "Закон Зверя",
  priest: "Закон Жреца",
  thief: "Закон Вора"
};

export const SLOT_COLORS = {
  champion: "#41674a",
  guard: "#70282d",
  beast: "#88512b",
  priest: "#25446c",
  thief: "#4b2d5e"
};

export const BASE_LAWS = {
  champion: {
    id: "base-champion-path",
    slot: "champion",
    name: "Путь к Трону",
    description: "Оба чемпиона идут на 1 клетку к трону кратчайшим безопасным путем. Чемпион на троне остается. Оглушенный чемпион не двигается."
  },
  guard: {
    id: "base-guard-crown",
    slot: "guard",
    name: "Страж Короны",
    description: "Стражник патрулирует 8 клеток вокруг трона. Если рядом есть чемпион, Стражник отталкивает его на 1 клетку."
  },
  beast: {
    id: "base-beast-motion",
    slot: "beast",
    name: "Зверь Чует Движение",
    description: "Зверь идет к ближайшей фигуре, которая двигалась в этом ходу. Рядом с целью атакует. Чемпионов оглушает."
  },
  priest: {
    id: "base-priest-mercy",
    slot: "priest",
    name: "Милость Слабому",
    description: "Жрец идет к чемпиону с меньшим количеством активных корон. Рядом дает Щит."
  },
  thief: {
    id: "base-thief-leader",
    slot: "thief",
    name: "Вор Идет за Лидером",
    description: "Вор идет к лидеру, крадет печать активной короны и несет ее к краю поля."
  }
};

export const LAW_CARDS = [
  {
    id: "champion-cautious-step",
    slot: "champion",
    name: "Осторожный Шаг",
    description: "Чемпионы идут к трону, избегая клеток рядом со Стражником и Зверем, если есть другой путь.",
    accent: "champion",
    icon: "path"
  },
  {
    id: "champion-claimant-surge",
    slot: "champion",
    name: "Рывок Претендента",
    description: "Чемпион с меньшим числом активных корон идет на 2 клетки к трону. При равенстве оба идут по базовому закону.",
    accent: "champion",
    icon: "sprint"
  },
  {
    id: "champion-hold-center",
    slot: "champion",
    name: "Удержать Центр",
    description: "Чемпион на троне или рядом с троном не двигается. Второй чемпион идет по обычному правилу.",
    accent: "champion",
    icon: "center"
  },
  {
    id: "champion-intercept-thief",
    slot: "champion",
    name: "Перехват Вора",
    description: "Если Вор несет печать, владелец идет к Вору. Рядом с владельцем печать возвращается. Иначе оба идут к трону.",
    accent: "champion",
    icon: "intercept"
  },
  {
    id: "champion-heirs-duel",
    slot: "champion",
    name: "Дуэль Наследников",
    description: "После движения, если чемпионы стоят рядом, чемпион с меньшим числом активных корон отталкивает второго на 1 клетку.",
    accent: "champion",
    icon: "duel"
  },
  {
    id: "guard-spear-throne",
    slot: "guard",
    name: "Копье у Трона",
    description: "Стражник не патрулирует. Он атакует чемпиона на троне или рядом с троном.",
    accent: "guard",
    icon: "spear"
  },
  {
    id: "guard-punish-leader",
    slot: "guard",
    name: "Кара Лидера",
    description: "Стражник предпочитает чемпиона с большим числом активных корон. Если лидер не рядом, движется на перехват.",
    accent: "guard",
    icon: "leader"
  },
  {
    id: "guard-thief-hunter",
    slot: "guard",
    name: "Ловец Вора",
    description: "Если Вор несет печать, Стражник идет к нему. Рядом с Вором Вор роняет печать.",
    accent: "guard",
    icon: "hunter"
  },
  {
    id: "guard-living-wall",
    slot: "guard",
    name: "Живая Стена",
    description: "Стражник пытается занять клетку между ближайшим чемпионом и троном. Иначе патрулирует обычно.",
    accent: "guard",
    icon: "wall"
  },
  {
    id: "guard-circle-spears",
    slot: "guard",
    name: "Круг Копий",
    description: "Стражник отталкивает всех соседних чемпионов и не двигается.",
    accent: "guard",
    icon: "circle"
  },
  {
    id: "beast-crown-scent",
    slot: "beast",
    name: "Запах Короны",
    description: "Зверь идет к чемпиону с большим числом активных корон. Рядом атакует.",
    accent: "beast",
    icon: "crown"
  },
  {
    id: "beast-noise-hunt",
    slot: "beast",
    name: "Охота на Шум",
    description: "Зверь идет к ближайшей фигуре, которую в этом ходу оттолкнули. Если такой нет, действует по базовому правилу.",
    accent: "beast",
    icon: "noise"
  },
  {
    id: "beast-hungry-surge",
    slot: "beast",
    name: "Голодный Рывок",
    description: "Зверь идет на 2 клетки к цели. Если атаковал, в следующем ходу не движется и только атакует, если цель рядом.",
    accent: "beast",
    icon: "charge"
  },
  {
    id: "beast-throne-prowl",
    slot: "beast",
    name: "Зверь у Трона",
    description: "Зверь идет к трону. Если рядом с троном есть чемпион, Зверь атакует его.",
    accent: "beast",
    icon: "throne"
  },
  {
    id: "beast-sense-shield",
    slot: "beast",
    name: "Зверь Чует Щит",
    description: "Зверь предпочитает чемпиона со Щитом. Щит ломается, чемпион отталкивается, но не оглушается.",
    accent: "beast",
    icon: "shield"
  },
  {
    id: "priest-remove-stun",
    slot: "priest",
    name: "Снять Оглушение",
    description: "Жрец идет к ближайшему оглушенному чемпиону. Рядом снимает Оглушение. Иначе действует по базовому правилу.",
    accent: "priest",
    icon: "purify"
  },
  {
    id: "priest-holy-zone",
    slot: "priest",
    name: "Святая Зона",
    description: "Жрец действует как обычно, а клетки рядом с ним защищают чемпионов от Оглушения. Отталкивание работает.",
    accent: "priest",
    icon: "zone"
  },
  {
    id: "priest-throne-blessing",
    slot: "priest",
    name: "Благословение Трона",
    description: "Жрец действует как обычно. Если чемпион со Щитом стоит на троне, первый удар по нему лишь ломает Щит и не отталкивает.",
    accent: "priest",
    icon: "blessing"
  },
  {
    id: "priest-equal-mercy",
    slot: "priest",
    name: "Равная Милость",
    description: "Жрец идет к чемпиону, который ближе к Зверю или Стражнику, независимо от числа корон. Рядом дает Щит.",
    accent: "priest",
    icon: "equal"
  },
  {
    id: "priest-anti-theft",
    slot: "priest",
    name: "Оберег от Кражи",
    description: "Если Вор несет печать, Жрец идет к владельцу украденной короны. Рядом с владельцем возвращает печать в конце хода.",
    accent: "priest",
    icon: "ward"
  },
  {
    id: "thief-pickpocket",
    slot: "thief",
    name: "Карманник",
    description: "Вор идет к ближайшему чемпиону, а не к лидеру. Рядом крадет печать, если у цели есть активная корона.",
    accent: "thief",
    icon: "pocket"
  },
  {
    id: "thief-secret-pocket",
    slot: "thief",
    name: "Тайный Карман",
    description: "Если Вор рядом с чемпионом без активных корон, он накладывает Саботаж на следующую полученную корону.",
    accent: "thief",
    icon: "sabotage"
  },
  {
    id: "thief-shadow-run",
    slot: "thief",
    name: "Бег по Теням",
    description: "Если Вор несет печать, он идет на 2 клетки к краю. Если после движения оказался рядом с любым чемпионом, печать падает.",
    accent: "thief",
    icon: "shadow"
  },
  {
    id: "thief-fear-guard",
    slot: "thief",
    name: "Вор Боится Стражи",
    description: "Вор избегает клеток рядом со Стражником. Если безопасного пути нет, не двигается.",
    accent: "thief",
    icon: "avoid"
  },
  {
    id: "thief-false-prey",
    slot: "thief",
    name: "Ложная Добыча",
    description: "Если рядом с лидером есть второй чемпион, Вор вместо кражи на 1 ход переворачивает приоритет лидера и отстающего.",
    accent: "thief",
    icon: "flip"
  }
];

export const CARD_BY_ID = Object.fromEntries(LAW_CARDS.map((card) => [card.id, card]));

export const STARTING_PIECES = {
  champion_p1: {
    id: "champion_p1",
    kind: "champion",
    owner: "p1",
    x: 2,
    y: 6,
    shield: false,
    stun: 0,
    sabotage: false
  },
  champion_p2: {
    id: "champion_p2",
    kind: "champion",
    owner: "p2",
    x: 2,
    y: 0,
    shield: false,
    stun: 0,
    sabotage: false
  },
  guard: {
    id: "guard",
    kind: "guard",
    owner: "neutral",
    x: 2,
    y: 2
  },
  priest: {
    id: "priest",
    kind: "priest",
    owner: "neutral",
    x: 0,
    y: 3
  },
  thief: {
    id: "thief",
    kind: "thief",
    owner: "neutral",
    x: 4,
    y: 3,
    carryingSeal: null
  },
  beast: {
    id: "beast",
    kind: "beast",
    owner: "neutral",
    x: 2,
    y: 5
  }
};

export const GUARD_PATROL = [
  { x: 2, y: 2 },
  { x: 3, y: 2 },
  { x: 3, y: 3 },
  { x: 3, y: 4 },
  { x: 2, y: 4 },
  { x: 1, y: 4 },
  { x: 1, y: 3 },
  { x: 1, y: 2 }
];

export const AI_PROFILES = {
  contender: {
    id: "contender",
    name: "Претендент",
    description: "Агрессивнее усиливает чемпионов и гонится за троном."
  },
  steward: {
    id: "steward",
    name: "Страж Власти",
    description: "Больше играет через Стражника и Жреца."
  },
  hunter: {
    id: "hunter",
    name: "Ловчий",
    description: "Любит давление Зверем и Вором."
  },
  controller: {
    id: "controller",
    name: "Контролер",
    description: "Предпочитает ломать ритм и сбрасывать неудобные активные законы."
  }
};

export const RULES_TEXT = [
  "Каждый ход оба игрока скрытно выбирают одну карту закона из руки.",
  "Если оба игрока сыграли в один слот, возникает конфликт: обе карты и текущий активный закон сбрасываются, слот возвращается к базовому закону.",
  "Порядок фаз: розыгрыш, конфликт, Жрец, Чемпионы, Стражник, Зверь, Вор, проверка трона, добор.",
  "Чемпион получает корону на троне в конце хода, если он не оглушен, а трон не занят нейтральной фигурой.",
  "Щит отменяет обычный толчок Чемпиона или Стражника. Против Зверя Щит ломается, защищает от оглушения, но не от толчка.",
  "Вор крадет печать активной короны у лидера, а если донесет ее до края поля - корона потеряна окончательно."
];

export function crownVisual(player) {
  const active = Array.from({ length: player.activeCrowns }, () => "C");
  const sealed = Array.from({ length: player.sealedCrowns }, () => "S");
  const lost = Array.from({ length: player.lostCrowns }, () => "X");
  return [...active, ...sealed, ...lost].join("");
}
