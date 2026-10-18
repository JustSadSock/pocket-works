import {MAX_SWING,blockedByPanels,advanceDoor,panels,doorOccludesRay} from './doors.mjs';
import {radioBroadcast} from './story.mjs';
import {FUSE_LOCATION,readPower,powerOn,powerHint,tripPower,unplugPlate,resetBreaker} from './power.mjs';
import {readLanding,knockAtDoor,inspectPeephole,landingHint} from './landing.mjs';
// NOT DEAD YET — the first authored apartment chapter and its safe mutable topology.
export const W=30,H=24,SIZE=30;
export const HOME={x:15.5,z:12.5};
export const LABELS={living:'Гостиная',kitchen:'Кухня',bedroom:'Спальня',bathroom:'Ванная',hall:'Прихожая'};
export const ITEMS=[{id:'album',room:'living',label:'Семейный альбом',note:'Лица знакомые. Имена не вспоминаются.'},{id:'pills',room:'bathroom',label:'Таблетница',note:'Сегодня среда? Дни недели перемешались.'},{id:'photo',room:'bedroom',label:'Фотография',note:'Она улыбалась здесь, раньше.'},{id:'keys',room:'kitchen',label:'Ключи от двери',note:'Ключи всегда были на кухне. Кажется.'}];
const TYPES=['living','kitchen','bedroom','bathroom'];
const LEGACY_RECTS=[{x0:2,x1:13,z0:2,z1:10,doorZ:10},{x0:17,x1:27,z0:2,z1:10,doorZ:10},{x0:2,x1:13,z0:14,z1:21,doorZ:14},{x0:17,x1:27,z0:14,z1:21,doorZ:14}];
// Irregular flats preserve the same safe corridor entrances, but walls and room
// proportions differ. Older v1.1–v1.3 saves use the exact legacy coordinates.
export function floorplan(seed,legacy=false){
 if(legacy)return LEGACY_RECTS.map(r=>({...r}));
 return [
  {x0:2+hash(seed,14)%2,x1:13,z0:2+hash(seed,21)%2,z1:10,doorZ:10},
  {x0:17,x1:26+hash(seed,31)%2,z0:2+hash(seed,37)%2,z1:10,doorZ:10},
  {x0:2+hash(seed,41)%2,x1:13,z0:14,z1:20+hash(seed,43)%2,doorZ:14},
  {x0:17,x1:26+hash(seed,47)%2,z0:14,z1:20+hash(seed,53)%2,doorZ:14}
 ]
}
export const hash=(...numbers)=>{let v=2166136261;for(let n of numbers){v=Math.imul(v^(n|0),16777619);v^=v>>>13}return (v^(v>>>16))>>>0};
const rng=(seed)=>{let n=seed>>>0;return()=>{n+=0x6D2B79F5;let z=n;z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);return ((z^(z>>>14))>>>0)/4294967296}};
const inside=(x,z)=>x>=0&&x<W&&z>=0&&z<H;
export class Apartment {
 constructor(seed=1,data=null){
  this.seed=seed>>>0;this.layoutVersion=data?.layoutVersion===2||!data?2:1;this.epoch=0;this.changes=0;this.lastChange=null;this.terrainRevision=0;this.nextShift=5;
  const types=[...TYPES],rand=rng(hash(seed,177));
  for(let i=types.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[types[i],types[j]]=[types[j],types[i]]}
  this.rooms=floorplan(this.seed,this.layoutVersion===1).map((r,i)=>({
   ...r,type:types[i],phase:data?.phases?.[i]??0,
   recognizedPhase:data?.recognized?.[types[i]]??0,lastSeen:0,lastChanged:-15
  }));
  // Doors begin open for old saves and newly generated rooms; closing is optional.
  this.doorStates=Object.fromEntries(this.rooms.map(r=>{const opened=data?.doors?.[r.type]!==false;
   return [r.type,{type:r.type,open:opened,angle:opened?MAX_SWING:0}]
  }));
  this.radio={channel:Math.max(0,Math.min(2,Number.isInteger(data?.radio?.channel)?data.radio.channel:0)),heard:data?.radio?.heard===true};
  this.power=readPower(data?.power);this.landing=readLanding(data?.landing);
  this.tiles=new Uint8Array(W*H);this.rebuild()
 }
 room(type){return this.rooms.find(r=>r.type===type)}
 point(type){if(type==='hall')return {...HOME};const r=this.room(type);return{x:(r.x0+r.x1)/2+.5,z:(r.z0+r.z1)/2+.5}}
 door(r){return{x:r.x0+3+hash(this.seed,r.x0,r.z0,r.phase)%(r.x1-r.x0-5),z:r.doorZ}}
 rebuild(){
  this.tiles.fill(0);const dig=(x,z,type)=>{if(inside(x,z))this.tiles[z*W+x]=type};
  for(let z=11;z<=13;z++)for(let x=2;x<=27;x++)dig(x,z,1);
  for(let z=2;z<=21;z++)for(let x=14;x<=16;x++)dig(x,z,1);
  for(const r of this.rooms){
   for(let z=r.z0+1;z<r.z1;z++)for(let x=r.x0+1;x<r.x1;x++)dig(x,z,2);
   const p=this.door(r);dig(p.x,p.z,3);dig(p.x+1,p.z,3)
  }this.terrainRevision++;this.itemCache=new Map()
 }
 cell(x,z){return inside(x,z)?this.tiles[z*W+x]:0}
 pass(x,z){return this.cell(x,z)>0}
 objects(){
  const out=[];const add=(r,type,rx,rz,w,d,h,solid=true)=>out.push({room:r.type,type,x:r.x0+rx,z:r.z0+rz,w,d,h,solid,phase:r.phase});
  for(const r of this.rooms){const width=r.x1-r.x0,depth=r.z1-r.z0,shift=((r.phase+this.seed)%3-1)*.22;
   if(r.type==='living'){
    add(r,'sofa',2.7,2.3+shift,2.7,1.1,1.04);add(r,'rug',width*.5,depth*.52,3.7,2.3,.015,false);
    add(r,'wallunit',width-1.4,2.1,1.0,.5,2.2);add(r,'table',width*.52,depth*.56,1.35,.85,.45);
    add(r,'lamp',width-2,depth-1.9,.35,.35,1.8,false);add(r,'painting',width*.45,.25,1.8,.08,1.25,false)
   }else if(r.type==='kitchen'){
    // The entry is always on the corridor-facing wall. Appliances belong opposite it,
    // so a moving doorway can never put a refrigerator directly inside the threshold.
    const backWall=r.z0<11?1.45:depth-1.45;
    add(r,'cabinets',2.8,backWall,3.1,.75,2.1);add(r,'fridge',width-1.35,backWall,.95,.85,2.0);
    add(r,'table',width*.48,depth*.52+shift,1.65,1.15,.75);add(r,'sink',2.3,backWall,.85,.8,.92,false)
   }else if(r.type==='bedroom'){
    add(r,'bed',2.9,2.45+shift,2.25,2.7,.75);add(r,'wardrobe',width-1.2,2.5,.85,2.35,2.18);
    add(r,'desk',width-2.3,depth-1.3,1.35,.7,.82);add(r,'painting',width*.45,.2,1.7,.08,1.1,false)
   }else{
    add(r,'bath',2.65,2.2+shift,2.15,1.05,.72);add(r,'sink',width-1.25,2.0,.75,.65,.8);
    add(r,'mirror',width-1.25,1.15,.84,.08,1.1,false);add(r,'toilet',width-2,depth-1.4,.67,.85,.64)
   }
  }
  // Foyer details carry recognizable domestic context but never obstruct exits.
  out.push({type:'doormat',room:'hall',x:15.5,z:19.4,w:1.8,d:.95,h:.02,solid:false});
  out.push({type:'shoerack',room:'hall',x:14.15,z:19.65,w:.44,d:.65,h:.8,solid:false});
  out.push({type:'coatstand',room:'hall',x:16.25,z:18.6,w:.36,d:.36,h:2,solid:false});
  out.push({type:'radiator',room:'hall',x:14.35,z:9.3,w:.32,d:1.2,h:.75,solid:false});
  out.push({type:'door',room:'hall',x:15.5,z:21,w:2.2,d:.2,h:2.85,solid:false});return out
 }
 canStand(x,z,r=.22){
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  for(const dx of [-r,r])for(const dz of [-r,r])if(!this.pass(Math.floor(x+dx),Math.floor(z+dz)))return false;
  for(const a of this.objects())if(a.solid&&Math.abs(x-a.x)<a.w*.5+r&&Math.abs(z-a.z)<a.d*.5+r)return false;
  if(this.doorStates)for(const room of this.rooms){const state=this.doorStates[room.type];
   if(state&&blockedByPanels(x,z,this.door(room),room.z0<11?-1:1,state.angle,r))return false
  }
  return true
 }
 reachablePosition(target){
  const queue=[[Math.floor(HOME.x),Math.floor(HOME.z)]],seen=new Set([Math.floor(HOME.x)+','+Math.floor(HOME.z)]);
  for(let i=0;i<queue.length;i++){
   const [x,z]=queue[i];if(Math.hypot(x+.5-target.x,z+.5-target.z)<1.12)return true;
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const xx=x+dx,zz=z+dz,k=xx+','+zz;
    if(!seen.has(k)&&this.canStand(xx+.5,zz+.5)){seen.add(k);queue.push([xx,zz])}
   }
  }return false
 }
 doors(){
  return this.rooms.map(r=>({type:r.type,gate:this.door(r),insideSign:r.z0<11?-1:1,
   open:this.doorStates[r.type].open,angle:this.doorStates[r.type].angle}))
 }
 nearestDoor(x,z,reach=2.5){
  let best=null,dist=reach;
  for(const r of this.rooms){const gate=this.door(r),d=Math.hypot(gate.x+1-x,gate.z+.5-z);
   if(d<dist){best={...this.doorStates[r.type],gate,room:r.type};dist=d}
  }
  return best
 }
 toggleDoor(type,px,pz){
  const r=this.room(type),d=r&&this.doorStates[type];if(!r||!d)return {ok:false,reason:'missing'};
  const next=!d.open;
  // Never close a door on top of the player capsule.
  if(!next&&[0,.26,.52,.78,1].some(t=>blockedByPanels(px,pz,this.door(r),r.z0<11?-1:1,MAX_SWING*t,.24)))return {ok:false,reason:'occupied'};
  d.open=next;return {ok:true,open:next}
 }
 updateDoors(dt){
  let changing=false;for(const d of Object.values(this.doorStates))if(advanceDoor(d,dt))changing=true;
  return changing
 }
 itemPosition(id){
  if(this.itemCache.has(id))return this.itemCache.get(id);
  const i=ITEMS.find(x=>x.id===id);if(!i)return null;
  const r=this.room(i.room),base=this.point(i.room),gate=this.door(r),insideZ=gate.z+(r.z0<11?-1.5:1.5);
  const places=[
   [base.x,base.z],[base.x+1.7,base.z+1.4],[base.x-1.7,base.z+1.4],
   [base.x+1.7,base.z-1.4],[base.x-1.7,base.z-1.4],
   [gate.x+.5,insideZ],[gate.x+1.5,insideZ],[gate.x+.5,insideZ+(r.z0<11?-1.2:1.2)]
  ];
  for(const [x,z] of places){
   if(this.canStand(x,z,.25)&&this.reachablePosition({x,z})){
    const result={...i,x,z};this.itemCache.set(id,result);return result
   }
  }
  const fallback={...i,x:gate.x+.5,z:insideZ};
  this.itemCache.set(id,fallback);return fallback
 }
 // The memory trace is near a real collectible: reaching it never requires a
 // second collision graph or a procedurally placed, unreachable prop.
 knock(elapsed,found){return knockAtDoor(this.landing,elapsed,found)}
 inspectLanding(hasPhoto){return inspectPeephole(this.landing,{hasPhoto})}
 landingObjective(hasPhoto){return landingHint(this.landing,hasPhoto)}
 fusePosition(){return {...FUSE_LOCATION}}
 platePosition(){
  const table=this.objects().find(o=>o.room==='kitchen'&&o.type==='table');
  return table?{x:table.x+.33,z:table.z+.12}:this.point('kitchen')
 }
 powerAvailable(){return powerOn(this.power)}
 powerObjective(){return powerHint(this.power)}
 tickPower(t,found){return tripPower(this.power,t,found)}
 unplugPlate(){return unplugPlate(this.power)}
 resetBreaker(){return resetBreaker(this.power)}
 radioPosition(){
  const table=this.objects().find(o=>o.room==='living'&&o.type==='table');
  return table?{x:table.x,z:table.z}:this.point('living')
 }
 tuneRadio(hasAlbum=false){
  if(!this.powerAvailable())return{blocked:true,channel:this.radio.channel,heard:false,newMemory:false,sound:'empty',message:'Радио обесточено.'};
  this.radio.channel=(this.radio.channel+1)%3;
  const channel=radioBroadcast(this.radio.channel,hasAlbum);
  const newMemory=channel.heard&&!this.radio.heard;
  if(newMemory)this.radio.heard=true;
  this.terrainRevision++;
  return{...channel,newMemory}
 }
 recognizedCount(){return this.rooms.filter(r=>r.recognizedPhase>0).length}
 memorySpot(type){const r=this.room(type);if(!r)return null;
  const item=ITEMS.find(i=>i.room===type);return item?this.itemPosition(item.id):this.point(type)}
 memoryState(type){const r=this.room(type);if(!r)return null;
  const active=r.phase>0&&r.recognizedPhase!==r.phase;
  const kind={living:'wrong-television',kitchen:'doubled-crockery',bedroom:'reversed-photo',bathroom:'missing-reflection'}[type];
  return{type,phase:r.phase,active,kind,recognized:r.recognizedPhase===r.phase}
 }
 recognize(type){const r=this.room(type),state=this.memoryState(type);
  if(!r||!state.active)return {ok:false};
  r.recognizedPhase=r.phase;
  this.nextShift+=5;this.epoch++;
  // Render static family props with their familiar details again.
  this.terrainRevision++;
  return{ok:true,type,kind:state.kind}
 }
 location(x,z){for(const r of this.rooms)if(x>=r.x0&&x<=r.x1+1&&z>=r.z0&&z<=r.z1+1&&this.cell(Math.floor(x),Math.floor(z))===2)return LABELS[r.type];return LABELS.hall}
 visible(ax,az,bx,bz){const d=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.ceil(d*8));for(let i=1;i<n;i++){const t=i/n;if(!this.pass(Math.floor(ax+(bx-ax)*t),Math.floor(az+(bz-az)*t)))return false}
  for(const r of this.rooms){if(doorOccludesRay(ax,az,bx,bz,this.door(r),r.z0<11?-1:1,this.doorStates[r.type].angle))return false}
  return true}
 tick(px,pz,yaw,t){
  if(t<this.nextShift)return false;
  const lx=Math.sin(yaw),lz=-Math.cos(yaw);
  for(const r of this.rooms){
   const c=this.point(r.type),dx=c.x-px,dz=c.z-pz,d=Math.hypot(dx,dz),f=(dx*lx+dz*lz)/Math.max(.1,d);
   const door=this.door(r),doorDx=door.x+.5-px,doorDz=door.z+.5-pz,doorDist=Math.hypot(doorDx,doorDz);
   const doorFacing=(doorDx*lx+doorDz*lz)/Math.max(.1,doorDist);
   const seen=(d<14&&f>.15&&this.visible(px,pz,c.x,c.z))||
    (doorDist<15&&doorFacing>.18&&this.visible(px,pz,door.x+.5,door.z+.5));
   if(seen)r.lastSeen=t;
   if(d<5.6||Math.hypot(px-door.x,pz-door.z)<4.5||seen||t-r.lastSeen<2||t-r.lastChanged<7)continue;
   const prev=r.phase,doorWas={...this.doorStates[r.type]};r.phase++;
   this.doorStates[r.type].open=true;this.doorStates[r.type].angle=MAX_SWING;this.rebuild();
   if(!this.canStand(px,pz)){r.phase=prev;Object.assign(this.doorStates[r.type],doorWas);this.rebuild();continue}
   r.lastChanged=t;r.lastSeen=t;this.nextShift=t+4.8;this.changes++;this.epoch++;this.lastChange={type:r.type,t};return true
  }return false
 }
 findStep(sx,sz,tx,tz){
  const start=[Math.floor(sx),Math.floor(sz)],end=[Math.floor(tx),Math.floor(tz)],K=(x,z)=>x+','+z;
  if(!this.pass(...start)||!this.pass(...end))return null;
  const queue=[start],seen=new Set([K(...start)]),prev=new Map();let reached=false;
  for(let i=0;i<queue.length;i++){const [x,z]=queue[i];if(x===end[0]&&z===end[1]){reached=true;break}
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,zz=z+dz,k=K(xx,zz);if(this.pass(xx,zz)&&!seen.has(k)){seen.add(k);prev.set(k,K(x,z));queue.push([xx,zz])}}
  }if(!reached)return null;
  let at=K(...end),origin=K(...start);while(prev.get(at)!==origin&&at!==origin){at=prev.get(at);if(!at)return null}
  if(at===origin)return{x:tx,z:tz};const [x,z]=at.split(',').map(Number);return{x:x+.5,z:z+.5}
 }
 save(){return{seed:this.seed,layoutVersion:this.layoutVersion,phases:this.rooms.map(r=>r.phase),
  recognized:Object.fromEntries(this.rooms.map(r=>[r.type,r.recognizedPhase])),
  radio:{...this.radio},power:{...this.power},landing:{...this.landing},
  doors:Object.fromEntries(Object.entries(this.doorStates).map(([k,v])=>[k,v.open]))}}
 fingerprint(){return this.rooms.map(r=>r.type+':'+this.door(r).x+':'+r.phase+':'+r.x0+':'+r.x1+':'+r.z0+':'+r.z1).join('|')}
}
export function validateApartment(seed){const a=new Apartment(seed);if(!a.canStand(HOME.x,HOME.z))return false;return [...ITEMS.map(i=>a.itemPosition(i.id)),HOME].every(p=>a.canStand(p.x,p.z)&&a.findStep(HOME.x,HOME.z,p.x,p.z))}
