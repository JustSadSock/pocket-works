// ПЕРЕКОС — deterministic fixed-step combat and bounded rune events.
import {RUNES,legalRunes,compile,description,eligibleOffers,cooldown,heatCost,repetitions,MAX_CHAIN_DEPTH,MAX_REACTIONS_PER_TICK,MAX_QUEUE,HEAT_LIMIT,chosenElement} from './runes.mjs';
export {RUNES} from './runes.mjs';
import {mage,validMage} from './mages.mjs';
import {createMagicLoadout,compileMagic,validateMagicState} from './magic-v2-rules.mjs';
import {reactionFor,isElement} from './elements.mjs';
import {firstCollision,rayCollision} from './collision-geometry.mjs';
export const W=400,H=620,STEP=1/60,ROUND_SECONDS=25,RUPTURE_SECONDS=600,EVOLUTION_SECONDS=60,COLLAPSE_SECONDS=90;
export const WALLS=[{x:102,y:180,w:64,h:54},{x:232,y:385,w:66,h:56}];

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mag=(x,y)=>Math.hypot(x,y)||1;
export function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296}
export function has(a,k){return a.runes.includes(k)}
export const ARCHETYPES=Object.freeze([{id:'striker',name:'Стрелок',desc:'Чаще атакует. Увеличены урон и скорость снарядов.'},{id:'shaper',name:'Формирователь',desc:'Крепче щиты и больше длительность, радиус полей, мин и стен.'},{id:'distorter',name:'Искажатель',desc:'Попадания замедляют и перегревают врага.'}]);
export function validArchetype(id){return ARCHETYPES.some(a=>a.id===id)}

