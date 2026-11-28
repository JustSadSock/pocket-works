// Render directly from evaluated coupon samples; collision triangles are marked.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {raster,commonBounds} from './material-study.mjs';
import {normals} from './hybrid-human.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),base=read('v16-cloth-coupon.json'),matrix=read('v17-cloth-matrix.json');
const trials={...base.results,...matrix.details};
const cv=v=>[v[0],v[2],-v[1]];
function model(s,heat=false){
 const f=base.faces,positions=s.vertices.map(cv),strains=positions.map(()=>1),hit=new Set((s.selfPairs??[]).flatMap(pair=>pair.flatMap(i=>f[i])));
 base.edges.forEach(([a,b],i)=>{strains[a]=Math.max(strains[a],s.strain[i]);strains[b]=Math.max(strains[b],s.strain[i])});
 const cloth={name:'evaluated coupon',component:'clothing',positions:positions.flat(),indices:f.flat(),color:[.24,.39,.52]};
 if(heat)cloth.vertexTint=strains.flatMap((r,i)=>hit.has(i)?[.98,.09,.08]:[.18+.72*Math.min(1,(r-1)/.6),.56-.34*Math.min(1,(r-1)/.6),.22]);
 const sphere={name:'evaluated collider',component:'body',positions:s.colliderVertices.map(cv).flat(),indices:s.colliderFaces.flat(),color:[.56,.58,.62]};
 return {parts:(heat?[cloth]:[cloth,sphere]).map(p=>{normals(p);return p})};
}
for(const [label,trial] of Object.entries(trials)){
 const first=trial.firstSelfFrame,samples=[...new Map(trial.samples.map(s=>[s.frame,s])).values()];
 const picked=first===null||first===undefined?[samples.at(-1)]:samples.filter(s=>s.frame>=first-1&&s.frame<=first+1);
 if(!picked.length)continue;
 for(const view of ['front','side']){
  const bounds=commonBounds(picked.map(s=>model(s)),view);
  for(const s of picked)for(const heat of [false,true])writeFileSync(join(out,'v17-coupon-'+label+'-'+s.frame+'-'+view+(heat?'-strain-self':'')+'.png'),raster(model(s,heat),{view,bounds,size:512,mode:'A'}).png);
 }
}
