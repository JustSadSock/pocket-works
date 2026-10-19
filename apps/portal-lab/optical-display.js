/**
 * SHOV v1.1 optical survey.
 * All celestial reference lines are attached to the source sky in global
 * spherical coordinates. The wormhole map moves them ONLY by null geodesics
 * already computed in optics.js; it never paints a fake lensing ring.
 */
const TAU=2*Math.PI,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const SKY_MODES=Object.freeze(["stars","coordinates","combined"]);
export const CAMERA_PRESETS=Object.freeze(["throat","oblique","wide","away"]);
export function skyCoordinates(dir){
 const az=Math.atan2(dir[1],dir[0]);
 const lat=Math.asin(clamp(dir[2],-1,1));
 return {az,lat};
}
function edgeDistance(x,period){
 const n=Math.round(x/period);
 return Math.abs(x-n*period);
}
/** Returns luminosity in [0,1] of meridian / parallel source guides.
 * Angular rather than pixel spacing keeps guide locations physical under
 * any camera FOV, aspect ratio or gravitational magnification.
 */
export function sourceGrid(dir,{stepDegrees=15,lineDegrees=.24}={}){
 if(!Array.isArray(dir)||dir.length!==3||!dir.every(Number.isFinite))
  throw Error("Некорректное направление источника");
 if(!Number.isFinite(stepDegrees)||stepDegrees<2||stepDegrees>90||
    !Number.isFinite(lineDegrees)||lineDegrees<=0||lineDegrees>1)
  throw Error("Некорректная угловая сетка");
 const {az,lat}=skyCoordinates(dir);
 const step=stepDegrees*Math.PI/180;
 const thick=lineDegrees*Math.PI/180;
 // Meridians shrink near poles. This prevents lines from looking thicker
 // on the spherical source as latitude increases.
 const eMeridian=edgeDistance(az,step)*Math.max(.035,Math.abs(Math.cos(lat)));
 const eParallel=edgeDistance(lat,step);
 const a=1-clamp(eMeridian/thick,0,1);
 const b=1-clamp(eParallel/thick,0,1);
 return Math.max(a,b);
}
export function paintSurvey(rgb,grid,mode,region=0){
 if(!SKY_MODES.includes(mode))throw Error("Неизвестный оптический режим");
 if(mode==="stars")return rgb;
 const g=clamp(grid,0,1),alpha=mode==="combined"?.67*g:g;
 const sky=region===0?[149,206,190]:[232,187,148];
 const paper=region===0?[12,31,36]:[32,23,31];
 const target=mode==="coordinates"?[
  paper[0]+(sky[0]-paper[0])*g,
  paper[1]+(sky[1]-paper[1])*g,
  paper[2]+(sky[2]-paper[2])*g
 ]:rgb.map((v,i)=>v*(1-alpha)+sky[i]*alpha);
 return target.map(x=>clamp(Math.round(x),0,255));
}
export function referenceDirection(pixel){
 if(!Array.isArray(pixel)||pixel.length!==3)return null;
 return pixel;
}
export function comparisonSplit(width,fraction){
 if(!Number.isFinite(width)||width<=0)throw Error("Некорректная ширина кадра");
 return clamp(fraction,0,1)*width;
}
export function skyStats({total,regionA,regionB,unresolved}){
 if(!Number.isFinite(total)||total<=0||
    [regionA,regionB,unresolved].some(n=>!Number.isInteger(n)||n<0)||
    regionA+regionB+unresolved!==total)
  throw Error("Неверные статистические отсчёты");
 const percent=n=>100*n/total;
 return {regionA:percent(regionA),regionB:percent(regionB),
  unresolved:percent(unresolved)};
}
/** Model-invariant plot points: the exact same R(l), N(l) that trace rays.
 * This is a metric profile, NOT a Euclidean embedding or an observed photo.
 */
export function geometryTrace(metric,geometry,{samples=121,span=4}={}){
 if(!Number.isInteger(samples)||samples<12||samples>800||!Number.isFinite(span)||span<=0)throw Error('Некорректная карта геометрии');
 const output=[];
 for(let i=0;i<samples;i++){
  const u=-span+2*span*i/(samples-1),g=geometry(metric.a*u,metric);
  if(![g.R,g.N].every(Number.isFinite))throw Error('Метрика содержит разрыв');
  output.push({u,R:g.R/metric.a,N:g.N});
 }
 return output;
}
