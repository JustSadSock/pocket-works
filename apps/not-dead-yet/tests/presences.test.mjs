import test from 'node:test';
import assert from 'node:assert/strict';
import {acousticEvent,audible,insideTorch,updatePresence,shouldDespawn,presenceCue} from '../presences.mjs';

const world=(visible=true,canMove=true)=>({
 visible:()=>visible,canStand:()=>canMove,
 findStep:(_sx,_sz,x,z)=>({x,z})
});
const player={x:0,z:0,yaw:0};
const entity=(kind='figure')=>({x:0,z:-3,kind,age:0,hit:0,speed:.5,path:null,pathTime:0});

test('ordinary steps are quieter than sprint, shots and radio, and closed doors muffle noise',()=>{
 const step=acousticEvent(0,0,10,'step'),sprint=acousticEvent(0,0,10,'sprint');
 const gun=acousticEvent(0,0,10,'shot'),radio=acousticEvent(0,0,10,'radio');
 assert.equal(audible(step,{x:5,z:0},11),false);
 assert.equal(audible(sprint,{x:5,z:0},11),true);
 assert.equal(audible(gun,{x:13,z:0},13),true);
 assert.equal(audible(radio,{x:10,z:0},12),true);
 assert.equal(audible(radio,{x:10,z:0},12,()=>false),false);
 assert.equal(audible(gun,{x:15,z:0},12,()=>false),false);
 assert.equal(audible(gun,{x:2,z:0},18),false,'noise must expire');
});
test('illuminating the same silhouette long enough reveals the familiar object without shooting',()=>{
 const w=world(),e=entity('coat');
 let result;
 for(let t=0;t<1.1;t+=.1)result=updatePresence(e,{world:w,player,torch:true,time:t,dt:.1,noise:null});
 assert.equal(result.resolved,true);
 assert.ok(result.stressDelta<0);
 const d=entity('figure');for(let t=0;t<1.6;t+=.1)result=updatePresence(d,{world:w,player,torch:true,time:t,dt:.1,noise:null});
 assert.equal(result.resolved,true);
});
test('flashlight requires line of sight, correct direction, and line of sight remains respected at doors',()=>{
 const e=entity('coat');
 assert.equal(insideTorch(player,e,world()),true);
 assert.equal(insideTorch({...player,yaw:Math.PI},e,world()),false);
 assert.equal(insideTorch(player,e,world(false)),false);
 let r;
 for(let i=0;i<24;i++)r=updatePresence(e,{world:world(false),player,torch:true,time:i*.1,dt:.1,noise:null});
 assert.equal(r.resolved,false,'cannot recognize through a closed door');
});
test('perceived figures follow a gunshot sound but cannot move through furniture',()=>{
 const e=entity('figure'),p={...player,x:3,z:3,yaw:0},noise=acousticEvent(0,0,0,'shot');
 const before=e.z;
 const result=updatePresence(e,{world:world(),player:p,noise,torch:false,time:1,dt:.5});
 assert.equal(result.heard,true);
 assert.equal(e.attention,'sound');
 assert.ok(e.z>before);
 const stuck=entity('figure');updatePresence(stuck,{world:world(true,false),player:p,noise,torch:false,time:1,dt:.5});
 assert.deepEqual([stuck.x,stuck.z],[0,-3]);
});
test('uncued hallucinations do not home in on the player through solid walls',()=>{
 const e=entity('figure'),farPlayer={x:12,z:12,yaw:0};
 const w=world(false);
 updatePresence(e,{world:w,player:farPlayer,torch:false,time:4,dt:.2,noise:null});
 assert.equal(e.attention,'none');
 assert.deepEqual([e.x,e.z],[0,-3]);
 assert.equal(shouldDespawn({...e,age:32},w),true);
});
test('spatial acoustic cue has meaningful left/right direction and never invents a distance',()=>{
 const left=presenceCue({x:-5,z:-2},player),right=presenceCue({x:5,z:-2},player);
 assert.ok(left.pan<0&&right.pan>0);
 assert.ok(Math.abs(left.distance-Math.sqrt(29))<.001);
});
