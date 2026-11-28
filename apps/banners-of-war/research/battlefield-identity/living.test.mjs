import assert from 'node:assert/strict';
import {annotateMotionFrames,motionPose} from './motion.js';
import {synth,soundEvents} from './battle-audio.js';
let u={id:1,side:0,type:'spear',x:10,y:10,v:1,n:120,cohesion:100,order:{kind:'advance'}},a={time:0,units:[u],shots:[]},b={time:1,units:[{...u,x:11}],shots:[]};
let before=JSON.stringify([a,b]),frames=annotateMotionFrames([a,b]);assert.equal(JSON.stringify([a,b]),before);assert.equal(frames[1].units[0].motionDistance,1);assert.deepEqual(frames,annotateMotionFrames([a,b]));let p=frames[1].units[0];assert.equal(motionPose(p,p,0,4,frames[1],1,false),motionPose(p,p,0,4,frames[1],1,false));assert.equal(motionPose({...p,v:0},{...p,pressure:2},0,4,frames[1],1,true),21);
for(let k of ['step','hoof','armor','contact','volley','signal','retreat','wind','water','forest']){let a=synth(k,0),b=synth(k,0);assert.deepEqual(a,b);assert(a.some(x=>Math.abs(x)>.01));assert(a.every(x=>Number.isFinite(x)&&Math.abs(x)<=.850001));assert.notDeepEqual(a,synth(k,1))}
let F={alive:u=>u.n>0,spec:u=>({horse:u.type==='knight'?1:0}),visible:(s,side,u)=>u.side===0},cam={x:10,y:10,axis:'tactical'},enemy={...u,id:100,side:1,contact:3},state={time:0,fog:true,units:[u,enemy],shots:[]};let r=soundEvents(F,state,cam,new Map(),0);assert(!r.next.has(100));state={...state,time:1,units:[{...u,motionDistance:1},enemy],shots:[{id:100,time:.5,x:10,y:10}]};let next=soundEvents(F,state,cam,r.next,1);assert(next.events.some(x=>x.kind==='step'));assert(next.events.every(x=>x.id===1));assert(next.events.length<=8);
console.log('Motion deterministic, source immutable, ten original sound families, hidden enemy silence, bounded event aggregation');

// Visual gait phases must track actual cohesion, not alter simulation state.
let formation={...u,v:1,motionDistance:0};
let phases=cohesion=>new Set(Array.from({length:128},(_,seed)=>motionPose({...formation,cohesion},{cohesion},0,4,{time:0,shots:[]},seed,false,true)));
assert(phases(100).size<=2);assert(phases(0).size>=3);
