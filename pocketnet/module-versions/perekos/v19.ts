// @ts-nocheck
// Perekos PocketNet v11: both legacy PvP and server-authoritative single-school rune duels.
// Six mechanically distinct fighters in three plain-language magic families.
// This data is frozen into the matching server ruleset version.
const mageEntry=(id,school,name,trait,description,style,speed,power,reload,shield)=>({id,school,name,trait,description,style,speed,power,reload,shield});
const SCHOOLS=Object.freeze([
 {id:'fire',name:'Жар',explain:'Горение от попаданий или поток огня вблизи.'},
 {id:'storm',name:'Ток',explain:'Пробой щитов или мгновенная молния.'},
 {id:'stone',name:'Камень',explain:'Осколочные валуны или фронт ударной волны.'}
]);
const MAGES=Object.freeze([
 mageEntry('kindle','fire','Искра','burn','Шар поджигает врага. «Дольше» продлевает горение.','orb',1,.95,1.04,.94),
 mageEntry('cinder','fire','Уголёк','miss_cool','Зажми атаку: непрерывный огненный поток на близкой дистанции.','flame',1.05,.92,.9,.9),
 mageEntry('wire','storm','Провод','dash_haste','Сквозь щиты пробивает быстрый болт, рывок ускоряет.','bolt',1.07,.86,1.04,.88),
 mageEntry('coil','storm','Катушка','guard_slow','Короткое накопление энергии, затем мгновенная молния и пробой щита.','arc',1.03,.98,.97,.96),
 mageEntry('pebble','stone','Галька','guard_extra','Замах, бросок по дуге и тяжёлое падение в точку прицела.','rock',.94,1.1,1.12,1.15),
 mageEntry('slate','stone','Плита','hit_push','Удар в землю после подготовки выпускает расходящуюся волну.','wave',.97,1.06,1.06,1.06)
]);
const MAGE_BY_ID=new Map(MAGES.map(x=>[x.id,x]));
function mage(id){return MAGE_BY_ID.get(id)||MAGES[0]}
function validMage(id){return typeof id==='string'&&MAGE_BY_ID.has(id)}

// Element pairs react only on an actual hit, never from a cosmetic particle.
const ELEMENTS=Object.freeze({
 fire:{label:'Жар',color:'#ed9765'},
 storm:{label:'Заряд',color:'#8bd8d1'},
 stone:{label:'Крошка',color:'#bcc49b'}
});
const REACTIONS=Object.freeze({
 'fire|storm':{id:'steam',label:'Пар',bonus:4,slow:.65,shield:0,heat:0,push:0},
 'fire|stone':{id:'slag',label:'Шлак',bonus:5,slow:0,shield:0,heat:5,push:0},
 'stone|storm':{id:'crack',label:'Пробой',bonus:2,slow:0,shield:10,heat:0,push:12}
});
function reactionFor(a,b){
 if(!ELEMENTS[a]||!ELEMENTS[b]||a===b)return null;
 return REACTIONS[[a,b].sort().join('|')]||null;
}
function isElement(id){return Object.hasOwn(ELEMENTS,id)}

// ПЕРЕКОС 0.6 — deterministic elemental rune grammar and three chain laboratory.
// Nine slots, across up to three independent WHEN chains, are read from left to right: WHEN -> DO -> CHANGE. A new WHEN starts a new chain.

const entry=(id,type,name,desc,detail='')=>({id,type,name,desc,detail});
const SCHOOL_FAVORITES={
 fire:new Set(['ball','blast','mine','strong','wide','on_cast','on_hit','drain','as_fire']),
 storm:new Set(['blink','slow','haste','quick','fastshot','on_dash','on_bounce','bounce','as_storm']),
 stone:new Set(['wall','armor','push','lasting','on_hurt','on_guard','on_break','strong','as_stone'])
};
const RUNES=Object.freeze([
entry('on_cast','when','При выстреле','Когда сам выпускаю обычный шар.'),
entry('on_hit','when','При попадании','Когда мой шар наносит урон.'),
entry('on_hurt','when','Когда меня бьют','Когда получаю урон здоровью.'),
entry('on_guard','when','После щита','Когда сам ставлю щит.'),
entry('on_dash','when','После рывка','Когда применяю рывок.'),
entry('on_break','when','Когда щит разбили','Когда последний щит пропадает от удара.'),
entry('on_bounce','when','При отскоке','Когда мой шар отскакивает от стены.'),
entry('on_heal','when','После лечения','Когда здоровье действительно восстановилось.'),
entry('on_close','when','Рядом с врагом','Раз в секунду, если враг близко.'),
entry('on_clock','when','Раз в две секунды','Пока идёт раунд, каждые две секунды.'),
entry('on_overload','when','При перегреве','Когда шкала перегрузки заполняется.'),
entry('on_expire','when','Когда шар пропал','Когда мой шар исчез, не попав в цель.'),
entry('ball','do','Выпустить шар','Дополнительный шар летит в сторону врага.'),
entry('heal','do','Подлечиться','Восстанавливаю 7 здоровья.'),
entry('armor','do','Добавить щит','Получаю 11 щита, но не больше 80.'),
entry('blast','do','Ударить рядом','Раню врага, если он близко.'),
entry('blink','do','Прыгнуть вперёд','Смещаюсь на 38 шагов по направлению взгляда.'),
entry('clone','do','Оставить копию','Копия дважды стреляет и исчезает.'),
entry('mine','do','Поставить мину','Мина взрывается рядом с врагом.'),
entry('wall','do','Поставить стену','Короткая каменная стена перекрывает выстрелы.'),
entry('push','do','Толкнуть врага','Отбрасываю близкого врага.'),
entry('slow','do','Замедлить врага','Враг движется медленнее две секунды.'),
entry('haste','do','Ускориться','Я двигаюсь быстрее две секунды.'),
entry('cool','do','Остудиться','Снимаю 22 единицы перегрузки.'),
entry('double','how','Сделать дважды','Предыдущее действие срабатывает дважды.'),
entry('triple','how','Сделать трижды','Предыдущее действие срабатывает трижды.'),
entry('strong','how','Сделать сильнее','Больше урона, щита или лечения.'),
entry('far','how','Дальше','Снаряд летит дальше, перемещение длиннее.'),
entry('bounce','how','От стены назад','Снаряд один раз отскакивает от стены.'),
entry('drain','how','Лечить от удара','Если созданный шар попал, лечусь на 3.'),
entry('lasting','how','Дольше','Стены, копии и эффекты живут дольше.'),
entry('wide','how','Пошире','Радиус взрыва и размер снаряда больше.'),
entry('cheap','how','Меньше нагрев','Эта цепочка создаёт меньше перегрузки.'),
entry('quick','how','Чаще','У этой цепочки короче пауза.'),
entry('reverse','how','В обратную сторону','Шар и прыжок идут в обратном направлении.'),
entry('fastshot','how','Быстрее летит','Снаряд летит быстрее, толчок сильнее.'),
entry('as_fire','how','Сделать горячим','Шар, мина или удар рядом оставляют жар.'),
entry('as_storm','how','Дать разряд','Шар, мина или удар рядом оставляют заряд.'),
entry('as_stone','how','Добавить камень','Шар, мина или удар рядом оставляют камень.')
]);
const RUNE_BY_ID=new Map(RUNES.map(r=>[r.id,r]));
const TYPES=Object.freeze({when:'КОГДА',do:'ЧТО',how:'КАК'});
const MAX_RUNES=9,MAX_CHAINS=3,MAX_CHAIN_DEPTH=3,MAX_REACTIONS_PER_TICK=20,MAX_QUEUE=48,HEAT_LIMIT=100;
function rune(id){return RUNE_BY_ID.get(id)||null}
function legalRunes(ids){return Array.isArray(ids)&&ids.length<=MAX_RUNES&&ids.filter(id=>RUNE_BY_ID.get(id)?.type==='when').length<=MAX_CHAINS&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&RUNE_BY_ID.has(id))}
function compile(ids){
 const chains=[];let chain=null,lastAction=null;
 for(const id of ids||[]){
  const r=rune(id);if(!r)continue;
  if(r.type==='when'){chain={trigger:id,actions:[]};chains.push(chain);lastAction=null}
  else if(r.type==='do'){if(chain){lastAction={id,mods:[]};chain.actions.push(lastAction)}}
  else if(lastAction)lastAction.mods.push(id);
 }
 return chains;
}
function description(ids){
 const chains=compile(ids),readable=[];
 for(const chain of chains){const title=rune(chain.trigger)?.name||'';for(const a of chain.actions){readable.push([title,rune(a.id).name,...a.mods.map(m=>rune(m).name)].join(' → '))}}
 const dormant=(ids||[]).filter(id=>!chains.some(c=>c.trigger===id||c.actions.some(a=>a.id===id||a.mods.includes(id))));
 return {chains,lines:readable,dormant,ready:readable.length>0};
}
function cooldown(mods){return mods.includes('quick')?.28:.56}
function heatCost(mods){return Math.max(2,Math.round((11+mods.length*4)*(mods.includes('cheap')?.38:1)))}
const ELEMENT_MODS=Object.freeze({as_fire:'fire',as_storm:'storm',as_stone:'stone'});
function chosenElement(mods=[],fallback='fire'){for(let i=mods.length-1;i>=0;i--)if(ELEMENT_MODS[mods[i]])return ELEMENT_MODS[mods[i]];return fallback}
function repetitions(mods){return mods.includes('triple')?3:mods.includes('double')?2:1}
function eligibleOffers(state,player=0){
 const ids=state.actors[player].runes,existing=new Set(ids),pool=RUNES.filter(r=>!existing.has(r.id));
 const info=description(ids);
 // A meaningful action is always favored when a newly opened trigger still has none.
 let pref=info.chains.some(c=>!c.actions.length)?'do':info.chains.length===0?'when':info.chains.some(c=>c.actions.some(a=>a.mods.length===0))?'how':'when';
 const favorites=SCHOOL_FAVORITES[mage(state.actors[player]?.mageId).school];
 const weight=r=>(r.type===pref?3:1)*(favorites.has(r.id)?1.6:1);
 const shuffled=[];const allowWhen=ids.filter(id=>RUNE_BY_ID.get(id)?.type==='when').length<MAX_CHAINS;
 while(pool.length){if(!allowWhen){for(let i=pool.length-1;i>=0;i--)if(pool[i].type==='when')pool.splice(i,1)}let total=0;for(const r of pool)total+=weight(r);let x=stateRandom(state)*total,chosen=pool.length-1;for(let i=0;i<pool.length;i++){x-=weight(pool[i]);if(x<0){chosen=i;break}}shuffled.push(pool.splice(chosen,1)[0].id)}
 return shuffled.slice(0,3);
}
function stateRandom(state){state.seed=(Math.imul(state.seed,1664525)+1013904223)>>>0;return state.seed/4294967296}
function chainMatches(id,event){return id===event}
function compilePreview(ids){const info=description(ids);return info.lines.length?info.lines:['Поставь после «КОГДА» руну «ЧТО». Порядок рун влияет на результат.']}

// ПЕРЕКОС — deterministic fixed-step combat and bounded rune events.




const W=400,H=620,STEP=1/60,ROUND_SECONDS=25,RUPTURE_SECONDS=600,EVOLUTION_SECONDS=60,COLLAPSE_SECONDS=90;
const WALLS=[{x:102,y:180,w:64,h:54},{x:232,y:385,w:66,h:56}];
// Shared pure continuous collision geometry. Identical source is in frozen PocketNet rules.
const GEOMETRY_EPS=1e-8;
const COLLISION_WALLS=[{x:102,y:180,w:64,h:54},{x:232,y:385,w:66,h:56}];
function segmentBox(x,y,dx,dy,r,b){
 const minX=b.x-r,maxX=b.x+b.w+r,minY=b.y-r,maxY=b.y+b.h+r;
 let near=-Infinity,far=Infinity,nx=0,ny=0;
 for(const [pos,delta,lo,hi,axis] of [[x,dx,minX,maxX,'x'],[y,dy,minY,maxY,'y']]){
  if(Math.abs(delta)<GEOMETRY_EPS){if(pos<lo||pos>hi)return null;continue}
  const t0=(lo-pos)/delta,t1=(hi-pos)/delta,entry=Math.min(t0,t1),exit=Math.max(t0,t1);
  if(entry>near){near=entry;nx=axis==='x'?(delta>0?-1:1):0;ny=axis==='y'?(delta>0?-1:1):0}
  far=Math.min(far,exit);
  if(near>far)return null;
 }
 if(far<0||near>1)return null;
 return {t:Math.max(0,near),nx,ny,exit:far};
}
function segmentCircle(x,y,dx,dy,r,c){
 const vx=x-c.x,vy=y-c.y,rr=r+c.r,A=dx*dx+dy*dy,C=vx*vx+vy*vy-rr*rr;
 if(C<=0){const d=Math.hypot(vx,vy)||1;return {t:0,nx:vx/d,ny:vy/d}}
 if(A<GEOMETRY_EPS)return null;
 const B=2*(vx*dx+vy*dy),D=B*B-4*A*C;if(D<0)return null;
 const t=(-B-Math.sqrt(D))/(2*A);if(t<0||t>1)return null;
 const hx=vx+dx*t,hy=vy+dy*t,d=Math.hypot(hx,hy)||1;
 return {t,nx:hx/d,ny:hy/d,exit:(-B+Math.sqrt(D))/(2*A)};
}
function firstCollision(s,x,y,dx,dy,r,owner,{actors=false,skipBarrier=-1}={}){
 let best=null;
 function offer(hit,type,index=-1){if(!hit||hit.t>1||hit.t<0)return;
  if(!best||hit.t<best.t-1e-7||(Math.abs(hit.t-best.t)<1e-7&&type!=='actor'&&best.type==='actor'))
    best={...hit,type,index,x:x+dx*hit.t,y:y+dy*hit.t};
 }
 const W=400,H=620;
 offer(segmentBox(x,y,dx,dy,0,{x:-10000,y:-10000,w:10019+r,h:20620}),'edge');
 offer(segmentBox(x,y,dx,dy,0,{x:381-r,y:-10000,w:10000,h:20620}),'edge');
 offer(segmentBox(x,y,dx,dy,0,{x:-10000,y:-10000,w:20400,h:10021+r}),'edge');
 offer(segmentBox(x,y,dx,dy,0,{x:-10000,y:599-r,w:20400,h:10000}),'edge');
 for(let i=0;i<COLLISION_WALLS.length;i++)offer(segmentBox(x,y,dx,dy,r,COLLISION_WALLS[i]),'wall',i);
 for(let i=0;i<(s?.barriers?.length||0);i++){
  if(i===skipBarrier)continue;
  const b=s.barriers[i];if(b.aperture&&b.owner===owner)continue;
  offer(segmentCircle(x,y,dx,dy,r,b),'barrier',i);
 }
 if(actors&&Number.isInteger(owner)&&s?.actors?.[1-owner]){
  const t=s.actors[1-owner];if(t.hp>0)offer(segmentCircle(x,y,dx,dy,r,{x:t.x,y:t.y,r:12}),'actor',1-owner);
 }
 return best;
}
function rayCollision(s,x,y,angle,distance,r=3,owner=null,actors=false){
 const dx=Math.cos(angle)*distance,dy=Math.sin(angle)*distance;
 const hit=firstCollision(s,x,y,dx,dy,r,owner,{actors});
 return {length:hit?Math.max(0,distance*hit.t):distance,hit};
}


const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mag=(x,y)=>Math.hypot(x,y)||1;
function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296}
function has(a,k){return a.runes.includes(k)}
const ARCHETYPES=Object.freeze([{id:'striker',name:'Стрелок',desc:'Чаще атакует. Увеличены урон и скорость снарядов.'},{id:'shaper',name:'Формирователь',desc:'Крепче щиты и больше длительность, радиус полей, мин и стен.'},{id:'distorter',name:'Искажатель',desc:'Попадания замедляют и перегревают врага.'}]);
function validArchetype(id){return ARCHETYPES.some(a=>a.id===id)}

function stats(a){if(a.magicSchool)return {max:100,speed:125*(a.haste>0?1.35:1)*(a.slow>0?.68:1),damage:12,reload:.56,shield:34};const m=mage(a.mageId),role=a.archetype||'striker';return {max:100,speed:125*m.speed*(a.haste>0?1.35:1)*(a.slow>0?.68:1),damage:12*m.power*(role==='striker'?1.025:1),reload:.56*m.reload*(role==='striker'?.98:1),shield:34*m.shield*(role==='shaper'?1.27:1)}}
function actor(id,x,y,runes,mageId='kindle',archetype='striker'){return {archetype:validArchetype(archetype)?archetype:'striker',evolution:null,fusions:[],id,x,y,mageId:validMage(mageId)?mageId:'kindle',vx:0,vy:0,hp:100,shield:0,face:id===0?0:Math.PI,cast:0,guard:0,dash:0,dashReady:0,shieldReady:0,stun:0,flash:0,runes:[...runes],kills:0,hit:0,aiT:0,aiMove:1,invuln:0,heat:0,overloadCd:0,runeTimers:{},haste:0,slow:0,mark:'',markLife:0,reactionCd:0,reactionsDone:0,burn:0,burnTick:0,burnSource:null,windup:null,flameCharge:0,respawn:0,specialCd:0}}
function freshActor(a){const o=actor(a.id,a.id===0?64:336,a.id===0?484:134,a.runes,a.mageId,a.archetype||'striker');o.hp=stats(o).max;o.evolution=a.evolution?{...a.evolution}:null;o.fusions=[...(a.fusions||[])];if(a.magicSchool)o.magicSchool=a.magicSchool;return o}
function makeMatch(seed=0x718abc,first='kindle',second='pebble',gameMode='duel',firstArchetype='striker',secondArchetype='striker'){const kind=['rupture','duel','forge'].includes(gameMode)?gameMode:'duel';const s={version:4,gameMode:kind,seed:seed>>>0||1,phase:'fight',round:1,remaining:kind==='rupture'?RUPTURE_SECONDS:kind==='forge'?0:ROUND_SECONDS,forgeDummy:true,elapsed:0,nextEvolution:RUPTURE_SECONDS-EVOLUTION_SECONDS,coreHold:[0,0],overtime:0,score:[0,0],draws:0,lastOutcome:'',elementCombos:[0,0],actors:[actor(0,64,484,['on_hurt','armor'],first,firstArchetype),actor(1,336,134,['on_hurt','armor'],second,secondArchetype)],shots:[],streams:[],beams:[],waves:[],lobs:[],echoes:[],mines:[],barriers:[],fields:[],eventQueue:[],fx:[],pick:[],log:[],ticks:0,serial:0,champion:null};s.actors=s.actors.map(freshActor);return s}
const EVOLUTIONS=Object.freeze([{id:'beam',name:'Разящий луч',desc:'Атака выпускает толстый пробивной луч. Уровень усиливает урон и ширину.'},{id:'swarm',name:'Искровой рой',desc:'Атака выпускает веер дополнительных зарядов. Уровень увеличивает их число.'},{id:'field',name:'Грозовое поле',desc:'Атака оставляет опасную зону. Уровень увеличивает её размер и длительность.'}]);
const FUSIONS=Object.freeze([{id:'ember_nova',name:'Огненное сердце',mod:'as_fire',desc:'Огненный рунический снаряд взрывается и поджигает.'},{id:'storm_lattice',name:'Грозовая решётка',mod:'as_storm',desc:'Заряженный рунический снаряд выпускает дуги при попадании.'},{id:'stone_crush',name:'Каменный захват',mod:'as_stone',desc:'Каменные снаряды ломают щит и замедляют.'}]);
function availableFusions(a){return FUSIONS.filter(f=>!(a.fusions||[]).includes(f.id)&&compile(a.runes).some(c=>c.actions.some(x=>['ball','blast','mine'].includes(x.id)&&x.mods.includes(f.mod))))}
function grantEvolution(a,kind,id){
 if(kind==='mutate'){
  if(!EVOLUTIONS.some(f=>f.id===id))return false;
  const level=a.evolution?.form===id?a.evolution.level+1:1;if(level>3)return false;
  a.evolution={form:id,level};return true;
 }
 if(kind==='fuse'){if(!availableFusions(a).some(f=>f.id===id))return false;(a.fusions||(a.fusions=[])).push(id);return true}
 return false;
}

