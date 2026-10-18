// ПЕРЕКОС — deterministic fixed-step combat and bounded rune events.
import {RUNES,legalRunes,compile,description,eligibleOffers,cooldown,heatCost,repetitions,MAX_CHAIN_DEPTH,MAX_REACTIONS_PER_TICK,MAX_QUEUE,HEAT_LIMIT} from './runes.mjs';
export {RUNES} from './runes.mjs';
import {mage,validMage} from './mages.mjs';
export const W=400,H=620,STEP=1/60,ROUND_SECONDS=25;
export const WALLS=[{x:102,y:180,w:64,h:54},{x:232,y:385,w:66,h:56}];

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mag=(x,y)=>Math.hypot(x,y)||1;
export function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296}
export function has(a,k){return a.runes.includes(k)}
export function stats(a){const m=mage(a.mageId);return {max:100,speed:125*m.speed*(a.haste>0?1.35:1)*(a.slow>0?.68:1),damage:12*m.power,reload:.56*m.reload,shield:34*m.shield}}
function actor(id,x,y,runes,mageId='kindle'){return {id,x,y,mageId:validMage(mageId)?mageId:'kindle',vx:0,vy:0,hp:100,shield:0,face:id===0?0:Math.PI,cast:0,guard:0,dash:0,dashReady:0,shieldReady:0,stun:0,flash:0,runes:[...runes],kills:0,hit:0,aiT:0,aiMove:1,invuln:0,heat:0,overloadCd:0,runeTimers:{},haste:0,slow:0}}
function freshActor(a){const o=actor(a.id,a.id===0?64:336,a.id===0?484:134,a.runes,a.mageId);o.hp=stats(o).max;return o}
export function makeMatch(seed=0x718abc,first='kindle',second='pebble'){const s={version:3,seed:seed>>>0||1,phase:'fight',round:1,remaining:ROUND_SECONDS,overtime:0,score:[0,0],draws:0,lastOutcome:'',actors:[actor(0,64,484,['on_hurt','armor'],first),actor(1,336,134,['on_hurt','armor'],second)],shots:[],echoes:[],mines:[],barriers:[],eventQueue:[],fx:[],pick:[],log:[],ticks:0,serial:0,champion:null};s.actors=s.actors.map(freshActor);return s}
export function offers(s){return eligibleOffers(s)}
// Choosing a rune opens the working table. Players may reorder before returning to battle.
export function chooseRune(s,id,replaceIndex=null){
 if(s.phase!=='draft'||!s.pick.includes(id))return false;
 const a=s.actors[0];
 if(a.runes.length===9){if(!Number.isInteger(replaceIndex)||replaceIndex<0||replaceIndex>=9)return false;a.runes[replaceIndex]=id}
 else a.runes.push(id);
 const bot=s.actors[1], pool=RUNES.filter(r=>!bot.runes.includes(r.id));
 if(pool.length){const avail=pool.filter(r=>r.type!=='when'||bot.runes.filter(id=>RUNES.find(z=>z.id===id)?.type==='when').length<3);const picked=avail[Math.floor(random(s)*avail.length)];if(picked){if(bot.runes.length===9)bot.runes[Math.floor(random(s)*9)]=picked.id;else bot.runes.push(picked.id)}}
 s.pick=[];s.phase='build';return true;
}
export function reorderRunes(s,from,to){
 if(s.phase!=='build')return false;const slots=s.actors[0].runes;
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=slots.length||to>=slots.length)return false;
 const [id]=slots.splice(from,1);slots.splice(to,0,id);return true;
}
export function beginRound(s){if(s.phase!=='build')return false;startRound(s);return true}
export function startRound(s){
 s.phase='fight';s.round=s.score[0]+s.score[1]+s.draws+1;s.remaining=ROUND_SECONDS;s.overtime=0;
 s.actors=s.actors.map(freshActor);s.shots=[];s.echoes=[];s.mines=[];s.barriers=[];s.eventQueue=[];s.pick=[];s.fx=[];s.ticks=0;s.reactions=0;
}
export function retryMatch(s){return makeMatch((s.seed+0x9e3779b9)>>>0)}
export function distWall(x,y,r=0){return WALLS.some(w=>x+r>w.x&&x-r<w.x+w.w&&y+r>w.y&&y-r<w.y+w.h)}
export function canStand(x,y,r=12){return x>=r+13&&x<=W-r-13&&y>=r+16&&y<=H-r-16&&!distWall(x,y,r)}
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
function receiveHeal(s,a,amount,depth=0){const old=a.hp;a.hp=Math.min(stats(a).max,a.hp+amount);const delta=a.hp-old;if(delta>0){emit(s,'on_heal',a.id,{},depth);fx(s,'heal',a.x,a.y)}return delta}
function spawnShot(s,a,dir,x=a.x,y=a.y,options={}){
 if(s.shots.length>=80)return false;
 const base=mage(a.mageId),style=options.clone?'echo':options.style||base.style;const v=(style==='bolt'||style==='arc'?365:style==='rock'?198:style==='wave'?205:style==='flame'?260:252)*(options.fastshot?1.35:1),speed=Number.isFinite(v)?v:252;
 s.shots.push({x,y,vx:Math.cos(dir)*speed,vy:Math.sin(dir)*speed,owner:a.id,
  style,damage:options.clone?6:stats(a).damage*(options.strong?1.6:1),life:(options.far?1.8:1.15)*(style==='arc'?.68:style==='rock'?1.2:style==='wave'?.65:1),
  bounces:options.bounce?1:0,drain:!!options.drain,r:options.wide?10:style==='wave'?12:style==='rock'?8:style==='bolt'?3:options.clone?4:5,depth:options.depth||0});
 fx(s,'shoot',x,y);return true;
}
function attack(s,a,target){
 if(a.cast>0||a.stun>0)return false;
 a.face=Math.atan2(target.y-a.y,target.x-a.x);a.cast=stats(a).reload;
 spawnShot(s,a,a.face);a.heat=Math.min(HEAT_LIMIT,a.heat+7);emit(s,'on_cast',a.id);return true;
}
function guard(s,a){
 if(a.shieldReady>0||a.stun>0)return false;
 a.shield=Math.min(80,a.shield+stats(a).shield+(mage(a.mageId).trait==='guard_extra'?5:0));a.shieldReady=5;if(mage(a.mageId).trait==='guard_slow'){const enemy=s.actors[1-a.id];if(Math.hypot(a.x-enemy.x,a.y-enemy.y)<105)enemy.slow=Math.max(enemy.slow,1.1)}a.heat=Math.min(HEAT_LIMIT,a.heat+7);
 fx(s,'shield',a.x,a.y);emit(s,'on_guard',a.id);return true;
}
function dash(s,a,dir){
 if(a.dashReady>0||a.stun>0)return false;const m=mag(dir.x,dir.y);
 a.vx=dir.x/m*370;a.vy=dir.y/m*370;if(mage(a.mageId).trait==='dash_haste')a.haste=Math.max(a.haste,.9);a.dash=.17;a.dashReady=2.5;a.invuln=.13;a.heat=Math.min(HEAT_LIMIT,a.heat+6);
 fx(s,'dash',a.x,a.y);emit(s,'on_dash',a.id);return true;
}
// The queue is cleared each update and every event owns a bounded ancestry depth.
function emit(s,kind,owner,payload={},depth=0){
 if(depth>MAX_CHAIN_DEPTH||s.eventQueue.length>=MAX_QUEUE)return false;
 s.eventQueue.push({kind,owner,payload,depth});return true;
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
 case 'ball':spawnShot(s,a,angle,a.x,a.y,{strong:m.has('strong'),far:m.has('far'),bounce:m.has('bounce'),drain:m.has('drain'),wide:m.has('wide'),fastshot:m.has('fastshot'),depth});break;
 case 'heal':receiveHeal(s,a,7*strong,depth);break;
 case 'armor':a.shield=Math.min(80,a.shield+11*strong);fx(s,'shield',a.x,a.y);break;
 case 'blast':if(Math.hypot(other.x-a.x,other.y-a.y)<(m.has('wide')?110:72)*reach){const d=harm(s,other,11*strong,a.id,depth);if(d>0)emit(s,'on_hit',a.id,{},depth)}fx(s,'overload',a.x,a.y);break;
 case 'blink':{const step=38*reach*(m.has('reverse')?-1:1);move(a,Math.cos(a.face)*step,Math.sin(a.face)*step);fx(s,'dash',a.x,a.y);break}
 case 'clone':if(s.echoes.length<12)s.echoes.push({owner:a.id,x:a.x,y:a.y,life:m.has('lasting')?3.5:2.2,cast:.25,shots:2,extra:m.has('strong')});fx(s,'dash',a.x,a.y);break;
 case 'mine':if(s.mines.length<14)s.mines.push({x:a.x,y:a.y,owner:a.id,life:m.has('lasting')?6:3.5,damage:14*strong,r:m.has('wide')?57:40});fx(s,'mine',a.x,a.y);break;
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
for(const shot of s.shots){if(shot.owner===1)continue;const rx=b.x-shot.x,ry=b.y-shot.y;const t=clamp((rx*shot.vx+ry*shot.vy)/(shot.vx**2+shot.vy**2),0,.4);if(Math.hypot(rx-shot.vx*t,ry-shot.vy*t)<27){x=-shot.vy/252*1.7;y=shot.vx/252*1.7;if(b.dashReady<=0&&t<.2&&random(s)<.025)dash(s,b,{x,y});if(b.shieldReady<=0&&b.hp<65)guard(s,b);break}}
if(d<260&&random(s)<.035)attack(s,b,p);
if(b.shieldReady<=0&&b.hp<55&&random(s)<.009)guard(s,b);
return {x,y,attack:false,shield:false,dash:false,aim:{x:p.x,y:p.y}}}
export function tick(s,input={},dt=STEP,otherInput=null){
 if(s.phase!=='fight')return s;dt=STEP;safeWorld=s;s.ticks++;s.remaining=Math.max(0,s.remaining-dt);
 for(const a of s.actors){
  a.heat=Math.max(0,a.heat-7*dt);a.overloadCd=Math.max(0,a.overloadCd-dt);
  a.haste=Math.max(0,a.haste-dt);a.slow=Math.max(0,a.slow-dt);
  if(s.ticks%120===0)emit(s,'on_clock',a.id);
  if(s.ticks%60===0&&Math.hypot(a.x-s.actors[1-a.id].x,a.y-s.actors[1-a.id].y)<78)emit(s,'on_close',a.id);
  if(a.heat>=HEAT_LIMIT&&a.overloadCd<=0)addHeat(s,a,0);
 }
const control=[input,otherInput===null?botInput(s,dt):otherInput];
for(let i=0;i<2;i++){const a=s.actors[i],c=control[i],other=s.actors[1-i];a.cast=Math.max(0,a.cast-dt);a.shieldReady=Math.max(0,a.shieldReady-dt);a.dashReady=Math.max(0,a.dashReady-dt);a.stun=Math.max(0,a.stun-dt);a.flash=Math.max(0,a.flash-dt);a.invuln=Math.max(0,a.invuln-dt);
if(a.dash>0){move(a,a.vx*dt,a.vy*dt);a.dash=Math.max(0,a.dash-dt)}
else{let x=Number(c.x)||0,y=Number(c.y)||0,m=mag(x,y);if(m>1){x/=m;y/=m}move(a,x*stats(a).speed*dt,y*stats(a).speed*dt)}
if(c.aim&&Number.isFinite(c.aim.x)&&Number.isFinite(c.aim.y))a.face=Math.atan2(c.aim.y-a.y,c.aim.x-a.x);
if(c.dash)dash(s,a,{x:Number(c.x)||Math.cos(a.face),y:Number(c.y)||Math.sin(a.face)});
if(c.shield)guard(s,a);
if(c.attack)attack(s,a,c.aim||other);
if(s.ticks%60===0&&a.heat>=HEAT_LIMIT)addHeat(s,a,0)}
for(let j=s.shots.length-1;j>=0;j--){const q=s.shots[j],a=s.actors[1-q.owner];const nx=q.x+q.vx*dt,ny=q.y+q.vy*dt;q.life-=dt;
if(Math.hypot(nx-a.x,ny-a.y)<12+q.r){
 const dealt=harm(s,a,q.damage,q.owner,q.depth);if(dealt){const attacker=s.actors[q.owner],trait=mage(attacker.mageId).trait;if(trait==='burn')a.heat=Math.min(100,a.heat+2);if(trait==='hit_push')move(a,Math.cos(Math.atan2(q.vy,q.vx))*8,Math.sin(Math.atan2(q.vy,q.vx))*8);emit(s,'on_hit',q.owner,{},q.depth);if(q.drain)receiveHeal(s,attacker,3,q.depth)}
 fx(s,'impact_'+(q.style||'orb'),nx,ny);s.shots.splice(j,1);continue
}
const wall=distWall(nx,ny,q.r)||blocking(s,nx,ny,q.r),edge=nx<19||nx>W-19||ny<21||ny>H-21;
if(wall||edge){if(q.bounces>0){q.bounces--;const wallX=distWall(nx,q.y,q.r)||blocking(s,nx,q.y,q.r)||nx<19||nx>W-19;if(wallX)q.vx*=-1;else q.vy*=-1;q.x+=q.vx*dt;q.y+=q.vy*dt;fx(s,'spark',q.x,q.y);emit(s,'on_bounce',q.owner,{},q.depth)}else{s.shots.splice(j,1);fx(s,'spark',q.x,q.y);emit(s,'on_expire',q.owner,{},q.depth)}continue}
if(q.life<=0){s.shots.splice(j,1);if(mage(s.actors[q.owner].mageId).trait==='miss_cool')s.actors[q.owner].heat=Math.max(0,s.actors[q.owner].heat-6);emit(s,'on_expire',q.owner,{},q.depth);continue}q.x=nx;q.y=ny}
for(let j=s.echoes.length-1;j>=0;j--){const e=s.echoes[j];e.life-=dt;e.cast-=dt;const source=s.actors[e.owner];if(e.cast<=0){e.cast=.76;const target=s.actors[1-e.owner];spawnShot(s,source,Math.atan2(target.y-e.y,target.x-e.x),e.x,e.y,{clone:true,strong:!!e.extra});e.shots=(e.shots??2)-1}if(e.life<=0||e.shots<=0)s.echoes.splice(j,1)}
for(let j=s.mines.length-1;j>=0;j--){
 const mine=s.mines[j];mine.life-=dt;const target=s.actors[1-mine.owner];
 if(Math.hypot(target.x-mine.x,target.y-mine.y)<mine.r){const d=harm(s,target,mine.damage,mine.owner);if(d>0)emit(s,'on_hit',mine.owner);fx(s,'overload',mine.x,mine.y);s.mines.splice(j,1)}
 else if(mine.life<=0)s.mines.splice(j,1);
 }
 for(let j=s.barriers.length-1;j>=0;j--){s.barriers[j].life-=dt;if(s.barriers[j].life<=0)s.barriers.splice(j,1)}
 flushEvents(s);
 s.fx.forEach(f=>f.t+=dt);s.fx=s.fx.filter(f=>f.t<.38);
if(s.actors.some(a=>a.hp<=0)||s.remaining<=0){const [a,b]=s.actors;let winner;
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
 return !!s&&s.version===3&&['fight','draft','build','result'].includes(s.phase)
 &&Array.isArray(s.actors)&&s.actors.length===2&&s.actors.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.hp)&&validMage(a.mageId)&&Number.isFinite(a.heat)&&a.heat>=0&&a.heat<=100&&legalRunes(a.runes)&&a.runeTimers&&typeof a.runeTimers==='object')
 &&Array.isArray(s.shots)&&Array.isArray(s.echoes)&&Array.isArray(s.mines)&&Array.isArray(s.barriers)&&Array.isArray(s.eventQueue)
 &&Array.isArray(s.score)&&s.score.every(n=>Number.isInteger(n)&&n>=0&&n<=4);
}
