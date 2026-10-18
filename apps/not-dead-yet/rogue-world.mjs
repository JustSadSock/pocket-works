// NOT DEAD YET — infinite, deterministic Khrushchev flat sectors.
// The layout is a graph of one-cell-wide halls and small rooms, never a scaled-up house.
export const SECTOR=18;
export const TILE=1.27;
const HASH=(...values)=>{let h=2166136261;for(const value of values){h=Math.imul(h^(value|0),16777619);h^=h>>>13}return(h^(h>>>16))>>>0};
const KEY=(x,z)=>x+','+z;
const TYPE=['living','kitchen','bedroom','bathroom','closet','nursery'];
export const ROOM_NAMES={living:'Гостиная',kitchen:'Кухня',bedroom:'Спальня',bathroom:'Санузел',closet:'Кладовка',nursery:'Детская',hall:'Коридор'};
export const REWARDS={
 ammo:{name:'Патроны',text:'Несколько патронов в жестяной коробке'},
 tea:{name:'Крепкий чай',text:'Дыхание становится ровнее'},
 bandage:{name:'Таблетница',text:'Ненадолго становится спокойнее'},
 relic:{name:'Знакомая вещь',text:'Можно вспомнить что-то полезное'}
};
export const UPGRADES=[
 {id:'steady',name:'Твёрдая рука',desc:'Выстрел наносит больше урона'},
 {id:'pockets',name:'Глубокие карманы',desc:'Больше запасных патронов и сразу +12'},
 {id:'breath',name:'Привычный ритм',desc:'Уменьшает урон от видений'},
 {id:'shoes',name:'Домашние тапки',desc:'Быстрее ходьба и бег'},
 {id:'glasses',name:'Старые очки',desc:'Лучше обзор и дальность фонаря'},
 {id:'ritual',name:'Помню порядок',desc:'Медленнее меняется квартира'},
 {id:'tea',name:'Поставить чайник',desc:'Восстанавливает самообладание, +20 к максимуму'}
];
export const hash=HASH;
const R=(seed)=>{let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}};
const within=(n)=>n>=0&&n<SECTOR;
export function generateSector(seed,cx,cz,epoch=0){
 const tiles=new Uint8Array(SECTOR*SECTOR),rand=R(HASH(seed,cx,cz,epoch));
 const paint=(x,z,t)=>{if(within(x)&&within(z))tiles[z*SECTOR+x]=t};
 const lineX=(a,b,z,t=1)=>{for(let x=Math.min(a,b);x<=Math.max(a,b);x++)paint(x,z,t)};
 const lineZ=(x,a,b,t=1)=>{for(let z=Math.min(a,b);z<=Math.max(a,b);z++)paint(x,z,t)};
 // Edge ports are keyed by shared boundaries and are invariant under mutation.
 const north=8+HASH(seed,cx,cz-1,1)%3,south=8+HASH(seed,cx,cz,1)%3;
 const west=8+HASH(seed,cx-1,cz,2)%3,east=8+HASH(seed,cx,cz,2)%3;
 // Stagger turns before the center: no 3-4-cell-wide American-house corridors.
 lineZ(north,0,3);lineX(north,9,3);lineZ(9,3,14);
 lineZ(south,14,17);lineX(9,south,14);
 lineX(0,3,west);lineZ(3,west,9);lineX(3,9,9);
 lineX(14,17,east);lineZ(14,east,9);lineX(9,14,9);
 const specs=[
  {x0:2,x1:6,z0:2,z1:6,face:'left'},
  {x0:11,x1:15,z0:2,z1:6,face:'right'},
  {x0:2,x1:6,z0:11,z1:15,face:'left'},
  {x0:11,x1:15,z0:11,z1:15,face:'right'}
 ];
 const types=[...TYPE].sort((a,b)=>HASH(seed,cx,cz,epoch,TYPE.indexOf(a))-HASH(seed,cx,cz,epoch,TYPE.indexOf(b)));
 const rooms=[],props=[],doors=[];
 const add=(room,type,x,z,w,d,h,solid=true)=>props.push({room:room.id,type,x:cx*SECTOR+x,z:cz*SECTOR+z,w,d,h,solid});
 for(let i=0;i<specs.length;i++){
  const spec=specs[i],room={...spec,id:KEY(cx,cz)+':'+i,type:types[i],epoch,cx,cz};
  // Shape variations only trim the OUTER edge; door and hall remain fixed.
  if(i%2===0&&rand()<.45)room.x0++;
  if(i%2===1&&rand()<.45)room.x1--;
  if(i<2&&rand()<.38)room.z0++;
  if(i>=2&&rand()<.38)room.z1--;
  for(let z=room.z0;z<=room.z1;z++)for(let x=room.x0;x<=room.x1;x++)paint(x,z,2);
  const entryZ=i<2?4:13,entryX=spec.face==='left'?7:10;
  lineX(spec.face==='left'?6:9, spec.face==='left'?9:11,entryZ,1);
  // Isolated one-tile threshold; no visual or collision-only door.
  paint(entryX,entryZ,3);doors.push({x:cx*SECTOR+entryX,z:cz*SECTOR+entryZ,side:spec.face,id:room.id});
  rooms.push(room);
  const centerX=(room.x0+room.x1)/2,centerZ=(room.z0+room.z1)/2;
  if(room.type==='living'){
   add(room,'sofa',centerX,room.z0+.75,2.12,.72,1.08);
   add(room,'wallunit',room.x1-.14,centerZ,.42,1.82,2.25);
   add(room,'rug',centerX,centerZ,2.3,1.85,.02,false);
  }else if(room.type==='kitchen'){
   add(room,'cabinets',room.x0+.7,room.z0+.28,2.12,.42,2.05);
   add(room,'fridge',room.x1-.12,room.z0+.7,.55,.65,1.92);
   add(room,'table',centerX,centerZ+.30,1.12,.76,.74);
  }else if(room.type==='bedroom'||room.type==='nursery'){
   add(room,'bed',centerX-.35,room.z0+1.05,1.25,1.78,.71);
   add(room,'wardrobe',room.x1-.20,room.z1-.48,.50,.79,2.16);
  }else if(room.type==='bathroom'){
   add(room,'bath',room.x0+1.12,room.z0+.52,1.58,.65,.65);
   add(room,'sink',room.x1-.30,room.z1-.40,.47,.43,.86);
  }else{
   add(room,'books',room.x1-.20,room.z0+.82,.5,1.3,1.91);
   add(room,'wardrobe',room.x0+.28,room.z1-.30,.48,.60,1.85)
  }
 }
 // Connected spine and all eight perimeter threshold cells retain their seam.
 for(const [x,z] of [[north,0],[south,17],[0,west],[17,east]])paint(x,z,3);
 const tile=(x,z)=>within(x)&&within(z)?tiles[z*SECTOR+x]:0;
 const safe=[];
 for(const room of rooms)for(let z=room.z0;z<=room.z1;z++)for(let x=room.x0;x<=room.x1;x++){
  if(x===room.x0||x===room.x1||z===room.z0||z===room.z1)continue;
  if(props.some(p=>p.solid&&Math.abs(cx*SECTOR+x+.5-p.x)<p.w/2+.38&&Math.abs(cz*SECTOR+z+.5-p.z)<p.d/2+.38))continue;
  safe.push({x:cx*SECTOR+x+.5,z:cz*SECTOR+z+.5,room:room.type});
 }
 const drops=[];
 for(let i=0;i<Math.min(2,safe.length);i++){
  const pos=safe[Math.floor(rand()*safe.length)];
  if(drops.some(p=>Math.hypot(p.x-pos.x,p.z-pos.z)<1))continue;
  const roll=rand(),type=roll<.21?'relic':roll<.57?'ammo':roll<.83?'tea':'bandage';
  drops.push({...pos,id:KEY(cx,cz)+':'+epoch+':'+i,type});
 }
 return{cx,cz,epoch,tiles,rooms,props,doors,drops,stamp:KEY(cx,cz)};
}
export class RogueWorld{
 constructor(seed=1,data=null){
  this.endless=true;this.seed=seed>>>0;this.chunks=new Map();
  this.epochs=new Map(Array.isArray(data?.epochs)?data.epochs:[]);
  this.taken=new Set(Array.isArray(data?.taken)?data.taken:[]);
  this.visited=new Set(Array.isArray(data?.visited)?data.visited:[]);
  this.lastNear=new Map();this.shifted=new Map();
  this.changes=data?.changes||0;this.terrainRevision=1;this.lastChange=null;
  this.depth=Math.max(0,data?.depth||0);this.tickTime=0;
  this.chunk(0,0)
 }
 chunk(cx,cz){const k=KEY(cx,cz);let c=this.chunks.get(k);
  if(!c){c=generateSector(this.seed,cx,cz,this.epochs.get(k)||0);this.chunks.set(k,c)}
  return c
 }
 cell(x,z){const cx=Math.floor(x/SECTOR),cz=Math.floor(z/SECTOR),c=this.chunk(cx,cz);
  return c.tiles[(z-cz*SECTOR)*SECTOR+x-cx*SECTOR]||0}
 pass(x,z){return this.cell(x,z)!==0}
 canStand(x,z,r=.20){
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  for(const dx of [-r,r])for(const dz of [-r,r])if(!this.pass(Math.floor(x+dx),Math.floor(z+dz)))return false;
  const cx=Math.floor(x/SECTOR),cz=Math.floor(z/SECTOR);
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const p of this.chunk(cx+dx,cz+dz).props){
   if(p.solid&&Math.abs(x-p.x)<p.w*.5+r&&Math.abs(z-p.z)<p.d*.5+r)return false
  }return true
 }
 visible(ax,az,bx,bz){const d=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.ceil(d*7));
  for(let i=1;i<n;i++){const t=i/n;if(!this.pass(Math.floor(ax+(bx-ax)*t),Math.floor(az+(bz-az)*t)))return false}return true
 }
 findStep(sx,sz,tx,tz,limit=1200){
  const a=[Math.floor(sx),Math.floor(sz)],b=KEY(Math.floor(tx),Math.floor(tz)),origin=KEY(...a);
  if(origin===b)return{x:tx,z:tz};
  const queue=[a],prev=new Map([[origin,null]]),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let n=0;n<queue.length&&n<limit;n++){const [x,z]=queue[n];
   for(const [dx,dz] of dirs){const xx=x+dx,zz=z+dz,k=KEY(xx,zz);
    if(prev.has(k)||!this.pass(xx,zz))continue;prev.set(k,KEY(x,z));
    if(k===b){let at=k;while(prev.get(at)!==origin){at=prev.get(at);if(!at)return null}
     const [fx,fz]=at.split(',').map(Number);return{x:fx+.5,z:fz+.5}}
    queue.push([xx,zz])
   }
  }return null
 }
 location(x,z){const cx=Math.floor(x/SECTOR),cz=Math.floor(z/SECTOR),c=this.chunk(cx,cz),lx=x-cx*SECTOR,lz=z-cz*SECTOR;
  const room=c.rooms.find(r=>lx>=r.x0&&lx<r.x1+1&&lz>=r.z0&&lz<r.z1+1);
  return room?ROOM_NAMES[room.type]:ROOM_NAMES.hall
 }
 nearby(x,z,radius=16){const cx=Math.floor(x/SECTOR),cz=Math.floor(z/SECTOR),out=[];
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
   const c=this.chunk(cx+dx,cz+dz);
   if(Math.hypot((c.cx+.5)*SECTOR-x,(c.cz+.5)*SECTOR-z)<radius+SECTOR*.75)out.push(c)
  }return out
 }
 drops(x,z,dist=2){return this.nearby(x,z,dist+6).flatMap(c=>c.drops).filter(d=>!this.taken.has(d.id)&&Math.hypot(d.x-x,d.z-z)<=dist)}
 take(drop){if(!drop||this.taken.has(drop.id))return false;this.taken.add(drop.id);return true}
 tick(px,pz,yaw,time,memoryLevel=0){
  const cx=Math.floor(px/SECTOR),cz=Math.floor(pz/SECTOR),current=KEY(cx,cz);
  this.tickTime=time;const oldDepth=this.depth;
  this.visited.add(current);this.depth=Math.max(this.depth,this.visited.size-1);
  const residentRadius=1;
  for(let dz=-residentRadius;dz<=residentRadius;dz++)for(let dx=-residentRadius;dx<=residentRadius;dx++)this.chunk(cx+dx,cz+dz);
  let changed=false;
  for(const [k,c] of [...this.chunks]){
   const d=Math.hypot(Math.max(0,Math.abs(px-(c.cx+.5)*SECTOR)-SECTOR/2),Math.max(0,Math.abs(pz-(c.cz+.5)*SECTOR)-SECTOR/2));
   if(d<4){this.lastNear.set(k,time);continue}
   const seen=this.lastNear.has(k),away=time-(this.lastNear.get(k)??time);
   const angleX=(c.cx+.5)*SECTOR-px,angleZ=(c.cz+.5)*SECTOR-pz;
   const facing=(angleX*Math.sin(yaw)-angleZ*Math.cos(yaw))/Math.max(1,Math.hypot(angleX,angleZ));
   const safe=d>8+memoryLevel*2&&away>3+memoryLevel*2&&facing<.32&&time-(this.shifted.get(k)??-100)>9+memoryLevel*5;
   if(seen&&safe){
    const next=c.epoch+1;this.epochs.set(k,next);this.chunks.set(k,generateSector(this.seed,c.cx,c.cz,next));
    this.lastNear.delete(k);this.shifted.set(k,time);this.terrainRevision++;
    this.changes++;this.lastChange={cx:c.cx,cz:c.cz,time};changed=true
   }
   if(Math.max(Math.abs(c.cx-cx),Math.abs(c.cz-cz))>2){
    this.chunks.delete(k);this.lastNear.delete(k)
   }
  }
  return{changed,depthUp:this.depth>oldDepth}
 }
 spawnAt(x,z,min=5,max=13,salt=0){
  const rand=R(HASH(this.seed,Math.floor(x),Math.floor(z),this.changes,salt));
  const cells=[];
  for(const c of this.nearby(x,z,max+2))for(let z0=0;z0<SECTOR;z0++)for(let x0=0;x0<SECTOR;x0++){
   if(!c.tiles[z0*SECTOR+x0])continue;
   const px=c.cx*SECTOR+x0+.5,pz=c.cz*SECTOR+z0+.5,d=Math.hypot(px-x,pz-z);
   if(d>=min&&d<=max&&this.canStand(px,pz,.12)&&!this.visible(x,z,px,pz))cells.push({x:px,z:pz})
  }
  return cells.length?cells[Math.floor(rand()*cells.length)]:null
 }
 save(){return{epochs:[...this.epochs].slice(-160),taken:[...this.taken].slice(-300),visited:[...this.visited].slice(-500),changes:this.changes,depth:this.depth}}
 fingerprint(){return [...this.chunks.values()].sort((a,b)=>a.cx-b.cx||a.cz-b.cz).slice(0,9).map(c=>c.stamp+':'+c.epoch+':'+Array.from(c.tiles).reduce((a,b)=>a+b,0)).join('|')}
}
