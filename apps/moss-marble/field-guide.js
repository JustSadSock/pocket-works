// Field-guide instruments operate on the physical route, not screen pixels.
// They never alter seed, collider, stroke count, or simulation state.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function routePosition(centerline, point) {
  if(!Array.isArray(centerline)||centerline.length<2||!point)return {progress:0,distance:0,remaining:0};
  let total=0,closest={dist2:Infinity,along:0},segments=[];
  for(let i=1;i<centerline.length;i++){
    const a=centerline[i-1],b=centerline[i],dx=b.x-a.x,dy=b.y-a.y;
    const len=Math.hypot(dx,dy);
    segments.push({a,b,dx,dy,len,start:total});total+=len;
  }
  for(const {a,dx,dy,len,start} of segments) {
    if(len<1e-5)continue;
    const t=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/(len*len),0,1);
    const x=a.x+dx*t,y=a.y+dy*t,d2=(point.x-x)**2+(point.y-y)**2;
    if(d2<closest.dist2)closest={dist2:d2,along:start+len*t};
  }
  const along=Number.isFinite(closest.dist2)?closest.along:0;
  return {progress:total?clamp(along/total,0,1):0,distance:along,remaining:Math.max(0,total-along)};
}

export function strengthLabel(power) {
  const p=clamp(Number(power)||0,0,1);
  return p<.055?'Потяни дальше':p<.30?'Мягкий удар':p<.65?'Средний удар':p<.88?'Сильный удар':'Максимальный удар';
}

export function fitAreaInsets(width,height,topHUDHeight=0,bottomControlHeight=0){
  const portrait=height>=width*1.20;
  const compact=height<575;
  const minTop=portrait?(compact?72:92):(compact?52:76);
  const minBottom=portrait?(compact?80:116):(compact?50:80);
  const top=clamp(Math.max(minTop,topHUDHeight+12),0,Math.max(0,height*.29));
  const bottom=clamp(Math.max(minBottom,bottomControlHeight+14),0,Math.max(0,height*.30));
  return {
    top,bottom,
    width:Math.max(1,width-(portrait?30:44)),
    height:Math.max(1,height-top-bottom),
    centerX:width*.5,
    centerY:top+(height-top-bottom)*.5
  };
}
