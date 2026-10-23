// ПЕРЕКОС — deterministic fixed-step combat and bounded rune events.
import {RUNES,legalRunes,compile,description,eligibleOffers,cooldown,heatCost,repetitions,MAX_CHAIN_DEPTH,MAX_REACTIONS_PER_TICK,MAX_QUEUE,HEAT_LIMIT,chosenElement} from './runes.mjs';
export {RUNES} from './runes.mjs';
import {mage,validMage} from './mages.mjs';
import {reactionFor,isElement} from './elements.mjs';
export const W=400,H=620,STEP=1/60,ROUND_SECONDS=25,RUPTURE_SECONDS=600,EVOLUTION_SECONDS=60,COLLAPSE_SECONDS=90;
export const WALLS=[{x:102,y:180,w:64,h:54},{x:232,y:385,w:66,h:56}];

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mag=(x,y)=>Math.hypot(x,y)||1;
export function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296}
export function has(a,k){return a.runes.includes(k)}
export function stats(a){const m=mage(a.mageId);return {max:100,speed:125*m.speed*(a.haste>0?1.35:1)*(a.slow>0?.68:1),damage:12*m.power,reload:.56*m.reload,shield:34*m.shield}}
function actor(id,x,y,runes,mageId='kindle'){return {evolution:null,fusions:[],id,x,y,mageId:validMage(mageId)?mageId:'kindle',vx:0,vy:0,hp:100,shield:0,face:id===0?0:Math.PI,cast:0,guard:0,dash:0,dashReady:0,shieldReady:0,stun:0,flash:0,runes:[...runes],kills:0,hit:0,aiT:0,aiMove:1,invuln:0,heat:0,overloadCd:0,runeTimers:{},haste:0,slow:0,mark:'',markLife:0,reactionCd:0,reactionsDone:0,burn:0,burnTick:0,burnSource:null,windup:null,flameCharge:0,respawn:0}}
function freshActor(a){const o=actor(a.id,a.id===0?64:336,a.id===0?484:134,a.runes,a.mageId);o.hp=stats(o).max;o.evolution=a.evolution?{...a.evolution}:null;o.fusions=[...(a.fusions||[])];return o}
export function makeMatch(seed=0x718abc,first='kindle',second='pebble',gameMode='duel'){const kind=gameMode==='rupture'?'rupture':'duel';const s={version:4,gameMode:kind,seed:seed>>>0||1,phase:'fight',round:1,remaining:kind==='rupture'?RUPTURE_SECONDS:ROUND_SECONDS,elapsed:0,nextEvolution:RUPTURE_SECONDS-EVOLUTION_SECONDS,coreHold:[0,0],overtime:0,score:[0,0],draws:0,lastOutcome:'',elementCombos:[0,0],actors:[actor(0,64,484,['on_hurt','armor'],first),actor(1,336,134,['on_hurt','armor'],second)],shots:[],streams:[],beams:[],waves:[],lobs:[],echoes:[],mines:[],barriers:[],fields:[],eventQueue:[],fx:[],pick:[],log:[],ticks:0,serial:0,champion:null};s.actors=s.actors.map(freshActor);return s}
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
function reorderRunes(s,from,to){
 if(s.phase!=='build')return false;const slots=s.actors[0].runes;
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=slots.length||to>=slots.length)return false;
 const [id]=slots.splice(from,1);slots.splice(to,0,id);return true;
}
export function beginRound(s){if(s.phase!=='build')return false;startRound(s);return true}
export function startRound(s){
 if(s.gameMode==='rupture'){
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
export function collapseActive(s){return s.gameMode==='rupture'?s.remaining<COLLAPSE_SECONDS:s.remaining<10}
export function ringRadius(s){return s.gameMode==='rupture'?(s.remaining>=COLLAPSE_SECONDS?230:Math.max(78,78+152*s.remaining/COLLAPSE_SECONDS)):(s.remaining>=10?230:Math.max(80,80+15*s.remaining))}
let safeWorld=null;const blocking=(s,x,y,r=12)=>!!s?.barriers?.some(b=>Math.hypot(x-b.x,y-b.y)<r+b.r);function move(a,x,y,r=12){const nx=clamp(a.x+x,r+13,W-r-13),ny=clamp(a.y+y,r+16,H-r-16);if(canStand(nx,a.y,r)&&!blocking(safeWorld,nx,a.y,r))a.x=nx;if(canStand(a.x,ny,r)&&!blocking(safeWorld,a.x,ny,r))a.y=ny}
function fx(s,k,x,y,t=0){if(s.fx.length>60)s.fx.shift();s.fx.push({k,x,y,t,id:++s.serial})}
function harm(s,a,amount,from,depth=0){
 if(a.invuln>0||a.hp<=0||!Number.isFinite(amount))return 0;
 const blocked=Math.min(a.shield,Math.max(0,amount)),before=a.shield;a.shield-=blocked;
 const d=Math.max(0,Math.min(80,amount-blocked));a.hp=Math.max(0,a.hp-d);a.flash=.15;
 if(d>0){if(from!=null&&from!==a.id)s.actors[from].hit+=d;emit(s,'on_hurt',a.id,{from},depth)}
 if(blocked>0&&before>0&&a.shield===0)emit(s,'on_break',a.id,{from},depth);
 fx(s,'hit',a.x,a.y);return d;
}
function markTarget(s,target,element,source,depth=0){
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
 const base=mage(a.mageId),style=options.clone?'echo':options.style||base.style,element=options.element||base.school;const v=(options.signature&&a.mageId==='kindle'?174:options.signature&&a.mageId==='wire'?480:style==='bolt'||style==='arc'?365:style==='rock'?198:style==='wave'?205:style==='flame'?260:252)*(options.fastshot?1.35:1),speed=Number.isFinite(v)?v:252;
 s.shots.push({x,y,vx:Math.cos(dir)*speed,vy:Math.sin(dir)*speed,owner:a.id,
  style,element,accel:options.signature?(a.mageId==='kindle'?490:a.mageId==='wire'?-380:0):0,
  minSpeed:options.signature&&a.mageId==='kindle'?310:options.signature&&a.mageId==='wire'?300:0,
  damage:Number.isFinite(options.damage)?options.damage:options.clone?6:stats(a).damage*(options.strong?1.6:1),life:options.life??(options.far?1.8:1.15)*(style==='arc'?.84:style==='rock'?1.2:style==='wave'?.65:1),
  bounces:options.bounce?1:0,drain:!!options.drain,r:options.wide?10:style==='wave'?12:style==='rock'?8:style==='bolt'?3:options.clone?4:5,depth:options.depth||0,fusion:options.fusion!==false,evo:!!options.evo});
 fx(s,'shoot',x,y);return true;
}

/* Each mage has a distinct physical attack. All hit-tests use the fixed-step
   court geometry; these forms are state, not client-only cosmetic guesses. */
function mastery(a,id){return compile(a.runes).some(chain=>chain.actions.some(action=>action.mods.includes(id)))}
function beamLength(s,x,y,angle,range){
 const dx=Math.cos(angle),dy=Math.sin(angle);
 for(let d=8;d<=range;d+=6)if(distWall(x+dx*d,y+dy*d,3)||blocking(s,x+dx*d,y+dy*d,3)
  ||x+dx*d<22||x+dx*d>W-22||y+dy*d<24||y+dy*d>H-24)return Math.max(0,d-6);
 return range;
}
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
  if(range<q.radius+12){
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
 const length=beamLength(s,a.x,a.y,angle,reach),width=(mastery(a,'wide')?43:32)*(.42+.58*a.flameCharge);
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
 const reach=mastery(a,'far')?290:242,len=beamLength(s,a.x,a.y,a.face,reach);
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
 if(d>beamLength(s,w.x,w.y,Math.atan2(other.y-w.y,other.x-w.x),d+3)+6)return;
 w.hit=true;
 const attacker=s.actors[w.owner],dealt=harm(s,other,mastery(attacker,'strong')?18:15,w.owner);
 const k=mag(other.x-w.x,other.y-w.y);
 move(other,(other.x-w.x)/k*18,(other.y-w.y)/k*18);
 if(dealt>0){markTarget(s,other,'stone',w.owner);other.slow=Math.max(other.slow,.45);emit(s,'on_hit',w.owner)}
 fx(s,'impact_wave',other.x,other.y);
}
function rockFracture(s,q,x,y){
 if(q.style!=='rock')return;
 const target=s.actors[1-q.owner],d=Math.hypot(x-target.x,y-target.y);
 if(d< (mastery(s.actors[q.owner],'wide')?49:37)){
  const dealt=harm(s,target,mastery(s.actors[q.owner],'strong')?4:2.5,q.owner,q.depth);
  if(dealt>0){markTarget(s,target,'stone',q.owner,q.depth);target.slow=Math.max(target.slow,.55);emit(s,'on_hit',q.owner,{},q.depth)}
 }
 fx(s,'fracture',x,y);
}


function castEvolution(s,a){
 if(s.gameMode!=='rupture'||!a.evolution||a.hp<=0)return;
 const {form,level}=a.evolution,element=mage(a.mageId).school,enemy=s.actors[1-a.id],angle=a.face;
 if(form==='beam'){
  const length=beamLength(s,a.x,a.y,angle,175+level*45),width=5+level*5;
  s.beams.push({owner:a.id,x:a.x,y:a.y,angle,length,width,life:.25,style:'evo-beam',element,level});
  const dx=enemy.x-a.x,dy=enemy.y-a.y,front=dx*Math.cos(angle)+dy*Math.sin(angle),side=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));
  if(front>0&&front<length+12&&side<width+12){const hit=harm(s,enemy,3+level*2.4,a.id);if(hit>0){markTarget(s,enemy,element,a.id);enemy.slow=Math.max(enemy.slow,.15+level*.1);fx(s,'impact_arc',enemy.x,enemy.y)}}
 }else if(form==='swarm'){
  const count=2+level*2;
  for(let i=0;i<count;i++)spawnShot(s,a,angle+(i-(count-1)/2)*(.17+level*.015),a.x,a.y,{style:'arc',element,damage:2+level*.55,life:.7+level*.1,depth:2,fusion:false,evo:true});
 }else if(form==='field'&&s.fields.length<8){
  const x=clamp(a.x+Math.cos(angle)*70,30,W-30),y=clamp(a.y+Math.sin(angle)*70,30,H-30);
  s.fields.push({owner:a.id,x,y,r:27+level*16,life:2+level*.8,timer:0,element,level});fx(s,'overload',x,y);
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
   if(target.hp>0&&distance<f.r+12&&beamLength(s,f.x,f.y,Math.atan2(target.y-f.y,target.x-f.x),distance+3)>=distance-9){
    const hit=harm(s,target,1.6+f.level*1.1,f.owner);
    if(hit>0){markTarget(s,target,f.element,f.owner);target.slow=Math.max(target.slow,.2+f.level*.08);fx(s,'impact_arc',target.x,target.y)}
   }
  }
  if(f.life<=0)s.fields.splice(j,1);
 }
}

