// Deterministic, dependency-free relief and random-dot stereogram engine.
export const DEPTH_W=180, DEPTH_H=120;
export function fresh(){return new Uint8Array(DEPTH_W*DEPTH_H)}
export function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
export function brush(layer,nx,ny,radius,strength,erase=false){
 const cx=clamp(nx,0,1)*(DEPTH_W-1),cy=clamp(ny,0,1)*(DEPTH_H-1);
 const rad=clamp(radius,2,45);const minX=Math.max(0,Math.floor(cx-rad)),maxX=Math.min(DEPTH_W-1,Math.ceil(cx+rad));
 const minY=Math.max(0,Math.floor(cy-rad)),maxY=Math.min(DEPTH_H-1,Math.ceil(cy+rad));
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   const d=Math.hypot(x-cx,y-cy)/rad;if(d>=1)continue;
   const fall=(1-d*d);const i=y*DEPTH_W+x;
   if(erase)layer[i]=Math.round(layer[i]*(1-fall*.95));
   else layer[i]=Math.max(layer[i],Math.round(strength*fall));
 }
}
export function stamp(kind,strength=225){
 const a=fresh();const c=clamp(strength,20,255);
 for(let y=0;y<DEPTH_H;y++)for(let x=0;x<DEPTH_W;x++){
  const px=(x/(DEPTH_W-1)-.5)*2.6, py=(.5-y/(DEPTH_H-1))*2.15;
  let z=0;
  if(kind==="heart"){
   const xx=px*1.04, yy=py*1.08;
   const f=(xx*xx+yy*yy-1)**3-xx*xx*yy**3;
   if(f<0)z=clamp(.8-Math.abs(f)*.12,0,1);
  } else if(kind==="orb"){
   const r=Math.hypot(px*1.07,py*1.08);
   z=clamp(1-Math.abs(r-.64)/.32,0,1);
  } else if(kind==="wave"){
   const curve=.24*Math.sin((px+1.3)*6.0);
   const dist=Math.abs(py-curve);
   z=clamp(1-dist/.29,0,1);
   z=Math.max(z*.95,clamp(1-Math.abs(py+.6+.19*Math.sin(px*6))/.17,0,1)*.72);
  }
  a[y*DEPTH_W+x]=Math.round(c*z);
 }
 return a;
}
function mix(x,y,s){let z=Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^Math.imul(s+1,2246822519);z=Math.imul(z^(z>>>13),1274126177);return (z^(z>>>16))>>>0}
export function stereogram(layer,width,height,seed=1,palette="mono"){
 if(layer.length!==DEPTH_W*DEPTH_H)throw new Error("Invalid depth map");
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width*height>5000000)throw new Error("Invalid dimensions");
 const rgba=new Uint8ClampedArray(width*height*4);
 const links=new Int32Array(width),colored=palette==="color";
 const unit=width/Math.max(1,Math.round(width/95)); // eye separation ~95 render pixels
 const sepBase=Math.round(unit),disp=Math.round(unit*.19);
 for(let y=0;y<height;y++){
  for(let x=0;x<width;x++)links[x]=x;
  const dy=Math.min(DEPTH_H-1,Math.floor(y*DEPTH_H/height));
  for(let x=0;x<width;x++){
   const dx=Math.min(DEPTH_W-1,Math.floor(x*DEPTH_W/width));
   const z=layer[dy*DEPTH_W+dx]/255;
   const s=Math.max(18,Math.round(sepBase-disp*z)),left=x-Math.floor(s/2),right=left+s;
   if(left>=0&&right<width)links[right]=left;
  }
  for(let x=0;x<width;x++){
   const out=(y*width+x)*4,source=links[x];
   if(source<x){
    const from=(y*width+source)*4;
    rgba[out]=rgba[from];rgba[out+1]=rgba[from+1];rgba[out+2]=rgba[from+2];
   }else{
    const h=mix(Math.floor(x/2),Math.floor(y/2),seed);
    if(colored){const tones=[[35,71,66],[201,109,79],[195,215,187],[242,239,209],[87,139,119]];const t=tones[h%tones.length];rgba[out]=t[0];rgba[out+1]=t[1];rgba[out+2]=t[2]}
    else{const v=55+(h%170);rgba[out]=v;rgba[out+1]=Math.min(255,v+8);rgba[out+2]=Math.min(255,v+4)}
   }
   rgba[out+3]=255;
  }
 }
 return rgba;
}
