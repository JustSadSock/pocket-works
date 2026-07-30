import assert from 'node:assert/strict';
import { compileOpenScad } from '../src/scad.js';
import { validateMechanismContract } from '../src/contract-strict.js';

const source = `
module sun(){ translate([0,0,5.5]) forma_spur_gear(teeth=12,module=1,thickness=5,bore=3.2); }
module ring(){ translate([0,0,5.5]) forma_ring_gear(teeth=48,module=1,thickness=5,wall=3); }
module planet(){ translate([15,0,5.5]) forma_spur_gear(teeth=18,module=1,thickness=5,bore=3.4); }
module carrier(){ forma_planet_carrier(orbit=15,count=1,plate_thickness=3,pin_diameter=3,pin_height=5,bore=3.2,plate_radius=20); }
`;
const parts = [
  {id:'sun',entry:'sun',mechanics:{teeth:12,module:1}},
  {id:'ring',entry:'ring',mechanics:{teeth:48,module:1}},
  {id:'planet',entry:'planet',mechanics:{teeth:18,module:1}},
  {id:'carrier',entry:'carrier',mechanics:{}}
];
const compiled = compileOpenScad(source, parts);
assert.equal(compiled.parts.length, 4);
assert.deepEqual(compiled.parts[2].meta.scadEvidence[0].center.map(v=>Math.round(v*10)/10), [15,0,5.5]);
const project = {
  parts,
  contract:{mode:'mechanical',joints:[
    {type:'fixed',part:'ring'},
    {type:'revolute',part:'sun',axis:'z'},
    {type:'revolute',part:'carrier',axis:'z'},
    {type:'planetary',sun:'sun',ring:'ring',carrier:'carrier',planets:['planet'],teeth:{sun:12,planet:18,ring:48},module:1}
  ],objectives:[
    {type:'fixedPart',part:'ring'},
    {type:'speedRatio',input:'carrier',output:'sun',ratio:5,direction:'increase',tolerance:.01},
    {type:'partCount',value:4},
    {type:'noExternalHardware'}
  ]}
};
const report = validateMechanismContract(project,{parts:compiled.parts});
assert.equal(report.verified, true, JSON.stringify(report.errors,null,2));
assert.equal(report.objectives.find(x=>x.label?.startsWith('Скорость')).actual, 5);

const wrong = structuredClone(project);
wrong.contract.objectives[1].direction='reduction';
const badReport=validateMechanismContract(wrong,{parts:compiled.parts});
assert.equal(badReport.verified,false);
assert.ok(badReport.errors.some(e=>e.code==='RATIO_DIRECTION_FAILED'));

const fakeDiff=structuredClone(project);
fakeDiff.contract.joints.push({type:'differential',carrier:'carrier',outputs:['sun','planet']});
const diffReport=validateMechanismContract(fakeDiff,{parts:compiled.parts});
assert.equal(diffReport.verified,false);
assert.ok(diffReport.errors.some(e=>e.code==='DIFFERENTIAL_NOT_CERTIFIED'));

const fakeHousing=structuredClone(project);
fakeHousing.contract.joints.push({type:'contains',housing:'ring',parts:['sun','planet']});
const housingReport=validateMechanismContract(fakeHousing,{parts:compiled.parts});
assert.equal(housingReport.verified,false);
assert.ok(housingReport.errors.some(e=>e.code==='CONTAINMENT_NOT_CERTIFIED'));

const gearSource=`module a(){ forma_spur_gear(teeth=40,module=1,thickness=5,bore=3); } module b(){ translate([25,0,0]) forma_spur_gear(teeth=10,module=1,thickness=5,bore=3); }`;
const gearParts=[{id:'a',entry:'a',mechanics:{teeth:40,module:1}},{id:'b',entry:'b',mechanics:{teeth:10,module:1}}];
const gears=compileOpenScad(gearSource,gearParts);
const gearReport=validateMechanismContract({parts:gearParts,contract:{mode:'mechanical',joints:[{type:'gearMesh',a:'a',b:'b'}],objectives:[{type:'speedRatio',input:'a',output:'b',ratio:4,direction:'increase'}]}},{parts:gears.parts});
assert.equal(gearReport.verified,true,JSON.stringify(gearReport.errors,null,2));
console.log('FORMA 2.0 SCAD + strict contract tests: OK');
