// All gameplay geometry is in world pixels. Outward normals face the free space.
const border=[
 {id:'top',x:0,y:54,w:720,h:24},{id:'floor',x:0,y:865,w:720,h:55},
 {id:'left',x:0,y:54,w:25,h:866},{id:'right',x:695,y:54,w:25,h:866}
];
const wall=(id,x,y,w,h)=>({id,x,y,w,h});
const port=(wall,x,y,nx,ny,span=112)=>({wall,x,y,nx,ny,span});
export const LEVELS=[
 {name:'Разрыв пространства',subtitle:'Один барьер. Два выхода.',hint:'Выстрели через голубой портал в перегородке.',gravity:9.81,power:14.5,emitter:{x:102,y:756,aim:-.56},goal:{x:569,y:370,r:36},
  walls:[wall('divider',350,250,24,615)],sites:[port('divider',350,591,-1,0),port('divider',374,412,1,0),port('divider',350,365,-1,0),port('divider',374,661,1,0)],pairs:[[0,1],[]]},
 {name:'Поворот импульса',subtitle:'Вниз — не значит вниз.',hint:'Направление скорости после выхода определяется нормалью второго портала.',gravity:9.81,power:15,emitter:{x:115,y:370,aim:.12},goal:{x:580,y:445,r:39},
  walls:[wall('island',294,80,28,600),wall('shelf',380,600,265,22)],sites:[port('island',294,370,-1,0),port('shelf',490,600,0,-1),port('island',322,245,1,0),port('shelf',600,600,0,-1)],pairs:[[0,2],[]]},
 {name:'Гравитационный колодец',subtitle:'Высота имеет цену.',hint:'В прыжке через порталы скорость сохраняется, но энергетический баланс меняется.',gravity:9.81,power:16,emitter:{x:125,y:316,aim:.78},goal:{x:585,y:450,r:34},
  walls:[wall('well',230,565,345,22),wall('spire',460,80,22,440)],sites:[port('well',340,565,0,-1),port('spire',482,220,1,0),port('well',500,565,0,-1),port('spire',460,360,-1,0)],pairs:[[0,1],[]]},
 {name:'Сдвоенный канал',subtitle:'Две пары, четыре устья.',hint:'У каждой пары свой цвет. Нажимай А или Б, чтобы переставить её входы.',gravity:9.81,power:15.5,emitter:{x:110,y:744,aim:-.75},goal:{x:595,y:196,r:35},
  walls:[wall('p1',290,200,24,670),wall('p2',475,90,24,600)],sites:[port('p1',290,577,-1,0),port('p1',314,450,1,0),port('p2',475,370,-1,0),port('p2',499,250,1,0),port('p1',290,300,-1,0),port('p2',499,510,1,0)],pairs:[[0,1],[2,3]]},
 {name:'Монтаж',subtitle:'Переставь выход, найди траекторию.',hint:'Коснись гнезда для установки выбранного конца портала. Переставь выход на нижнее крепление, чтобы попасть в приёмник.',gravity:9.81,power:16,emitter:{x:112,y:752,aim:-.85},goal:{x:585,y:315,r:37},
  walls:[wall('gate',330,90,26,777),wall('step',478,695,178,22)],sites:[port('gate',330,540,-1,0),port('gate',356,285,1,0),port('gate',330,290,-1,0),port('gate',356,580,1,0),port('step',558,695,0,-1)],pairs:[[0,1],[]]},
 {name:'СВОБОДНЫЙ ОПЫТ',subtitle:'Никакой оценки. Только физика.',hint:'Запускай тела, переставляй все четыре устья, меняй гравитацию и упругость.',sandbox:true,gravity:9.81,power:16,emitter:{x:112,y:736,aim:-.48},
  walls:[wall('bulkhead',345,250,30,620),wall('ledge',412,500,243,22)],sites:[port('bulkhead',345,560,-1,0),port('bulkhead',375,355,1,0),port('ledge',515,500,0,-1),port('bulkhead',375,705,1,0),port('bulkhead',345,390,-1,0),port('ledge',610,500,0,-1)],pairs:[[0,1],[2,3]]}
];
export function buildLevel(index){
  const l=LEVELS[Math.max(0,Math.min(index,LEVELS.length-1))];
  return {level:index,gravity:l.gravity,restitution:.68,friction:.28,airDrag:.0015,
    balls:[],sites:l.sites.map(x=>({...x})),pairSites:l.pairs.map(x=>[...x]),
    walls:[...border,...l.walls].map(x=>({...x})),anchorWork:0,events:[],shotCount:0,transits:0};
}
