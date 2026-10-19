// MEAT.EXE / v1.8.4: player-selected replay protocols and observed-run metrics.
// These are not decorative modifiers: combat, spawn load and rewards all read them.
export const PROTOCOLS=Object.freeze([
 Object.freeze({id:'normal',name:'БЕЗ ПРОТОКОЛА',description:'Исходный организм · обычные награды',bonus:0}),
 Object.freeze({id:'fever',name:'ЛИХОРАДКА',description:'Иммунитет начинает с +25 тревоги · +25% эхо',bonus:.25}),
 Object.freeze({id:'fragile',name:'ХРУПКАЯ ПЛОТЬ',description:'−18 макс. HP · +20% входящего урона · +50% эхо',bonus:.50}),
 Object.freeze({id:'siege',name:'ОСАДА',description:'+2 врага за пульс · скорость врагов +9% · +60% эхо',bonus:.60})
]);
const protocolMap=new Map(PROTOCOLS.map(p=>[p.id,p]));
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const finite=(n,lo,hi,defaultValue=0)=>Number.isFinite(n)?clamp(n,lo,hi):defaultValue;
export function sanitizeProtocol(id){return protocolMap.has(id)?id:'normal';}
export function applyProtocol(state,id){
 const protocol=sanitizeProtocol(id);
 state.protocol=protocol;
 if(protocol==='fever')state.immune.heat=clamp((state.immune.heat||0)+25,0,100);
 if(protocol==='fragile'){
  state.maxHp=Math.max(40,state.maxHp-18);
  state.hp=Math.min(state.maxHp,state.hp);
 }
 return protocol;
}
export function extraEnemiesForPulse(protocol,pulseMax=3){
 return sanitizeProtocol(protocol)==='siege'&&pulseMax===3?2:0;
}
export function incomingProtocolDamage(state,damage){
 return damage*(state?.protocol==='fragile'?1.20:1);
}
export function enemyProtocolSpeed(state){
 return state?.protocol==='siege'?1.09:1;
}
export function spawnCadence(state,random){
 const u=finite(random,0,.999999,.5);
 let delay=.47+u*.33;
 const ratio=finite(state?.hp,0,160,100)/Math.max(1,finite(state?.maxHp,1,160,100));
 if(ratio<.38)delay*=1.17;
 if((state?.enemies?.length||0)>=10)delay*=1.20;
 if(state?.protocol==='siege')delay*=.89;
 if(state?.protocol==='fever')delay*=.95;
 return clamp(delay,.34,1.16);
}
export function echoBonus(base,run,victory){
 const protocol=protocolMap.get(run?.protocol);
 if(!protocol||protocol.bonus===0||!Number.isFinite(run?.elapsed)||run.elapsed<90||
    (!victory&&(!Number.isInteger(run.wave)||run.wave<2)))return 0;
 return Math.ceil(base*protocol.bonus);
}
export function registerCombatChain(state){
 const now=Number.isFinite(state?.elapsed)?state.elapsed:0;
 state.combo=now<=(state.comboExpires||0)?Math.min(12,(state.combo||0)+1):1;
 state.comboExpires=now+4.5;
 state.peakCombo=Math.max(state.peakCombo||0,state.combo);
 const bonus=state.combo>=2?(state.combo-1)*18:0;
 state.score=Math.max(0,(state.score||0)+bonus);
 return {combo:state.combo,bonus};
}
export function sanitizeRunHistory(value){
 if(!Array.isArray(value))return [];
 return value.slice(-12).filter(r=>r&&typeof r==='object'&&Number.isFinite(r.elapsed)&&r.elapsed>=0)
  .map(r=>({
    elapsed:Math.floor(finite(r.elapsed,0,99999)),
    wave:Math.floor(finite(r.wave,1,5,1)),
    kills:Math.floor(finite(r.kills,0,9999)),
    score:Math.floor(finite(r.score,0,99999999)),
    damageTaken:Math.floor(finite(r.damageTaken,0,9999)),
    peakCombo:Math.floor(finite(r.peakCombo,0,12)),
    protocol:sanitizeProtocol(r.protocol),
    victory:r.victory===true,
    stageTimes:Array.isArray(r.stageTimes)?r.stageTimes.slice(0,5).map(t=>Math.floor(finite(t,0,99999))):[]
  }));
}
export function recordFinishedRun(archive,run,victory){
 if(!Number.isFinite(run?.elapsed)||run.elapsed<0)return null;
 const stageTimes=Array.from({length:5},(_,i)=>{
  const entry=Array.isArray(run.stageTimes)?run.stageTimes.find(x=>x.wave===i+1):null;
  return Math.floor(finite(entry?.seconds,0,99999));
 });
 if(Number.isInteger(run.wave)&&run.wave>=1&&run.wave<=5){
  stageTimes[run.wave-1]=Math.floor(finite(run.waveTime,0,99999));
 }
 const entry={
   elapsed:Math.floor(finite(run.elapsed,0,99999)),wave:Math.floor(finite(run.wave,1,5,1)),
   kills:Math.floor(finite(run.kills,0,9999)),score:Math.floor(finite(run.score,0,99999999)),
   damageTaken:Math.floor(finite(run.damageTaken,0,9999)),peakCombo:Math.floor(finite(run.peakCombo,0,12)),
   protocol:sanitizeProtocol(run.protocol),victory:Boolean(victory),stageTimes
 };
 archive.history=sanitizeRunHistory([...(archive.history||[]),entry]);
 return entry;
}
export function observedRunStats(history){
 const rows=sanitizeRunHistory(history),completed=rows.filter(r=>r.victory);
 const duration=rows.map(r=>r.elapsed).sort((a,b)=>a-b);
 const median=duration.length?
   (duration[Math.floor((duration.length-1)/2)]+duration[Math.floor(duration.length/2)])/2:null;
 return {runs:rows.length,wins:completed.length,
   winRate:rows.length?Math.round(completed.length/rows.length*100):null,
   medianSeconds:median,bestScore:rows.reduce((n,r)=>Math.max(n,r.score),0)};
}
