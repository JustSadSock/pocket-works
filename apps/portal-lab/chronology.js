/**
 * SHOV 0.9. Parameter-space atlas of the conditional two-mouth chronology model.
 *
 * The test of causality only applies to the v0.8 prescribed identification
 * of mouth proper times, not to physically realized traversable wormholes.
 *
 * After B returns: Δ=T[1-I(β)] and loop threshold Δ>D+δ.
 * I(β)=∫_0^1 sqrt(1-β²sin²(2πu))du.
 * The integral is the same Simpson quadrature as causality.js.
 *
 * Instead of mapping a visual heuristic, the grid evaluates the exact same
 * model used by its witness signal itinerary. A B→A (throat) → B (light)
 * complete trip certifies loop iff it arrives before original departure.
 */
import {ageDeficitFraction,createCausality,sendSignal} from './causality.js';

export const ATLAS_MIN_DISTANCE=.3;
export const ATLAS_MAX_SPEED=.98;
export const ATLAS_DEFAULTS=Object.freeze({
 distance:3,speed:.85,duration:34,throatTime:.55,maxDistance:9
});
const isFiniteNumber=Number.isFinite;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
function bounded(value,lo,hi,name){
 if(!isFiniteNumber(value)||value<lo||value>hi)throw Error('Неверный параметр: '+name);
 return value;
}
export function atlasParams(input={}){
 const distance=bounded(input.distance??ATLAS_DEFAULTS.distance,.3,12,'расстояние');
 const speed=bounded(input.speed??ATLAS_DEFAULTS.speed,0,.98,'скорость');
 const duration=bounded(input.duration??ATLAS_DEFAULTS.duration,4,160,'длительность');
 const throatTime=bounded(input.throatTime??ATLAS_DEFAULTS.throatTime,0,5,'задержка');
 const maxDistance=bounded(input.maxDistance??ATLAS_DEFAULTS.maxDistance,1,12,'масштаб');
 return {distance,speed,duration,throatTime,maxDistance};
}
export function ageLag(speed,duration){
 bounded(speed,0,.98,'скорость');bounded(duration,4,160,'длительность');
 return duration*ageDeficitFraction(speed);
}
export function chronologyMargin({speed,distance,duration,throatTime}){
 return ageLag(speed,duration)-distance-throatTime;
}
export function chronologyBoundary({speed,duration,throatTime}){
 return ageLag(speed,duration)-throatTime;
}
/** Smallest admissible β with lag ≥ distance + delay.
 * null: impossible at the present trip duration even at 0.98c. */
export function criticalSpeed(params){
 const p=atlasParams(params);
 const target=p.distance+p.throatTime;
 if(ageLag(.98,p.duration)+1e-10<target)return null;
 let lo=0,hi=.98;
 for(let i=0;i<65;i++){
  const mid=(lo+hi)/2;
  if(ageLag(mid,p.duration)>=target)hi=mid;else lo=mid;
 }
 return hi;
}
/** Required trip duration; may lie outside the UI range [4,160]. */
export function criticalDuration(params){
 const p=atlasParams(params);
 const fraction=ageDeficitFraction(p.speed);
 if(fraction<1e-15)return null;
 return (p.distance+p.throatTime)/fraction;
}
/** True model check, not just a positive color on a graph. */
export function certifyPoint(params){
 const p=atlasParams(params),model=createCausality(p);
 const launchAt=model.duration+model.maximumDistance+20;
 const signal=sendSignal(model,{origin:'B',first:'tunnel',time:launchAt});
 const margin=chronologyMargin(p);
 if(Math.abs(margin-signal.chronologyMargin)>1e-7)
  throw Error('Несовпадение аналитического порога и физического маршрута сигнала');
 const betaThreshold=criticalSpeed(p),neededTime=criticalDuration(p);
 return {params:p,lag:model.offset,margin,requiredDistance:ageLag(p.speed,p.duration)-p.throatTime,
  requiredSpeed:betaThreshold,requiredDuration:neededTime,
  possible:signal.loop,signal,
  assumptions:{
   kinematics:'special relativity in a flat external frame, c=1',
   identification:'prescribed equal-mouth-proper-time gluing, not derived from Einstein equations',
   certificate:'B -> A via hypothetical throat -> B via exterior null propagation'
  }};
}
/** Continuous chronology threshold curve in the speed–separation plane.
 * y=β, x=D; modelled area lies strictly to the left of the contour.
 */
export function sampleBoundary(params,count=241){
 const p=atlasParams(params);
 if(!Number.isInteger(count)||count<5||count>1001)throw Error('Неверная выборка');
 const curve=[];
 for(let i=0;i<count;i++){
  const speed=ATLAS_MAX_SPEED*i/(count-1);
  curve.push({speed,criticalDistance:chronologyBoundary({...p,speed})});
 }
 return curve;
}
/** A compact grid carrying actual signed time margins, not a decorative heatmap.
 * Note: θ changes only along rows. Simpson integral is computed once per row.
 */
export function phaseMap(params,width=161,height=121){
 const p=atlasParams(params);
 if(!Number.isInteger(width)||width<16||width>401||
    !Number.isInteger(height)||height<16||height>401)
  throw Error('Недопустимое разрешение фазовой карты');
 const margins=new Float32Array(width*height),fractions=new Float64Array(height);
 let positive=0,mostNegative=Infinity,mostPositive=-Infinity;
 for(let iy=0;iy<height;iy++){
  const speed=ATLAS_MAX_SPEED*(1-iy/(height-1));
  const deficit=ageDeficitFraction(speed),lag=p.duration*deficit;
  fractions[iy]=deficit;
  for(let ix=0;ix<width;ix++){
   const distance=ATLAS_MIN_DISTANCE+(p.maxDistance-ATLAS_MIN_DISTANCE)*ix/(width-1);
   const margin=lag-distance-p.throatTime;
   margins[iy*width+ix]=margin;
   mostNegative=Math.min(mostNegative,margin);mostPositive=Math.max(mostPositive,margin);
   if(margin>1e-8)positive++;
  }
 }
 return {width,height,params:p,margins,deficits:fractions,
  positive,negative:width*height-positive,minimum:mostNegative,maximum:mostPositive};
}
export function evaluateAtUV(grid,u,v){
 const x=clamp(u,0,1),y=clamp(v,0,1);
 const speed=ATLAS_MAX_SPEED*(1-y);
 const distance=ATLAS_MIN_DISTANCE+(grid.params.maxDistance-ATLAS_MIN_DISTANCE)*x;
 return {speed,distance,margin:chronologyMargin({...grid.params,speed,distance})};
}
/** A comparison between two physically real signal itineraries under the
 * same hypothetical gluing, useful for experiment logs and exporting.
 */
export function comparePoints(points){
 if(!Array.isArray(points)||points.length<1||points.length>8)throw Error('Некорректное число опытов');
 return points.map((p,index)=>{
  const x=certifyPoint(p);
  return {index:index+1,...x,deltaFromThreshold:x.margin,
   label:x.possible?'ПЕТЛЯ':'БЕЗ ПЕТЛИ'};
 });
}
