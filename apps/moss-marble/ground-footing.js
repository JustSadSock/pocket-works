// Sparse, terrain-adherent organic transition at rock/stump feet.
// Pure decorative mesh; physical walls/props and saved game state untouched.
// No artificial halo, rings or tall, spear-shaped blades.
const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function hash(a,b,seed){
  const v=Math.sin(a*12.9898+b*78.233+seed*37.719)*43758.5453;
  return v-Math.floor(v);
}
function inside(x,y,outline){
  if(!outline||outline.length<3)return false;
  let flag=false;
  for(let i=0,j=outline.length-1;i<outline.length;j=i++){
    const a=outline[i],b=outline[j];
    if((a.y>y)!==(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)flag=!flag;
  }
  return flag;
}
function mixColor(a,b,t){
  return [a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t,a[2]*(1-t)+b[2]*t,1];
}
function safe(field,outline,x,y,surface){
  return inside(x,y,outline)&&field.surfaceAt(x,y)===surface;
}
export function planGroundFooting(level, x, y, radius, seed, kind='rock', palette={}, maxPatches=3) {
  const field=level?.course18?.field, outline=level?.outline;
  if(!field?.heightAt||!field?.surfaceAt||!field?.colorAt||!field?.normalAt||!outline?.length)return [];
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(radius)||radius<=0)return [];
  const patches=[];
  const soil=palette.soil||[.17,.13,.08,1];
  const moss=palette.rockMoss||[.23,.42,.20,1];
  const wanted=Math.min(4,Math.max(0,Math.floor(maxPatches)));
  const offset=hash(seed,3,13)*TAU;
  for(let i=0;i<11&&patches.length<wanted;i++){
    const angle=offset+TAU*(i/11+.018*(hash(i,seed,17)-.5));
    const ux=Math.cos(angle),uy=Math.sin(angle);
    const tx=-uy,ty=ux;
    const root=radius*(.93+hash(i,seed,19)*.14);
    const cx=x+ux*root,cy=y+uy*root;
    const type=field.surfaceAt(cx,cy);
    if(type!=='grass'&&type!=='moss')continue;
    // Leave the cup and tee readable even when a rock sits close to them.
    if(Math.hypot(cx-level.start.x,cy-level.start.y)<76)continue;
    if(Math.hypot(cx-level.hole.x,cy-level.hole.y)<(level.hole.r||30)+49)continue;
    const width=clamp(radius*(.13+hash(i,seed,23)*.09),4.6,15.2);
    const depth=clamp(radius*(.070+hash(i,seed,29)*.042),2.6,8.0);
    const samples=8;
    const points=[];
    for(let j=0;j<samples;j++){
      const a=TAU*j/samples;
      const irregular=.85+.13*Math.sin(a*3+i*1.9)+.05*hash(j,i,seed);
      const along=Math.cos(a)*width*irregular;
      const across=Math.sin(a)*depth*irregular;
      const px=cx+tx*along+ux*across;
      const py=cy+ty*along+uy*across;
      if(!safe(field,outline,px,py,type)){points.length=0;break;}
      points.push([px,py,field.heightAt(px,py)+.48]);
    }
    if(points.length!==samples)continue;
    const isMoss=kind==='rock'?hash(i,seed,31)>.26:hash(i,seed,31)>.48;
    const groundColor=field.colorAt(cx,cy,field.heightAt(cx,cy),field.normalAt(cx,cy));
    const pigment=isMoss
      ?mixColor(groundColor,moss,type==='moss'?.53:.36)
      :mixColor(groundColor,soil,kind==='stump'?.32:.23);
    const tint=pigment.map((v,k)=>k<3?clamp(v*(.94+hash(i,seed,37)*.08),0,1):1);
    patches.push({
      x:cx,y:cy,kind:isMoss?'moss':'loam',surface:type,
      center:[cx,cy,field.heightAt(cx,cy)+.50],
      points,normal:field.normalAt(cx,cy),color:tint
    });
  }
  return patches;
}
export function appendGroundFooting(mesh,patches) {
  for(const patch of patches){
    const {center,points,color,normal,kind}=patch;
    for(let j=0;j<points.length;j++){
      mesh.triangle(center,points[j],points[(j+1)%points.length],
        color,kind==='moss'?7:0,normal);
    }
  }
}
