// Meaningful corridor silhouettes for memory-altered apartments.
// All additions attach to new, walkable v3 alcoves. Nothing below 1.85m
// protrudes into the path of a person, so navigation stays authoritative.
import {SECTOR,TILE} from './rogue-world.mjs';
const S=TILE;
function face(o,a,b,c,d,color,n,m=6){for(const p of [a,b,c,a,c,d])o.push(...p,...color,...n,m)}
function box(o,x,y,z,w,h,d,color,m=6){
 if(w<=0||h<=0||d<=0)return;
 const a=x-w/2,b=x+w/2,c=z-d/2,e=z+d/2,t=y+h;
 face(o,[a,y,c],[b,y,c],[b,t,c],[a,t,c],color,[0,0,-1],m);
 face(o,[b,y,e],[a,y,e],[a,t,e],[b,t,e],color,[0,0,1],m);
 face(o,[a,y,e],[a,y,c],[a,t,c],[a,t,e],color,[-1,0,0],m);
 face(o,[b,y,c],[b,y,e],[b,t,e],[b,t,c],color,[1,0,0],m);
 face(o,[a,t,c],[b,t,c],[b,t,e],[a,t,e],color,[0,1,0],m);
 face(o,[a,y,e],[b,y,e],[b,y,c],[a,y,c],color,[0,-1,0],m)
}
export function appendAlcoveSilhouette(out,c,bay){
 const x=(c.cx*SECTOR+bay.x+.5)*S,z=(c.cz*SECTOR+bay.z+.5)*S;
 const dx=bay.dx,dz=bay.dz,alongX=dx!==0;
 const timber=[[.38,.26,.17],[.36,.31,.25],[.46,.34,.22]][bay.kind],
      pale=[[.61,.51,.37],[.51,.53,.43],[.64,.55,.43]][bay.kind];
 const entryX=x-dx*S*.53,entryZ=z-dz*S*.53;
 const width=alongX?[.23,1.22]:[1.22,.23];
 // A lowered upper beam across a narrow alcove, not an arbitrary glowing
 // portal overlay: its solid upper mass visibly changes the cross-section.
 box(out,entryX,2.10,entryZ,width[0],.41,width[1],timber,6);
 box(out,entryX,2.07,entryZ,alongX?.25:1.24,.055,alongX?1.24:.25,pale,8);
 // Hard side cheeks follow masonry; their lower edges stay above the
 // protagonist's head and never create hidden navigation blockers.
 for(const sign of [-1,1]){
  const cx=x+(alongX?0:sign*S*.46),cz=z+(alongX?sign*S*.46:0);
  box(out,cx,1.88,cz,alongX?.14:.08,.28,alongX?.08:.14,timber,6)
 }
 if(bay.kind===0){
  // Antresol storage cupboard in the higher part of a Khrushchev niche.
  const cx=x+dx*S*.16,cz=z+dz*S*.16;
  box(out,cx,2.11,cz,1.05,.39,1.05,[.33,.25,.17],6);
  for(const v of [-1,1]){
   box(out,cx+(alongX?0:v*.25),2.15,cz+(alongX?v*.25:0),
    alongX?.96:.47,.31,alongX?.47:.96,timber,6);
   box(out,cx+(alongX?-dx*.51:v*.09),2.28,cz+(alongX?v*.09:-dz*.51),
    .022,.072,.024,pale,9)
  }
 }else if(bay.kind===1){
  // An old service pipe is hidden behind a high, removable access panel.
  const cx=x+dx*S*.36,cz=z+dz*S*.36;
  box(out,cx,1.92,cz,alongX?.11:.73,.54,alongX?.73:.11,[.49,.45,.35],8);
  for(const side of [-1,1])box(out,cx+(alongX?0:side*.22),2.00,cz+(alongX?side*.22:0),alongX?.14:.024,.32,alongX?.024:.14,timber,9)
 }else{
  // Household cornice and horizontal drying rack above a deep vestibule.
  for(let i=-2;i<=2;i++)box(out,x+(alongX?dx*.22:i*.17),2.01,z+(alongX?i*.17:dz*.22),
   alongX?.38:.023,.035,alongX?.023:.38,[.53,.51,.45],9)
 }
 // Recess visibly darkens its own upper ceiling while retaining the same
 // mechanical clear headroom and ground collision as any traversable tile.
 box(out,x,2.545,z,S*.91,.055,S*.91,[.31,.30,.29],1)
}
