// Camera-independent projected tile atlas. Fixed metre grid, bounded LRU, async incremental preparation.
const S=Math.sin(Math.PI/3),T=.5,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t,smooth=(a,b,x)=>{let f=clamp((x-a)/(b-a),0,1);return f*f*(3-2*f)};
function hash(x,y){let n=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296}
const tileSize=256,levels=[.25,.5,1,2,4,8,16,32],limit=48*1024*1024;
const sleep=()=>new Promise(r=>setTimeout(r,0));
// Same bilinear height and river carve as the engine for the ordinary heightfield.
// Only rendering uses this scalar fast path; historical and lab maps use sample.
export function renderHeight(F,t,x,y){
 x=clamp(x,0,F.W);y=clamp(y,0,F.H);
 if(!t.height||t.lab||t.historical||!t.channel)return F.sample(t,x,y).h;
 let xx=clamp(x/t.cell,0,t.cols-1),yy=clamp(y/t.cell,0,t.rows-1),i=Math.min(t.cols-2,Math.floor(xx)),j=Math.min(t.rows-2,Math.floor(yy)),a=xx-i,b=yy-j,q=t.height,k=j*t.cols+i;
 let h=q[k]*(1-a)*(1-b)+q[k+1]*a*(1-b)+q[k+t.cols]*(1-a)*b+q[k+t.cols+1]*a*b;
 let ch=t.channel[j]+(t.channel[j+1]-t.channel[j])*(yy-j),f=clamp(Math.abs(x-ch)/33,0,1);
 return (t.channelBase+t.channelGrade*(F.H-y))*(1-f)+h*f;
}
function noise(x,y,scale,salt){let X=x/scale,Y=y/scale,i=Math.floor(X),j=Math.floor(Y),a=X-i,b=Y-j;a=a*a*(3-2*a);b=b*b*(3-2*b);return mix(mix(hash(i+salt,j),hash(i+salt+1,j),a),mix(hash(i+salt,j+1),hash(i+salt+1,j+1),a),b)}

