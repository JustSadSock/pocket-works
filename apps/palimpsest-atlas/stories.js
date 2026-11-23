import {battleScenario} from './battle.js';
// Scenarios are data, not renderer branches. Maps are explicitly schematic,
// and source claims distinguish archaeological evidence from later tradition.
export const stories = [
{
  id:'rome',
  title:'Как возник Рим',
  subtitle:'От поселений на холмах до конца царской эпохи',
  index:'01',
  type:'origins',
  region:'Лаций · долина Тибра',
  range:[-1000,-500],
  world:{width:1000,height:700},
  palette:{paper:'#e5dac1',ink:'#373c33',water:'#70989a',accent:'#a34e39'},
  intro:'История Рима начинается не в один день. Сначала здесь были небольшие поселения, постепенно превратившиеся в городской центр. Легенда об основании — отдельный рассказ.',
  disclaimer:'Схема холмов и долины Тибра; расстояния и береговая линия обобщены.',
  sources:[
    {id:'parco',title:'Parco archeologico del Colosseo · Palatine huts',url:'https://colosseo.it/en/itineraries/palatium-living-on-the-palatine-from-the-foundation-of-rome-to-the-modern-age/'},
    {id:'oxford',title:'Oxford Classical Dictionary · Rome: origins',url:'https://academic.oup.com/edited-volume/61673/chapter-abstract/550496605'},
    {id:'pbs',title:'PBS · Archaeology of ancient Rome',url:'https://www.pbs.org/wgbh/pages/frontline/shows/religion/maps/arch/rome.html'},
    {id:'forum',title:'World History Encyclopedia · Roman Forum',url:'https://www.worldhistory.org/timeline/Roman_Forum/'},
    {id:'republic',title:'World History Encyclopedia · Roman Republic',url:'https://www.worldhistory.org/Roman_Republic/'}
  ],
  features:[
    {id:'palatine',kind:'hill',x:538,y:385,rx:85,ry:64,rotation:-0.2,label:'Палатин',from:-1000},
    {id:'capitoline',kind:'hill',x:473,y:235,rx:49,ry:48,rotation:0.1,label:'Капитолий',from:-1000},
    {id:'aventine',kind:'hill',x:466,y:546,rx:78,ry:59,rotation:0.05,label:'Авентин',from:-1000},
    {id:'caelian',kind:'hill',x:671,y:506,rx:72,ry:45,rotation:0.27,label:'Целий',from:-1000},
    {id:'esquiline',kind:'hill',x:745,y:377,rx:83,ry:56,rotation:-0.33,label:'Эсквилин',from:-1000},
    {id:'quirinal',kind:'hill',x:669,y:199,rx:77,ry:37,rotation:-0.12,label:'Квиринал',from:-1000},
    {id:'viminal',kind:'hill',x:763,y:261,rx:50,ry:35,rotation:0.1,label:'Виминал',from:-1000},
    {id:'forum',kind:'zone',x:575,y:267,rx:58,ry:38,rotation:0,label:'Форум',from:-650,confidence:'estimated'},
    {id:'city-core',kind:'zone',x:605,y:354,rx:174,ry:152,rotation:0,label:'Ранний городской центр',from:-600,confidence:'estimated'}
  ],
  waterways:[[[310,-45],[316,70],[285,139],[307,208],[275,282],[297,346],[268,428],[278,512],[240,595],[244,750]]],
  paths:[
    {id:'early-track',kind:'track',from:-700,confidence:'estimated',points:[[523,373],[569,312],[575,267],[492,243]]},
    {id:'hill-way',kind:'track',from:-650,confidence:'estimated',points:[[538,388],[623,448],[668,505]]}
  ],
  entities:[
    {id:'tiber',type:'river',name:'Тибр',x:282,y:355,from:-1000,confidence:'confirmed',sources:['pbs'],description:'Река задавала удобные переправы и условия развития поселений. Нынешний вид русла на схеме — условный.',current:'Река остаётся ключевым природным ориентиром во все периоды истории.'},
    {id:'palatine',type:'hill',name:'Палатин',x:537,y:382,from:-1000,confidence:'confirmed',sources:['parco','oxford'],description:'Один из центральных холмов раннего Рима. Археологические исследования выявили следы поселений железного века.',current:'В ранний период здесь располагались небольшие поселения; позже место стало частью городского ядра.'},
    {id:'capitoline',type:'hill',name:'Капитолий',x:473,y:235,from:-1000,confidence:'estimated',sources:['oxford'],description:'Холм, позже превратившийся в важнейшее религиозное пространство Рима.',current:'Степень заселённости и культовые функции менялись; точные даты первых построек реконструируются приблизительно.'},
    {id:'aventine',type:'hill',name:'Авентин',x:468,y:545,from:-1000,confidence:'confirmed',sources:['oxford'],description:'Холм южнее Палатина, соседствующий с ранними поселениями Лация.',current:'Часть постепенно объединяющегося пространства поселений.'},
    {id:'huts',type:'settlement',name:'Хижины на Палатине',x:550,y:413,from:-900,confidence:'confirmed',sources:['parco'],description:'Следы хижин на Палатине датируются по меньшей мере IX веком до н. э., использовались вплоть до VII века до н. э.',current:'Это археологическое свидетельство, а не доказательство единственного акта основания города.'},
    {id:'forum',type:'place',name:'Долина Форума',x:587,y:274,from:-700,confidence:'estimated',sources:['forum','oxford','pbs'],description:'Низина между холмами постепенно становится общественным и торговым центром; развитие относится прежде всего к VII веку до н. э.',current:'Место объединения соседних общин. Конкретные постройки и годы появления показываются обобщённо.'},
    {id:'romulus',type:'legend',name:'Ромул и Рем',x:622,y:358,from:-753,confidence:'tradition',sources:['republic'],description:'Легенда о близнецах, волчице и Ромуле — традиционное объяснение происхождения Рима, а не подтверждённый археологией протокол событий.',current:'753 год до н. э. — позднее принятая традиционная дата основания. Сюжет обозначен как предание.'},
    {id:'urban',type:'city',name:'Городской Рим',x:638,y:335,from:-600,confidence:'estimated',sources:['oxford','pbs'],description:'В VII–VI веках до н. э. происходят процессы урбанизации; объединение районов и публичные сооружения делают Рим центром региона.',current:'Развитие города — протяжённый процесс, а не мгновенное появление городской черты.'}
  ],
  events:[
    {id:'latium',time:-1000,title:'Лаций до города',subtitle:'Общины живут в долине Тибра',text:'Около рубежа II и I тысячелетий до н. э. в Лации существуют локальные поселения. Будущий Рим ещё не представляет собой единый город.',importance:2,category:'КОНТЕКСТ',confidence:'estimated',sources:['oxford'],focus:[500,355]},
    {id:'huts',time:-900,title:'Поселения на Палатине',subtitle:'Археологический след ранних общин',text:'Археологические находки на Палатине подтверждают поселение с IX века до н. э. Постройки были небольшими; нельзя говорить о готовом городе.',importance:4,category:'АРХЕОЛОГИЯ',confidence:'confirmed',sources:['parco','oxford'],focus:[546,403],entity:'huts'},
    {id:'iron',time:-800,title:'Несколько соседних общин',subtitle:'Холмы ещё не единое политическое целое',text:'Поселения на возвышенностях расширяются и взаимодействуют. Модель показывает процесс сближения, а не точно известные границы поселений.',importance:2,category:'ОБЩИНЫ',confidence:'estimated',sources:['oxford'],focus:[590,340]},
    {id:'romulus',time:-753,title:'Легенда об основании',subtitle:'Ромул, Рем и традиционная дата',text:'753 год до н. э. — традиционная дата основания Рима. Рассказ о Ромуле и Реме относится к преданию; археология не подтверждает его как последовательность фактов.',importance:5,category:'ПРЕДАНИЕ',confidence:'tradition',sources:['republic'],focus:[621,358],entity:'romulus'},
    {id:'hill-links',time:-700,title:'Сближение поселений',subtitle:'Между холмами возникает городская сеть',text:'Около VII века до н. э. взаимосвязи между поселениями усиливаются. Здесь они показаны схематичными путями — их точное историческое расположение неизвестно.',importance:3,category:'ПРОЦЕСС',confidence:'estimated',sources:['oxford','pbs'],focus:[578,350]},
    {id:'forum',time:-650,title:'Форум становится центром',subtitle:'Низина — общее общественное пространство',text:'На протяжении VII века до н. э. район Форума превращается в место общественной и торговой жизни. Точная дата перехода не установлена.',importance:5,category:'ГОРОД',confidence:'estimated',sources:['forum','oxford','pbs'],focus:[575,263],entity:'forum'},
    {id:'urban',time:-600,title:'Оформление городского центра',subtitle:'Городские институты и сооружения',text:'В VII–VI веках до н. э. растёт плотность заселения и возникают монументальные сооружения. Контур на карте обобщает процесс, а не показывает измеренную границу 600 года.',importance:4,category:'УРБАНИЗАЦИЯ',confidence:'estimated',sources:['oxford','pbs'],focus:[619,350],entity:'urban'},
    {id:'republic',time:-509,title:'Начало Римской республики',subtitle:'Традиционный конец царской эпохи',text:'По римской исторической традиции в 509 году до н. э. изгнали последнего царя. Современные исследователи рассматривают формирование республиканского строя как более сложный процесс.',importance:5,category:'ПОЛИТИКА',confidence:'tradition',sources:['republic'],focus:[620,334],entity:'urban'}
  ]
},
{
  id:'war',
  sceneLinks:[{id:'breitenfeld-gateway',targetId:'breitenfeld',x:475,y:376,from:1631.60,until:1631.95,minZoom:2.9,radius:205}],
  title:'Тридцатилетняя война',
  subtitle:'Европейский конфликт 1618–1648',
  index:'02',
  type:'war',
  region:'Центральная Европа · 1618–1648',
  range:[1618,1648.95],
  world:{width:1000,height:700},
  palette:{paper:'#e2dbc9',ink:'#353d38',water:'#779a9f',accent:'#9b513d'},
  intro:'За три десятилетия локальное восстание в Богемии перерастает в общеевропейскую войну. Вместо придуманных траекторий армий карта показывает документированные центры событий и смену фокуса конфликта.',
  disclaimer:'Схематическая карта Центральной Европы; границы и расстояния не являются точной реконструкцией.',
  sources:[
    {id:'ghi',title:'German History in Documents and Images · The Thirty Years War',url:'https://germanhistorydocs.org/en/from-the-reformations-to-the-thirty-years-war-1500-1648/introduction.pdf'},
    {id:'museum',title:'Musée protestant · The Thirty-Year War',url:'https://museeprotestant.org/en/notice/the-thirty-year-war-1618-1648/'},
    {id:'whe',title:'World History Project · Thirty Years War timeline',url:'https://worldhistoryproject.org/topics/thirty-years-war/'}
  ],
  features:[
    {id:'bohemia',kind:'region',x:590,y:449,rx:128,ry:92,rotation:.17,label:'БОГЕМИЯ',from:1618,confidence:'estimated'},
    {id:'saxony',kind:'region',x:477,y:345,rx:122,ry:72,rotation:-.2,label:'САКСОНИЯ',from:1618,confidence:'estimated'},
    {id:'bavaria',kind:'region',x:457,y:573,rx:145,ry:76,rotation:.1,label:'БАВАРИЯ',from:1618,confidence:'estimated'},
    {id:'austria',kind:'region',x:707,y:572,rx:124,ry:75,rotation:.15,label:'АВСТРИЯ',from:1618,confidence:'estimated'},
    {id:'pomerania',kind:'region',x:559,y:170,rx:155,ry:55,rotation:0,label:'ПОМОРА́НИЯ',from:1618,confidence:'estimated'}
  ],
  waterways:[[[300,-20],[353,120],[399,204],[385,300],[430,410],[415,480],[475,560],[480,750]],[[690,155],[734,264],[693,350],[716,444],[737,546],[758,720]]],
  paths:[],
  entities:[
    {id:'prague',type:'city',name:'Прага',x:602,y:454,from:1618,confidence:'confirmed',sources:['ghi'],description:'Центр Богемского восстания, начавшего Тридцатилетнюю войну.',current:'Ключевое место политической фазы начала конфликта.'},
    {id:'white-mountain',type:'battle',name:'Белая гора',x:562,y:432,from:1620,confidence:'confirmed',sources:['museum'],description:'В 1620 году богемские протестантские силы потерпели здесь поражение.',current:'Сражение стало переломом в начальной богемской фазе.'},
    {id:'magdeburg',type:'city',name:'Магдебург',x:460,y:294,from:1618,confidence:'confirmed',sources:['whe'],description:'Город, разорённый в 1631 году. Эта катастрофа стала одной из наиболее известных трагедий войны.',current:'Объект сохраняется на карте; события меняют его положение в хронике.'},
    {id:'breitenfeld',type:'battle',name:'Брейтенфельд',x:475,y:376,from:1631,confidence:'confirmed',sources:['ghi','museum'],description:'Сражение сентября 1631 года, победа войск Густава II Адольфа и саксонцев над имперско-католическими силами.',current:'Открывает новую фазу войны и меняет стратегическую инициативу.'},
    {id:'lutzen',type:'battle',name:'Лютцен',x:447,y:395,from:1632,confidence:'confirmed',sources:['museum'],description:'Сражение ноября 1632 года. Шведская армия победила, но Густав II Адольф погиб.',current:'Победа с огромной политической ценой для Швеции.'},
    {id:'vienna',type:'city',name:'Вена',x:722,y:582,from:1618,confidence:'confirmed',sources:['ghi'],description:'Центр владений австрийских Габсбургов, ключевого участника конфликта.',current:'Имперский политический центр; не вся война сводится к его окрестностям.'},
    {id:'muenster',type:'city',name:'Мюнстер',x:267,y:314,from:1648,confidence:'confirmed',sources:['museum'],description:'Один из городов, где в 1648 году были заключены соглашения Вестфальского мира.',current:'Место подписания части договоров, завершавших войну.'},
    {id:'swedish',type:'region',name:'Шведское вмешательство',x:538,y:155,from:1630,confidence:'estimated',sources:['ghi'],description:'Высадка шведских сил в Померании в 1630 году открыла новый этап войны. Значок не обозначает точную диспозицию войск.',current:'Война приобретает более широкое европейское измерение.'}
  ],
  events:[
    {id:'defenestration',time:1618,title:'Пражская дефенестрация',subtitle:'Начинается Богемское восстание',text:'Конфликт вокруг веры и власти в землях Габсбургов переходит к вооружённому противостоянию. Пражские события мая 1618 года становятся символом начала войны.',importance:5,category:'НАЧАЛО',confidence:'confirmed',sources:['ghi','museum'],focus:[602,454],entity:'prague'},
    {id:'white',time:1620,title:'Битва на Белой горе',subtitle:'Поражение богемского восстания',text:'В ноябре 1620 года войска императора и Католической лиги одерживают победу близ Праги. Богемское восстание терпит военное поражение.',importance:5,category:'БИТВА',confidence:'confirmed',sources:['museum'],focus:[562,432],entity:'white-mountain'},
    {id:'denmark',time:1625,title:'Датский этап',subtitle:'Конфликт выходит за границы Богемии',text:'Датский король Кристиан IV вступает в конфликт, поддерживая протестантские силы. Война меняет масштаб.',importance:3,category:'КОАЛИЦИИ',confidence:'confirmed',sources:['ghi'],focus:[445,272]},
    {id:'edict',time:1629,title:'Эдикт о реституции',subtitle:'Религиозно-политическое давление',text:'Фердинанд II издаёт Эдикт о реституции. Этот шаг обостряет конфессиональные и политические противоречия в империи.',importance:4,category:'ПОЛИТИКА',confidence:'confirmed',sources:['ghi'],focus:[635,420]},
    {id:'sweden',time:1630,title:'Швеция вступает в войну',subtitle:'Высадка в Померании',text:'Густав II Адольф высаживает войска на германском побережье Балтики. Контур карты не показывает точный маршрут марша.',importance:5,category:'ИНТЕРВЕНЦИЯ',confidence:'confirmed',sources:['ghi'],focus:[538,155],entity:'swedish'},
    {id:'magdeburg',time:1631.38,title:'Катастрофа Магдебурга',subtitle:'Разорение города',text:'В мае 1631 года Магдебург был взят имперскими силами и опустошён. Событие стало одним из самых трагичных эпизодов войны.',importance:5,category:'ОСАДА',confidence:'confirmed',sources:['whe'],focus:[460,294],entity:'magdeburg'},
    {id:'breitenfeld',time:1631.71,title:'Победа при Брейтенфельде',subtitle:'Стратегический перелом',text:'В сентябре 1631 года войска Швеции и Саксонии разгромили силы Католической лиги. Эта карта фиксирует место и последствия, но не реконструирует несохранившиеся поминутные манёвры.',importance:5,category:'БИТВА',confidence:'confirmed',sources:['ghi','museum'],focus:[475,376],entity:'breitenfeld'},
    {id:'lutzen',time:1632.84,title:'Битва при Лютцене',subtitle:'Гибель Густава II Адольфа',text:'В ноябре 1632 года шведская армия одерживает победу, но король погибает на поле боя. Конфликт продолжается.',importance:5,category:'БИТВА',confidence:'confirmed',sources:['museum'],focus:[447,395],entity:'lutzen'},
    {id:'france',time:1635,title:'Французская фаза',subtitle:'Противостояние европейских держав',text:'После периода косвенной поддержки противников Габсбургов Франция вступает в открытый конфликт с Испанией. Война всё более выходит за конфессиональные рамки.',importance:4,category:'ИНТЕРВЕНЦИЯ',confidence:'confirmed',sources:['ghi'],focus:[280,410]},
    {id:'westphalia',time:1648.8,title:'Вестфальский мир',subtitle:'Завершается Тридцатилетняя война',text:'Мирные договоры, заключённые в Мюнстере и Оснабрюке в 1648 году, завершили основную войну в Священной Римской империи.',importance:5,category:'МИР',confidence:'confirmed',sources:['museum','whe'],focus:[267,314],entity:'muenster'}
  ]
}
,
battleScenario
];
export const getStory = (id) => stories.find((story) => story.id === id) || stories[0];