export function stats(a){if(a.magicSchool)return {max:100,speed:125*(a.haste>0?1.35:1)*(a.slow>0?.68:1),damage:12,reload:.56,shield:34};const m=mage(a.mageId),role=a.archetype||'striker';return {max:100,speed:125*m.speed*(a.haste>0?1.35:1)*(a.slow>0?.68:1),damage:12*m.power*(role==='striker'?1.025:1),reload:.56*m.reload*(role==='striker'?.98:1),shield:34*m.shield*(role==='shaper'?1.27:1)}}
function actor(id,x,y,runes,mageId='kindle',archetype='striker'){return {archetype:validArchetype(archetype)?archetype:'striker',evolution:null,fusions:[],id,x,y,mageId:validMage(mageId)?mageId:'kindle',vx:0,vy:0,hp:100,shield:0,face:id===0?0:Math.PI,cast:0,guard:0,dash:0,dashReady:0,shieldReady:0,stun:0,flash:0,runes:[...runes],kills:0,hit:0,aiT:0,aiMove:1,invuln:0,heat:0,overloadCd:0,runeTimers:{},haste:0,slow:0,mark:'',markLife:0,reactionCd:0,reactionsDone:0,burn:0,burnTick:0,burnSource:null,windup:null,flameCharge:0,respawn:0,specialCd:0}}
function freshActor(a){const o=actor(a.id,a.id===0?64:336,a.id===0?484:134,a.runes,a.mageId,a.archetype||'striker');o.hp=stats(o).max;o.evolution=a.evolution?{...a.evolution}:null;o.fusions=[...(a.fusions||[])];if(a.magicSchool)o.magicSchool=a.magicSchool;return o}
export function makeMatch(seed=0x718abc,first='kindle',second='pebble',gameMode='duel',firstArchetype='striker',secondArchetype='striker'){const kind=['rupture','duel','forge'].includes(gameMode)?gameMode:'duel';const s={version:4,gameMode:kind,seed:seed>>>0||1,phase:'fight',round:1,remaining:kind==='rupture'?RUPTURE_SECONDS:kind==='forge'?0:ROUND_SECONDS,forgeDummy:true,elapsed:0,nextEvolution:RUPTURE_SECONDS-EVOLUTION_SECONDS,coreHold:[0,0],overtime:0,score:[0,0],draws:0,lastOutcome:'',elementCombos:[0,0],actors:[actor(0,64,484,['on_hurt','armor'],first,firstArchetype),actor(1,336,134,['on_hurt','armor'],second,secondArchetype)],shots:[],streams:[],beams:[],waves:[],lobs:[],echoes:[],mines:[],barriers:[],fields:[],eventQueue:[],fx:[],pick:[],log:[],ticks:0,serial:0,champion:null};s.actors=s.actors.map(freshActor);return s}
// First real integration of magic v2: isolated OFFLINE practice uses the same
// authoritative court collision, renderer and fixed-step loop as legacy 0.28.
// No server v9 packets or legacy room state are ever converted in-place.
export const MAGIC_V2_PRACTICE_RUNES=Object.freeze([
 'u_on_cast','u_on_hit','u_on_hurt','u_after_dash','u_after_guard',
 'u_guard','u_push','u_heal','u_afterimage','u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet',
 'st_throw','st_shards','st_wall','fi_ember','fi_scorch','fi_flamepatch','li_spark','li_arc'
]);
// Only verified modifiers appear as equippable buttons for a given action in
// the current live laboratory. The full catalog is reserved for later phases.
const V2_PRACTICE_MODS=Object.freeze({
 u_guard:['u_size','u_efficient'],
 u_push:['u_size','u_efficient'],
 u_heal:['u_efficient'],
 u_afterimage:['u_efficient'],
 st_throw:['u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet'],
 st_shards:['u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet'],
 st_wall:['u_size','u_duration','u_efficient'],
 fi_ember:['u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet'],
 fi_scorch:['u_size','u_efficient'],
 fi_flamepatch:['u_size','u_duration','u_efficient'],
 li_spark:['u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet'],
 li_arc:['u_size','u_duration','u_speed','u_split','u_range','u_efficient','u_ricochet']
});
export function magicV2PracticeModifierFits(action,modifier){
 return !!V2_PRACTICE_MODS[action]?.includes(modifier);
}
export function makeMagicV2Practice(school,seed=0x29a){
 const canonical={stone:'pebble',fire:'kindle',storm:'wire'}[school];
 if(!canonical)throw new RangeError('Unknown magic school');
 const s=makeMatch(seed,canonical,'pebble','forge','shaper','shaper');
 s.magicModeV2=true;s.magicSchool=school;
 s.magicLoadouts=[createMagicLoadout(school,{seed,starter:'attack'}),null];
 s.actors[0].magicSchool=school;s.actors[1].magicSchool='stone';
 // The former nine-slot compiler must never run alongside the new one.
 s.actors[0].runes=[];s.actors[1].runes=[];
 s.forgeDummy=true;s.phase='build';return s;
}
export const EVOLUTIONS=Object.freeze([{id:'beam',name:'Разящий луч',desc:'Атака выпускает толстый пробивной луч. Уровень усиливает урон и ширину.'},{id:'swarm',name:'Искровой рой',desc:'Атака выпускает веер дополнительных зарядов. Уровень увеличивает их число.'},{id:'field',name:'Грозовое поле',desc:'Атака оставляет опасную зону. Уровень увеличивает её размер и длительность.'}]);
export const FUSIONS=Object.freeze([{id:'ember_nova',name:'Огненное сердце',mod:'as_fire',desc:'Огненный рунический снаряд взрывается и поджигает.'},{id:'storm_lattice',name:'Грозовая решётка',mod:'as_storm',desc:'Заряженный рунический снаряд выпускает дуги при попадании.'},{id:'stone_crush',name:'Каменный захват',mod:'as_stone',desc:'Каменные снаряды ломают щит и замедляют.'}]);
export function availableFusions(a){return FUSIONS.filter(f=>!(a.fusions||[]).includes(f.id)&&compile(a.runes).some(c=>c.actions.some(x=>['ball','blast','mine'].includes(x.id)&&x.mods.includes(f.mod))))}
export function grantEvolution(a,kind,id){
 if(kind==='mutate'){
  if(!EVOLUTIONS.some(f=>f.id===id))return false;
  const level=a.evolution?.form===id?a.evolution.level+1:1;if(level>3)return false;
  a.evolution={form:id,level};return true;
 }
 if(kind==='fuse'){if(!availableFusions(a).some(f=>f.id===id))return false;(a.fusions||(a.fusions=[])).push(id);return true}
 return false;
}

