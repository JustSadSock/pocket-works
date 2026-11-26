import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {join} from 'node:path';import {dress,draftGarments,bindTemplate,garmentAudit} from './garment.mjs';import {glb} from './glb.mjs';import {preview} from './preview.mjs';import {spriteProduction} from './sprite.mjs';import {build,pose,poseFrom,deform} from './core.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v),json=(n,v)=>write(n,JSON.stringify(v,null,2)),source=n=>read('makehuman-'+n+'.json'),base=source('base'),target=source('tall-heavy'),identity=JSON.parse(readFileSync(new URL('identities-v4.json',import.meta.url))),report=[];
function save(name,m,src,options){let t=performance.now();write(name+'.glb',glb(m));let exportMs=performance.now()-t;json(name+'.spec.json',{source:src.spec.phenotype,garment:options,provenance:src.spec.provenance});write(name+'.model.json',JSON.stringify(m));for(let view of ['front','side','three-quarter'])write(name+'-'+view+'.svg',preview(m,{view,neutral:true}).svg);report.push({name,...m.statistics,exportMs,parts:m.parts.map(p=>({name:p.name,layer:p.layer??0,region:p.region,thickness:p.thickness,triangles:p.indices.length/3,pattern:p.pattern}))})}
let options={style:'historical-miniature',kit:'tunic',identity:identity.base.identity},t=performance.now(),template=bindTemplate(base,draftGarments(base,{...options,method:'pattern'}));json('tunic-template.json',template);let templateMs=performance.now()-t,comparison=[];
for(let method of ['pattern','template','hybrid']){let spec={...options,method},m=dress(target,spec,template);save('method-'+method,m,target,spec);let t=performance.now(),audit=garmentAudit(target,m);comparison.push({method,constructionMs:m.statistics.garmentMs,auditMs:performance.now()-t,audit});}
for(let [name,c] of Object.entries(identity)){let src=source(name),spec={...c,method:'hybrid'},m=dress(src,spec);save('identity-'+name,m,src,spec)}
for(let [kit,src] of [['tunic',base],['warrior',target]])for(let style of ['low-poly','historical-miniature','anatomical-realism']){let spec={kit,style,method:'hybrid',identity:kit==='warrior'?identity['tall-heavy'].identity:identity.base.identity};let m=dress(src,spec);save('style-'+kit+'-'+style,m,src,spec);if(style!=='anatomical-realism'){let p=spriteProduction(m,{size:128,frames:2,directions:[0,Math.PI/2]});for(let f of p.frames)write('readability-'+kit+'-'+style+'-'+f.direction+'-'+f.index+'.svg',f.svg)}}
// One short two-angle clothing deformation probe; do not expand combat clips.
for(let [kit,src] of [['traveler',source('older-man')],['warrior',target]]){let opt={kit,style:'historical-miniature',method:'hybrid',identity:kit==='traveler'?identity['older-man'].identity:identity['tall-heavy'].identity},m=dress(src,opt),folder='garment-'+kit+'-motion';mkdirSync(join(out,folder),{recursive:true});
 for(let i=0;i<8;i++)for(let view of ['front','side'])write(folder+'/'+view+'-'+String(i).padStart(2,'0')+'.svg',preview(m,{view,action:'walk',phase:i/8,neutral:true}).svg);
 if(kit==='traveler'){let cape=m.parts.find(p=>p.name==='cloak'),count=cape.positions.length/6;json('cloth-control.json',{cape:{positions:cape.positions.slice(0,count*3),indices:Array.from({length:cape.indices.length/3},(_,i)=>cape.indices.slice(i*3,i*3+3)).filter(f=>f.every(j=>j<count)).flat()},collider:{positions:src.parts[0].positions,indices:src.parts[0].indices}})}
 if(kit==='warrior'){let snapshots=[];for(let phase of [0,.25,.5,.75]){let w=pose(m,'walk',phase);snapshots.push({phase,parts:[{name:'hidden anatomy',layer:0,positions:deform(src,src.parts[0],w).flat(),indices:src.parts[0].indices},...m.parts.filter(p=>p.layer).map(p=>({name:p.name,layer:p.layer,positions:deform(m,p,w).flat(),indices:p.indices}))]})}json('garment-collision-input.json',snapshots)}
}
json('garment-v4-report.json',{models:report,templateBindingMs:templateMs,comparison,limitations:['Template B is one original drafted mesh bound to nearest fixed anatomical vertex; not an independently approved clothing asset.','Body/garment signed normal diagnostic is approximate. Exact mesh overlap is a separate optional Blender probe.','Hybrid folds are authored displacement and skinned weights, no dynamic cloth correction guarantee.','All models unreviewed.']});console.log(JSON.stringify({models:report.map(({name,triangleCount,garmentMs,exportMs})=>({name,triangleCount,garmentMs,exportMs})),comparison:comparison.map(x=>({method:x.method,constructionMs:x.constructionMs,auditMs:x.auditMs,negative:x.audit.flatMap(f=>f.rows).reduce((a,b)=>a+b.negative,0),samples:x.audit.flatMap(f=>f.rows).reduce((a,b)=>a+b.samples,0)}))}));