function offers(s){return eligibleOffers(s)}
// Choosing a rune opens the working table. Players may reorder before returning to battle.
function chooseRune(s,id,replaceIndex=null){
 if(s.phase!=='draft'||!s.pick.includes(id))return false;
 const a=s.actors[0];
 if(a.runes.length===9){if(!Number.isInteger(replaceIndex)||replaceIndex<0||replaceIndex>=9)return false;a.runes[replaceIndex]=id}
 else a.runes.push(id);
 const bot=s.actors[1], pool=RUNES.filter(r=>!bot.runes.includes(r.id));
 if(pool.length){const avail=pool.filter(r=>r.type!=='when'||bot.runes.filter(id=>RUNES.find(z=>z.id===id)?.type==='when').length<3);const picked=avail[Math.floor(random(s)*avail.length)];if(picked){if(bot.runes.length===9)bot.runes[Math.floor(random(s)*9)]=picked.id;else bot.runes.push(picked.id)}}
 s.pick=[];s.phase='build';return true;
}
function chooseEvolution(s,kind,id){
 if(s.phase!=='draft'||s.gameMode!=='rupture'||!grantEvolution(s.actors[0],kind,id))return false;
 const bot=s.actors[1];
 if(s.round%3===0)grantEvolution(bot,'mutate',{fire:'field',storm:'swarm',stone:'beam'}[mage(bot.mageId).school]);
 else{const offers=eligibleOffers(s,1),pick=offers[0];if(pick){if(bot.runes.length>=9)bot.runes[0]=pick;else bot.runes.push(pick)}}
 s.pick=[];s.phase='build';return true;
}
function reorderRunes(s,from,to){
 if(s.phase!=='build')return false;const slots=s.actors[0].runes;
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=slots.length||to>=slots.length)return false;
 const [id]=slots.splice(from,1);slots.splice(to,0,id);return true;
}
function beginRound(s){if(s.phase!=='build')return false;startRound(s);return true}
function startRound(s){
 if(s.gameMode==='rupture'||s.gameMode==='forge'){
  s.phase='fight';s.shots=[];s.streams=[];s.beams=[];s.waves=[];s.lobs=[];s.echoes=[];s.mines=[];s.barriers=[];s.fields=[];s.eventQueue=[];s.pick=[];s.fx=[];s.coreHold=[0,0];
  for(const a of s.actors){a.heat=0;a.overloadCd=0;a.runeTimers={};a.cast=0;a.windup=null;}
  return;
 }
 s.phase='fight';s.round=s.score[0]+s.score[1]+s.draws+1;s.remaining=ROUND_SECONDS;s.overtime=0;
 s.actors=s.actors.map(freshActor);s.shots=[];s.streams=[];s.beams=[];s.waves=[];s.lobs=[];s.echoes=[];s.mines=[];s.barriers=[];s.fields=[];s.eventQueue=[];s.pick=[];s.fx=[];s.ticks=0;s.reactions=0;
}
function retryMatch(s){return makeMatch((s.seed+0x9e3779b9)>>>0)}
function distWall(x,y,r=0){return WALLS.some(w=>x+r>w.x&&x-r<w.x+w.w&&y+r>w.y&&y-r<w.y+w.h)}
function canStand(x,y,r=12){return x>=r+13&&x<=W-r-13&&y>=r+16&&y<=H-r-16&&!distWall(x,y,r)}
function collapseActive(s){return s.gameMode==='forge'?false:s.gameMode==='rupture'?s.remaining<COLLAPSE_SECONDS:s.remaining<10}
function ringRadius(s){return s.gameMode==='forge'?230:s.gameMode==='rupture'?(s.remaining>=COLLAPSE_SECONDS?230:Math.max(78,78+152*s.remaining/COLLAPSE_SECONDS)):(s.remaining>=10?230:Math.max(80,80+15*s.remaining))}
let safeWorld=null;const blocking=(s,x,y,r=12)=>!!s?.barriers?.some(b=>Math.hypot(x-b.x,y-b.y)<r+b.r);function move(a,x,y,r=12){const nx=clamp(a.x+x,r+13,W-r-13),ny=clamp(a.y+y,r+16,H-r-16);if(canStand(nx,a.y,r)&&!blocking(safeWorld,nx,a.y,r))a.x=nx;if(canStand(a.x,ny,r)&&!blocking(safeWorld,a.x,ny,r))a.y=ny}
function fx(s,k,x,y,t=0){if(s.fx.length>60)s.fx.shift();s.fx.push({k,x,y,t,id:++s.serial})}
function harm(s,a,amount,from,depth=0){
 if(a.invuln>0||a.hp<=0||!Number.isFinite(amount))return 0;
 const attacker=from==null?null:s.actors[from],base=amount;const blocked=Math.min(a.shield,Math.max(0,base)),before=a.shield;a.shield-=blocked;
 const d=Math.max(0,Math.min(80,base-blocked));a.hp=Math.max(0,a.hp-d);a.flash=.15;
 if(d>0){if(from!=null&&from!==a.id)s.actors[from].hit+=d;if(!s.magicModeV2&&attacker?.archetype==='distorter'&&attacker.id!==a.id){a.slow=Math.max(a.slow,.48);a.heat=Math.min(HEAT_LIMIT,a.heat+3)}emit(s,'on_hurt',a.id,{from},depth)}
 if(blocked>0&&before>0&&a.shield===0)emit(s,'on_break',a.id,{from},depth);
 fx(s,'hit',a.x,a.y);return d;
}
// Global per-caster allowance for concurrent DoTs and persistent hazards.
// Primary spell impacts still do their full intended damage.
const V2_SECONDARY_HP_BUDGET=12,V2_SECONDARY_WINDOW_TICKS=60;
function harmSecondary(s,target,amount,source,depth=0){
 if(!s.magicModeV2||source==null)return harm(s,target,amount,source,depth);
 const caster=s.actors[source];
 if(!caster||!Number.isFinite(amount)||amount<=0)return 0;
 const window=caster.v2SecondaryWindow||{start:s.ticks,spent:0};
 if(s.ticks<window.start||s.ticks-window.start>=V2_SECONDARY_WINDOW_TICKS){
  window.start=s.ticks;window.spent=0;
 }
 caster.v2SecondaryWindow=window;
 const permitted=Math.min(amount,Math.max(0,V2_SECONDARY_HP_BUDGET-window.spent));
 if(permitted<=0)return 0;
 // Shields/invulnerability spend budget too; cannot store unused damage.
 window.spent+=permitted;
 return harm(s,target,permitted,source,depth);
}
function markTarget(s,target,element,source,depth=0){
 if(s.magicModeV2)return null;
 if(!isElement(element)||target.hp<=0)return null;
 const previous=target.markLife>0?target.mark:'';
 const reaction=target.reactionCd<=0?reactionFor(previous,element):null;
 target.mark=element;target.markLife=3.8;
 if(!reaction)return null;
 target.reactionCd=.9;
 const attacker=s.actors[source];
 if(attacker){attacker.reactionsDone++;s.elementCombos[source]++}
 if(reaction.shield)target.shield=Math.max(0,target.shield-reaction.shield);
 if(reaction.bonus)harm(s,target,reaction.bonus,source,Math.min(3,depth+1));
 if(reaction.slow)target.slow=Math.max(target.slow,reaction.slow);
 if(reaction.heat)target.heat=Math.min(HEAT_LIMIT,target.heat+reaction.heat);
 if(reaction.push&&attacker){const d=mag(target.x-attacker.x,target.y-attacker.y);move(target,(target.x-attacker.x)/d*reaction.push,(target.y-attacker.y)/d*reaction.push)}
 fx(s,'react_'+reaction.id,target.x,target.y);
 return reaction.id;
}
function receiveHeal(s,a,amount,depth=0){const old=a.hp;a.hp=Math.min(stats(a).max,a.hp+amount);const delta=a.hp-old;if(delta>0){emit(s,'on_heal',a.id,{},depth);fx(s,'heal',a.x,a.y)}return delta}
function spawnShot(s,a,dir,x=a.x,y=a.y,options={}){
 if(s.shots.length>=80)return false;
 const base=mage(a.mageId),style=options.clone?'echo':options.style||base.style,element=options.element||base.school;const v=(options.signature&&a.mageId==='kindle'?174:options.signature&&a.mageId==='wire'?480:style==='bolt'||style==='arc'?365:style==='rock'?198:style==='wave'?205:style==='flame'?260:252)*(options.fastshot?1.35:1)*(a.archetype==='striker'?1.035:1),speed=Number.isFinite(v)?v:252;
 s.shots.push({x,y,vx:Math.cos(dir)*speed,vy:Math.sin(dir)*speed,owner:a.id,
  style,element,accel:options.signature?(a.mageId==='kindle'?490:a.mageId==='wire'?-380:0):0,
  minSpeed:options.signature&&a.mageId==='kindle'?310:options.signature&&a.mageId==='wire'?300:0,
  damage:Number.isFinite(options.damage)?options.damage:options.clone?6:stats(a).damage*(options.strong?1.6:1),life:options.life??(options.far?1.8:1.15)*(style==='arc'?.84:style==='rock'?1.2:style==='wave'?.65:1),
  bounces:options.bounce?1:0,drain:!!options.drain,r:options.wide?10:style==='wave'?12:style==='rock'?8:style==='bolt'?3:options.clone?4:5,depth:options.depth||0,fusion:options.fusion!==false,evo:!!options.evo,phase:options.phase||0});
 fx(s,'shoot',x,y);return true;
}

/* Each mage has a distinct physical attack. All hit-tests use the fixed-step
   court geometry; these forms are state, not client-only cosmetic guesses. */
function mastery(a,id){return compile(a.runes).some(chain=>chain.actions.some(action=>action.mods.includes(id)))}
function beamLength(s,x,y,angle,range,owner=null){return rayCollision(s,x,y,angle,range,3,owner).length}
function insideCone(a,b,angle,reach,halfAngle){
 const dx=b.x-a.x,dy=b.y-a.y,r=Math.hypot(dx,dy);
 return r<=reach+12&&Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-angle),Math.cos(Math.atan2(dy,dx)-angle)))<=halfAngle;
}
function startWindup(s,a,target,kind){
 const durations={pebble:.27,coil:.19,slate:.13};
 const duration=durations[kind]*(mastery(a,'quick')?.74:1);
 const angle=Math.atan2(target.y-a.y,target.x-a.x);
 a.face=angle;
 a.windup={kind,angle,remaining:duration,total:duration,
  x:clamp(Number.isFinite(target.x)?target.x:a.x,24,W-24),y:clamp(Number.isFinite(target.y)?target.y:a.y,25,H-25)};
 a.cast=stats(a).reload*(mastery(a,'quick')?.88:1)+duration;
 fx(s,'charge_'+kind,a.x,a.y);
 return true;
}
function throwBoulder(s,a,w){
 if(s.lobs.length>=12)return false;
 const reach=mastery(a,'far')?295:252,
 dx=w.x-a.x,dy=w.y-a.y,dist=Math.hypot(dx,dy)||1,scale=Math.min(1,reach/dist);
 const x=clamp(a.x+dx*scale,23,W-23),y=clamp(a.y+dy*scale,25,H-25);
 const length=Math.hypot(x-a.x,y-a.y),duration=.48+length/640;
 s.lobs.push({owner:a.id,sx:a.x,sy:a.y,x:a.x,y:a.y,tx:x,ty:y,
  progress:0,duration,age:0,height:0,apex:mastery(a,'strong')?60:49,
  radius:mastery(a,'wide')?42:33,damage:mastery(a,'strong')?23:19,element:'stone'});
 addHeat(s,a,mastery(a,'cheap')?4:8);
 fx(s,'hurl',a.x,a.y);emit(s,'on_cast',a.id);return true;
}
function releaseWindup(s,a,w){
 if(a.stun>0)return false; // interrupt and refund no heat; cooldown remains
 a.face=w.angle;
 if(w.kind==='pebble')return throwBoulder(s,a,w);
 if(w.kind==='coil'){thunder(s,a);return true}
 if(w.kind==='slate'){slateWave(s,a);return true}
 return false;
}

// Actual secondary contact geometry. All aspects use the same server state,
// explicit object caps and independent arming / cooldowns as ordinary spells.
function v2Aftermath(s,owner,impact,x,y){
 if(!impact||s.mines.length>=14)return;
 if(impact==='st_impact_rubble'){
  if(!canStand(x,y,10)||blocking(s,x,y,10))return;
  if(s.mines.filter(m=>m.owner===owner&&m.v2Rubble).length>=3)return;
  s.mines.push({owner,x,y,r:27,life:1.55,arm:.19,
   damage:3.3,element:'stone',v2Rubble:true,afterCd:0});
  fx(s,'fracture',x,y);
 }else if(impact==='fi_impact_wildfire'){
  if(s.mines.filter(m=>m.owner===owner&&m.v2Wildfire).length>=6)return;
  // Spread into two side petals, never into a wall or through temporary cover.
  const angle=s.actors[owner].face||0;
  const candidates=[[x,y],[x-Math.sin(angle)*30,y+Math.cos(angle)*30],
   [x+Math.sin(angle)*30,y-Math.cos(angle)*30]];
  for(const [cx,cy] of candidates){
   if(s.mines.length>=14||s.mines.filter(m=>m.owner===owner&&m.v2Wildfire).length>=6)break;
   if(!canStand(cx,cy,9)||blocking(s,cx,cy,9)||!unobstructed(s,x,y,cx,cy,owner,7))continue;
   s.mines.push({owner,x:cx,y:cy,r:21,life:1.65,arm:.15,
    damage:1.75,element:'fire',v2Wildfire:true,afterCd:0});
  }
  fx(s,'flame',x,y);
 }
}
function v2ChainContact(s,owner,x,y){
 const caster=s.actors[owner],target=s.actors[1-owner];
 const gate='v2:chain-contact';
 if(!target||target.hp<=0||s.ticks<(caster.runeTimers[gate]||0)||s.beams.length>=14)return;
 const pylons=s.barriers.filter(b=>b.owner===owner&&b.v2Pylon&&b.hp>0
  &&Math.hypot(b.x-x,b.y-y)<=152);
 const p=pylons.find(b=>{
  const court={...s,barriers:s.barriers.filter(node=>node!==b)};
  return unobstructed(court,x,y,b.x,b.y,owner,8)
   &&Math.hypot(target.x-b.x,target.y-b.y)<=130
   &&unobstructed(court,b.x,b.y,target.x,target.y,owner,7);
 });
 if(!p)return;
 // Two visible discharge segments, at most one bounded relay per .84 seconds.
 for(const [ax,ay,bx,by] of [[x,y,p.x,p.y],[p.x,p.y,target.x,target.y]]){
  const angle=Math.atan2(by-ay,bx-ax);
  s.beams.push({owner,x:ax,y:ay,angle,length:Math.hypot(bx-ax,by-ay),
   life:.24,width:3,element:'storm',style:'evo-beam',v2Chain:true});
 }
 caster.runeTimers[gate]=s.ticks+Math.ceil(.84/STEP);
 target.shield=Math.max(0,target.shield-1.4);
 const dealt=harmSecondary(s,target,3.8,owner,1);
 if(dealt>0){target.slow=Math.max(target.slow,.3);emit(s,'on_hit',owner,{},1)}
 fx(s,'impact_arc',p.x,p.y);
}
function v2Contact(s,owner,impact,x,y){
 if(impact==='li_impact_chain')v2ChainContact(s,owner,x,y);
 else v2Aftermath(s,owner,impact,x,y);
}

function updateLobs(s,dt){
 for(let i=s.lobs.length-1;i>=0;i--){
  const q=s.lobs[i];q.age=Math.min(q.duration,q.age+dt);
  const p=q.age/q.duration;q.progress=p;
  // Ease-in kinetic advance, then rapid groundward descent. Ground projection
  // and shadow use identical authoritative coordinates.
  const advance=p*p;
  q.x=q.sx+(q.tx-q.sx)*advance;q.y=q.sy+(q.ty-q.sy)*advance;
  q.height=q.apex*4*p*(1-p);
  if(p<1)continue;
  const target=s.actors[1-q.owner],range=Math.hypot(target.x-q.tx,target.y-q.ty);
  if(range<q.radius+12&&unobstructed(s,q.tx,q.ty,target.x,target.y,q.owner,7)){
   const falloff=range<=13?1:Math.max(.36,1-(range-13)/(q.radius+12)*.65);
   const dealt=harm(s,target,q.damage*falloff,q.owner);
   if(dealt>0){
    markTarget(s,target,q.element,q.owner);
    if(q.v2Comet){target.burn=Math.max(target.burn||0,1.45);target.burnSource=q.owner}
    else target.slow=Math.max(target.slow,.65);
    emit(s,'on_hit',q.owner);
   }
  }
  v2Contact(s,q.owner,q.v2Impact,q.tx,q.ty);
  if(q.v2Monolith&&s.barriers.length<10&&canStand(q.tx,q.ty,18)
    &&!blocking(s,q.tx,q.ty,18)){
   s.barriers.push({owner:q.owner,x:q.tx,y:q.ty,r:18,life:3.6,hp:38,v2Monolith:true});
  }
  if(q.v2Comet&&s.mines.length<14&&canStand(q.tx,q.ty,9)
    &&!blocking(s,q.tx,q.ty,9)){
   s.mines.push({owner:q.owner,x:q.tx,y:q.ty,r:36,life:2.25,
    arm:.16,damage:2.5,element:'fire',v2Crater:true,craterCd:0});
  }
  fx(s,q.v2Comet?'impact_flame':'impact_rock',q.tx,q.ty);
  if(!q.v2Comet)fx(s,'fracture',q.tx,q.ty);
  s.lobs.splice(i,1);
 }
}
function flame(s,a,target){
 const angle=Math.atan2(target.y-a.y,target.x-a.x),baseReach=mastery(a,'far')?239:210;
 a.flameCharge=Math.min(1,(a.flameCharge||0)+STEP*7.7);
 const reach=baseReach*(.24+.76*a.flameCharge);
 const length=beamLength(s,a.x,a.y,angle,reach,a.id),width=(mastery(a,'wide')?43:32)*(.42+.58*a.flameCharge);
 a.face=angle;
 if(a.stun>0)return false;
 s.streams.push({owner:a.id,x:a.x,y:a.y,angle,length,width,charge:a.flameCharge});
 if(a.cast>0||a.stun>0)return false;
 a.cast=mastery(a,'quick')?.105:.14;
 const other=s.actors[1-a.id],dx=other.x-a.x,dy=other.y-a.y;
 const forward=dx*Math.cos(angle)+dy*Math.sin(angle),side=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));
 if(forward>0&&forward<length+10&&side<width*(.25+forward/Math.max(1,length)*.18)+9){
  const dealt=harm(s,other,mastery(a,'strong')?5.2:4.05,a.id);
  if(dealt>0){markTarget(s,other,'fire',a.id);other.burn=Math.max(other.burn,mastery(a,'lasting')?2.3:1.2);other.burnSource=a.id;emit(s,'on_hit',a.id)}
 }
 addHeat(s,a,mastery(a,'cheap')?1:2.4);fx(s,'flame',a.x+Math.cos(angle)*20,a.y+Math.sin(angle)*20);
 emit(s,'on_cast',a.id);return true;
}
function thunder(s,a){
 const reach=mastery(a,'far')?290:242,len=beamLength(s,a.x,a.y,a.face,reach,a.id);
 s.beams.push({owner:a.id,x:a.x,y:a.y,angle:a.face,length:len,life:.24,style:'coil'});
 const other=s.actors[1-a.id],dx=other.x-a.x,dy=other.y-a.y,
  along=dx*Math.cos(a.face)+dy*Math.sin(a.face),side=Math.abs(-dx*Math.sin(a.face)+dy*Math.cos(a.face));
 if(along>0&&along<len+10&&side<15){
  other.shield=Math.max(0,other.shield-(mastery(a,'strong')?13:7));other.slow=Math.max(other.slow,.32);
  const dealt=harm(s,other,mastery(a,'strong')?13:10.5,a.id);
  if(dealt>0){markTarget(s,other,'storm',a.id);other.slow=Math.max(other.slow,.65);emit(s,'on_hit',a.id)}
  fx(s,'impact_arc',other.x,other.y);
 }
 addHeat(s,a,mastery(a,'cheap')?5:10);fx(s,'thunder',a.x,a.y);emit(s,'on_cast',a.id);
}
function slateWave(s,a){
 const reach=mastery(a,'far')?133:112;
 s.waves.push({owner:a.id,x:a.x,y:a.y,angle:a.face,range:reach,reach:0,halfAngle:mastery(a,'wide')?.75:.53,life:.3,hit:false});
 addHeat(s,a,mastery(a,'cheap')?4:8);fx(s,'quake',a.x,a.y);emit(s,'on_cast',a.id);
}
function processWave(s,w){
 const other=s.actors[1-w.owner];w.life-=STEP;
 if(w.warmup>0){w.warmup=Math.max(0,w.warmup-STEP);return}
 w.reach=Math.min(w.range,w.reach+w.range*STEP/.23);
 if(w.hit||!insideCone(w,other,w.angle,w.reach,w.halfAngle))return;
 const d=Math.hypot(other.x-w.x,other.y-w.y);
 if(d>beamLength(s,w.x,w.y,Math.atan2(other.y-w.y,other.x-w.x),d+3,w.owner)+6)return;
 w.hit=true;
 const attacker=s.actors[w.owner],dealt=harm(s,other,
  w.v2Element?Math.min(18,Math.max(1,w.damage||10)):mastery(attacker,'strong')?18:15,w.owner);
 const k=mag(other.x-w.x,other.y-w.y);
 move(other,(other.x-w.x)/k*18,(other.y-w.y)/k*18);
 if(dealt>0){
  if(w.v2Element==='fire'){other.burn=Math.max(other.burn||0,1.2);other.burnSource=w.owner}
  else other.slow=Math.max(other.slow,w.v2Fault?.85:.45);
  if(!w.v2Element)markTarget(s,other,'stone',w.owner);
  emit(s,'on_hit',w.owner);
 }
 if(dealt>0)v2Contact(s,w.owner,w.v2Impact,other.x,other.y);
 fx(s,'impact_wave',other.x,other.y);
}
function unobstructed(s,fromX,fromY,targetX,targetY,owner,margin=8){
 const dx=targetX-fromX,dy=targetY-fromY,distance=Math.hypot(dx,dy);
 return distance<=1||beamLength(s,fromX,fromY,Math.atan2(dy,dx),distance+3,owner)>=distance-margin;
}
function rockFracture(s,q,x,y){
 if(q.style!=='rock')return;
 const target=s.actors[1-q.owner],d=Math.hypot(x-target.x,y-target.y);
 if(d<(mastery(s.actors[q.owner],'wide')?49:37)&&unobstructed(s,x,y,target.x,target.y,q.owner,7)){
  const dealt=harm(s,target,mastery(s.actors[q.owner],'strong')?4:2.5,q.owner,q.depth);
  if(dealt>0){markTarget(s,target,'stone',q.owner,q.depth);target.slow=Math.max(target.slow,.55);emit(s,'on_hit',q.owner,{},q.depth)}
 }
 fx(s,'fracture',x,y);
}


