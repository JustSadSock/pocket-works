# FORMA Blueprint 1 — памятка для нейросети

## Почему изменился подход

Нейросеть больше не должна вручную собирать механизм из десятков `box`, `cylinder` и `subtract`. Такой JSON может быть синтаксически правильным, но механически бессмысленным: пересечения, неправильные оси, случайные зазоры и декоративные «шестерни», которые не сцепляются.

Теперь поток двухступенчатый:

1. AI возвращает короткий **FormaBlueprint 1**: типы деталей, размеры, роли и связи.
2. FORMA детерминированно рассчитывает зубья, межосевые расстояния, посадки, корпус и крышку, затем создаёт обычную печатную геометрию.

Старый `formacode-1` остаётся расширенным режимом для ручной CSG-геометрии.

## Корень

```json
{
  "format": "forma-blueprint-1",
  "name": "Название модели",
  "units": "mm",
  "print": { "nozzle": 0.4, "clearance": 0.28, "minWall": 1.6 },
  "settings": { "detail": 58, "margin": 2 },
  "parts": [],
  "constraints": []
}
```

## Библиотечные детали

- `spurGear`: `teeth`, `module`, `thickness`, `bore`, `hubDiameter`, `lighteningHoles`.
- `gearboxFrame`: `gears`, `expose`, `wall`, `baseThickness`, `coverThickness`, `axialClearance`.
- `flywheel`: `diameter`, `thickness`, `bore`, `rimWidth`, `spokes`.
- `plate` / `box`: `size`, `radius`, `features` (`hole`, `slot`, `rib`).
- `cylinder` / `axle`: `diameter` или `radius`, `height`, `axis`.
- `tube`: `outerDiameter`, `innerDiameter`, `height`.
- `knob`: `diameter`, `height`, `bore`, `grips`.
- `custom` с низкоуровневым `node` — только когда библиотечного вида действительно нет.

## Связи

```json
{"type":"gearMesh","a":"driver","b":"driven","angle":0,"clearance":0.25}
{"type":"coaxial","a":"axle","b":"cap"}
{"type":"offset","a":"part-a","b":"part-b","offset":[20,0,0]}
{"type":"align","a":"part-a","b":"part-b","axes":"xy"}
```

Для `gearMesh` не вычисляй позицию второй шестерни: FORMA сама использует модуль, число зубьев и зазор.

## Рабочий пример

```json
{
  "format": "forma-blueprint-1",
  "name": "Pocket Gearfly Fidget",
  "print": { "nozzle": 0.4, "clearance": 0.28, "minWall": 1.6 },
  "settings": { "detail": 58, "margin": 2 },
  "parts": [
    {
      "id": "flywheel",
      "name": "Маховик",
      "kind": "spurGear",
      "teeth": 28,
      "module": 1.05,
      "thickness": 5.2,
      "bore": 4.6,
      "hubDiameter": 9,
      "lighteningHoles": { "count": 6, "diameter": 4.2 },
      "color": "#d2a34b",
      "moving": true
    },
    {
      "id": "thumb",
      "name": "Привод большим пальцем",
      "kind": "spurGear",
      "teeth": 10,
      "module": 1.05,
      "thickness": 5.2,
      "bore": 3.6,
      "hubDiameter": 7.2,
      "color": "#e46f3f",
      "moving": true
    },
    {
      "id": "frame",
      "name": "Карманный корпус",
      "kind": "gearboxFrame",
      "gears": ["flywheel", "thumb"],
      "expose": ["thumb"],
      "wall": 2.4,
      "baseThickness": 2.2,
      "coverThickness": 2,
      "axialClearance": 0.3,
      "color": "#294f53"
    }
  ],
  "constraints": [
    { "type": "gearMesh", "a": "thumb", "b": "flywheel", "angle": 180, "clearance": 0.25 }
  ]
}
```

Компилятор сам создаст четыре печатные детали: две зацепленные шестерни, основание с осями и съёмную крышку. Для этой пары он рассчитает отношение 2.8:1.

## Мастер-промт

```text
Ты создаёшь не полигональную модель, а инженерный FormaBlueprint 1 для приложения FORMA. Верни ТОЛЬКО один JSON-объект без Markdown.

Корень: {"format":"forma-blueprint-1","name":"...","print":{"clearance":0.28,"minWall":1.6,"nozzle":0.4},"parts":[...],"constraints":[...]}.

Разрешённые kind: spurGear, flywheel, plate, box, cylinder, tube, axle, knob, gearboxFrame, custom. Для шестерён указывай teeth, module, thickness, bore. Для gearboxFrame указывай gears:[id,...] и expose:[id,...]. Связи: gearMesh, coaxial, offset, align.

НЕ создавай зубья, оси и корпус вручную через примитивы — FORMA рассчитывает их сама. Каждая физически отдельная или цветная деталь имеет свой id. Не оставляй TODO.

Опиши модель: [НАЗНАЧЕНИЕ, ДВИЖЕНИЕ, ГАБАРИТЫ, ПРИНТЕР И МАТЕРИАЛ].
```

## Исправление

Если Blueprint противоречив, FORMA прекращает сборку, показывает точные ошибки и создаёт **repair-пакет**. Его нужно отправить нейронке целиком: она исправляет высокоуровневый Blueprint, а не переписывает низкоуровневую геометрию.
