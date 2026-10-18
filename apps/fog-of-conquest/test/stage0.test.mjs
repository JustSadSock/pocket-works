import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../js/save-schema.js';
const {normalize,SAVE_VERSION}=globalThis.FogSaveSchema;
const server=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const pinned=await readFile(new URL('../../../pocketnet/module-versions/fog-of-conquest/v4.ts',import.meta.url),'utf8');
const game=await import('data:text/javascript;base64,'+Buffer.from(server).toString('base64'));
const sizes=[['tiny',5,8],['small',10,15],['medium',20,30],['large',20,60]];
const makeSave=(g,extras={})=>({
 version:SAVE_VERSION,timestamp:Date.now(),map:g.map,units:g.units,
 buildings:g.buildings,state:g.state,mapSize:'medium',
 nextUnitId:g.nextUnitId,replayEvents:[],
 mode:'ai',aiMode:true,aiLevel:6,modeBeta:g.modeBeta,...extras
});
test('new server and immutable v4 are exact copies; pinned v2/v3 untouched',()=>{
 assert.equal(server,pinned);
});
test('P0: every beta size admits valid BOG positions and private initial views',()=>{
 for(const [size,rows,cols] of sizes)for(let i=0;i<75;i++){
   const g=game.createOriginalMatch({size,beta:true});
   assert.equal(g.rows,rows);assert.equal(g.cols,cols);
   const bogs=g.units.filter(u=>u.type==='bog');
   assert.equal(bogs.length,2,size+' '+i);
   for(const u of g.units){
     assert.ok(u.r>=0&&u.r<rows&&u.c>=0&&u.c<cols,JSON.stringify({size,u}));
   }
   assert.equal(new Set(g.units.map(u=>u.r+','+u.c)).size,g.units.length);
   for(const b of bogs)assert.equal(g.buildings.some(x=>x.r===b.r&&x.c===b.c),false);
   const m=game.default;
   const p1={id:'p1',name:'One'},p2={id:'p2',name:'Two'};
   const state={phase:'battle',host:'p1',seats:[p1,p2],revision:1,game:g};
   for(const p of [p1,p2])assert.equal(m.viewForPlayer({state,player:p}).game.units.some(u=>u.type==='bog'&&u.owner===(p===p1?1:2)),true);
 }
});
test('P0: AI difficulty, beta mode, map and turn state survive canonical save',()=>{
 for(const [size] of sizes)for(const beta of [true,false]){
   const g=game.createOriginalMatch({size,beta});
   const s=normalize(makeSave(g,{mode:beta?'beta':'ai',aiMode:!beta,modeBeta:beta}));
   assert.equal(s.mapSize,size);assert.equal(s.modeBeta,beta);
   assert.equal(s.aiMode,!beta);assert.equal(s.aiLevel,6);
   assert.equal(s.units.length,g.units.length);
   assert.deepEqual(s.state.fog,g.state.fog);
   assert.deepEqual(s.state.seen,g.state.seen);
   assert.equal(s.nextUnitId,g.nextUnitId);
 }
});
test('P0: missing opponent private fog is rejected BEFORE restoration',()=>{
 const g=game.createOriginalMatch({size:'medium'});
 const local=makeSave(g);
 delete local.state.fog[2];
 assert.throws(()=>normalize(local),/тумана/);
});
test('P0: malformed units, map, future versions and server snapshots are rejected',()=>{
 const g=game.createOriginalMatch({size:'medium'});
 for(const change of [
  s=>{s.units[0].r=-1;},s=>{s.units[0].c=100;},
  s=>{s.units[1].id=s.units[0].id;},s=>{s.version=9;},
  s=>{s.onlineGame=true;},s=>{s.map[0][0]=99;},
  s=>{s.state.gold[1]=-100;}
 ]){
  const data=structuredClone(makeSave(g));change(data);
  assert.throws(()=>normalize(data));
 }
});
test('legacy version 2 can be upgraded without inventing its lost AI metadata',()=>{
 const g=game.createOriginalMatch({size:'medium'});
 const old=makeSave(g);
 old.version=2;
 for(const key of ['mode','modeBeta','aiMode','aiLevel'])delete old[key];
 const restored=normalize(old);
 assert.equal(restored.mode,'hotseat');assert.equal(restored.legacyModeUnknown,true);
 assert.equal(restored.aiMode,false);
});