function castEvolution(s,a){
 if(!['rupture','forge'].includes(s.gameMode)||!a.evolution||a.hp<=0)return;
 const {form,level}=a.evolution,element=mage(a.mageId).school,enemy=s.actors[1-a.id],angle=a.face;
 if(form==='beam'){
  const length=beamLength(s,a.x,a.y,angle,175+level*45,a.id),width=(5+level*5)*(a.archetype==='shaper'?1.25:1);
  s.beams.push({owner:a.id,x:a.x,y:a.y,angle,length,width,life:.25,style:'evo-beam',element,level});
  const dx=enemy.x-a.x,dy=enemy.y-a.y,front=dx*Math.cos(angle)+dy*Math.sin(angle),side=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));
  if(front>0&&front<length+12&&side<width+12){const hit=harm(s,enemy,3+level*2.4,a.id);if(hit>0){markTarget(s,enemy,element,a.id);enemy.slow=Math.max(enemy.slow,.15+level*.1);fx(s,'impact_arc',enemy.x,enemy.y)}}
 }else if(form==='swarm'){
  const count=2+level*2+(a.archetype==='striker'?1:0);
  for(let i=0;i<count;i++)spawnShot(s,a,angle+(i-(count-1)/2)*(.17+level*.015),a.x,a.y,{style:'arc',element,damage:2+level*.55,life:.7+level*.1,depth:2,fusion:false,evo:true});
 }else if(form==='field'&&s.fields.length<8){
  const x=clamp(a.x+Math.cos(angle)*70,30,W-30),y=clamp(a.y+Math.sin(angle)*70,30,H-30);
  s.fields.push({owner:a.id,x,y,r:(27+level*16)*(a.archetype==='shaper'?1.3:1),life:(2+level*.8)*(a.archetype==='shaper'?1.45:1),timer:0,element,level});fx(s,'overload',x,y);
 }
}
function fusionImpact(s,q,target){
 if(q.fusion===false||q.depth>=2)return;
 const source=s.actors[q.owner];
 for(const id of source.fusions||[]){
  if(id==='ember_nova'&&q.element==='fire'){target.burn=Math.max(target.burn,1.8);target.burnSource=q.owner;harm(s,target,3.5,q.owner,q.depth+1);fx(s,'overload',target.x,target.y)}
  else if(id==='stone_crush'&&q.element==='stone'){target.shield=Math.max(0,target.shield-8);target.slow=Math.max(target.slow,1.25);fx(s,'fracture',target.x,target.y)}
  else if(id==='storm_lattice'&&q.element==='storm'&&s.shots.length<76){
   const d=Math.atan2(q.vy,q.vx);
   for(const t of [-.50,.50])spawnShot(s,source,d+t,q.x,q.y,{style:'arc',element:'storm',damage:3,life:.48,depth:2,fusion:false});
   fx(s,'thunder',target.x,target.y);
  }
 }
}
function updateEvolutionFields(s,dt){
 for(let j=s.fields.length-1;j>=0;j--){
  const f=s.fields[j];f.life-=dt;f.timer-=dt;
  if(f.timer<=0){
   f.timer=.48;const target=s.actors[1-f.owner],distance=Math.hypot(target.x-f.x,target.y-f.y);
   if(target.hp>0&&distance<f.r+12&&beamLength(s,f.x,f.y,Math.atan2(target.y-f.y,target.x-f.x),distance+3,f.owner)>=distance-9){
    const hit=harm(s,target,1.6+f.level*1.1,f.owner);
    if(hit>0){markTarget(s,target,f.element,f.owner);target.slow=Math.max(target.slow,.2+f.level*.08);fx(s,'impact_arc',target.x,target.y)}
   }
  }
  if(f.life<=0)s.fields.splice(j,1);
 }
}

