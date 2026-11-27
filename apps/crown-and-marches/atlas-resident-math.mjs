// Framebuffer coordinates: x right, y up. No camera quantization.
export function projectedPixel(p,view,tilt,viewport){
 const cs=Math.sqrt(1-tilt*tilt),[x,y,z]=p,datum=view.datum??0;
 return [viewport.x+viewport.width/2+(x-view.x)*view.s,viewport.y+viewport.height/2-((y-view.y)*cs-(z-datum)*tilt)*view.s,-((y-view.y)*tilt+(z-datum)*cs)/160];
}
export function residentCrop(anchor,view,tilt,viewport,pad,epsilon=1e-7){
 if(anchor.s!==view.s||anchor.datum!==view.datum||!Number.isFinite(view.s)||view.s<=0)return null;
 const cs=Math.sqrt(1-tilt*tilt),dx=(view.x-anchor.x)*view.s,dy=-(view.y-anchor.y)*view.s*cs,ix=Math.round(dx),iy=Math.round(dy);
 if(Math.abs(dx-ix)>epsilon||Math.abs(dy-iy)>epsilon||Math.abs(ix)>pad||Math.abs(iy)>pad)return null;
 return {x:pad+ix,y:pad+iy,width:viewport.width,height:viewport.height,dx,dy};
}
export function depthSafe(bounds,range,view,tilt){
 const cs=Math.sqrt(1-tilt*tilt),datum=view.datum??0;
 if(!range||!Number.isFinite(range.minZ)||!Number.isFinite(range.maxZ))return false;
 for(const y of [bounds[1],bounds[3]])for(const z of [range.minZ,range.maxZ])if(Math.abs((y-view.y)*tilt+(z-datum)*cs)>=159)return false;
 return true;
}
