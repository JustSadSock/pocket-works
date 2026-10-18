// Physical layers in the Khrushchev-era corridor: all structural thickness
// extends INTO non-walkable cells. Never intrude into the pathfinding footprint.
// Geometry uses the renderer's 10-float vertex ABI; materials are 1..11.
const HEIGHT=2.62;
function quad(o,a,b,c,d,col,n,m=1){for(const p of [a,b,c,a,c,d])o.push(...p,...col,...n,m)}
function box(o,x,y,z,w,h,d,col,m=1){
 if(w<=0||h<=0||d<=0)return;
 const a=x-w*.5,b=x+w*.5,c=z-d*.5,e=z+d*.5,t=y+h;
 quad(o,[a,y,c],[b,y,c],[b,t,c],[a,t,c],col,[0,0,-1],m);
 quad(o,[b,y,e],[a,y,e],[a,t,e],[b,t,e],col,[0,0,1],m);
 quad(o,[a,y,e],[a,y,c],[a,t,c],[a,t,e],col,[-1,0,0],m);
 quad(o,[b,y,c],[b,y,e],[b,t,e],[b,t,c],col,[1,0,0],m);
 quad(o,[a,t,c],[b,t,c],[b,t,e],[a,t,e],col,[0,1,0],m);
 quad(o,[a,y,e],[b,y,e],[b,y,c],[a,y,c],col,[0,-1,0],m)
}
function number(x,z,seed=0){let v=Math.imul(x+73,374761393)^Math.imul(z+193,668265263)^Math.imul(seed+19,1597334677);v=Math.imul(v^(v>>>13),1274126177);return (v^(v>>>16))>>>0}
const PALETTES=[
 {paper:[.48,.44,.35],back:[.35,.32,.28],trim:[.54,.47,.35],repaired:[.63,.58,.47]},
 {paper:[.43,.50,.40],back:[.31,.38,.33],trim:[.49,.45,.34],repaired:[.61,.63,.50]},
 {paper:[.50,.39,.35],back:[.39,.32,.30],trim:[.60,.48,.35],repaired:[.69,.60,.49]},
 {paper:[.45,.43,.47],back:[.35,.36,.39],trim:[.54,.49,.47],repaired:[.65,.61,.56]},
 {paper:[.51,.48,.38],back:[.35,.36,.29],trim:[.59,.55,.43],repaired:[.72,.67,.55]}
];
export const ARCHITECTURAL_FINISHES=PALETTES.length;
export function finishFor(seed,sector,room){
 const id=room?room.id.length+room.x0*11+room.z0*17:31;
 return number(sector.cx,sector.cz,seed+sector.epoch*17+id)%PALETTES.length
}
export function architecturalWall(o,{x,z,px,pz,dx,dz,room,sector,seed,tile=1.27,detail=true}){
 // World.cell() says the neighbor tile is not traversable; a solid
 // plaster/concrete partition can occupy that neighbor without new collision.
 const index=finishFor(seed,sector,room),p=PALETTES[index],wet=room?.type==='bathroom'||room?.type==='toilet',thick=wet?.19:.155;
 const axisX=dx!==0,walkFace=axisX?(dx>0?px+tile:px):(dz>0?pz+tile:pz);
 const inner=walkFace+(axisX?dx:dz)*thick*.50,mat=room?.type==='bathroom'||room?.type==='toilet'?4:room?.type==='kitchen'?2:room?2:1;
 if(axisX){
  box(o,inner,0,pz+tile*.5,thick,HEIGHT,tile,p.back,1);
  // Outer wallpaper, directly on the wall face, with real trim relief.
  box(o,walkFace+dx*.004,.13,pz+tile*.5,.008,HEIGHT-.20,tile-.015,p.paper,mat);
  if(detail)decorate(o,walkFace,pz,dx,0,tile,p,sector,room,x,z)
 }else{
  box(o,px+tile*.5,0,inner,tile,HEIGHT,thick,p.back,1);
  box(o,px+tile*.5,.13,walkFace+dz*.004,tile-.015,HEIGHT-.20,.008,p.paper,mat);
  if(detail)decorate(o,walkFace,px,0,dz,tile,p,sector,room,x,z)
 }
}
function decorate(o,plane,start,dx,dz,S,p,sector,room,x,z){
 // Each tile has actual raised wooden skirting, a milled cornice profile,
 // and sparse deliberately irregular plaster/wallpaper repairs.
 const wet=room?.type==='bathroom'||room?.type==='toilet',w=wet?.055:.082;
 const face=plane-(dx||dz)*.007;
 if(dx){
  box(o,face,.017,start+S*.5,.035,w,S-.010,p.trim,6);
  box(o,face,.10,start+S*.5,.028,.018,S-.014,p.repaired,6);
  box(o,face,HEIGHT-.11,start+S*.5,.050,.076,S-.009,p.trim,8);
  box(o,face,HEIGHT-.06,start+S*.5,.031,.033,S-.012,p.repaired,8)
 }else{
  box(o,start+S*.5,.017,face,S-.010,w,.035,p.trim,6);
  box(o,start+S*.5,.10,face,S-.014,.018,.028,p.repaired,6);
  box(o,start+S*.5,HEIGHT-.11,face,S-.009,.076,.050,p.trim,8);
  box(o,start+S*.5,HEIGHT-.06,face,S-.012,.033,.031,p.repaired,8)
 }
 const r=number(x,z,sector.epoch*79);
 if((r%7)===0&&room?.type!=='bathroom'&&room?.type!=='toilet'){
  // Asymmetrical old wallpaper patch: two colors at different physical depth.
  const span=(.29+(r%4)*.095)*S,center=start+S*(.35+((r>>>4)%4)*.09);
  const low=.48+((r>>>7)%7)*.135,high=.46+((r>>>10)%3)*.19;
  if(dx){
   box(o,face-(dx*.009),low,center,.009,high,span,p.repaired,1);
   box(o,face-(dx*.017),low,center-span*.3,.006,high*.8,.012,p.back,1)
  }else{
   box(o,center,low,face-(dz*.009),span,high,.009,p.repaired,1);
   box(o,center-span*.3,low,face-(dz*.017),.012,high*.8,.006,p.back,1)
  }
 }
 if(!room&&(r%9)===0){
  // Surface-mounted cables in the communal corridor, with fixing clips.
  if(dx){
   box(o,face-(dx*.015),1.76,start+S*.5,.016,.026,S*.83,[.37,.36,.29],9);
   for(const d of [-.30,.30])box(o,face-(dx*.024),1.75,start+S*(.5+d),.030,.052,.022,p.trim,9)
  }else{
   box(o,start+S*.5,1.76,face-(dz*.015),S*.83,.026,.016,[.37,.36,.29],9);
   for(const d of [-.30,.30])box(o,start+S*(.5+d),1.75,face-(dz*.024),.022,.052,.030,p.trim,9)
  }
 }
}
// Thin weathered threshold construction remains in a non-hindering
// floor-height volume at an actual passable-to-passable door boundary.
export function doorwayReturn(o,door,tile=1.27){
 const X=(door.x+.5)*tile,Z=(door.z+.5)*tile,mat=[.46,.39,.31],edge=[.58,.48,.36];
 const alongX=door.side==='north'||door.side==='south';
 if(alongX){
  box(o,X,.015,Z,1.21,.020,.17,mat,6);
  for(const side of [-1,1])box(o,X+side*.605,.01,Z,.12,2.25,.17,mat,1);
  box(o,X,2.29,Z,1.29,.20,.18,edge,1)
 }else{
  box(o,X,.015,Z,.17,.020,1.21,mat,6);
  for(const side of [-1,1])box(o,X,.01,Z+side*.605,.17,2.25,.12,mat,1);
  box(o,X,2.29,Z,.18,.20,1.29,edge,1)
 }
}
