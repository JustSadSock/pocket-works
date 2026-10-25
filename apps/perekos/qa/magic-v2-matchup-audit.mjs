// Deterministic, position-balanced Magic 2.0 matchup audit.
// This is a fixed-step BOT benchmark, not evidence from human multiplayer matches.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeMagicV2Practice,tick,STEP,validState,canStand} from '../core.mjs';
import {rayCollision} from '../collision-geometry.mjs';
import {createMagicLoadout,grantEarnedMagicRune,applyMagicEdit,validateMagicState} from '../magic-v2-rules.mjs';

export const SCHOOLS=Object.freeze(['stone','fire','storm']);
export const PROFILES=Object.freeze(['starter','guard','pressure']);
export const TACTICS=Object.freeze(['close','circle','range']);
export const AIM_MODES=Object.freeze(['direct','lead']);
const MAGES={stone:'pebble',fire:'kindle',storm:'wire'};
const PRESSURE={stone:'st_spikes',fire:'fi_lash',storm:'li_discharge'};
const round=n=>Number(n.toFixed(3));

function equip(book,id,slot=1){
 const granted=grantEarnedMagicRune(book,id);
 assert.equal(granted.ok,true,granted.error);
 const instance=granted.state.reserve.at(-1);
 const result=applyMagicEdit(granted.state,{
  type:'equip',slot,instanceId:instance.instanceId,revision:granted.state.revision
 });
 assert.equal(result.ok,true,result.error||id);
 return result.state;
}
function profile(book,kind,school){
 if(kind==='starter')return book;
 let next=equip(book,'u_on_cast');
 next=equip(next,kind==='guard'?'u_guard':PRESSURE[school]);
 assert.equal(validateMagicState(next).ok,true);
 return next;
}
// Use the actual court geometry: when line of sight is lost, seek the open
// mid-lane instead of strafing forever behind an obstacle.
const PROJECTILE_SPEED=Object.freeze({stone:198,fire:252,storm:365});
function predictedAim(self,enemy,previous,mode){
 if(mode==='direct'||!previous)return {x:enemy.x,y:enemy.y};
 const vx=Math.max(-150,Math.min(150,(enemy.x-previous.x)/STEP));
 const vy=Math.max(-150,Math.min(150,(enemy.y-previous.y)/STEP));
 const dx=enemy.x-self.x,dy=enemy.y-self.y,speed=PROJECTILE_SPEED[self.magicSchool]||252;
 const qa=vx*vx+vy*vy-speed*speed,qb=2*(dx*vx+dy*vy),qc=dx*dx+dy*dy;
 const disc=qb*qb-4*qa*qc;
 let time=Math.hypot(dx,dy)/speed;
 if(disc>=0&&Math.abs(qa)>1e-6){
  const roots=[(-qb-Math.sqrt(disc))/(2*qa),(-qb+Math.sqrt(disc))/(2*qa)]
   .filter(x=>Number.isFinite(x)&&x>0);
  if(roots.length)time=Math.min(...roots);
 }
 time=Math.min(.85,Math.max(0,time));
 return {x:Math.max(25,Math.min(375,enemy.x+vx*time)),
  y:Math.max(25,Math.min(595,enemy.y+vy*time))};
}
function controls(s,self,enemy,seat,frame,tactic,aimMode,previous){
 const dx=enemy.x-self.x,dy=enemy.y-self.y,d=Math.hypot(dx,dy)||1;
 const angle=Math.atan2(dy,dx);
 const visible=rayCollision(s,self.x,self.y,angle,d,6,seat).length>=d-17;
 const target=visible?enemy:{x:200,y:310};
 const tx=target.x-self.x,ty=target.y-self.y,length=Math.hypot(tx,ty)||1;
 const goal=tactic==='close'?75:tactic==='circle'?115:165;
 const chase=!visible?1:d>goal+15?.78:d<goal-12?-.46:.09;
 const strafe=(Math.floor(frame/(tactic==='range'?175:230))+seat)%2===0?
   (tactic==='circle'?.45:.25):(tactic==='circle'?-.45:-.25);
 let x=tx/length*chase-ty/length*strafe,y=ty/length*chase+tx/length*strafe;
 // Don't steer through a wall; pick the safer unobstructed move.
 if(!canStand(self.x+x*10,self.y+y*10,12)){
  if(canStand(self.x+tx/length*10,self.y+ty/length*10,12)){x=tx/length;y=ty/length}
  else if(canStand(self.x-ty/length*10,self.y+tx/length*10,12)){x=-ty/length;y=tx/length}
  else {x=ty/length;y=-tx/length}
 }
 return {x,y,aim:predictedAim(self,enemy,previous,aimMode),attack:true,
  shield:frame%317===3,dash:frame%229===7};
}
export function simulate(left,right,kind,seed,frames=900,tactic='close',aimMode='direct'){
 assert.ok(TACTICS.includes(tactic)&&AIM_MODES.includes(aimMode));
 assert.ok(SCHOOLS.includes(left)&&SCHOOLS.includes(right));
 assert.ok(PROFILES.includes(kind)&&Number.isInteger(seed));
 const s=makeMagicV2Practice(left,seed);
 s.magicLoadouts[0]=profile(s.magicLoadouts[0],kind,left);
 s.magicLoadouts[1]=profile(createMagicLoadout(right,{seed:seed+911,starter:'attack'}),kind,right);
 s.actors[1].magicSchool=right;
 s.actors[1].mageId=MAGES[right];
 // Symmetric mid-court openings provide real contact at close, medium and
 // long casting ranges. Keep the seat positions identical when swapping schools.
 const offset=seed%2===0?-12:12;
 s.actors[0].x=121;s.actors[0].y=310+offset;
 s.actors[1].x=279;s.actors[1].y=310-offset;
 assert.ok(s.actors.every(a=>canStand(a.x,a.y,12)));
 s.phase='fight';
 let elapsed=0,maxShots=0,maxMines=0,maxBarriers=0,visibleFrames=0;
 let previous=[null,null];
 for(let frame=0;frame<frames;frame++){
  const [a,b]=s.actors;
  const inputs=[controls(s,a,b,0,frame,tactic,aimMode,previous[1]),
   controls(s,b,a,1,frame,tactic,aimMode,previous[0])];
  previous=[{x:a.x,y:a.y},{x:b.x,y:b.y}];
  tick(s,inputs[0],STEP,inputs[1]);
  elapsed=frame+1;
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
  if(rayCollision(s,a.x,a.y,Math.atan2(dy,dx),d,6,0).length>=d-17)visibleFrames++;
  maxShots=Math.max(maxShots,s.shots.length);
  maxMines=Math.max(maxMines,s.mines.length);
  maxBarriers=Math.max(maxBarriers,s.barriers.length);
  assert.ok(maxShots<=80,'Projectile cap exceeded');
  if(s.actors.some(actor=>actor.hp<=0))break;
 }
 assert.equal(validState(s),true,'Invalid fixed-step Magic 2.0 state');
 const [a,b]=s.actors;
 return {left,right,profile:kind,tactic,aimMode,seed,ticks:elapsed,
  hp:[round(a.hp),round(b.hp)],shield:[round(a.shield),round(b.shield)],
  damageDealt:[round(a.hit),round(b.hit)],
  heat:[round(a.heat),round(b.heat)],
  knockout:a.hp<=0&&b.hp<=0?'double':a.hp<=0?'right':b.hp<=0?'left':'none',
  hpDelta:round(a.hp-b.hp),
  visibleFrames,maxShots,maxMines,maxBarriers};
}
export function audit({seeds=[431,997],frames=900,tactics=TACTICS,aimModes=AIM_MODES}={}){
 const matches=[];
 for(const aimMode of aimModes)for(const tactic of tactics)for(const kind of PROFILES)for(const seed of seeds)for(const left of SCHOOLS)for(const right of SCHOOLS){
  matches.push(simulate(left,right,kind,seed,frames,tactic,aimMode));
 }
 const pairedDamage=m=>m.damageDealt.some(n=>n>0);
 const pairs=[];
 for(let i=0;i<SCHOOLS.length;i++)for(let j=i+1;j<SCHOOLS.length;j++){
  const a=SCHOOLS[i],b=SCHOOLS[j];
  const aligned=matches.filter(m=>m.left===a&&m.right===b);
  const reversed=matches.filter(m=>m.left===b&&m.right===a);
  assert.equal(aligned.length,reversed.length);
  const paired=aligned.map((m,k)=>({
   tactic:m.tactic,aimMode:m.aimMode,profile:m.profile,advantage:(m.hpDelta-reversed[k].hpDelta)/2,
   hpExchange:pairedDamage(m)||pairedDamage(reversed[k])
  }));
  const active=paired.filter(x=>x.hpExchange);
  const average=items=>items.length?round(items.reduce((sum,x)=>sum+x.advantage,0)/items.length):null;
  const advantage=average(active);
  const byTactic=Object.fromEntries(tactics.map(tactic=>{
   const series=paired.filter(x=>x.tactic===tactic),activeSeries=series.filter(x=>x.hpExchange);
   return [tactic,{hpExchangePairs:activeSeries.length,totalPairs:series.length,
    hpAdvantage:average(activeSeries)}];
  }));
  const byAimMode=Object.fromEntries(aimModes.map(aimMode=>{
   const subset=paired.filter(x=>x.aimMode===aimMode),engaged=subset.filter(x=>x.hpExchange);
   return [aimMode,{hpExchangePairs:engaged.length,totalPairs:subset.length,
    hpAdvantage:average(engaged)}];
  }));
  const byProfile=Object.fromEntries(PROFILES.map(profile=>{
   const subset=paired.filter(x=>x.profile===profile),engaged=subset.filter(x=>x.hpExchange);
   return [profile,{hpExchangePairs:engaged.length,totalPairs:subset.length,
    hpAdvantage:average(engaged)}];
  }));
  pairs.push({a,b,samples:paired.length,hpExchangePairs:active.length,
   seatNeutralHpAdvantage:advantage,byTactic,byAimMode,byProfile,
   warning:advantage===null?'no-hp-exchange':
    Math.abs(advantage)>20?'investigate':'within-observation-band'});
 }
 const activeMatches=matches.filter(pairedDamage);
 const seatAdvantage=activeMatches.length?
  round(activeMatches.reduce((sum,m)=>sum+m.hpDelta,0)/activeMatches.length):null;
 return {schema:1,kind:'deterministic-fixed-step-bot-proxy',rules:'Magic 2.0',
  description:'Not live PocketNet sessions; reports cannot establish human win rates.',
  config:{schools:SCHOOLS,profiles:PROFILES,tactics,aimModes,seeds,frames,seatOrders:'both'},
  samples:matches.length,hpExchangeMatches:activeMatches.length,
  seatOneMeanHpAdvantage:seatAdvantage,
  seatWarning:seatAdvantage===null?'no-hp-exchange':Math.abs(seatAdvantage)>15?'investigate':'within-observation-band',
  pairs,matches};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=audit();
 const output=process.env.PEREKOS_AUDIT_OUT;
 if(output){mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n')}
 process.stdout.write(JSON.stringify({samples:report.samples,hpExchangeMatches:report.hpExchangeMatches,seatOneMeanHpAdvantage:report.seatOneMeanHpAdvantage,
  seatWarning:report.seatWarning,pairs:report.pairs})+'\n');
}
