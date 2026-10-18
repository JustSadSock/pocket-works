// NOT DEAD YET — geometry detail pass 2.1.0.
// Compact offline meshes share renderer.mjs's 10-float vertex ABI.
// Decorative geometry never changes traversability or adds invisible collision.
import {SECTOR,TILE} from './rogue-world.mjs';
const S=TILE,H=2.62;
const wood=[.39,.25,.14],aged=[.57,.50,.37],metal=[.59,.55,.47],enamel=[.75,.72,.61];
function q(o,a,b,c,d,col,n,m=6){for(const p of [a,b,c,a,c,d])o.push(...p,...col,...n,m)}
function box(o,x,y,z,w,h,d,col,m=6){
 if(w<=0||h<=0||d<=0)return;
 const a=x-w/2,b=x+w/2,l=y,t=y+h,c=z-d/2,e=z+d/2;
 q(o,[a,l,c],[b,l,c],[b,t,c],[a,t,c],col,[0,0,-1],m);
 q(o,[b,l,e],[a,l,e],[a,t,e],[b,t,e],col,[0,0,1],m);
 q(o,[a,l,e],[a,l,c],[a,t,c],[a,t,e],col,[-1,0,0],m);
 q(o,[b,l,c],[b,l,e],[b,t,e],[b,t,c],col,[1,0,0],m);
 q(o,[a,t,c],[b,t,c],[b,t,e],[a,t,e],col,[0,1,0],m);
 q(o,[a,l,e],[b,l,e],[b,l,c],[a,l,c],col,[0,-1,0],m)
}
function round(o,x,y,z,r,h,col=metal,m=9,sides=10){
 for(let i=0;i<sides;i++){
  const a=i*2*Math.PI/sides,b=(i+1)*2*Math.PI/sides;
  const ax=Math.cos(a),az=Math.sin(a),bx=Math.cos(b),bz=Math.sin(b);
  q(o,[x+r*ax,y,z+r*az],[x+r*bx,y,z+r*bz],[x+r*bx,y+h,z+r*bz],[x+r*ax,y+h,z+r*az],col,[(ax+bx)*.5,0,(az+bz)*.5],m);
  for(const v of [[x,y+h,z],[x+r*ax,y+h,z+r*az],[x+r*bx,y+h,z+r*bz]])o.push(...v,...col,0,1,0,m)
 }
}
const kind=(p)=>((Math.imul(Math.floor(p.x*71+p.z*29),2246822519)>>>0)%3);
// The old silhouettes remain for collision; the added surfaces create form,
// fabric separation, enamel rims, glass partitions, knobs and solid handles.
export function appendPropDetails(o,p){
 const x=p.x*S,z=p.z*S,w=p.w*S,d=p.d*S,h=p.h,v=kind(p);
 if(p.type==='sofa'){
  const cloth=v===0?[.52,.42,.32]:v===1?[.43,.44,.36]:[.47,.34,.30];
  for(const t of [-1,0,1]){
   box(o,x+t*w*.275,.61,z+d*.14,w*.265,.11,d*.60,cloth,7);
   box(o,x+t*w*.275,.66,z-d*.31,w*.245,.22,d*.15,cloth,7);
   round(o,x+t*w*.27,.735,z+d*.28,.028,.017,aged,7,8)
  }
  for(const t of [-1,1]){
   box(o,x+t*w*.44,.62,z,w*.10,.16,d*.89,[.39,.29,.24],7);
   round(o,x+t*w*.43,.76,z-d*.24,.10,.06,cloth,7,8);
   box(o,x+t*w*.37,.035,z-d*.30,.06,.13,.07,wood,6)
  }
 }
 if(['wallunit','books','cabinets','wardrobe'].includes(p.type)){
  const front=z+d*.515;
  box(o,x,h-.10,front,w*.94,.075,.060,[.27,.18,.12],6);
  if(p.type==='books'||p.type==='wallunit'){
   // Glass-fronted Soviet display cupboard: posts, shelves, books, cups.
   box(o,x,.91,front,w*.86,.67,.027,[.19,.25,.24],10);
   for(let k=-2;k<=2;k++){
    const px=x+k*w*.16;
    box(o,px,1.02,front+.04,w*.12,.32,.062,
     k%2?[.59,.48,.30]:[.35,.25,.16],k%2?8:6);
    round(o,px,1.51,front+.05,.07,.025,[.75,.69,.57],8,9)
   }
   for(const t of [-1,1])box(o,x+t*w*.24,.54,front+.035,.021,.19,.025,metal,9)
  }else{
   // Two distinct raised door panels (do not flatten back to a cuboid).
   for(const t of [-1,1]){
    box(o,x+t*w*.225,.20,front+.033,w*.37,h*.66,.031,
     v===0?[.46,.32,.20]:[.34,.24,.16],6);
    box(o,x+t*w*.09,.91,front+.065,.027,.18,.035,metal,9)
   }
  }
 }
 if(p.type==='fridge'){
  const face=z+d*.515;
  box(o,x,.20,face,w*.89,h*.55,.028,[.82,.79,.67],8);
  box(o,x,h*.72,face,w*.88,h*.20,.032,[.77,.75,.66],8);
  box(o,x,h*.704,face+.023,w*.94,.024,.033,[.39,.40,.37],9);
  box(o,x+w*.36,.62,face+.033,.036,.37,.061,[.36,.35,.31],9);
  box(o,x+w*.36,h*.78,face+.033,.035,.19,.062,[.36,.35,.31],9)
 }
 if(p.type==='bed'){
  box(o,x,.55,z+d*.14,w*.91,.14,d*.61,v===1?[.40,.47,.42]:[.44,.41,.49],7);
  for(let i=-2;i<=2;i++)box(o,x+i*w*.16,.697,z+d*.15,.019,.013,d*.60,[.57,.54,.47],7);
  for(const t of [-1,1])round(o,x+t*w*.25,.75,z-d*.31,.17,.055,[.74,.68,.57],8,8);
  box(o,x,.36,z-d*.47,w*.98,.54,.06,[.42,.28,.18],6)
 }
 if(p.type==='bath'){
  // Enamel tub silhouette: visible basin rim, waterline and plumbing.
  for(const t of [-1,1]){
   box(o,x+t*w*.46,.62,z,.075,.085,d,enamel,8);
   box(o,x,.62,z+t*d*.46,w*.87,.085,.075,enamel,8)
  }
  box(o,x,.725,z,w*.72,.015,d*.69,[.35,.40,.39],10);
  round(o,x-w*.31,.78,z-d*.31,.044,.08,metal,9,8);
  box(o,x-w*.31,.85,z-d*.24,.034,.03,.22,metal,9)
 }
 if(p.type==='toilet'){
  round(o,x,.51,z+.09,.21,.046,[.88,.84,.74],8,12);
  round(o,x,.567,z+.09,.154,.012,[.36,.40,.40],10,12);
  box(o,x,.82,z-d*.29,.10,.055,.09,[.66,.61,.51],9);
 }
 if(p.type==='sink'){
  round(o,x,.79,z,.20,.05,[.83,.81,.72],8,12);
  round(o,x,.846,z,.14,.019,[.32,.38,.38],10,12);
  box(o,x,.90,z-d*.26,.036,.23,.037,metal,9);
  box(o,x,1.105,z-d*.14,.035,.028,.21,metal,9);
  for(const t of [-1,1])round(o,x+t*.14,.84,z-d*.25,.04,.025,aged,9,9)
 }
 if(p.type==='table'){
  round(o,x+.08,.82,z-.08,.13,.018,[.80,.76,.68],8,12);
  round(o,x+.08,.84,z-.08,.085,.13,[.75,.70,.60],8,12);
  round(o,x+.08,.968,z-.08,.062,.012,[.35,.28,.21],10,12);
  box(o,x+.18,.88,z-.08,.07,.05,.035,enamel,8)
 }
 if(p.type==='rug'){
  for(let i=-4;i<=4;i++)for(const t of [-1,1]){
   box(o,x+i*w*.09,.012,z+t*d*.515,.018,.018,.09,[.62,.47,.32],7)
  }
 }
}
export function appendRoomDetails(o,c,room){
 const baseX=c.cx*SECTOR,baseZ=c.cz*SECTOR;
 const x=(baseX+(room.x0+room.x1+1)*.5)*S,z=(baseZ+(room.z0+room.z1+1)*.5)*S;
 // Retro stamped ceiling rose, chain and rounded enamel shade.
 round(o,x+.12,H-.07,z-.10,.17,.053,enamel,8,10);
 round(o,x+.12,H-.37,z-.10,.018,.30,metal,9,7);
 round(o,x+.12,H-.45,z-.10,.26,.13,[.65,.57,.43],8,12);
 round(o,x+.12,H-.50,z-.10,.13,.035,[.85,.74,.55],8,9);
 // A battered Bakelite wall switch at realistic reach height.
 const wx=(baseX+room.x0)*S+.07;
 box(o,wx,1.14,z-.33,.028,.14,.10,[.66,.60,.48],8);
 box(o,wx+.022,1.17,z-.33,.021,.055,.026,[.27,.23,.20],10);
 if(room.type==='kitchen'){
  for(let i=-2;i<=2;i++)round(o,x+i*.22,.75,z+.90,.077,.11,[.80,.73,.56],8,9);
  // Old pipework under the countertop, routed near the wall.
  box(o,x-.42,.16,z+.80,.043,.60,.042,metal,9);
  box(o,x-.20,.53,z+.81,.49,.042,.04,metal,9)
 }
 if(room.type==='living'){
  // Wall clock and family-photograph cabinet, above floor collision.
  const wz=(baseZ+room.z1+1)*S-.06;
  round(o,x-.42,1.64,wz,.21,.035,[.45,.29,.18],6,14);
  round(o,x-.42,1.69,wz,.155,.025,[.80,.74,.59],8,12);
  box(o,x-.42,1.745,wz+.039,.015,.14,.012,[.25,.22,.19],9);
  box(o,x-.42,1.81,wz+.041,.093,.017,.012,[.28,.25,.20],9)
 }
 if(room.type==='bathroom'){
  // Paired exposed water pipes, towel and wall hooks.
  const wz=(baseZ+room.z0)*S+.18;
  for(const t of [-1,1])box(o,x+t*.20,.10,wz,.045,1.63,.045,t===1?metal:[.49,.43,.32],9);
  box(o,x+.21,1.58,wz+.07,.32,.035,.05,[.51,.49,.40],9)
 }
}
export function appendWallDetails(o,{x,z,px,pz,dx,dz,room}){
 // Real crown/skirting profile gives an outline even in poor light.
 // Never extend more than 3cm into the walkway.
 const hall=!room,col=hall?[.54,.50,.40]:[.59,.51,.42];
 if(dx){
  const wx=dx>0?px+S:px,zz=pz+S*.5;
  box(o,wx,H-.11,zz,.060,.12,S,col,8);
  if(hall)box(o,wx,1.07,zz,.018,.036,S,[.36,.37,.29],8);
 }else{
  const wz=dz>0?pz+S:pz,xx=px+S*.5;
  box(o,xx,H-.11,wz,S,.12,.060,col,8);
  if(hall)box(o,xx,1.07,wz,S,.036,.018,[.36,.37,.29],8)
 }
}
export function appendDoorDetails(o,d){
 // The doorway frame now sits on the actual transition between walkable
 // cells, not floating on one arbitrary side of the passage. A door leaf
 // would falsely block traversal until opening/hinge physics is implemented.
 const x=(d.x+.5)*S,z=(d.z+.5)*S;
 const brown=[.42,.27,.17],edge=[.57,.38,.23],brass=[.67,.50,.29];
 const horizontal=d.side==='left'||d.side==='right';
 if(horizontal){
  const plane=(d.x+(d.side==='right'?1:0))*S;
  for(const sign of [-1,1]){
   box(o,plane,.01,z+sign*.568,.16,2.25,.11,brown,6);
   box(o,plane+(d.side==='left'?.07:-.07),.01,z+sign*.565,.034,2.26,.060,edge,6);
   for(const y of [.35,1.74])box(o,plane+.086,y,z+sign*.557,.042,.092,.026,brass,9)
  }
  box(o,plane,2.23,z,.16,.14,1.25,edge,6);
  box(o,plane,.009,z,.15,.019,1.035,[.38,.29,.20],6);
  // Light-switch plate belongs to the solid adjacent wall, not the opening.
  box(o,plane+(d.side==='left'?.065:-.065),1.14,z+.78,.018,.14,.10,[.69,.62,.48],8)
 }else{
  const plane=(d.z+(d.side==='north'?1:0))*S;
  for(const sign of [-1,1]){
   box(o,x+sign*.568,.01,plane,.11,2.25,.16,brown,6);
   box(o,x+sign*.565,.01,plane+(d.side==='south'?.07:-.07),.060,2.26,.034,edge,6);
   for(const y of [.35,1.74])box(o,x+sign*.557,y,plane+.086,.026,.092,.042,brass,9)
  }
  box(o,x,2.23,plane,1.25,.14,.16,edge,6);
  box(o,x,.009,plane,1.035,.019,.15,[.38,.29,.20],6);
  box(o,x+.78,1.14,plane+(d.side==='south'?.06:-.06),.10,.14,.018,[.69,.62,.48],8)
 }
}
