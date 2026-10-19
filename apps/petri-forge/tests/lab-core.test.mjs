import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS,SCENARIOS,WIDTH,HEIGHT,TILE,GridEnvironment,QAgent,RandomAgent,createScenario,validateScene,playEpisode,seeded} from '../lab-core.mjs';

test('every scenario is deterministic, valid and has a guaranteed route',()=>{
  for(const {id} of SCENARIOS){
    const scene=createScenario(id,41);
    assert.deepEqual(scene,createScenario(id,41),id);
    assert.deepEqual(validateScene(scene),scene,id);
    assert.equal(scene.grid.length,HEIGHT);assert.equal(scene.grid[0].length,WIDTH);
    assert.equal(scene.grid[2].slice(1,WIDTH-1).every(cell=>cell!==TILE.WALL),true,id);
    assert.equal(scene.grid[HEIGHT-3].slice(1,WIDTH-1).every(cell=>cell!==TILE.WALL),true,id);
  }
});
test('invalid scenes, illegal actions and corrupted model data are rejected',()=>{
  const scene=createScenario('corridor',1);scene.grid[0][0]=999;
  assert.throws(()=>validateScene(scene));
  const env=new GridEnvironment();
  assert.throws(()=>env.step('TELEPORT'));
  const model=new QAgent();
  assert.throws(()=>model.load({type:'qlearning',version:1,q:[['bad',[NaN,0,0,0,0]]]}));
  assert.throws(()=>model.load({type:'qlearning',version:1,q:[['bad',[1,2]]]}));
});
test('collected rewards only pay once per episode, reset restores them',()=>{
  const env=new GridEnvironment(8,8);const grid=Array.from({length:8},()=>Array(8).fill(0));
  grid[1][2]=TILE.REWARD;env.setScene({grid,spawn:[1,1],goal:[6,6]});
  const [,first]=env.step('RIGHT');env.step('LEFT');const [,second]=env.step('RIGHT');
  assert.ok(first>second+.40,'reward must not be farmed repeatedly');
  env.reset([1,1],[6,6]);const [,third]=env.step('RIGHT');
  assert.equal(third,first);
});
test('wall collisions remain within bounds and terminal goals are stable',()=>{
  const env=new GridEnvironment(8,8);
  env.setScene({grid:Array.from({length:8},()=>Array(8).fill(0)),spawn:[1,1],goal:[2,1]});
  env.step('LEFT');env.step('UP');assert.deepEqual([env.ax,env.ay],[0,0]);
  env.step('RIGHT');env.step('DOWN');env.step('RIGHT');
  assert.equal(env.success,true);const before=env.totalReward;
  const [,r,done]=env.step('LEFT');assert.equal(r,0);assert.equal(done,true);assert.equal(env.totalReward,before);
});
test('Q-learning improves against its initial performance on the same curriculum',()=>{
  const scene=createScenario('corridor',41),agent=new QAgent(111);
  let early=0,late=0;
  for(let i=0;i<550;i++){
    const result=playEpisode(agent,scene,{maxSteps:320,learn:true});
    if(i<50)early+=Number(result.success);
    if(i>=450)late+=Number(result.success);
  }
  assert.ok(late>=70,'must solve >=70% of final 100 runs');
  assert.ok(late>early,'learning must beat the first fifty runs');
});
test('brain snapshot restores its learned Q values exactly',()=>{
  const a=new QAgent(19),scene=createScenario('maze',53);
  for(let i=0;i<50;i++)playEpisode(a,scene,{learn:true});
  const snapshot=a.serialize(),b=new QAgent(34);b.load(snapshot);
  assert.deepEqual(b.serialize(),snapshot);
});
test('recorded replay starts at spawn, ends with the result and never leaves the map',()=>{
  const scene=createScenario('hazards',5);
  const result=playEpisode(new RandomAgent(4),scene,{maxSteps:110,trace:true});
  assert.equal(result.trace.length,result.steps+1);
  assert.deepEqual([result.trace[0].x,result.trace[0].y],scene.spawn);
  for(const p of result.trace){assert.ok(p.x>=0&&p.x<WIDTH&&p.y>=0&&p.y<HEIGHT);}
});
test('seeded RNG is reproducible and stays in [0,1)',()=>{
  const a=seeded(123),b=seeded(123);
  for(let i=0;i<100;i++){const x=a();assert.equal(x,b());assert.ok(x>=0&&x<1);}
});
