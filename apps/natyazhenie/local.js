import {worldFor,stageFor,simulate,validateLayouts,viewWorld,CHAPTERS} from './physics.js';
export const stageAt=stageFor;
export const verifyLocalLayouts=validateLayouts;
export function newLocal(level=0){
 return worldFor([{id:'local-0',name:'Розовый'},{id:'local-1',name:'Голубой'}],level);
}
export function tickLocal(world,inputs,delta){
 const now=Date.now(),was=world.level;
 world.players.forEach((p,i)=>{const input=inputs[i]||{};world.inputs[p.id]={
  dir:Math.max(-1,Math.min(1,Number(input.dir)||0)),jump:input.jump===true,
  anchor:input.anchor===true,at:now
 };});
 simulate(world,delta,now);
 return world.level!==was||world.finished;
}
export {viewWorld,CHAPTERS};
