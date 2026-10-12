import {worldFor,simulate,ROPE} from './physics.js';
// The local predictor uses the same rope solver and collision geometry as the server.
// Prediction is limited to the newest snapshot, not recursively generated packets.
export function advancePosition(player,input,dt,stage,players=[]){
 const now=Date.now(),members=players.length?players:[player];
 const world=worldFor(members.map(p=>({id:p.id,name:p.name||'Игрок'})),stage.index||0);
 world.stage=stage;world.gateOpen=!!stage.open;
 world.players=members.map(p=>({...p,coyote:p.coyote||0,jumpHeld:!!p.jumpHeld,anchor:!!p.anchor,checkpoint:p.checkpoint||0}));
 world.pads=stage.pads.map(()=>false);world.stars=stage.stars.map(()=>false);
 world.beacons=(stage.beacons||[]).map(()=>false);
 world.inputs=Object.fromEntries(world.players.map(p=>[p.id,p.id===player.id?
  {...input,at:now}:{dir:Math.abs(p.vx||0)>60?Math.sign(p.vx):0,jump:false,anchor:!!p.anchor,at:now}]));
 simulate(world,Math.min(.04,Math.max(0,dt)),now);
 return world.players.find(p=>p.id===player.id)||{...player};
}
export function predict(player,input,seconds,stage,others=[]){
 let q={...player},remaining=Math.min(.14,Math.max(0,seconds));
 while(remaining>0){const dt=Math.min(1/90,remaining);remaining-=dt;
  q=advancePosition(q,input,dt,stage,others.map(p=>p.id===q.id?q:p));}
 return q;
}
export {ROPE};