// Visual-only precomputed normals, directional horizon shadow and canopy transition.
export async function prepareSurfaceFields(F,t){
 const step=5,cols=Math.ceil(F.W/step)+1,rows=Math.ceil(F.H/step)+1,data=new Float32Array(cols*rows*4),light=[-.61,.47,.638],len=Math.hypot(light[0],light[1]);let last=performance.now(),maxSlice=0,start=last;
 for(let j=0;j<rows;j++){let y=Math.min(F.H,j*step);for(let i=0;i<cols;i++){let x=Math.min(F.W,i*step),h=renderHeight(F,t,x,y),gx=(renderHeight(F,t,x+3,y)-renderHeight(F,t,x-3,y))/6,gy=(renderHeight(F,t,x,y+3)-renderHeight(F,t,x,y-3))/6,norm=Math.hypot(gx,gy,1),nx=-gx/norm,ny=-gy/norm,nz=1/norm,lit=Math.max(0,nx*light[0]+ny*light[1]+nz*light[2]),shadow=0;
 for(let dist of [8,18,36,64]){let occ=renderHeight(F,t,x+light[0]*dist/len,y+light[1]*dist/len)-h-dist*light[2]/len;shadow=Math.max(shadow,smooth(.15,4.5,occ))}
 let q=F.sample(t,x,y),edge=smooth(.40,.78,q.canopy||0),o=(j*cols+i)*4;data[o]=nx;data[o+1]=ny;data[o+2]=clamp((lit-light[2])*100-shadow*30,-46,39);data[o+3]=edge;
 }if(performance.now()-last>=5){maxSlice=Math.max(maxSlice,performance.now()-last);await sleep();last=performance.now()}}
 return {step,cols,rows,data,ms:performance.now()-start,maxSlice,bytes:data.byteLength};
}
export function sampleSurfaceField(f,x,y,channel){let xx=clamp(x/f.step,0,f.cols-1),yy=clamp(y/f.step,0,f.rows-1),i=Math.min(f.cols-2,Math.floor(xx)),j=Math.min(f.rows-2,Math.floor(yy)),a=xx-i,b=yy-j,k=(j*f.cols+i)*4+channel,q=f.data;return mix(mix(q[k],q[k+4],a),mix(q[k+f.cols*4],q[k+f.cols*4+4],a),b)}
// Continuous visual zero contour from the authoritative source. No new water
// bodies, no modification to movement, terrain height, or the stored masks.
function maskAt(t,field,x,y){
 const q=t[field];if(!q)return 0;
 const xx=clamp(x/t.cell,0,t.cols-1),yy=clamp(y/t.cell,0,t.rows-1),i=Math.min(t.cols-2,Math.floor(xx)),j=Math.min(t.rows-2,Math.floor(yy)),u=xx-i,v=yy-j,k=j*t.cols+i;
 return mix(mix(q[k],q[k+1],u),mix(q[k+t.cols],q[k+t.cols+1],u),v);
}
export function shorelineField(F,t,x,y){
 if(t.lab)return Math.max((.48-maskAt(t,'waterMask',x,y))*t.cell,(maskAt(t,'crossingMask',x,y)-.48)*t.cell);
 if(t.historical&&!t.hasRiver)return Infinity;
 return Math.abs(x-F.riverX(t,y))-(t.height||t.historical?11:12);
}
export function shoreCoverage(shore,k){
 // At most one destination pixel of antialiasing, anchored in world space.
 const aa=.5/Math.max(.01,k);
 return Number.isFinite(shore)?1-smooth(-aa,aa,shore):0;
}
// The old clipped draw's exact affine map, expressed as a source crop instead
// of a per-tile save/path/clip/restore. Bleed and device-aligned edges survive.
export function tileBlitRect(sx,sy,dx,dy,dst,k,l,d){
 const step=k/l,left=Math.round(dx*d)/d,top=Math.round(dy*d)/d,right=Math.round((dx+dst)*d)/d,bottom=Math.round((dy+dst)*d)/d;
 return [sx+(left-dx)/step,sy+(top-dy)/step,(right-left)/step,(bottom-top)/step,left,top,right-left,bottom-top];
}

