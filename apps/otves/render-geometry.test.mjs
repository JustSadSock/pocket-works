import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaze } from './maze.js';
import {
  makeBox, makeFloorWithHole, makeSphere, makeTorus, makeUnifiedWalls, makeWell
} from './render-geometry.js';

function validMesh(mesh) {
  assert.ok(mesh.indices.length > 0,'triangles exist');
  assert.equal(mesh.positions.length,mesh.normals.length,'normals match positions');
  assert.equal(mesh.positions.length%3,0,'XYZ tuples');
  assert.equal(mesh.indices.length%3,0,'triangle indices');
  const vertices = mesh.positions.length/3;
  for (const i of mesh.indices) assert.ok(i >= 0 && i < vertices,'valid triangle index');
  for (const value of [...mesh.positions,...mesh.normals]) {
    assert.ok(Number.isFinite(value),'no NaNs or infinities');
  }
}

test('all spatial primitives have valid non-degenerate array/index layout',() => {
  for (const mesh of [
    makeBox(-1,-.2,-1,1,0,1),
    makeTorus(.4,.04),
    makeSphere(.265),
    makeFloorWithHole(7,10,{x:6.5,y:9.5}),
    makeWell(6.5,9.5)
  ]) validMesh(mesh);
});

test('real hole geometry stays within the well bounds instead of creating a stray triangle',() => {
  const well=makeWell(5.5,7.5,.385,.235);
  validMesh(well);
  for (let i=0;i<well.positions.length;i+=3) {
    assert.ok(well.positions[i] >= 5.115 - 1e-4 && well.positions[i] <= 5.885 + 1e-4);
    assert.ok(well.positions[i+1] <= 1e-6 && well.positions[i+1] >= -.235-1e-6);
    assert.ok(well.positions[i+2] >= 7.115-1e-4 && well.positions[i+2] <= 7.885+1e-4);
  }
});

test('wall rectangles are unioned before generating any upward-facing surface',() => {
  const input=[
    {x:0,y:0,width:1,height:.2},
    {x:.45,y:-.4,width:.1,height:1}
  ];
  const mesh=makeUnifiedWalls(input);
  validMesh(mesh);
  assert.ok(mesh.exposedSides > 0);
  let topArea = 0;
  for (let i=0;i<mesh.positions.length;i+=12) {
    if (mesh.normals[i+1] !== 1) continue;
    const w=Math.abs(mesh.positions[i+6]-mesh.positions[i]);
    const h=Math.abs(mesh.positions[i+5]-mesh.positions[i+2]);
    topArea += w*h;
  }
  // 0.2 + 0.1 - 0.02 overlap = 0.28 square units.
  assert.ok(Math.abs(topArea-.28)<1e-4,'no overlapping top polygons');
});

test('real mazes from the existing generator can be meshed at multiple sizes',() => {
  for (const [cols,rows,seed] of [[7,10,1],[12,17,991],[17,11,4411]]) {
    const maze=createMaze({cols,rows,seed});
    assert.ok(maze.walls.length>0);
    validMesh(makeUnifiedWalls(maze.walls));
    validMesh(makeFloorWithHole(cols,rows,maze.goal));
  }
});

test('wall geometry is empty and safe for an empty rectangle array',() => {
  const empty=makeUnifiedWalls([]);
  assert.equal(empty.indices.length,0);
  assert.equal(empty.positions.length,0);
});
