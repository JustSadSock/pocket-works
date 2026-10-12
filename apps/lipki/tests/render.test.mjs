import test from 'node:test';
import assert from 'node:assert/strict';
import {draw} from '../art.js';
import {LEVELS,COLORS,initialize,getView} from '../physics.js';

const members=[{id:'one',name:'P1'},{id:'two',name:'P2'}];
function canvasMock(width,height){
 const state={fillStyle:null},filled=[],texts=[],drawCalls=[];
 const ctx=new Proxy(state,{
  get(target,key){
   if(key==='fill')return ()=>{filled.push(target.fillStyle);drawCalls.push('fill')};
   if(key==='fillText')return (txt)=>{texts.push(String(txt));drawCalls.push('text')};
   if(key==='stroke')return ()=>{drawCalls.push('stroke')};
   if(key==='setTransform')return ()=>{drawCalls.push('setTransform')};
   if(key in target)return target[key];
   return ()=>{};
  },set(target,key,value){target[key]=value;return true;}
 });
 return {canvas:{width:0,height:0,getBoundingClientRect:()=>({width,height}),getContext:()=>ctx},filled,texts,drawCalls};
}
test('Every stage renders through the last hero on phone and desktop',()=>{
 globalThis.window={devicePixelRatio:1};
 for(const [width,height] of [[390,780],[890,750],[1300,725],[1680,720]]){
  for(let level=0;level<LEVELS.length;level++){
   const w=initialize(members,level),mock=canvasMock(width,height);
   assert.doesNotThrow(()=>draw(mock.canvas,getView(w),{me:'one',time:1.3}),`level ${level+1}, screen ${width}x${height}`);
   assert.ok(mock.filled.includes(COLORS[0]),`first hero must render in level ${level+1}`);
   assert.ok(mock.filled.includes(COLORS[1]),`second hero must render in level ${level+1}`);
  }
 }
});
test('Stage five renders two coil crowns and both sigils before the players',()=>{
 globalThis.window={devicePixelRatio:1};
 const mock=canvasMock(1300,725);
 assert.doesNotThrow(()=>draw(mock.canvas,getView(initialize(members,4)),{me:'one',time:2.6}));
 assert.ok(mock.filled.filter(color=>color==='#dfad5e').length>=2,'both coil crowns visible');
 assert.ok(mock.filled.filter(color=>color==='#f5d575').length>=2,'both stars visible');
 assert.ok(mock.filled.includes('#bc7467'),'locked gate visible');
 assert.ok(mock.filled.includes(COLORS[0])&&mock.filled.includes(COLORS[1]),'players visible');
});
test('Two-player camera redraws safely while separated',()=>{
 globalThis.window={devicePixelRatio:1};
 const w=initialize(members,4);w.players[0].x=270;w.players[0].y=215;
 w.players[1].x=860;w.players[1].y=490;
 for(const [width,height] of [[390,750],[1300,725]]){
  const mock=canvasMock(width,height);
  for(let i=0;i<10;i++)assert.doesNotThrow(()=>draw(mock.canvas,getView(w),{group:true,time:i/6}));
 }
});
