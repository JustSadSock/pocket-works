// Bounded v7 material study. Standalone PNG writer and orthographic depth
// raster for static evidence; does not replace the runtime sprite renderer.
import {deflateSync} from 'node:zlib';
const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>a.map(x=>x/(Math.hypot(...a)||1)),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function chunk(name,data){let t=Buffer.from(name),crc=0xffffffff;for(const b of Buffer.concat([t,data]))crc=crcTable[(crc^b)&255]^(crc>>>8);let h=Buffer.alloc(8),c=Buffer.alloc(4);h.writeUInt32BE(data.length);t.copy(h,4);c.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([h,data,c])}
export function png(w,h,rgba){const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=6;let scan=Buffer.alloc(h*(w*4+1));for(let y=0;y<h;y++)Buffer.from(rgba.buffer,rgba.byteOffset+y*w*4,w*4).copy(scan,y*(w*4+1)+1);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))])}
export const profiles={cloth:{roughness:.91,metallic:0,tint:[.84,.81,.69],detail:.12},leather:{roughness:.66,metallic:0,tint:[.85,.72,.55],detail:.15},metal:{roughness:.39,metallic:.72,tint:[1,.92,.74],detail:.06},hair:{roughness:.73,metallic:0,tint:[.87,.79,.66],detail:.17},skin:{roughness:.68,metallic:0,tint:[1,.93,.86],detail:.045}};
export function materialKind(name){return /scalp|beard|hair/.test(name)?'hair':/clasp|helmet|nasal|iron/.test(name)?'metal':/boot|belt|pouch/.test(name)?'leather':/body|eye|iris/.test(name)?'skin':'cloth'}
const tau=2*Math.PI,hash=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v)};
function field(kind,u,v){let a=tau*u,b=tau*v,g=hash(Math.floor(u*64),Math.floor(v*64))-.5;
 if(kind==='cloth')return .46+.17*Math.sin(12*a)*Math.cos(12*b)+.14*Math.cos(24*a)+.10*Math.cos(24*b)+.04*g;
 if(kind==='leather')return .5+.13*Math.sin(7*a+2*Math.sin(5*b))+.09*Math.cos(11*b+Math.sin(8*a))+.06*g;
 if(kind==='hair')return .48+.24*Math.sin(15*a+1.3*Math.sin(b))+.09*Math.cos(30*a+2*Math.sin(b));
 if(kind==='metal')return .5+.14*Math.sin(17*a+.6*Math.sin(b))+.03*g;
 return .5+.08*Math.sin(9*a)*Math.cos(11*b)+.035*g;
}
export function materialMaps(kind,size=128){
 const p=profiles[kind],color=new Uint8Array(size*size*4),normal=new Uint8Array(color.length),roughness=new Uint8Array(color.length);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){let u=x/size,v=y/size,h=field(kind,u,v),dx=(field(kind,u+1/size,v)-field(kind,u-1/size,v))*p.detail,dy=(field(kind,u,v+1/size)-field(kind,u,v-1/size))*p.detail,n=unit([-dx,-dy,1]),i=4*(y*size+x);
 for(let k=0;k<3;k++){color[i+k]=Math.round(255*clamp((.83+.27*h)*p.tint[k]));normal[i+k]=Math.round(255*(n[k]*.5+.5))}
 roughness[i]=255;roughness[i+1]=Math.round(255*clamp(p.roughness+(h-.5)*.10));roughness[i+2]=Math.round(255*p.metallic);color[i+3]=normal[i+3]=roughness[i+3]=255}
 return {size,color,normal,roughness};
}
const cameras={front:[0,.08,1],side:[1,.08,0],back:[0,.08,-1],'three-quarter':[1,.30,1.65]};
function frame(view){const d=unit(cameras[view]),r=unit(cross([0,1,0],d)),u=cross(d,r);return {d,r,u}}
export function commonBounds(models,view){let {r,u}=frame(view),b=[Infinity,-Infinity,Infinity,-Infinity];for(const m of models)for(const p of m.parts)for(let i=0;i<p.positions.length;i+=3){let v=p.positions.slice(i,i+3),x=dot(v,r),y=dot(v,u);b=[Math.min(b[0],x),Math.max(b[1],x),Math.min(b[2],y),Math.max(b[3],y)]}return b}
const lookup=(map,size,u,v)=>{let x=Math.floor(((u%1+1)%1)*size),y=Math.floor(((v%1+1)%1)*size);return 4*(y*size+x)};
export function raster(model,{view='three-quarter',size=768,bounds=commonBounds([model],view),mode='A',maps={},transparent=false}={}){
 const {d,r,u}=frame(view),scale=(size*.88)/Math.max(bounds[1]-bounds[0],bounds[3]-bounds[2]),cx=(bounds[0]+bounds[1])/2,cy=(bounds[2]+bounds[3])/2;
 const count=size*size,depth=new Float32Array(count).fill(-Infinity),rgba=new Uint8Array(count*4),owners=new Int16Array(count).fill(-1),light=unit([-.45,.85,.55]),fill=unit([.6,.45,-.8]),half=unit(light.map((x,k)=>x+d[k]));
 for(let i=0;i<count;i++){rgba.set([222,218,207,transparent?0:255],i*4)}
 for(let pi=0;pi<model.parts.length;pi++){
   const p=model.parts[pi],kind=materialKind(p.name),mat=profiles[kind],map=maps[kind],projected=[];
   for(let i=0;i<p.positions.length;i+=3){const v=p.positions.slice(i,i+3);projected.push([(dot(v,r)-cx)*scale+size/2,size/2-(dot(v,u)-cy)*scale,dot(v,d)])}
   for(let t=0;t<p.indices.length;t+=3){
     const ids=p.indices.slice(t,t+3),[a,b,c]=ids.map(i=>projected[i]),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-7)continue;
     const pts=ids.map(i=>p.positions.slice(3*i,3*i+3)),ns=ids.map(i=>p.normals.slice(3*i,3*i+3)),face=unit(cross(sub(pts[1],pts[0]),sub(pts[2],pts[0])));
     if(dot(face,d)<=0)continue;
     const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(size-1,Math.ceil(Math.max(a[0],b[0],c[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(size-1,Math.ceil(Math.max(a[1],b[1],c[1])));
     for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
       const w0=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den,w1=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den,w2=1-w0-w1;if(Math.min(w0,w1,w2)<-1e-5)continue;
       const z=w0*a[2]+w1*b[2]+w2*c[2],i=y*size+x;if(z<=depth[i])continue;depth[i]=z;owners[i]=pi;
       let n=unit(ns[0].map((v,k)=>w0*v+w1*ns[1][k]+w2*ns[2][k])),v=pts[0].map((v,k)=>w0*v+w1*pts[1][k]+w2*pts[2][k]);if(dot(n,face)<0)n=face;
       let base=p.color.slice(),rough=mode==='A'?.72:mat.roughness,metal=mode==='A'?0:mat.metallic;
       if(mode==='C'&&map){const uv=[v[0]*5+v[2]*2.7,v[1]*5],j=lookup(map.color,map.size,...uv),tangent=unit(cross(Math.abs(n[1])>.95?[1,0,0]:[0,1,0],n)),bitangent=cross(n,tangent);base=base.map((c,k)=>c*(map.color[j+k]/255)**2);rough=map.roughness[j+1]/255;metal=map.roughness[j+2]/255;n=unit(n.map((x,k)=>x+(map.normal[j]/127.5-1)*tangent[k]+(map.normal[j+1]/127.5-1)*bitangent[k]))}
       if(mode==='B')base=base.map((x,k)=>x*(.94+.06*mat.tint[k]));
       const diffuse=.30+.63*Math.max(0,dot(n,light))+.17*Math.max(0,dot(n,fill)),spec=(.035+.28*metal)*(1-.45*rough)*Math.max(0,dot(n,half))**(7+64*(1-rough));
       for(let k=0;k<3;k++)rgba[i*4+k]=Math.round(255*clamp(base[k]*diffuse+spec)**(1/2.2));rgba[i*4+3]=255;
     }
   }
 }
 const visible={};for(const i of owners)if(i>=0)visible[model.parts[i].name]=(visible[model.parts[i].name]??0)+1;
 return {png:png(size,size,rgba),rgba,owners,depth,visible,bounds,scale};
}
