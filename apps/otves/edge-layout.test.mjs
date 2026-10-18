import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeMazeDimensions, edgeCameraFit, recordKey } from './edge-layout.js';
import { createMaze, dimensionsForLevel } from './maze.js';
import { makePerimeterHardware, makeUnifiedWalls } from './render-geometry.js';

test('portrait and landscape mazes follow phone aspect instead of a floating board',()=>{
  for(const [width,height] of [[390,844],[320,568],[428,926],[844,390],[568,320],[1024,768],[768,1024]]) {
    const aspect=width/height;
    for(const level of [1,3,8,16,32]) {
      const {cols,rows}=dimensionsForLevel(level,aspect);
      assert.deepEqual({cols,rows},edgeMazeDimensions(level,aspect));
      assert.ok(cols>=7&&rows>=7&&cols<=28&&rows<=28);
      const fit=edgeCameraFit(cols,rows,width,height);
      assert.equal(fit.fullBleed,true, `view ${width}x${height} level ${level} should be full bleed`);
      assert.ok(fit.widthCoverage>=.995&&fit.heightCoverage>=.995,'phone edges must touch the labyrinth');
      assert.ok(fit.widthCoverage<1.105&&fit.heightCoverage<1.105,'overscan must not eat playable cells');
      const maze=createMaze({cols,rows,seed:54321+level});
      assert.ok(maze.walls.length>0);
      assert.ok(makeUnifiedWalls(maze.walls).indices.length>0);
    }
  }
});

test('rotating an existing game NEVER crops the maze to force full bleed',()=>{
  const normal=edgeMazeDimensions(1,390/844);
  const rotated=edgeCameraFit(normal.cols,normal.rows,844,390);
  assert.equal(rotated.fullBleed,false);
  assert.ok(rotated.widthCoverage<=1.001&&rotated.heightCoverage<=1.001);
});

test('edge inlays are narrow and integrated into the physical outer walls',()=>{
  const parts=makePerimeterHardware(7,15);
  assert.equal(parts.length,4);
  for(const m of parts){
    assert.ok(m.indices.length>0);
    for(let i=0;i<m.positions.length;i+=3){
      const x=m.positions[i], y=m.positions[i+1],z=m.positions[i+2];
      assert.ok(x>=0&&x<=7&&z>=0&&z<=15,'inlay stays inside maze walls');
      assert.ok(y>=.44&&y<=.48,'inlay is flush with upper glass edge');
    }
  }
});

test('invalid aspect ratios never create degenerate dimensions or scale',()=>{
  for(const aspect of [0,NaN,Infinity,-1,.1,10]) {
    const {cols,rows}=edgeMazeDimensions(1,aspect);
    const fit=edgeCameraFit(cols,rows,390,844);
    assert.ok(Number.isFinite(fit.scale)&&fit.scale>0);
  }
});

test('record formats remain distinct while historical numeric keys are preserved',()=>{
  assert.equal(recordKey(1,7,15),'1:7x15');
  assert.equal(recordKey(1,7,10),'1:7x10');
  assert.notEqual(recordKey(1,7,10),recordKey(1,7,15));
  const saves={'1':18.5};
  saves[recordKey(1,7,15)]=22.3;
  assert.equal(saves['1'],18.5);
  assert.equal(saves[recordKey(1,7,15)],22.3);
});
