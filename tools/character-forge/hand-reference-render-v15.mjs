import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {raster,commonBounds} from './material-study.mjs';
import {normals} from './hybrid-human.mjs';
const out=process.env.CHARACTER_EVIDENCE,file=join(out,'v15-reference-poses.json');if(!existsSync(file))throw Error('Missing evaluated external hand poses');
const rows=JSON.parse(readFileSync(file)).poses,models=rows.map(row=>({parts:row.parts.map(p=>{normals(p);return p})}));
for(const view of ['front','side','three-quarter']){const bounds=commonBounds(models,view);for(let i=0;i<rows.length;i++)writeFileSync(join(out,'v15-reference-'+rows[i].name+'-'+view+'.png'),raster(models[i],{view,bounds,size:512,mode:'A'}).png)}
