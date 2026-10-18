// Dense Soviet interiors for the endless roguelike, using the same WebGL material
// atlas as the authored chapter. All positions are actual collidable world cells.
import {SECTOR,TILE} from './rogue-world.mjs';
const S=TILE,HEIGHT=2.62;
const C={
 living:[.49,.38,.30],kitchen:[.45,.52,.43],bedroom:[.46,.39,.32],
 bathroom:[.56,.59,.54],closet:[.42,.39,.32],nursery:[.48,.45,.34],hall:[.39,.47,.40]
};
function quad(out,a,b,c,d,color,n,mat=1){for(const p of [a,b,c,a,c,d])out.push(...p,...color,...n,mat)}
function box(out,x,y,z,w,h,d,col,mat=6){
 if(w<=0||h<=0||d<=0)return;
 const a=x-w/2,b=x+w/2,c=z-d/2,e=z+d/2,t=y+h;
 quad(out,[a,y,c],[b,y,c],[b,t,c],[a,t,c],col,[0,0,-1],mat);
 quad(out,[b,y,e],[a,y,e],[a,t,e],[b,t,e],col,[0,0,1],mat);
 quad(out,[a,y,e],[a,y,c],[a,t,c],[a,t,e],col,[-1,0,0],mat);
 quad(out,[b,y,c],[b,y,e],[b,t,e],[b,t,c],col,[1,0,0],mat);
 quad(out,[a,t,c],[b,t,c],[b,t,e],[a,t,e],col,[0,1,0],mat);
 quad(out,[a,y,e],[b,y,e],[b,y,c],[a,y,c],col,[0,-1,0],mat)
}
function roomAt(c,lx,lz){return c.rooms.find(r=>lx>=r.x0&&lx<=r.x1&&lz>=r.z0&&lz<=r.z1)}
function roomDetail(out,c,room){
 const rx=c.cx*SECTOR,rz=c.cz*SECTOR,x=(rx+(room.x0+room.x1+1)/2)*S,z=(rz+(room.z0+room.z1+1)/2)*S;
 const wood=[.33,.20,.12],brass=[.66,.48,.23],paper=[.62,.58,.46],glass=[.22,.29,.29];
 // Enamel ceiling light and exposed wires. The low ceiling is deliberate.
 box(out,x,HEIGHT-.14,z,.62,.08,.62,[.61,.54,.38],8);
 box(out,x,HEIGHT-.25,z,.35,.13,.35,[.80,.64,.40],8);
 // Window facing the outer wall: recessed frame, two panes, heavy curtains and sill.
 const wx=x,wz=(rz+room.z0)*S+.035,w=Math.min(1.8,(room.x1-room.x0-1)*S);
 if(w>.7){
  box(out,wx,1.12,wz,w,1.18,.045,wood,6);
  box(out,wx,1.18,wz+.040,w*.88,1.02,.019,glass,10);
  box(out,wx,1.18,wz+.063,.05,1.05,.07,paper,8);
  box(out,wx,1.66,wz+.063,w*.9,.05,.07,paper,8);
  box(out,wx,.78,wz+.18,w+.22,.07,.34,wood,6);
  for(const side of [-1,1]){
   box(out,wx+side*w*.41,.78,wz+.15,w*.16,1.64,.09,[.53,.45,.36],7);
   box(out,wx+side*w*.33,.80,wz+.19,.05,1.50,.11,[.70,.60,.47],7)
  }
  // Steel Soviet radiator below the window.
  for(let i=0;i<6;i++)box(out,wx+(i-2.5)*.15,.16,wz+.30,.11,.46,.16,[.63,.60,.53],9)
 }
 if(room.type==='living'){
  // Wall carpet and television create readable cultural specificity even in darkness.
  const wallX=(rx+room.x0)*S+.032;
  box(out,wallX,.60,z,.035,1.44,1.85,[.44,.24,.19],7);
  box(out,wallX+.028,.74,z,.016,1.12,1.56,[.25,.19,.18],7);
  for(let k=-3;k<=3;k++)box(out,wallX+.039,1.3,z+k*.19,.016,.12,.10,[.67,.39,.24],7);
  box(out,x, .59,z+1.15,.86,.45,.31,[.34,.21,.14],6);
  box(out,x, .83,z+1.34,.68,.38,.09,[.18,.20,.20],10)
 }
 if(room.type==='kitchen'){
  box(out,x,.72,z+.92,1.38,.045,.71,[.66,.54,.39],5);
  for(let i=0;i<3;i++){
   box(out,x+(i-1)*.29,.80,z+.94,.17,.10,.16,[.81,.78,.63],8);
   box(out,x+(i-1)*.29,.88,z+.94,.09,.03,.09,[.41,.42,.36],9)
  }
  // Tile backsplash strip.
  box(out,x,1.00,(rz+room.z0)*S+.09,1.62,.93,.04,[.68,.72,.65],4)
 }
 if(room.type==='bedroom'||room.type==='nursery'){
  box(out,x,1.33,z+.86,.60,.52,.05,wood,6);
  box(out,x,1.39,z+.90,.42,.34,.02,paper,8)
 }
 if(room.type==='bathroom'){
  box(out,x,1.02,z+.58,.55,.66,.05,[.56,.54,.46],9);
  box(out,x,1.05,z+.62,.45,.57,.02,[.25,.32,.32],10)
 }
 if(room.type==='closet'){
  for(let n=0;n<3;n++)box(out,x,.58+n*.54,z+.65,1.30,.07,.44,[.38,.29,.17],6)
 }
}
function propMesh(out,p){
 const x=p.x*S,z=p.z*S,w=p.w*S,d=p.d*S,h=p.h,oak=[.34,.22,.13],linen=[.41,.32,.26],metal=[.58,.57,.50];
 if(p.type==='rug'){
  box(out,x,.012,z,w,.014,d,[.46,.25,.19],7);
  box(out,x,.027,z,w*.84,.012,d*.82,[.24,.22,.19],7);
  for(let i=-3;i<=3;i++)box(out,x+i*w*.1,.039,z,.035,.008,d*.65,[.59,.37,.25],7);
  return
 }
 if(p.type==='sofa'){
  box(out,x,.14,z,w,.43,d,linen,7);
  box(out,x,.58,z-d*.33,w,.61,d*.27,[.35,.25,.20],7);
  for(const k of [-1,0,1])box(out,x+k*w*.29,.57,z+d*.15,w*.26,.12,d*.56,[.50,.38,.30],7);
  for(const s of [-1,1])box(out,x+s*w*.44,.20,z,w*.10,.52,d,[.36,.26,.21],7);return
 }
 if(p.type==='wallunit'||p.type==='books'||p.type==='wardrobe'||p.type==='cabinets'){
  box(out,x,.02,z,w,h,d,oak,6);
  if(p.type==='wallunit'||p.type==='books'){
   box(out,x,.87,z+d*.52,w*.84,.59,.035,[.16,.22,.22],10);
   for(let i=0;i<5;i++)box(out,x+(i-2)*w*.16,1.60,z+d*.49,w*.115,.30,.06,[.63,.53,.34],8)
  }else{
   box(out,x,.14,z+d*.52,w*.87,h*.73,.035,[.48,.33,.21],6);
   for(const s of [-1,1])box(out,x+s*w*.14,.92,z+d*.56,.025,.20,.024,[.63,.50,.28],9)
  }return
 }
 if(p.type==='fridge'){
  box(out,x,.01,z,w,h,d,[.76,.73,.61],8);
  box(out,x,1.17,z+d*.52,w*.92,.025,.03,[.38,.39,.35],9);
  box(out,x+w*.36,.67,z+d*.54,.03,.39,.04,[.27,.27,.25],9);return
 }
 if(p.type==='bed'){
  box(out,x,.17,z,w,.43,d,oak,6);
  box(out,x,.57,z,w*.95,.11,d*.92,[.40,.42,.36],7);
  box(out,x,.68,z+d*.15,w*.90,.09,d*.55,[.34,.43,.44],7);
  for(const s of [-1,1])box(out,x+s*w*.24,.69,z-d*.35,w*.34,.12,.30,[.73,.68,.56],8);return
 }
 if(p.type==='bath'){
  box(out,x,.06,z,w,.67,d,[.76,.72,.63],8);
  box(out,x,.67,z,w*.91,.05,d*.91,[.35,.39,.39],9);return
 }
 if(p.type==='sink'){
  box(out,x,.62,z,w,.19,d,[.73,.69,.60],8);
  box(out,x,.84,z-.12,.045,.25,.06,[.57,.48,.29],9);return
 }
 if(p.type==='table'){
  box(out,x,.74,z,w,.08,d,[.62,.52,.38],5);
  for(const a of [-1,1])for(const b of [-1,1])box(out,x+a*w*.39,.04,z+b*d*.37,.075,.72,.075,oak,6);
  box(out,x,.82,z,.17,.19,.17,metal,8);return
 }
 box(out,x,.02,z,w,Math.max(.1,h),d,oak,6)
}
export function rogueStaticMesh(world,player){
 const out=[],radius=17,cx0=Math.floor(player.x-radius),cx1=Math.floor(player.x+radius),
  cz0=Math.floor(player.z-radius),cz1=Math.floor(player.z+radius);
 for(let z=cz0;z<=cz1;z++)for(let x=cx0;x<=cx1;x++){
  if(Math.hypot(x-player.x,z-player.z)>radius)continue;
  const type=world.cell(x,z);if(!type)continue;
  const sec=world.chunk(Math.floor(x/SECTOR),Math.floor(z/SECTOR));
  const room=roomAt(sec,x-sec.cx*SECTOR,z-sec.cz*SECTOR);
  const col=room?C[room.type]:C.hall;
  const mat=room?.type==='bathroom'?4:room?.type==='living'||room?.type==='bedroom'?3:5;
  const px=x*S,pz=z*S;
  quad(out,[px,0,pz+S],[px+S,0,pz+S],[px+S,0,pz],[px,0,pz],[.42,.35,.25],[0,1,0],mat);
  quad(out,[px,HEIGHT,pz],[px+S,HEIGHT,pz],[px+S,HEIGHT,pz+S],[px,HEIGHT,pz+S],[.56,.54,.46],[0,-1,0],1);
  for(const [dx,dz,n] of [[1,0,[-1,0,0]],[-1,0,[1,0,0]],[0,1,[0,0,-1]],[0,-1,[0,0,1]]]){
   if(world.pass(x+dx,z+dz))continue;
   const w=dx===1?px+S:dx===-1?px:0,q=dz===1?pz+S:dz===-1?pz:0;
   if(dx){quad(out,[w,0,pz],[w,0,pz+S],[w,HEIGHT,pz+S],[w,HEIGHT,pz],col,n,room?2:1);
    box(out,w,.08,pz+S/2,.055,.13,S,[.28,.24,.19],6);
    if(!room)box(out,w,.84,pz+S/2,.018,.035,S,[.30,.34,.26],8);
   }else{quad(out,[px,0,q],[px+S,0,q],[px+S,HEIGHT,q],[px,HEIGHT,q],col,n,room?2:1);
    box(out,px+S/2,.08,q,S,.13,.055,[.28,.24,.19],6);
    if(!room)box(out,px+S/2,.84,q,S,.035,.018,[.30,.34,.26],8)
   }
  }
 }
 for(const c of world.nearby(player.x,player.z,17)){
  for(const p of c.props)if(Math.hypot(p.x-player.x,p.z-player.z)<17)propMesh(out,p);
  for(const room of c.rooms){
   const rx=c.cx*SECTOR+(room.x0+room.x1)/2+0.5,rz=c.cz*SECTOR+(room.z0+room.z1)/2+.5;
   if(Math.hypot(rx-player.x,rz-player.z)<17)roomDetail(out,c,room)
  }
  for(const d of c.doors)if(Math.hypot(d.x-player.x,d.z-player.z)<17){
   const x=(d.x+.5)*S,z=(d.z+.5)*S;
   const wood=[.40,.27,.15];
   if(d.side==='left'){
    box(out,x,0,z-.53,.12,2.45,.12,wood,6);box(out,x,0,z+.53,.12,2.45,.12,wood,6);
    box(out,x,2.41,z,.13,.12,1.21,wood,6)
   }else{
    box(out,x,0,z-.53,.12,2.45,.12,wood,6);box(out,x,0,z+.53,.12,2.45,.12,wood,6);
    box(out,x,2.41,z,.13,.12,1.21,wood,6)
   }
   box(out,x+.29,.04,z+.48,.49,2.28,.075,[.37,.22,.12],6);
   box(out,x+.29,1.25,z+.52,.36,.66,.03,[.16,.22,.21],10)
  }
 }
 return out
}
export function roguePickupsMesh(out,drops,time){
 for(const p of drops){
  const x=p.x*S,z=p.z*S,plaque=[.36,.27,.18];
  box(out,x,.03,z,.52,.045,.43,plaque,6);
  if(p.type==='ammo'){
   for(let i=0;i<4;i++)box(out,x+(i-1.5)*.11,.09,z,.065,.24,.07,[.71,.56,.31],9)
  }else if(p.type==='tea'){
   box(out,x,.11,z,.26,.23,.22,[.68,.66,.54],8);
   box(out,x,.32,z,.23,.045,.24,[.45,.38,.30],9)
  }else if(p.type==='bandage'){
   box(out,x,.1,z,.30,.23,.25,[.67,.66,.56],8);
   box(out,x,.22,z,.28,.045,.25,[.50,.22,.20],8)
  }else{
   box(out,x,.10,z,.52,.39,.42,[.33,.19,.12],6);
   box(out,x,.54,z,.41,.04,.33,[.60,.48,.29],8);
   box(out,x,.30,z+.23,.29,.19,.03,[.73,.68,.56],8)
  }
  // Visual affordance comes from a small physical highlight, not a neon beam.
  const bob=.008*Math.sin(time*2+p.x);
  box(out,x,.045+bob,z,.56,.018,.48,[.64,.51,.30],9)
 }
}