export function offers(s){return eligibleOffers(s)}
// Choosing a rune opens the working table. Players may reorder before returning to battle.
export function chooseRune(s,id,replaceIndex=null){
 if(s.phase!=='draft'||!s.pick.includes(id))return false;
 const a=s.actors[0];
 if(a.runes.length===9){if(!Number.isInteger(replaceIndex)||replaceIndex<0||replaceIndex>=9)return false;a.runes[replaceIndex]=id}
 else a.runes.push(id);
 const bot=s.actors[1], pool=s.gameMode==='rupture'&&s.round%3===0?[]:RUNES.filter(r=>!bot.runes.includes(r.id));if(s.gameMode==='rupture'&&s.round%3===0)grantEvolution(bot,'mutate',{fire:'field',storm:'swarm',stone:'beam'}[mage(bot.mageId).school]);
 if(pool.length){const avail=pool.filter(r=>r.type!=='when'||bot.runes.filter(id=>RUNES.find(z=>z.id===id)?.type==='when').length<3);const picked=avail[Math.floor(random(s)*avail.length)];if(picked){if(bot.runes.length===9)bot.runes[Math.floor(random(s)*9)]=picked.id;else bot.runes.push(picked.id)}}
 s.pick=[];s.phase='build';return true;
}
export function chooseEvolution(s,kind,id){
 if(s.phase!=='draft'||s.gameMode!=='rupture'||!grantEvolution(s.actors[0],kind,id))return false;
 const bot=s.actors[1];
 if(s.round%3===0)grantEvolution(bot,'mutate',{fire:'field',storm:'swarm',stone:'beam'}[mage(bot.mageId).school]);
 else{const offers=eligibleOffers(s,1),pick=offers[0];if(pick){if(bot.runes.length>=9)bot.runes[0]=pick;else bot.runes.push(pick)}}
 s.pick=[];s.phase='build';return true;
}
export function forgeEdit(s,action,id){
 if(s?.gameMode!=='forge'||s.phase!=='build')return false;
 const a=s.actors[0];
 if(action==='add'){
  const ids=[...a.runes,id];if(!legalRunes(ids))return false;a.runes=ids;return true;
 }
 if(action==='remove'){
  const at=a.runes.indexOf(id);if(at<0)return false;a.runes.splice(at,1);a.fusions=a.fusions.filter(f=>availableFusions({...a,fusions:[]}).some(x=>x.id===f));return true;
 }
 if(action==='mutate'||action==='fuse')return grantEvolution(a,action,id);
 if(action==='reset'){a.runes=['on_hurt','armor'];a.evolution=null;a.fusions=[];return true}
 return false;
}
export function reorderRunes(s,from,to){
 if(s.phase!=='build')return false;const slots=s.actors[0].runes;
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=slots.length||to>=slots.length)return false;
 const [id]=slots.splice(from,1);slots.splice(to,0,id);return true;
}
export function beginRound(s){if(s.phase!=='build')return false;startRound(s);return true}
export function startRound(s){
 if(s.gameMode==='rupture'||s.gameMode==='forge'){
  s.phase='fight';s.shots=[];s.streams=[];s.beams=[];s.waves=[];s.lobs=[];s.echoes=[];s.mines=[];s.barriers=[];s.fields=[];s.eventQueue=[];s.pick=[];s.fx=[];s.coreHold=[0,0];
  for(const a of s.actors){a.heat=0;a.overloadCd=0;a.runeTimers={};a.cast=0;a.windup=null;}
  return;
 }
 s.phase='fight';s.round=s.score[0]+s.score[1]+s.draws+1;s.remaining=ROUND_SECONDS;s.overtime=0;
 s.actors=s.actors.map(freshActor);s.shots=[];s.streams=[];s.beams=[];s.waves=[];s.lobs=[];s.echoes=[];s.mines=[];s.barriers=[];s.fields=[];s.eventQueue=[];s.pick=[];s.fx=[];s.ticks=0;s.reactions=0;
}
export function retryMatch(s){return makeMatch((s.seed+0x9e3779b9)>>>0)}
export function distWall(x,y,r=0){return WALLS.some(w=>x+r>w.x&&x-r<w.x+w.w&&y+r>w.y&&y-r<w.y+w.h)}
export function canStand(x,y,r=12){return x>=r+13&&x<=W-r-13&&y>=r+16&&y<=H-r-16&&!distWall(x,y,r)}
export function collapseActive(s){return s.gameMode==='forge'?false:s.gameMode==='rupture'?s.remaining<COLLAPSE_SECONDS:s.remaining<10}
export function ringRadius(s){return s.gameMode==='forge'?230:s.gameMode==='rupture'?(s.remaining>=COLLAPSE_SECONDS?230:Math.max(78,78+152*s.remaining/COLLAPSE_SECONDS)):(s.remaining>=10?230:Math.max(80,80+15*s.remaining))}
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
function markTarget(s,target,element,source,depth=0){
 if(s.magicModeV2||!isElement(element)||target.hp<=0)return null;
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
   if(dealt>0){markTarget(s,target,q.element,q.owner);target.slow=Math.max(target.slow,.65);emit(s,'on_hit',q.owner)}
  }
  fx(s,'impact_rock',q.tx,q.ty);fx(s,'fracture',q.tx,q.ty);
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
 const other=s.actors[1-w.owner];w.life-=STEP;w.reach=Math.min(w.range,w.reach+w.range*STEP/.23);
 if(w.hit||!insideCone(w,other,w.angle,w.reach,w.halfAngle))return;
 const d=Math.hypot(other.x-w.x,other.y-w.y);
 if(d>beamLength(s,w.x,w.y,Math.atan2(other.y-w.y,other.x-w.x),d+3,w.owner)+6)return;
 w.hit=true;
 const attacker=s.actors[w.owner],dealt=harm(s,other,mastery(attacker,'strong')?18:15,w.owner);
 const k=mag(other.x-w.x,other.y-w.y);
 move(other,(other.x-w.x)/k*18,(other.y-w.y)/k*18);
 if(dealt>0){markTarget(s,other,'stone',w.owner);other.slow=Math.max(other.slow,.45);emit(s,'on_hit',w.owner)}
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

