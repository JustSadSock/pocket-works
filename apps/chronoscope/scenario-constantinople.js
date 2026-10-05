export const constantinople = {
  id: 'constantinople-1453-final',
  title: 'Константинополь',
  subtitle: 'Финальный штурм · 29 мая 1453',
  duration: 330,
  startMinutes: 120,
  note: 'Демонстрационная реконструкция. Точное время отдельных эпизодов спорно; шкала округлена для наглядной симуляции.',
  bounds: { width: 1000, height: 720 },
  phases: [
    { from: 0, to: 85, name: 'Артобстрел' },
    { from: 85, to: 130, name: 'Последняя атака' },
    { from: 130, to: 220, name: 'Прорыв в стенах' },
    { from: 220, to: 300, name: 'Бои в городе' },
    { from: 300, to: 331, name: 'Падение города' }
  ],
  terrain: {
    mainland: [[0,0],[360,0],[350,105],[328,155],[310,220],[302,320],[298,430],[305,555],[260,720],[0,720]],
    city: [[302,178],[432,184],[580,202],[730,235],[855,292],[914,376],[906,462],[838,536],[700,585],[525,612],[380,598],[305,552],[292,455],[296,332]],
    galata: [[675,35],[1000,18],[1000,246],[920,245],[800,216],[710,175],[675,130]]
  },
  walls: [
    { id:'theodosian', name:'Феодосиевы стены', points:[[302,178],[299,248],[298,328],[294,410],[298,485],[305,552]], width:10, kind:'major' },
    { id:'inner', points:[[326,184],[323,250],[322,330],[318,410],[322,484],[330,545]], width:4, kind:'inner' },
    { id:'horn', points:[[302,178],[432,184],[580,202],[730,235],[855,292]], width:5, kind:'sea' },
    { id:'sea', points:[[305,552],[380,598],[525,612],[700,585],[838,536],[906,462],[914,376],[855,292]], width:5, kind:'sea' }
  ],
  places: [
    { id:'ottoman-army', x:142, y:205, label:'Османские войска', kind:'region', side:'ottoman' },
    { id:'city-name', x:600, y:390, label:'КОНСТАНТИНОПОЛЬ', kind:'city' },
    { id:'golden-horn', x:725, y:170, label:'ЗОЛОТОЙ РОГ', kind:'water' },
    { id:'marmara', x:690, y:650, label:'МРАМОРНОЕ МОРЕ', kind:'water' },
    { id:'galata', x:860, y:125, label:'ГАЛАТА', kind:'region' },
    { id:'fleet', x:900, y:345, label:'Османский флот', kind:'waterSmall', side:'ottoman' },
    { id:'hagia', x:805, y:410, label:'Святая София', kind:'landmark', landmark:true },
    { id:'romanus', x:300, y:392, label:'Ворота св. Романа', kind:'small' },
    { id:'blachernae', x:318, y:215, label:'Влахерны', kind:'small' }
  ],
  commanders: [
    { id:'mehmed', side:'ottoman', name:'Мехмед II', short:'Мехмед II', track:[{t:0,x:175,y:280},{t:330,x:235,y:350}] },
    { id:'constantine', side:'byzantine', name:'Константин XI Палеолог', short:'Константин XI', track:[{t:0,x:365,y:375},{t:220,x:350,y:392},{t:330,x:410,y:405}] }
  ],
  units: [
    { id:'rumelia-north', side:'ottoman', label:'Румелийцы', shape:'block', size:10, track:[{t:0,x:165,y:180,strength:1},{t:90,x:220,y:210,strength:.96},{t:180,x:280,y:245,strength:.68},{t:330,x:340,y:270,strength:.45}] },
    { id:'rumelia-center', side:'ottoman', label:'Румелийцы', shape:'block', size:11, track:[{t:0,x:130,y:275,strength:1},{t:90,x:205,y:295,strength:.95},{t:130,x:265,y:330,strength:.88},{t:230,x:340,y:350,strength:.66},{t:330,x:455,y:365,strength:.56}] },
    { id:'azabs-center', side:'ottoman', label:'Азапы', shape:'line', size:10, track:[{t:0,x:115,y:355,strength:1},{t:75,x:190,y:360,strength:.92},{t:125,x:268,y:380,strength:.72},{t:180,x:315,y:392,strength:.42}] },
    { id:'janissaries', side:'ottoman', label:'Янычары', shape:'block', size:13, elite:true, track:[{t:0,x:120,y:445,strength:1},{t:90,x:185,y:430,strength:1},{t:125,x:255,y:405,strength:.96},{t:150,x:315,y:394,strength:.9},{t:230,x:410,y:405,strength:.8},{t:330,x:575,y:410,strength:.72}] },
    { id:'anatolia-south', side:'ottoman', label:'Анатолийцы', shape:'block', size:11, track:[{t:0,x:155,y:535,strength:1},{t:110,x:220,y:505,strength:.94},{t:190,x:288,y:470,strength:.67},{t:330,x:355,y:460,strength:.48}] },
    { id:'reserve-north', side:'ottoman', label:'Резерв', shape:'block', size:9, track:[{t:0,x:85,y:130,strength:1},{t:150,x:150,y:165,strength:.9},{t:300,x:260,y:230,strength:.62}] },
    { id:'reserve-south', side:'ottoman', label:'Резерв', shape:'block', size:9, track:[{t:0,x:90,y:590,strength:1},{t:180,x:160,y:555,strength:.85},{t:330,x:285,y:505,strength:.6}] },
    { id:'byz-north', side:'byzantine', label:'Северный сектор', shape:'line', size:9, track:[{t:0,x:342,y:235,strength:1},{t:160,x:334,y:250,strength:.76},{t:260,x:360,y:265,strength:.46},{t:330,x:410,y:285,strength:.28}] },
    { id:'byz-center', side:'byzantine', label:'Центр обороны', shape:'line', size:11, track:[{t:0,x:345,y:350,strength:1},{t:120,x:338,y:365,strength:.84},{t:145,x:350,y:392,strength:.58},{t:210,x:395,y:410,strength:.35},{t:330,x:500,y:430,strength:.14}] },
    { id:'byz-south', side:'byzantine', label:'Южный сектор', shape:'line', size:9, track:[{t:0,x:348,y:485,strength:1},{t:190,x:345,y:480,strength:.72},{t:280,x:390,y:470,strength:.46},{t:330,x:455,y:470,strength:.28}] },
    { id:'city-reserve', side:'byzantine', label:'Городской резерв', shape:'block', size:8, track:[{t:0,x:455,y:375,strength:1},{t:145,x:420,y:392,strength:.9},{t:250,x:470,y:420,strength:.55},{t:330,x:555,y:430,strength:.35}] }
  ],
  ships: [
    { id:'ship-1', side:'ottoman', track:[{t:0,x:610,y:105},{t:330,x:725,y:170}] },
    { id:'ship-2', side:'ottoman', track:[{t:0,x:760,y:140},{t:330,x:850,y:205}] },
    { id:'ship-3', side:'ottoman', track:[{t:0,x:930,y:300},{t:330,x:890,y:345}] },
    { id:'ship-4', side:'ottoman', track:[{t:0,x:500,y:680},{t:330,x:610,y:620}] },
    { id:'ship-5', side:'ottoman', track:[{t:0,x:690,y:670},{t:330,x:760,y:610}] },
    { id:'ship-6', side:'ottoman', track:[{t:0,x:860,y:640},{t:330,x:820,y:585}] }
  ],
  breaches: [
    {
      id:'central-breach', wall:'theodosian', from:130, x:297, y:392,
      upper:[[302,178],[299,248],[298,328],[296,370]],
      lower:[[296,414],[294,455],[298,485],[305,552]]
    }
  ],
  visuals: [
    {
      type:'bombardment', from:0, to:95, side:'ottoman',
      sources:[[205,305],[180,390],[210,470]],
      targets:[[298,335],[297,390],[298,445]]
    },
    {
      type:'arrows', from:35, to:145, side:'ottoman',
      arrows:[
        {points:[[150,260],[205,285],[275,330]],width:4.2,alpha:.58},
        {points:[[140,355],[205,360],[275,382]],width:4.8,alpha:.66},
        {points:[[155,475],[215,455],[282,420]],width:4,alpha:.52}
      ]
    },
    {
      type:'impact', from:122, to:175, side:'ottoman', center:[297,392], intensity:1.15
    },
    {
      type:'arrows', from:130, to:330, side:'ottoman',
      arrows:[
        {points:[[270,380],[300,392],[352,405],[430,410]],width:5.2,alpha:.72},
        {points:[[275,415],[305,405],[365,430],[450,455]],width:3.4,alpha:.44}
      ]
    },
    {
      type:'stand', from:120, to:180, side:'byzantine', center:[345,390]
    },
    {
      type:'retreat', from:155, to:235, side:'byzantine', center:[360,400], path:[[360,400],[410,415],[470,430]]
    },
    {
      type:'arrows', from:220, to:330, side:'ottoman',
      arrows:[
        {points:[[365,405],[470,410],[590,405],[700,400]],width:4.6,alpha:.52},
        {points:[[360,430],[455,465],[570,500]],width:3,alpha:.34}
      ]
    }
  ],
  events: [
    { id:'bombardment', t:0, importance:2, short:'Артобстрел', title:'Артобстрел усиливается', body:'Османские батареи концентрируют огонь по сухопутному фронту, добивая повреждённые участки Феодосиевых стен.', confidence:'Время приблизительное', focus:{x:500,y:360,zoom:.86} },
    { id:'assault', t:90, importance:4, short:'Последняя атака', title:'Начинается последний общий штурм', body:'Основные силы подходят к западной стене. Давление одновременно растёт на нескольких участках обороны.', confidence:'Последовательность надёжна', focus:{x:485,y:370,zoom:.9} },
    { id:'breach', t:130, importance:5, short:'Прорыв в стенах', title:'Прорыв в стенах', body:'После многодневного обстрела османские войска пробивают брешь в районе ворот св. Романа и устремляются в город.', confidence:'Точное место и минуты реконструированы приблизительно', focus:{x:500,y:382,zoom:.92} },
    { id:'city', t:240, importance:4, short:'Бои в городе', title:'Бои перемещаются внутрь города', body:'После потери сухопутного фронта сопротивление распадается на отдельные очаги, а османские части расходятся по городским улицам.', confidence:'Общая картина надёжна', focus:{x:535,y:400,zoom:.92} },
    { id:'fall', t:330, importance:5, short:'Падение города', title:'Падение Константинополя', body:'Организованная оборона прекращается. Османские части контролируют ключевые районы города.', confidence:'Финальная фаза агрегирована', focus:{x:520,y:390,zoom:.86} }
  ],
  camera: [
    {t:0,x:500,y:360,zoom:.82},
    {t:75,x:490,y:370,zoom:.87},
    {t:125,x:500,y:380,zoom:.91},
    {t:150,x:505,y:385,zoom:.94},
    {t:220,x:525,y:398,zoom:.91},
    {t:290,x:535,y:400,zoom:.88},
    {t:330,x:520,y:390,zoom:.84}
  ]
};