import assert from 'node:assert/strict';
import { LEVELS } from './levels.js';
import { generateEndlessLevel } from './procedural.js';
import { compileCourse19, inspectCourse19 } from './course19.js';
import { buildCourse18Geometry } from './terrain18.js';
import { planTurfClumps, appendTurfClumps } from './turf-clumps.js';
import { buildWoodBarrierProfile } from './wood-barrier.js';

let checked = 0;
const counts = { rocks: 0, stumps: 0, tunnels: 0, stoneWalls: 0, woodWalls: 0 };
for (const original of [
  ...LEVELS,
  ...Array.from({ length: 96 }, (_, i) => generateEndlessLevel((2197 + i * 61) >>> 0, i % 30))
]) {
  const level = compileCourse19(original);
  const snapshot = {
    obstacles: JSON.stringify(level.obstacles),
    barriers: JSON.stringify(level.walls),
    tunnel: JSON.stringify(level.tunnels),
    cup: JSON.stringify(level.hole),
    start: JSON.stringify(level.start)
  };
  assert.equal(inspectCourse19(level).ok, true, 'compiled course must be playable');
  const tuftSeed=Number(level.id)||18;
  const tufts=planTurfClumps(level,tuftSeed,level.visual?.materials || {});
  const again=planTurfClumps(level,tuftSeed,level.visual?.materials || {});
  assert.deepEqual(tufts,again,'tufts must remain deterministic through replays');
  assert.ok(tufts.length<=25,'foliage remains within the mobile vertex budget');
  let bladeTotal=0;
  const data=[];
  const fake={triangle(a,b,c,color,material,normal){
    data.push(...a,...b,...c,...color,...normal,material);
  }};
  appendTurfClumps(fake,tufts);
  for(const tuft of tufts){
    assert.ok(['grass','moss'].includes(level.course18.field.surfaceAt(tuft.x,tuft.y)),
      'do not plant grass in bunkers or water');
    assert.ok(Math.hypot(tuft.x-level.start.x,tuft.y-level.start.y)>=90,
      'turf may not obscure the tee');
    assert.ok(Math.hypot(tuft.x-level.hole.x,tuft.y-level.hole.y)>
      (level.hole.r||30)+68,'turf may not hide the cup');
    for(const blade of tuft.blades){
      bladeTotal++;
      assert.equal(blade.vertices.length,5,'each blade has a bent midrib rather than a tall triangle');
      assert.ok(blade.vertices.every(v=>v.length===3&&v.every(Number.isFinite)));
      assert.ok(blade.vertices[4][2]>blade.vertices[0][2],
        'blade tip rises naturally from the terrain');
      assert.ok(blade.color.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
    }
  }
  assert.equal(data.length,bladeTotal*3*17,'each blade uses exactly three short curved faces');
  for(const wall of level.course18.barriers.filter(w=>w.material==='wood')){
    const field=level.course18.field;
    const profile=buildWoodBarrierProfile(wall,(x,y)=>field.heightAt(x,y));
    assert.equal(profile.stations.length,profile.segments+1,
      'a continuous oak rail must have joined height stations');
    assert.ok(profile.segments>=1 && profile.segments<=8,'bounded rail tesselation');
    assert.ok(profile.length>0 && profile.half>=4);
    for(const s of profile.stations){
      assert.ok([s.footL,s.footR,s.shoulderL,s.shoulderR,s.crownL,s.crownR]
        .every(v=>v.length===3&&v.every(Number.isFinite)), 'finite rail coordinates');
      assert.ok(Math.abs(s.footL[2]-field.heightAt(s.footL[0],s.footL[1])+1.8)<1e-5,
        'left rail foot must be embedded in the true ground');
      assert.ok(Math.abs(s.footR[2]-field.heightAt(s.footR[0],s.footR[1])+1.8)<1e-5,
        'right rail foot must be embedded in the true ground');
      assert.ok(s.crownL[2]>s.shoulderL[2] && s.crownR[2]>s.shoulderR[2],
        'oak top bevel is physically raised and visible');
    }
    assert.equal(profile.stations[0].t,0);
    assert.equal(profile.stations.at(-1).t,1);
  }
  const geometry = buildCourse18Geometry(level);
  assert.ok(geometry.opaque instanceof Float32Array);
  for (const [name, array] of Object.entries(geometry)) {
    assert.equal(array.length % 11, 0, `${name}: wrong vertex stride`);
    assert.ok(array.every(Number.isFinite), `${name}: invalid position/normal/color`);
    assert.ok(array.length < 430000, `${name}: runaway model complexity`);
  }
  assert.ok(geometry.opaque.length > level.course18.surfaceMesh.data.length,
    'the cup and models must actually contribute triangles');
  for (const prop of level.course18.props) {
    if (prop.kind === 'stump') counts.stumps++;
    else counts.rocks++;
    if (prop.kind === 'rockCluster') {
      assert.ok(prop.parts.every(p => p.r > 0), 'cluster parts must keep independent physical radii');
    }
  }
  for (const wall of level.course18.barriers) counts[wall.material === 'stone' ? 'stoneWalls' : 'woodWalls']++;
  counts.tunnels += level.course18.tunnelVisuals.length;
  assert.deepEqual({
    obstacles: JSON.stringify(level.obstacles),
    barriers: JSON.stringify(level.walls),
    tunnel: JSON.stringify(level.tunnels),
    cup: JSON.stringify(level.hole),
    start: JSON.stringify(level.start)
  }, snapshot, 'visual mesh generation must never modify game physics');
  checked++;
}
assert.ok(counts.rocks > 0 && counts.stumps > 0 && counts.tunnels > 0 && counts.woodWalls > 0 && counts.stoneWalls > 0);
console.log('Moss & Marble object vocabulary:', checked, 'courses verified;', counts);
