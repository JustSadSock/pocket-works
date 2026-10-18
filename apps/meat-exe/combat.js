// Combat hit resolution is shared by touch, mouse and gamepad: no render-dependent hit tests.
const SIZE={crawler:.56,spitter:.56,brute:.79,heart:1.18};
const HEIGHT={crawler:.89,spitter:.89,brute:.92,heart:1.52};
export function directionFromAim(yaw,pitch){
  const c=Math.cos(pitch);
  return {x:-Math.sin(yaw)*c,y:Math.sin(pitch),z:-Math.cos(yaw)*c};
}
export function pelletAim(yaw,pitch,index,count,spread){
  if(index===0||count===1)return directionFromAim(yaw,pitch);
  // Repeatable spiral keeps the central pellet true to the crosshair.
  const a=(index-1)*2.399963229728653,r=Math.sqrt(index/(count-1))*spread;
  return directionFromAim(yaw+Math.cos(a)*r,pitch+Math.sin(a)*r);
}
export function hitRay(origin,dir,enemies,isFloor,range=15){
  const norm=Math.hypot(dir.x,dir.y,dir.z);
  if(!Number.isFinite(norm)||norm<.00001)return null;
  const d={x:dir.x/norm,y:dir.y/norm,z:dir.z/norm};
  let wall=range,last={x:origin.x,y:origin.y,z:origin.z};
  // Small enough steps to stop at cell boundaries and never pass through a membrane.
  for(let t=.085;t<=range+.085;t+=.085){
    const dist=Math.min(range,t),x=origin.x+d.x*dist,y=origin.y+d.y*dist,z=origin.z+d.z*dist;
    if(y<.07||y>2.7||!isFloor(x,z)){wall=dist;break;}
    last={x,y,z};if(dist===range)break;
  }
  let chosen=null,near=wall;
  for(const e of enemies){
    if(!e||e.hp<=0)continue;
    const cy=HEIGHT[e.type]??.89,r=SIZE[e.type]??.56;
    const ex=e.x-origin.x,ey=cy-origin.y,ez=e.z-origin.z;
    const projected=ex*d.x+ey*d.y+ez*d.z;
    const discriminant=projected*projected-(ex*ex+ey*ey+ez*ez-r*r);
    if(discriminant<0)continue;
    const hit=Math.max(0,projected-Math.sqrt(discriminant));
    if(hit<near-0.035&&hit<=range){near=hit;chosen=e;}
  }
  if(chosen)return {kind:'flesh',enemy:chosen,distance:near,point:{x:origin.x+d.x*near,y:origin.y+d.y*near,z:origin.z+d.z*near},direction:d};
  if(wall<range)return {kind:'wall',enemy:null,distance:wall,point:last,direction:d};
  return {kind:'miss',enemy:null,distance:range,point:{x:origin.x+d.x*range,y:origin.y+d.y*range,z:origin.z+d.z*range},direction:d};
}
export function staggerDuration(type){
  return type==='heart'?.055:type==='brute'?.10:type==='spitter'?.19:.16;
}