const CLASS_SPELLS=Object.freeze([
 {id:'striker',name:'РИКОШЕТНЫЙ ЗАЛП',desc:'Два отскока от препятствий',cooldown:5.5,variants:[
  {name:'РИКОШЕТ',desc:'Два отскока от укрытий'},{name:'РАЗЛОМ БРОНИ',desc:'Разрушение рунической стены'},{name:'РЫВОК С ЗАЛПОМ',desc:'Залп после рывка'}]},
 {id:'shaper',name:'АМБРАЗУРА',desc:'Односторонняя стена',cooldown:8,variants:[
  {name:'АМБРАЗУРА',desc:'Односторонняя стрельба'},{name:'РЕЗОНАНС',desc:'Два снаряда вдоль собственной стены'},{name:'ОБОРОННЫЙ КОНТУР',desc:'Усиление стены и соседних мин'}]},
 {id:'distorter',name:'СДВИГ ФАЗЫ',desc:'Проход первого препятствия',cooldown:7,variants:[
  {name:'ФАЗА',desc:'Перенос через первое препятствие'},{name:'ИЗЛОМ МАРШРУТА',desc:'Снаряд меняет направление в полёте'},{name:'ИНВЕРСИЯ БАРЬЕРА',desc:'Временное обращение чужой стены'}]}
]);
function nearestBarrier(s,a,owner,reach=170){
 let found=null,best=reach;for(const b of s.barriers){const d=Math.hypot(b.x-a.x,b.y-a.y);if(b.owner===owner&&d<best){found=b;best=d}}return found;
}
function castClassSpell(s,a,slot=0){
 if(a.stun>0||a.hp<=0||(a.specialCd||0)>0||a.heat>87||!Number.isInteger(slot)||slot<0||slot>2)return false;
 const type=a.archetype||'striker',spec=CLASS_SPELLS.find(t=>t.id===type);if(!spec)return false;
 if(type==='shaper'){
  if(slot===0){
   const x=a.x+Math.cos(a.face)*51,y=a.y+Math.sin(a.face)*51;
   if(!canStand(x,y,23)||blocking(s,x,y,24)||s.barriers.length>=10)return false;
   s.barriers.push({owner:a.id,x,y,r:22,hp:26,life:5,aperture:true});fx(s,'shield',x,y);
  }else if(slot===1){
   const b=nearestBarrier(s,a,a.id);if(!b||s.shots.length>76)return false;
   const enemy=s.actors[1-a.id],angle=Math.atan2(enemy.y-b.y,enemy.x-b.x);
   for(const sign of [-1,1]){
    const direction=angle+sign*Math.PI/2,x=b.x+Math.cos(direction)*(b.r+9),y=b.y+Math.sin(direction)*(b.r+9);
    spawnShot(s,a,direction,x,y,{style:'rock',element:'stone',damage:9,life:.82});
   }
   fx(s,'fracture',b.x,b.y);
  }else{
   let b=nearestBarrier(s,a,a.id,190);
   if(!b){
    const x=a.x+Math.cos(a.face)*45,y=a.y+Math.sin(a.face)*45;
    if(!canStand(x,y,19)||blocking(s,x,y,20)||s.barriers.length>=10)return false;
    b={owner:a.id,x,y,r:18,life:3.7,hp:28};s.barriers.push(b);
   }
   b.hp=(b.hp??24)+22;b.life=Math.min(9,b.life+2);b.warded=2.6;
   for(const m of s.mines)if(m.owner===a.id&&Math.hypot(m.x-b.x,m.y-b.y)<100){m.r=Math.min(85,m.r+12);m.damage+=3}
   fx(s,'shield',b.x,b.y);
  }
 }else if(type==='striker'&&slot===2){
  if(a.dashReady>0||!dash(s,a,{x:Math.cos(a.face),y:Math.sin(a.face)}))return false;
  a.dashShot={angle:a.face,element:mage(a.mageId).school};
 }else if(type==='distorter'&&slot===2){
  const b=nearestBarrier(s,a,1-a.id,185);if(!b)return false;
  if(b.originalOwner==null){b.originalOwner=b.owner;b.originalAperture=!!b.aperture}
  b.owner=a.id;b.aperture=true;b.inversionLife=2.2;fx(s,'phase_entry',b.x,b.y);
 }else{
  if(!spawnShot(s,a,a.face,a.x,a.y,{style:'arc',element:mage(a.mageId).school,strong:true,far:true}))return false;
  const q=s.shots[s.shots.length-1];q.r=4;
  if(type==='striker'&&slot===0){q.bounces=2;q.life=1.3;fx(s,'ricochet',a.x,a.y)}
  else if(type==='striker'){q.breach=32;q.damage=18;q.life=1.3;fx(s,'fracture',a.x,a.y)}
  else if(slot===0){q.phase=1;q.life=1.2;fx(s,'phase_entry',a.x,a.y)}
  else{const enemy=s.actors[1-a.id],delta=Math.sin(Math.atan2(enemy.y-a.y,enemy.x-a.x)-a.face);q.turnAt=.19;q.turnDelta=(delta<0?-1:1)*.55;q.life=1.25;fx(s,'thunder',a.x,a.y)}
 }
 a.specialCd=spec.cooldown+slot*(slot===2?1.2:.7);addHeat(s,a,12+slot*3);emit(s,'on_cast',a.id);return true;
}
function attack(s,a,target){
 if(s.magicModeV2)return magicV2Attack(s,a,target);
 if(a.mageId==='cinder')return flame(s,a,target);
 if(a.cast>0||a.stun>0||a.windup)return false;
 if(['pebble','coil','slate'].includes(a.mageId))return startWindup(s,a,target,a.mageId);
 a.face=Math.atan2(target.y-a.y,target.x-a.x);
 a.cast=stats(a).reload*(mastery(a,'quick')?.88:1);
 spawnShot(s,a,a.face,a.x,a.y,{signature:true,strong:mastery(a,'strong'),
  bounce:mastery(a,'bounce')&&a.mageId==='wire',far:mastery(a,'far')});
 addHeat(s,a,mastery(a,'cheap')?3:7);emit(s,'on_cast',a.id);return true;
}
function guard(s,a){
 if(a.shieldReady>0||a.stun>0)return false;
 a.shield=Math.min(80,a.shield+stats(a).shield+(s.magicModeV2?0:mage(a.mageId).trait==='guard_extra'?5:0));a.shieldReady=5;if(!s.magicModeV2&&mage(a.mageId).trait==='guard_slow'){const enemy=s.actors[1-a.id];if(Math.hypot(a.x-enemy.x,a.y-enemy.y)<105)enemy.slow=Math.max(enemy.slow,1.1)}addHeat(s,a,7);
 fx(s,'shield',a.x,a.y);emit(s,'on_guard',a.id);return true;
}
function dash(s,a,dir){
 if(a.dashReady>0||a.stun>0)return false;const m=mag(dir.x,dir.y);
 a.windup=null;a.vx=dir.x/m*370;a.vy=dir.y/m*370;if(!s.magicModeV2&&mage(a.mageId).trait==='dash_haste')a.haste=Math.max(a.haste,.9);a.dash=.17;a.dashReady=2.5;a.invuln=.13;addHeat(s,a,6);
 fx(s,'dash',a.x,a.y);emit(s,'on_dash',a.id);return true;
}
// The queue is cleared each update and every event owns a bounded ancestry depth.
function emit(s,kind,owner,payload={},depth=0){
 if(depth>MAX_CHAIN_DEPTH||s.eventQueue.length>=MAX_QUEUE)return false;
 s.eventQueue.push({kind,owner,payload,depth});if(kind==='on_cast'&&depth===0&&['rupture','forge'].includes(s.gameMode))castEvolution(s,s.actors[owner]);return true;
}
function addHeat(s,a,amount,depth=0){
 a.heat=Math.min(HEAT_LIMIT,a.heat+amount);
 if(a.heat>=HEAT_LIMIT&&a.overloadCd<=0){
  a.heat=62;a.overloadCd=3;a.stun=Math.max(a.stun,.15);
  fx(s,'overload',a.x,a.y);emit(s,'on_overload',a.id,{},depth);
 }
}
function act(s,a,action,mods,ev){
 const other=s.actors[1-a.id],m=new Set(mods),strong=m.has('strong')?1.6:1,reach=m.has('far')?1.5:1;
 const angle=a.face+(m.has('reverse')?Math.PI:0),depth=ev.depth+1;
 switch(action){
 case 'ball':spawnShot(s,a,angle,a.x,a.y,{element:chosenElement(mods,mage(a.mageId).school),strong:m.has('strong'),far:m.has('far'),bounce:m.has('bounce'),drain:m.has('drain'),wide:m.has('wide'),fastshot:m.has('fastshot'),depth});break;
 case 'heal':receiveHeal(s,a,7*strong,depth);break;
 case 'armor':a.shield=Math.min(80,a.shield+11*strong);fx(s,'shield',a.x,a.y);break;
 case 'blast':if(Math.hypot(other.x-a.x,other.y-a.y)<(m.has('wide')?110:72)*reach&&beamLength(s,a.x,a.y,Math.atan2(other.y-a.y,other.x-a.x),Math.hypot(other.x-a.x,other.y-a.y)+4,a.id)>=Math.hypot(other.x-a.x,other.y-a.y)-8){const d=harm(s,other,11*strong,a.id,depth);if(d>0){markTarget(s,other,chosenElement(mods,mage(a.mageId).school),a.id,depth);emit(s,'on_hit',a.id,{},depth)}}fx(s,'overload',a.x,a.y);break;
 case 'blink':{const step=38*reach*(m.has('reverse')?-1:1);move(a,Math.cos(a.face)*step,Math.sin(a.face)*step);fx(s,'dash',a.x,a.y);break}
 case 'clone':if(s.echoes.length<12)s.echoes.push({owner:a.id,x:a.x,y:a.y,life:m.has('lasting')?3.5:2.2,cast:.25,shots:2,extra:m.has('strong')});fx(s,'dash',a.x,a.y);break;
 case 'mine':if(s.mines.length<14)s.mines.push({x:a.x,y:a.y,owner:a.id,life:m.has('lasting')?6:3.5,damage:14*strong,element:chosenElement(mods,mage(a.mageId).school),r:(m.has('wide')?57:40)*(a.archetype==='shaper'?1.2:1)});fx(s,'mine',a.x,a.y);break;
 case 'wall':if(s.barriers.length<10){let bx=a.x+Math.cos(a.face)*34*reach,by=a.y+Math.sin(a.face)*34*reach;if(canStand(bx,by,14)&&!blocking(s,bx,by,15))s.barriers.push({owner:a.id,x:bx,y:by,r:m.has('wide')?23:15,life:(m.has('lasting')?4:2.5)*(a.archetype==='shaper'?1.4:1)})}fx(s,'shield',a.x,a.y);break;
 case 'push':{const dx=other.x-a.x,dy=other.y-a.y;if(mag(dx,dy)<100*reach&&unobstructed(s,a.x,a.y,other.x,other.y,a.id,8)){const k=mag(dx,dy);move(other,dx/k*30*strong*(m.has('fastshot')?1.3:1),dy/k*30*strong*(m.has('fastshot')?1.3:1))}fx(s,'dash',other.x,other.y);break}
 case 'slow':if(unobstructed(s,a.x,a.y,other.x,other.y,a.id,8)){other.slow=Math.max(other.slow,m.has('lasting')?3.4:2);fx(s,'hit',other.x,other.y)}break;
 case 'haste':a.haste=Math.max(a.haste,m.has('lasting')?3.4:2);fx(s,'heal',a.x,a.y);break;
 case 'cool':a.heat=Math.max(0,a.heat-22*strong);fx(s,'heal',a.x,a.y);break;
 }
}
function flushEvents(s){
 if(s.magicModeV2)return flushMagicV2Events(s);
 let reactions=0,processed=0;
 while(s.eventQueue.length&&processed++<MAX_QUEUE&&reactions<MAX_REACTIONS_PER_TICK){
  const ev=s.eventQueue.shift(),a=s.actors[ev.owner];if(!a)continue;
  for(const chain of compile(a.runes)){
   if(chain.trigger!==ev.kind||ev.depth>=MAX_CHAIN_DEPTH||!chain.actions.length)continue;
   const timer=a.runeTimers[chain.trigger]||0;const fastest=chain.actions.some(act=>act.mods.includes('quick'));
   const cd=fastest?.28:.56;if(s.ticks<timer)continue;
   a.runeTimers[chain.trigger]=s.ticks+Math.ceil(cd/STEP);
   for(const entry of chain.actions){
    const times=repetitions(entry.mods);for(let i=0;i<times&&reactions<MAX_REACTIONS_PER_TICK;i++){
     reactions++;act(s,a,entry.id,entry.mods,ev);addHeat(s,a,heatCost(entry.mods),ev.depth+1);
    }
   }
  }
 }
 // Overflow is deliberately turned into overload instead of stalled recursive spell execution.
 if(s.eventQueue.length){for(const a of s.actors)addHeat(s,a,3);s.eventQueue.length=0}
 s.reactions=reactions;
}
function botInput(s,dt){const b=s.actors[1],p=s.actors[0];const dx=p.x-b.x,dy=p.y-b.y,d=mag(dx,dy);b.aiT-=dt;if(b.aiT<=0){b.aiT=.5+random(s)*.55;b.aiMove=random(s)<.5?-1:1}const sideX=-dy/d*b.aiMove,sideY=dx/d*b.aiMove;let toward=d>200?1:d<110?-1:0;let x=dx/d*toward+sideX*.8,y=dy/d*toward+sideY*.8;
if(collapseActive(s)){const cx=200-b.x,cy=310-b.y,cd=mag(cx,cy);if(cd>ringRadius(s)-22){x=cx/cd+sideX*.15;y=cy/cd+sideY*.15}}
for(const shot of s.shots){if(shot.owner===1)continue;const rx=b.x-shot.x,ry=b.y-shot.y;const t=clamp((rx*shot.vx+ry*shot.vy)/(shot.vx**2+shot.vy**2),0,.4);if(Math.hypot(rx-shot.vx*t,ry-shot.vy*t)<27){x=-shot.vy/252*1.7;y=shot.vx/252*1.7;if(b.dashReady<=0&&t<.2&&random(s)<.025)dash(s,b,{x,y});if(b.shieldReady<=0&&b.hp<65)guard(s,b);break}}
if(d<260&&random(s)<.035)attack(s,b,p);
if(b.shieldReady<=0&&b.hp<55&&random(s)<.009)guard(s,b);
if((b.specialCd||0)<=0&&b.heat<70&&random(s)<.012)castClassSpell(s,b);
return {x,y,attack:false,shield:false,dash:false,aim:{x:p.x,y:p.y}}}
function tick(s,input={},dt=STEP,otherInput=null){
 if(s.phase!=='fight')return s;if(['rupture','forge'].includes(s.gameMode)){s.fields ||= [];for(const a of s.actors)a.fusions ||= []}dt=STEP;safeWorld=s;s.ticks++;if(s.gameMode!=='forge')s.remaining=Math.max(0,s.remaining-dt);
 s.streams=[];s.beams=s.beams||[];s.waves=s.waves||[];s.lobs=s.lobs||[];
 for(const a of s.actors){
  a.heat=Math.max(0,a.heat-7*dt);a.overloadCd=Math.max(0,a.overloadCd-dt);
  a.burn=Math.max(0,(a.burn||0)-dt);
  if(a.burn>0){a.burnTick=(a.burnTick||0)+dt;
   if(a.burnTick>=.33){a.burnTick=0;
    if(s.magicModeV2)harmSecondary(s,a,1.25,a.burnSource);
    else harm(s,a,1.25,a.burnSource);
    fx(s,'ember',a.x,a.y)}}
  else a.burnTick=0;
  a.haste=Math.max(0,a.haste-dt);a.slow=Math.max(0,a.slow-dt);a.markLife=Math.max(0,a.markLife-dt);a.reactionCd=Math.max(0,a.reactionCd-dt);if(a.markLife===0)a.mark='';
  if(s.ticks%120===0)emit(s,'on_clock',a.id);
  if(s.ticks%60===0&&Math.hypot(a.x-s.actors[1-a.id].x,a.y-s.actors[1-a.id].y)<78)emit(s,'on_close',a.id);
  if(a.heat>=HEAT_LIMIT&&a.overloadCd<=0)addHeat(s,a,0);
 }
const control=[input,otherInput===null?(s.gameMode==='forge'&&s.forgeDummy!==false?{x:0,y:0,attack:false,shield:false,dash:false,aim:{x:200,y:310}}:botInput(s,dt)):otherInput];
for(let i=0;i<2;i++){const a=s.actors[i],c=control[i],other=s.actors[1-i];
 if(['rupture','forge'].includes(s.gameMode)&&a.hp<=0){if(a.respawn>0){a.respawn=Math.max(0,a.respawn-dt);if(a.respawn<=0){const next=freshActor(a);next.hit=a.hit;next.kills=a.kills;next.invuln=1.25;s.actors[i]=next;}}continue}
 a.cast=Math.max(0,a.cast-dt);a.shieldReady=Math.max(0,a.shieldReady-dt);a.dashReady=Math.max(0,a.dashReady-dt);a.specialCd=Math.max(0,(a.specialCd||0)-dt);a.stun=Math.max(0,a.stun-dt);a.flash=Math.max(0,a.flash-dt);a.invuln=Math.max(0,a.invuln-dt);
if(!c.attack)a.flameCharge=Math.max(0,(a.flameCharge||0)-dt*5);
if(a.windup&&(a.stun>0||c.dash))a.windup=null;
if(a.windup){a.windup.remaining-=dt;
 if(a.windup.remaining<=0){const w=a.windup;a.windup=null;releaseWindup(s,a,w)}
}
if(a.dash>0){move(a,a.vx*dt,a.vy*dt);a.dash=Math.max(0,a.dash-dt);if(a.dash===0&&a.dashShot){const q=a.dashShot;a.dashShot=null;spawnShot(s,a,q.angle,a.x,a.y,{strong:true,element:q.element,life:1.05});fx(s,'shoot',a.x,a.y)}}
else{let x=Number(c.x)||0,y=Number(c.y)||0,m=mag(x,y);if(m>1){x/=m;y/=m}move(a,x*stats(a).speed*dt,y*stats(a).speed*dt)}
if(a.windup)a.face=a.windup.angle;
else if(c.aim&&Number.isFinite(c.aim.x)&&Number.isFinite(c.aim.y))a.face=Math.atan2(c.aim.y-a.y,c.aim.x-a.x);
if(c.dash)dash(s,a,{x:Number(c.x)||Math.cos(a.face),y:Number(c.y)||Math.sin(a.face)});
if(c.shield)guard(s,a);
if(c.special&&!s.magicModeV2)castClassSpell(s,a,Number.isInteger(c.specialSlot)?c.specialSlot:0);
if(c.attack)attack(s,a,c.aim||other);
if(s.ticks%60===0&&a.heat>=HEAT_LIMIT)addHeat(s,a,0)}
updateLobs(s,dt);if(['rupture','forge'].includes(s.gameMode))updateEvolutionFields(s,dt);
for(let j=s.beams.length-1;j>=0;j--){s.beams[j].life-=dt;if(s.beams[j].life<=0)s.beams.splice(j,1)}
 for(let j=s.waves.length-1;j>=0;j--){const w=s.waves[j];processWave(s,w);if(w.life<=0)s.waves.splice(j,1)}
 for(let j=s.shots.length-1;j>=0;j--){
 const q=s.shots[j],a=s.actors[1-q.owner];
 if(q.v2Sphere||q.v2MagicOrbit){
  if(q.v2Orbit){
   const source=s.actors[q.owner],next=q.orbitAngle+dt*3.8;
   const x=source.x+Math.cos(next)*q.orbitRadius,y=source.y+Math.sin(next)*q.orbitRadius;
   q.vx=(x-q.x)/dt;q.vy=(y-q.y)/dt;q.orbitAngle=next;
  }
  if(q.v2Sphere)q.spherePulse-=dt;
  if(q.v2Sphere&&q.spherePulse<=0){
   q.spherePulse=.38;
   const range=Math.hypot(a.x-q.x,a.y-q.y);
   if(range<=49&&range>q.r+11&&unobstructed(s,q.x,q.y,a.x,a.y,q.owner,7)){
    a.shield=Math.max(0,a.shield-1);
    const dealt=harmSecondary(s,a,2.3,q.owner,q.depth+1);
    if(dealt>0){
     a.slow=Math.max(a.slow,.23);
     emit(s,'on_hit',q.owner,{},q.depth+1);
     v2Contact(s,q.owner,q.v2Impact,a.x,a.y);
    }
    fx(s,'impact_arc',a.x,a.y);
   }
  }
 }
 if(q.accel){const v=Math.hypot(q.vx,q.vy)||1,next=q.accel>0?Math.min(q.minSpeed,v+q.accel*dt):Math.max(q.minSpeed,v+q.accel*dt);q.vx*=next/v;q.vy*=next/v}
 if(q.turnAt>0){q.turnAt-=dt;if(q.turnAt<=0){const speed=Math.hypot(q.vx,q.vy),angle=Math.atan2(q.vy,q.vx)+q.turnDelta;q.vx=Math.cos(angle)*speed;q.vy=Math.sin(angle)*speed;q.turnAt=0;fx(s,'thunder',q.x,q.y)}}
 q.life-=dt;if(q.life<=0){s.shots.splice(j,1);if(mage(s.actors[q.owner].mageId).trait==='miss_cool')s.actors[q.owner].heat=Math.max(0,s.actors[q.owner].heat-6);emit(s,'on_expire',q.owner,{},q.depth);continue}
 let remaining=dt,done=false,iterations=0;
 while(remaining>1e-7&&!done&&iterations++<4){
  const dx=q.vx*remaining,dy=q.vy*remaining;
  const hit=firstCollision(s,q.x,q.y,dx,dy,q.r,q.owner,{actors:true});
  if(!hit){q.x+=dx;q.y+=dy;break}
  q.x=hit.x;q.y=hit.y;
  if(hit.type==='actor'){
   if(q.style==='bolt')a.shield=Math.max(0,a.shield-3);
   if(q.v2Sphere)a.shield=Math.max(0,a.shield-2);
   const dealt=harm(s,a,q.damage,q.owner,q.depth);
   if(q.v2Sphere&&dealt>0)a.slow=Math.max(a.slow,.6);
   if(dealt){markTarget(s,a,q.element||mage(s.actors[q.owner].mageId).school,q.owner,q.depth);const attacker=s.actors[q.owner],trait=mage(attacker.mageId).trait;if(trait==='burn'){a.burn=Math.max(a.burn||0,has(attacker,'lasting')?2.4:1.55);a.burnSource=q.owner}if(trait==='hit_push')move(a,Math.cos(Math.atan2(q.vy,q.vx))*8,Math.sin(Math.atan2(q.vy,q.vx))*8);emit(s,'on_hit',q.owner,{},q.depth);if(q.drain)receiveHeal(s,attacker,3,q.depth)}
   if(dealt>0){fusionImpact(s,q,a);v2Contact(s,q.owner,q.v2Impact,q.x,q.y)}
   if(q.style==='rock')rockFracture(s,q,q.x,q.y);
   fx(s,'impact_'+(q.style||'orb'),q.x,q.y);s.shots.splice(j,1);done=true;continue;
  }
  if(hit.type==='barrier'&&s.barriers[hit.index]?.v2Pylon){
   const node=s.barriers[hit.index];
   if(node.owner!==q.owner){
    node.hp=Math.max(0,node.hp-(q.damage||5));
    if(node.hp<=0){s.barriers.splice(hit.index,1);fx(s,'fracture',node.x,node.y)}
   }
   s.shots.splice(j,1);fx(s,'spark',hit.x,hit.y);
   emit(s,'on_expire',q.owner,{},q.depth);done=true;continue;
  }
  if(q.breach>0&&hit.type==='barrier'){const b=s.barriers[hit.index];b.hp=(b.hp??24)-q.breach;q.breach=0;if(b.hp<=0){s.barriers.splice(hit.index,1);fx(s,'fracture',b.x,b.y);q.x+=Math.sign(q.vx)*.15;q.y+=Math.sign(q.vy)*.15;remaining*=Math.max(0,1-hit.t);continue}}
  if(q.phase>0&&(hit.type==='wall'||hit.type==='barrier')){
   const pass=firstCollision(s,q.x,q.y,q.vx*.65,q.vy*.65,q.r,q.owner);const skip=Math.max(.001,pass?.exit??0);q.x+=q.vx*.65*skip+Math.sign(q.vx)*.08;q.y+=q.vy*.65*skip+Math.sign(q.vy)*.08;q.phase=0;
   fx(s,'phase_exit',q.x,q.y);remaining*=Math.max(0,1-hit.t);continue;
  }
  if(q.bounces>0){
   q.bounces--;const dot=q.vx*hit.nx+q.vy*hit.ny;q.vx-=2*dot*hit.nx;q.vy-=2*dot*hit.ny;
   q.x+=hit.nx*.08;q.y+=hit.ny*.08;
   fx(s,'spark',hit.x,hit.y);emit(s,'on_bounce',q.owner,{},q.depth);remaining*=Math.max(0,1-hit.t);continue;
  }
  if(q.style==='rock')rockFracture(s,q,q.x,q.y);
  v2Contact(s,q.owner,q.v2Impact,q.x,q.y);
  s.shots.splice(j,1);fx(s,'spark',hit.x,hit.y);emit(s,'on_expire',q.owner,{},q.depth);done=true;
 }
}
for(let j=s.echoes.length-1;j>=0;j--){const e=s.echoes[j];e.life-=dt;e.cast-=dt;const source=s.actors[e.owner];if(e.cast<=0){e.cast=.76;const target=s.actors[1-e.owner];spawnShot(s,source,Math.atan2(target.y-e.y,target.x-e.x),e.x,e.y,{clone:true,strong:!!e.extra});e.shots=(e.shots??2)-1}if(e.life<=0||e.shots<=0)s.echoes.splice(j,1)}
for(let j=s.mines.length-1;j>=0;j--){
 const mine=s.mines[j];mine.life-=dt;const target=s.actors[1-mine.owner];
 if(mine.v2Rubble||mine.v2Wildfire){
  if(mine.arm>0){mine.arm=Math.max(0,mine.arm-dt);continue}
  mine.afterCd=Math.max(0,mine.afterCd-dt);
  if(mine.afterCd<=0&&target.hp>0
    &&Math.hypot(target.x-mine.x,target.y-mine.y)<=mine.r+12
    &&unobstructed(s,mine.x,mine.y,target.x,target.y,mine.owner,7)){
   const dealt=harmSecondary(s,target,mine.damage,mine.owner);
   if(dealt>0){
    if(mine.v2Rubble)target.slow=Math.max(target.slow,.65);
    else{target.burn=Math.max(target.burn||0,.58);target.burnSource=mine.owner}
    emit(s,'on_hit',mine.owner);
   }
   mine.afterCd=mine.v2Rubble?.65:.46;
   fx(s,mine.v2Rubble?'fracture':'flame',target.x,target.y);
  }
  if(mine.life<=0)s.mines.splice(j,1);
  continue;
 }
 if(mine.v2Conduit){
  const u=s.barriers.find(b=>b.v2Pylon&&b.owner===mine.owner&&b.nodeId===mine.aId&&b.hp>0);
  const v=s.barriers.find(b=>b.v2Pylon&&b.owner===mine.owner&&b.nodeId===mine.bId&&b.hp>0);
  if(!u||!v||mine.life<=0){s.mines.splice(j,1);continue}
  mine.x=u.x;mine.y=u.y;mine.x2=v.x;mine.y2=v.y;
  if(mine.arm>0){mine.arm=Math.max(0,mine.arm-dt);continue}
  mine.conduitCd=Math.max(0,mine.conduitCd-dt);
  const vx=v.x-u.x,vy=v.y-u.y,lengthSq=vx*vx+vy*vy;
  const t=lengthSq>1?clamp(((target.x-u.x)*vx+(target.y-u.y)*vy)/lengthSq,0,1):0;
  const nearestX=u.x+vx*t,nearestY=u.y+vy*t;
  const dist=Math.hypot(target.x-nearestX,target.y-nearestY);
  const world={...s,barriers:s.barriers.filter(b=>b!==u&&b!==v)};
  if(mine.conduitCd<=0&&dist<=12+7&&target.hp>0
    &&unobstructed(world,u.x,u.y,v.x,v.y,mine.owner,7)
    &&unobstructed(world,nearestX,nearestY,target.x,target.y,mine.owner,7)){
   target.shield=Math.max(0,target.shield-1.6);
   const dealt=harmSecondary(s,target,mine.damage,mine.owner);
   if(dealt>0){target.slow=Math.max(target.slow,.3);emit(s,'on_hit',mine.owner)}
   fx(s,'impact_arc',target.x,target.y);
   mine.conduitCd=.42;
  }
  continue;
 }
 if(mine.v2Crater){
  if(mine.arm>0){mine.arm=Math.max(0,mine.arm-dt);continue}
  mine.craterCd=Math.max(0,mine.craterCd-dt);
  if(mine.craterCd<=0&&target.hp>0
    &&Math.hypot(target.x-mine.x,target.y-mine.y)<=mine.r+10
    &&unobstructed(s,mine.x,mine.y,target.x,target.y,mine.owner,7)){
   const dealt=harmSecondary(s,target,mine.damage,mine.owner);
   if(dealt>0){target.burn=Math.max(target.burn||0,.48);target.burnSource=mine.owner;emit(s,'on_hit',mine.owner)}
   mine.craterCd=.50;fx(s,'flame',target.x,target.y);
  }
  if(mine.life<=0)s.mines.splice(j,1);
  continue;
 }
 if(mine.v2Whirl){
  // The angular sectors are the hit geometry, not a cosmetic spinning circle.
  // Rotating sectors can hit repeatedly only after their own bounded cooldown.
  if(mine.followOwner){
   const source=s.actors[mine.owner];
   mine.x=source.x;mine.y=source.y;
  }
  if(mine.arm>0)mine.arm=Math.max(0,mine.arm-dt);
  else{
   mine.phase+=dt*6.3;mine.whirlCd=Math.max(0,mine.whirlCd-dt);
   const dx=target.x-mine.x,dy=target.y-mine.y;
   const distance=Math.hypot(dx,dy),theta=Math.atan2(dy,dx);
   let sector=false;
   for(let k=0;k<3;k++){
    const d=theta-mine.phase-k*2*Math.PI/3;
    if(Math.abs(Math.atan2(Math.sin(d),Math.cos(d)))<.34){sector=true;break}
   }
   if(mine.whirlCd<=0&&sector&&distance<=mine.r+10&&distance>=19
     &&unobstructed(s,mine.x,mine.y,target.x,target.y,mine.owner,8)){
    const dealt=harmSecondary(s,target,mine.damage,mine.owner);
    if(dealt>0){
     target.burn=Math.max(target.burn||0,.68);target.burnSource=mine.owner;
     emit(s,'on_hit',mine.owner);
    }
    mine.whirlCd=.31;fx(s,'flame',target.x,target.y);
   }
  }
  if(mine.life<=0)s.mines.splice(j,1);
  continue;
 }
 if(mine.arm>0){mine.arm=Math.max(0,mine.arm-dt);if(mine.life<=0)s.mines.splice(j,1);continue}
 if(Math.hypot(target.x-mine.x,target.y-mine.y)<mine.r&&beamLength(s,mine.x,mine.y,Math.atan2(target.y-mine.y,target.x-mine.x),Math.hypot(target.x-mine.x,target.y-mine.y)+4,mine.owner)>=Math.hypot(target.x-mine.x,target.y-mine.y)-8){
  if(mine.v2Charge)target.shield=Math.max(0,target.shield-6);
  const d=harm(s,target,mine.damage,mine.owner);
  if(d>0){
   if(mine.v2Charge)target.slow=Math.max(target.slow,.72);
   markTarget(s,target,mine.element||mage(s.actors[mine.owner].mageId).school,mine.owner);
   emit(s,'on_hit',mine.owner);
  }
  fx(s,mine.v2Charge?'thunder':'overload',mine.x,mine.y);s.mines.splice(j,1)
 }
 else if(mine.life<=0)s.mines.splice(j,1);
 }
 for(let j=s.barriers.length-1;j>=0;j--){const b=s.barriers[j];b.life-=dt;if(b.inversionLife>0){b.inversionLife=Math.max(0,b.inversionLife-dt);if(b.inversionLife===0&&b.originalOwner!=null){b.owner=b.originalOwner;b.aperture=!!b.originalAperture;delete b.originalOwner;delete b.originalAperture;fx(s,'phase_exit',b.x,b.y)}}if(b.warded>0)b.warded=Math.max(0,b.warded-dt);if(b.life<=0)s.barriers.splice(j,1)}
 // The court tightens in the last ten seconds. Environmental damage bypasses
 // endlessly rechargeable shields; the clock itself still never awards a point.
 if(collapseActive(s)){
  const radius=ringRadius(s);
  for(const a of s.actors){
   const outside=Math.hypot(a.x-200,a.y-310)-radius;
   if(outside>0){a.hp=Math.max(0,a.hp-(18+outside*.55)*dt);if(s.ticks%22===0){a.flash=Math.max(a.flash,.12);fx(s,'ring',a.x,a.y)}}
  }
 }
 flushEvents(s);
 s.fx.forEach(f=>f.t+=dt);s.fx=s.fx.filter(f=>f.t<.38);
if(s.gameMode==='forge'){for(const a of s.actors)if(a.hp<=0&&a.respawn<=0){a.respawn=1.6;fx(s,'overload',a.x,a.y)}return s;}
if(s.gameMode==='rupture'){
  s.elapsed=RUPTURE_SECONDS-s.remaining;
  for(const a of s.actors){if(a.hp<=0&&a.respawn<=0){a.respawn=2.5;const opponent=s.actors[1-a.id];opponent.kills++;s.score[opponent.id]+=s.remaining<=60?4:2;fx(s,'overload',a.x,a.y)}}
  if(s.ticks%60===0){const contest=s.actors.map(a=>a.hp>0&&Math.hypot(a.x-200,a.y-310)<=52);const owner=contest[0]&&!contest[1]?0:contest[1]&&!contest[0]?1:-1;
   for(let i=0;i<2;i++){s.coreHold[i]=owner===i?(s.coreHold[i]||0)+1:0;if(s.coreHold[i]>=8){s.coreHold[i]=0;s.score[i]+=s.remaining<=60?3:1;fx(s,'overload',200,310)}}}
  if(s.remaining<=0){s.phase='result';const [a,b]=s.actors;s.champion=s.score[0]===s.score[1]?(a.hit===b.hit?null:a.hit>b.hit?0:1):(s.score[0]>s.score[1]?0:1)}
  else if(s.remaining<=s.nextEvolution&&s.nextEvolution>0){s.phase='draft';s.pick=offers(s);s.round++;s.nextEvolution-=EVOLUTION_SECONDS;s.coreHold=[0,0];}
  return s;
 }
 if(s.actors.some(a=>a.hp<=0)||s.remaining<=0){const [a,b]=s.actors;let winner=null;
if(a.hp<=0&&b.hp<=0)winner=null;
else if(a.hp<=0)winner=1;else if(b.hp<=0)winner=0;
// Timeouts and double knockouts are actual draws: no overtime tie-breaker or free point.
if(winner===null){s.draws++;s.lastWinner=null;s.lastOutcome='draw'}
else{s.score[winner]++;s.lastWinner=winner;s.lastOutcome='win'}
if(winner!==null&&s.score[winner]>=4){s.phase='result';s.champion=winner}
else{s.phase='draft';s.pick=offers(s)}
}
return s}
function validState(s){
 return !!s&&s.version===4&&['fight','draft','build','result'].includes(s.phase)
 &&Array.isArray(s.actors)&&s.actors.length===2&&s.actors.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.hp)&&validMage(a.mageId)&&typeof a.mark==='string'&&Number.isFinite(a.markLife)&&a.markLife>=0&&Number.isFinite(a.reactionCd)&&Number.isFinite(a.heat)&&a.heat>=0&&a.heat<=100&&legalRunes(a.runes)&&(!a.archetype||validArchetype(a.archetype))&&(!a.evolution||EVOLUTIONS.some(f=>f.id===a.evolution.form)&&Number.isInteger(a.evolution.level)&&a.evolution.level>0&&a.evolution.level<=3)&&(!a.fusions||Array.isArray(a.fusions)&&a.fusions.length<=3&&new Set(a.fusions).size===a.fusions.length&&a.fusions.every(id=>FUSIONS.some(f=>f.id===id)))&&a.runeTimers&&typeof a.runeTimers==='object')
 &&Array.isArray(s.shots)&&(!s.streams||Array.isArray(s.streams))&&(!s.beams||Array.isArray(s.beams))&&(!s.waves||Array.isArray(s.waves))&&(!s.lobs||Array.isArray(s.lobs))&&Array.isArray(s.echoes)&&Array.isArray(s.mines)&&Array.isArray(s.barriers)&&(!s.fields||Array.isArray(s.fields))&&Array.isArray(s.eventQueue)
 &&(!s.magicModeV2||(s.magicLoadouts?.length===2&&s.magicLoadouts.every(x=>v2SpellAllowed(x))))&&Array.isArray(s.elementCombos)&&s.elementCombos.length===2&&s.elementCombos.every(n=>Number.isInteger(n)&&n>=0)&&Array.isArray(s.score)&&s.score.every(n=>Number.isInteger(n)&&n>=0&&(s.gameMode==='rupture'?n<=10000:n<=4))&&['duel','rupture','forge',undefined].includes(s.gameMode);
}