function attack(s,a,target){
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
 a.shield=Math.min(80,a.shield+stats(a).shield+(mage(a.mageId).trait==='guard_extra'?5:0));a.shieldReady=5;if(mage(a.mageId).trait==='guard_slow'){const enemy=s.actors[1-a.id];if(Math.hypot(a.x-enemy.x,a.y-enemy.y)<105)enemy.slow=Math.max(enemy.slow,1.1)}addHeat(s,a,7);
 fx(s,'shield',a.x,a.y);emit(s,'on_guard',a.id);return true;
}
function dash(s,a,dir){
 if(a.dashReady>0||a.stun>0)return false;const m=mag(dir.x,dir.y);
 a.windup=null;a.vx=dir.x/m*370;a.vy=dir.y/m*370;if(mage(a.mageId).trait==='dash_haste')a.haste=Math.max(a.haste,.9);a.dash=.17;a.dashReady=2.5;a.invuln=.13;addHeat(s,a,6);
 fx(s,'dash',a.x,a.y);emit(s,'on_dash',a.id);return true;
}
// The queue is cleared each update and every event owns a bounded ancestry depth.
function emit(s,kind,owner,payload={},depth=0){
 if(depth>MAX_CHAIN_DEPTH||s.eventQueue.length>=MAX_QUEUE)return false;
 s.eventQueue.push({kind,owner,payload,depth});if(kind==='on_cast'&&depth===0&&s.gameMode==='rupture')castEvolution(s,s.actors[owner]);return true;
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
 case 'blast':if(Math.hypot(other.x-a.x,other.y-a.y)<(m.has('wide')?110:72)*reach){const d=harm(s,other,11*strong,a.id,depth);if(d>0){markTarget(s,other,chosenElement(mods,mage(a.mageId).school),a.id,depth);emit(s,'on_hit',a.id,{},depth)}}fx(s,'overload',a.x,a.y);break;
 case 'blink':{const step=38*reach*(m.has('reverse')?-1:1);move(a,Math.cos(a.face)*step,Math.sin(a.face)*step);fx(s,'dash',a.x,a.y);break}
 case 'clone':if(s.echoes.length<12)s.echoes.push({owner:a.id,x:a.x,y:a.y,life:m.has('lasting')?3.5:2.2,cast:.25,shots:2,extra:m.has('strong')});fx(s,'dash',a.x,a.y);break;
 case 'mine':if(s.mines.length<14)s.mines.push({x:a.x,y:a.y,owner:a.id,life:m.has('lasting')?6:3.5,damage:14*strong,element:chosenElement(mods,mage(a.mageId).school),r:m.has('wide')?57:40});fx(s,'mine',a.x,a.y);break;
 case 'wall':if(s.barriers.length<10){let bx=a.x+Math.cos(a.face)*34*reach,by=a.y+Math.sin(a.face)*34*reach;if(canStand(bx,by,14)&&!blocking(s,bx,by,15))s.barriers.push({owner:a.id,x:bx,y:by,r:m.has('wide')?23:15,life:m.has('lasting')?4:2.5})}fx(s,'shield',a.x,a.y);break;
 case 'push':{const dx=other.x-a.x,dy=other.y-a.y;if(mag(dx,dy)<100*reach){const k=mag(dx,dy);move(other,dx/k*30*strong*(m.has('fastshot')?1.3:1),dy/k*30*strong*(m.has('fastshot')?1.3:1))}fx(s,'dash',other.x,other.y);break}
 case 'slow':other.slow=Math.max(other.slow,m.has('lasting')?3.4:2);fx(s,'hit',other.x,other.y);break;
 case 'haste':a.haste=Math.max(a.haste,m.has('lasting')?3.4:2);fx(s,'heal',a.x,a.y);break;
 case 'cool':a.heat=Math.max(0,a.heat-22*strong);fx(s,'heal',a.x,a.y);break;
 }
}
function flushEvents(s){
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
return {x,y,attack:false,shield:false,dash:false,aim:{x:p.x,y:p.y}}}
export function tick(s,input={},dt=STEP,otherInput=null){
 if(s.phase!=='fight')return s;if(s.gameMode==='rupture'){s.fields ||= [];for(const a of s.actors)a.fusions ||= []}dt=STEP;safeWorld=s;s.ticks++;s.remaining=Math.max(0,s.remaining-dt);
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
const control=[input,otherInput===null?botInput(s,dt):otherInput];
for(let i=0;i<2;i++){const a=s.actors[i],c=control[i],other=s.actors[1-i];
 if(s.gameMode==='rupture'&&a.hp<=0){if(a.respawn>0){a.respawn=Math.max(0,a.respawn-dt);if(a.respawn<=0){const next=freshActor(a);next.hit=a.hit;next.kills=a.kills;next.invuln=1.25;s.actors[i]=next;}}continue}
 a.cast=Math.max(0,a.cast-dt);a.shieldReady=Math.max(0,a.shieldReady-dt);a.dashReady=Math.max(0,a.dashReady-dt);a.stun=Math.max(0,a.stun-dt);a.flash=Math.max(0,a.flash-dt);a.invuln=Math.max(0,a.invuln-dt);
if(!c.attack)a.flameCharge=Math.max(0,(a.flameCharge||0)-dt*5);
if(a.windup&&(a.stun>0||c.dash))a.windup=null;
if(a.windup){a.windup.remaining-=dt;
 if(a.windup.remaining<=0){const w=a.windup;a.windup=null;releaseWindup(s,a,w)}
}
if(a.dash>0){move(a,a.vx*dt,a.vy*dt);a.dash=Math.max(0,a.dash-dt)}
else{let x=Number(c.x)||0,y=Number(c.y)||0,m=mag(x,y);if(m>1){x/=m;y/=m}move(a,x*stats(a).speed*dt,y*stats(a).speed*dt)}
if(a.windup)a.face=a.windup.angle;
else if(c.aim&&Number.isFinite(c.aim.x)&&Number.isFinite(c.aim.y))a.face=Math.atan2(c.aim.y-a.y,c.aim.x-a.x);
if(c.dash)dash(s,a,{x:Number(c.x)||Math.cos(a.face),y:Number(c.y)||Math.sin(a.face)});
if(c.shield)guard(s,a);
if(c.attack)attack(s,a,c.aim||other);
if(s.ticks%60===0&&a.heat>=HEAT_LIMIT)addHeat(s,a,0)}
updateLobs(s,dt);if(s.gameMode==='rupture')updateEvolutionFields(s,dt);
for(let j=s.beams.length-1;j>=0;j--){s.beams[j].life-=dt;if(s.beams[j].life<=0)s.beams.splice(j,1)}
 for(let j=s.waves.length-1;j>=0;j--){const w=s.waves[j];processWave(s,w);if(w.life<=0)s.waves.splice(j,1)}
 for(let j=s.shots.length-1;j>=0;j--){const q=s.shots[j],a=s.actors[1-q.owner];if(q.accel){const speed=Math.hypot(q.vx,q.vy)||1;
 const next=q.accel>0?Math.min(q.minSpeed,speed+q.accel*dt):Math.max(q.minSpeed,speed+q.accel*dt);
 q.vx*=next/speed;q.vy*=next/speed;}
const nx=q.x+q.vx*dt,ny=q.y+q.vy*dt;q.life-=dt;
if(Math.hypot(nx-a.x,ny-a.y)<12+q.r){
 if(q.style==='bolt')a.shield=Math.max(0,a.shield-3);
 const dealt=harm(s,a,q.damage,q.owner,q.depth);if(dealt){markTarget(s,a,q.element||mage(s.actors[q.owner].mageId).school,q.owner,q.depth);const attacker=s.actors[q.owner],trait=mage(attacker.mageId).trait;if(trait==='burn'){a.burn=Math.max(a.burn||0,has(attacker,'lasting')?2.4:1.55);a.burnSource=q.owner;}if(trait==='hit_push')move(a,Math.cos(Math.atan2(q.vy,q.vx))*8,Math.sin(Math.atan2(q.vy,q.vx))*8);emit(s,'on_hit',q.owner,{},q.depth);if(q.drain)receiveHeal(s,attacker,3,q.depth)}
 if(dealt>0)fusionImpact(s,q,a);
  if(q.style==='rock')rockFracture(s,q,nx,ny);
 fx(s,'impact_'+(q.style||'orb'),nx,ny);s.shots.splice(j,1);continue
}
const wall=distWall(nx,ny,q.r)||blocking(s,nx,ny,q.r),edge=nx<19||nx>W-19||ny<21||ny>H-21;
if(wall||edge){if(q.bounces>0){q.bounces--;const wallX=distWall(nx,q.y,q.r)||blocking(s,nx,q.y,q.r)||nx<19||nx>W-19;if(wallX)q.vx*=-1;else q.vy*=-1;q.x+=q.vx*dt;q.y+=q.vy*dt;fx(s,'spark',q.x,q.y);emit(s,'on_bounce',q.owner,{},q.depth)}else{if(q.style==='rock')rockFracture(s,q,q.x,q.y);s.shots.splice(j,1);fx(s,'spark',q.x,q.y);emit(s,'on_expire',q.owner,{},q.depth)}continue}
if(q.life<=0){s.shots.splice(j,1);if(mage(s.actors[q.owner].mageId).trait==='miss_cool')s.actors[q.owner].heat=Math.max(0,s.actors[q.owner].heat-6);emit(s,'on_expire',q.owner,{},q.depth);continue}q.x=nx;q.y=ny}
for(let j=s.echoes.length-1;j>=0;j--){const e=s.echoes[j];e.life-=dt;e.cast-=dt;const source=s.actors[e.owner];if(e.cast<=0){e.cast=.76;const target=s.actors[1-e.owner];spawnShot(s,source,Math.atan2(target.y-e.y,target.x-e.x),e.x,e.y,{clone:true,strong:!!e.extra});e.shots=(e.shots??2)-1}if(e.life<=0||e.shots<=0)s.echoes.splice(j,1)}
for(let j=s.mines.length-1;j>=0;j--){
 const mine=s.mines[j];mine.life-=dt;const target=s.actors[1-mine.owner];
 if(Math.hypot(target.x-mine.x,target.y-mine.y)<mine.r){const d=harm(s,target,mine.damage,mine.owner);if(d>0){markTarget(s,target,mine.element||mage(s.actors[mine.owner].mageId).school,mine.owner);emit(s,'on_hit',mine.owner)}fx(s,'overload',mine.x,mine.y);s.mines.splice(j,1)}
 else if(mine.life<=0)s.mines.splice(j,1);
 }
 for(let j=s.barriers.length-1;j>=0;j--){s.barriers[j].life-=dt;if(s.barriers[j].life<=0)s.barriers.splice(j,1)}
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
 &&Array.isArray(s.actors)&&s.actors.length===2&&s.actors.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.hp)&&validMage(a.mageId)&&typeof a.mark==='string'&&Number.isFinite(a.markLife)&&a.markLife>=0&&Number.isFinite(a.reactionCd)&&Number.isFinite(a.heat)&&a.heat>=0&&a.heat<=100&&legalRunes(a.runes)&&(!a.evolution||EVOLUTIONS.some(f=>f.id===a.evolution.form)&&Number.isInteger(a.evolution.level)&&a.evolution.level>0&&a.evolution.level<=3)&&(!a.fusions||Array.isArray(a.fusions)&&a.fusions.length<=3&&new Set(a.fusions).size===a.fusions.length&&a.fusions.every(id=>FUSIONS.some(f=>f.id===id)))&&a.runeTimers&&typeof a.runeTimers==='object')
 &&Array.isArray(s.shots)&&(!s.streams||Array.isArray(s.streams))&&(!s.beams||Array.isArray(s.beams))&&(!s.waves||Array.isArray(s.waves))&&(!s.lobs||Array.isArray(s.lobs))&&Array.isArray(s.echoes)&&Array.isArray(s.mines)&&Array.isArray(s.barriers)&&(!s.fields||Array.isArray(s.fields))&&Array.isArray(s.eventQueue)
 &&Array.isArray(s.elementCombos)&&s.elementCombos.length===2&&s.elementCombos.every(n=>Number.isInteger(n)&&n>=0)&&Array.isArray(s.score)&&s.score.every(n=>Number.isInteger(n)&&n>=0&&(s.gameMode==='rupture'?n<=10000:n<=4))&&['duel','rupture',undefined].includes(s.gameMode);
}
