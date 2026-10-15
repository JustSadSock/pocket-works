// PocketNet / КОМНАТКА. All goals, edits and scoring are validated on the server.
// The memory answer is omitted from building-phase messages, not merely hidden in CSS.
export const MIN_PLAYERS=2;
export const MAX_PLAYERS=5;
export const RULESET_VERSION=3;
const ROOM=3.77;
const FOOT={
 sofa:[2.55,1.26],chair:[1.18,1.18],coffee:[1.58,1.08],shelf:[1.75,.72],bed:[2.3,2.7],
 stool:[.72,.72],floorlamp:[.92,.92],tablelamp:[.55,.55],plant:[.96,.96],
 rug:[2.95,2.12],books:[.52,.36],mug:[.30,.30],frame:[1.37,.1],window:[1.94,.1],
 wardrobe:[1.62,.86],desk:[1.75,.92],nightstand:[.79,.66],bookcase:[1.42,.66],loveseat:[1.87,1.21],pouf:[.69,.69],
 teddy:[.39,.34],vase:[.28,.28],candle:[.22,.22],pillow:[.63,.43],basket:[.62,.52],cactus:[.56,.56],
 mirror:[1.08,.10],clock:[.79,.10],deskclock:[.28,.23],teapot:[.42,.38],diningtable:[2.15,1.35],diningchair:[.72,.78],kitchenunit:[1.72,.75],sink:[1.21,.76],stove:[.91,.8],fridge:[.98,.85],cutlery:[.41,.35],crib:[1.33,1.88],toybox:[1.1,.72],starwall:[.65,.1],officechair:[.85,.85],deskorganizer:[.42,.36],vanity:[1.3,.79],curtains:[1.67,.1],chest:[1.24,.73],teatable:[1.3,1.17]
};
const TOP={coffee:.72,shelf:1.02,stool:.52,desk:.80,nightstand:.65,diningtable:.8,kitchenunit:.96,sink:.94,stove:.9,toybox:.69,vanity:.83,chest:.68,teatable:.66};
const WALL=new Set(['frame','window','mirror','clock','starwall','curtains']),SMALL=new Set(['tablelamp','books','mug','teddy','vase','candle','deskclock','teapot','cutlery','deskorganizer']);
const MATERIALS=['linen','velvet','oak','walnut','paint','ceramic','metal'];
const PURPOSES=['living','bedroom','kitchen','nursery','study'];
const DIFFICULTIES=['easy','normal','hard'];
const COLORS=['#e8a58f','#d6bd80','#8eae99','#8baab8','#bc9bb5','#e8d8bf','#a58f77','#d2a993'];
const PATTERNS=['plain','stripe','flower','gingham','berries','stars','daisy','dots','sprig','linen','plaster','panel'];
const FLOORS=['honey','walnut','painted','tile','blush','cherry','herringbone','terrazzo'];
const LAYOUTS=['classic','narrow','nook'];
function footprintFits(layout,item,w,d){
 if(WALL.has(item.type)){
  return layout!=='narrow'||item.wall!=='back'||Math.abs(item.x)+w/2<2.88;
 }
 const offsets=[[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]];
 return offsets.every(([dx,dz])=>{
  const x=item.x+dx,z=item.z+dz;
  return Math.abs(x)<=ROOM&&Math.abs(z)<=ROOM&&
   (layout!=='narrow'||Math.abs(x)<=2.89)&&
   (layout!=='nook'||x<=1.36||z<=1.25);
 });
}
const TASKS=[
 {title:'Тёплый вечер',text:'Обустрой уголок для тихих вечеров.',goals:[['sofa',1,'Мягкое место'],['rug',1,'Уютный ковёр'],['floorlamp',1,'Тёплый свет'],['mug',1,'Чашка на столе']]},
 {title:'Зелёная гостиная',text:'Новый жилец любит растения и книги.',goals:[['plant',2,'Два растения'],['chair',1,'Кресло для чтения'],['books',1,'Книги на мебели'],['frame',1,'Картина на стене']]},
 {title:'Первая квартира',text:'Каждой вещи — своё место.',goals:[['bed',1,'Удобная кровать'],['shelf',1,'Комод'],['tablelamp',1,'Лампа на столе'],['rug',1,'Ковёр под ногами']]},
 {title:'Дом для друзей',text:'Собери комнату, где всем будет удобно.',goals:[['sofa',1,'Диван'],['chair',1,'Кресло'],['coffee',1,'Столик'],['plant',1,'Живое растение']]},
 {title:'Читальный уголок',text:'Здесь читают сказки перед сном.',goals:[['chair',1,'Кресло возле лампы','near','floorlamp'],['books',1,'Книжки на столике'],['floorlamp',1,'Свет для чтения'],['rug',1,'Мягкий коврик']]},
 {title:'Чай у мишки',text:'Игрушки ждут гостей на чаепитие.',goals:[['teddy',1,'Медвежонок на столе'],['teapot',1,'Чайничек'],['mug',1,'Чашка рядом с чайником','near','teapot'],['coffee',1,'Стол для чаепития']]},
 {title:'Цветочный день',text:'Жильцы любят сад даже в помещении.',goals:[['cactus',1,'Маленький кактус'],['plant',1,'Растение возле окна','window'],['vase',1,'Ваза с цветами'],['window',1,'Окно с видом']]},
 {title:'Домик мечтателя',text:'Тёплый уголок, где рождаются истории.',goals:[['desk',1,'Письменный стол'],['deskclock',1,'Часы на столе'],['bookcase',1,'Этажерка'],['floorlamp',1,'Торшер у стола','near','desk']]},
 {title:'Сладкие сны',text:'Каждому сну — своё мягкое место.',goals:[['bed',1,'Кровать'],['nightstand',1,'Тумбочка у кровати','near','bed'],['tablelamp',1,'Ночник'],['pillow',1,'Подушечка']]},
 {title:'Маленький музей',text:'Самые красивые вещицы на виду.',goals:[['mirror',1,'Зеркальце'],['clock',1,'Настенные часы'],['frame',1,'Картина'],['vase',1,'Ваза на мебели']]},
 {title:'Плюшевое королевство',text:'Нужны объятия и много мягкости.',goals:[['loveseat',1,'Маленький диванчик'],['pouf',1,'Пуфик рядом','near','loveseat'],['teddy',1,'Игрушка на столе'],['basket',1,'Корзинка']]},
 {title:'Тихий вечер',text:'Оставь только мягкий свет и уют.',purpose:'living',goals:[['candle',1,'Свеча'],['floorlamp',1,'Лампа около дивана','near','sofa'],['sofa',1,'Диван'],['rug',1,'Плетёный коврик']]},
 {title:'Обед для друзей',text:'Собери обеденную зону, где всем найдётся место.',purpose:'kitchen',goals:[['diningtable',1,'Обеденный стол'],['diningchair',2,'Два стула возле стола','near','diningtable'],['cutlery',1,'Посуда на обеденном столе','on','diningtable'],['kitchenunit',1,'Шкаф для посуды']]},
 {title:'Кухня без тесноты',text:'Размести плиту, мойку и холодильник так, чтобы готовить было удобно.',purpose:'kitchen',goals:[['stove',1,'Плита'],['sink',1,'Мойка возле плиты','near','stove'],['fridge',1,'Холодильник отдельно от плиты','far','stove'],['kitchenunit',1,'Кухонный шкаф']]},
 {title:'Комната малыша',text:'Место для отдыха и игр.',purpose:'nursery',goals:[['crib',1,'Кроватка'],['toybox',1,'Ящик с игрушками у кроватки','near','crib'],['starwall',1,'Звезда на стене'],['rug',1,'Ковёр для игр']]},
 {title:'Рабочий день',text:'Оборудуй место для сосредоточенной работы.',purpose:'study',goals:[['desk',1,'Письменный стол'],['officechair',1,'Рабочее кресло у стола','near','desk'],['deskorganizer',1,'Органайзер на столе','on','desk'],['tablelamp',1,'Лампа на рабочем столе','on','desk']]},
 {title:'Утро у окна',text:'Тихая спальня с уютным туалетным столиком.',purpose:'bedroom',goals:[['bed',1,'Кровать'],['vanity',1,'Трюмо'],['curtains',1,'Шторы'],['tablelamp',1,'Лампа на трюмо','on','vanity']]},
 {title:'Игровая зона',text:'Устрой пространство для игр и творчества.',purpose:'nursery',goals:[['toybox',1,'Ящик с игрушками'],['teatable',1,'Столик для занятий'],['pouf',2,'Два пуфика рядом со столом','near','teatable'],['teddy',1,'Мишка на столике','on','teatable']]},
 {title:'Книжная тишина',text:'Книги, рабочий стол и хорошее освещение.',purpose:'study',goals:[['desk',1,'Стол рядом с этажеркой','near','bookcase'],['bookcase',1,'Этажерка'],['officechair',1,'Рабочий стул рядом со столом','near','desk'],['tablelamp',1,'Настольная лампа','lit','desk']]}

];
const TEMPLATES=[
 [
  {type:'rug',x:0,z:.75},{type:'sofa',x:0,z:-2.25,color:'#8eae99'},
  {type:'coffee',x:0,z:-.50},{type:'books',x:-.25,z:-.5,supportIndex:2},
  {type:'mug',x:.50,z:-.5,supportIndex:2,color:'#e8a58f'},
  {type:'chair',x:2.25,z:-.75,color:'#d6bd80'},
  {type:'floorlamp',x:2.75,z:-2.50},{type:'plant',x:-2.75,z:-2.5},
  {type:'frame',x:.25,z:-3.91,y:2.50,wall:'back'}
 ],
 [
  {type:'bed',x:-.75,z:-1.50,color:'#bc9bb5'},
  {type:'shelf',x:2.25,z:-2.75},
  {type:'rug',x:.25,z:1.50,color:'#d6bd80'},
  {type:'tablelamp',x:2.0,z:-2.75,supportIndex:1},
  {type:'books',x:2.50,z:-2.75,supportIndex:1},
  {type:'stool',x:2.75,z:.75},{type:'plant',x:-2.75,z:1.50},
  {type:'frame',x:1.0,z:-3.91,y:2.50,wall:'back'}
 ],
 [
  {type:'sofa',x:-1.25,z:-2.30,color:'#d2a993'},
  {type:'chair',x:2.60,z:-1.50,color:'#8baab8'},
  {type:'rug',x:.50,z:.75,color:'#bc9bb5'},
  {type:'coffee',x:.25,z:-.25},
  {type:'mug',x:.75,z:-.25,supportIndex:3},
  {type:'floorlamp',x:-2.75,z:1.25},
  {type:'plant',x:2.75,z:2.25},
  {type:'window',x:-3.91,z:1.0,y:2.5,wall:'left'}
 ]
];
const now=()=>Date.now();
const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
const n=v=>typeof v==='number'&&Number.isFinite(v);
const nearest=v=>Math.round(v*4)/4;
const size=item=>item.rot%2?[FOOT[item.type][1],FOOT[item.type][0]]:FOOT[item.type];
const isFloor=item=>!WALL.has(item.type)&&item.type!=='rug'&&!SMALL.has(item.type);
const announce=(s,to)=>[{type:'state',...(to?{to}:{}),payload:view(s)}];
const notice=(id,message)=>[{type:'notice',to:id,payload:message}];
function clean(raw,id,layout='classic'){
 if(!raw||typeof raw!=='object'||!FOOT[raw.type]||!n(raw.x)||!n(raw.z))return null;
 const type=raw.type,wall=raw.wall==='left'?'left':'back';
 const rot=WALL.has(type)?(wall==='left'?1:0):limit(Math.floor(Number(raw.rot)||0),0,3);
 const x=WALL.has(type)&&wall==='left'?(layout==='narrow'?-3.05:-3.91):nearest(raw.x),z=WALL.has(type)&&wall==='back'?-3.91:nearest(raw.z);
 const color=typeof raw.color==='string'&&/^#[0-9a-f]{6}$/i.test(raw.color)?raw.color:COLORS[2];
 return {id,type,x,z,rot,wall,color,y:WALL.has(type)?nearest(limit(n(raw.y)?raw.y:2.5,1,3.2)):0,
  variant:limit(Math.floor(Number(raw.variant)||0),0,2),support:SMALL.has(type)?String(raw.support||'').slice(0,80):null,
   material:MATERIALS.includes(raw.material)?raw.material:'linen'};
}
function valid(s,item,exclude=item.id){
 const m=FOOT[item.type];if(!m)return false;
 if(WALL.has(item.type)){
  const coord=item.wall==='left'?item.z:item.x;
  if(Math.abs(coord)>ROOM-m[0]/2||item.y<1||item.y>3.2||!footprintFits(s.layout,item,m[0],.1))return false;
  return s.items.every(other=>other.id===exclude||!WALL.has(other.type)||other.wall!==item.wall||
   Math.abs(coord-(item.wall==='left'?other.z:other.x))>(m[0]+FOOT[other.type][0])/2+.05||Math.abs(item.y-other.y)>1.65);
 }
 const [w,d]=size(item);
 if(!footprintFits(s.layout,item,w,d))return false;
 if(SMALL.has(item.type)){
  const host=s.items.find(i=>i.id===item.support);
  if(!host||!TOP[host.type])return false;
  const [hw,hd]=size(host);
  if(Math.abs(item.x-host.x)>(hw-w)/2-.005||Math.abs(item.z-host.z)>(hd-d)/2-.005)return false;
  return s.items.every(o=>o.id===exclude||o.support!==item.support||
   Math.abs(item.x-o.x)>=(w+size(o)[0])/2-.025||Math.abs(item.z-o.z)>=(d+size(o)[1])/2-.025);
 }
 if(item.type==='rug')return true;
 return s.items.every(o=>o.id===exclude||!isFloor(o)||
  Math.abs(item.x-o.x)>=(w+size(o)[0])/2+.08||Math.abs(item.z-o.z)>=(d+size(o)[1])/2+.08);
}
function targetScene(index){
 const items=TEMPLATES[index%TEMPLATES.length].map((def,i)=>{
  def={...def};
  if(index>=3&&['sofa','chair','bed','rug','plant'].includes(def.type)){
   const palette=['#8eae99','#bc9bb5','#d6bd80','#e8a58f','#8baab8'];
   def.color=palette[Math.floor(index/3)%5];
  }
  if(index>=6&&def.type==='mug')def.type='teapot';
  if(index>=9&&def.type==='plant')def.type='cactus';
  if(index>=12&&def.type==='stool')def.type='pouf';
  const item=clean({...def,rot:def.wall==='left'?1:0},'reference-'+i);
  if(item&&def.supportIndex!==undefined){
   item.support='reference-'+def.supportIndex;
   item.y=TOP[TEMPLATES[index%TEMPLATES.length][def.supportIndex].type]||0;
  }
  return item;
 }).filter(Boolean);
 return items;
}
function brief(s){
 if(s.mode!=='tenants')return [];
 const template=TASKS[s.template%TASKS.length];
 return template.goals.map(([type,required,label,rule,otherType])=>{
  const options=s.items.filter(i=>i.type===type&&(!SMALL.has(type)||!!i.support));
  const found=options.filter(item=>{
   if(rule==='on')return s.items.some(other=>other.id===item.support&&other.type===otherType);
   if(rule==='far')return s.items.some(other=>other.type===otherType&&Math.hypot(item.x-other.x,item.z-other.z)>3.15);
   if(rule==='lit')return s.items.some(other=>['floorlamp','tablelamp'].includes(other.type)&&Math.hypot(item.x-other.x,item.z-other.z)<2.5);
   if(rule==='window')return s.items.some(w=>w.type==='window'&&Math.hypot(item.x-w.x,item.z-w.z)<4.3);
   if(rule==='near')return s.items.some(other=>other.type===otherType&&other.id!==item.id&&Math.hypot(item.x-other.x,item.z-other.z)<2.65);
   return true;
  }).length;
  return {type,label,required,found,done:found>=required};
 });
}
function scoreMemory(s){
 const reference=s.target||[],choices=[...s.items],used=new Set();
 let points=0;
 for(const expected of reference){
  let best=-1,bestScore=0;
  choices.forEach((candidate,index)=>{
   if(used.has(index)||candidate.type!==expected.type)return;
   const dist=Math.hypot(expected.x-candidate.x,expected.z-candidate.z);
   const pos=limit(1-dist/2.3,0,1);
   const turn=candidate.rot===expected.rot?1:.35;
   const shade=candidate.color===expected.color?1:.6;
   const material=candidate.material===expected.material?1:.65;
   const support=Boolean(candidate.support)===Boolean(expected.support)?1:.45;
   const calc=pos*.58+turn*.17+shade*.12+material*.07+support*.06;
   if(calc>bestScore){best=index;bestScore=calc;}
  });
  if(best>=0){used.add(best);points+=bestScore;}
 }
 const extra=Math.max(0,choices.length-used.size);
 const objectScore=limit(100*points/Math.max(1,reference.length)-extra*3.5,0,100);
 const expected=s.targetFinishes||{};const actual=s.finishes||{};
 const match=['pattern','patternLeft','floor'].filter(k=>expected[k]===actual[k]).length;
 return Math.round(objectScore*.9+(match/3)*10);
}
function view(s){
 const safe={phase:s.phase,host:s.host,players:s.players,mode:s.mode,template:s.template,round:s.round,layout:s.layout,purpose:s.purpose||'living',difficulty:s.difficulty||'normal',
  brief:s.mode==='tenants'?TASKS[s.template%TASKS.length]:null,goals:brief(s),deadline:s.deadline,
  started:s.started,items:s.items,finishes:s.finishes,selections:s.selections,score:s.score,revision:s.revision,
  completed:s.completed};
 if(s.mode==='memory'&&(s.phase==='preview'||s.phase==='result')){safe.target=s.target;safe.targetFinishes=s.targetFinishes;}
 return safe;
}
function advance(s){
 const t=now();
 if(s.phase==='preview'&&t>=s.deadline){s.phase='build';s.deadline=t+(s.difficulty==='easy'?205000:s.difficulty==='hard'?120000:155000);s.items=[];s.selections={};s.revision++;}
 else if(s.phase==='build'&&t>=s.deadline)finish(s);
}
function finish(s){
 s.phase='result';s.completed=now();s.deadline=0;
 s.score=s.mode==='memory'?scoreMemory(s):Math.round(100*brief(s).filter(g=>g.done).length/4);
 s.selections={};s.revision++;
}
function update(s,raw,player){
 if(s.phase!=='build')return {state:s,events:notice(player.id,'Сначала дождитесь начала обустройства.')};
 const act=String(raw.type||''),id=String(raw.id||'').slice(0,80);
 const selected=s.selections||{};
 const current=s.items.find(i=>i.id===id);
 if(act==='add'){
  if(s.items.length>=64)return {state:s,events:notice(player.id,'Комната заполнена.')};
  const item=clean(raw.item,'room-'+(++s.serial),s.layout);
  if(!item)return {state:s,events:notice(player.id,'Не удалось поставить предмет.')};
  if(SMALL.has(item.type)){
   const host=s.items.find(i=>i.id===item.support);
   item.y=host?TOP[host.type]||0:0;
  }
  if(!valid(s,item))return {state:s,events:notice(player.id,'Здесь нет свободного места.')};
  s.items.push(item);s.revision++;
  return {state:s,events:announce(s)};
 }
 if(!current)return {state:s,events:notice(player.id,'Предмет уже убран.')};
 if(Object.entries(selected).some(([who,mark])=>who!==player.id&&mark?.id===id&&now()-mark.time<7000))
  return {state:s,events:notice(player.id,'Друг уже двигает этот предмет.')};
 if(act==='delete'){
  s.items=s.items.filter(i=>i.id!==id&&i.support!==id);
 }else if(act==='edit'){
  const next=clean({...current,...raw.patch,id},id,s.layout);
  if(!next||next.type!==current.type)return {state:s,events:notice(player.id,'Нельзя изменить тип предмета.')};
  if(SMALL.has(next.type)){
   const host=s.items.find(i=>i.id===next.support);
   next.y=host?TOP[host.type]||0:0;
  }
  // Supported accessories rotate/move along with the furniture carrying them.
  const children=s.items.filter(i=>i.support===id);
  const moved=children.map(i=>({...i}));
  const quarter=((next.rot-current.rot)%4+4)%4;
  const dx=next.x-current.x,dz=next.z-current.z;
  for(const child of moved){
   const ox=child.x-current.x,oz=child.z-current.z,angle=quarter*Math.PI/2;
   child.x=nearest(next.x+ox*Math.cos(angle)-oz*Math.sin(angle));
   child.z=nearest(next.z+ox*Math.sin(angle)+oz*Math.cos(angle));
  }
  const all=s.items;
  s.items=s.items.map(i=>i.id===id?next:(moved.find(c=>c.id===i.id)||i));
  if(!valid(s,next)||moved.some(c=>!valid(s,c))){s.items=all;return {state:s,events:notice(player.id,'Предмет сюда не помещается.')};}
 }else return {state:s,events:[]};
 delete selected[player.id];s.revision++;return {state:s,events:announce(s)};
}
const module={
 protocolVersion:1,
 createRoom({player}){return {state:{phase:'lobby',host:player.id,players:[player],mode:'tenants',template:0,layout:'classic',purpose:'living',difficulty:'normal',
   round:0,started:0,completed:0,deadline:0,items:[],target:[],targetFinishes:null,finishes:{wallColor:0,wallColorLeft:0,pattern:'plain',patternLeft:'plain',floor:'honey',evening:false},
   selections:{},revision:0,serial:0,score:null}};},
 onJoin({state,players}){
  if(players.length>MAX_PLAYERS)throw Error('room_full');
  state.players=players;state.revision++;return {state,events:announce(state)};
 },
 onLeave({state,player,players}){
  state.players=players;
  if(state.host===player.id)state.host=players[0]?.id||'';
  delete state.selections[player.id];
  state.revision++;return {state,events:announce(state)};
 },
 onMessage({state,player,payload}){
  const p=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  advance(state);
  if(p.type==='sync')return {state,events:announce(state,player.id)};
  if(p.type==='start'){
   if(player.id!==state.host)return {state,events:notice(player.id,'Начинает создатель комнаты.')};
   if(state.players.length<MIN_PLAYERS)return {state,events:notice(player.id,'Нужно минимум два игрока.')};
   if(state.phase!=='lobby'&&state.phase!=='result')return {state,events:notice(player.id,'Раунд уже идёт.')};
   if(!['tenants','memory'].includes(p.mode))return {state,events:notice(player.id,'Неизвестный режим.')};
   state.mode=p.mode;state.difficulty=DIFFICULTIES.includes(p.difficulty)?p.difficulty:'normal';
    state.template=state.round% (state.mode==='tenants'?TASKS.length:15);
    state.purpose=state.mode==='tenants'?TASKS[state.template].purpose||'living':['living','bedroom','study'][state.round%3];
   state.layout=state.mode==='memory'?'classic':LAYOUTS[state.round%LAYOUTS.length];
   state.round++;state.items=[];state.selections={};state.score=null;state.completed=0;state.started=now();
   const allTargets=state.mode==='memory'?targetScene(state.template):[];
    state.target=allTargets.slice(0,state.difficulty==='easy'?5:state.difficulty==='hard'?allTargets.length:7);
    state.targetFinishes=state.mode==='memory'?{pattern:PATTERNS[(state.template*3)%PATTERNS.length],patternLeft:PATTERNS[(state.template*2)%PATTERNS.length],floor:FLOORS[state.template%FLOORS.length]}:null;
   state.phase=state.mode==='memory'?'preview':'build';
   const times=state.difficulty==='easy'?[25000,240000]:state.difficulty==='hard'?[12000,135000]:[18000,190000];
    state.deadline=state.started+(state.mode==='memory'?times[0]:times[1]);
   state.revision++;return {state,events:announce(state)};
  }
  if(p.type==='skip_preview'&&state.phase==='preview'&&player.id===state.host){
   state.phase='build';state.items=[];state.selections={};state.deadline=now()+(state.difficulty==='easy'?205000:state.difficulty==='hard'?120000:155000);state.revision++;
   return {state,events:announce(state)};
  }
  if(p.type==='finish'&&state.phase==='build'&&player.id===state.host){finish(state);return {state,events:announce(state)};}
  if(p.type==='decorate'&&state.phase==='build'){
   const patch=p.patch&&typeof p.patch==='object'?p.patch:{};
   if(typeof patch.wallColor==='number'&&Number.isInteger(patch.wallColor)&&patch.wallColor>=0&&patch.wallColor<=5)state.finishes.wallColor=patch.wallColor;
   if(PATTERNS.includes(patch.pattern))state.finishes.pattern=patch.pattern;
   if(PATTERNS.includes(patch.patternLeft))state.finishes.patternLeft=patch.patternLeft;
   if(Number.isInteger(patch.wallColorLeft)&&patch.wallColorLeft>=0&&patch.wallColorLeft<=5)state.finishes.wallColorLeft=patch.wallColorLeft;
   if(FLOORS.includes(patch.floor))state.finishes.floor=patch.floor;
   if(typeof patch.evening==='boolean')state.finishes.evening=patch.evening;
   state.revision++;return {state,events:announce(state)};
  }
  if(p.type==='select'&&state.phase==='build'){
   const id=String(p.id||'').slice(0,80);
   const item=state.items.find(i=>i.id===id);
   if(!item){delete state.selections[player.id];return {state,events:announce(state)};}
   state.selections[player.id]={id,action:['move','rotate','paint','select'].includes(p.action)?p.action:'select',time:now()};
   return {state,events:announce(state)};
  }
  if(['add','edit','delete'].includes(p.type))return update(state,p,player);
  return {state,events:[]};
 }
};
export default module;
