import test from 'node:test';import assert from 'node:assert/strict';import {build,rootOffset,pose} from './core.mjs';import {glb,inspectGLB} from './glb.mjs';import {readFileSync} from 'node:fs';import {dress,draftGarments,bindTemplate,garmentAudit,measuredLimbRadii} from './garment.mjs';
const spec=recipe=>({version:2,recipe,style:'historical-miniature',lod:'medium',anatomy:'v4',motionRevision:'v4',actions:['idle','walk'],composite:recipe==='rider'});
test('v4 animal geometry and translation channel; prior species remain available',()=>{for(let r of ['horse','elephant','rider','dog','bird']){let m=build(spec(r));assert.ok(m.parts.length>5);assert.ok(m.parts.every(p=>p.positions.every(Number.isFinite)));let d=inspectGLB(glb(m));assert.ok(d.animations.find(a=>a.name==='walk').channels.some(c=>c.target.path==='translation'));if(r==='horse')assert.ok(m.parts.some(p=>p.name==='foreL-sole'));if(r==='elephant')assert.ok(m.parts.some(p=>p.name.startsWith('shaped pinna')))}});
test('source garment methods preserve anatomy and unique skin weights',{skip:!process.env.CHARACTER_EVIDENCE_SOURCE},()=>{const dir=process.env.CHARACTER_EVIDENCE_SOURCE,load=n=>JSON.parse(readFileSync(dir+'/makehuman-'+n+'.json')),base=load('base'),src=load('tall-heavy'),opt={style:'historical-miniature',kit:'warrior',identity:{}},temp=bindTemplate(base,draftGarments(base,{...opt,method:'pattern'}));let a=dress(src,{...opt,method:'pattern'}),b=dress(src,{...opt,method:'template'},temp),c=dress(src,{...opt,method:'hybrid'});assert.ok(c.parts.some(p=>p.name==='boot L'));assert.ok(c.parts.some(p=>p.name==='quilted'));assert.ok(c.parts.some(p=>p.name==='iron skullcap'));assert.equal(b.parts.find(p=>p.name==='shirt').indices.length,temp.find(p=>p.name==='shirt').indices.length);assert.notDeepEqual(a.parts.find(p=>p.name==='shirt').positions,c.parts.find(p=>p.name==='shirt').positions);for(let m of [a,b,c])assert.ok(glb(m).length>10000);assert.ok(src.fitting);let boot=c.parts.find(p=>p.name==='boot L');for(let i=0;i<boot.weights8.length;i++)if(boot.weights8[i]>0)assert.ok(!c.joints[boot.joints8[i]].name.startsWith('toe'));assert.ok(c.parts[0].indices.length<src.parts[0].indices.length)});

test('limb envelope responds to circumference independently of height and ignores unrelated anatomy',()=>{
 const ctx=(radius,foreign)=>{const vs=Array.from({length:64},(_,i)=>[radius*Math.cos(i*Math.PI/32),0,radius*Math.sin(i*Math.PI/32)]);if(foreign)vs.push(...Array.from({length:64},(_,i)=>[.21*Math.cos(i*Math.PI/32),0,.21*Math.sin(i*Math.PI/32)]));const body={weights:vs.flatMap(()=>[1,0,0,0]),joints:vs.flatMap((_,i)=>[i<64?1:2,0,0,0])};return {H:1.75,vs,body}};
 const fit=c=>measuredLimbRadii(c,[0,0,0],[0,1,0],[1,0,0],[0,0,1],[.065,.065],[1],.012,.003);
 assert.deepEqual(fit(ctx(.035,false)),[.065,.065]);assert.ok(fit(ctx(.09,false))[0]>.10);assert.deepEqual(fit(ctx(.09,true)),fit(ctx(.09,false)));
});
test('template fitting preserves authored semantic influences on all garments, including boots',{skip:!process.env.CHARACTER_EVIDENCE_SOURCE},()=>{
 const dir=process.env.CHARACTER_EVIDENCE_SOURCE,load=n=>JSON.parse(readFileSync(dir+'/makehuman-'+n+'.json')),base=load('base'),target=load('tall-heavy'),opt={kit:'warrior',style:'historical-miniature',method:'pattern'},template=bindTemplate(base,draftGarments(base,opt)),fitted=dress(target,{...opt,method:'template'},template);
 for(const p of template){
   const q=fitted.parts.find(v=>v.name===p.name);assert.ok(q,p.name);assert.equal(q.positions.length,p.positions.length);
   for(let i=0;i<p.templateBinding.length;i++){
     const expected=new Map(p.templateBinding[i].skin);
     for(let k=0;k<8;k++){const w=q.weights8[i*8+k];if(w>0){const name=target.joints[q.joints8[i*8+k]].name;assert.ok(expected.has(name),p.name+' '+name);assert.ok(Math.abs(expected.get(name)-w)<1e-6);if(p.name.startsWith('boot'))assert.ok(!name.startsWith('toe'))}}
   }
 }
});
