// Optical terrain finish only. Physical heights, friction and masks unchanged.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/Math.max(b-a,1e-6),0,1);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
function inside(x,y,polygon){
  let v=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)v=!v;
  }
  return v;
}
// The rim must not use samples from the void as a height gradient. The
// one-sided derivative at the edge has the same orientation as the interior.
export function visualTerrainNormal(heightAt,outline,x,y,e=2.25){
  const z=heightAt(x,y);
  const derivative=(dx,dy)=>{
    const a=inside(x+dx*e,y+dy*e,outline),b=inside(x-dx*e,y-dy*e,outline);
    if(a&&b)return (heightAt(x+dx*e,y+dy*e)-heightAt(x-dx*e,y-dy*e))/(2*e);
    if(a)return (heightAt(x+dx*e,y+dy*e)-z)/e;
    if(b)return (z-heightAt(x-dx*e,y-dy*e))/e;
    return 0;
  };
  const gx=derivative(1,0),gy=derivative(0,1),d=Math.hypot(gx,gy,1)||1;
  return [-gx/d,-gy/d,1/d];
}
// A narrow and irregular pigment transition is more convincing than a
// distinct ellipse/stripe. No changes to surfaceAt() or physical masks.
export function finishTerrainPigment(grass,material,info,broad,medium,height,normal){
  const weight=clamp(Number(info?.weight)||0,0,1);
  const wave=(broad-.5)*.036+(medium-.5)*.015;
  const t=smooth(.025,.975,clamp(weight+wave,0,1));
  const out=grass.map((v,i)=>lerp(v,material[i],t));
  if(info?.type==='water'){
    const damp=smooth(.13,.50,weight)*(1-smooth(.67,.98,weight));
    const tint=damp*(.020+.015*broad);
    out[0]*=1-tint;
    out[1]*=1-tint*.57;
    out[2]=clamp(out[2]*(1+tint*.22),0,1);
  }
  // Directional shader light already shades slopes. Avoid an excessive
  // second baked lighting pass making hills look faceted or brown.
  const sunlight=(normal[0]*.55-normal[1]*.43)*.29;
  const elevation=clamp((height-9)/44,-.48,1);
  const steep=Math.hypot(normal[0],normal[1]);
  const shade=clamp(.995+sunlight+elevation*.068+steep*.013,.85,1.16);
  return out.map((v,i)=>i===3?clamp(v,0,1):clamp(v*shade,0,1));
}
