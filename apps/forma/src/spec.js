export const DEFAULT_DOCUMENT = {
  format: 'formacode-1',
  name: 'Орбитальный жетон',
  author: 'FORMA starter',
  notes: 'Демонстрация многокомпонентной модели: основа, кольцо и центральная вставка.',
  settings: { detail: 44, margin: 2 },
  parts: [
    {
      id: 'body', name: 'Корпус', color: '#d7d3c8',
      node: {
        type: 'subtract',
        children: [
          { type: 'roundedBox', size: [58, 38, 5], radius: 6, position: [0, 0, 2.5] },
          { type: 'cylinder', radius: 12.4, height: 8, axis: 'z', position: [0, 0, 2.5] },
          { type: 'cylinder', radius: 3.2, height: 8, axis: 'z', position: [-20, 0, 2.5] }
        ]
      }
    },
    {
      id: 'ring', name: 'Орбитальное кольцо', color: '#e46f3f',
      node: {
        type: 'subtract',
        children: [
          { type: 'cylinder', radius: 11.7, height: 4.2, axis: 'z', position: [0, 0, 2.1] },
          { type: 'cylinder', radius: 7.2, height: 7, axis: 'z', position: [0, 0, 2.1] }
        ]
      }
    },
    {
      id: 'core', name: 'Центр', color: '#294f53',
      node: {
        type: 'smoothUnion', radius: 1.2,
        children: [
          { type: 'cylinder', radius: 6.6, height: 4, axis: 'z', position: [0, 0, 2] },
          { type: 'radialArray', count: 6, child: { type: 'sphere', radius: 1.8, position: [5.2, 0, 4.1] } }
        ]
      }
    }
  ]
};

export const EXAMPLES = {
  token: DEFAULT_DOCUMENT,
  knob: {
    format:'formacode-1',name:'Ручка регулятора',settings:{detail:52,margin:2},parts:[
      {id:'knob',name:'Ручка',color:'#cc7051',node:{type:'subtract',children:[
        {type:'union',children:[
          {type:'cylinder',radius:16,height:18,axis:'z',position:[0,0,9]},
          {type:'radialArray',count:24,child:{type:'roundedBox',size:[3.2,5,16],radius:1,position:[15.2,0,9]}}
        ]},
        {type:'cylinder',radius:3.15,height:14,axis:'z',position:[0,0,4]},
        {type:'roundedBox',size:[1.2,7,7],radius:.4,position:[2.6,0,4]}
      ]}}
    ]
  },
  bracket: {
    format:'formacode-1',name:'Угловой кронштейн',settings:{detail:56,margin:2},parts:[
      {id:'bracket',name:'Кронштейн',color:'#687d7a',node:{type:'subtract',children:[
        {type:'union',children:[
          {type:'roundedBox',size:[60,24,6],radius:2,position:[0,0,3]},
          {type:'roundedBox',size:[6,24,44],radius:2,position:[-27,0,22]},
          {type:'extrudePolygon',height:12,rotation:[90,0,0],position:[-13,0,16],points:[[-14,-13],[14,-13],[-14,13]]}
        ]},
        {type:'array',count:2,step:[34,0,0],child:{type:'cylinder',radius:3.4,height:10,axis:'z',position:[0,0,3]}},
        {type:'array',count:2,step:[0,0,22],child:{type:'cylinder',radius:3.4,height:10,axis:'x',position:[-27,0,16]}}
      ]}}
    ]
  }
};

export const AI_PROMPT = `Ты создаёшь готовую к 3D-печати модель в формате FormaCode 1.
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

Правила:
- Все размеры в миллиметрах. Ось Z — вверх, печатная платформа находится на z=0.
- Каждая физически отдельная или цветная деталь должна быть отдельным элементом parts.
- Не создавай толщину стенки меньше 1.2 мм без прямого запроса.
- Для посадок: зазор 0.2–0.35 мм на сторону для FDM; отверстия делай немного больше номинала.
- Старайся ставить модель на платформу и минимизировать поддержки.
- Используй симметрию, array и radialArray вместо огромного повторения одинаковых узлов.
- Операции: union, subtract, intersect, smoothUnion. В subtract первый child — основа, остальные вычитаются.
- Любой узел может иметь position:[x,y,z], rotation:[x,y,z] в градусах, scale:[x,y,z] или число.

Примитивы:
1) sphere: {"type":"sphere","radius":10}
2) box: {"type":"box","size":[x,y,z]}
3) roundedBox: {"type":"roundedBox","size":[x,y,z],"radius":2}
4) cylinder: {"type":"cylinder","radius":8,"height":20,"axis":"z"}
5) torus: {"type":"torus","majorRadius":12,"minorRadius":3,"axis":"z"}
6) capsule: {"type":"capsule","radius":4,"length":20,"axis":"z"}
7) extrudePolygon: {"type":"extrudePolygon","height":8,"points":[[x,y],...]}
8) lathe: профиль [радиус,z], вращается вокруг Z:
   {"type":"lathe","profile":[[0,0],[12,0],[10,20],[0,20]]}

Повторы:
- linear: {"type":"array","count":4,"step":[10,0,0],"centered":true,"child":{...}}
- radial: {"type":"radialArray","count":8,"axis":"z","child":{...}}
- mirror: {"type":"mirror","axes":["x","y"],"child":{...}}

Сделай модель: [ОПИШИ ЗДЕСЬ НУЖНУЮ МОДЕЛЬ, РАЗМЕРЫ, НАЗНАЧЕНИЕ, ПРИНТЕР И МАТЕРИАЛ].`;

export const GUIDE_MARKDOWN = `# FormaCode 1 — памятка для нейросети

FormaCode — декларативный JSON-язык для генерации печатных 3D-моделей в приложении FORMA. Он не исполняет произвольный код, поэтому результат можно безопасно импортировать.

## Координаты
- Единицы: миллиметры.
- Z направлена вверх.
- Платформа печати: z = 0.
- rotation задаётся в градусах [X,Y,Z].

## Документ
\`\`\`json
${JSON.stringify(DEFAULT_DOCUMENT, null, 2)}
\`\`\`

## Узлы
Поддерживаются sphere, box, roundedBox, cylinder, torus, capsule, extrudePolygon, lathe, union, subtract, intersect, smoothUnion, array, radialArray и mirror.

## Практика FDM
- Минимальная стенка по умолчанию: 1.2 мм.
- Подвижная посадка: 0.25–0.4 мм суммарного зазора.
- Плотная посадка: 0.1–0.2 мм суммарного зазора.
- Отверстия обычно печатаются меньше, поэтому добавляй 0.15–0.3 мм к диаметру.
- Разделяй цветные или отдельно печатаемые элементы в разные parts.
- Не оставляй детали висящими в воздухе без основания, если это не задумано.

## Стартовый промт
${AI_PROMPT}
`;
