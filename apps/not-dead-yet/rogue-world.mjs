// NOT DEAD YET — infinite, deterministic Khrushchev flat sectors.
// The layout is a graph of one-cell-wide halls and small rooms, never a scaled-up house.
import {FLOORPLANS} from './rogue-floorplans.mjs';
import {addAlcoves} from './rogue-spaces.mjs';
import {DOOR_SWING,doorKey,doorSegment,leafBlocksPoint,leafIntersectsRay,advanceLeaf,sweptLeafSafe,defaultDoorOpen} from './rogue-doors.mjs';
export const SECTOR=18;
export const TILE=1.27;
const HASH=(...values)=>{let h=2166136261;for(const value of values){h=Math.imul(h^(value|0),16777619);h^=h>>>13}return(h^(h>>>16))>>>0};
const KEY=(x,z)=>x+','+z;
const TYPE=['living','kitchen','bedroom','bathroom','closet','nursery'];
export const ROOM_NAMES={living:'Гостиная',kitchen:'Кухня',bedroom:'Спальня',bathroom:'Санузел',closet:'Кладовка',nursery:'Детская',toilet:'Туалет',hall:'Коридор'};
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
 // Five internal layouts share four immutable seam portals.
 const layout=HASH(seed,cx,cz,epoch,8731)%FLOORPLANS.length;
 const plan=FLOORPLANS[layout],topAxis=plan.topAxis||9,topTurn=plan.topTurn||3;
 lineZ(north,0,3);lineX(north,topAxis,3);
 lineZ(topAxis,3,topTurn);lineX(topAxis,9,topTurn);lineZ(9,topTurn,14);
 lineZ(south,14,17);lineX(9,south,14);
 if(plan.walkthrough){
  lineX(0,2,west);lineZ(2,7,west)
 }else{
  lineX(0,3,west);lineZ(3,west,9);lineX(3,9,9)
 }
 lineX(14,17,east);lineZ(14,east,9);lineX(9,14,9);
 if(plan.southAxis&&plan.southAxis!==9){lineZ(plan.southAxis,12,14);lineX(9,plan.southAxis,12)}
 if(plan.serviceBranch)lineX(8,9,plan.serviceBranch);
 const specs=plan.rooms;
 const types=[...TYPE].sort((a,b)=>HASH(seed,cx,cz,epoch,TYPE.indexOf(a))-HASH(seed,cx,cz,epoch,TYPE.indexOf(b)));
 const rooms=[],props=[],doors=[];
 const add=(room,type,x,z,w,d,h,solid=true)=>props.push({room:room.id,type,x:cx*SECTOR+x,z:cz*SECTOR+z,w,d,h,solid});
 for(let i=0;i<specs.length;i++){
  const spec=specs[i],room={...spec,id:KEY(cx,cz)+':'+i,type:spec.service?(plan.name==='service-nook'?'toilet':'closet'):plan.walkthrough&&i===0?'living':plan.walkthrough&&i===2?'bedroom':types[i],epoch,cx,cz};
  // Only trim the OUTSIDE edge; keep the room entrance reachable.
  if(!spec.service&&!(plan.walkthrough&&(i===0||i===2))&&i%2===0&&rand()<.22&&room.x0<room.x1-3)room.x0++;
  if(!spec.service&&!(plan.walkthrough&&(i===0||i===2))&&i%2===1&&rand()<.22&&room.x1>room.x0+3)room.x1--;
  for(let z=room.z0;z<=room.z1;z++)for(let x=room.x0;x<=room.x1;x++)paint(x,z,2);
  if(spec.via!=='walkthrough'){
   const entryZ=spec.entryZ,entryX=spec.face==='left'?room.x1+1:room.x0-1;
   lineX(entryX,9,entryZ,1);paint(entryX,entryZ,3);
   doors.push({x:cx*SECTOR+entryX,z:cz*SECTOR+entryZ,side:spec.face,id:room.id});
  }
  rooms.push(room);
  const centerX=(room.x0+room.x1)/2,centerZ=(room.z0+room.z1)/2;
  if(spec.service){
   add(room,room.type==='toilet'?'toilet':'shelf',room.x0+.48,room.z0+.27,room.type==='toilet'?.55:.32,.44,room.type==='toilet'?.78:1.65);
  }else if(room.type==='living'){
   add(room,'sofa',centerX,room.z0+.75,2.12,.72,1.08);
   add(room,'wallunit',room.x1-.14,centerZ,.42,1.82,2.25);
   add(room,'rug',centerX,centerZ,2.3,1.85,.02,false);
  }else if(room.type==='kitchen'){
   add(room,'cabinets',room.x0+.7,room.z0+.28,2.12,.42,2.05);
   add(room,'fridge',room.x1-.12,room.z0+.7,.55,.65,1.92);
   add(room,'table',centerX,centerZ+.30,1.12,.76,.74);
  }else if(room.type==='bedroom'||room.type==='nursery'){
   add(room,'bed',plan.walkthrough&&i===2?room.x1-.80:spec.face==='left'?room.x0+.62:room.x1-.62,plan.walkthrough&&i===2?room.z0+2.25:spec.entryZ<=(room.z0+room.z1)/2?room.z1-1.05:room.z0+1.05,1.25,1.78,.71);
   add(room,'wardrobe',plan.walkthrough&&i===2?room.x1-.20:spec.face==='left'?room.x0+.18:room.x1-.18,plan.walkthrough&&i===2?room.z1-.48:room.z0+.48,.50,.79,2.16);
  }else if(room.type==='bathroom'){
   add(room,'bath',room.x0+1.12,room.z0+.52,1.58,.65,.65);
   add(room,'sink',room.x1-.30,room.z1-.40,.47,.43,.86);
  }else{
   add(room,'books',room.x1-.20,room.z0+.82,.5,1.3,1.91);
   add(room,'wardrobe',spec.face==='right'?room.x1-.30:room.x0+.30,room.z1-.30,.48,.60,1.85)
  }
 }
 if(plan.walkthrough){
  // Short passage between adjacent rooms; the bedroom has no hall door.
  paint(4,8,3);paint(4,9,3);
  doors.push({x:cx*SECTOR+4,z:cz*SECTOR+8,side:'south',id:rooms[0].id});
  doors.push({x:cx*SECTOR+4,z:cz*SECTOR+9,side:'north',id:rooms[2].id})
 }
 // Connected spine and four perimeter threshold cells retain their seam.
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
 return{cx,cz,epoch,layout,layoutName:plan.name,tiles,rooms,props,doors,drops,stamp:KEY(cx,cz)};
}
// Preserve ongoing v2.0.x runs exactly: their saved room positions and
// furniture must not teleport when a new floor-plan family ships.
function generateLegacySector(seed,cx,cz,epoch=0){
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
 return{cx,cz,epoch,layout:-1,layoutName:'legacy-four-room',tiles,rooms,props,doors,drops,stamp:KEY(cx,cz)};
}
export function generateSectorV3(seed,cx,cz,epoch=0){
 return addAlcoves(generateSector(seed,cx,cz,epoch),seed,HASH)
}
export class RogueWorld{
 constructor(seed=1,data=null){
  this.endless=true;this.seed=seed>>>0;this.chunks=new Map();
   this.layoutVersion=data&&!('layoutVersion' in data)?1:data?.layoutVersion===1?1:data?.layoutVersion===2?2:3;
  this.epochs=new Map(Array.isArray(data?.epochs)?data.epochs:[]);
  // Door state uses epoch-specific IDs: a rewritten sector has new hinges.
  // A missing door map in a legacy save intentionally keeps all doors open.
  this.doorStates=new Map(Array.isArray(data?.doors)?data.doors.filter(
   entry=>Array.isArray(entry)&&typeof entry[0]==='string'&&entry[1]&&
   typeof entry[1].open==='boolean'&&Number.isFinite(entry[1].angle)
  ).slice(-400).map(([id,state])=>[id,{open:state.open,angle:Math.max(0,Math.min(DOOR_SWING,state.angle))}]):[]);
  this.taken=new Set(Array.isArray(data?.taken)?data.taken:[]);
  this.visited=new Set(Array.isArray(data?.visited)?data.visited:[]);
  this.lastNear=new Map();this.shifted=new Map();
  this.changes=data?.changes||0;this.terrainRevision=1;this.lastChange=null;
  this.depth=Math.max(0,data?.depth||0);this.tickTime=0;
  this.chunk(0,0)
 }
 chunk(cx,cz){const k=KEY(cx,cz);let c=this.chunks.get(k);
  if(!c){c=(this.layoutVersion===1?generateLegacySector:this.layoutVersion===2?generateSector:generateSectorV3)(this.seed,cx,cz,this.epochs.get(k)||0);this.chunks.set(k,c)}
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
  }
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
   const c=this.chunk(cx+dx,cz+dz);
   for(const door of c.doors){
    if(Math.abs(door.x+.5-x)>1.8||Math.abs(door.z+.5-z)>1.8||this.legacyDoor(door,c))continue;
    if(leafBlocksPoint(door,this.doorState(door,c).angle,x,z,r))return false
   }
  }
  return true
 }
 visible(ax,az,bx,bz){
  if(!this.visibleTiles(ax,az,bx,bz))return false;
  const minX=Math.floor(Math.min(ax,bx)/SECTOR),maxX=Math.floor(Math.max(ax,bx)/SECTOR);
  const minZ=Math.floor(Math.min(az,bz)/SECTOR),maxZ=Math.floor(Math.max(az,bz)/SECTOR);
  for(let cz=minZ;cz<=maxZ;cz++)for(let cx=minX;cx<=maxX;cx++){
   const c=this.chunk(cx,cz);
   for(const door of c.doors){
    if(!this.legacyDoor(door,c)&&leafIntersectsRay(door,this.doorState(door,c).angle,ax,az,bx,bz))return false
   }
  }
  return true
 }
 visibleTiles(ax,az,bx,bz){
  const d=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.ceil(d*7));
  for(let i=1;i<n;i++){const t=i/n;if(!this.pass(Math.floor(ax+(bx-ax)*t),Math.floor(az+(bz-az)*t)))return false}
  return true
 }
 legacyDoor(door,c=null){
  if(this.layoutVersion!==1)return false;
  const chunk=c||this.chunk(Math.floor(door.x/SECTOR),Math.floor(door.z/SECTOR));
  // A run saved before interior doors existed must not suddenly grow solid
  // new obstacles over its old player position. New runs get real doors.
  return !this.doorStates.has(doorKey(door,chunk.epoch))
 }
 doorState(door,c=null){
  const chunk=c||this.chunk(Math.floor(door.x/SECTOR),Math.floor(door.z/SECTOR));
  const key=doorKey(door,chunk.epoch),stored=this.doorStates.get(key);
  if(stored)return stored;
  const open=this.layoutVersion===1||defaultDoorOpen(this.seed,chunk,door,HASH);
  return{open,angle:open?DOOR_SWING:0}
 }
 nearestDoor(px,pz,yaw,maxDistance=1.8){
  let closest=null,best=maxDistance;
  for(const c of this.nearby(px,pz,3)){
   for(const door of c.doors){
    const tx=door.x+.5,tz=door.z+.5,dist=Math.hypot(tx-px,tz-pz);
    if(dist>=best||dist<.04||this.legacyDoor(door,c))continue;
    const alignment=((tx-px)*Math.sin(yaw)+(tz-pz)*-Math.cos(yaw))/dist;
    if(alignment<.22||!this.visibleTiles(px,pz,tx,tz))continue;
    closest={door,chunk:c,dist,state:this.doorState(door,c)};best=dist
   }
  }
  return closest
 }
 toggleDoor(door,actors=[]){
  if(!door)return{ok:false,reason:'missing'};
  const chunk=this.chunk(Math.floor(door.x/SECTOR),Math.floor(door.z/SECTOR));
  if(!chunk.doors.includes(door))return{ok:false,reason:'stale'};
  const key=doorKey(door,chunk.epoch),previous=this.doorState(door,chunk);
  const target=previous.open?0:DOOR_SWING;
  if(!sweptLeafSafe(door,previous.angle,target,actors))
   return{ok:false,reason:'occupied'};
  const updated={open:!previous.open,angle:previous.angle};
  this.doorStates.set(key,updated);
  return{ok:true,open:updated.open,door}
 }
 animateDoors(dt,actors=[]){
  let moving=false;
  for(const [key,state] of this.doorStates){
   const target=state.open?DOOR_SWING:0;
   if(Math.abs(target-state.angle)<.001){state.angle=target;continue}
   // The closing animation stops if any living actor enters its sweep.
   const parts=key.split(':'),coords=parts[2]?.split(',').map(Number);
   if(!coords||coords.length!==2||coords.some(v=>!Number.isFinite(v)))continue;
   const c=this.chunk(Math.floor(coords[0]/SECTOR),Math.floor(coords[1]/SECTOR));
   const door=c.doors.find(d=>doorKey(d,c.epoch)===key);
   if(!door){this.doorStates.delete(key);continue}
   const next=advanceLeaf(state.angle,target,dt);
   if(!sweptLeafSafe(door,state.angle,next,actors))continue;
   state.angle=next;moving=true
  }
  return moving
 }
 findStep(sx,sz,tx,tz,limit=1800){
  // Heuristic A*: closed doors and solid furniture are real obstacles.
  // A full breadth-first flood was slow with several pursuing enemies.
  const ox=Math.floor(sx),oz=Math.floor(sz),gx=Math.floor(tx),gz=Math.floor(tz);
  const origin=KEY(ox,oz),target=KEY(gx,gz);
  if(origin===target)return{x:tx,z:tz};
  const heuristic=(x,z)=>Math.abs(gx-x)+Math.abs(gz-z);
  const distance=heuristic(ox,oz),radius=Math.max(24,distance+10);
  const heap=[],scores=new Map([[origin,0]]),parent=new Map([[origin,null]]),closed=new Set();
  const push=node=>{
   let i=heap.length;heap.push(node);
   while(i>0){const p=(i-1)>>1;if(heap[p].f<=node.f)break;heap[i]=heap[p];i=p}
   heap[i]=node
  };
  const pop=()=>{
   const root=heap[0],last=heap.pop();
   if(heap.length){
    let i=0;
    while(true){
     const l=i*2+1;if(l>=heap.length)break;
     const r=l+1,k=r<heap.length&&heap[r].f<heap[l].f?r:l;
     if(last.f<=heap[k].f)break;heap[i]=heap[k];i=k
    }
    heap[i]=last
   }
   return root
  };
  push({x:ox,z:oz,g:0,f:heuristic(ox,oz)});
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let explored=0;heap.length&&explored<limit;){
   const n=pop(),at=KEY(n.x,n.z);
   if(closed.has(at))continue;
   closed.add(at);explored++;
   for(const [dx,dz] of dirs){
    const x=n.x+dx,z=n.z+dz,k=KEY(x,z);
    if(closed.has(k)||Math.abs(x-ox)+Math.abs(z-oz)>radius)continue;
    if(!this.canStand(x+.5,z+.5,.11))continue;
    const g=n.g+1;
    if(g>=(scores.get(k)??Infinity))continue;
    scores.set(k,g);parent.set(k,at);
    if(k===target){
     let step=k;
     while(parent.get(step)!==origin){step=parent.get(step);if(!step)return null}
     const [firstX,firstZ]=step.split(',').map(Number);
     return{x:firstX+.5,z:firstZ+.5}
    }
    push({x,z,g,f:g+heuristic(x,z)*1.06});
   }
  }
  return null
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
   const eligible=d>8+memoryLevel*2&&away>3+memoryLevel*2&&facing<.32&&time-(this.shifted.get(k)??-100)>9+memoryLevel*5;
   // A neighboring sector can straddle the field of view despite its center
   // being behind the player. Never replace any corridor the player can see.
   const cameraX=Math.sin(yaw),cameraZ=-Math.cos(yaw);
   const glimpses=[[1,1],[9,1],[16,1],[1,9],[9,9],[16,9],[1,16],[9,16],[16,16]];
   const exposed=eligible&&glimpses.some(([sx,sz])=>{
    const tx=c.cx*SECTOR+sx+.5,tz=c.cz*SECTOR+sz+.5,dx=tx-px,dz=tz-pz,range=Math.hypot(dx,dz);
    if(range>17||range<.01||(dx*cameraX+dz*cameraZ)/range<.35)return false;
    return this.pass(Math.floor(tx),Math.floor(tz))&&this.visible(px,pz,tx,tz)
   });
   if(seen&&eligible&&!exposed){
    for(const key of this.doorStates.keys())if(key.startsWith(c.stamp+':'))this.doorStates.delete(key);
    const next=c.epoch+1;this.epochs.set(k,next);this.chunks.set(k,(this.layoutVersion===1?generateLegacySector:this.layoutVersion===2?generateSector:generateSectorV3)(this.seed,c.cx,c.cz,next));
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
 save(){return{layoutVersion:this.layoutVersion,doors:[...this.doorStates].slice(-400),epochs:[...this.epochs].slice(-160),taken:[...this.taken].slice(-300),visited:[...this.visited].slice(-500),changes:this.changes,depth:this.depth}}
 fingerprint(){return [...this.chunks.values()].sort((a,b)=>a.cx-b.cx||a.cz-b.cz).slice(0,9).map(c=>c.stamp+':'+c.epoch+':'+Array.from(c.tiles).reduce((a,b)=>a+b,0)).join('|')}
}
