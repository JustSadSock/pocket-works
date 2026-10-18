import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoundscape} from '../soundscape.mjs';
import {Renderer,animateViewmodel} from '../renderer.mjs';
import {Apartment,HOME} from '../apartment.mjs';

test('weapon recoil and reload have explicit independent poses without mutating geometry',()=>{
 const base=[.50,-.52,-1.85,.2,.2,.2,0,0,1,9,.42,-.92,-1.12,.5,.3,.1,0,0,1,8];
 const frozen=[...base];
 assert.deepEqual(animateViewmodel(base,{time:0,recoil:0,reload:0,movement:0,reduceMotion:true}),base);
 const shot=animateViewmodel(base,{time:0,recoil:1,reduceMotion:true});
 assert.ok(shot[1]>base[1]&&shot[2]>base[2],'recoil pulls back towards eye and raises weapon');
 const reloading=animateViewmodel(base,{time:2,reload:.5,recoil:0});
 assert.ok(Math.abs(reloading[1]-base[1])>.17,'drum must lower and rotate during reload');
 assert.deepEqual(base,frozen,'base mesh must never be mutated');
});
test('the acoustic engine disables safely, never needs remote sound files and recovers after resume',async()=>{
 const timeline=[];class FakeContext{
  constructor(){this.sampleRate=22050;this.currentTime=0;this.destination={};this.state='running';timeline.push('context')}
  createBuffer(_channels,length){return {getChannelData:()=>new Float32Array(length)}}
  createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}
  createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start:()=>timeline.push('note'),stop(){}}}
  createBufferSource(){return {connect(){},start:()=>timeline.push('noise'),stop(){}}}
  createBiquadFilter(){return {frequency:{value:0},connect(){},type:'lowpass'}}
  createStereoPanner(){return {pan:{value:0},connect(){}}}
  suspend(){this.state='suspended';timeline.push('suspend');return Promise.resolve()}
  resume(){this.state='running';timeline.push('resume');return Promise.resolve()}
  close(){this.state='closed';return Promise.resolve()}
 }
 const s=createSoundscape({Context:FakeContext});
 s.setEnabled(false);assert.equal(s.event('shot'),false);assert.equal(timeline.length,0);
 s.setEnabled(true);s.event('shot');assert.ok(timeline.includes('note')&&timeline.includes('noise'));
 const before=timeline.length;s.tick({elapsed:12,room:'Гостиная',stress:95});
 assert.ok(timeline.length>before,'tension must be audible');
 s.setEnabled(false);await Promise.resolve();const n=timeline.length;s.event('footstep');assert.equal(timeline.length,n,'muting must stop output');
 s.setEnabled(true);s.event('reload');assert.ok(timeline.length>n);
 s.dispose();
});
test('WebGL renderer builds furnished chapter, actors and animated viewmodel with a mock GPU',()=>{
 let draws=0,triangles=0,uploads=0;
 const gl=new Proxy({
  VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,COMPILE_STATUS:35713,LINK_STATUS:35714,
  DEPTH_TEST:2929,LEQUAL:515,ARRAY_BUFFER:34962,STATIC_DRAW:35044,DYNAMIC_DRAW:35048,
  FLOAT:5126,TRIANGLES:4,COLOR_BUFFER_BIT:16384,DEPTH_BUFFER_BIT:256,
  createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,
  getProgramParameter:()=>true,getShaderInfoLog:()=>'',getProgramInfoLog:()=>'',getAttribLocation:()=>1,
  getUniformLocation:()=>({}),bufferData:(_type,arr)=>{uploads++;assert.equal(arr.length%10,0,'vertex strides are corrupt');},
  drawArrays:(_mode,_first,count)=>{draws++;triangles+=count/3;}
 },{get(obj,key){return key in obj?obj[key]:()=>{}}});
 const canvas={width:0,height:0,getContext:()=>gl,addEventListener(){},getBoundingClientRect(){return {width:390,height:844}}};
 const oldWindow=globalThis.window;
 globalThis.window={devicePixelRatio:1.8,innerWidth:390};
 try{
  const render=new Renderer(canvas),world=new Apartment(334),hero={...HOME,bob:0,yaw:0,pitch:0,movement:.45};
  const items=['album','pills','photo','keys'].map(k=>world.itemPosition(k));
  render.draw(world,hero,[{x:10,z:5,kind:'coat',age:2},{x:6,z:7,kind:'figure',age:4}],items,true,12,0,1,.5);
  assert.ok(draws>=3&&triangles>1500,'living 3D scene must have furniture and dynamic actors');
  assert.ok(triangles<80000,'keep mobile mesh budget bounded');
  render.draw(world,hero,[],[],false,13,0,0,0);
  assert.ok(uploads>=5,'weapon buffer must animate each frame');
 }finally{globalThis.window=oldWindow}
});
