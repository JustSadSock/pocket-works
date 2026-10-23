// Pure visual-only wooden barrier profile. The physical collider stays in
// the authored/procedural wall segment, unchanged by this geometry.
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const lerp=(a,b,t)=>a+(b-a)*t;
export function buildWoodBarrierProfile(wall,heightAt) {
  const dx=wall.bx-wall.ax,dy=wall.by-wall.ay;
  const length=Math.hypot(dx,dy);
  if(!Number.isFinite(length)||length<.01)return {length:0,half:0,segments:0,stations:[]};
  const nx=-dy/length,ny=dx/length;
  const half=Math.max(4,Number(wall.thickness||18)*.5);
  const rise=clamp(Number(wall.visualHeight||28),14,56);
  const segments=clamp(Math.ceil(length/76),1,8);
  const stations=[];
  for(let i=0;i<=segments;i++){
    const t=i/segments, x=lerp(wall.ax,wall.bx,t),y=lerp(wall.ay,wall.by,t);
    // Each side of the rail meets the real field height; this removes the
    // floating triangle of space under a long rail on an uneven hillside.
    const lX=x+nx*half,lY=y+ny*half,rX=x-nx*half,rY=y-ny*half;
    const leftGround=heightAt(lX,lY),rightGround=heightAt(rX,rY);
    const centerGround=heightAt(x,y);
    const capHeight=centerGround+rise;
    const shoulderHeight=capHeight-3.1;
    stations.push({
      t,x,y,ground:centerGround,
      leftGround,rightGround,
      footL:[lX,lY,leftGround-1.8],
      footR:[rX,rY,rightGround-1.8],
      shoulderL:[lX,lY,shoulderHeight],
      shoulderR:[rX,rY,shoulderHeight],
      crownL:[x+nx*half*.73,y+ny*half*.73,capHeight],
      crownR:[x-nx*half*.73,y-ny*half*.73,capHeight]
    });
  }
  return {length,half,segments,stations};
}
