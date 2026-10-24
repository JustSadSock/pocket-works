// Visual-only adaptive stations for shoreline and hill shoulder geometry.
// The true field, collision geometry and the bank endpoints never change.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const lerp=(a,b,t)=>a+(b-a)*t;
function weightOf(info){return info?.type==='grass'?0:clamp(Number(info?.weight)||0,0,1);}
function point(a,b,t){return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)};}
export function planTerrainLanes(field,left,right,columns=29,options={}) {
  if(!field?.surfaceInfoAt||!field?.gradientAt||!left||!right)
    return Array.from({length:columns},(_,i)=>i/(columns-1));
  const intervals=64, weights=[], edgeSharpness=[];
  const xy=Array.from({length:intervals+1},(_,i)=>point(left,right,i/intervals));
  const states=xy.map(p=>{
    const info=field.surfaceInfoAt(p.x,p.y),gradient=field.gradientAt(p.x,p.y);
    return {type:info.type,weight:weightOf(info),slope:clamp(Math.hypot(gradient.x,gradient.y),0,1.2)};
  });
  // Density peaks where shore pigments turn, and on convex hill shoulders.
  // Adjacent row warps stay restrained; quads retain monotonic topology.
  for(let k=0;k<intervals;k++){
    const a=states[k],b=states[k+1];
    const shoreline=Math.abs(b.weight-a.weight)
      +((a.type!==b.type)?Math.min(a.weight,b.weight)*.35:0);
    const slope=Math.max(a.slope,b.slope);
    const change=Math.abs(a.slope-b.slope);
    const density=1+clamp(shoreline*4.6,0,1.9)+clamp(change*1.4,0,.5)
      +clamp(slope*.18,0,.18);
    weights.push(density);
    edgeSharpness.push(shoreline);
  }
  const cumulative=[0];
  for(const w of weights)cumulative.push(cumulative.at(-1)+w);
  const total=cumulative.at(-1);
  const requested=Array.from({length:columns},(_,i)=>{
    const uniform=i/(columns-1);
    if(i===0||i===columns-1)return uniform;
    const target=uniform*total;
    let k=0;
    while(k<intervals-1&&cumulative[k+1]<target)k++;
    const range=cumulative[k+1]-cumulative[k]||1;
    const adapted=(k+clamp((target-cumulative[k])/range,0,1))/intervals;
    // Strong enough to reveal a shoreline's true physical curve, but
    // bounded to prevent screen-space diagonal stretching near banks.
    return clamp(lerp(uniform,adapted,.68),uniform-.026,uniform+.026);
  });
  // Enforce exact endpoints and a sensible minimum to avoid thin triangles.
  const minStep=.52/(columns-1);
  for(let i=1;i<columns-1;i++)
    requested[i]=Math.max(requested[i],requested[i-1]+minStep);
  for(let i=columns-2;i>0;i--)
    requested[i]=Math.min(requested[i],requested[i+1]-minStep);
  requested[0]=0;requested[columns-1]=1;
  return requested;
}
export function sampleVisualRelief(field,x,y) {
  // Sample the same physical height function at the denser, contour-aware
  // stations. No z-offsets or geometry that could appear to float.
  return field.heightAt(x,y);
}
