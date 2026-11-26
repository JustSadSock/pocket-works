// Bounded v8 production study: four distinct roles, five fits, one walk.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {produceRole,roles} from './roles-v8.mjs';
import {draftGarments} from './garment.mjs';
import {glb,inspectGLB} from './glb.mjs';
import {raster,commonBounds,materialMaps,profiles,png} from './material-study.mjs';
import {pose,deform,rotate} from './core.mjs';
import {normals,weights} from './hybrid-human.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v),json=(n,v)=>write(n,JSON.stringify(v,null,2)),src=n=>read('makehuman-'+n+'.json'),base=src('base'),t=performance.now();
const identities=JSON.parse(readFileSync(new URL('identities-v4.json',import.meta.url)));
const maps=Object.fromEntries(Object.keys(profiles).map(k=>[k,materialMaps(k,256)]));
const scan=existsSync(join(out,'v8-linen.json'))?read('v8-linen.json'):null;
const B=scan?{size:scan.size,...Object.fromEntries(Object.entries(scan.channels).map(([k,v])=>[k,new Uint8Array(Buffer.from(v,'base64'))]))}:null;
const C=B?{size:B.size,color:new Uint8Array(B.color.length),normal:new Uint8Array(B.normal.length),roughness:new Uint8Array(B.roughness.length)}:null;
if(C)for(let i=0;i<B.color.length;i+=4){
 for(let k=0;k<3;k++){C.color[i+k]=Math.round(.40*maps.cloth.color[i+k]+.60*B.color[i+k]);C.normal[i+k]=Math.round(.45*maps.cloth.normal[i+k]+.55*B.normal[i+k]);C.roughness[i+k]=Math.round(.30*maps.cloth.roughness[i+k]+.70*B.roughness[i+k])}
 C.color[i+3]=C.normal[i+3]=C.roughness[i+3]=255;
}
const selectedMaps={...maps,cloth:C??maps.cloth},mapMs=performance.now()-t;
for(const [label,m] of [['A',maps.cloth],['B',B],['C',C]])if(m)for(const key of ['color','normal','roughness'])write('v8-fabric-'+label+'-'+key+'.png',png(m.size,m.size,m[key]));
const report={roles:[],morphs:[],materialMs:mapMs,materialSource:scan?.provenance??null,materialFallback:!scan,approval:'unreviewed',limitations:['Historical roles are production studies, not archaeological reconstructions.','New neutral and walk are procedural, not a new mocap clip.','No forced foot locks or approved fabric simulation.','All weapon-bearing roles static only.']},models={},posed={},collisions=[];
function neutralGround(m){const w=pose(m,'idle',0);return Math.min(...m.parts.filter(p=>/^boot [LR]$/.test(p.name)).flatMap(p=>deform(m,p,w).map(v=>v[1])))}
function ground(m,action='idle',phase=0){
 const w=pose(m,action,phase),q=structuredClone(m);
 for(let i=0;i<q.parts.length;i++){q.parts[i].positions=deform(m,m.parts[i],w).flat();normals(q.parts[i])}
 // Preserve real motion heights in gait diagnostics; only presentation
 // neutral stance is vertically aligned with the ground.
 const min=neutralGround(m);for(const p of q.parts)for(let i=1;i<p.positions.length;i+=3)p.positions[i]-=min;
 return q;
}
function prepare(m,id){
 for(const p of m.parts){p.texcoords=[];for(let i=0;i<p.positions.length;i+=3)p.texcoords.push(p.positions[i]*5+p.positions[i+2]*2.7,p.positions[i+1]*5);if(!p.positions.every(Number.isFinite)||!p.normals.every(Number.isFinite))throw Error('Nonfinite role surface '+p.name)}
 if(['infantry','legionary'].includes(id))m.spec.actions=['idle'];
 for(const side of ['L','R']){
   const p=m.parts.find(p=>p.name==='boot '+side),j=m.joints.find(j=>j.name==='foot.'+side),n=p.positions.length/3;
   const feet=Array.from({length:n},(_,i)=>p.positions.slice(3*i,3*i+3)),bottom=Math.min(...feet.map(v=>v[1])),sole=feet.filter(v=>v[1]<bottom+.012),center=sole.reduce((a,v)=>a.map((x,k)=>x+v[k]/sole.length),[0,0,0]);m.contacts.push({joint:j.id,role:'sole',local:center.map((x,k)=>x-j.position[k]),phase:side==='L'?0:.5});
 }
 return m;
}
function snapshot(label,m,phase=null){collisions.push({label,phase,parts:m.parts.filter(p=>p.layer||/source body|body/.test(p.name)).map(p=>({name:p.name,layer:p.layer??0,positions:p.positions,indices:p.indices}))})}
for(const [id,r] of Object.entries(roles)){
 const m=prepare(produceRole(src(r.morph),id),id),s=performance.now(),bin=glb(m,{detailMaps:selectedMaps});inspectGLB(bin);
 write('v8-'+id+'.glb',bin);json('v8-'+id+'.spec.json',m.spec);json('v8-'+id+'.model.json',m);
 models[id]=m;posed[id]=ground(m);snapshot(id,posed[id]);
 report.roles.push({id,morph:r.morph,parts:m.parts.map(p=>p.name),...m.statistics,exportMs:performance.now()-s,bytes:bin.length});
}
for(const view of ['front','side','three-quarter']){
 const bounds=commonBounds(Object.values(posed),view);
 for(const [id,m] of Object.entries(posed)){
   const s=performance.now(),r=raster(m,{view,bounds,size:768,mode:'C',maps:selectedMaps});
   write('v8-'+id+'-'+view+'.png',r.png);report.roles.find(x=>x.id===id)[view+'Ms']=performance.now()-s;
   if(view==='three-quarter')write('v8-'+id+'-sprite.png',raster(m,{view,bounds,size:256,mode:'C',maps:selectedMaps,transparent:true}).png);
   if(view==='front'){const im=raster(m,{view,bounds,size:256,transparent:true});for(let i=0;i<im.rgba.length;i+=4){im.rgba[i]=im.rgba[i+1]=im.rgba[i+2]=37}write('v8-'+id+'-silhouette.png',png(256,256,im.rgba))}
 }
}
const artisan=posed.artisan,bounds=commonBounds([artisan],'three-quarter');
for(const [label,cloth] of [['A',maps.cloth],['B',B],['C',C]])if(cloth)write('v8-fabric-'+label+'-comparison.png',raster(artisan,{view:'three-quarter',bounds,size:768,mode:'C',maps:{...maps,cloth}}).png);
// Five morphs of the same work apron outfit; record rejection rather than
// silently reverting to an obsolete garment revision.
const morphModels={};
for(const name of ['base','young-woman','older-woman','older-man','tall-heavy','short-light']){
 try{
   const {colors,...identity}=identities[name].identity;
   const m=name==='base'?models.artisan:prepare(produceRole(src(name),'artisan',{...identity,beard:identity.beard??false}),'artisan'),q=ground(m),p=m.parts.find(x=>x.name==='tunic');morphModels[name]=q;
   if(name!=='base')write('v8-morph-'+name+'.glb',glb(m,{detailMaps:selectedMaps}));
   snapshot('morph-'+name,q);report.morphs.push({name,passed:true,sections:p.pattern.sections,attachment:m.parts.find(p=>p.name==='belt pouch')?.attachment,triangles:m.statistics.triangleCount,roleMs:m.statistics.roleMs});
 }catch(e){report.morphs.push({name,passed:false,error:String(e)})}
}
const morphBounds=commonBounds(Object.values(morphModels),'three-quarter');for(const [name,q] of Object.entries(morphModels))write('v8-morph-'+name+'.png',raster(q,{view:'three-quarter',bounds:morphBounds,size:512,mode:'C',maps:selectedMaps}).png);
const walk=models.artisan,frames=[],motion=[],offset=neutralGround(walk);
const handIds=new Set(walk.joints.filter(j=>/^(wrist|finger|metacarpal|thumb)/.test(j.name)).map(j=>j.id));
function pouchHandGap(q){const bag=q.parts.find(p=>p.name==='belt pouch'),hands=[];for(let j=0;j<walk.parts.length;j++){const p=walk.parts[j];if(p.component!=='body')continue;for(let i=0;i<p.positions.length/3;i++)if(weights(p,i).reduce((a,[j,w])=>a+(handIds.has(j)?w:0),0)>.5)hands.push(q.parts[j].positions.slice(i*3,i*3+3))}let d=Infinity;for(const v of hands)for(let i=0;i<bag.positions.length;i+=3)d=Math.min(d,Math.hypot(...v.map((x,k)=>x-bag.positions[i+k])));return Number.isFinite(d)?d:null}
mkdirSync(join(out,'v8-human-motion'),{recursive:true});
for(let i=0;i<12;i++){
 const phase=i/12,q=ground(walk,'walk',phase),w=pose(walk,'walk',phase);
 frames.push(q);motion.push({phase,handPouchNearestVertexMetres:pouchHandGap(q),contacts:walk.contacts.map(c=>({joint:walk.joints[c.joint].name,point:rotate(w[c.joint].q,c.local).map((x,k)=>x+w[c.joint].p[k]-(k===1?offset:0))}))});
 if(i%3===0)snapshot('artisan-walk',q,phase);
}
const motionBounds=commonBounds(frames,'side');for(let i=0;i<frames.length;i++)write('v8-human-motion/'+String(i).padStart(2,'0')+'.png',raster(frames[i],{view:'side',bounds:motionBounds,size:512,groundLine:true,mode:'C',maps:selectedMaps}).png);
report.motion={frames:motion,contactMethod:'sole landmark relative to neutral ground; no ground lock, in-place cycle; hand/pouch nearest vertex estimate, exact BVH separate',groundBounds:motionBounds};
const cape=draftGarments(base,{kit:'traveler',style:'historical-miniature',method:'hybrid',surfaceRevision:4}).find(p=>p.name==='cloak'),count=cape.positions.length/6;
json('cloth-control.json',{cape:{positions:cape.positions.slice(0,count*3),indices:Array.from({length:cape.indices.length/3},(_,i)=>cape.indices.slice(i*3,i*3+3)).filter(f=>f.every(j=>j<count)).flat()},collider:{positions:base.parts[0].positions,indices:base.parts[0].indices}});
json('v8-collision-input.json',collisions);json('v8-report.json',report);
if(report.morphs.filter(x=>x.passed).length<5)throw Error('Fewer than five morphology fits passed');
console.log(JSON.stringify({roles:report.roles.map(({id,triangleCount,roleMs,bytes})=>({id,triangleCount,roleMs,bytes})),morphs:report.morphs.map(({name,passed,error})=>({name,passed,error})),materialFallback:report.materialFallback}));
