// Small research sprite adapter. Common fixed bounds per direction, ground anchor
// in frame pixels, transparent raster source and immutable provenance.
import {preview} from './preview.mjs';import {pose,rotate} from './core.mjs';
const union=(a,b)=>a?[Math.min(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.max(a[3],b[3])]:b;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),unit=a=>a.map(x=>x/(Math.hypot(...a)||1));
export function spriteProduction(model,{directions=[0,Math.PI/2,Math.PI,Math.PI*1.5],frames=8,size=128,action='walk'}={}){
 if(!Number.isInteger(frames)||frames<1||frames>16||directions.length<1||directions.length>8||!Number.isInteger(size)||size<32||size>512)throw Error('Research sprite budget exceeded');
 const results=[],t=performance.now();
 for(let [d,azimuth] of directions.entries()){
  let bounds=null;for(let i=0;i<frames;i++)bounds=union(bounds,preview(model,{action,phase:i/frames,azimuth,transparent:true,width:size,height:size}).bounds);
  let scale=Math.min((size-16)/(bounds[1]-bounds[0]),(size-16)/(bounds[3]-bounds[2])),dir=unit([Math.sin(azimuth),.3,Math.cos(azimuth)]),right=unit(cross([0,1,0],dir)),up=cross(dir,right),project=p=>[size/2+(dot(p,right)-(bounds[0]+bounds[1])/2)*scale,size/2-(dot(p,up)-(bounds[2]+bounds[3])/2)*scale];
  for(let i=0;i<frames;i++){let phase=i/frames,w=pose(model,action,phase),p=preview(model,{action,phase,azimuth,transparent:true,width:size,height:size,fixedBounds:bounds}),root=w[0].p,anchor=project([root[0],0,root[2]]),feet=model.contacts.map(c=>{let t=w[c.joint],v=rotate(t.q,c.local).map((x,j)=>x+t.p[j]);return {joint:c.joint,pixel:project(v),world:v}});results.push({direction:d,azimuth,phase,index:i,rect:[i*size,d*size,size,size],bounds,anchor,feet,pixelsPerMetre:scale,svg:p.svg})}
 }
 return {frames:results,metadata:{version:1,recipe:model.spec.recipe,spec:model.spec,directions,phases:frames,size,atlasWidth:frames*size,atlasHeight:directions.length*size,action,provenance:model.spec.provenance,approval:'unreviewed',svgGenerationMs:performance.now()-t}}
}
