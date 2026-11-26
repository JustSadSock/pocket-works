// v0.9 production research: four historic identities, six shared-fit morphs,
// actual sole-contact measurements, style/LOD independence and full garment
// cloth input. Nothing here publishes to a game or approves an art candidate.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {produceRoleV9,roleMorphs} from './roles-v9.mjs';
import {glb,inspectGLB} from './glb.mjs';
import {raster,commonBounds,materialMaps,profiles,png} from './material-study.mjs';
import {pose,deform,rootOffset} from './core.mjs';
import {normals} from './hybrid-human.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v),json=(n,v)=>write(n,JSON.stringify(v,null,2)),source=n=>read('makehuman-'+n+'.json'),start=performance.now(),ids=read('identities-v4.json');
const roleIds=['artisan','merchant','infantry','legionary'],views=['front','side','back','three-quarter'],sizes=[18,32,64,128];
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s),unit=a=>mul(a,1/(Math.hypot(...a)||1)),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,dot(unit(a),unit(b)))))*180/Math.PI;
const maps=Object.fromEntries(Object.keys(profiles).map(k=>[k,materialMaps(k,256)]));
let scan=null;try{scan=read('v8-linen.json')}catch{}
const B=scan?{size:scan.size,...Object.fromEntries(Object.entries(scan.channels).map(([k,v])=>[k,new Uint8Array(Buffer.from(v,'base64'))]))}:null,C=B?{size:B.size,color:new Uint8Array(B.color.length),normal:new Uint8Array(B.normal.length),roughness:new Uint8Array(B.roughness.length)}:null;
if(C)for(let i=0;i<B.color.length;i+=4){for(let k=0;k<3;k++){C.color[i+k]=Math.round(.40*maps.cloth.color[i+k]+.60*B.color[i+k]);C.normal[i+k]=Math.round(.45*maps.cloth.normal[i+k]+.55*B.normal[i+k]);C.roughness[i+k]=Math.round(.30*maps.cloth.roughness[i+k]+.70*B.roughness[i+k])}C.color[i+3]=C.normal[i+3]=C.roughness[i+3]=255}
const selectedMaps={...maps,cloth:C??maps.cloth};
for(const [label,mat] of [['A',maps.cloth],['B',B],['C',C]])if(mat)for(const channel of ['color','normal','roughness'])write('v9-fabric-'+label+'-'+channel+'.png',png(mat.size,mat.size,mat[channel]));
function posed(model,action='idle',phase=0){const w=pose(model,action,phase),q=structuredClone(model);for(let i=0;i<q.parts.length;i++){q.parts[i].positions=deform(model,model.parts[i],w).flat();normals(q.parts[i])}return q}
function silhouette(model){const q=structuredClone(model);q.parts=q.parts.map(p=>{p.color=[.025,.025,.025];delete p.vertexColors;delete p.vertexTint;p.material={kind:'cloth',roughness:1,metallic:0};return p});return q}
function visibleTriangles(model,view){const r=raster(model,{view,size:128,transparent:true}),sets=Array.from({length:model.parts.length},()=>new Set());for(let i=0;i<r.owners.length;i++)if(r.owners[i]>=0&&r.faces[i]>=0)sets[r.owners[i]].add(r.faces[i]);return sets.map(x=>[...x])}
function collisionFrame(id,model,phase,action='idle'){const q=posed(model,action,phase),parts=q.parts.filter(p=>p.positions.length>=9&&p.indices.length>=3),visible={},viewModel={...q,parts};for(const view of views)visible[view]=visibleTriangles(viewModel,view);return {role:id,phase,parts:parts.map(p=>({name:p.name,region:p.region??p.name,layer:p.layer??0,material:p.material?.kind??'unknown',positions:p.positions,indices:p.indices})),visible}}
function soles(model,phase,w){
 const stride=model.spec.gaitStride,duty=model.spec.gaitDuty,rows=[];
 for(const c of model.contacts){const local=((phase+c.phase)%1+1)%1,stance=local<duty,p=model.parts.find(x=>x.name==='boot '+(model.joints[c.joint].name.endsWith('.L')?'L':'R')),ys=p.positions.filter((_,i)=>i%3===1),low=Math.min(...ys),indices=Array.from({length:p.positions.length/3},(_,i)=>i).filter(i=>p.positions[i*3+1]<=low+model.spec.morphology.height*.008),v=deform(model,p,w),pts=indices.map(i=>v[i]),center=pts.reduce((a,x)=>a.map((z,k)=>z+x[k]/pts.length),[0,0,0]),joint=model.joints[c.joint],anchor=add(joint.position,c.local),expected=[anchor[0],c.groundY,anchor[2]+stride*(phase-local)],minY=Math.min(...pts.map(x=>x[1])),maxY=Math.max(...pts.map(x=>x[1]));
  rows.push({joint:joint.name,stance,vertices:indices.length,groundError:Math.abs(minY-c.groundY),horizontalDrift:Math.hypot(center[0]-expected[0],center[2]-expected[2]),soleRange:maxY-minY,minimumY:minY,expectedWorld:expected,actualWorld:center});
 }
 return rows;
}
const models={},restModels={},roleReport=[];
for(const id of roleIds){const morphSource=roleMorphs[id].morph,m=produceRoleV9(source(morphSource),id),q=posed(m);models[id]=m;restModels[id]=q;
 const bin=glb(m,{detailMaps:selectedMaps}),doc=inspectGLB(bin);write('v9-'+id+'.glb',bin);json('v9-'+id+'.model.json',m);
 const root=m.joints.find(j=>j.parent<0),rootTrack=doc.animations.find(a=>a.name==='walk')?.channels.some(c=>c.target.node===root.id&&c.target.path==='translation');
 roleReport.push({id,morphSource,parts:m.parts.map(p=>p.name),partCount:m.parts.length,triangleCount:m.statistics.triangleCount,vertices:m.statistics.vertices,joints:m.joints.length,style:m.spec.style,lod:m.spec.lod,rootMotionChannel:rootTrack,attachments:m.attachments??[],roleDiagnostics:m.roleDiagnostics,glbBytes:bin.length});
}
const bounds=Object.fromEntries(views.map(v=>[v,commonBounds(Object.values(restModels),v)]));
for(const view of views)for(const id of roleIds)write('v9-'+id+'-'+view+'.png',raster(restModels[id],{view,bounds:bounds[view],size:768,mode:'C',maps:selectedMaps}).png);
for(const id of roleIds){
 const m=restModels[id],groups={head:m.parts.filter((p,i)=>i===0||/head|helmet|bascinet|chaperon|mail aventail/i.test(p.name)),cloth:m.parts.filter(p=>['cloth','leather'].includes(p.material?.kind)),metal:m.parts.filter(p=>p.material?.kind==='metal')};
 for(const [label,parts] of Object.entries(groups)){if(!parts.length)continue;const q={...m,parts};write('v9-'+id+'-close-'+label+'.png',raster(q,{view:'three-quarter',size:640,mode:'C',maps:selectedMaps}).png)}
}
const iou=(a,b)=>{let both=0,either=0;for(let i=0;i<a.length;i++){const x=a[i],y=b[i];if(x||y)either++;if(x&&y)both++}return either?both/either:1};
const silhouetteMetrics=[],silhouetteBoards=[];
for(const view of views){const common=bounds[view];for(const size of sizes){const masks={};for(const id of roleIds){const r=raster(silhouette(restModels[id]),{view,bounds:common,size,transparent:true,mode:'A'});masks[id]=Array.from({length:size*size},(_,i)=>r.rgba[i*4+3]>0?1:0);write('v9-silhouette-'+id+'-'+view+'-'+size+'.png',r.png)}
  for(let i=0;i<roleIds.length;i++)for(let j=i+1;j<roleIds.length;j++)silhouetteMetrics.push({view,size,a:roleIds[i],b:roleIds[j],iou:iou(masks[roleIds[i]],masks[roleIds[j]])});
 }}
