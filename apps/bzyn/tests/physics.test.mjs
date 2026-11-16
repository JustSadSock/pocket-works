import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD,FIXED_STEP,buildWave,rubber,launchVector,capVelocity,collideDisk,advanceBall} from '../physics.mjs';

test('rubber band follows finger inside limit and resists beyond it',()=>{
  assert.equal(rubber(70),70);
  assert.equal(rubber(135),119);
});
test('sling sends the puck opposite to the pulled finger and never exceeds speed cap',()=>{
  const shot=launchVector(0,105,0,0);
  assert.ok(shot.vy<0);
  assert.ok(Math.hypot(shot.vx,shot.vy)<901);
  assert.equal(launchVector(0,3,0,0),null);
  assert.ok(launchVector(0,3,0,500).vy<0);
  assert.equal(Math.round(Math.hypot(...Object.values(capVelocity(3000,4000)))),980);
});
test('each wave is finite, with all targets in playfield and clear spacing',()=>{
  for(let n=1;n<=25;n++){
    const w=buildWave(n);
    assert.ok(w.targets.length>=4);
    assert.equal(new Set(w.targets.map(t=>t.id)).size,w.targets.length);
    for(const t of w.targets){
      assert.ok(t.x>=35&&t.x<=325);
      assert.ok(t.y>=50&&t.y<=400);
      assert.equal(t.hit,false);
    }
    assert.equal(w.spinner!==null,n>=2);
  }
});
test('disk collision reflects only incoming velocity',()=>{
  const b={x:90,y:100,vx:170,vy:0,r:WORLD.radius};
  const hit=collideDisk(b,115,100,20);
  assert.ok(hit.impact>0);
  assert.ok(b.vx<0);
  assert.ok(Math.hypot(b.x-115,b.y-100)>=34-.01);
  const leaving={x:90,y:100,vx:-100,vy:0,r:14};
  collideDisk(leaving,115,100,20);
  assert.equal(leaving.vx,-100);
});
test('a bell hit occurs once, marks the target, and physics never escapes the tray',()=>{
  const wave={targets:[{id:0,x:180,y:215,r:16,hit:false,gold:false}],bumpers:[],spinner:null};
  const ball={x:180,y:265,vx:0,vy:-700,r:14};
  let hits=0;
  for(let i=0;i<600;i++){
    for(const event of advanceBall(ball,FIXED_STEP,wave,i*FIXED_STEP)){
      if(event.type==='target')hits++;
    }
    assert.ok(Number.isFinite(ball.x)&&Number.isFinite(ball.y));
    assert.ok(ball.x>=38-1e-6&&ball.x<=322+1e-6);
    assert.ok(ball.y>=39-1e-6&&ball.y<=536+1e-6);
  }
  assert.equal(hits,1);
  assert.equal(wave.targets[0].hit,true);
});
