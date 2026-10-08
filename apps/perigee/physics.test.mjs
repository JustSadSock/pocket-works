import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGE_COUNT,STEP,MAX_STEPS,stageAt,launchVector,makeCraft,advanceCraft,predict,safeReadProgress} from './physics.js';

test('all six sectors have sensible orbital scenes',()=>{
  assert.equal(STAGE_COUNT,6);
  for(let i=0;i<STAGE_COUNT;i++){
    const s=stageAt(i,1750);
    assert.ok(s.start.x>0&&s.start.x<1000&&s.start.y>0&&s.start.y<1750);
    assert.ok(s.target.radius>=70&&s.planets.length>=1);
    for(const p of s.planets)assert.ok(p.mass>0&&p.r>0);
  }
});
test('launch scales with drag distance and rejects accidental taps',()=>{
  assert.equal(launchVector({x:0,y:0},{x:10,y:0}),null);
  assert.ok(launchVector({x:0,y:0},{x:100,y:0}).speed<launchVector({x:0,y:0},{x:300,y:0}).speed);
});
test('preview and real flight produce identical coordinates and collision outcomes',()=>{
  for(let i=0;i<STAGE_COUNT;i++){
    const s=stageAt(i,1750);
    for(const angle of [-1.1,-.44,.42,1.2]){
      const v={vx:620*Math.cos(angle),vy:620*Math.sin(angle)};
      const predicted=predict(s,v),craft=makeCraft(s,v);
      let event=null;
      for(let j=0;j<MAX_STEPS&&!event;j++)event=advanceCraft(craft,s);
      const end=predicted.path.at(-1);
      assert.equal(predicted.event?.type,event?.type);
      assert.ok(Math.abs(end.x-craft.x)<1e-9);
      assert.ok(Math.abs(end.y-craft.y)<1e-9);
      assert.ok(Math.abs(predicted.duration-craft.steps*STEP)<1e-9);
    }
  }
});
test('all six missions have achievable routes on both short and tall phones',()=>{
  for(const h of [1650,2160]){
    for(let i=0;i<STAGE_COUNT;i++){
      const s=stageAt(i,h);
      let solved=false;
      for(let angle=-Math.PI;angle<Math.PI&&!solved;angle+=0.045){
        for(let speed=200;speed<=970;speed+=20){
          const v={vx:speed*Math.cos(angle),vy:speed*Math.sin(angle)};
          if(predict(s,v).event?.type==='dock'){solved=true;break;}
        }
      }
      assert.ok(solved,'mission '+(i+1)+' should be solvable at height '+h);
    }
  }
});
test('launches and docks stay clear of HUD safe zones',()=>{
  for(const h of [1650,2160]){
    for(let i=0;i<STAGE_COUNT;i++){
      const s=stageAt(i,h);
      assert.ok(s.start.y>h*.25 && s.start.y<h*.74,'launch outside safe playfield');
      assert.ok(s.target.y>h*.2 && s.target.y<h*.74,'dock outside safe playfield');
    }
  }
});
test('untrusted progress is clamped and sanitized',()=>{
  const p=safeReadProgress({unlocked:9999,best:{0:3,1:-2,2:'999',9:18},sound:false});
  assert.equal(p.unlocked,6);assert.deepEqual(p.best,{'0':3});assert.equal(p.sound,false);
});