export class TerrainTiles{
 constructor(F,t,textures,trees){this.F=F;this.t=t;this.textures=textures;this.trees=trees;this.tiles=new Map();this.queue=new Map();this.bytes=0;this.busy=false;this.scheduled=false;this.warming=0;this.prepared=0;this.prepMs=0;this.dropped=0;this.evictions=0;this.pins=new Map();this.activeKey=null;this.epoch=0;this.fields=null;this.fieldPromise=null;this.backdrops=new Map();this.backdropPromises=new Map();this.motionUntil=0;this.props=new Map();this.stats={};this.road=t.road||[];this.roadBins=new Map();for(let i=1;i<this.road.length;i++){let a=this.road[i-1],b=this.road[i];if(Math.hypot(a.x-b.x,a.y-b.y)>40)continue;for(let x=Math.floor((Math.min(a.x,b.x)-8)/32);x<=Math.floor((Math.max(a.x,b.x)+8)/32);x++)for(let y=Math.floor((Math.min(a.y,b.y)-8)/32);y<=Math.floor((Math.max(a.y,b.y)+8)/32);y++){let k=x+':'+y,l=this.roadBins.get(k)||[];l.push([a,b]);this.roadBins.set(k,l)}}}
 roadDist(x,y){let d=Infinity;for(let [a,b] of this.roadBins.get(Math.floor(x/32)+':'+Math.floor(y/32))||[]){let dx=b.x-a.x,dy=b.y-a.y,f=clamp(((x-a.x)*dx+(y-a.y)*dy)/Math.max(.001,dx*dx+dy*dy),0,1);d=Math.min(d,Math.hypot(x-a.x-dx*f,y-a.y-dy*f))}return d}
 water(x,y,q){let F=this.F,t=this.t;if(t.lab){let shore=shorelineField(F,t,x,y);return {water:q.water,shore,shallow:1-smooth(1,5,-shore),bank:1-smooth(0,7,Math.max(0,shore))}}if(t.historical&&!t.hasRiver)return {water:false,shallow:0,bank:0,shore:Infinity};let dist=Math.abs(x-F.riverX(t,y)),along=Math.abs(y-t.ford),ford=1-smooth((t.fordWidth??42)*.55,t.fordWidth??42,along),edge=smooth(1,11,dist);
 // Shore irregularity only alters the material transition inside the physical shoreline band.
 let wriggle=Math.sin(y*.36)*.45+Math.sin(y*.91)*.22,wetEdge=1-smooth(9.2,11.8,dist+wriggle);
 let shore=shorelineField(F,t,x,y);return {water:shore<0,shallow:clamp(ford*.82+smooth(3,11,dist)*.78,0,1),bank:1-smooth(11,21,dist),wetEdge,shore}}
 tex(kind,x,y,k){let metres=kind==='stone'?10:8,ls=this.textures[kind],{n,a}=ls.find(p=>p.n>=k*metres*1.3)||ls.at(-1),sc=n/metres,px=x*sc,py=y*sc,ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy,xx=((ix%n)+n)%n,yy=((iy%n)+n)%n,i=(yy*n+xx)*4,j=(yy*n+(xx+1)%n)*4,l=(((yy+1)%n)*n+xx)*4,m=(((yy+1)%n)*n+(xx+1)%n)*4;return [mix(mix(a[i],a[j],fx),mix(a[l],a[m],fx),fy),mix(mix(a[i+1],a[j+1],fx),mix(a[l+1],a[m+1],fx),fy),mix(mix(a[i+2],a[j+2],fx),mix(a[l+2],a[m+2],fx),fy)]}
 point(x,y){return {u:-y,v:x*S-renderHeight(this.F,this.t,x,y)*T}}
 pixel(U,V,k,axis='tactical'){let F=this.F,t=this.t,y=axis==='wide'?V:-U,x=axis==='wide'?U:axis==='tall'?V:V/S;if(axis==='tactical')for(let i=0;i<3;i++)x=(V+renderHeight(F,t,x,y)*T)/S;if(x<0||y<0||x>F.W||y>F.H)return [44,50,45];let q=F.sample(t,x,y),r=this.water(x,y,q),mo=q.wet||0,can=q.canopy||0,shade=this.fields?sampleSurfaceField(this.fields,x,y,2):clamp((renderHeight(F,t,x+3,y-3)-renderHeight(F,t,x-3,y+3))*13,-52,52),patch=clamp(.25+.42*(noise(x,y,44,193)-.5)+.36*(noise(x,y,19,617)-.5)+mo*.23,0,1);
 let grass=this.tex('grass',x,y,k),sparse=this.tex('sparse',x+3,y+7,k),stone=this.tex('stone',x-9,y+4,k),color=grass.map((v,z)=>mix(v,sparse[z],patch)),nx=this.fields?sampleSurfaceField(this.fields,x,y,0):0,ny=this.fields?sampleSurfaceField(this.fields,x,y,1):0,slope=Math.hypot(nx,ny),rock=smooth(.09,.31,slope)*(1-can)*(.28+.44*noise(x,y,13,522));color=color.map((v,z)=>mix(v,stone[z],Math.max(rock,smooth(.61,.92,patch)*(1-can)*.53)));let grain=(noise(x,y,.85,93)-.5)*Math.min(10,k*3.5)+(noise(x,y,14,179)-.5)*9;shade+=grain;
 const coverage=shoreCoverage(r.shore,k);
 if(coverage<1){let roadD=this.roadDist(x,y),edge=4.8+.6*Math.sin(x*.23+y*.29),road=1-smooth(2.2,edge,roadD),tracks=Math.max(0,1-Math.abs(roadD-1.8)/.65)*road,soil=this.tex('road',x,y,k);let shore=(r.shore===undefined?0:1-smooth(0,3.2,Math.max(0,r.shore))),mud=r.bank*(.18+.3*mo);color=color.map((v,z)=>mix(mix(v,soil[z],Math.max(mud,road)),stone[z]*.91,shore*.35*(1-rock)));shade-=tracks*17;let woodland=this.fields?sampleSurfaceField(this.fields,x,y,3):can,leaf=woodland*(.30+.15*noise(x,y,12,413));color=color.map((v,z)=>mix(v,soil[z]*.77,leaf));shade-=woodland*9}
 if(coverage>0){let bed=this.tex('stone',x,y,k),waves=Math.sin(y*.68+x*.19)*1.7+Math.sin(x*.52-y*.27)*1.2,shallow=r.shallow,wet=[38,71,82].map((v,z)=>mix(v,[110,132,115][z],shallow));wet=wet.map((v,z)=>mix(v,bed[z],shallow*.42)+waves*(.45+.55*shallow));if(r.wetEdge!==undefined)wet=wet.map((v,z)=>mix(stone[z]*.74,v,clamp(.38+r.wetEdge,0,1)));color=color.map((v,z)=>mix(v,wet[z],coverage));shade*=1-coverage}

 return color.map(v=>clamp(v+shade,0,255))}
 async ensureFields(){if(!this.fields){this.fieldPromise??=prepareSurfaceFields(this.F,this.t);this.fields=await this.fieldPromise}return this.fields}
 async ensureBackdrop(axis='tactical'){
  if(this.backdrops.has(axis))return this.backdrops.get(axis);if(this.backdropPromises.has(axis))return this.backdropPromises.get(axis);
  let promise=(async()=>{await this.ensureFields();let start=performance.now(),F=this.F,t=this.t,scale=.20,minH=Infinity,maxH=-Infinity;for(let x=0;x<=F.W;x+=20)for(let y=0;y<=F.H;y+=20){let h=renderHeight(F,t,x,y);minH=Math.min(minH,h);maxH=Math.max(maxH,h)}
   let u=axis==='wide'?0:-F.H,v=axis==='tactical'?-maxH*T-5:0,r=axis==='wide'?F.W:0,b=axis==='wide'?F.H:axis==='tall'?F.W:F.W*S-minH*T+5,W=Math.ceil((r-u)*scale),H=Math.ceil((b-v)*scale),canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;let ctx=canvas.getContext('2d'),im=ctx.createImageData(W,H),last=performance.now();
   for(let j=0;j<H;j++){for(let i=0;i<W;i++){let rgb=this.pixel(u+(i+.5)/scale,v+(j+.5)/scale,scale,axis),p=(j*W+i)*4;im.data[p]=rgb[0];im.data[p+1]=rgb[1];im.data[p+2]=rgb[2];im.data[p+3]=255}if(performance.now()-last>=5){await sleep();last=performance.now()}}ctx.putImageData(im,0,0);let out={canvas,u,v,r:u+W/scale,b:v+H/scale,scale,ms:performance.now()-start,bytes:W*H*4};this.backdrops.set(axis,out);return out})();this.backdropPromises.set(axis,promise);try{return await promise}finally{this.backdropPromises.delete(axis)}
 }
 key(l,x,y,axis='tactical'){return axis+':'+l+':'+x+':'+y}
 request(l,x,y,axis='tactical'){let key=this.key(l,x,y,axis);if(this.tiles.has(key)||this.queue.has(key))return;this.queue.set(key,{l,x,y,axis});if(!this.scheduled&&!this.busy){this.scheduled=true;setTimeout(()=>{this.scheduled=false;this.pump()},0)}}
 async pump(){if(this.busy)return;this.busy=true;let epoch=this.epoch;await this.ensureFields();if(epoch!==this.epoch){this.busy=false;return}while(this.queue.size&&epoch===this.epoch){if(!this.warming&&performance.now()<this.motionUntil){await new Promise(r=>setTimeout(r,16));continue}let key=[...this.pins.keys()].find(k=>this.queue.has(k))||this.queue.keys().next().value,a=this.queue.get(key);this.activeKey=key;let c=document.createElement('canvas');c.width=c.height=tileSize+2;let ctx=c.getContext('2d'),im=ctx.createImageData(c.width,c.height),start=performance.now(),cpu=0,sliceStart=performance.now();
 for(let j=0;j<c.height;j++){let t=performance.now();for(let i=0;i<c.width;i++){let U=(a.x*tileSize+i-1+.5)/a.l,V=(a.y*tileSize+j-1+.5)/a.l,col=this.pixel(U,V,a.l,a.axis),p=(j*c.width+i)*4;im.data[p]=col[0];im.data[p+1]=col[1];im.data[p+2]=col[2];im.data[p+3]=255}cpu+=performance.now()-t;if(performance.now()-sliceStart>=(this.warming?12:2)){await sleep();while(!this.warming&&performance.now()<this.motionUntil&&this.queue.has(key)&&epoch===this.epoch)await new Promise(r=>setTimeout(r,16));sliceStart=performance.now();}if(epoch!==this.epoch){this.busy=false;return}if(!this.queue.has(key)&&!this.pins.has(key))break}
 if(!this.queue.has(key)&&!this.pins.has(key)){this.activeKey=null;continue}ctx.putImageData(im,0,0);this.queue.delete(key);this.tiles.set(key,{c,l:a.l,x:a.x,y:a.y,bytes:c.width*c.height*4});this.bytes+=c.width*c.height*4;this.prepared++;this.prepMs+=cpu;while(this.bytes>limit){let k=[...this.tiles.keys()].find(k=>!this.pins.has(k));if(k===undefined)break;let v=this.tiles.get(k);this.bytes-=v.bytes;this.tiles.delete(k);this.evictions++}this.activeKey=null;await sleep()}this.busy=false}
 bounds(cam,w,h){let p=Number.isFinite(cam.u)&&Number.isFinite(cam.v)?{u:cam.u,v:cam.v}:this.point(cam.x,cam.y),k=cam.k;return {u:p.u-w/(2*k),v:p.v-h/(2*k),r:p.u+w/(2*k),b:p.v+h/(2*k)}}
 visible(cam,w,h,d=1,pad=0,level=null){let b=this.bounds(cam,w,h),axis=cam.axis||'tactical',ideal=levels.find(n=>n>=cam.k*d*.8)||levels.at(-1),l=level&&level<=ideal*2&&level>=ideal/2?level:ideal,a=[];for(let x=Math.floor(b.u*l/tileSize)-pad;x<=Math.floor(b.r*l/tileSize)+pad;x++)for(let y=Math.floor(b.v*l/tileSize)-pad;y<=Math.floor(b.b*l/tileSize)+pad;y++)a.push({l,x,y,axis,key:this.key(l,x,y,axis)});return a}
 prioritize(a){let wanted=new Set(a.map(v=>v.key));for(let k of this.pins.keys())wanted.add(k);for(let k of this.queue.keys())if(!wanted.has(k)){this.queue.delete(k);this.dropped++}}
 async warm(cam,w,h,d=1,pad=0){await this.ensureBackdrop(cam.axis||'tactical');this.warming++;let a=this.visible(cam,w,h,d,pad);for(let v of a)this.pins.set(v.key,(this.pins.get(v.key)||0)+1);
 try{let start=performance.now(),p=this.prepared;this.prioritize(a);for(let v of a)this.request(v.l,v.x,v.y,v.axis);let timeout=start+90000;while(a.some(v=>!this.tiles.has(v.key))){if(performance.now()>timeout)throw Error('Terrain preparation exceeded 90 seconds; pending '+this.queue.size+' of '+a.length+' tiles');await sleep()}return {wallMs:performance.now()-start,newTiles:this.prepared-p,bytes:this.bytes,prepCpuMs:this.prepMs,dropped:this.dropped,evictions:this.evictions,fields:this.fields?{ms:this.fields.ms,bytes:this.fields.bytes,maxSlice:this.fields.maxSlice}:null}}finally{this.warming--;for(let v of a){let n=this.pins.get(v.key)-1;if(n)this.pins.set(v.key,n);else this.pins.delete(v.key)}}}
 draw(ctx,cam,w,h,d=1,level=null){let b=this.bounds(cam,w,h),k=cam.k,a=this.visible(cam,w,h,d,0,level),hits=0,miss=0,coarse=0,fallback=0,uncovered=0;this.prioritize(a);ctx.fillStyle='#2c322d';ctx.fillRect(0,0,w,h);let backdrop=this.backdrops.get(cam.axis||'tactical');if(!backdrop){void this.ensureBackdrop(cam.axis||'tactical').catch(e=>{this.error=String(e)})}if(backdrop&&a.some(v=>!this.tiles.has(v.key)))ctx.drawImage(backdrop.canvas,(backdrop.u-b.u)*k,(backdrop.v-b.v)*k,(backdrop.r-backdrop.u)*k,(backdrop.b-backdrop.v)*k);for(let v of a){let t=this.tiles.get(v.key);if(t){this.tiles.delete(v.key);this.tiles.set(v.key,t);hits++}else{miss++;this.request(v.l,v.x,v.y,v.axis);let l=v.l/2;while(l>=levels[0]){let x=Math.floor(v.x*l/v.l),y=Math.floor(v.y*l/v.l);t=this.tiles.get(this.key(l,x,y,v.axis));if(t){coarse++;break}l/=2}}if(!t){if(backdrop)fallback++;else uncovered++;continue}let u=v.x*tileSize/v.l,z=v.y*tileSize/v.l,span=tileSize/v.l,sx=1+(u-t.x*tileSize/t.l)*t.l,sy=1+(z-t.y*tileSize/t.l)*t.l,src=span*t.l;let dx=(u-b.u)*k,dy=(z-b.v)*k,dst=span*k;
 // Use bleed around tiles and clip to their projected integer-device rectangle.
 let rect=tileBlitRect(sx,sy,dx,dy,dst,k,t.l,d);if(rect[2]>0&&rect[3]>0)ctx.drawImage(t.c,...rect)}
 return {level:a[0]?.l,hits,miss,coarse,fallback,uncovered,backdropReady:!!backdrop,backdropBytes:[...this.backdrops.values()].reduce((n,v)=>n+v.bytes,0),pending:this.queue.size,dropped:this.dropped,evictions:this.evictions,bytes:this.bytes,prepared:this.prepared,prepCpuMs:this.prepMs}}
 vegetation(cam,w,h){let F=this.F,t=this.t,rx=(cam.axis==='wide'?w:h)/cam.k/(cam.axis==='tactical'?S:1)/2+28,ry=(cam.axis==='wide'?h:w)/cam.k/2+28,items=[];for(let ix=Math.max(0,Math.floor((cam.x-rx)/12));ix<=Math.min(Math.ceil(F.W/12),Math.ceil((cam.x+rx)/12));ix++)for(let iy=Math.max(0,Math.floor((cam.y-ry)/12));iy<=Math.min(Math.ceil(F.H/12),Math.ceil((cam.y+ry)/12));iy++){let key=ix+':'+iy;if(!this.props.has(key)){let arr=[];for(let j=0;j<4;j++){let x=ix*12+hash(ix*9+j,iy)*12,y=iy*12+hash(iy*11+j,ix)*12,q=F.sample(t,clamp(x,0,F.W),clamp(y,0,F.H)),r=this.water(x,y,q),n=hash(ix*17+j,iy*19);if(r.water||q.road||x>F.W||y>F.H)continue;if(q.wood&&n<.35+.31*smooth(.61,.85,q.canopy||.85))arr.push({x,y,kind:'tree'+(1+Math.floor(hash(ix+j,iy)*3)),scale:.8+hash(ix,iy+j)*.55});else if((q.wood||r.bank>.15)&&n<.35)arr.push({x,y,kind:'bush',scale:.5+hash(ix,iy+j)*.4})}this.props.set(key,arr)}items.push(...this.props.get(key))}
 return items}
 dispose(){this.epoch++;this.queue.clear();this.pins.clear();this.tiles.clear();this.props.clear();this.backdrops.clear();this.backdropPromises.clear();this.bytes=0}
}
