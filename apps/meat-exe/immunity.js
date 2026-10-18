// MEAT.EXE v1.7: bounded adaptive immunity, not random unavoidable spawns.
// Pure transitions; the caller handles spawn positions and actual enemies.
export const IMMUNE_EVENTS=Object.freeze({
 probe:{name:'РАЗВЕДКА',units:['crawler','spitter'],minHeat:19},
 purge:{name:'ОЧИЩЕНИЕ',units:['spitter','leech','brute'],minHeat:42},
 guardian:{name:'СТРАЖ ПРИВРАТНИКА',units:['warden'],minHeat:57}
});
export function immuneDefaults(){return {heat:0,cooldown:0,warning:0,pending:'',responses:0,guardianStages:[],quiet:0};}
export function sanitizeImmune(raw){
 const x=raw&&typeof raw==='object'?raw:{},limit=(n,min,max,defaultValue)=>Number.isFinite(n)?Math.max(min,Math.min(max,n)):defaultValue;
 return {heat:limit(x.heat,0,100,0),cooldown:limit(x.cooldown,0,30,0),
  warning:limit(x.warning,0,5,0),pending:Object.hasOwn(IMMUNE_EVENTS,x.pending)?x.pending:'',
  responses:Math.floor(limit(x.responses,0,999,0)),
  guardianStages:Array.isArray(x.guardianStages)?[...new Set(x.guardianStages.filter(n=>Number.isInteger(n)&&n>=1&&n<=4))]:[],
  quiet:limit(x.quiet,0,30,0)};
}
export function provokeImmune(immune,kind,wave){
 const amount=kind==='rupture'?31:kind==='kill'?1.2:kind==='acid'?1.8:0;
 immune.heat=Math.min(100,immune.heat+amount*(wave>=3?1.12:1));
 immune.quiet=0;
}
export function updateImmune(immune,dt,{wave,enemies,remaining,playerHp}){
 immune.heat=Math.max(0,immune.heat-dt*(immune.pending?.24:.54));
 immune.cooldown=Math.max(0,immune.cooldown-dt);
 immune.quiet=Math.min(30,immune.quiet+dt);
 if(immune.pending){
  immune.warning=Math.max(0,immune.warning-dt);
  if(immune.warning>0)return {kind:'warning',event:immune.pending};
  const event=immune.pending;immune.pending='';
  // Warning can end at dangerous moment. Delay response rather than force-spawn
  // during busy fights, and never exceed active cap.
  if(enemies>=14||playerHp<=18){immune.cooldown=3.2;return {kind:'cancel',event};}
  immune.responses++;immune.heat=Math.max(0,immune.heat-(event==='guardian'?29:16));
  immune.cooldown=event==='guardian'?17:10;
  if(event==='guardian')immune.guardianStages.push(wave);
  return {kind:'dispatch',event,units:IMMUNE_EVENTS[event].units.slice(0,event==='probe'?1:2)};
 }
 if(wave>=5||wave<1||immune.cooldown>0||remaining<0||enemies>=12||playerHp<=24)return null;
 let event='';
 if(wave===2&&immune.heat>=57&&!immune.guardianStages.includes(wave))event='guardian';
 else if(immune.heat>=42)event='purge';
 else if(immune.heat>=19)event='probe';
 if(!event)return null;
 immune.pending=event;immune.warning=event==='guardian'?2.7:1.6;
 return {kind:'warning',event};
}
export function immuneIntensity(immune){return Math.min(1,Math.max(0,(immune?.heat||0)/100));}
