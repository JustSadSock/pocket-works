// Deterministic pitch-domain expression for recorded sample playback.
// This is controlled sample-rate modulation, not a claim of physical bow or breath simulation.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function object(value,label){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid '+label);
}
function keys(value,allowed,label){
 for(const key of Object.keys(value))if(!allowed.has(key))throw Error('Unknown '+label+' property: '+key);
}
function number(value,min,max,label){
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('Invalid '+label);
 return value;
}
export function compileRecordedExpression(config,durationSeconds){
 if(config===undefined)return null;
 object(config,'recorded expression');
 number(durationSeconds,.15,30,'expression duration');
 keys(config,new Set(['vibrato','attackBend']),'recorded expression');
 let vibrato=null,attackBend=null;
 if(config.vibrato!==undefined){
  object(config.vibrato,'recorded vibrato');
  keys(config.vibrato,new Set(['depthCents','rateHz','delaySeconds','fadeInSeconds','releaseSeconds']),'recorded vibrato');
  vibrato={
   depthCents:number(config.vibrato.depthCents??0,0,45,'vibrato depth'),
   rateHz:number(config.vibrato.rateHz??5,3,9,'vibrato rate'),
   delaySeconds:number(config.vibrato.delaySeconds??.18,0,2,'vibrato delay'),
   fadeInSeconds:number(config.vibrato.fadeInSeconds??.18,.04,1,'vibrato fade-in'),
   releaseSeconds:number(config.vibrato.releaseSeconds??.12,.03,.5,'vibrato release')
  };
  if(vibrato.depthCents>0&&vibrato.delaySeconds>=durationSeconds)throw Error('Vibrato begins after note end');
 }
 if(config.attackBend!==undefined){
  object(config.attackBend,'recorded attack bend');
  keys(config.attackBend,new Set(['cents','durationSeconds']),'recorded attack bend');
  attackBend={
   cents:number(config.attackBend.cents,-80,80,'attack bend cents'),
   durationSeconds:number(config.attackBend.durationSeconds,.02,.5,'attack bend duration')
  };
  if(attackBend.durationSeconds>durationSeconds)throw Error('Attack bend exceeds note duration');
 }
 if(!vibrato&&!attackBend)throw Error('Recorded expression has no controls');
 const metadata={vibrato,attackBend,maxDeviationCents:(vibrato?.depthCents??0)+Math.abs(attackBend?.cents??0)};
 function rateAt(elapsedSeconds){
  number(elapsedSeconds,0,Number.MAX_VALUE,'expression time');
  const t=Math.min(durationSeconds,elapsedSeconds);
  let cents=0;
  if(attackBend){
   const remaining=clamp(1-t/attackBend.durationSeconds,0,1);
   cents+=attackBend.cents*remaining*remaining;
  }
  if(vibrato&&vibrato.depthCents>0&&t>=vibrato.delaySeconds){
   const fadeIn=clamp((t-vibrato.delaySeconds)/vibrato.fadeInSeconds,0,1);
   const fadeOut=clamp((durationSeconds-t)/vibrato.releaseSeconds,0,1);
   cents+=vibrato.depthCents*fadeIn*fadeOut*Math.sin(2*Math.PI*vibrato.rateHz*(t-vibrato.delaySeconds));
  }
  return 2**(cents/1200);
 }
 return {rateAt,metadata};
}
