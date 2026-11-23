// An intentionally schematic tactical reconstruction.
// Sequence is represented by ordinal phases, NOT invented hour/minute stamps.
// Formations are broad operational groupings, not individual regiments.
export const battleScenario = {
  id:'breitenfeld',
  title:'Брейтенфельд · 1631',
  subtitle:'Пять фаз сражения · 17 сентября 1631',
  index:'03',
  type:'battle',
  timeUnit:'phase',
  parentId:'war',
  intro:'Схема последовательности битвы при Брейтенфельде. Временная ось показывает фазы, а не часы. Положение и перемещение соединений условны; зафиксированы только общие направления действий.',
  disclaimer:'Учебная тактическая схема — не точная карта боя и не движения по минутам. Линии между кадрами являются приблизительной визуализацией.',
  range:[1,5],
  world:{width:1000,height:700},
  palette:{paper:'#e0d6bf',ink:'#383f39',water:'#769d9d',accent:'#a1523e'},
  sources:[
    {id:'cgsc',title:'U.S. Army Command and General Staff College · Battle of Breitenfeld study',url:'https://cgsc.contentdm.oclc.org/digital/api/collection/p15040coll2/id/6249/download'},
    {id:'histnet',title:'HistoryNet · Thirty Years War: Battle of Breitenfeld',url:'https://historynet.com/thirty-years-war-battle-of-breitenfeld/'},
    {id:'britannica',title:'Encyclopaedia Britannica (1911) · Breitenfeld',url:'https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Breitenfeld'}
  ],
  features:[
    {id:'northern-ridge',kind:'hill',x:490,y:158,rx:415,ry:75,rotation:-0.04,label:'ПОЗИЦИЯ ИМПЕРСКОЙ АРМИИ',from:1,confidence:'estimated'},
    {id:'southern-plain',kind:'region',x:510,y:510,rx:450,ry:170,rotation:0,label:'ШВЕДСКО-САКСОНСКИЙ ФРОНТ',from:1,confidence:'estimated'},
    {id:'left-gap',kind:'zone',x:288,y:394,rx:170,ry:108,rotation:-0.15,label:'УЧАСТОК ОТХОДА САКСОНЦЕВ',from:3,confidence:'estimated'}
  ],
  waterways:[],
  paths:[],
  entities:[
    {id:'tilly',type:'army',name:'Пехота Тилли',mapLabel:'Тилли',x:500,y:215,from:1,
      confidence:'estimated',sources:['cgsc','histnet','britannica'],
      description:'Основной центр войск императора и Католической лиги под общим командованием Иоганна Церкласа фон Тилли. Позиции на этой схеме условны.',
      current:'Расположение показывает изменение направления усилий имперского центра по фазам боя.',
      motion:{mode:'illustrative',confidence:'estimated',frames:[
        {time:1,x:500,y:215},{time:3,x:446,y:306},{time:4,x:445,y:327},{time:5,x:585,y:158}
      ]}},
    {id:'pappenheim',type:'army',name:'Кавалерия Паппенгейма',mapLabel:'Паппенгейм',x:761,y:211,from:1,
      confidence:'estimated',sources:['britannica','histnet'],
      description:'Имперская кавалерия под командованием Готфрида Генриха фон Паппенгейма атаковала шведское правое крыло и была отбита.',
      current:'В фазах боевых действий показаны атаки и последующий отход кавалерии. Траектория не является измеренным маршрутом.',
      motion:{mode:'illustrative',confidence:'estimated',frames:[
        {time:1,x:761,y:211},{time:2,x:702,y:328},{time:3,x:758,y:238},{time:4,x:784,y:172},{time:5,x:864,y:117}
      ]}},
    {id:'furstenberg',type:'army',name:'Кавалерия Фюрстенберга',mapLabel:'Фюрстенберг',x:220,y:214,from:1,
      confidence:'estimated',sources:['britannica','histnet'],
      description:'Правое крыло имперской кавалерии действовало против саксонских частей. Общий характер атаки подтверждён описаниями сражения.',
      current:'Условная стрелка отражает наступление имперского крыла к саксонцам.',
      motion:{mode:'illustrative',confidence:'estimated',frames:[
        {time:1,x:220,y:214},{time:2,x:232,y:281},{time:3,x:291,y:383},{time:4,x:320,y:358},{time:5,x:430,y:226}
      ]}},
    {id:'swedish-centre',type:'army',name:'Шведский центр',mapLabel:'Шведы · центр',x:560,y:490,from:1,
      confidence:'estimated',sources:['cgsc','histnet'],
      description:'Шведские бригады и пехотные подразделения в сравнительно гибких построениях. Здесь не показан недостоверно точный состав отдельных полков.',
      current:'Центр сохраняет боеспособность и участвует в перестроении и переходе в наступление.',
      motion:{mode:'illustrative',confidence:'estimated',frames:[
        {time:1,x:560,y:490},{time:2,x:572,y:476},{time:3,x:550,y:448},{time:4,x:535,y:382},{time:5,x:532,y:295}
      ]}},
    {id:'swedish-right',type:'army',name:'Шведское правое крыло',mapLabel:'Шведы · правые',x:730,y:486,from:1,
      confidence:'estimated',sources:['britannica','histnet'],
      description:'Правое крыло шведов отразило конные атаки Паппенгейма, после чего получило возможность участвовать в контратаке.',
      current:'Схематическая линия показывает оборону, а затем наступление правого крыла.',
      motion:{mode:'illustrative',confidence:'estimated',frames:[
        {time:1,x:730,y:486},{time:2,x:726,y:445},{time:3,x:745,y:402},{time:4,x:688,y:270},{time:5,x:598,y:204}
      ]}},
    {id:'horn',type:'army',name:'Шведское левое крыло · Горн',mapLabel:'Горн',x:427,y:494,from:1,
      confidence:'estimated',sources:['cgsc','histnet'],
      description:'Под командованием Густава Горна шведские силы смогли перестроить фронт после отхода союзных саксонцев.',
      current:'После ухода саксонцев шведский левый фланг отреагировал на изменение линии боя.',
      motion:{mode:'illustrative',confidence:'estimated',frames:[
        {time:1,x:427,y:494},{time:2,x:438,y:471},{time:3,x:419,y:427},{time:4,x:380,y:340},{time:5,x:451,y:291}
      ]}},
    {id:'saxons',type:'army',name:'Саксонские войска',mapLabel:'Саксонцы',x:252,y:487,from:1,
      confidence:'estimated',sources:['britannica','histnet'],
      description:'Саксонские союзные силы на левом фланге общего построения были обращены в бегство имперским наступлением.',
      current:'В третьей фазе реконструкция показывает отступление. Конкретные пути отхода неизвестны.',
      motion:{mode:'illustrative',confidence:'estimated',frames:[
        {time:1,x:252,y:487},{time:2,x:260,y:460},{time:3,x:125,y:605},{time:4,x:107,y:637},{time:5,x:105,y:646}
      ]}}
  ],
  events:[
    {id:'phase-1',time:1,title:'Войска занимают позиции',
      subtitle:'Шведы и саксонцы против армии Тилли',
      text:'17 сентября 1631 года войска Густава II Адольфа и саксонских союзников встретились с силами Тилли севернее Лейпцига. Схема показывает общую структуру боевого построения, а не точную сетку полков.',
      category:'РАССТАНОВКА',lane:'military',importance:3,confidence:'estimated',
      sources:['cgsc','britannica'],focus:[505,365]},
    {id:'phase-2',time:2,title:'Атаки Паппенгейма',
      subtitle:'Шведское правое крыло удерживает позицию',
      text:'Имперская кавалерия Паппенгейма неоднократно пыталась разгромить шведский правый фланг, но его оборона выдержала натиск. Показанные переходы между условными кадрами не описывают точный маршрут каждой атаки.',
      category:'КАВАЛЕРИЯ',lane:'military',importance:4,confidence:'estimated',
      sources:['britannica','histnet'],focus:[713,390],entity:'pappenheim'},
    {id:'phase-3',time:3,title:'Саксонцы отступают',
      subtitle:'На левом фланге союзников возникает разрыв',
      text:'Имперская атака выбила саксонцев из строя. Тилли попытался развить успех и ударить по шведским силам, однако те сохранили управляемость.',
      category:'ПЕРЕЛОМ',lane:'military',importance:5,confidence:'estimated',
      sources:['cgsc','histnet'],focus:[308,420],entity:'saxons'},
    {id:'phase-4',time:4,title:'Шведское перестроение',
      subtitle:'Крыло Горна и резервы прикрывают разрыв',
      text:'Гибкость шведского порядка позволила закрыть разрыв и перейти к ответным действиям. Имена объединённых частей намеренно укрупнены: источники не дают надёжной поминутной траектории отдельных полков.',
      category:'МАНЁВР',lane:'military',importance:5,confidence:'estimated',
      sources:['cgsc','histnet'],focus:[492,358],entity:'horn'},
    {id:'phase-5',time:5,title:'Поражение армии Тилли',
      subtitle:'Шведское наступление приносит победу',
      text:'Шведы перехватили инициативу, овладели частью имперской артиллерии и обратили основную армию Тилли в отступление. Эта схема показывает общий результат последовательности, но не точное направление преследования.',
      category:'ИСХОД',lane:'military',importance:5,confidence:'estimated',
      sources:['britannica','histnet'],focus:[538,257],entity:'tilly'}
  ]
};
