// Local multi-room studio. Old single-room saves remain untouched and migrate
// into the first slot on first use. Gallery thumbnails have strict storage caps.
import { STORAGE,starter,emptyRoom,sanitize } from './state.js';
import {roomKind} from './room-kinds.js';
const INDEX='pocket-works:komnatka:rooms-v1';
const ACTIVE='pocket-works:komnatka:active-room-v1';
const PREFIX='pocket-works:komnatka:room:';
export const ROOM_CAP=5;
const get=k=>{try{return localStorage.getItem(k);}catch{return null;}};
const put=(k,v)=>{try{localStorage.setItem(k,v);return true;}catch{return false;}};
const parse=v=>{try{return JSON.parse(v);}catch{return null;}};
export function roomList(){
 let entries=parse(get(INDEX));
 if(!Array.isArray(entries)||!entries.length){
  const seed=parse(get(STORAGE))||starter();
  entries=[{id:'first',name:'Моя комнатка',layout:sanitize(seed).layout,purpose:sanitize(seed).purpose,updated:Date.now(),preview:null}];
  put(PREFIX+'first',JSON.stringify(sanitize(seed)));put(INDEX,JSON.stringify(entries));
 }
 return entries.filter(x=>x&&typeof x.id==='string').slice(0,ROOM_CAP).map(x=>({...x,purpose:roomKind(x.purpose)}));
}
export function activeRoomId(){
 const id=get(ACTIVE)||'first';
 return roomList().some(r=>r.id===id)?id:roomList()[0].id;
}
export function loadRoom(id=activeRoomId()){
 const record=roomList().find(x=>x.id===id);
 const state=parse(get(PREFIX+(record?.id||'first')));
 return sanitize(state||starter());
}
export function selectRoom(id){return roomList().some(r=>r.id===id)&&put(ACTIVE,id);}
export function saveRoom(id,state,preview){
 const list=roomList(),index=list.findIndex(x=>x.id===id);if(index<0)return false;
 const clean=sanitize(state);
 if(!put(PREFIX+id,JSON.stringify(clean)))return false;
 list[index]={...list[index],layout:clean.layout,purpose:clean.purpose,updated:Date.now()};
 if(typeof preview==='string'&&preview.length<165000)list[index].preview=preview;
 return put(INDEX,JSON.stringify(list));
}
export function addRoom({name='Новая комнатка',layout='classic',purpose='living'}={}){
 const list=roomList();if(list.length>=ROOM_CAP)return null;
 const id='room-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
 const record={id,name:String(name).trim().slice(0,32)||'Новая комнатка',layout,purpose:roomKind(purpose),updated:Date.now(),preview:null};
 if(!put(PREFIX+id,JSON.stringify(emptyRoom(layout,purpose))))return null;
 list.unshift(record);
 if(put(INDEX,JSON.stringify(list))&&selectRoom(id))return record;
 // Do not leave an invisible orphaned room if writing the index/active slot fails.
 put(INDEX,JSON.stringify(list.filter(entry=>entry.id!==id)));
 try{localStorage.removeItem(PREFIX+id);}catch{}
 return null;
}
export function renameRoom(id,name){
 const list=roomList(),entry=list.find(x=>x.id===id);if(!entry)return false;
 entry.name=String(name).trim().slice(0,32)||entry.name;
 return put(INDEX,JSON.stringify(list));
}
export function deleteRoom(id){
 let list=roomList();if(list.length<2||!list.some(x=>x.id===id))return false;
 const wasActive=get(ACTIVE)===id;
 list=list.filter(x=>x.id!==id);
 if(!put(INDEX,JSON.stringify(list)))return false;
 // Check the original active id, not activeRoomId() after deletion (which already falls back).
 if(wasActive)put(ACTIVE,list[0].id);
 try{localStorage.removeItem(PREFIX+id);}catch{}
 return true;
}
