// Physically coupled swinging panel meshes. Each leaf uses the exact segment
// returned by rogue-doors.mjs, also used by player/monster collision and rays.
import {doorSegment} from './rogue-doors.mjs';
import {TILE} from './rogue-world.mjs';
const S=TILE;
function quad(o,a,b,c,d,col,n,mat=6){for(const p of [a,b,c,a,c,d])o.push(...p,...col,...n,mat)}
function segmentSlab(o,a,b,y0,y1,halfWidth,col,mat){
 const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
 const nx=-dz/len,nz=dx/len;
 const left0=[a.x+nx*halfWidth,y0,a.z+nz*halfWidth],left1=[b.x+nx*halfWidth,y0,b.z+nz*halfWidth],
  left2=[b.x+nx*halfWidth,y1,b.z+nz*halfWidth],left3=[a.x+nx*halfWidth,y1,a.z+nz*halfWidth];
 const right0=[a.x-nx*halfWidth,y0,a.z-nz*halfWidth],right1=[b.x-nx*halfWidth,y0,b.z-nz*halfWidth],
  right2=[b.x-nx*halfWidth,y1,b.z-nz*halfWidth],right3=[a.x-nx*halfWidth,y1,a.z-nz*halfWidth];
 quad(o,left0,left1,left2,left3,col,[nx,0,nz],mat);
 quad(o,right1,right0,right3,right2,col,[-nx,0,-nz],mat);
 quad(o,left3,left2,right2,right3,col,[0,1,0],mat);
 quad(o,right0,right1,left1,left0,col,[0,-1,0],mat);
 quad(o,left0,left3,right3,right0,col,[-dx/len,0,-dz/len],mat);
 quad(o,left1,right1,right2,left2,col,[dx/len,0,dz/len],mat)
}
function between(a,b,t){return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}}
export function rogueDoorMesh(out,world,player){
 for(const c of world.nearby(player.x,player.z,16)){
  for(const door of c.doors){
   if(Math.hypot(door.x+.5-player.x,door.z+.5-player.z)>15)continue;
   const state=world.doorState(door,c),segment=doorSegment(door,state.angle);
   const a={x:segment.a.x*S,z:segment.a.z*S},b={x:segment.b.x*S,z:segment.b.z*S};
   const tint=(Math.abs(door.x*13+door.z*7)%3);
   const timber=tint===0?[.41,.27,.16]:tint===1?[.48,.33,.20]:[.33,.24,.16];
   const panel=tint===1?[.54,.39,.24]:[.46,.31,.19];
   const brass=[.68,.51,.29],dark=[.27,.18,.13];
   // Solid opaque leaf with physically collidable thickness.
   segmentSlab(out,a,b,.028,2.18,.043,timber,6);
   // Two recessed rectangular wooden panels, readable at 45°.
   for(const side of [-1,1]){
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
    const nx=-dz/len*side,nz=dx/len*side;
    for(const [low,top] of [[.28,.84],[1.08,1.85]]){
     const p=between(a,b,.16),q=between(a,b,.84),off=.045;
     const aa={x:p.x+nx*off,z:p.z+nz*off},bb={x:q.x+nx*off,z:q.z+nz*off};
     segmentSlab(out,aa,bb,low,top,.007,panel,6);
     segmentSlab(out,between(aa,bb,.07),between(aa,bb,.93),low+.05,top-.05,.009,dark,6)
    }
    // Two metal plates, a roundish latch and short physical handle.
    const center=between(a,b,.78),off=.048;
    const p={x:center.x+nx*off,z:center.z+nz*off};
    segmentSlab(out,between(p,b,.0),between(p,b,.045),1.02,1.22,.018,brass,9);
    const knobA={x:p.x,z:p.z},knobB={x:p.x+nx*.115,z:p.z+nz*.115};
    segmentSlab(out,knobA,knobB,1.13,1.17,.017,brass,9)
   }
   // Hinge rivets and a solid iron corner cap. They rotate with the leaf.
   const base=between(a,b,.03),tip=between(a,b,.10);
   for(const y of [.30,1.74])segmentSlab(out,base,tip,y,y+.095,.058,[.50,.45,.33],9)
  }
 }
}