// V5: focused candidates only. Keep v4 controls and existing Studio fixtures.
const v5=[],snapshots=[],phaseSpec=[{label:'rest',phase:null},...([0,.25,.5,.75].map(phase=>({label:'walk',phase})))];
const rest=m=>m.joints.map(()=>[0,0,0,1]);
function candidate(name,src,opt,views=['front','three-quarter']){
 const m=dress(src,{...opt,method:'hybrid',surfaceRevision:5});
 const start=performance.now();write(name+'.glb',glb(m));const exportMs=performance.now()-start;
 const renderStart=performance.now();
 for(const view of views)write(name+'-'+view+'.svg',preview(m,{view,rotations:rest(m),neutral:false}).svg);
 const previewMs=performance.now()-renderStart;
 v5.push({name,options:m.spec.garment,source:src.spec.phenotype,provenance:src.spec.provenance,...m.statistics,exportMs,previewMs,parts:m.parts.map(p=>({name:p.name,layer:p.layer,region:p.region,triangles:p.indices.length/3,outerVertexCount:p.outerVertexCount}))});
 return m;
}
const control={};
for(const style of ['low-poly','historical-miniature'])for(const kit of ['tunic','warrior']){
 const src=kit==='warrior'?target:base,art=structuredClone(kit==='warrior'?identity['tall-heavy'].identity:identity.base.identity);
 // Distinct authored material families and silhouette rules, not random palettes.
 if(style==='low-poly')art.colors={tunic:'ochre',quilted:'madder',shirt:'linen',trousers:'charcoal'};
 else art.colors={tunic:'wool',quilted:'indigo',shirt:'linen',trousers:'charcoal'};
 const m=candidate('v5-'+kit+'-'+style,src,{style,kit,identity:art},['front','side','three-quarter']);
 control[kit+'-'+style]=m;
 if(style==='historical-miniature'){
   const folder='v5-'+kit+'-motion';mkdirSync(join(out,folder),{recursive:true});
   for(let i=0;i<8;i++)for(const view of ['front','side'])write(folder+'/'+view+'-'+String(i).padStart(2,'0')+'.svg',preview(m,{view,action:'walk',phase:i/8}).svg);
   for(const f of phaseSpec){
     const w=f.phase===null?poseFrom(m,rest(m)):pose(m,'walk',f.phase);
     const parts=[{name:'hidden anatomy',layer:0,positions:deform(src,src.parts[0],w).flat(),indices:src.parts[0].indices},...m.parts.filter(p=>p.layer).map(p=>({name:p.name,layer:p.layer,positions:deform(m,p,w).flat(),indices:p.indices}))];
     snapshots.push({kit,...f,parts});
   }
   for(const names of kit==='warrior'?[['shirt','quilted'],['trousers L','boot L']]:[['tunic'],['trousers L','boot L']]){
     const isolated={...m,parts:m.parts.filter(p=>names.includes(p.name))};
     write('v5-component-'+kit+'-'+names[0].replaceAll(' ','-')+'.svg',preview(isolated,{view:'three-quarter',rotations:rest(m)}).svg);
   }
 }
}
for(const name of Object.keys(identity)){
 const src=source(name),art=structuredClone(identity[name].identity);
 candidate('v5-variation-'+name,src,{kit:'tunic',style:'historical-miniature',identity:art},['three-quarter']);
}
// One tactical scene uses the same declared historical profile. Native rider
// remains a control, not a falsely claimed integration of the new garment.
for(const [name,m] of [['citizen',control['tunic-historical-miniature']],['infantry',control['warrior-historical-miniature']],...['rider','elephant'].map(recipe=>[recipe,build({version:2,recipe,style:'historical-miniature',lod:'medium',anatomy:'v4',motionRevision:'v4',actions:['idle','walk'],composite:recipe==='rider'})])]){
 for(let frame=0;frame<2;frame++)write('v5-scene-'+name+'-'+frame+'.svg',preview(m,{view:'game',action:'walk',phase:frame*.25,width:256,height:256,transparent:true}).svg);
}
json('garment-v5-collision-input.json',snapshots);
json('garment-v5-report.json',{revision:5,models:v5,limitations:['Unapproved candidates; closed topology is not proof of non-intersection.','Separate material trim may have intended contact; exact overlap review is optional.','Native rider remains a control. No game integration.']});
console.log(JSON.stringify({revision:5,models:v5.map(({name,triangleCount,garmentMs,previewMs,exportMs})=>({name,triangleCount,garmentMs,previewMs,exportMs}))}));
