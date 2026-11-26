import test from 'node:test';import assert from 'node:assert/strict';import {build,rootOffset,pose} from './core.mjs';import {glb,inspectGLB} from './glb.mjs';import {readFileSync} from 'node:fs';import {dress,draftGarments,bindTemplate,garmentAudit,measuredLimbRadii,sewLining,anatomicalSection,assertTailoredSections} from './garment.mjs';
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

test('v5 lining closes boundary with opposite winding and no disconnected shell',()=>{
 const p={name:'panel',positions:[0,0,0,1,0,0,1,1,0,0,1,0],indices:[0,1,2,0,2,3],normals:[],joints:Array.from({length:16},()=>0),weights:Array.from({length:16},(_,i)=>i%4===0?1:0),joints8:Array.from({length:32},()=>0),weights8:Array.from({length:32},(_,i)=>i%8===0?1:0)};
 sewLining(p,.01);assert.equal(p.outerVertexCount,4);assert.equal(p.positions.length/3,8);assert.ok(Math.abs(p.positions[14]+.01)<1e-9);assertClosed(p);
});
function assertClosed(p){
 const edges=new Map(),adj=new Map();
 for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){
   const a=p.indices[i+k],b=p.indices[i+(k+1)%3],key=a<b?a+':'+b:b+':'+a,e=edges.get(key)??{count:0,orientation:0};e.count++;e.orientation+=a<b?1:-1;edges.set(key,e);
   if(!adj.has(a))adj.set(a,new Set());if(!adj.has(b))adj.set(b,new Set());adj.get(a).add(b);adj.get(b).add(a);
 }
 for(const [key,e] of edges){assert.equal(e.count,2,p.name+' nonmanifold '+key);assert.equal(e.orientation,0,p.name+' inconsistent winding '+key)}
 const seen=new Set([0]),queue=[0];for(let i=0;i<queue.length;i++)for(const k of adj.get(queue[i])??[])if(!seen.has(k)){seen.add(k);queue.push(k)}
 assert.equal(seen.size,p.positions.length/3,p.name+' disconnected vertices');
}
test('v5 actual source continuous garment across six morphs and two art directions',{skip:!process.env.CHARACTER_EVIDENCE_SOURCE},()=>{
 const dir=process.env.CHARACTER_EVIDENCE_SOURCE;
 for(const name of ['base','young-woman','older-woman','older-man','tall-heavy','short-light']){
   const src=JSON.parse(readFileSync(dir+'/makehuman-'+name+'.json'));
   for(const [kit,style] of [['tunic','historical-miniature'],['warrior','low-poly']]){
     const m=dress(src,{surfaceRevision:5,kit,style,method:'hybrid'});
     for(const name of kit==='warrior'?['shirt','quilted']:['tunic']){
       const p=m.parts.find(q=>q.name===name);assert.ok(p);assert.equal(p.pattern.armholes,2);assertClosed(p);
       assert.ok(p.positions.every(Number.isFinite));assert.ok(!m.parts.some(q=>q.name.startsWith(name+' sleeve')));
     }
     assert.ok(glb(m).length>10000);
   }
 }
});

test('v6 rejects the v5 waist explosion even for a closed mesh',()=>{
 const sections=[{y:1,region:'bodice',center:[0,0],half:[.14,.09],radii:[.15,.10],radius:[.18,.13]},{y:1.15,region:'bodice',center:[0,0],half:[.15,.10],radii:[.16,.11],radius:[.19,.14]}];
 assert.equal(assertTailoredSections(sections,'tunic',1.75),true);
 assert.throws(()=>assertTailoredSections([{...sections[0],radius:[.75,.25]},sections[1]],'tunic',1.75),/Oversized/);
 assert.throws(()=>assertTailoredSections([sections[1],sections[0]],'tunic',1.75),/Unordered/);
});
test('v6 excludes metacarpal-owned points from measured waist across real morphs',{skip:!process.env.CHARACTER_EVIDENCE_SOURCE},()=>{
 for(const name of ['base','young-woman','older-woman','older-man','tall-heavy','short-light']){
   const src=JSON.parse(readFileSync(process.env.CHARACTER_EVIDENCE_SOURCE+'/makehuman-'+name+'.json')),body=src.parts[0],vs=Array.from({length:body.positions.length/3},(_,i)=>body.positions.slice(i*3,i*3+3)),y=src.joints.find(j=>j.name==='spine03').position[1]-.04,H=Math.max(...vs.map(v=>v[1]));
   const q=anatomicalSection({source:src,body,vs},y,'bodice');assert.ok(q.rejected>0);assert.ok(q.half[0]<H*.15);assert.ok(q.radii[0]<H*.18);
 }
});
test('v6 static citizen uses a continuous garment and local belt attachment',{skip:!process.env.CHARACTER_EVIDENCE_SOURCE},()=>{
 const src=JSON.parse(readFileSync(process.env.CHARACTER_EVIDENCE_SOURCE+'/makehuman-base.json')),m=dress(src,{surfaceRevision:6,kit:'tunic',style:'historical-miniature',method:'hybrid'}),p=m.parts.find(p=>p.name==='tunic'),belt=m.parts.find(p=>p.name==='waist belt'),pouch=m.parts.find(p=>p.name==='belt pouch');
 assertClosed(p);assertClosed(belt);assert.equal(p.pattern.revision,6);assert.equal(belt.attachment.garment,'tunic');assert.equal(pouch.attachment.station,p.pattern.waistIndex);
 const xs=belt.positions.filter((_,i)=>i%3===0),s=p.pattern.sections[p.pattern.waistIndex];assert.ok(Math.max(...xs)-Math.min(...xs)<2*(s.radius[0]+.055));assert.ok(glb(m).length>10000);
});