export const MIN_PLAYERS=2,MAX_PLAYERS=2,RULESET_VERSION=19;

// ---- Immutable PocketNet ruleset 10: generated from reviewed magic-v2 runtime.
// v9 is preserved separately; 10 retains all its legacy logic for old-style new rooms.
// Generated from design/magic-v2-catalog.json, kept in sync by magic-v2-rules.test.mjs.
// Pure ESM exports work in the browser, Node and the future deterministic PocketNet module.
// This is a runnable data contract; introducing these cards does not make their combat effects live.
const MAGIC_SCHOOLS=Object.freeze(["stone","fire","storm"]);
const MAGIC_RUNES=Object.freeze([{"id":"u_on_hit","school":"common","kind":"when","rarity":"common","name":"При попадании","effect":"Подтверждённый урон врагу"},{"id":"u_on_hurt","school":"common","kind":"when","rarity":"common","name":"Когда ранили","effect":"Получен урон здоровью, не щиту"},{"id":"u_after_dash","school":"common","kind":"when","rarity":"uncommon","name":"После рывка","effect":"Завершён реальный рывок"},{"id":"u_after_guard","school":"common","kind":"when","rarity":"uncommon","name":"После щита","effect":"Успешно установлен щит"},{"id":"u_on_expire","school":"common","kind":"when","rarity":"rare","name":"Когда снаряд исчез","effect":"Истёк срок без попадания, не очистка лимита"},{"id":"u_on_barrier","school":"common","kind":"when","rarity":"rare","name":"При ударе в стену","effect":"Физическое столкновение своего снаряда с укрытием"},{"id":"u_on_cast","school":"common","kind":"when","rarity":"epic","name":"При выстреле","effect":"Только ручная базовая атака, не вторичные снаряды"},{"id":"u_guard","school":"common","kind":"do","rarity":"common","name":"Защититься","effect":"Небольшой щит до общего потолка"},{"id":"u_push","school":"common","kind":"do","rarity":"uncommon","name":"Толчок","effect":"Сместить видимого врага в ближней зоне"},{"id":"u_heal","school":"common","kind":"do","rarity":"rare","name":"Подлечиться","effect":"Умеренное восстановление здоровья с кулдауном"},{"id":"u_afterimage","school":"common","kind":"do","rarity":"rare","name":"Отголосок","effect":"Краткая копия один раз атакует своей стихией"},{"id":"u_reform_base","school":"common","kind":"do","rarity":"uncommon","name":"Переплести основу","effect":"Пассивно изменить базовую атаку, если добавлена совместимая КАК"},{"id":"u_size","school":"common","kind":"how","rarity":"common","name":"Увеличить","effect":"Реальный радиус снаряда или эффекта"},{"id":"u_duration","school":"common","kind":"how","rarity":"common","name":"Продлить","effect":"Увеличить жизнь объекта или эффекта"},{"id":"u_speed","school":"common","kind":"how","rarity":"uncommon","name":"Ускорить","effect":"Скорость полёта с физической коллизией"},{"id":"u_split","school":"common","kind":"how","rarity":"uncommon","name":"Раздвоить","effect":"Два меньших объекта с нормализацией общего урона"},{"id":"u_range","school":"common","kind":"how","rarity":"uncommon","name":"Дальше","effect":"Дальность полёта или размещения"},{"id":"u_efficient","school":"common","kind":"how","rarity":"rare","name":"Экономия","effect":"Снизить нагрев, но не ниже минимальной цены"},{"id":"u_ricochet","school":"common","kind":"how","rarity":"rare","name":"Рикошет","effect":"Ограниченный физический отскок по нормали"},{"id":"u_repeat","school":"common","kind":"how","rarity":"epic","name":"Повторить","effect":"Повтор через паузу с дополнительным нагревом"},{"id":"st_land","school":"stone","kind":"when","rarity":"uncommon","name":"При приземлении","effect":"Подтверждённая точка касания грунта"},{"id":"st_wall_lost","school":"stone","kind":"when","rarity":"rare","name":"Когда стена разрушена","effect":"Своё временное укрытие разрушено уроном"},{"id":"st_knock","school":"stone","kind":"when","rarity":"rare","name":"После каменного толчка","effect":"Враг действительно смещён каменной атакой"},{"id":"st_throw","school":"stone","kind":"do","rarity":"common","name":"Метнуть камень","effect":"Дополнительный физический каменный снаряд"},{"id":"st_shards","school":"stone","kind":"do","rarity":"common","name":"Осколки","effect":"Малый направленный веер каменных фрагментов"},{"id":"st_wall","school":"stone","kind":"do","rarity":"uncommon","name":"Поднять стену","effect":"Разрушаемое временное укрытие"},{"id":"st_spikes","school":"stone","kind":"do","rarity":"uncommon","name":"Шипы","effect":"Наземный ряд шипов с предупреждением"},{"id":"st_fault","school":"stone","kind":"do","rarity":"rare","name":"Разлом","effect":"Наземная трещина без поражения сквозь стену"},{"id":"st_satellites","school":"stone","kind":"do","rarity":"rare","name":"Каменные спутники","effect":"Две глыбы на орбите с задержкой повторного урона"},{"id":"st_tremor","school":"stone","kind":"do","rarity":"epic","name":"Землетрясение","effect":"Круговая ударная волна после замаха"},{"id":"st_mass","school":"stone","kind":"how","rarity":"common","name":"Утяжелить","effect":"Больше импульса, меньше скорость и выше нагрев"},{"id":"st_grit","school":"stone","kind":"how","rarity":"uncommon","name":"Броневая крошка","effect":"Щит при контакте собственного камня с поверхностью, с кулдауном"},{"id":"st_shatter","school":"stone","kind":"how","rarity":"uncommon","name":"Дробление","effect":"Ограниченные осколки при ударе о препятствие"},{"id":"st_drill","school":"stone","kind":"how","rarity":"rare","name":"Бур","effect":"Повреждение только временной разрушаемой стены"},{"id":"st_aftershock","school":"stone","kind":"how","rarity":"rare","name":"Повторный толчок","effect":"Слабый наземный удар с задержкой"},{"id":"st_pillar","school":"stone","kind":"how","rarity":"rare","name":"Остаточный столб","effect":"Короткая разрушаемая опора при приземлении"},{"id":"st_gravity","school":"stone","kind":"how","rarity":"epic","name":"Притяжение","effect":"Ограниченная зона притяжения без прохождения стен"},{"id":"st_tracking_fault","school":"stone","kind":"how","rarity":"epic","name":"Ползущий разлом","effect":"Следующий сегмент к последней видимой позиции врага"},{"id":"st_form_wave","school":"stone","kind":"how","rarity":"transformation","name":"Каменная волна","effect":"Форма: наземный фронт вместо снаряда","aspect":"shape"},{"id":"st_form_spires","school":"stone","kind":"how","rarity":"transformation","name":"Гребень шипов","effect":"Форма: ряд поднимающихся каменных шипов","aspect":"shape"},{"id":"st_form_colossus","school":"stone","kind":"how","rarity":"transformation","name":"Монолит","effect":"Форма: тяжёлая глыба или столб с долгой подготовкой","aspect":"shape"},{"id":"st_origin_self","school":"stone","kind":"how","rarity":"transformation","name":"Эпицентр","effect":"Источник: атаковать от ног мага наружу","aspect":"origin"},{"id":"st_origin_below","school":"stone","kind":"how","rarity":"transformation","name":"Из недр","effect":"Источник: возникновение в отмеченной точке грунта","aspect":"origin"},{"id":"st_impact_rubble","school":"stone","kind":"how","rarity":"transformation","name":"Обвал","effect":"Контакт: короткоживущая осыпь с собственной геометрией","aspect":"impact"},{"id":"fi_ignite","school":"fire","kind":"when","rarity":"uncommon","name":"При воспламенении","effect":"Первое наложение горения, не его продление"},{"id":"fi_burn_tick","school":"fire","kind":"when","rarity":"rare","name":"Когда горит","effect":"Подтверждённый тик урона горением с интервалом"},{"id":"fi_extinguish","school":"fire","kind":"when","rarity":"rare","name":"Когда погасло","effect":"Свой огненный след погас естественно"},{"id":"fi_ember","school":"fire","kind":"do","rarity":"common","name":"Искра","effect":"Дополнительный огненный сгусток"},{"id":"fi_scorch","school":"fire","kind":"do","rarity":"common","name":"Ожог","effect":"Короткая видимая вспышка перед магом"},{"id":"fi_flamepatch","school":"fire","kind":"do","rarity":"uncommon","name":"Горящее пятно","effect":"Ограниченный огонь на полу"},{"id":"fi_cindermine","school":"fire","kind":"do","rarity":"uncommon","name":"Угольная ловушка","effect":"Мина, вспыхивающая при приближении"},{"id":"fi_lash","school":"fire","kind":"do","rarity":"rare","name":"Огненная плеть","effect":"Короткий огненный поток, прерываемый стенами"},{"id":"fi_wisp","school":"fire","kind":"do","rarity":"rare","name":"Блуждающий огонёк","effect":"Медленный огонёк обходит преграды без фазового прохода"},{"id":"fi_inferno","school":"fire","kind":"do","rarity":"epic","name":"Пекло","effect":"Широкая область после долгой подготовки"},{"id":"fi_sear","school":"fire","kind":"how","rarity":"common","name":"Поджечь сильнее","effect":"Дольше горение до лимита"},{"id":"fi_spread","school":"fire","kind":"how","rarity":"uncommon","name":"Распространить","effect":"Перекинуть огонь на смежную видимую поверхность"},{"id":"fi_sticky","school":"fire","kind":"how","rarity":"uncommon","name":"Прилипание","effect":"После контакта оставить огненное пятно"},{"id":"fi_flash","school":"fire","kind":"how","rarity":"rare","name":"Вспышка","effect":"Задержанный локальный взрыв с проверкой укрытий"},{"id":"fi_feed","school":"fire","kind":"how","rarity":"rare","name":"Разгореться","effect":"Огонь постепенно усиливается до потолка"},{"id":"fi_backdraft","school":"fire","kind":"how","rarity":"rare","name":"Обратная тяга","effect":"Небольшая волна при естественном угасании"},{"id":"fi_meltshield","school":"fire","kind":"how","rarity":"epic","name":"Оплавление","effect":"Горение частично ослабляет обычный щит"},{"id":"fi_bank_heat","school":"fire","kind":"how","rarity":"epic","name":"Тлеющий резерв","effect":"Вернуть часть нагрева при угасании, с общим кулдауном"},{"id":"fi_form_stream","school":"fire","kind":"how","rarity":"transformation","name":"Огненный поток","effect":"Форма: короткая непрерывная струя вместо шара","aspect":"shape"},{"id":"fi_form_whirl","school":"fire","kind":"how","rarity":"transformation","name":"Огненный вихрь","effect":"Форма: вращающаяся область пламени","aspect":"shape"},{"id":"fi_form_comet","school":"fire","kind":"how","rarity":"transformation","name":"Комета","effect":"Форма: тяжёлый горящий снаряд с дугой","aspect":"shape"},{"id":"fi_origin_self","school":"fire","kind":"how","rarity":"transformation","name":"Пламенный круг","effect":"Источник: атака вокруг мага","aspect":"origin"},{"id":"fi_origin_sky","school":"fire","kind":"how","rarity":"transformation","name":"Падение с неба","effect":"Источник: удар сверху по отмеченной точке","aspect":"origin"},{"id":"fi_impact_wildfire","school":"fire","kind":"how","rarity":"transformation","name":"Пожарище","effect":"Контакт: ограниченное распространение пламени по полу","aspect":"impact"},{"id":"li_shield_break","school":"storm","kind":"when","rarity":"uncommon","name":"При пробое щита","effect":"Подтверждено уменьшение вражеского щита"},{"id":"li_chain_end","school":"storm","kind":"when","rarity":"rare","name":"После цепи","effect":"Естественно завершилась цепь разрядов"},{"id":"li_conduct","school":"storm","kind":"when","rarity":"rare","name":"Когда заряжен проводник","effect":"Свой узел получил заряд, один раз за событие"},{"id":"li_spark","school":"storm","kind":"do","rarity":"common","name":"Импульс","effect":"Тонкий быстрый разряд"},{"id":"li_arc","school":"storm","kind":"do","rarity":"common","name":"Дуга","effect":"Короткая направленная молния"},{"id":"li_pylon","school":"storm","kind":"do","rarity":"uncommon","name":"Проводник","effect":"Поставить временный разрушаемый узел"},{"id":"li_link","school":"storm","kind":"do","rarity":"uncommon","name":"Связь","effect":"Соединить видимые узлы, при отсутствии узлов короткий разряд"},{"id":"li_coil","school":"storm","kind":"do","rarity":"uncommon","name":"Зарядная мина","effect":"Ограниченная по времени электрическая мина"},{"id":"li_discharge","school":"storm","kind":"do","rarity":"rare","name":"Веер молний","effect":"Несколько коротких дуг с общей ценой"},{"id":"li_stormcloud","school":"storm","kind":"do","rarity":"epic","name":"Грозовая туча","effect":"Медленная зона с отмеченными ударами"},{"id":"li_accelerate","school":"storm","kind":"how","rarity":"common","name":"Проводимость","effect":"Ускорить электрические снаряды"},{"id":"li_drainshield","school":"storm","kind":"how","rarity":"uncommon","name":"Снять заряд","effect":"Дополнительный урон щиту при контакте"},{"id":"li_nodes","school":"storm","kind":"how","rarity":"uncommon","name":"Перекинуть дугу","effect":"Достать один видимый проводник после контакта"},{"id":"li_stagger","school":"storm","kind":"how","rarity":"rare","name":"Оцепенение","effect":"Краткое замедление с защитой от постоянного контроля"},{"id":"li_capacitor","school":"storm","kind":"how","rarity":"rare","name":"Накопитель","effect":"Запас одного заряда на следующую ручную атаку"},{"id":"li_reflect_arc","school":"storm","kind":"how","rarity":"rare","name":"Угловой разряд","effect":"Отражение от камня с реальной коллизией"},{"id":"li_shield_pierce","school":"storm","kind":"how","rarity":"epic","name":"Пробой щита","effect":"Частичное игнорирование щита, но не стен"},{"id":"li_overcharge","school":"storm","kind":"how","rarity":"epic","name":"Перенапряжение","effect":"Сильный разряд за большой нагрев"},{"id":"li_form_ray","school":"storm","kind":"how","rarity":"transformation","name":"Грозовой луч","effect":"Форма: точный непрерывный луч с коллизиями","aspect":"shape"},{"id":"li_form_sphere","school":"storm","kind":"how","rarity":"transformation","name":"Шаровая молния","effect":"Форма: медленная сфера с внешними дугами","aspect":"shape"},{"id":"li_origin_self","school":"storm","kind":"how","rarity":"transformation","name":"Корона","effect":"Источник: разряд исходит кольцом от мага","aspect":"origin"},{"id":"li_origin_pylon","school":"storm","kind":"how","rarity":"transformation","name":"Проводящая опора","effect":"Источник: заряженный свой узел, при его отсутствии маг","aspect":"origin"},{"id":"li_impact_chain","school":"storm","kind":"how","rarity":"transformation","name":"Цепная реакция","effect":"Контакт: дуга к следующему видимому узлу","aspect":"impact"},{"id":"li_motion_orbit","school":"storm","kind":"how","rarity":"transformation","name":"Орбита","effect":"Движение: ограниченная орбита вокруг источника","aspect":"motion"}].map(card=>Object.freeze(card)));
const MAGIC_TRANSFORMS=Object.freeze({"recipes":[{"school":"stone","requires":["st_form_wave","st_origin_self"],"name":"Землетрясение","effect":"Кольцевая каменная волна вокруг мага"},{"school":"stone","requires":["st_form_wave","st_origin_below"],"name":"Ползущий разлом","effect":"Фронт выходит из отмеченной области"},{"school":"stone","requires":["st_form_spires","st_origin_self"],"name":"Шипастый венец","effect":"Несколько волн шипов вокруг мага"},{"school":"stone","requires":["st_form_spires","st_origin_below"],"name":"Шиповой гребень","effect":"Выросший из земли направленный гребень"},{"school":"stone","requires":["st_form_colossus","st_origin_below"],"name":"Монолит недр","effect":"Тяжёлая колонна в отмеченной точке"},{"school":"stone","requires":["st_form_wave","st_impact_rubble"],"name":"Осыпной прибой","effect":"Волна оставляет временную осыпь"},{"school":"fire","requires":["fi_form_stream","fi_origin_self"],"name":"Огненное кольцо","effect":"Огонь расходится круговым фронтом"},{"school":"fire","requires":["fi_form_stream","fi_origin_sky"],"name":"Огненный дождь","effect":"Небольшие струи падают сверху"},{"school":"fire","requires":["fi_form_whirl","fi_origin_self"],"name":"Пламенный танец","effect":"Вращающееся пламя вокруг мага"},{"school":"fire","requires":["fi_form_whirl","fi_origin_sky"],"name":"Небесный вихрь","effect":"Неподвижный вихрь в целевой точке"},{"school":"fire","requires":["fi_form_comet","fi_origin_sky"],"name":"Метеор","effect":"Падающая комета с отмеченным ударом"},{"school":"fire","requires":["fi_form_comet","fi_impact_wildfire"],"name":"Пылающий кратер","effect":"Пожарище после падения"},{"school":"storm","requires":["li_form_ray","li_origin_self"],"name":"Грозовая корона","effect":"Короткие лучи расходятся от мага"},{"school":"storm","requires":["li_form_ray","li_origin_pylon"],"name":"Релейный луч","effect":"Луч из заряженного узла"},{"school":"storm","requires":["li_form_sphere","li_origin_self"],"name":"Живая сфера","effect":"Медленная сфера вокруг мага"},{"school":"storm","requires":["li_form_sphere","li_motion_orbit"],"name":"Электрический спутник","effect":"Сфера вращается вокруг источника"},{"school":"storm","requires":["li_form_ray","li_impact_chain"],"name":"Ломаная молния","effect":"Луч разветвляется после контакта"},{"school":"storm","requires":["li_origin_pylon","li_impact_chain"],"name":"Электрическая сеть","effect":"Передача разряда между своими узлами"}],"explicitlyForbidden":[["st_form_wave","st_form_spires"],["st_form_wave","st_form_colossus"],["st_form_spires","st_form_colossus"],["st_origin_self","st_origin_below"],["st_form_colossus","st_origin_self"],["fi_form_stream","fi_form_whirl"],["fi_form_stream","fi_form_comet"],["fi_form_whirl","fi_form_comet"],["fi_origin_self","fi_origin_sky"],["fi_form_comet","fi_origin_self"],["li_form_ray","li_form_sphere"],["li_origin_self","li_origin_pylon"],["li_form_ray","li_motion_orbit"]]});
const MAGIC_DESIGN_RULES=Object.freeze({"editableSlots":3,"spellLimits":{"when":1,"do":2,"how":2},"aspects":["shape","origin","motion","impact"]});

// PEREKOS magic v2: pure, deterministic spell assembly and state transitions.
// This module deliberately has NO DOM, storage, audio, timers, network or RNG side effects.
// It is the same rule contract intended for a new immutable PocketNet version.
// The v0.28 match rules remain in force until the full new match+UI is ready.

