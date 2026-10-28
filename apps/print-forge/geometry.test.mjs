import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,normalizeJob,build,stlBuffer,checkMesh,gearOutline} from './geometry.js';
for(const type of Object.keys(DEFAULTS)){
  test(type+' exports manifold mesh and millimetre STL',()=>{
    const result=build(DEFAULTS[type]);
    for(const part of result.parts){
      const v=checkMesh(part.mesh);
      assert.equal(v.watertight,true,part.name);
      assert.ok(v.signed_volume_mm3>0,part.name+' orientation');
      assert.ok(v.volume_mm3>0);
      const stl=new DataView(stlBuffer(part));
      assert.equal(stl.getUint32(80,true),part.mesh.triangles.length);
      assert.equal(stl.byteLength,84+50*v.triangles);
    }
  });
}
test('Gear pitch distance and ratio remain coherent',()=>{
  const {facts,parts}=build(DEFAULTS.gear_pair);
  assert.equal(facts.center_mm,54);
  assert.equal(facts.ratio,2);
  assert.equal(facts.rpm_factor,-.5);
  assert.equal(parts[0].x,-27);
  assert.equal(parts[1].x,27);
  assert.ok(gearOutline(18,2).length>300);
});
test('rejects invalid and malicious input',()=>{
  for(const input of [
    {type:'gear_pair',teeth_a:0}, {...DEFAULTS.gear_pair, module_mm:1.5, bore_mm:24},
    {...DEFAULTS.tray,wall_mm:6,width_mm:10},
    {...DEFAULTS.spacer,bore_mm:50},
    {type:'abc'}, null, {...DEFAULTS.gear_pair,teeth_a:Infinity}
  ])assert.throws(()=>normalizeJob(input));
});
