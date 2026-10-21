import test from 'node:test';
import assert from 'node:assert/strict';
import {fitChapel} from '../playfield-layout.js';
import {hitChapel,dragSunAngle} from '../input.js';

test('precise glass hit targets on phones, tablets, and desktop for every board size',()=>{
  const stages=[[320,380],[390,580],[768,860],[760,500],[1120,720]];
  for(const [w,h] of stages)for(let size=4;size<=7;size++){
    const view={...fitChapel(w,h,size,Math.floor(size/2)),sunAngle:0};
    for(let i=0;i<size*size;i++){
      const col=i%size,row=Math.floor(i/size);
      const x=view.boardX+(col+.5)*view.tile,y=view.boardY+(row+.5)*view.tile;
      assert.deepEqual(hitChapel(view,x,y,'touch'),{kind:'tile',index:i},`stage ${w}x${h} tile ${i}`);
      assert.deepEqual(hitChapel(view,x,y),{kind:'tile',index:i});
    }
    assert.deepEqual(hitChapel(view,view.roseX,view.roseY,'touch'),{kind:'sun'});
    assert.equal(hitChapel(view,view.boardX-1,view.boardY+view.tile*2),null);
    assert.equal(hitChapel(view,view.boardX+view.gridWidth,view.boardY+view.tile*2),null);
    assert.equal(hitChapel(view,NaN,view.boardY),null);
  }
});
test('sun drag is resolution-aware and bounded',()=>{
  for(const size of [4,5,6,7]){
    const g=fitChapel(740,640,size,2);
    assert.equal(dragSunAngle(0,0,g.gridWidth),0);
    assert.ok(dragSunAngle(0,50,g.gridWidth)>0);
    assert.ok(dragSunAngle(0,-50,g.gridWidth)<0);
    assert.equal(dragSunAngle(0,100000,g.gridWidth),.8);
    assert.equal(dragSunAngle(0,-100000,g.gridWidth),-.8);
  }
});