const MAGIC_RULES_VERSION=2;
const MAGIC_RUNE_INDEX=new Map(MAGIC_RUNES.map(card=>[card.id,card]));
const MAGIC_RARITIES=Object.freeze(['common','uncommon','rare','epic','transformation']);
const MAGIC_SLOT_CAPS=Object.freeze({...MAGIC_DESIGN_RULES.spellLimits});
const BASIC_ATTACK=Object.freeze({stone:'st_throw',fire:'fi_ember',storm:'li_spark'});
const LEGACY_SCHOOLS=Object.freeze({
 kindle:'fire',cinder:'fire',wire:'storm',coil:'storm',pebble:'stone',slate:'stone',
 fire:'fire',storm:'storm',stone:'stone'
});
const LEGACY_MAPPING=Object.freeze({
 on_cast:'u_on_cast',on_hit:'u_on_hit',on_hurt:'u_on_hurt',
 on_dash:'u_after_dash',on_guard:'u_after_guard',on_expire:'u_on_expire',
 on_bounce:'u_on_barrier',armor:'u_guard',heal:'u_heal',
 push:'u_push',clone:'u_afterimage',double:'u_split',
 lasting:'u_duration',wide:'u_size',far:'u_range',
 fastshot:'u_speed',bounce:'u_ricochet',cheap:'u_efficient',
 ball:'@attack',mine:'@mine',wall:'@wall'
});
const FORMS={
 stone:new Set(['st_throw','st_shards','st_spikes','st_fault','st_tremor']),
 fire:new Set(['fi_ember','fi_scorch','fi_lash','fi_inferno']),
 storm:new Set(['li_spark','li_arc','li_link','li_discharge'])
};
const FORBIDDEN=new Set(MAGIC_TRANSFORMS.explicitlyForbidden.map(p=>[...p].sort().join(':')));
const copy=value=>JSON.parse(JSON.stringify(value));
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const card=id=>MAGIC_RUNE_INDEX.get(id)||null;
const idOf=owned=>owned?.defId;
const activeRunes=spell=>[
 ...(spell.when?[spell.when]:[]),
 ...spell.actions.flatMap(a=>[a.rune,...a.mods])
];
const spellRuneCount=spell=>activeRunes(spell).length;
const permittedRune=(school,id)=>{
 const def=card(id);
 return !!def &&(def.school==='common'||def.school===school);
};
const newSlot=id=>({id,when:null,actions:[]});
const invalid=(s,message)=>({ok:false,error:message,state:s});
const valid=(s)=>({ok:true,state:s,error:null});
const currentRevision=(s,command)=>{
 if(!Number.isInteger(command.revision)||s.revision!==command.revision)return false;
 if(command.nonce!=null&&(typeof command.nonce!=='string'||command.nonce.length<1||command.nonce.length>64))return false;
 return true;
};
const transformPair=(a,b)=>[a,b].sort().join(':');
function scopeFor(spell,action){
 const def=card(idOf(action.rune));
 return def?.id==='u_reform_base'?'base':def?.id;
}
function validateAction(def,mod){
 if(mod.rarity!=='transformation')return true;
 if(def.id==='u_reform_base')return true;
 if(def.school!==mod.school)return false;
 return !!FORMS[def.school]?.has(def.id);
}
function effectiveTransforms(spells){
 const byScope=new Map();
 for(const spell of spells){
  for(const action of spell.actions){
   const key=scopeFor(spell,action);
   for(const instance of action.mods){
    const def=card(idOf(instance));
    if(def?.rarity!=='transformation')continue;
    const keyName=key==='base'?'base':spell.id+':'+key;
    const aspects=byScope.get(keyName)||new Map();
    for(const prev of aspects.values()){
     if(prev.id===def.id)continue;
     if(prev.aspect===def.aspect||FORBIDDEN.has(transformPair(prev.id,def.id)))return {error:'Несовместимые преображения: '+prev.name+' и '+def.name};
    }
    aspects.set(def.aspect,def);byScope.set(keyName,aspects);
   }
  }
 }
 return {scopes:byScope};
}
function validateMagicSpell(spell,{requireReady=false}={}){
 if(!spell||!Array.isArray(spell.actions)||!Number.isInteger(spell.id)||
    spell.actions.some(a=>!a||!a.rune||!Array.isArray(a.mods))||
    (spell.when!=null&&typeof spell.when!=='object'))
   return {ok:false,error:'Повреждён слот заклинания'};
 if(spell.actions.length>MAGIC_SLOT_CAPS.do)return {ok:false,error:'В заклинании не больше двух ЧТО'};
 if(spellRuneCount(spell)>5)return {ok:false,error:'В заклинании не больше пяти рун'};
 if(spell.when&&card(idOf(spell.when))?.kind!=='when')return {ok:false,error:'Неверная руна КОГДА'};
 let modCount=0,passiveCount=0;
 for(const a of spell.actions){
  const d=card(idOf(a.rune));
  if(!d||d.kind!=='do'||!Array.isArray(a.mods))return {ok:false,error:'Неверная руна ЧТО'};
  if(d.id==='u_reform_base')passiveCount++;
  for(const m of a.mods){
   const md=card(idOf(m));
   if(!md||md.kind!=='how'||!validateAction(d,md))return {ok:false,error:'Это КАК не подходит выбранному действию'};
   modCount++;
  }
 }
 if(modCount>MAGIC_SLOT_CAPS.how)return {ok:false,error:'В заклинании не больше двух КАК'};
 if(passiveCount&&(passiveCount!==1||spell.actions.length!==1||spell.when))return {ok:false,error:'Преображение основы должно быть самостоятельным без КОГДА'};
 if(requireReady){
  if(spell.actions.length===0)return {ok:false,error:'Нельзя использовать пустое заклинание'};
  if(passiveCount&&!spell.actions[0].mods.some(m=>card(idOf(m))?.rarity==='transformation'))return {ok:false,error:'Для преображения нужна руна формы'};
  if(!passiveCount&&!spell.when)return {ok:false,error:'Заклинанию нужна руна КОГДА'};
 }
 const compatible=effectiveTransforms([spell]);
 if(compatible.error)return {ok:false,error:compatible.error};
 return {ok:true,error:null};
}
function allSpells(state){return [...state.sealed,...state.slots]}
function validateMagicState(s){
 if(!s||s.rulesetVersion!==MAGIC_RULES_VERSION||!MAGIC_SCHOOLS.includes(s.school)||!Number.isInteger(s.revision)||s.revision<0)return {ok:false,error:'Неизвестные правила или стихия'};
 if(!Array.isArray(s.reserve)||!Array.isArray(s.slots)||s.slots.length!==3||!Array.isArray(s.sealed)||!Number.isInteger(s.nextInstance))return {ok:false,error:'Повреждён гримуарий'};
 // A network or saved-state payload may contain malformed nested arrays. Reject
 // it before enumerating rune instances rather than throwing from flatMap.
 const spells=[...s.slots,...s.sealed];
 if(spells.some(spell=>!spell||typeof spell!=='object'||!Array.isArray(spell.actions)||
    spell.actions.some(a=>!a||!a.rune||!Array.isArray(a.mods))||
    (spell.when!==null&&spell.when!==undefined&&typeof spell.when!=='object')))
  return {ok:false,error:'Повреждена структура заклинаний'};
 if(!s.slots.every((slot,i)=>slot.id===i))return {ok:false,error:'Неверные номера трёх слотов'};
 if(!s.sealed.every((slot,i)=>slot.id===3+i))return {ok:false,error:'Повреждён порядок печатей'};
 const seen=new Set();
 for(const instance of [...s.reserve,...allSpells(s).flatMap(activeRunes)]){
  if(!instance||!Number.isSafeInteger(instance.instanceId)||instance.instanceId<1||
    !permittedRune(s.school,instance.defId)||seen.has(instance.instanceId))return {ok:false,error:'Дубликат или чужая руна'};
  seen.add(instance.instanceId);
 }
 if(seen.size>=s.nextInstance)return {ok:false,error:'Повреждён счётчик экземпляров рун'};
 for(const spell of s.slots){
  const check=validateMagicSpell(spell);
  if(!check.ok)return check;
 }
 for(const spell of s.sealed){
  const check=validateMagicSpell(spell,{requireReady:true});
  if(!check.ok)return check;
 }
 const transformations=effectiveTransforms(allSpells(s));
 if(transformations.error)return {ok:false,error:transformations.error};
 if(!Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff)return {ok:false,error:'Повреждён seed'};
 if(!Array.isArray(s.offers)||s.offers.some(id=>!permittedRune(s.school,id)))return {ok:false,error:'Чужие предложения'};
 if(!Array.isArray(s.nonces)||s.nonces.length>48||s.nonces.some(n=>typeof n!=='string'||n.length>64))return {ok:false,error:'Повреждён журнал команд'};
 return {ok:true,error:null};
}
const makeInstance=(s,id)=>({instanceId:s.nextInstance++,defId:id});
function createMagicLoadout(school,{seed=1,starter='defense'}={}){
 if(!MAGIC_SCHOOLS.includes(school))throw new RangeError('Unknown school');
 const s={rulesetVersion:MAGIC_RULES_VERSION,school,seed:(seed>>>0)||1,revision:0,
  reserve:[],slots:[newSlot(0),newSlot(1),newSlot(2)],sealed:[],
  offers:[],nextInstance:1,nonces:[]};
 const starterCards=starter==='attack'?['u_on_hit',BASIC_ATTACK[school]]:
  starter==='mobility'?['u_after_dash','u_guard']:['u_on_hurt','u_guard'];
 s.slots[0].when=makeInstance(s,starterCards[0]);
 s.slots[0].actions.push({rune:makeInstance(s,starterCards[1]),mods:[]});
 if(!validateMagicState(s).ok)throw Error('Invalid starter');
 return s;
}
const availableMagicRunes=school=>MAGIC_RUNES.filter(r=>permittedRune(school,r.id));
function compileMagic(s,{includeUnfinished=false}={}){
 const result=[];
 for(const spell of allSpells(s)){
  const check=validateMagicSpell(spell,{requireReady:true});
  if(!includeUnfinished&&!check.ok)continue;
  result.push({
   slotId:spell.id,sealed:spell.id>=3,ready:check.ok,
   trigger:spell.when?.defId||null,
   actions:spell.actions.map(a=>({
    id:a.rune.defId,instanceId:a.rune.instanceId,
    mods:a.mods.map(m=>m.defId)
   }))
  });
 }
 return result;
}
function effectiveMagicForm(s){
 const transforms=effectiveTransforms(allSpells(s));
 if(transforms.error)return {ok:false,error:transforms.error};
 const base=transforms.scopes.get('base')||new Map();
 return {ok:true,school:s.school,shape:base.get('shape')?.id||null,
  origin:base.get('origin')?.id||null,
  motion:base.get('motion')?.id||null,
  impact:base.get('impact')?.id||null};
}
function editInner(s,cmd){
 const slot=s.slots[cmd.slot];
 if(!slot)return 'Нет такого слота';
 if(cmd.type==='equip'){
  const idx=s.reserve.findIndex(r=>r.instanceId===cmd.instanceId);
  if(idx<0)return 'Руна не принадлежит игроку или уже установлена';
  const inst=s.reserve[idx],def=card(inst.defId);
  if(def.kind==='when'){
   if(slot.when||slot.actions.some(a=>idOf(a.rune)==='u_reform_base'))return 'Нельзя добавить второе КОГДА';
   slot.when=inst;
  }else if(def.kind==='do'){
   if(slot.actions.length>=2)return 'Не больше двух ЧТО';
   if(def.id==='u_reform_base'&&(slot.when||slot.actions.length>0))return 'Преображение основы — отдельное заклинание';
   if(slot.actions.some(a=>idOf(a.rune)==='u_reform_base'))return 'К пассивной форме нельзя добавить второе ЧТО';
   slot.actions.push({rune:inst,mods:[]});
  }else{
   if(!Number.isInteger(cmd.action)||cmd.action<0||cmd.action>=slot.actions.length)return 'Сначала укажи ЧТО, которое изменяет КАК';
   if(slot.actions.reduce((n,a)=>n+a.mods.length,0)>=2)return 'Не больше двух КАК';
   if(!validateAction(card(idOf(slot.actions[cmd.action].rune)),def))return 'Руна КАК несовместима с действием';
   slot.actions[cmd.action].mods.push(inst);
  }
  s.reserve.splice(idx,1);
 }else if(cmd.type==='unequip'){
  if(slot.when?.instanceId===cmd.instanceId){s.reserve.push(slot.when);slot.when=null;return null}
  const index=slot.actions.findIndex(a=>a.rune.instanceId===cmd.instanceId);
  if(index>=0){const [removed]=slot.actions.splice(index,1);s.reserve.push(removed.rune,...removed.mods);return null}
  for(const a of slot.actions){
   const modIndex=a.mods.findIndex(m=>m.instanceId===cmd.instanceId);
   if(modIndex>=0){s.reserve.push(...a.mods.splice(modIndex,1));return null}
  }
  return 'Руна отсутствует в редактируемом слоте';
 }else if(cmd.type==='seal'){
  const ready=validateMagicSpell(slot,{requireReady:true});
  if(!ready.ok)return ready.error;
  const seal=copy(slot);seal.id=s.sealed.length+3;
  s.sealed.push(seal);s.slots[cmd.slot]=newSlot(cmd.slot);
 }else return 'Неизвестное действие редактора';
 return null;
}
function applyMagicEdit(state,command){
 const first=validateMagicState(state);
 if(!first.ok)return invalid(state,first.error);
 if(!command||typeof command!=='object'||!currentRevision(state,command))return invalid(state,'Устаревшая версия сборки');
 if(command.nonce!=null&&state.nonces.includes(command.nonce))return invalid(state,'Повторная команда');
 if(!['equip','unequip','seal'].includes(command.type))return invalid(state,'Команда не разрешена');
 if(!Number.isInteger(command.slot)||command.slot<0||command.slot>=3)return invalid(state,'Нет такого слота');
 const draft=copy(state);
 const error=editInner(draft,command);
 if(error)return invalid(state,error);
 const check=validateMagicState(draft);
 if(!check.ok)return invalid(state,check.error);
 draft.revision++;
 if(command.nonce!=null){draft.nonces.push(command.nonce);if(draft.nonces.length>48)draft.nonces.shift()}
 return valid(draft);
}
function grantEarnedMagicRune(state,id){
 const check=validateMagicState(state);
 if(!check.ok)return invalid(state,check.error);
 if(!permittedRune(state.school,id))return invalid(state,'Чужая стихия или неизвестная руна');
 // Different *instances* of the same card are intentional: a sealed rune is
 // permanently consumed, but another copy may be earned later in this match.
 if(state.nextInstance>80)return invalid(state,'Достигнут предел рун за партию');
 const s=copy(state);s.reserve.push(makeInstance(s,id));s.revision++;
 return valid(s);
}
const rarityWeights=[
 {common:60,uncommon:30,rare:9,epic:1,transformation:0},
 {common:35,uncommon:35,rare:20,epic:7,transformation:3},
 {common:20,uncommon:30,rare:28,epic:13,transformation:9}
];
const roll=s=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296};
const takeWeighted=(s,pool,weights)=>{
 const total=pool.reduce((sum,c)=>sum+(weights[c.rarity]||0),0);
 if(total<=0)return -1;
 let x=roll(s)*total;
 for(let i=0;i<pool.length;i++){x-=weights[pool[i].rarity]||0;if(x<0)return i}
 return pool.length-1;
};
function dealMagicOffers(state,minute){
 const check=validateMagicState(state);
 if(!check.ok)return invalid(state,check.error);
 if(!Number.isInteger(minute)||minute<1||minute>9)return invalid(state,'Неверный этап Разлома');
 if(state.offers.length)return invalid(state,'Сначала выбери предложенную руну');
 const s=copy(state),available=new Set([...s.reserve,...allSpells(s).flatMap(activeRunes)].map(r=>r.defId));
 // Cards held in reserve/editable slots do not crowd the offer. Sealed copies
 // can reappear later, so early sealing never makes the rest of the match dead.
 const heldOutsideSeals=new Set([...s.reserve,...s.slots.flatMap(activeRunes)].map(r=>r.defId));
 const pool=availableMagicRunes(s.school).filter(r=>!heldOutsideSeals.has(r.id));
 const weights=rarityWeights[minute<=2?0:minute<=5?1:2];
 const picked=[];
 // On milestone minutes guarantee at least one *offer*, never a forced selection.
 if(minute===4||minute===7){
  const upgrades=pool.filter(r=>r.rarity==='transformation');
  if(upgrades.length){const choice=upgrades[Math.floor(roll(s)*upgrades.length)];picked.push(choice.id);pool.splice(pool.indexOf(choice),1)}
 }
 while(pool.length&&picked.length<3){
  const choice=takeWeighted(s,pool,weights);
  if(choice<0)break;
  picked.push(pool.splice(choice,1)[0].id);
 }
 s.offers=picked;s.revision++;
 return valid(s);
}
function claimMagicOffer(state,id,revision){
 const check=validateMagicState(state);
 if(!check.ok)return invalid(state,check.error);
 if(!Number.isInteger(revision)||state.revision!==revision)return invalid(state,'Устаревшее предложение');
 if(!state.offers.includes(id))return invalid(state,'Руна не была предложена');
 const draft=copy(state);draft.offers=[];draft.reserve.push(makeInstance(draft,id));draft.revision++;
 return valid(draft);
}
function previewLegacyMagic(legacy){
 const oldMage=legacy?.mageId||legacy?.mage||legacy?.school;
 const school=LEGACY_SCHOOLS[oldMage]||null;
 const oldRunes=Array.isArray(legacy?.runes)?legacy.runes:[];
 const mapped=[],unmapped=[];
 for(const old of oldRunes){
  let converted=LEGACY_MAPPING[old];
  if(converted==='@attack')converted=school&&BASIC_ATTACK[school];
  if(converted==='@wall')converted=school==='stone'?'st_wall':null;
  if(converted==='@mine')converted=school==='fire'?'fi_cindermine':school==='storm'?'li_coil':null;
  if(school&&permittedRune(school,converted)&&!mapped.some(x=>x.to===converted))mapped.push({from:old,to:converted});
  else unmapped.push(old);
 }
 return {supported:!!school,school,mapped,unmapped,original:copy(legacy||{})};
}
function migrateLegacyMagic(legacy,{confirmed=false,seed=1}={}){
 const preview=previewLegacyMagic(legacy);
 if(!confirmed||!preview.supported)return {ok:false,needsConfirmation:!confirmed,preview,state:null};
 let s=createMagicLoadout(preview.school,{seed,starter:'defense'});
 // Keep existing starter equipped, and put extra compatible cards into reserve.
 for(const r of preview.mapped){
  if([...s.reserve,...allSpells(s).flatMap(activeRunes)].some(a=>a.defId===r.to))continue;
  s=grantEarnedMagicRune(s,r.to).state;
 }
 return {ok:true,needsConfirmation:false,preview,state:s};
}

