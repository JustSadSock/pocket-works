// Actual generated geometry projection, using depth-sorted triangles.
// This is deliberately a fast CPU preview, not a physically based renderer.
import {pose,deform} from './core.mjs';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>a.map(v=>v/(Math.hypot(...a)||1));
export function preview(model,{action='idle',phase=0,view='three-quarter',width=720,height=720,fixedBounds=null}={}){
 let dir=unit(view==='side'?[1,.12,0]:view==='front'?[0,.12,1]:view==='game'?[1,2,1]:[1,.45,1.65]),right=unit(cross([0,1,0],dir)),up=cross(dir,right),world=pose(model,action,phase),tris=[],all=[];
 for(let part of model.parts){let vs=deform(model,part,world);all.push(...vs);for(let i=0;i<part.indices.length;i+=3){let v=part.indices.slice(i,i+3).map(k=>vs[k]),n=unit(cross(sub(v[1],v[0]),sub(v[2],v[0])));if(dot(n,dir)<0)continue;let d=v.reduce((s,p)=>s+dot(p,dir),0)/3;let light=.35+.62*Math.max(0,dot(n,unit([-.4,.9,1]))),rgb=part.color.map(c=>Math.round(255*Math.min(1,Math.pow(c*light,1/2.2))));tris.push({v,d,rgb})}}
 const xs=all.map(p=>dot(p,right)),ys=all.map(p=>dot(p,up));let bounds=fixedBounds??[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)],scale=Math.min((width-90)/(bounds[1]-bounds[0]),(height-110)/(bounds[3]-bounds[2]));
 const pt=p=>[width/2+(dot(p,right)-(bounds[0]+bounds[1])/2)*scale,height/2-(dot(p,up)-(bounds[2]+bounds[3])/2)*scale].map(v=>v.toFixed(2)).join(',');
 tris.sort((a,b)=>a.d-b.d);return {bounds,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><rect width="100%" height="100%" fill="#dedbd0"/><g stroke-width=".35" stroke-linejoin="round">'+tris.map(t=>{let c='rgb('+t.rgb.join(',')+')';return '<polygon points="'+t.v.map(pt).join(' ')+'" fill="'+c+'" stroke="'+c+'"/>'}).join('')+'</g><text x="20" y="30" font-size="17" font-family="sans-serif" fill="#353831">'+model.spec.recipe+' / '+model.spec.profile+' / '+action+'</text></svg>'}
}
