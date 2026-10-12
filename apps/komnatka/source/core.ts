import { starter, sanitize, valid } from './state.js';

export function inspectRoom(raw: unknown) {
 const state=sanitize(raw);
 const unique=new Set(state.items.map((i: {id:string})=>i.id));
 return { itemCount:state.items.length, uniqueIds:unique.size===state.items.length,
  placementValid:state.items.every((i: any)=>valid(state,i)),
  finish:{wallColor:state.wallColor,pattern:state.pattern,floor:state.floor}};
}
export function newRoom(){return starter();}