const MAGIC_V2_PRACTICE_RUNES=Object.freeze([
 'u_on_cast','u_on_hit','u_on_hurt','u_after_dash','u_after_guard',
 'u_guard','u_push','u_heal','u_afterimage','u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet',
 'st_throw','st_shards','st_wall','st_spikes','st_fault','fi_ember','fi_scorch','fi_flamepatch','fi_cindermine','fi_lash','li_spark','li_arc','li_pylon','li_link','li_coil','li_discharge',
 'u_reform_base','st_form_wave','st_form_spires','st_form_colossus','st_origin_self','st_origin_below','st_impact_rubble',
 'fi_form_stream','fi_form_whirl','fi_form_comet','fi_origin_self','fi_origin_sky','fi_impact_wildfire',
 'li_form_ray','li_form_sphere','li_origin_self','li_origin_pylon','li_motion_orbit','li_impact_chain'
]);
// Only verified modifiers appear as equippable buttons for a given action in
// the current live laboratory. The full catalog is reserved for later phases.
const V2_PRACTICE_MODS=Object.freeze({
 u_reform_base:['st_form_wave','st_form_spires','st_form_colossus','st_origin_self','st_origin_below','st_impact_rubble','fi_form_stream','fi_form_whirl','fi_form_comet','fi_origin_self','fi_origin_sky','fi_impact_wildfire','li_form_ray','li_form_sphere','li_origin_self','li_origin_pylon','li_motion_orbit','li_impact_chain'],
 u_guard:['u_size','u_efficient'],
 u_push:['u_size','u_efficient'],
 u_heal:['u_efficient'],
 u_afterimage:['u_efficient'],
 st_throw:['u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet','st_impact_rubble'],
 st_shards:['u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet','st_impact_rubble'],
 st_wall:['u_size','u_duration','u_efficient'],
 st_spikes:['u_size','u_duration','u_efficient'],
 st_fault:['u_size','u_duration','u_efficient','st_impact_rubble'],
 fi_ember:['u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet','fi_impact_wildfire'],
 fi_scorch:['u_size','u_efficient'],
 fi_flamepatch:['u_size','u_duration','u_efficient'],
 fi_cindermine:['u_size','u_duration','u_efficient'],
 fi_lash:['u_size','u_range','u_efficient','fi_impact_wildfire'],
 li_spark:['u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet','li_motion_orbit','li_impact_chain'],
 li_arc:['u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet','li_impact_chain'],
 li_discharge:['u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet','li_impact_chain'],
 li_coil:['u_size','u_duration','u_efficient'],
 li_pylon:['u_size','u_duration','u_efficient'],
 li_link:['u_size','u_duration','u_efficient']
});
function magicV2PracticeModifierFits(action,modifier){
 return !!V2_PRACTICE_MODS[action]?.includes(modifier);
}
function magicV2Attack(s,a,target){
 if(a.cast>0||a.stun>0||a.windup)return false;
 a.face=Math.atan2(target.y-a.y,target.x-a.x);
 const school=a.magicSchool,form=effectiveMagicForm(s.magicLoadouts?.[a.id]||{slots:[],sealed:[]});
 const shape=form.ok?form.shape:null,origin=form.ok?form.origin:null;
 const angle=a.face,impact=form.ok?form.impact:null,motion=form.ok?form.motion:null,
 forward=(distance,margin=12)=>{
  // The launch point must be reachable from the caster. Shapes never teleport
  // through a permanent wall or a temporary opposing barrier.
  const path=rayCollision(s,a.x,a.y,angle,distance,margin,a.id,false);
  const d=Math.max(0,Math.min(distance,path.length-margin));
  return {x:a.x+Math.cos(angle)*d,y:a.y+Math.sin(angle)*d};
 };
 let fired=false,extraHeat=0;
 if(school==='stone'&&shape==='st_form_colossus'&&s.lobs.length<12){
  const self=origin==='st_origin_self',below=origin==='st_origin_below';
  const at=forward(self?67:below?165:124,12);
  // The future impact is public from the first frame. No remote placement
  // through a wall; the projected crater and collision use the same point.
  if(canStand(at.x,at.y,15)&&!blocking(s,at.x,at.y,16)){
   const d=Math.hypot(at.x-a.x,at.y-a.y);
   s.lobs.push({owner:a.id,sx:a.x,sy:a.y,x:a.x,y:a.y,
    tx:at.x,ty:at.y,progress:0,duration:self?.53:below?.82:.71,
    age:0,height:0,apex:below?99:78,radius:self?30:35,
    damage:self?15:18,element:'stone',v2Monolith:true,v2Impact:impact});
   fired=true;extraHeat=12;fx(s,'hurl',a.x,a.y);
  }
 }else if(school==='fire'&&shape==='fi_form_comet'&&s.lobs.length<12){
  const self=origin==='fi_origin_self',sky=origin==='fi_origin_sky';
  const at=forward(self?87:sky?174:144,9);
  if(canStand(at.x,at.y,12)&&!blocking(s,at.x,at.y,12)){
   s.lobs.push({owner:a.id,sx:a.x,sy:a.y,x:a.x,y:a.y,
    tx:at.x,ty:at.y,progress:0,duration:sky?.82:.62,
    age:0,height:0,apex:sky?118:80,radius:sky?48:42,
    damage:sky?16:14,element:'fire',v2Comet:true,v2Impact:impact});
   fired=true;extraHeat=11;fx(s,'hurl',a.x,a.y);
  }
 }else if(school==='stone'&&shape==='st_form_spires'&&s.waves.length<12){
  const self=origin==='st_origin_self',count=self?4:3;
  // A crown uses four directional spokes from the caster. The directional
  // crest is a series of individually warned ground eruptions; no relocation
  // past walls or hostile temporary cover.
  for(let j=0;j<count&&s.waves.length<16;j++){
   const direction=self?angle+j*Math.PI/2:angle;
   const distance=48+j*39;
   if(!self&&beamLength(s,a.x,a.y,angle,distance+7,a.id)<distance-5)break;
   const x=self?a.x:a.x+Math.cos(angle)*distance;
   const y=self?a.y:a.y+Math.sin(angle)*distance;
   if(!canStand(x,y,self?12:9)||blocking(s,x,y,self?12:9))break;
   s.waves.push({owner:a.id,x,y,angle:direction,
    range:self?77:24,reach:0,halfAngle:self?.37:Math.PI,
    life:self?.85:1.18+j*.15,warmup:self?.21+j*.035:.28+j*.14,
    hit:false,v2Element:'stone',v2Spire:true,damage:self?6:4.5,v2Impact:impact});
  }
  fired=true;extraHeat=9;fx(s,'quake',a.x,a.y);
 }else if(school==='fire'&&shape==='fi_form_whirl'&&s.mines.length<14){
  const self=origin==='fi_origin_self',sky=origin==='fi_origin_sky';
  const at=self?{x:a.x,y:a.y}:forward(sky?143:82,11);
  if(canStand(at.x,at.y,12)&&!blocking(s,at.x,at.y,12)){
   s.mines.push({owner:a.id,x:at.x,y:at.y,r:self?65:sky?59:55,
    arm:sky?.42:.22,life:sky?2.55:2.25,damage:2.4,element:'fire',
    v2Whirl:true,phase:angle,whirlCd:0,followOwner:self,v2Impact:impact});
   fired=true;extraHeat=9;fx(s,'flame',at.x,at.y);
  }
 }else if(school==='storm'&&shape==='li_form_sphere'&&s.shots.length<79){
  const orbit=origin==='li_origin_self',pylon=origin==='li_origin_pylon';
  const at=orbit?{x:a.x+Math.cos(angle)*38,y:a.y+Math.sin(angle)*38}:
   pylon?forward(73,11):{x:a.x,y:a.y};
  if(canStand(at.x,at.y,14)&&!blocking(s,at.x,at.y,14)){
   fired=spawnShot(s,a,angle,at.x,at.y,{style:'arc',element:'storm',
    damage:9,life:orbit?2.05:1.8,signature:false});
   if(fired){
    const q=s.shots[s.shots.length-1];
    q.v2Sphere=true;q.v2Orbit=orbit||motion==='li_motion_orbit';q.v2Impact=impact;q.r=12;
    q.vx=Math.cos(angle)*138;q.vy=Math.sin(angle)*138;
    q.accel=0;q.spherePulse=.36;q.orbitAngle=angle;q.orbitRadius=38;
    extraHeat=10;fx(s,'thunder',at.x,at.y);
   }
  }
 }else if(school==='stone'&&shape==='st_form_wave'&&s.waves.length<12){
  const fromBelow=origin==='st_origin_below',self=origin==='st_origin_self';
  const at=fromBelow?forward(154):{x:a.x,y:a.y};
  s.waves.push({owner:a.id,x:at.x,y:at.y,angle,range:fromBelow?65:self?104:130,
   reach:0,halfAngle:fromBelow||self?Math.PI:.57,life:fromBelow?.68:.34,
   warmup:fromBelow?.22:0,hit:false,v2Element:'stone',damage:fromBelow?11:13,v2Impact:impact});
  fx(s,'quake',at.x,at.y);fired=true;extraHeat=7;
 }else if(school==='fire'&&shape==='fi_form_stream'&&s.waves.length<12){
  const sky=origin==='fi_origin_sky',self=origin==='fi_origin_self';
  const at=sky?forward(152):{x:a.x,y:a.y};
  s.waves.push({owner:a.id,x:at.x,y:at.y,angle,range:sky?62:self?74:105,
   reach:0,halfAngle:sky||self?Math.PI:.38,life:sky?.66:.34,
   warmup:sky?.22:0,hit:false,v2Element:'fire',damage:sky?10:8,v2Impact:impact});
  fx(s,'flame',at.x,at.y);fired=true;extraHeat=6;
 }else if(school==='storm'&&shape==='li_form_ray'&&s.beams.length<12){
  const orbital=motion==='li_motion_orbit';
  const spin=angle+s.ticks*STEP*3.8;
  const at=orbital?{x:a.x+Math.cos(spin)*39,y:a.y+Math.sin(spin)*39}:
   origin==='li_origin_pylon'?forward(68,7):{x:a.x,y:a.y};
  const length=beamLength(s,at.x,at.y,angle,origin==='li_origin_self'?168:220,a.id);
  s.beams.push({owner:a.id,x:at.x,y:at.y,angle,length,life:.22,style:'evo-beam',element:'storm',width:5});
  const other=s.actors[1-a.id],dx=other.x-at.x,dy=other.y-at.y;
  const along=dx*Math.cos(angle)+dy*Math.sin(angle);
  const sideways=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));
  if(along>=0&&along<=length+9&&sideways<=15){
   other.shield=Math.max(0,other.shield-3);
   const damage=harm(s,other,11,a.id);
   if(damage>0){emit(s,'on_hit',a.id);v2Contact(s,a.id,impact,other.x,other.y)}
   fx(s,'impact_arc',other.x,other.y);
  }
  fx(s,'thunder',at.x,at.y);fired=true;extraHeat=9;
 }else if(s.shots.length<80){
  const style=school==='stone'?'rock':school==='storm'?'bolt':'orb';
  fired=spawnShot(s,a,angle,a.x,a.y,{style,element:school,damage:12,life:1.3,signature:false});
  if(fired){const q=s.shots[s.shots.length-1];q.v2Impact=impact;
   if(motion==='li_motion_orbit'&&school==='storm'){
    q.v2MagicOrbit=true;q.v2Orbit=true;q.orbitAngle=angle;
    q.orbitRadius=42;q.x=a.x+Math.cos(angle)*42;q.y=a.y+Math.sin(angle)*42;
    q.life=1.85;q.damage=9;
   }
  }
 }
 if(fired){
  a.cast=shape?(school==='stone'?0.86:school==='fire'?0.65:0.76):stats(a).reload;
  addHeat(s,a,7+extraHeat);emit(s,'on_cast',a.id);
 }
 return fired;
}
function magicV2Action(s,a,act,mods,ev){
 const other=s.actors[1-a.id],school=a.magicSchool;
 const defs=new Set(mods),size=defs.has('u_size'),extend=defs.has('u_duration')||defs.has('u_range'),
 fast=defs.has('u_speed'),ricochet=defs.has('u_ricochet'),
 split=defs.has('u_split'),cheap=defs.has('u_efficient');
 const angle=a.face,impact=mods.find(id=>['st_impact_rubble','fi_impact_wildfire','li_impact_chain'].includes(id)),
 base={element:school,signature:false,wide:size,fastshot:fast,far:extend,
  bounce:ricochet,life:extend?2:1.15,damage:12,depth:ev.depth+1};
 const shoot=(style,damage=12)=>{
  const count=split?2:1;
  for(let j=0;j<count;j++){
   if(spawnShot(s,a,angle+(count===2?(j===0?-.13:.13):0),a.x,a.y,{
    ...base,style,damage:damage/count
   })){const q=s.shots[s.shots.length-1];q.v2Impact=impact;
    if(defs.has('li_motion_orbit')&&school==='storm'){
     const theta=angle+(count===2?(j===0?-.13:.13):0);
     q.v2MagicOrbit=true;q.v2Orbit=true;q.orbitAngle=theta;q.orbitRadius=40;
     q.x=a.x+Math.cos(theta)*40;q.y=a.y+Math.sin(theta)*40;q.life=1.75;
    }
   }
  }
 };
 // Cross-slot defensive action cooldowns: multiple triggers cannot
 // alternate to bypass the defensive economy of a single loadout.
 const shared=act==='u_guard'?'v2:shared-guard':
  act==='u_heal'?'v2:shared-heal':null;
 if(shared){
  if(s.ticks<(a.runeTimers[shared]||0))return false;
  a.runeTimers[shared]=s.ticks+Math.ceil((act==='u_guard'?1.65:2.4)/STEP);
 }
 switch(act){
  case 'u_guard':a.shield=Math.min(80,a.shield+(size?22:14));fx(s,'shield',a.x,a.y);break;
  case 'u_heal':receiveHeal(s,a,8,ev.depth+1);break;
  case 'u_push':{
   const dx=other.x-a.x,dy=other.y-a.y,d=mag(dx,dy);
   if(d<125&&unobstructed(s,a.x,a.y,other.x,other.y,a.id,8))
    move(other,dx/d*(size?38:26),dy/d*(size?38:26));
   fx(s,'dash',other.x,other.y);break;
  }
  case 'u_afterimage':if(s.echoes.length<8)s.echoes.push({owner:a.id,x:a.x,y:a.y,cast:.45,life:1.5,shots:1});break;
  case 'st_throw':shoot('rock');break;
  case 'st_shards':{
   const count=split?5:3;
   for(let j=0;j<count;j++){
    if(spawnShot(s,a,angle+(j-(count-1)/2)*.16,a.x,a.y,
     {...base,style:'rock',damage:6,life:extend?1.3:.8}))s.shots[s.shots.length-1].v2Impact=impact;
   }
   break;
  }
  case 'st_spikes':{
   // Three separate ground spikes. Each is armed visibly before dealing damage;
   // placement respects real line-of-sight and never spawns beyond cover.
   for(let j=0;j<3&&s.waves.length<16;j++){
    const distance=51+j*34;
    if(beamLength(s,a.x,a.y,angle,distance+8,a.id)<distance-5)break;
    const x=a.x+Math.cos(angle)*distance,y=a.y+Math.sin(angle)*distance;
    if(!canStand(x,y,8))break;
    s.waves.push({owner:a.id,x,y,angle,range:size?32:24,reach:0,
     halfAngle:Math.PI,life:(extend?1.2:.85)+j*.10,
     warmup:.30+j*.10,hit:false,v2Element:'stone',v2Spikes:true,damage:6.5});
   }
   fx(s,'quake',a.x+Math.cos(angle)*35,a.y+Math.sin(angle)*35);
   break;
  }
  case 'st_fault':{
   // Three delayed ground ruptures extend in a single visible direction.
   // Every segment is independently line-of-sight checked against current
   // cover. Unlike the broad spike field, a fault adds a strong slow.
   for(let j=0;j<3&&s.waves.length<16;j++){
    const distance=57+j*43;
    if(beamLength(s,a.x,a.y,angle,distance+8,a.id)<distance-5)break;
    const x=a.x+Math.cos(angle)*distance,y=a.y+Math.sin(angle)*distance;
    if(!canStand(x,y,9)||blocking(s,x,y,9))break;
    s.waves.push({owner:a.id,x,y,angle,range:size?33:25,reach:0,
     halfAngle:Math.PI,life:(extend?1.35:.95)+j*.13,
     warmup:.29+j*.13,hit:false,v2Element:'stone',v2Fault:true,damage:5});
   }
   fx(s,'fracture',a.x+Math.cos(angle)*35,a.y+Math.sin(angle)*35);
   break;
  }
  case 'st_wall':{
   const x=a.x+Math.cos(angle)*46,y=a.y+Math.sin(angle)*46,r=size?24:17;
   if(s.barriers.length<10&&canStand(x,y,r)&&!blocking(s,x,y,r))
    s.barriers.push({owner:a.id,x,y,r,life:extend?6:3.5,hp:30});
   fx(s,'shield',x,y);break;
  }
  case 'fi_cindermine':{
   // Independent armed trap: approach-sensitive, expires, and cannot trigger
   // through permanent walls or a defending player's construct.
   const distance=65;
   if(s.mines.length<14&&beamLength(s,a.x,a.y,angle,distance+9,a.id)>=distance-5){
    const x=a.x+Math.cos(angle)*distance,y=a.y+Math.sin(angle)*distance;
    if(canStand(x,y,12)&&!blocking(s,x,y,12))
     s.mines.push({owner:a.id,x,y,r:size?50:37,life:extend?6:4.4,
      arm:.58,damage:10,element:'fire',v2Trap:true});
    fx(s,'mine',x,y);
   }
   break;
  }
  case 'fi_lash':{
   // Short, focused burning beam. The same wall-clipped beam length is
   // rendered and used for damage; there is no proximity-only hit.
   const length=beamLength(s,a.x,a.y,angle,extend?173:127,a.id);
   const width=size?14:9;
   if(s.beams.length<16)s.beams.push({owner:a.id,x:a.x,y:a.y,
    angle,length,life:.25,width,element:'fire',style:'evo-beam',v2Lash:true});
   const dx=other.x-a.x,dy=other.y-a.y,
    ahead=dx*Math.cos(angle)+dy*Math.sin(angle),
    off=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));
   if(ahead>=0&&ahead<=length+5&&off<=width+10){
    const dealt=harm(s,other,10,a.id,ev.depth+1);
   if(dealt>0)v2Contact(s,a.id,impact,other.x,other.y);
    if(dealt>0){
     other.burn=Math.max(other.burn||0,1.3);other.burnSource=a.id;
     emit(s,'on_hit',a.id,{},ev.depth+1);
    }
    fx(s,'impact_flame',other.x,other.y);
   }
   fx(s,'flame',a.x+Math.cos(angle)*24,a.y+Math.sin(angle)*24);
   break;
  }
  case 'fi_ember':shoot('orb');break;
  case 'fi_scorch':{
   const dx=other.x-a.x,dy=other.y-a.y,d=mag(dx,dy);
   if(d<(size?116:86)&&unobstructed(s,a.x,a.y,other.x,other.y,a.id,8)){
    const dealt=harm(s,other,split?8:11,a.id,ev.depth+1);
    if(dealt>0)emit(s,'on_hit',a.id,{},ev.depth+1);
   }
   fx(s,'ember',a.x+Math.cos(angle)*31,a.y+Math.sin(angle)*31);break;
  }
  case 'fi_flamepatch':{
   const x=a.x+Math.cos(angle)*32,y=a.y+Math.sin(angle)*32;
   if(s.mines.length<14&&!distWall(x,y,8))s.mines.push({
    owner:a.id,x,y,r:size?60:42,life:extend?5:3,damage:9,element:'fire'
   });
   fx(s,'mine',x,y);break;
  }
  case 'li_pylon':{
   // A real destructible barrier-node, shared by movement/projectile
   // collision and the wire geometry. Maximum three live nodes per owner.
   const mineCount=s.barriers.filter(b=>b.owner===a.id&&b.v2Pylon).length;
   const distance=82;
   if(mineCount<3&&s.barriers.length<10
     &&beamLength(s,a.x,a.y,angle,distance+8,a.id)>=distance-5){
    const x=a.x+Math.cos(angle)*distance,y=a.y+Math.sin(angle)*distance,
     r=size?17:13;
    if(canStand(x,y,r)&&!blocking(s,x,y,r)){
     s.barriers.push({owner:a.id,x,y,r,life:extend?7:5.3,
      hp:size?37:26,v2Pylon:true,nodeId:++s.serial});
     fx(s,'thunder',x,y);
    }
   }
   break;
  }
  case 'li_link':{
   const pylons=s.barriers.filter(b=>b.owner===a.id&&b.v2Pylon&&b.hp>0);
   const pair=pylons.slice(-2);
   if(pair.length===2&&s.mines.length<14){
    const [u,v]=pair,dist=Math.hypot(v.x-u.x,v.y-u.y);
    // Exclude only the endpoint nodes from the LOS test. A wall or a third
    // barrier between endpoints must prevent the network from existing.
    const world={...s,barriers:s.barriers.filter(b=>b!==u&&b!==v)};
    if(dist<=225&&dist>32&&unobstructed(world,u.x,u.y,v.x,v.y,a.id,7)
      &&!s.mines.some(m=>m.v2Conduit&&m.owner===a.id&&
        ((m.aId===u.nodeId&&m.bId===v.nodeId)||(m.aId===v.nodeId&&m.bId===u.nodeId)))){
     s.mines.push({owner:a.id,x:u.x,y:u.y,x2:v.x,y2:v.y,
      aId:u.nodeId,bId:v.nodeId,life:extend?4.6:3.1,
      arm:.24,damage:size?3.1:2.4,element:'storm',
      v2Conduit:true,conduitCd:0});
     fx(s,'thunder',u.x,u.y);
    }
   }else if(s.beams.length<16){
    // With fewer than two nodes the spell is still useful but cannot
    // produce an invisible or free link; show a short clipped fallback arc.
    const length=beamLength(s,a.x,a.y,angle,96,a.id),width=6;
    s.beams.push({owner:a.id,x:a.x,y:a.y,angle,length,life:.23,
     width,element:'storm',style:'evo-beam',v2Fallback:true});
    const dx=other.x-a.x,dy=other.y-a.y;
    const along=dx*Math.cos(angle)+dy*Math.sin(angle);
    const side=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));
    if(along>=0&&along<=length+7&&side<=width+12){
     other.shield=Math.max(0,other.shield-2);
     const dealt=harm(s,other,4.5,a.id,ev.depth+1);
     if(dealt>0)emit(s,'on_hit',a.id,{},ev.depth+1);
    }
   }
   break;
  }
  case 'li_coil':{
   // A physically planted, single-use electric charge. Its arming circle
   // and lifetime are server state, never an instantaneous invisible strike.
   const distance=67;
   if(s.mines.length<14&&beamLength(s,a.x,a.y,angle,distance+9,a.id)>=distance-5){
    const x=a.x+Math.cos(angle)*distance,y=a.y+Math.sin(angle)*distance;
    if(canStand(x,y,12)&&!blocking(s,x,y,12))
     s.mines.push({owner:a.id,x,y,r:size?49:36,life:extend?6:4.3,
      arm:.52,damage:10,element:'storm',v2Charge:true});
    fx(s,'thunder',x,y);
   }
   break;
  }
  case 'li_spark':shoot('bolt');break;
  case 'li_discharge':{
   // Three short real projectiles share the total damage budget; split
   // changes the number of arcs rather than multiplying free damage.
   const count=split?5:3,total=17;
   for(let j=0;j<count;j++){
    const offset=(j-(count-1)/2)*(count===5?.17:.24);
    spawnShot(s,a,angle+offset,a.x,a.y,{
     ...base,style:'bolt',damage:total/count,life:extend?.80:.46,
     fastshot:true,wide:size
    });
    if(s.shots.length)s.shots[s.shots.length-1].v2Impact=impact;
   }
   fx(s,'thunder',a.x,a.y);
   break;
  }
  case 'li_arc':shoot('arc',10);break;
  default:return false;
 }
 addHeat(s,a,(cheap?5:10)+mods.length*2,ev.depth+1);
 return true;
}
function flushMagicV2Events(s){
 let reactions=0,processed=0;
 const map={on_cast:'u_on_cast',on_hit:'u_on_hit',on_hurt:'u_on_hurt',
  on_dash:'u_after_dash',on_guard:'u_after_guard',on_expire:'u_on_expire',
  on_bounce:'u_on_barrier'};
 while(s.eventQueue.length&&processed++<MAX_QUEUE&&reactions<MAX_REACTIONS_PER_TICK){
  const ev=s.eventQueue.shift(),a=s.actors[ev.owner],rules=s.magicLoadouts?.[ev.owner];
  if(!a||!rules||ev.depth>=MAX_CHAIN_DEPTH)continue;
  const trigger=map[ev.kind];if(!trigger)continue;
  for(const spell of compileMagic(rules)){
   if(spell.trigger!==trigger)continue;
   const key='v2:'+spell.slotId;
   if(s.ticks<(a.runeTimers[key]||0))continue;
   const cooldown=spell.trigger==='u_on_cast'?1.08:spell.trigger==='u_on_hit'?.57:.72;
   a.runeTimers[key]=s.ticks+Math.ceil(cooldown/STEP);
   for(const action of spell.actions){
    if(reactions>=MAX_REACTIONS_PER_TICK)break;
    if(!MAGIC_V2_PRACTICE_RUNES.includes(action.id))continue;
    if(magicV2Action(s,a,action.id,action.mods,ev)){
     if(spell.trigger==='u_on_cast')addHeat(s,a,4,ev.depth+1);
     reactions++;
    }
   }
  }
 }
 if(s.eventQueue.length){for(const a of s.actors)addHeat(s,a,3);s.eventQueue.length=0}
 s.reactions=reactions;
}

