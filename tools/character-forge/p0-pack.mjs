import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';import {join} from 'node:path';import {performance} from 'node:perf_hooks';import {profile,hash,canonical} from './p0-profile.mjs';import {produceRoleV9} from './roles-v9.mjs';import {glb} from './glb.mjs';import {fourInfluenceCandidate} from './authored-surface.mjs';import {pose,deform} from './core.mjs';import {normals} from './hybrid-human.mjs';import {raster,commonBounds} from './material-study.mjs';
const root=process.env.CHARACTER_P0_DIR,out=process.env.P0_PACK_OUT,source=process.env.P0_SOURCE_DIR;mkdirSync(out,{recursive:true});const names=profile.roles.flatMap(r=>profile.morphotypes.map(m=>r+'-'+m)),read=n=>JSON.parse(readFileSync(n));const models=names.map(n=>{const p=join(root,n,'p0-model.json');return existsSync(p)?read(p):null});
if(models.some(m=>!m))throw Error('Missing one or more civilian candidates; no six-model claim');
const posed=models.map(m=>({parts:m.parts.map(p=>{const q={...p,positions:deform(m,p,pose(m,'idle',0)).flat()};normals(q);return q})}));
for(const view of ['front','side','three-quarter']){
 const bounds=commonBounds(posed,view);
 for(let i=0;i<names.length;i++)writeFileSync(join(out,names[i]+'-'+view+'.png'),raster(posed[i],{view,bounds,size:640,mode:'B'}).png)
}
const batch=[];for(const count of [1,10,100]){let peakRss=process.memoryUsage().rss,bytes=0,geometryMs=0,exportMs=0;const start=performance.now();for(let i=0;i<count;i++){
 const begin=performance.now(),index=i%names.length,ref=models[index],role=ref.spec.artRole,morph=ref.spec.p0Morphotype,src=read(join(source,'makehuman-'+morph+'.json')),m=fourInfluenceCandidate(produceRoleV9(src,role,null,{civilianP0:true})).model;m.spec=structuredClone(ref.spec);m.sampledWalk=structuredClone(ref.sampledWalk);m.approval=ref.approval;
 geometryMs+=performance.now()-begin;const h=canonical(m),expected=canonical(ref);if(Object.keys(h).some(k=>h[k]!==expected[k]))throw Error('Batch reused motion on a different generated resource');
 const exportStart=performance.now(),b=glb(m);exportMs+=performance.now()-exportStart;bytes+=b.length;peakRss=Math.max(peakRss,process.memoryUsage().rss)
 }const elapsedMs=performance.now()-start;batch.push({count,elapsedMs,geometryMs,exportMs,perResourceMs:elapsedMs/count,peakRssBytes:peakRss,totalBytes:bytes});}
writeFileSync(join(out,'batch-1-10-100.json'),JSON.stringify({batch,scope:'fresh parametric geometry + GLB each resource, exact precomputed per-resource motion; cold cyclic solve timed separately in per-model CI, not included in batch',productionActivation:false},null,2));
