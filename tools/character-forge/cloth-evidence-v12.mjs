// Render only actual evaluated cloth and collider surfaces around failure.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {raster,commonBounds} from './material-study.mjs';
import {normals} from './hybrid-human.mjs';
const out=process.env.CHARACTER_EVIDENCE;
const model=(s,faces)=>({parts:[{name:'simulated robe',color:[.19,.30,.42],component:'clothing',positions:s.positions.flat(),indices:faces.flat()},...s.colliders.map((p,i)=>({name:p.name,color:p.name.startsWith('boot')?[.30,.18,.10]:p.name==='tunic'?[.25,.38,.25]:[.60,.48,.32],component:'clothing',positions:p.positions.flat(),indices:p.faces.flat()}))].map(p=>{normals(p);return p})});
for(const label of ['static','original','smooth','continuous','fine','world']){const path=join(out,'v13-cloth-'+label+'.json');if(!existsSync(path))continue;const data=JSON.parse(readFileSync(path)),samples=[...new Map(data.samples.map(s=>[s.frame,s])).values()].sort((a,b)=>a.frame-b.frame),models=samples.map(s=>model(s,data.faces)),dir=join(out,'v13-cloth-'+label+'-frames');mkdirSync(dir,{recursive:true});
 for(const view of ['front','side']){const bounds=commonBounds(models,view);for(let i=0;i<models.length;i++){const frame=String(samples[i].frame).padStart(3,'0');writeFileSync(join(dir,view+'-'+frame+'.png'),raster(models[i],{view,bounds,size:512,mode:'A',groundLine:true}).png);const clothOnly={parts:[models[i].parts[0]]};writeFileSync(join(dir,view+'-cloth-'+frame+'.png'),raster(clothOnly,{view,bounds,size:512,mode:'A',groundLine:true}).png)}}
}
