// Render only actual evaluated Remesh surfaces with common matched bounds.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {raster,commonBounds} from './material-study.mjs';
import {normals} from './hybrid-human.mjs';
const root=process.env.CHARACTER_EVIDENCE,rows=[];
for(const name of 'ABCDEF'){
 const dir=join(root,'v21-contact-'+name),path=join(dir,'v15-cloth-remesh.json');if(!existsSync(path))continue;
 const data=JSON.parse(readFileSync(path,'utf8')),samples=[...new Map(data.samples.map(s=>[s.frame,s])).values()].sort((a,b)=>a.frame-b.frame);
 const models=samples.map(s=>({parts:[{name:'simulated robe',color:[.19,.30,.42],positions:s.positions.flat(),indices:data.faces.flat()},...s.colliders.map(p=>({name:p.name,color:[.60,.48,.32],positions:p.positions.flat(),indices:p.faces.flat()}))].map(p=>{normals(p);return p})}));
 const peak=data.diagnostics.reduce((a,b)=>a.maxStretch>b.maxStretch?a:b).frame;
 rows.push({name,dir,data,samples,models,peak});
}
if(!rows.length)throw Error('No completed contact geometry');
for(const view of ['front','side']){
 const bounds=commonBounds(rows.flatMap(x=>x.models),view);
 // Fixed anatomical close-up uses the same watch-panel faces and all actual frames.
 const closeModels=rows.map(r=>r.models.map((m,i)=>{
  const ids=new Set([106,107,138,139,170,171]),faces=r.data.faces.filter(f=>f.some(x=>ids.has(x)));
  const vertices=[...new Set(faces.flat())],lookup=new Map(vertices.map((x,j)=>[x,j]));
  const p={...m.parts[0],positions:vertices.flatMap(j=>r.samples[i].positions[j]),indices:faces.flatMap(f=>f.map(j=>lookup.get(j)))};
  normals(p);return {parts:[p]};
 }));
 const closeBounds=commonBounds(closeModels.flat(),view);
 for(let ri=0;ri<rows.length;ri++){
  const r=rows[ri],seq=join(r.dir,'v21-'+view+'-sequence');mkdirSync(seq,{recursive:true});
  const selected=new Set([1,40,41,42,43,44,45,46,47,48,r.data.firstDefect,r.peak,r.samples.at(-1).frame]);
  for(let i=0;i<r.samples.length;i++){
   const s=r.samples[i],m=r.models[i],n=String(s.frame).padStart(3,'0');
   writeFileSync(join(seq,String(i).padStart(3,'0')+'.png'),raster(m,{view,bounds,size:512,mode:'A',groundLine:true}).png);
   if(!selected.has(s.frame))continue;
   const p=structuredClone(m.parts[0]),rest=r.data.restPositions,v=s.positions,strain=rest.map(()=>1);
   for(const f of r.data.faces)for(let k=0;k<3;k++){const a=f[k],b=f[(k+1)%3],d=Math.hypot(...rest[a].map((x,j)=>x-rest[b][j])),x=Math.hypot(...v[a].map((x,j)=>x-v[b][j]))/Math.max(d,1e-9);strain[a]=Math.max(strain[a],x);strain[b]=Math.max(strain[b],x)}
   const pins=new Set(r.data.pinIndices);p.vertexTint=strain.flatMap((x,j)=>pins.has(j)?[.19,.55,.9]:[.15+.8*Math.min(1,(x-1)/1.6),.48*(1-Math.min(1,(x-1)/1.6)),.14]);
   writeFileSync(join(r.dir,view+'-strain-'+n+'.png'),raster({parts:[p]},{view,bounds,size:512,groundLine:true}).png);
   writeFileSync(join(r.dir,view+'-contact-'+n+'.png'),raster(closeModels[ri][i],{view,bounds:closeBounds,size:512}).png);
  }
 }
}
