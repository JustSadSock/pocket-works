// One matched pose, four views, three surface candidates. No automatic art gate.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {glb,inspectGLB} from './glb.mjs';
import {sculptCitizen} from './sculpt-v7.mjs';
import {profiles,materialMaps,png,raster,commonBounds} from './material-study.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v),json=(n,v)=>write(n,JSON.stringify(v,null,2)),A=read('v6-citizen.model.json'),start=performance.now(),{model:B,diagnostics}=sculptCitizen(A),C=structuredClone(B),sculptMs=performance.now()-start,maps={},mapStart=performance.now();
for(const kind of Object.keys(profiles)){
 const m=maps[kind]=materialMaps(kind);
 for(const channel of ['color','normal','roughness'])write('v7-material-'+kind+'-'+channel+'.png',png(m.size,m.size,m[channel]));
}
const mapsMs=performance.now()-mapStart;
const views=['front','side','back','three-quarter'],models={A,B,C},records=[],allCollisions=[];
for(const [label,m] of Object.entries(models)){
 const t=performance.now(),data=glb(m,label==='C'?{detailMaps:maps}:{}),doc=inspectGLB(data);
 write('v7-'+label+'.glb',data);
 const exportMs=performance.now()-t;
 if(label==='C'&&(!doc.images?.length||!doc.meshes[0].primitives.every(p=>p.attributes.TEXCOORD_0!==undefined)))throw Error('Missing texture export');
 if(JSON.stringify(m.joints)!==JSON.stringify(A.joints))throw Error('Rig changed');
 if(JSON.stringify(m.parts[0].positions)!==JSON.stringify(A.parts[0].positions))throw Error('Anatomy changed');
 records.push({label,triangles:m.statistics.triangleCount,vertices:m.statistics.vertices,exportMs,bytes:data.length,images:doc.images?.length??0,views:[]});
 if(label!=='C')allCollisions.push({label,parts:m.parts.filter(p=>p.layer).map(p=>({name:p.name,layer:p.layer,positions:p.positions,indices:p.indices}))});
}
for(const view of views){
 const bounds=commonBounds([A,B,C],view);
 for(const [label,m] of Object.entries(models)){
   const t=performance.now(),r=raster(m,{view,bounds,mode:label,maps,size:896});
   write('v7-'+label+'-'+view+'.png',r.png);
   records.find(x=>x.label===label).views.push({view,rasterMs:performance.now()-t,visible:r.visible,bounds});
   // Retain exact visible triangle ownership for optional BVH overlap maps.
   if(label!=='C'){
     const b=Buffer.alloc(r.faces.length*4);for(let i=0;i<r.faces.length;i++)b.writeUInt32LE(r.faces[i]<0?0xffffffff:((r.owners[i]<<24)|r.faces[i])>>>0,i*4);
     write('v7-'+label+'-'+view+'.ownership.bin',b);
     json('v7-'+label+'-parts.json',m.parts.map(p=>p.name));
   }
 }
}
for(const [label,m] of Object.entries(models))write('v7-'+label+'-sprite.png',raster(m,{view:'three-quarter',mode:label,maps,size:256,bounds:commonBounds([A,B,C],'three-quarter'),transparent:true}).png);
json('v7-collision-input.json',allCollisions);json('v7-report.json',{sculptMs,mapsMs,diagnostics,records,materialProfiles:profiles,gate:'pending-art-and-visible-overlap-review',productionAuthorized:false,limitations:['Native static depth raster uses approximate lighting and planar UV projection.','C maps are deterministic procedural tiles, not approved hand-painted textures or a Blender bake.','B and C use identical mesh and pose; A is unmodified v6 geometry.','No new morph or warrior production until acceptance.']});
console.log(JSON.stringify({sculptMs,mapsMs,records:records.map(({label,triangles,bytes,images,exportMs})=>({label,triangles,bytes,images,exportMs}))}));
