// Mechanical Course Factory — deterministic, physically reachable by two controls.
// All modules expose a flat floor at the entry and exit for lossless composition.
// Additional art does not constitute a mechanic: every marked device participates
// in the simulation in engine.js. The client and pinned PocketNet use this source.
export const MODULES=Object.freeze([
  {kind:'rail',name:'Рельсовый путь',hint:'Место для передышки'},
  {kind:'gap',name:'Разрыв пола',hint:'Прыжок через шахту'},
  {kind:'double-gap',name:'Две шахты',hint:'Серия коротких прыжков'},
  {kind:'step',name:'Высокий порог',hint:'Прыжок на ступень'},
  {kind:'islands',name:'Островки',hint:'Платформы среди пустоты'},
  {kind:'spring',name:'Пружина',hint:'Автоматический подброс'},
  {kind:'belt-right',name:'Попутный конвейер',hint:'Ускоряющая лента'},
  {kind:'belt-left',name:'Встречный конвейер',hint:'Лента мешает движению'},
  {kind:'fan-up',name:'Подъёмный поток',hint:'Воздух поднимает робота'},
  {kind:'fan-side',name:'Боковой поток',hint:'Воздух толкает влево'},
  {kind:'press',name:'Пресс',hint:'Опускается с интервалом'},
  {kind:'gate',name:'Шлюз',hint:'Открывается и закрывается'},
  {kind:'mag-rail',name:'Магнитная подвеска',hint:'Магнит помогает перелететь шахту',required:'magnet'},
  {kind:'timing-press',name:'Двойной пресс',hint:'Тормоз позволяет переждать опасную фазу',required:'brake'},
  {kind:'cargo-switch',name:'Грузовой шлюз',hint:'Толчком доставьте груз до датчика',required:'push'},
  {kind:'float-gap',name:'Длинный пролёт',hint:'Поплавок удерживает Болтика над пропастью',required:'float'}
]);
export const COURSE_THEMES=Object.freeze([
 {id:'factory',name:'ИСПЫТАТЕЛЬНЫЙ ЦЕХ',base:'#9aafa4',ground:'#79877b',accent:'#f0b45f'},
 {id:'warehouse',name:'СКЛАД МЕХАНИЗМОВ',base:'#adaba0',ground:'#8b7a69',accent:'#e9a46d'},
 {id:'kitchen',name:'МЕХАНИЧЕСКАЯ КУХНЯ',base:'#b1beb4',ground:'#809a93',accent:'#cfa67c'}
]);
export const SECTION_W=4.6;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round=n=>Math.round(n*1000)/1000;
export function rng(seed) {
  let value=(seed>>>0)||1;
  return ()=>{value^=value<<13;value^=value>>>17;value^=value<<5;return (value>>>0)/4294967296;};
}
const floor=(platforms,x,w,effect='')=>{
  if(w<.04)return;
  platforms.push({x:round(x),y:6.5,w:round(w),h:1.5,id:'deck'+platforms.length,...(effect?{effect}:{})});
};
function section(kind,x,platforms,devices,random) {
  const p=(offset,w,effect='')=>floor(platforms,x+offset,w,effect);
  const add=(type,offset,w=.5,props={})=>devices.push({type,x:round(x+offset),w, ...props});
  switch(kind) {
    case 'rail':p(0,SECTION_W);break;
    case 'gap':
      p(0,1.35);p(2.18,SECTION_W-2.18);
      add('warning',1.35,.83);break;
    case 'double-gap':
      p(0,1.12);p(1.85,.92);p(3.43,SECTION_W-3.43);
      add('warning',1.12,.73);add('warning',2.77,.66);break;
    case 'step':
      p(0,1.22);platforms.push({x:round(x+1.22),y:5.53,w:1.72,h:2.47,id:'raised'+platforms.length});
      p(2.94,SECTION_W-2.94);add('step',1.22,1.72);break;
    case 'islands':
      p(0,1.08);p(1.6,.68);p(2.68,.52);p(3.7,SECTION_W-3.7);
      add('warning',1.08,.52);add('warning',2.28,.4);add('warning',3.2,.5);break;
    case 'spring':
      p(0,1.67);p(1.67,.7,'spring');p(2.37,SECTION_W-2.37);
      add('spring',1.67,.7);break;
    case 'belt-right':
      p(0,.55);p(.55,3.1,'belt-right');p(3.65,SECTION_W-3.65);
      add('belt-right',.55,3.1);break;
    case 'belt-left':
      p(0,.55);p(.55,3.1,'belt-left');p(3.65,SECTION_W-3.65);
      add('belt-left',.55,3.1);break;
    case 'fan-up':
      p(0,SECTION_W);add('fan-up',1.48,1.66,{strength:1});break;
    case 'fan-side':
      p(0,SECTION_W);add('fan-side',1.55,1.65,{strength:1});break;
    case 'press':
      p(0,SECTION_W);add('press',2.02,.76,{phase:round(random()*6.2)});break;
    case 'gate':
      p(0,SECTION_W);add('gate',2.02,.34,{phase:round(random()*6.2)});break;
    case 'mag-rail':
      p(0,1.12);p(3.65,SECTION_W-3.65);
      add('mag-rail',1.55,1.55,{y:3.65});add('warning',1.12,2.53);break;
    case 'timing-press':
      p(0,SECTION_W);add('press',1.75,.6,{phase:round(random()*4)});
      add('press',2.95,.6,{phase:round(random()*4)});break;
    case 'cargo-switch':
      p(0,SECTION_W);
      add('cargo',1.05,.48,{padX:round(x+3.05)});
      add('cargo-pad',3.05,.63);
      add('cargo-gate',3.9,.36);break;
    case 'float-gap':
      p(0,.85);p(4.05,SECTION_W-4.05);
      add('warning',.85,3.2);add('balloon-sign',1.5,1.6);break;
    default:throw Error('Unknown mechanical module '+kind);
  }
}
export function generateCourse(seed=1,sectionCount=5,playerCount=2) {
  const number=(Number(seed)>>>0)||1;
  const random=rng(number);
  const count=clamp(Math.floor(sectionCount)||5,4,6);
  const theme=COURSE_THEMES[Math.floor(random()*COURSE_THEMES.length)];
  const sections=[],platforms=[],devices=[];
  floor(platforms,0,3.1);
  // Every additional crew member receives one purpose-built station.
  // In the six-operator game the four specialist modules occupy four of the
  // five sections. No one is assigned an unused button for an entire match.
  const abilities=['jump','reverse','magnet','brake','push','float'].slice(0,clamp(Math.floor(playerCount)||2,2,6));
  const special=MODULES.filter(m=>m.required&&abilities.includes(m.required));
  const jumpHeavy=new Set(['gap','double-gap','step','islands','mag-rail','float-gap']);
  const optional=MODULES.filter(m=>!m.required);
  const required= special.map(m=>m.kind);
  let majorCount=required.filter(kind=>jumpHeavy.has(kind)).length;
  while(required.length<count){
    const choices=optional.filter(m=>!required.includes(m.kind) &&
      (!jumpHeavy.has(m.kind)||majorCount<Math.ceil(count/2)));
    const candidate=choices[Math.floor(random()*choices.length)];
    required.push(candidate.kind);
    if(jumpHeavy.has(candidate.kind))majorCount++;
  }
  const invalidFirst=new Set(['press','gate','timing-press','cargo-switch']);
  const validSequence=kinds=>kinds.every((kind,i)=>(
    (i>0||!invalidFirst.has(kind)) &&
    (i===0||kind!==kinds[i-1]) &&
    (i===0||!jumpHeavy.has(kind)||!jumpHeavy.has(kinds[i-1]))));
  const shuffle=items=>{
    const copy=[...items];
    for(let i=copy.length-1;i>0;i--){
      const j=Math.floor(random()*(i+1));
      [copy[i],copy[j]]=[copy[j],copy[i]];
    }
    return copy;
  };
  let schedule=null;
  for(let i=0;i<60;i++){
    const candidate=shuffle(required);
    if(validSequence(candidate)){schedule=candidate;break;}
  }
  // Rejection cannot deadlock generation. A stable fallback searches only the
  // 4–6 chosen module types and never invents unsupported abilities.
  if(!schedule){
    const arrange=(prefix,remaining)=>{
      if(!remaining.length)return prefix;
      for(const kind of remaining){
        const seq=[...prefix,kind];
        if(!validSequence(seq))continue;
        const found=arrange(seq,remaining.filter(v=>v!==kind));
        if(found)return found;
      }
      return null;
    };
    schedule=arrange([],required);
  }
  if(!schedule)throw Error('Unable to schedule safe course sections');
  for(let i=0;i<count;i++){
    const chosen=MODULES.find(m=>m.kind===schedule[i]);
    const x=round(3.1+i*SECTION_W);
    sections.push({kind:chosen.kind,name:chosen.name,x,w:SECTION_W,index:i+1});
    section(chosen.kind,x,platforms,devices,random);
  }
  const end=round(3.1+count*SECTION_W);
  floor(platforms,end,3.1);
  const width=round(end+3.1);
  const pointIndex=Math.floor((count-1)/2);
  const checkpoint=round(3.1+(pointIndex+1)*SECTION_W+.25);
  return {seed:number,version:3,playerCount,name:theme.name,theme:theme.id,sections,platforms,devices,
    width,height:8,start:1.15,goal:round(width-1.45),
    checkpoint,checkpointSpawn:{x:checkpoint,y:6.04},length:count};
}
export function deviceRect(device,t) {
  if(device.type==='press'){
    const wave=(Math.sin(t*2.35+device.phase)+1)/2;
    return {x:device.x,y:3.38+wave*2.8,w:device.w,h:.82,active:true};
  }
  if(device.type==='gate'){
    const closed=Math.sin(t*1.75+device.phase)<.15;
    return {x:device.x,y:closed?4.8:2.3,w:device.w,h:closed?1.7:1.05,active:closed};
  }
  return null;
}
export function validateCourse(course) {
  if(!course||!Number.isInteger(course.seed)||!Array.isArray(course.platforms)||!course.platforms.length)return false;
  if(course.length<4||course.length>6||course.goal>=course.width||course.checkpoint>=course.goal)return false;
  if(course.platforms.some(p=>p.x<0||p.w<=0||p.y<3||p.y>6.5||p.x+p.w>course.width+.001))return false;
  // A shared-floor connector exists on both ends of every module; these are
  // the guaranteed safe retry and composition surfaces.
  for(const s of course.sections){
    for(const x of [s.x+.1,s.x+s.w-.1])
      if(!course.platforms.some(p=>p.x<=x&&p.x+p.w>=x&&p.y===6.5))return false;
  }
  const jumpRange=3.4*(2*9.15/19);
  for(let i=0;i<course.platforms.length-1;i++){
    const a=course.platforms[i],b=course.platforms[i+1];
    if(b.x-a.x-a.w>jumpRange-.2 && !(course.sections||[]).some(s=>
      ['float-gap','mag-rail'].includes(s.kind) && a.x+a.w>=s.x && b.x<=s.x+s.w+.1))return false;
  }
  return true;
}