export const CLASS_SPELLS=Object.freeze([
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
export function previewAttack(s,a,target,special=false,specialSlot=0){
 const dx=target.x-a.x,dy=target.y-a.y,angle=Math.atan2(dy,dx),ux=Math.cos(angle),uy=Math.sin(angle);
 if(special&&specialSlot>0){
  const angle=Math.atan2(target.y-a.y,target.x-a.x),ux=Math.cos(angle),uy=Math.sin(angle),role=a.archetype||'striker';
  const pt=(x,y)=>({x,y}),segment=(x,y,toX,toY,extras={})=>({x,y,toX,toY,...extras});
  if(role==='shaper'){
   const b=nearestBarrier(s,a,a.id,specialSlot===1?170:190);
   if(specialSlot===2){
    const x=b?.x??a.x+ux*45,y=b?.y??a.y+uy*45,r=b?.r??18;
    return {type:'contour',angle,length:0,radius:r,x,y,blocked:!b&&(!canStand(x,y,19)||blocking(s,x,y,20)||s.barriers.length>=10),segments:[segment(a.x,a.y,x,y)]};
   }
   if(!b)return {type:'resonance',angle,length:0,radius:0,x:a.x,y:a.y,blocked:true,segments:[]};
   const enemy=s.actors[1-a.id],theta=Math.atan2(enemy.y-b.y,enemy.x-b.x),segments=[];
   for(const sign of [-1,1]){
    const dir=theta+sign*Math.PI/2,u=Math.cos(dir),v=Math.sin(dir),x=b.x+u*(b.r+9),y=b.y+v*(b.r+9);
    const hit=rayCollision(s,x,y,dir,198,8,a.id,true);
    segments.push(segment(x,y,x+u*hit.length,y+v*hit.length));
   }
   return {type:'resonance',angle,length:0,radius:b.r,x:b.x,y:b.y,blocked:false,segments};
  }
  if(role==='distorter'&&specialSlot===2){
   const b=nearestBarrier(s,a,1-a.id,185);
   return {type:'inversion',angle,length:0,radius:b?.r||0,x:b?.x??a.x,y:b?.y??a.y,blocked:!b,segments:b?[segment(a.x,a.y,b.x,b.y)]:[]};
  }
  if(role==='distorter'&&specialSlot===1){
   const length=365*1.25,first=Math.min(length,365*.19),hit=rayCollision(s,a.x,a.y,angle,first,4,a.id,true);
   const x=a.x+ux*hit.length,y=a.y+uy*hit.length,segments=[segment(a.x,a.y,x,y)];
   if(hit.hit)return {type:'bend',angle,length:hit.length,radius:4,blocked:true,x,y,segments};
   const enemy=s.actors[1-a.id],delta=Math.sin(Math.atan2(enemy.y-a.y,enemy.x-a.x)-angle),turn=angle+(delta<0?-1:1)*.55;
   const u=Math.cos(turn),v=Math.sin(turn),second=rayCollision(s,x+u*.1,y+v*.1,turn,length-first,4,a.id,true);
   segments.push(segment(x,y,x+u*second.length,y+v*second.length,{bend:true}));
   return {type:'bend',angle,length:first+second.length,radius:4,blocked:!!second.hit,x:x+u*second.length,y:y+v*second.length,segments};
  }
  if(role==='striker'&&specialSlot===2){
   const dash=rayCollision(s,a.x,a.y,angle,63,12,a.id);
   const ex=a.x+ux*dash.length,ey=a.y+uy*dash.length,next=rayCollision(s,ex+ux*.2,ey+uy*.2,angle,264,5,a.id,true);
   return {type:'dash',angle,length:dash.length,radius:5,x:ex+ux*next.length,y:ey+uy*next.length,blocked:!!dash.hit||!!next.hit,segments:[segment(a.x,a.y,ex,ey,{dash:true}),segment(ex,ey,ex+ux*next.length,ey+uy*next.length)]};
  }
  if(role==='striker'&&specialSlot===1){
   const distance=365*1.3,first=rayCollision(s,a.x,a.y,angle,distance,4,a.id,true),one=segment(a.x,a.y,a.x+ux*first.length,a.y+uy*first.length),segments=[one];
   if(first.hit?.type==='barrier'){
    const b=s.barriers[first.hit.index];
    if((b.hp??24)<=32){
     const exit=first.hit.exit??first.hit.t,x=a.x+ux*distance*exit+ux*.2,y=a.y+uy*distance*exit+uy*.2;
     const second=rayCollision(s,x,y,angle,Math.max(0,distance*(1-exit)),4,a.id,true);
     segments.push(segment(one.toX,one.toY,x,y,{breach:true}),segment(x,y,x+ux*second.length,y+uy*second.length));
     return {type:'breach',angle,length:first.length+second.length,radius:4,x:x+ux*second.length,y:y+uy*second.length,blocked:!!second.hit,segments};
    }
   }
   return {type:'breach',angle,length:first.length,radius:4,x:one.toX,y:one.toY,blocked:!!first.hit,segments};
  }
 }
 const type=special?(a.archetype==='shaper'?'placement':a.archetype==='distorter'?(specialSlot===0?'phase':'shot'):(specialSlot===0?'ricochet':'shot')):a.mageId==='pebble'?'lob':a.mageId==='cinder'?'cone':a.mageId==='slate'?'sector':a.mageId==='coil'?'beam':'shot',far=mastery(a,'far'),wide=mastery(a,'wide');
 let length=0,width=0,radius=5;
 if(type==='lob'){length=Math.min(Math.hypot(dx,dy),far?295:252);radius=wide?42:33;return {type,angle,length,radius,blocked:false,x:a.x+ux*length,y:a.y+uy*length,segments:[{x:a.x,y:a.y,toX:a.x+ux*length,toY:a.y+uy*length}]}}
 if(type==='placement'){length=51;radius=22;const x=a.x+ux*length,y=a.y+uy*length;return {type,angle,length,radius,blocked:!canStand(x,y,23)||blocking(s,x,y,24),x,y,segments:[]}}
 if(type==='cone'){length=(far?239:210)*(.24+.76*(a.flameCharge||0));width=(wide?43:32)*(.42+.58*(a.flameCharge||0))}
 if(type==='beam')length=far?290:242;
 if(type==='sector'){length=far?133:112;width=wide?.75:.53}
 if(['shot','ricochet','phase'].includes(type)){
  const style=type==='shot'?mage(a.mageId).style:'arc';
  const v0=type==='shot'?(a.mageId==='kindle'?174:a.mageId==='wire'?480:style==='bolt'||style==='arc'?365:style==='rock'?198:252):365;
  const life=type==='shot'?(far?1.8:1.15)*(style==='arc'?.84:style==='rock'?1.2:style==='wave'?.65:1):type==='phase'?1.2:1.3;
  let speed=v0*(a.archetype==='striker'?1.035:1);
  for(let t=0;t<Math.ceil(life/STEP);t++){if(type==='shot'&&a.mageId==='kindle')speed=Math.min(310,speed+490*STEP);if(type==='shot'&&a.mageId==='wire')speed=Math.max(300,speed-380*STEP);length+=speed*STEP}
 }
 const hit=rayCollision(s,a.x,a.y,angle,length,radius,a.id,['shot','ricochet','phase'].includes(type));
 const one={x:a.x,y:a.y,toX:a.x+ux*hit.length,toY:a.y+uy*hit.length},segments=[one];
 if(type==='phase'&&hit.hit&&(hit.hit.type==='wall'||hit.hit.type==='barrier')){
  const exit=Math.max(hit.hit.t,Math.min(1,hit.hit.exit??hit.hit.t));
  const ex=a.x+ux*length*exit,ey=a.y+uy*length*exit,remaining=Math.max(0,length*(1-exit));
  const onward=rayCollision(s,ex+ux*.2,ey+uy*.2,angle,remaining,5,a.id,true);
  return {type,angle,length:hit.length,maxRange:length,radius:5,width,blocked:!!onward.hit,x:ex+ux*onward.length,y:ey+uy*onward.length,
   segments:[one,{x:one.toX,y:one.toY,toX:ex,toY:ey,phase:true},{x:ex,y:ey,toX:ex+ux*onward.length,toY:ey+uy*onward.length}]}
 }

 if(type==='ricochet'&&hit.hit){
  const dot=ux*hit.hit.nx+uy*hit.hit.ny,rx=ux-2*dot*hit.hit.nx,ry=uy-2*dot*hit.hit.ny;
  const two=rayCollision(s,one.toX+rx*.15,one.toY+ry*.15,Math.atan2(ry,rx),Math.max(0,length-hit.length),5,a.id,true);
  segments.push({x:one.toX,y:one.toY,toX:one.toX+rx*two.length,toY:one.toY+ry*two.length})
 }
 return {type,angle,length:hit.length,maxRange:length,width,radius,blocked:!!hit.hit,x:one.toX,y:one.toY,segments};
}

// Physical magic v2 runtime — only the cards in MAGIC_V2_PRACTICE_RUNES
// are offered by the experimental forge. The other catalog definitions
// remain unavailable until their geometry and server counterparts exist.
function magicV2Attack(s,a,target){
 if(a.cast>0||a.stun>0||a.windup)return false;
 a.face=Math.atan2(target.y-a.y,target.x-a.x);
 const school=a.magicSchool,style=school==='stone'?'rock':school==='storm'?'bolt':'orb';
 a.cast=stats(a).reload;
 const ok=spawnShot(s,a,a.face,a.x,a.y,{style,element:school,damage:12,life:1.3,signature:false});
 if(ok){addHeat(s,a,7);emit(s,'on_cast',a.id)}
 return ok;
}
function magicV2Action(s,a,act,mods,ev){
 const other=s.actors[1-a.id],school=a.magicSchool;
 const defs=new Set(mods),size=defs.has('u_size'),extend=defs.has('u_duration')||defs.has('u_range'),
 fast=defs.has('u_speed'),ricochet=defs.has('u_ricochet'),
 split=defs.has('u_split'),cheap=defs.has('u_efficient');
 const angle=a.face,base={element:school,signature:false,wide:size,fastshot:fast,far:extend,
  bounce:ricochet,life:extend?2:1.15,damage:12,depth:ev.depth+1};
 const shoot=(style,damage=12)=>{
  const count=split?2:1;
  for(let j=0;j<count;j++)spawnShot(s,a,angle+(count===2?(j===0?-.13:.13):0),a.x,a.y,{
   ...base,style,damage:damage/count
  });
 };
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
   for(let j=0;j<count;j++)spawnShot(s,a,angle+(j-(count-1)/2)*.16,a.x,a.y,
    {...base,style:'rock',damage:6,life:extend?1.3:.8});
   break;
  }
  case 'st_wall':{
   const x=a.x+Math.cos(angle)*46,y=a.y+Math.sin(angle)*46,r=size?24:17;
   if(s.barriers.length<10&&canStand(x,y,r)&&!blocking(s,x,y,r))
    s.barriers.push({owner:a.id,x,y,r,life:extend?6:3.5,hp:30});
   fx(s,'shield',x,y);break;
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
  case 'li_spark':shoot('bolt');break;
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
   a.runeTimers[key]=s.ticks+Math.ceil(.65/STEP);
   for(const action of spell.actions){
    if(reactions>=MAX_REACTIONS_PER_TICK)break;
    if(!MAGIC_V2_PRACTICE_RUNES.includes(action.id))continue;
    magicV2Action(s,a,action.id,action.mods,ev);
    reactions++;
   }
  }
 }
 if(s.eventQueue.length){for(const a of s.actors)addHeat(s,a,3);s.eventQueue.length=0}
 s.reactions=reactions;
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
export function tick(s,input={},dt=STEP,otherInput=null){
 if(s.phase!=='fight')return s;if(['rupture','forge'].includes(s.gameMode)){s.fields ||= [];for(const a of s.actors)a.fusions ||= []}dt=STEP;safeWorld=s;s.ticks++;if(s.gameMode!=='forge')s.remaining=Math.max(0,s.remaining-dt);
 s.streams=[];s.beams=s.beams||[];s.waves=s.waves||[];s.lobs=s.lobs||[];
 for(const a of s.actors){
  a.heat=Math.max(0,a.heat-7*dt);a.overloadCd=Math.max(0,a.overloadCd-dt);
  a.burn=Math.max(0,(a.burn||0)-dt);
  if(a.burn>0){a.burnTick=(a.burnTick||0)+dt;
   if(a.burnTick>=.33){a.burnTick=0;harm(s,a,1.25,a.burnSource);fx(s,'ember',a.x,a.y)}}
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
   const dealt=harm(s,a,q.damage,q.owner,q.depth);
   if(dealt){markTarget(s,a,q.element||mage(s.actors[q.owner].mageId).school,q.owner,q.depth);const attacker=s.actors[q.owner],trait=mage(attacker.mageId).trait;if(trait==='burn'){a.burn=Math.max(a.burn||0,has(attacker,'lasting')?2.4:1.55);a.burnSource=q.owner}if(trait==='hit_push')move(a,Math.cos(Math.atan2(q.vy,q.vx))*8,Math.sin(Math.atan2(q.vy,q.vx))*8);emit(s,'on_hit',q.owner,{},q.depth);if(q.drain)receiveHeal(s,attacker,3,q.depth)}
   if(dealt>0)fusionImpact(s,q,a);
   if(q.style==='rock')rockFracture(s,q,q.x,q.y);
   fx(s,'impact_'+(q.style||'orb'),q.x,q.y);s.shots.splice(j,1);done=true;continue;
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
  if(q.style==='rock')rockFracture(s,q,q.x,q.y);s.shots.splice(j,1);fx(s,'spark',hit.x,hit.y);emit(s,'on_expire',q.owner,{},q.depth);done=true;
 }
}
for(let j=s.echoes.length-1;j>=0;j--){const e=s.echoes[j];e.life-=dt;e.cast-=dt;const source=s.actors[e.owner];if(e.cast<=0){e.cast=.76;const target=s.actors[1-e.owner];spawnShot(s,source,Math.atan2(target.y-e.y,target.x-e.x),e.x,e.y,{clone:true,strong:!!e.extra});e.shots=(e.shots??2)-1}if(e.life<=0||e.shots<=0)s.echoes.splice(j,1)}
for(let j=s.mines.length-1;j>=0;j--){
 const mine=s.mines[j];mine.life-=dt;const target=s.actors[1-mine.owner];
 if(Math.hypot(target.x-mine.x,target.y-mine.y)<mine.r&&beamLength(s,mine.x,mine.y,Math.atan2(target.y-mine.y,target.x-mine.x),Math.hypot(target.x-mine.x,target.y-mine.y)+4,mine.owner)>=Math.hypot(target.x-mine.x,target.y-mine.y)-8){const d=harm(s,target,mine.damage,mine.owner);if(d>0){markTarget(s,target,mine.element||mage(s.actors[mine.owner].mageId).school,mine.owner);emit(s,'on_hit',mine.owner)}fx(s,'overload',mine.x,mine.y);s.mines.splice(j,1)}
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
export function validState(s){
 return !!s&&s.version===4&&['fight','draft','build','result'].includes(s.phase)
 &&Array.isArray(s.actors)&&s.actors.length===2&&s.actors.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.hp)&&validMage(a.mageId)&&typeof a.mark==='string'&&Number.isFinite(a.markLife)&&a.markLife>=0&&Number.isFinite(a.reactionCd)&&Number.isFinite(a.heat)&&a.heat>=0&&a.heat<=100&&legalRunes(a.runes)&&(!a.archetype||validArchetype(a.archetype))&&(!a.evolution||EVOLUTIONS.some(f=>f.id===a.evolution.form)&&Number.isInteger(a.evolution.level)&&a.evolution.level>0&&a.evolution.level<=3)&&(!a.fusions||Array.isArray(a.fusions)&&a.fusions.length<=3&&new Set(a.fusions).size===a.fusions.length&&a.fusions.every(id=>FUSIONS.some(f=>f.id===id)))&&a.runeTimers&&typeof a.runeTimers==='object')
 &&Array.isArray(s.shots)&&(!s.streams||Array.isArray(s.streams))&&(!s.beams||Array.isArray(s.beams))&&(!s.waves||Array.isArray(s.waves))&&(!s.lobs||Array.isArray(s.lobs))&&Array.isArray(s.echoes)&&Array.isArray(s.mines)&&Array.isArray(s.barriers)&&(!s.fields||Array.isArray(s.fields))&&Array.isArray(s.eventQueue)
 &&(!s.magicModeV2||(s.gameMode==='forge'&&s.magicLoadouts?.length===2&&validateMagicState(s.magicLoadouts[0]).ok&&s.magicSchool===s.magicLoadouts[0].school))&&Array.isArray(s.elementCombos)&&s.elementCombos.length===2&&s.elementCombos.every(n=>Number.isInteger(n)&&n>=0)&&Array.isArray(s.score)&&s.score.every(n=>Number.isInteger(n)&&n>=0&&(s.gameMode==='rupture'?n<=10000:n<=4))&&['duel','rupture','forge',undefined].includes(s.gameMode);
}
