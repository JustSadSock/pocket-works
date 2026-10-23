// Deterministic, physical slope-aligned turf fibers. Pure data: no DOM,
// no animation state and no changes to the course or ball physics.
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
function hash(a,b,seed){
  const v = Math.sin(a * 12.9898 + b * 78.233 + seed * 37.719) * 43758.5453;
  return v - Math.floor(v);
}
function sampleRoute(line,t){
  if(!line || line.length < 2) return null;
  const f=clamp(t,0,1)*(line.length-1);
  const index=Math.min(line.length-2,Math.floor(f));
  const alpha=f-index,a=line[index],b=line[index+1];
  const tx=b.x-a.x,ty=b.y-a.y,mag=Math.hypot(tx,ty)||1;
  return {x:a.x+tx*alpha,y:a.y+ty*alpha,nx:-ty/mag,ny:tx/mag};
}
function pointInside(x,y,polygon){
  if(!polygon || polygon.length<3) return false;
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.y>y)!==(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
export function sampleSlopeFibers(level, field, maxCount=96){
  if(!field?.gradientAt || !field?.heightAt || !field?.surfaceAt || !level?.centerline) return [];
  const seed=Number(level.endless?.seed || level.id || 1);
  const fibers=[];
  const count=260;
  for(let i=0;i<count && fibers.length<maxCount;i++){
    const route=sampleRoute(level.centerline,.045+.91*hash(i,seed,71));
    if(!route) continue;
    const side=(hash(i,seed,79)*2-1)*.83;
    const x=route.x+route.nx*side*164;
    const y=route.y+route.ny*side*164;
    if(!pointInside(x,y,level.outline)) continue;
    const material=field.surfaceAt(x,y);
    if(material!=='grass' && material!=='moss') continue;
    const gradient=field.gradientAt(x,y);
    const slope=Math.hypot(gradient.x,gradient.y);
    if(!Number.isFinite(slope) || slope<.085 || slope>1.35) continue;
    const length=8+hash(i,seed,87)*9;
    const dx=-gradient.x/slope,dy=-gradient.y/slope;
    // Neither mineral flecks nor artificial arrows: a few slanted blades
    // follow the actual fall-line and are ignored by collisions.
    const endX=x+dx*length,endY=y+dy*length;
    if(!pointInside(endX,endY,level.outline) || field.surfaceAt(endX,endY)!==material) continue;
    fibers.push({x,y,endX,endY,slope,light:dx*(-.55)+dy*(-.43)>0});
  }
  return fibers;
}
