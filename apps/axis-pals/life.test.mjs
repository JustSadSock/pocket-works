import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {describeMove,bumpMotion} from './actors.js';
import {makeReaction,reactionFrame,idleMoment,drawReactions,REACTION_MS} from './life.js';
import {campaign,step,solve,solved} from './engine.js';

const level={goals:[{x:2,y:1},{x:5,y:1}]};
const from=[{x:1,y:1},{x:4,y:1}];
const to=[{x:2,y:1},{x:5,y:1}];
function motion(p,q,dir='right',at=1000){return describeMove(p,q,at,dir)}
test('a delivery is celebrated even if the other robot hits a wall',()=>{
 const a=[{x:1,y:1},{x:4,y:1}],b=[{x:2,y:1},{x:4,y:1}];
 const reaction=makeReaction(motion(a,b),level,'play',1000);
 assert.equal(reaction.kind,'arrival');assert.deepEqual(reaction.faces,['proud','reassure']);
 assert.equal(reaction.duration,REACTION_MS.arrival);
});
test('wall rejection produces two different emotional characters',()=>{
 const blocked=makeReaction(bumpMotion(from,1000,'up'),level,'play',1000);
 assert.deepEqual(blocked.faces,['startled','grumble']);assert.equal(blocked.kind,'blocked');
 const m=motion([{x:1,y:4},{x:4,y:1}],[{x:1,y:4},{x:5,y:1}]);
 const partner=makeReaction(m,{goals:[{x:2,y:1},{x:6,y:1}]},'play',1000);
 assert.equal(partner.kind,'partner');assert.deepEqual(partner.faces,['startled','reassure']);
});
test('undo, loss and cooperative win are different resolved visual stories',()=>{
 const undo=motion(to,from);undo.kind='undo';
 assert.equal(makeReaction(undo,level,'play',1000).kind,'relief');
 const m=motion(from,to);
 assert.equal(makeReaction(m,level,'lost',1000).kind,'comfort');
 const success=makeReaction(m,level,'won',1000);
 assert.equal(success.kind,'duet');assert.deepEqual(success.faces,['cheer','cheer']);
 assert.ok(success.duration>1000&&success.duration<1500);
 assert.deepEqual(success.positions,to);
});
test('moving in close formation triggers just a nod, not a full victory celebration',()=>{
 const a=[{x:1,y:1},{x:2,y:1}],b=[{x:1,y:2},{x:2,y:2}];
 const r=makeReaction(motion(a,b,'down'),{goals:[{x:6,y:6},{x:7,y:7}]},'play',1000);
 assert.equal(r.kind,'nearby');assert.deepEqual(r.faces,['curious','wave']);
});
test('reactions are deterministic across network peers regardless of local frame time',()=>{
 const m=motion(from,to);
 const a=makeReaction(m,level,'won',1000),b=makeReaction(m,level,'won',9999);
 assert.equal(a.kind,b.kind);
 assert.deepEqual(a.faces,b.faces);
 assert.deepEqual(a.positions,b.positions);
 for(const t of [0,100,500,900]){
  const state=reactionFrame(a,1000+t),other=reactionFrame(b,9999+t);
  assert.equal(state.kind,other.kind);assert.equal(state.progress,other.progress);
 }
});
test('motion reduction keeps readable static faces but suppresses decoration',()=>{
 const r=makeReaction(motion(from,to),level,'won',1000);
 const frame=reactionFrame(r,1100,true);
 assert.deepEqual(frame.faces,['cheer','cheer']);assert.equal(frame.motion,0);
 const canvas={state:0,save(){this.state++},restore(){this.state--}};
 drawReactions(canvas,r,to,55,1100,true);
 assert.equal(canvas.state,0);
 assert.equal(reactionFrame(r,1000+r.duration),null);
 assert.equal(makeReaction(null,level),null);
});
test('idle is a single brief event after actual inactivity, never periodic dancing',()=>{
 assert.equal(idleMoment(0,100),null);
 assert.equal(idleMoment(0,6250,true),null);
 assert.equal(idleMoment(0,6249),null);
 assert.equal(idleMoment(0,6670),null);
 assert.equal(idleMoment(0,26000),null);
 const tick=idleMoment(0,6440);
 assert.equal(tick.id,0);assert.equal(tick.face,'curious');assert.ok(tick.strength>0);
});
test('non-reduced rendering draws temporary gestures in cell-local coordinates',()=>{
 const r=makeReaction(motion(from,to),level,'won',1000);
 const state={lines:0,dots:0,strokes:0};
 const ctx={
  save(){},restore(){},translate(){},rotate(){},setLineDash(){},beginPath(){},
  moveTo(){state.lines++},lineTo(){state.lines++},stroke(){state.strokes++},
  arc(){state.dots++},fill(){}
 };
 drawReactions(ctx,r,to,48,1550,false);
 assert.ok(state.lines>0);assert.ok(state.strokes>0);
 assert.deepEqual(to,[{x:2,y:1},{x:5,y:1}]);
});
test('actual campaign finish is unchanged by expression planning',()=>{
 const lvl=campaign(0),answer=solve(lvl);
 assert.ok(answer?.path?.length);
 let positions=lvl.starts.map(p=>({...p}));
 let last=null;
 for(const dir of answer.path){const next=step(lvl,positions,dir);assert.ok(next.moved);last=motion(positions,next.positions,dir);positions=next.positions}
 assert.ok(solved(lvl,positions));
 const before=JSON.stringify(lvl),reaction=makeReaction(last,lvl,'won',1000);
 assert.equal(reaction.kind,'duet');assert.equal(JSON.stringify(lvl),before);
});
test('client integrates local, PocketNet and reduced motion without changing server data',async()=>{
 const src=await readFile(new URL('./app.js',import.meta.url),'utf8');
 assert.match(src,/lifeReaction=makeReaction\(visual,g\.level,g\.phase,visual\.at\)/);
 assert.match(src,/makeReaction\(visual,next\.level,next\.phase,visual\?\.at\)/);
 assert.match(src,/drawReactions\(ctx,lifeReaction,positions,u,now,reduced\)/);
 assert.match(src,/reactionFrame\(lifeReaction,now,reduced\)/);
 assert.match(src,/requestAnimationFrame\(tick\)/);
});
