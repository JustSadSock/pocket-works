import { layoutId, fitsLayout, leftWallX } from './layout.js';
import { byType, COLORS } from './models.js';
import { roomKind, itemMaterial } from './room-kinds.js';
export const STORAGE='pocket-works:komnatka:scene-v1';
export const ROOM=3.77;
export const PATTERN_KEYS=['plain','stripe','flower','gingham','berries','stars','daisy','dots','sprig','linen','plaster','panel'];
export const FLOOR_KEYS=['honey','walnut','painted','tile','blush','cherry','herringbone','terrazzo'];
export function emptyRoom(layout='classic',purpose='living'){return {...starter(),layout:layoutId(layout),purpose:roomKind(purpose),items:[]};}
const item=(id,type,x,z,rot=0,more={})=>({id,type,x,z,rot,color:COLORS[2],...more});
export function starter() {
 return { layout:'classic',purpose:'living',wallColor:0,wallColorLeft:0,pattern:'plain',patternLeft:'plain',floor:'honey',evening:false,items:[
  item('welcome-rug','rug',.35,.85,0,{color:'#d6ab93'}),
  item('welcome-sofa','sofa',.10,-2.38,0,{color:'#a3b5a1'}),
  item('welcome-coffee','coffee',.20,-.48,0),
  item('welcome-books','books',-.12,-.49,0,{y:.72,support:'welcome-coffee'}),
  item('welcome-mug','mug',.58,-.45,0,{y:.72,support:'welcome-coffee',color:'#c48f78'}),
  item('welcome-chair','chair',2.60,-.80,3,{color:'#d9ae97'}),
  item('welcome-plant','plant',-2.77,-2.6),
  item('welcome-lamp','floorlamp',2.75,-2.70),
  item('welcome-frame','frame',.25,-3.91,0,{layer:'wall',wall:'back',y:2.62,variant:0}),
  item('welcome-window','window',-3.91,1.34,1,{layer:'wall',wall:'left',y:2.63})
 ]};
}
const integer=(v,fallback=0)=>Number.isInteger(v)?v:fallback;
const finite=(v,fallback=0)=>Number.isFinite(v)?Math.max(-12,Math.min(12,v)):fallback;
export function sanitize(input){
 if(!input||typeof input!=='object')return starter();
 const items=[],ids=new Set();
 for(const raw of Array.isArray(input.items)?input.items.slice(0,160):[]){
  if(!raw||!byType[raw.type]||typeof raw.id!=='string'||raw.id.length>80||ids.has(raw.id))continue;
  ids.add(raw.id);
  const meta=byType[raw.type], color=/^#[0-9a-f]{6}$/i.test(raw.color)?raw.color:COLORS[2];
  const next={id:raw.id,type:raw.type,x:finite(raw.x),z:finite(raw.z),y:finite(raw.y),rot:((integer(raw.rot)%4)+4)%4,color,variant:integer(raw.variant),wall:raw.wall==='left'?'left':'back',support:typeof raw.support==='string'?raw.support:null,material:itemMaterial(raw.material)};
  if(meta.layer==='wall'){next.y=Math.min(3.50,Math.max(.85,next.y));next.x=next.wall==='left'?leftWallX(input.layout):Math.max(-3,Math.min(3,next.x));next.z=next.wall==='back'?-3.91:Math.max(-3,Math.min(3,next.z));next.rot=next.wall==='left'?1:0;}
  else {next.x=Math.max(-ROOM,Math.min(ROOM,next.x));next.z=Math.max(-ROOM,Math.min(ROOM,next.z));}
  items.push(next);
 }
 return {
  layout:layoutId(input.layout),purpose:roomKind(input.purpose),
  wallColor:Math.max(0,Math.min(5,integer(input.wallColor))),
  wallColorLeft:Math.max(0,Math.min(5,integer(input.wallColorLeft,input.wallColor))),
  pattern:PATTERN_KEYS.includes(input.pattern)?input.pattern:'plain',
  patternLeft:PATTERN_KEYS.includes(input.patternLeft)?input.patternLeft:(PATTERN_KEYS.includes(input.pattern)?input.pattern:'plain'),
  floor:FLOOR_KEYS.includes(input.floor)?input.floor:'honey',
  evening:Boolean(input.evening),items
 };
}
export function load(){
 try{const text=localStorage.getItem(STORAGE);return text?sanitize(JSON.parse(text)):starter();}
 catch{return starter();}
}
export function save(state){try{localStorage.setItem(STORAGE,JSON.stringify(state));return true;}catch{return false;}}
export function dimensions(item){const m=byType[item.type];const [w,d]=m.size;return item.rot%2?[d,w]:[w,d];}
export function findSupport(state,item,x,z){
 if(!byType[item.type]?.tabletop)return null;
 const candidates=state.items.filter(it=>it.id!==item.id&&byType[it.type]?.top&&!byType[it.type]?.tabletop);
 return candidates.reverse().find(it=>{
  const [w,d]=dimensions(it),[pw,pd]=dimensions(item);
  return Math.abs(x-it.x)<=(w-pw)/2-.005&&Math.abs(z-it.z)<=(d-pd)/2-.005;
 })||null;
}
export function valid(state,item,excludeId=item.id){
 const meta=byType[item.type];if(!meta)return false;
 if(meta.layer==='wall'){
  const dim=meta.size[0];const coord=item.wall==='left'?item.z:item.x;
  if(Math.abs(coord)>ROOM-dim/2||item.y<1||item.y>3.22)return false;
  if(!fitsLayout(state.layout,item,dim,.1))return false;
  return state.items.every(other=>{
   if(other.id===excludeId||byType[other.type]?.layer!=='wall'||other.wall!==item.wall)return true;
   return Math.abs(coord-(item.wall==='left'?other.z:other.x))>(dim+byType[other.type].size[0])/2+.05||Math.abs(item.y-other.y)>1.65;
  });
 }
 const [w,d]=dimensions(item);if(!fitsLayout(state.layout,item,w,d))return false;
 if(meta.tabletop){
  const support=state.items.find(it=>it.id===item.support);if(!support||!byType[support.type]?.top)return false;
  const [sw,sd]=dimensions(support);if(Math.abs(item.x-support.x)>(sw-w)/2-.005||Math.abs(item.z-support.z)>(sd-d)/2-.005)return false;
  return state.items.every(other=>{
   if(other.id===excludeId||other.support!==item.support)return true;
   const [ow,od]=dimensions(other);
   return Math.abs(item.x-other.x)>=(w+ow)/2-.025||Math.abs(item.z-other.z)>=(d+od)/2-.025;
  });
 }
 if(meta.layer==='rug')return true;
 return state.items.every(other=>{
  if(other.id===excludeId||byType[other.type]?.layer||byType[other.type]?.tabletop)return true;
  const [ow,od]=dimensions(other);
  return Math.abs(item.x-other.x)>=(w+ow)/2+.08||Math.abs(item.z-other.z)>=(d+od)/2+.08;
 });
}
export function removeWithChildren(state,id){return state.items.filter(i=>i.id!==id&&i.support!==id);}
export function moveWithChildren(state,id,dx,dz,rotDelta=0){
 const parent=state.items.find(i=>i.id===id);if(!parent)return;
 const children=state.items.filter(i=>i.support===id);
 for(const child of children){
  const ox=child.x-parent.x,oz=child.z-parent.z;
  if(rotDelta){const angle=rotDelta*Math.PI/2;child.x=parent.x+dx+ox*Math.cos(angle)-oz*Math.sin(angle);child.z=parent.z+dz+ox*Math.sin(angle)+oz*Math.cos(angle);}
  else {child.x+=dx;child.z+=dz;}
  child.x=Math.round(child.x*4)/4;child.z=Math.round(child.z*4)/4;
 }
}
export function nextId(){return 'piece-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);}
