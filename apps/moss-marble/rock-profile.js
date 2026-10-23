// Reproducible, terrain-bound rock surface. Pure geometry, no physics edits.
// Every footprint stays inside the actual circular collision boundary.
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash(a,b,c=0){
  const v=Math.sin(a*12.9898+b*78.233+c*37.719)*43758.5453;
  return v-Math.floor(v);
}
export function planGroundedRock(x,y,collisionRadius,seed,heightAt) {
  const radius=Math.max(8,Number(collisionRadius)||8);
  const sideCount=14;
  const centerGround=heightAt(x,y);
  const rise=radius*(.75+hash(seed,18)*.14);
  const majorAngle=hash(seed,51)*TAU;
  const upperDrift=[(hash(seed,47)-.5)*radius*.10,(hash(seed,49)-.5)*radius*.10];
  // A broad, irregular shoulder replaces the old identical cone profile.
  const profiles=[
    {width:.92,lift:-2.3,offset:0},
    {width:.97,lift:.16,offset:.01},
    {width:.79,lift:.49,offset:.04},
    {width:.52,lift:.79,offset:.08},
    {width:.25,lift:.97,offset:.11}
  ];
  // Shared angular silhouette per station avoids zigzag triangulation and
  // the visually repetitive perfectly concentric stone cylinders.
  const circum=Array.from({length:sideCount},(_,j)=>{
    const a=j/sideCount*TAU;
    return .968+Math.sin(a*3+majorAngle)*.017
      +Math.sin(a*5-majorAngle*.8)*.013
      +Math.sin(a*2+majorAngle*.6)*.010;
  });
  const rings=profiles.map((p,i)=>Array.from({length:sideCount},(_,j)=>{
    const angle=j/sideCount*TAU;
    const localRadius=radius*p.width*circum[j];
    const px=x+Math.cos(angle)*localRadius+upperDrift[0]*p.offset;
    const py=y+Math.sin(angle)*localRadius+upperDrift[1]*p.offset;
    const localGround=heightAt(px,py);
    // Ground-level ring follows terrain at each corner. Higher rings keep
    // a stable physical rise and approach the common crest height.
    const blend=p.lift<=0?0:p.lift;
    const surfaceFloor=localGround*(1-blend)+centerGround*blend;
    const subtleRelief=radius*.035*Math.sin(angle*2+majorAngle+i*.25)*(i/4);
    const z=i===0?localGround-2.3:surfaceFloor+rise*p.lift+subtleRelief;
    return [px,py,z];
  }));
  const top=[x+upperDrift[0]*.16,y+upperDrift[1]*.16,centerGround+rise*.99];
  return {x,y,radius,seed,sideCount,centerGround,rise,rings,top};
}
