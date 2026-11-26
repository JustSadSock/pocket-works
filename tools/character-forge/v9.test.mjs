import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {produceRoleV9,roleMorphs} from './roles-v9.mjs';
import {glb,inspectGLB} from './glb.mjs';
import {pose,deform,rootOffset,animation} from './core.mjs';
import {profiles,materialMaps} from './material-study.mjs';
const dir=process.env.CHARACTER_EVIDENCE_SOURCE;
const load=n=>JSON.parse(readFileSync(dir+'/makehuman-'+n+'.json'));
const roleIds=['artisan','merchant','infantry','legionary'];
function model(id,style='historical-miniature',name=roleMorphs[id].morph){return produceRoleV9(load(name),id,null,{style})}
function finite(m){
 for(const p of m.parts){
  assert.equal(p.normals.length,p.positions.length,p.name+' normals');
  assert.ok(p.positions.every(Number.isFinite),p.name+' positions');
  assert.ok(p.normals.every(Number.isFinite),p.name+' normals finite');
  assert.ok(p.indices.every(i=>Number.isInteger(i)&&i>=0&&i<p.positions.length/3),p.name+' indices');
  assert.equal(p.joints8.length,p.positions.length/3*8,p.name+' JOINTS_1');
  assert.equal(p.weights8.length,p.positions.length/3*8,p.name+' WEIGHTS_1');
  for(let i=0;i<p.weights8.length;i+=8){const w=p.weights8.slice(i,i+8);assert.ok(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-5,p.name+' normalized weights');assert.ok(w.every(x=>Number.isFinite(x)&&x>=0))}
 }
}
test('v9 four roles share the source anatomy but carry distinct construction and equipment',{skip:!dir},()=>{
 const base=model('artisan').joints.map(j=>({name:j.name,parent:j.parent,role:j.role}));
 for(const id of roleIds){
  const m=model(id);assert.deepEqual(m.joints.map(j=>({name:j.name,parent:j.parent,role:j.role})),base);assert.equal(m.spec.artRevision,'v9');assert.equal(m.spec.motionRevision,'v9');assert.equal(m.spec.contactCorrection,'path-v9');assert.equal(m.spec.lod,'source');assert.equal(m.contacts.length,2);assert.ok(m.statistics.triangleCount<150000);assert.ok(m.joints.length<512);finite(m);
  const bin=glb(m),doc=inspectGLB(bin);assert.ok(bin.length<32000000);assert.ok(doc.animations.some(a=>a.name==='walk'));const root=m.joints.find(j=>j.parent<0);assert.ok(doc.animations.find(a=>a.name==='walk').channels.some(c=>c.target.node===root.id&&c.target.path==='translation'));
 }
 const a=model('artisan'),merchant=model('merchant'),inf=model('infantry'),roman=model('legionary');assert.notDeepEqual(a.parts[0].positions,inf.parts[0].positions);
 assert.ok(a.parts.some(p=>p.name==='wooden mallet handle'));assert.ok(a.parts.some(p=>p.name==='rolled linen sleeve cuff L'));
 assert.ok(merchant.parts.some(p=>p.name==='merchant chaperon crown'));assert.ok(merchant.parts.some(p=>p.name==='merchant long wool robe'));assert.ok(merchant.parts.some(p=>p.name==='merchant shoulder goods'));
 assert.ok(inf.parts.some(p=>p.name==='interlinked mail aventail and collar'));assert.equal(inf.roleDiagnostics.brigandinePlates,12);assert.ok(inf.parts.some(p=>p.name==='rounded bascinet skull'));assert.ok(inf.parts.some(p=>p.name==='steel vambrace L'));assert.ok(inf.parts.some(p=>p.name==='steel articulated tasset L'));
 assert.equal(roman.roleDiagnostics.loricaBands,7);assert.ok(roman.parts.some(p=>p.name==='curved Roman scutum'));assert.ok(roman.parts.some(p=>p.name==='imperial Gallic helmet bowl'));assert.ok(roman.parts.some(p=>p.name==='gladius scabbard'));assert.ok(roman.parts.some(p=>p.name==='caligae leather strap L 0'));
});
test('v9 shields are held by the actual wrist grip, not detached forearm ornaments',{skip:!dir},()=>{
 for(const id of ['infantry','legionary']){const m=model(id),a=m.attachments.find(x=>x.name.includes('grip'));assert.ok(a);assert.ok(a.contactError<.04);const wrist=m.joints.find(j=>j.name==='wrist.L');assert.ok(wrist);assert.ok(m.parts.some(p=>p.name.includes('hand grip')));assert.ok(a.local.every(Number.isFinite))}
});
test('v9 boot anchors are derived from actual sole vertices and produce a continuous root-motion track',{skip:!dir},()=>{
 const m=model('artisan'),stride=m.spec.gaitStride;assert.ok(stride>.4);assert.equal(m.contacts.length,2);
 for(const c of m.contacts){assert.equal(c.surfaceContact,true);assert.ok(c.vertexCount>=4);assert.ok(Number.isFinite(c.groundY));assert.ok(c.local.every(Number.isFinite))}
 const a=rootOffset(m,'walk',0),b=rootOffset(m,'walk',1);assert.ok(Math.abs((b[2]-a[2])-stride)<1e-7);
 for(const phase of [0,.125,.25,.375,.5,.625,.75,.875,1]){const w=pose(m,'walk',phase),q=animation(m,'walk',phase);assert.equal(w.length,m.joints.length);assert.equal(q.length,m.joints.length);assert.ok(w.every(j=>j.p.every(Number.isFinite)&&j.q.every(Number.isFinite)))}
});
test('v9 style changes preserve rig, topology and LOD independently',{skip:!dir},()=>{
 const a=model('merchant','historical-miniature'),b=model('merchant','low-poly');assert.equal(a.spec.lod,b.spec.lod);assert.equal(a.statistics.triangleCount,b.statistics.triangleCount);assert.deepEqual(a.joints.map(j=>j.name),b.joints.map(j=>j.name));assert.deepEqual(a.parts.map(p=>p.name),b.parts.map(p=>p.name));assert.notDeepEqual(a.parts.find(p=>p.name==='merchant chaperon crown').positions,b.parts.find(p=>p.name==='merchant chaperon crown').positions);
});
test('v9 merchant robe pattern is reproducible across all six morphology sources',{skip:!dir},()=>{
 let signature=null;
 for(const name of ['base','young-woman','older-woman','older-man','tall-heavy','short-light']){const m=model('merchant','historical-miniature',name),p=m.parts.find(p=>p.name==='merchant long wool robe');assert.ok(p);assert.ok(p.outerVertexCount>0);assert.ok(p.thickness>0);assert.equal(m.contacts.length,2);const names=m.parts.filter(p=>['clothing','equipment'].includes(p.component)&&!p.name.startsWith('scalp')).map(p=>p.name);if(!signature)signature=names;else assert.deepEqual(names,signature)}
});
test('v9 materials reuse three existing maps without creating extra texture channels',{skip:!dir},()=>{
 const m=model('artisan'),maps=Object.fromEntries(Object.keys(profiles).map(k=>[k,materialMaps(k,32)])),doc=inspectGLB(glb(m,{detailMaps:maps}));assert.ok(doc.images.length<=15);assert.ok(doc.materials.some(x=>x.normalTexture));assert.ok(doc.meshes[0].primitives.every(p=>p.attributes.TEXCOORD_0!==undefined));
});