json('v9-silhouette-iou.json',silhouetteMetrics);
const morphRows=[],morphModels={};
for(const name of ['base','young-woman','older-woman','older-man','tall-heavy','short-light']){
 const {colors,...identity}=ids[name].identity,m=produceRoleV9(source(name),'merchant',{...identity,beard:identity.beard??false}),q=posed(m);
 morphModels[name]=q;const p=m.parts.find(x=>x.name==='merchant long wool robe');
 if(!p||!p.outerVertexCount)throw Error('Merchant garment pattern missing on '+name);
 const bin=glb(m,{detailMaps:selectedMaps});write('v9-morph-'+name+'.glb',bin);write('v9-morph-'+name+'.png',raster(q,{view:'three-quarter',size:512,mode:'C',maps:selectedMaps}).png);
 morphRows.push({name,passed:true,triangleCount:m.statistics.triangleCount,vertices:m.statistics.vertices,robeOuterVertices:p.outerVertexCount,robeThickness:p.thickness,contacts:m.contacts.map(c=>({joint:m.joints[c.joint].name,vertexCount:c.vertexCount,groundY:c.groundY}))});
}
const morphBounds=commonBounds(Object.values(morphModels),'three-quarter');for(const [name,m] of Object.entries(morphModels))write('v9-morph-'+name+'-matched.png',raster(m,{view:'three-quarter',bounds:morphBounds,size:512,mode:'C',maps:selectedMaps}).png);
const low=produceRoleV9(source('base'),'merchant',null,{style:'low-poly'}),high=models.merchant;
const styleReport={lowPoly:{style:low.spec.style,lod:low.spec.lod,triangles:low.statistics.triangleCount,bounds:commonBounds([posed(low)],'three-quarter')},historical:{style:high.spec.style,lod:high.spec.lod,triangles:high.statistics.triangleCount,bounds:commonBounds([restModels.merchant],'three-quarter')},sameTopology:low.statistics.triangleCount===high.statistics.triangleCount,sameJointNames:JSON.stringify(low.joints.map(j=>j.name))===JSON.stringify(high.joints.map(j=>j.name)),independentLod:low.spec.lod===high.spec.lod};
write('v9-merchant-low-poly.glb',glb(low,{detailMaps:selectedMaps}));write('v9-merchant-low-poly.png',raster(posed(low),{view:'three-quarter',size:768,mode:'C',maps:selectedMaps}).png);
const artisan=models.artisan,walkFrames=[],contactFrames=[],jointFrames=[],H=artisan.spec.morphology.height;
mkdirSync(join(out,'v9-human-motion'),{recursive:true});
for(let i=0;i<=24;i++){const phase=i/24,w=pose(artisan,'walk',phase),q=structuredClone(artisan);for(let j=0;j<q.parts.length;j++){q.parts[j].positions=deform(artisan,artisan.parts[j],w).flat();normals(q.parts[j])}walkFrames.push(q);const feet=soles(artisan,phase,w);contactFrames.push({phase,feet});jointFrames.push({phase,rootOffset:rootOffset(artisan,'walk',phase),joints:artisan.joints.map(j=>({name:j.name,position:w[j.id].p,rotation:w[j.id].q}))})}
const motionBounds=commonBounds(walkFrames,'side');
for(let i=0;i<walkFrames.length;i++)write('v9-human-motion/'+String(i).padStart(2,'0')+'.png',raster(walkFrames[i],{view:'side',bounds:motionBounds,size:512,groundLine:true,mode:'C',maps:selectedMaps}).png);
json('v9-human-motion-joints.json',jointFrames);json('v9-human-contact.json',contactFrames);
const stance=contactFrames.flatMap(x=>x.feet.filter(f=>f.stance)),maxDrift=Math.max(...stance.map(x=>x.horizontalDrift)),maxGround=Math.max(...stance.map(x=>x.groundError)),maxSoleRange=Math.max(...stance.map(x=>x.soleRange));
let cmu=null;try{cmu=read('capture-v4-report.json')}catch{}
let cmuComparison=null;
if(cmu?.referenceFrames){
 const side=cmu.basisVectors.side,forward=cmu.basisVectors.forward,toBasis=v=>[dot(v,side),v[1],dot(v,forward)],pairs=[['LeftUpLeg','LeftLeg','upperleg01.L','lowerleg01.L'],['LeftLeg','LeftFoot','lowerleg01.L','foot.L'],['RightUpLeg','RightLeg','upperleg01.R','lowerleg01.R'],['RightLeg','RightFoot','lowerleg01.R','foot.R'],['LeftArm','LeftForeArm','upperarm01.L','lowerarm01.L'],['LeftForeArm','LeftHand','lowerarm01.L','wrist.L'],['RightArm','RightForeArm','upperarm01.R','lowerarm01.R'],['RightForeArm','RightHand','lowerarm01.R','wrist.R'],['Spine','Neck','spine03','neck01'],['Neck','Head','neck01','head']],rows=[];
 for(const ref of cmu.referenceFrames){const w=pose(artisan,'walk',ref.phase),errors=[];for(const [a,b,x,y] of pairs){const expected=sub(ref.points[b],ref.points[a]),actual=toBasis(sub(w[artisan.joints.find(j=>j.name===y).id].p,w[artisan.joints.find(j=>j.name===x).id].p));errors.push({segment:x+' -> '+y,degrees:angle(expected,actual)})}rows.push({phase:ref.phase,errors,max:Math.max(...errors.map(x=>x.degrees)),mean:errors.reduce((s,x)=>s+x.degrees,0)/errors.length})}
 const all=rows.flatMap(r=>r.errors.map(x=>x.degrees)).sort((a,b)=>a-b);cmuComparison={source:'CMU 35_01',method:'normalized anatomical basis, direct segment directions; no retargeted source asset',frames:rows,mean:all.reduce((s,x)=>s+x,0)/all.length,p95:all[Math.floor((all.length-1)*.95)],max:all.at(-1)};
}
const merchant=models.merchant,cloth=merchant.parts.find(p=>p.name==='merchant long wool robe'),tunic=merchant.parts.find(p=>p.name==='tunic'),outer=p=>p.indices.filter((_,i)=>false);
function outerMesh(p){const count=p.outerVertexCount??p.positions.length/3,indices=[];for(let i=0;i<p.indices.length;i+=3){const f=p.indices.slice(i,i+3);if(f.every(x=>x<count))indices.push(...f)}return {name:p.name,outerVertexCount:count,positions:p.positions.slice(0,count*3),indices}}
const clothBase=outerMesh(cloth),colliderParts=['tunic','trousers L','trousers R','boot L','boot R'].map(n=>{const p=merchant.parts.find(x=>x.name===n);if(!p)throw Error('Missing cloth collider '+n);return outerMesh(p)});
const clothFrames=[],colliderFrames=colliderParts.map(p=>({name:p.name,frames:[]}));
for(let i=0;i<=24;i++){const phase=i/24,w=pose(merchant,'walk',phase);clothFrames.push(deform(merchant,cloth,w).flat().slice(0,clothBase.outerVertexCount*3));for(let j=0;j<colliderParts.length;j++){const p=merchant.parts.find(x=>x.name===colliderParts[j].name);colliderFrames[j].frames.push(deform(merchant,p,w).flat().slice(0,colliderParts[j].outerVertexCount*3))}}
json('v9-cloth-input.json',{fps:24,frameCount:25,frameStart:1,garment:{...clothBase,frames:clothFrames,pinIndices:Array.from({length:merchant.spec.garment?.ringCount??tunic.pattern.ringCount+1},(_,i)=>i),attachment:'upper hip seam follows the shared skeletal gait'},colliders:colliderParts.map((p,i)=>({...p,frames:colliderFrames[i].frames})),simulation:{quality:8,mass:.32,collisionDistance:.004,selfCollisionDistance:.006,gravity:[0,-9.81,0]},notes:'Full merchant lower robe outer surface with 25 animated shape-key poses; actual tunic, trousers and boots are colliders. The cache is precomputed for game playback.'});
const collisionFrames=[];
for(const id of roleIds){const phases=id==='artisan'?[0,.25,.5,.75]:[0];for(const phase of phases)collisionFrames.push(collisionFrame(id,models[id],phase,id==='artisan'?'walk':'idle'))}
json('v9-collision-input.json',{views,frames:collisionFrames,classification:'BVH triangle intersections + rendered visible-face buffers; intentional layering separated from visible penetration'});
const report={revision:'v0.9',roles:roleReport,morphs:morphRows,style:styleReport,silhouette:{metrics:silhouetteMetrics,thresholds:'Measured only; no universal IoU pass/fail because role silhouette differences are an art direction judgement.'},materials:{source:scan?.provenance??null,scanAvailable:!!scan,selected:'C hybrid scan + existing deterministic maps',mapCount:3},humanMotion:{frames:25,durationSeconds:1.12,rootTravelMetres:artisan.spec.gaitStride,stanceSamples:stance.length,maxHorizontalDrift:maxDrift,maxGroundError:maxGround,maxSoleRange,contactGate:{driftMetres:.025,groundMetres:.02,soleRangeMetres:.03,passed:maxDrift<.025&&maxGround<.02&&maxSoleRange<.03},cmu:cmuComparison},cloth:{garment:cloth.name,outerVertices:clothBase.outerVertexCount,triangles:clothBase.indices.length/3,colliders:colliderParts.map(p=>({name:p.name,vertices:p.outerVertexCount,triangles:p.indices.length/3})),frames:25},limitations:['Historical kits are reconstruction studies, not museum-approved replicas.','No weapon-bearing animation was generated.','Cloth output is a precomputed cache; Blender is not required by runtime.','CMU and CC0 clips are comparative references, not sources for the authored motion.'],runtimeMs:performance.now()-start};
json('v9-report.json',report);console.log(JSON.stringify({roles:roleReport.map(x=>({id:x.id,parts:x.partCount,triangles:x.triangleCount,rootMotion:x.rootMotionChannel})),morphs:morphRows.map(x=>x.name),style:styleReport,contact:report.humanMotion.contactGate,cmu:cmuComparison?{mean:cmuComparison.mean,p95:cmuComparison.p95,max:cmuComparison.max}:null,cloth:report.cloth}));
