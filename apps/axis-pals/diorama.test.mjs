import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {campaign,endless,solve} from './engine.js';
import {tileHash,sceneFingerprint,scenePlan,drawDiorama,isWall} from './diorama.js';
const maps=[campaign(0),campaign(5),campaign(11),endless(13),endless(411)];
function mockCanvas(){
 const state={fills:0,strokes:0,labels:[]};
 const c={
  setTransform(){},save(){},restore(){},fillRect(){state.fills++},
  strokeRect(){state.strokes++},beginPath(){},roundRect(){},arc(){},lineTo(){},moveTo(){},
  fill(){state.fills++},stroke(){state.strokes++},fillText(text){state.labels.push(text)},
  createLinearGradient(){return {addColorStop(){}}},
  createRadialGradient(){return {addColorStop(){}}}
 };
 return {c,state};
}
test('diorama layout is deterministic and never changes the source grid',()=>{
 for(const level of maps){
  const before=JSON.stringify(level);
  const a=scenePlan(level),b=scenePlan(level);
  assert.deepEqual(a,b);
  assert.equal(a.floor.length+a.walls.length,level.width*level.height);
  assert.equal(a.goals.length,2);
  assert.ok(a.walls.length>0);
  for(const t of a.floor)assert.equal(isWall(level,t.x,t.y),false);
  for(const t of a.walls)assert.equal(isWall(level,t.x,t.y),true);
  for(const t of a.goals){
   assert.equal(isWall(level,t.x,t.y),false,'dock overlaps impassable rack');
   assert.equal(t.x,level.goals[t.robot].x);
   assert.equal(t.y,level.goals[t.robot].y);
  }
  for(const shadow of a.shadows){
   assert.equal(isWall(level,shadow.x,shadow.y),false,'soft shadow source must lie on floor');
   assert.ok(shadow.edge==='left'||shadow.edge==='top');
  }
  assert.equal(JSON.stringify(level),before);
  assert.ok(solve(level),'visual process changed BFS solvability');
 }
});
test('texture variation is deterministic and sensitive to seed and coordinates',()=>{
 const a=tileHash(42,2,3),b=tileHash(42,2,3);
 assert.equal(a,b);assert.notEqual(a,tileHash(43,2,3));
 assert.notEqual(a,tileHash(42,3,2));assert.ok(a>=0&&a<=0xffffffff);
});
test('cache fingerprint changes on every relevant scene dimension',()=>{
 const l=maps[0],base=sceneFingerprint(l,420,420,2);
 assert.equal(base,sceneFingerprint(l,420,420,2));
 assert.notEqual(base,sceneFingerprint(l,320,420,2));
 assert.notEqual(base,sceneFingerprint(l,420,420,1));
 assert.notEqual(base,sceneFingerprint({...l,map:l.map((r,i)=>i===0?r.replace('#',' '):r)},420,420,2));
 assert.notEqual(base,sceneFingerprint({...l,goals:[{x:l.goals[0].x+13,y:l.goals[0].y},l.goals[1]]},420,420,2));
});
test('renderer draws five solved layouts in narrow and wide tile scales without invalid geometry',()=>{
 for(const level of maps)for(const size of [16,32,70]){
  const {c,state}=mockCanvas(),before=JSON.stringify(level);
  const plan=drawDiorama(c,level,size,2);
  assert.ok(plan.floor.length&&plan.walls.length);
  assert.deepEqual(state.labels,['Y','X'],'two visible physical loading labels');
  assert.ok(state.fills>level.width*level.height);
  assert.ok(state.strokes>2);
  assert.equal(JSON.stringify(level),before);
 }
});
test('client caches environment instead of redrawing racks each animation frame',async()=>{
 const src=await readFile(new URL('./app.js',import.meta.url),'utf8');
 assert.match(src,/sceneFingerprint\(lvl,canvas\.width,canvas\.height,d\)/);
 assert.match(src,/if\(key!==sceneKey\|\|!sceneCache\)/);
 assert.match(src,/drawDiorama\(sc,lvl,u,d\)/);
 assert.match(src,/if\(sceneCache\)ctx\.drawImage/);
 assert.match(src,/sceneCache=null;sceneKey=''/);
});