const V2_START_POOL=Object.freeze([
 'u_on_cast','u_after_dash','u_on_hurt','u_guard','u_heal','u_push','u_size',
 'u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet',
 'st_throw','st_shards','st_wall','st_spikes','st_fault','fi_ember','fi_scorch','fi_flamepatch','fi_cindermine','fi_lash','li_spark','li_arc','li_pylon','li_link','li_coil','li_discharge',
 'u_reform_base','st_form_wave','st_form_spires','st_form_colossus','st_origin_self','st_impact_rubble','st_origin_below',
 'fi_form_stream','fi_form_whirl','fi_form_comet','fi_origin_self','fi_impact_wildfire','fi_origin_sky',
 'li_form_ray','li_form_sphere','li_origin_self','li_origin_pylon','li_motion_orbit','li_impact_chain'
]);
const V2_SEAT_MAGES=Object.freeze({stone:'pebble',fire:'kindle',storm:'wire'});
function v2Inventory(school,seed){
 let book=createMagicLoadout(school,{seed,starter:'attack'});
 for(const id of ['u_on_hurt','u_guard','u_size','u_reform_base',
  {stone:'st_throw',fire:'fi_ember',storm:'li_spark'}[school]]){
  const extra=grantEarnedMagicRune(book,id);
  if(!extra.ok)throw Error('Invalid owned rune: '+id);
  book=extra.state;
 }
 return book;
}
function v2SpellAllowed(book){
 if(!validateMagicState(book).ok)return false;
 const instances=[...book.reserve,...book.slots.flatMap(sp=>[
  ...(sp.when?[sp.when]:[]),...sp.actions.flatMap(a=>[a.rune,...a.mods])
 ]),...book.sealed.flatMap(sp=>[
  ...(sp.when?[sp.when]:[]),...sp.actions.flatMap(a=>[a.rune,...a.mods])
 ])];
 if(instances.some(inst=>!V2_START_POOL.includes(inst.defId)&&!['u_on_hit','u_on_hurt'].includes(inst.defId)))return false;
 for(const sp of [...book.slots,...book.sealed])for(const a of sp.actions){
  if(!MAGIC_V2_PRACTICE_RUNES.includes(a.rune.defId))return false;
  if(a.mods.some(m=>!magicV2PracticeModifierFits(a.rune.defId,m.defId)))return false;
 }
 return true;
}
function createV2Match(s){
 const schools=s.schools.map(school=>V2_SEAT_MAGES[school]);
 const m=makeMatch((clock()>>>0)^Math.floor(Math.random()*0xffffffff),schools[0],schools[1],'duel','shaper','shaper');
 m.magicModeV2=true;m.magicSchool=s.schools[0];
 m.magicLoadouts=s.schools.map((school,i)=>v2Inventory(school,(m.seed+(i+1)*911)>>>0));
 m.actors.forEach((a,i)=>{a.magicSchool=s.schools[i];a.runes=[];a.fusions=[];a.evolution=null});
 m.phase='build';return m;
}
function v2ValidAction(s,i,command){
 if(s.gameMode!=='magic-v2'||s.phase!=='magic-build'||i<0||!s.match?.magicModeV2)return false;
 const original=s.match.magicLoadouts[i];
 if(!original||!v2SpellAllowed(original))return false;
 if(!command||!['equip','unequip','seal'].includes(command.type))return false;
 const edited=applyMagicEdit(original,command);
 if(!edited.ok||!v2SpellAllowed(edited.state))return false;
 s.match.magicLoadouts[i]=edited.state;s.ready[i]=false;s.revision++;return true;
}


const V13_DRAFT_LIMIT=45000;
function v13Roll(seed,stage,seat,choice,step){
 let x=(seed^Math.imul(stage+1,0x9e3779b1)^Math.imul(seat+1,0x85ebca6b)^Math.imul(choice+1,0xc2b2ae35)^step)>>>0;
 x^=x>>>16;x=Math.imul(x,0x7feb352d)>>>0;x^=x>>>15;
 return (Math.imul(x,0x846ca68b)^(x>>>16))>>>0;
}
function v13Pool(book,rarity){
 const owned=new Set([...book.reserve,...book.slots.flatMap(sp=>[
  ...(sp.when?[sp.when]:[]),...sp.actions.flatMap(a=>[a.rune,...a.mods])
 ])].map(r=>r.defId));
 const hasForm=[...owned,...book.sealed.flatMap(sp=>sp.actions.flatMap(a=>a.mods.map(m=>m.defId)))]
  .some(id=>MAGIC_RUNE_INDEX.get(id)?.aspect==='shape');
 const eligible=V2_START_POOL.filter(id=>{
  const def=MAGIC_RUNE_INDEX.get(id);
  return def?.rarity===rarity&&permittedRune(book.school,id)&&
   (def.aspect!=='origin'||hasForm);
 });
 return [...eligible.filter(id=>!owned.has(id)),...eligible.filter(id=>owned.has(id))];
}
function v13Deal(s,i){
 const book=s.match.magicLoadouts[i],stage=s.magicStage;
 const milestone=stage===3||stage===5||stage>=7;
 const types=['common',stage<=2?'uncommon':'rare',
  milestone?'transformation':stage>=4?'epic':'rare'];
 return types.map((rarity,index)=>{
  const count=index===0?2:1,ids=[],used=new Set();
  let pool=v13Pool(book,rarity);
  if(!pool.length)pool=v13Pool(book,'common');
  for(let step=0;step<count;step++){
   const choices=pool.filter(id=>!used.has(id));if(!choices.length)break;
   const id=choices[v13Roll(s.match.seed,stage,i,index,step)%choices.length];
   ids.push(id);used.add(id);
  }
  return {index,kind:count===2?'bundle':'single',rarity,runes:ids};
 });
}
function v13BeginOffer(s){
 s.magicStage=s.match.score[0]+s.match.score[1]+s.match.draws;
 s.magicChoices=[v13Deal(s,0),v13Deal(s,1)];s.magicPicked=[false,false];
 s.magicOfferAt=clock();s.ready=[false,false];s.phase='magic-offer';
 s.inputs=[{...ZERO},{...ZERO}];s.credit=0;s.revision++;
}
function v13Choose(s,i,index,stage){
 if(s.gameMode!=='magic-v2'||s.phase!=='magic-offer'||s.magicPicked?.[i]||
  !Number.isInteger(index)||index<0||index>2||stage!==s.magicStage)return false;
 const pack=s.magicChoices?.[i]?.[index];
 if(!pack?.runes?.length)return false;
 let book=s.match.magicLoadouts[i];
 for(const id of pack.runes){
  const result=grantEarnedMagicRune(book,id);if(!result.ok)return false;
  book=result.state;
 }
 if(!v2SpellAllowed(book))return false;
 s.match.magicLoadouts[i]=book;s.magicPicked[i]=true;s.revision++;
 if(s.magicPicked.every(Boolean)){
  s.phase='magic-build';s.match.phase='build';s.magicChoices=[[],[]];
  s.ready=[false,false];s.magicOfferAt=0;s.revision++;
 }
 return true;
}
function v13OfferTimeout(s){
 if(s.phase!=='magic-offer'||clock()-s.magicOfferAt<V13_DRAFT_LIMIT)return false;
 for(let i=0;i<2;i++)if(!s.magicPicked[i]){
  const choice=s.magicChoices[i].findIndex(pack=>pack.runes.length);
  if(choice>=0)v13Choose(s,i,choice,s.magicStage);
 }
 return true;
}

const ZERO={x:0,y:0,aim:{x:200,y:310},attack:false,shield:false,dash:false,special:false};
const clock=()=>Date.now(),updates=()=>[{type:'state',payload:null}],warn=(to,msg)=>[{type:'notice',to,payload:msg}];
const side=(s,id)=>s.seats.indexOf(id);
const safeInput=v=>{
 if(!v||typeof v!=='object'||Array.isArray(v)||!v.aim)return null;
 const {x,y}=v,ax=v.aim.x,ay=v.aim.y;
 if(![x,y,ax,ay].every(n=>typeof n==='number'&&Number.isFinite(n))||Math.abs(x)>1.01||Math.abs(y)>1.01||ax<0||ax>W||ay<0||ay>H)return null;
 if(v.specialSlot!=null&&(!Number.isInteger(v.specialSlot)||v.specialSlot<0||v.specialSlot>2))return null;
 const m=Math.max(1,Math.hypot(x,y));return {x:x/m,y:y/m,aim:{x:ax,y:ay},attack:v.attack===true,shield:v.shield===true,dash:v.dash===true,special:v.special===true,specialSlot:v.specialSlot??0};
};
function beginNet(s){
 s.match=s.gameMode==='magic-v2'?createV2Match(s):makeMatch((clock()>>>0)^Math.floor(Math.random()*0xffffffff),s.mages[0],s.mages[1],s.gameMode,s.archetypes[0],s.archetypes[1]);
 if(s.gameMode==='magic-v2')s.phase='magic-build';else{startRound(s.match);s.phase='fight'}s.offers=[[],[]];s.picked=[false,false];s.ready=[false,false];s.magicChoices=[[],[]];s.magicPicked=[false,false];s.magicStage=0;s.magicOfferAt=0;
 s.inputs=[{...ZERO},{...ZERO}];s.seq=[-1,-1];s.seen=[clock(),clock()];s.at=clock();s.credit=0;s.lastEmit=0;s.revision++;
}
function advanceNet(s){
 if(s.phase!=='fight')return false;
 const now=clock(),delta=Math.max(0,Math.min(230,now-s.at));s.at=now;
 if(s.seen.some(t=>now-t>2000)){s.credit=0;return false}
 s.credit=Math.min(230,s.credit+delta);
 let steps=0;
 while(s.credit>=1000/60&&steps<12&&s.match.phase==='fight'){tick(s.match,s.inputs[0],STEP,s.inputs[1]);s.credit-=1000/60;steps++}
 if(s.match.phase==='draft'){
  if(s.gameMode==='magic-v2'){
   v13BeginOffer(s);return true;
  }
  s.phase='draft';s.draftAt=clock();s.offers=[0,1].map(i=>eligibleOffers(s.match,i));s.match.pick=[];s.picked=[false,false];s.ready=[false,false];s.revision++;return true;
 }
 if(s.match.phase==='result'){s.phase='result';s.revision++;return true}
 return steps>0;
}
function autoAdvanceDraft(s){
 if(s.phase!=='draft'||clock()-(s.draftAt||clock())<35000)return false;
 for(let i=0;i<2;i++)if(!s.picked[i]){const id=s.offers[i][0],a=s.match.actors[i];if(id){if(a.runes.length>=9)a.runes[0]=id;else a.runes.push(id)}}
 startRound(s.match);s.phase='fight';s.seq=[-1,-1];s.inputs=[{...ZERO},{...ZERO}];s.seen=[clock(),clock()];s.at=clock();s.credit=0;s.revision++;return true;
}
function chooseNet(s,i,id,replace){
 if(s.phase!=='draft'||s.picked[i]||!s.offers[i].includes(id))return false;
 const list=s.match.actors[i].runes,proposed=[...list];
 if(proposed.length===9){if(!Number.isInteger(replace)||replace<0||replace>=9)return false;proposed[replace]=id}
 else proposed.push(id);
 if(!legalRunes(proposed))return false;
 s.match.actors[i].runes=proposed;s.picked[i]=true;s.revision++;return true;
}
function evolveNet(s,i,kind,form){if(s.phase!=='draft'||s.match.gameMode!=='rupture'||s.picked[i])return false;if(!grantEvolution(s.match.actors[i],kind,form))return false;s.picked[i]=true;s.revision++;return true}
function reorderNet(s,i,list){
 if(s.phase!=='draft'||!s.picked[i]||s.ready[i]||!legalRunes(list))return false;
 const old=s.match.actors[i].runes;
 if(old.length!==list.length||[...old].sort().join('|')!==[...list].sort().join('|'))return false;
 s.match.actors[i].runes=[...list];s.revision++;return true;
}
function readyNet(s,i,list){
 if(!reorderNet(s,i,list))return false;
 s.ready[i]=true;s.revision++;
 if(s.ready.every(Boolean)){startRound(s.match);s.phase='fight';s.seq=[-1,-1];s.inputs=[{...ZERO},{...ZERO}];s.seen=[clock(),clock()];s.at=clock();s.credit=0}
 return true;
}
function viewForPlayer({state:s,player,players}){
 const i=side(s,player.id);
 // Each client sees only its own rune book. The authoritative match still
 // retains both: spell execution and collisions are exclusively server-owned.
 const match=s.match?.magicModeV2&&Array.isArray(s.match.magicLoadouts)
  ?{...s.match,magicLoadouts:s.match.magicLoadouts.map((book,seat)=>seat===i?book:null)}
  :s.match;
 return {phase:s.phase,revision:s.revision,host:s.host,me:i,seats:s.seats,rulesVersion:19,gameMode:s.gameMode,schools:s.schools,magicAllowed:i>=0?s.match?.magicModeV2?V2_START_POOL.filter(id=>permittedRune(s.schools[i],id)):[]:[],loadout:i>=0?s.match?.magicLoadouts?.[i]||null:null,mages:s.mages,archetypes:s.archetypes,nextSeq:i>=0?s.seq[i]+1:0,match,
  players:players.map(p=>({id:p.id,name:p.name,avatar:p.avatar,verified:p.verified===true,accountId:p.verified===true&&typeof p.accountId==='string'?p.accountId:null})),
  offers:i>=0?s.offers[i]:[],picked:i>=0&&s.picked[i],ready:i>=0&&s.ready[i],magicStage:s.magicStage||0,magicChoices:i>=0&&s.phase==='magic-offer'&&!s.magicPicked?.[i]?s.magicChoices[i]:[],magicPicked:i>=0&&!!s.magicPicked?.[i],magicOfferDeadline:s.phase==='magic-offer'?s.magicOfferAt+V13_DRAFT_LIMIT:0,
  connected:i>=0&&clock()-s.seen[i]<2000,opponentConnected:i>=0&&clock()-s.seen[1-i]<2000};
}
const module={
 protocolVersion:1,
 createRoom({player}){return {state:{host:player.id,seats:[player.id],phase:'lobby',match:null,revision:0,
  gameMode:'rupture',schools:['fire','storm'],mages:['kindle','wire'],archetypes:['striker','striker'],offers:[[],[]],picked:[false,false],ready:[false,false],magicChoices:[[],[]],magicPicked:[false,false],magicStage:0,magicOfferAt:0,seq:[-1,-1],inputs:[{...ZERO},{...ZERO}],
  seen:[clock(),clock()],at:clock(),credit:0,lastEmit:0}}},
 onJoin({state:s,player,players}){
  if(s.seats.filter(Boolean).length>=2||players.length>2)throw Error('room_full');
  if(!['lobby','result'].includes(s.phase))throw Error('match_in_progress');
  const slot=s.seats.indexOf('');if(slot>=0)s.seats[slot]=player.id;else s.seats.push(player.id);s.seen[slot>=0?slot:1]=clock();s.mages[slot>=0?slot:1]='wire';s.schools[slot>=0?slot:1]='storm';s.revision++;return {state:s,events:updates()};
 },
 onLeave({state:s,player}){
  const i=side(s,player.id);if(i<0)return {state:s,events:[]};
  if(s.match&&!['lobby','result'].includes(s.phase)){
   s.phase='result';s.match.phase='result';s.match.champion=1-i;s.match.score[1-i]=s.match.gameMode==='rupture'?Math.max(...s.match.score)+3:4;
  }
  s.seats[i]='';s.mages[i]='wire';s.schools[i]='storm';if(s.host===player.id)s.host=s.seats.find(Boolean)||'';
  s.revision++;return {state:s,events:updates()};
 },
 viewForPlayer,
 onMessage({state:s,player,payload}){
  const i=side(s,player.id);if(i<0)return {state:s,events:[]};
  const p=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  const out=(events=updates())=>({state:s,events});
  if(p.type==='sync'){s.seen[i]=clock();s.at=clock();if(autoAdvanceDraft(s)||v13OfferTimeout(s))return out();return out([{type:'state',to:player.id,payload:null}])}
  if(p.type==='start'||p.type==='rematch'){
   if(s.host!==player.id)return out(warn(player.id,'Матч запускает создатель комнаты.'));
   if(s.seats.length!==2||!s.seats.every(Boolean))return out(warn(player.id,'Нужны два игрока.'));
   if((p.type==='start'&&s.phase!=='lobby')||(p.type==='rematch'&&s.phase!=='result'))return out([]);
   if(['duel','rupture','magic-v2'].includes(p.gameMode))s.gameMode=p.gameMode;
   beginNet(s);return out();
  }
  if(p.type==='mode'){if(s.phase!=='lobby'||s.host!==player.id||!['duel','rupture','magic-v2'].includes(p.gameMode))return out(warn(player.id,'Режим выбирает создатель до начала матча.'));s.gameMode=p.gameMode;s.revision++;return out()}
   if(p.type==='magic-school'){
    if(s.phase!=='lobby'||!MAGIC_SCHOOLS.includes(p.school))return out(warn(player.id,'Стихию выбирают до начала боя.'));
    s.schools[i]=p.school;s.revision++;return out();
   }
   if(p.type==='archetype'){if(s.phase!=='lobby'||!validArchetype(p.archetype))return out(warn(player.id,'Боевой путь можно выбрать до начала матча.'));s.archetypes[i]=p.archetype;s.revision++;return out()}
   if(p.type==='mage'){if(s.phase!=='lobby'||!validMage(p.mageId))return out(warn(player.id,'Выбрать мага можно только до боя.'));s.mages[i]=p.mageId;s.revision++;return out()}
  if(p.type==='magic-pick')return v13Choose(s,i,p.index,p.stage)?out():out(warn(player.id,'Пакет рун недоступен или уже выбран.'));
  if(p.type==='magic-edit'){
    if(v2ValidAction(s,i,p.command))return out();
    return out(warn(player.id,'Комбинация недоступна или устарела.'));
   }
   if(p.type==='magic-ready'){
    if(s.gameMode!=='magic-v2'||s.phase!=='magic-build'||s.ready[i])return out([]);
    if(!v2SpellAllowed(s.match.magicLoadouts[i]))return out(warn(player.id,'Недопустимые руны.'));
    s.ready[i]=true;s.revision++;
    if(s.ready.every(Boolean)){
     startRound(s.match);s.phase='fight';s.seq=[-1,-1];s.inputs=[{...ZERO},{...ZERO}];s.seen=[clock(),clock()];s.at=clock();s.credit=0;
    }
    return out();
   }
  if(p.type==='input'){
   if(s.phase!=='fight'||p.round!==s.match.round||!Number.isSafeInteger(p.seq)||p.seq<=s.seq[i]||p.seq>s.seq[i]+100000)return out([]);
   const input=safeInput(p.control);if(!input)return out(warn(player.id,'Неверная команда.'));
   const moved=advanceNet(s);s.inputs[i]=input;s.seq[i]=p.seq;s.seen[i]=clock();
   if(moved||clock()-s.lastEmit>115){s.lastEmit=clock();s.revision++;return out()}
   return out([]);
  }
  if(s.phase==='draft'&&autoAdvanceDraft(s))return out();
   if(p.type==='evolve')return evolveNet(s,i,p.kind,p.form)?out():out(warn(player.id,'Эта эволюция недоступна.'));
   if(p.type==='pick')return chooseNet(s,i,p.rune,p.replace)?out():out(warn(player.id,'Такую руну взять нельзя.'));
  if(p.type==='order')return reorderNet(s,i,p.runes)?out():out(warn(player.id,'Порядок рун не подходит.'));
  if(p.type==='ready')return readyNet(s,i,p.runes)?out():out(warn(player.id,'Сначала выбери руну.'));
  return out([]);
 }
};
export default module;
