import test from 'node:test';
import assert from 'node:assert/strict';
import {RogueWorld} from '../rogue-world.mjs';
import {DOOR_SWING,doorKey,doorSegment,leafBlocksPoint,leafIntersectsRay,sweptLeafSafe} from '../rogue-doors.mjs';
import {rogueDoorMesh} from '../rogue-door-visual.mjs';

const settle=(w)=>{for(let i=0;i<9;i++)w.animateDoors(.12,[])};
function across(d){
 const x=d.x+.5,z=d.z+.5;
 if(d.side==='left')return[x+1,z,x-1,z];
 if(d.side==='right')return[x-1,z,x+1,z];
 if(d.side==='south')return[x,z+1,x,z-1];
 return[x,z-1,x,z+1]
}
test('four physical hinge orientations align with closed leaf collision and sightline',()=>{
 for(const side of ['left','right','north','south']){
  const d={id:'0,0:0',x:8,z:8,side};
  const [ax,az,bx,bz]=across(d);
  assert.ok(leafIntersectsRay(d,0,ax,az,bx,bz),'closed '+side+' should occlude');
  assert.equal(leafIntersectsRay(d,DOOR_SWING,ax,az,bx,bz),false,'open '+side+' should show');
  assert.equal(leafBlocksPoint(d,0,d.x+.5,d.z+.5,.20),true);
  assert.equal(leafBlocksPoint(d,DOOR_SWING,d.x+.5,d.z+.5,.11),false);
  const shape=doorSegment(d,DOOR_SWING);
  assert.ok(Number.isFinite(shape.b.x)&&Number.isFinite(shape.b.z));
 }
});
test('door toggling updates line of sight and physical traversal (not just decoration)',()=>{
 for(const seed of [222,413,8787,4,14]){
  const w=new RogueWorld(seed),c=w.chunk(0,0);
  let closed=c.doors.find(d=>!w.doorState(d,c).open);
  assert.ok(closed);
  const ray=across(closed);
  assert.equal(w.visibleTiles(...ray),true);
  assert.equal(w.visible(...ray),false);
  assert.equal(w.canStand(closed.x+.5,closed.z+.5,.11),false);
  const result=w.toggleDoor(closed,[]);
  assert.equal(result.ok,true);
  settle(w);
  assert.equal(w.doorState(closed,c).open,true);
  assert.ok(w.canStand(closed.x+.5,closed.z+.5,.11));
  assert.equal(w.visible(...ray),true);
  assert.equal(w.toggleDoor(closed,[]).ok,true);
  settle(w);
  assert.equal(w.visible(...ray),false)
 }
});
test('door cannot close on player/enemy, and has continuous collision-safe animation',()=>{
 const w=new RogueWorld(222),c=w.chunk(0,0),d=c.doors.find(x=>!w.doorState(x,c).open);
 assert.ok(w.toggleDoor(d,[]).ok);settle(w);
 const actor={x:d.x+.5,z:d.z+.5};
 assert.equal(w.canStand(actor.x,actor.z,.11),true);
 assert.equal(w.toggleDoor(d,[actor]).ok,false);
 assert.equal(w.doorState(d,c).open,true);
 assert.equal(sweptLeafSafe(d,DOOR_SWING,0,[actor]),false);
 assert.equal(w.toggleDoor(d,[]).ok,true);
 const past=w.doorState(d,c).angle;
 for(let i=0;i<9;i++)w.animateDoors(.12,[actor]);
 const stopped=w.doorState(d,c).angle;
 assert.ok(stopped>0&&stopped<past,'panel should approach the actor before stopping');
 assert.equal(w.canStand(actor.x,actor.z,.11),true,'no door crosses the actor');
 w.animateDoors(.12,[actor]);
 assert.equal(w.doorState(d,c).angle,stopped,'closing waits when the next sweep is occupied');
 w.animateDoors(.12,[]);
 assert.ok(w.doorState(d,c).angle<stopped,'closing resumes when the actor has left')
});
test('open angle, random world identity and door state survive save/reload',()=>{
 const w=new RogueWorld(413),c=w.chunk(0,0),d=c.doors.find(x=>!w.doorState(x,c).open);
 w.toggleDoor(d,[]);w.animateDoors(.12,[]);
 const original=w.doorState(d,c),copy=new RogueWorld(413,w.save());
 const saved=copy.chunk(0,0).doors.find(x=>doorKey(x,copy.chunk(0,0).epoch)===doorKey(d,c.epoch));
 assert.ok(saved);
 assert.deepEqual(copy.doorState(saved),original);
 assert.equal(copy.layoutVersion,3);
 settle(copy);
 assert.equal(copy.doorState(saved).angle,DOOR_SWING);
 const old=new RogueWorld(413,{epochs:[],visited:[],taken:[],changes:0,depth:0});
 assert.equal(old.layoutVersion,1);
 assert.ok(old.chunk(0,0).doors.every(door=>old.doorState(door).open),'old saved run was previously doorless')
});
test('behind-player sector rewrite destroys obsolete door states',()=>{
 const w=new RogueWorld(8787),c=w.chunk(0,0),d=c.doors[0];
 w.toggleDoor(d,[]);settle(w);
 const key=doorKey(d,c.epoch);
 assert.ok(w.doorStates.has(key));
 w.tick(9.5,9.5,0,0);
 w.tick(10.2,9.5,Math.PI/2,1);
 w.tick(18.5,9.5,Math.PI/2,3);
 w.tick(27.5,9.5,Math.PI/2,9);
 w.tick(28.5,9.5,Math.PI/2,14);
 assert.ok(w.chunk(0,0).epoch>0);
 assert.equal(w.doorStates.has(key),false);
 assert.equal(w.canStand(28.5,9.5),true)
});
test('closed doors alter enemy pathfinding; opened doors restore paths',()=>{
 const w=new RogueWorld(8787),c=w.chunk(0,0),d=c.doors[0];
 if(w.doorState(d,c).open){w.toggleDoor(d,[]);settle(w)}
 const [ax,az,bx,bz]=across(d);
 assert.equal(w.visible(ax,az,bx,bz),false);
 const blocked=w.findStep(ax,az,bx,bz,800);
 // The room has a single entrance except a rare alternate accessible route.
 assert.equal(blocked,null);
 w.toggleDoor(d,[]);settle(w);
 assert.ok(w.findStep(ax,az,bx,bz,800));
});
test('door models animate from the same segments as the collision solver',()=>{
 const w=new RogueWorld(222),o=[],player={x:9.5,z:9.5};
 rogueDoorMesh(o,w,player);
 const before=[...o],count=o.length;
 assert.equal(o.length%10,0);
 assert.ok(o.length>2000&&o.every(Number.isFinite));
 const c=w.chunk(0,0),door=c.doors.find(x=>!w.doorState(x,c).open);
 w.toggleDoor(door,[]);settle(w);
 o.length=0;rogueDoorMesh(o,w,player);
 assert.equal(o.length,count);
 assert.notDeepEqual(o,before);
 assert.ok(o.every(Number.isFinite))
});
