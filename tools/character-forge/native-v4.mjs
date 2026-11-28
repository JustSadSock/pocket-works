import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {build,pose,animation,poseFrom,deform,rootOffset,rotate} from './core.mjs';import {glb} from './glb.mjs';import {preview} from './preview.mjs';import {resolveProfile} from './morphology.mjs';import {spriteProduction} from './sprite.mjs';
const out=process.env.CHARACTER_EVIDENCE;mkdirSync(out,{recursive:true});const reg=JSON.parse(readFileSync(new URL('animal-morphs.json',import.meta.url))),write=(n,v)=>writeFileSync(join(out,n),v),json=(n,v)=>write(n,JSON.stringify(v,null,2)),results=[],motions=[];
if(process.env.CHARACTER_V7_FOCUS==='1'){
 // Keep the exact legacy benchmark asset and bridge input. Only one horse
 // control; no new animal or native human animation atlases.
 const citizen=build({version:2,recipe:'citizen',style:'historical-miniature',lod:'medium',anatomy:'v3',motionRevision:'v3',actions:['idle','walk','fly'],composite:false});
 const p=spriteProduction(citizen,{size:128,frames:8});mkdirSync(join(out,'sprites-citizen'),{recursive:true});
 for(const f of p.frames)write('sprites-citizen/'+f.direction+'-'+f.index+'.svg',f.svg);
 json('sprites-citizen/metadata.json',{...p.metadata,frames:p.frames.map(({svg,...f})=>f)});write('sprites-citizen/model.glb',glb(citizen));
 const rider=build({version:2,recipe:'rider',style:'historical-miniature',lod:'medium',anatomy:'v4',motionRevision:'v4',actions:['idle','walk','fly'],composite:true});mkdirSync(join(out,'rider-historical-miniature-medium'),{recursive:true});write('rider-historical-miniature-medium/character.glb',glb(rider));
 const horse=build({...resolveProfile(reg,'horse','base'),anatomy:'v5',motionRevision:'v4'});write('v5-horse-base.glb',glb(horse));write('v5-horse-base-side.svg',preview(horse,{view:'side',neutral:true}).svg);
 json('native-v7-focus.json',{benchmarkAsset:'unchanged native v3 citizen, 8 frames by 4 directions',horse:'v5 base control only',bridge:'unchanged rider GLB'});
}else{
for(let family of ['horse','elephant'])for(let name of Object.keys(reg.profiles[family])){
 let spec=resolveProfile(reg,family,name);spec.anatomy='v4';spec.motionRevision='v4';let t=performance.now(),m=build(spec),ms=performance.now()-t,base=family+'-'+name;write(base+'.glb',glb(m));json(base+'.spec.json',spec);for(let view of ['front','side','three-quarter'])write(base+'-'+view+'.svg',preview(m,{view,neutral:true}).svg);results.push({family,name,...m.statistics,ms});
 if(name==='base'){let old=build({...spec,anatomy:'v3'});for(let view of ['front','side','three-quarter']){let a=preview(old,{view,neutral:true}).bounds,b=preview(m,{view,neutral:true}).bounds,bounds=[Math.min(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.max(a[3],b[3])];write(family+'-old-'+view+'.svg',preview(old,{view,neutral:true,fixedBounds:bounds}).svg);write(family+'-new-'+view+'.svg',preview(m,{view,neutral:true,fixedBounds:bounds}).svg)}}
}
for(let recipe of ['citizen','horse','elephant','rider','dog','bird']){let m=build({version:2,recipe,style:'historical-miniature',lod:'medium',anatomy:recipe==='citizen'?'v3':'v4',motionRevision:recipe==='citizen'?'v3':'v4',actions:['idle','walk','fly'],composite:recipe==='rider'}),action=recipe==='bird'?'fly':'walk',dir=recipe+'-motion';mkdirSync(join(out,dir),{recursive:true});
 if(['citizen','horse','elephant','rider'].includes(recipe))for(let i=0;i<16;i++){let phase=i/16,w=pose(m,action,phase),contacts=m.contacts.map(c=>{let v=w[c.joint],p=rotate(v.q,c.local).map((x,k)=>x+v.p[k]);return {joint:m.joints[c.joint].name,point:p}});motions.push({recipe,phase,root:rootOffset(m,action,phase),contacts});for(let view of ['side','front'])write(dir+'/'+view+'-'+String(i).padStart(2,'0')+'.svg',preview(m,{view,action,phase,neutral:true}).svg)}
 if(recipe==='rider'){mkdirSync(join(out,'rider-historical-miniature-medium'),{recursive:true});write('rider-historical-miniature-medium/character.glb',glb(m))}
 if(['horse','elephant'].includes(recipe)){let p=spriteProduction(m,{size:128,frames:2,directions:[0,Math.PI/2]});for(let f of p.frames)write('readability-'+recipe+'-'+f.direction+'-'+f.index+'.svg',f.svg)}
 if(recipe==='citizen'||recipe==='horse'){let p=spriteProduction(m,{size:128,frames:8});mkdirSync(join(out,'sprites-'+recipe),{recursive:true});for(let f of p.frames)write('sprites-'+recipe+'/'+f.direction+'-'+f.index+'.svg',f.svg);json('sprites-'+recipe+'/metadata.json',{...p.metadata,frames:p.frames.map(({svg,...f})=>f)});write('sprites-'+recipe+'/model.glb',glb(m))}
}
json('native-v4-report.json',{models:results,motions,limitations:['V4 shaped anatomical transitions, hooves, ears and curved chains; source mesh experiment separately','Five declarative profiles each; dog and bird smoke only','Root offset cyclical, not full locomotion; no solved horizontal locking']});console.log(JSON.stringify(results));

// V5: keep native v4 evidence and explicitly compare the revised horse.
const horse5=[],horseMotion=[];
for(const name of ['base','courser','draft']){
 const spec={...resolveProfile(reg,'horse',name),anatomy:'v5',motionRevision:'v4'},start=performance.now(),m=build(spec),buildMs=performance.now()-start;
 const prefix='v5-horse-'+name;write(prefix+'.glb',glb(m));json(prefix+'.spec.json',spec);
 for(const view of ['front','side','three-quarter']){
   const prev=build({...spec,anatomy:'v4'}),a=preview(prev,{view,neutral:true}).bounds,b=preview(m,{view,neutral:true}).bounds;
   const fixedBounds=[Math.min(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.max(a[3],b[3])];
   write(prefix+'-'+view+'.svg',preview(m,{view,neutral:true,fixedBounds}).svg);
   if(name==='base')write('v5-horse-control-'+view+'.svg',preview(prev,{view,neutral:true,fixedBounds}).svg);
 }
 horse5.push({name,...m.statistics,buildMs});
 if(name==='base'){
   const folder='v5-horse-motion';mkdirSync(join(out,folder),{recursive:true});
   for(let i=0;i<16;i++){
     const phase=i/16,w=pose(m,'walk',phase);
     horseMotion.push({phase,contacts:m.contacts.map(c=>({name:m.joints[c.joint].name,point:rotate(w[c.joint].q,c.local).map((v,k)=>v+w[c.joint].p[k])}))});
     for(const view of ['side','front'])write(folder+'/'+view+'-'+String(i).padStart(2,'0')+'.svg',preview(m,{view,action:'walk',phase,neutral:true}).svg);
   }
 }
}
json('native-v5-horse-report.json',{models:horse5,motion:horseMotion,limitations:['Revised thorax/neck loft and recessed proximal limb chains; not a unified watertight animal skin.','Preserves v4 motion and hoof geometry; visual and contact acceptance open.']});

}
