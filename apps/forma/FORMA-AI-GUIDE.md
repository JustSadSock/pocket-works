# FormaCode 1 — памятка для нейросети

FormaCode — декларативный JSON-язык приложения FORMA. Он описывает 3D-модель безопасными примитивами и операциями, не исполняет JavaScript и экспортируется в STL, цветной 3MF, OBJ и GLB.

## Координаты и печать

- Все размеры в миллиметрах.
- Ось Z направлена вверх; печатная платформа находится на `z = 0`.
- `rotation` задаётся в градусах `[X, Y, Z]`.
- Отдельно печатаемые или цветные элементы должны быть отдельными объектами `parts`.
- Для FDM без особых требований не делай стенки тоньше 1.2 мм.
- Подвижная посадка обычно требует 0.2–0.35 мм зазора на сторону.
- Отверстия стоит увеличивать на 0.15–0.3 мм относительно номинала.

## Корень документа

```json
{
  "format": "formacode-1",
  "name": "Название модели",
  "units": "mm",
  "settings": { "detail": 52, "margin": 2 },
  "parts": [
    {
      "id": "body",
      "name": "Корпус",
      "color": "#d7d3c8",
      "node": { "type": "roundedBox", "size": [40, 20, 8], "radius": 2, "position": [0, 0, 4] }
    }
  ]
}
```

## Примитивы

```json
{"type":"sphere","radius":10}
{"type":"box","size":[20,30,8]}
{"type":"roundedBox","size":[20,30,8],"radius":2}
{"type":"cylinder","radius":8,"height":20,"axis":"z"}
{"type":"torus","majorRadius":12,"minorRadius":3,"axis":"z"}
{"type":"capsule","radius":4,"length":20,"axis":"z"}
{"type":"extrudePolygon","height":8,"points":[[-10,-5],[10,-5],[10,5],[-10,5]]}
{"type":"lathe","profile":[[0,0],[12,0],[10,20],[0,20]]}
```

Любой узел может иметь:

```json
"position": [x,y,z],
"rotation": [xDegrees,yDegrees,zDegrees],
"scale": [x,y,z]
```

## Операции

```json
{"type":"union","children":[{...},{...}]}
{"type":"subtract","children":[{"...":"основа"},{"...":"вырез"}]}
{"type":"intersect","children":[{...},{...}]}
{"type":"smoothUnion","radius":2,"children":[{...},{...}]}
```

В `subtract` первый элемент — основа, все следующие вычитаются.

## Повторы и симметрия

```json
{"type":"array","count":4,"step":[10,0,0],"centered":true,"child":{...}}
{"type":"radialArray","count":8,"axis":"z","child":{...}}
{"type":"mirror","axes":["x","y"],"child":{...}}
```

## Мастер-промт

Скопируй этот блок в любую нейросеть и допиши задачу в последней строке:

```text
Ты создаёшь готовую к 3D-печати модель в формате FormaCode 1.
Верни ТОЛЬКО один JSON-объект без пояснений, Markdown и исполняемого JavaScript.

Обязательный корень:
{
  "format": "formacode-1",
  "name": "Название",
  "units": "mm",
  "settings": { "detail": 52, "margin": 2 },
  "parts": [
    { "id": "part-id", "name": "Название детали", "color": "#RRGGBB", "node": { ... } }
  ]
}

Все размеры в миллиметрах. Ось Z — вверх, стол — z=0. Каждая отдельная или цветная деталь — отдельный элемент parts. Используй union, subtract, intersect, smoothUnion, примитивы sphere, box, roundedBox, cylinder, torus, capsule, extrudePolygon, lathe, а также array, radialArray и mirror. Не делай стенки тоньше 1.2 мм без прямого запроса. Для FDM используй зазор 0.2–0.35 мм на сторону. Старайся минимизировать поддержки.

Сделай модель: [ОПИШИ МОДЕЛЬ, РАЗМЕРЫ, ОТВЕРСТИЯ, ПРИНТЕР И МАТЕРИАЛ].
```
