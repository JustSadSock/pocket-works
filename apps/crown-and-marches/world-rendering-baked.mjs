// Terrain bake: an isolated rendering experiment. Real height geometry is
// retained; expensive material/normal/shadow evaluation is not per-frame.
import {prepareTerrain} from './world-rendering-gl.mjs';
import {contourSource,chartedContourSource} from './genesis-contours.mjs';
import {model} from './geography-review.mjs';
import {atlasMaterial} from './genesis-atlas-visual.mjs';
import {watersMaterial} from './genesis-waters.mjs';
import {livingMaterial} from './genesis-living-visual.mjs';
const C=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),L=(a,b,t)=>a+(b-a)*t,S=t=>{t=C(t);return t*t*(3-2*t)},mix=(a,b,t)=>a.map((v,i)=>L(v,b[i],t));
function hash(x,y){let n=Math.imul(x+631,374761393)^Math.imul(y+289,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=S(x-i),v=S(y-j);return L(L(hash(i,j),hash(i+1,j),u),L(hash(i,j+1),hash(i+1,j+1),u),v);}
const sleep=()=>new Promise(r=>setTimeout(r,0));
function budget(){let last=performance.now(),max=0;return {async yield(){const now=performance.now();if(now-last>=6){max=Math.max(max,now-last);await sleep();last=performance.now();}},get max(){return Math.max(max,performance.now()-last);}};}
export async function prepareBakedTerrain(s,cam,{sourceOverride=null,geology=false,closeLOD=false,auditFields=false}={}){
 const started=performance.now(),source=sourceOverride||await prepareTerrain(s,cam,{detail:8,heightStyle:'smooth',textureOnly:true}),{vertices:v,elevations:z,cols:w,rows:h,detail:res}=source,b=budget(),pixels=new Uint8Array(w*h*4),normals=auditFields?new Float32Array(w*h*3):null,lighting=auditFields?new Float32Array(w*h*2):null,materials=auditFields?new Float32Array(w*h*3):null;
 // Normal and horizon fields are reconstructed from the actual height mesh.
 // Bilinear horizon lookup removes nearest-texel shadow striping.
 const at=(x,y)=>z[C(y,0,h-1)*w+C(x,0,w-1)],sample=(x,y)=>{const i=Math.floor(x),j=Math.floor(y),u=x-i,t=y-j;return L(L(at(i,j),at(i+1,j),u),L(at(i,j+1),at(i+1,j+1),u),t);};
 const light=[-.62,-.49,.61],len=Math.hypot(light[0],light[1]),scale=1/res;
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const k=y*w+x,o=k*9,wx=v[o],wy=v[o+1],H=v[o+3],wet=v[o+4],fert=v[o+5],forest=v[o+6],land=v[o+7],river=v[o+8],height=z[k];let col=[216,205,178];
 if(source.diagnostic){const i=k*4;pixels.set([203,196,177,255],i);continue;}
 if(geology==='waters'&&source.water?.kind[k]&&!auditFields){const water=watersMaterial({x:wx,y:wy},{kind:source.water.kind[k],depth:source.water.depth[k],shore:source.water.shore[k]}),i=k*4;pixels[i]=C(water[0],0,255);pixels[i+1]=C(water[1],0,255);pixels[i+2]=C(water[2],0,255);pixels[i+3]=255;continue;}
 if(river<=1.5){
 const dx=(at(x+1,y)-at(x-1,y))/(2*scale),dy=(at(x,y+1)-at(x,y-1))/(2*scale),norm=Math.hypot(dx,dy,1),nx=-dx/norm,ny=-dy/norm,nz=1/norm,diff=Math.max(0,nx*light[0]+ny*light[1]+nz*light[2]),slope=1-nz;
 let shadow=0;for(const step of [.35,.7,1.2,1.9,2.8,4,5.6,7.4]){const q=sample(x+light[0]/len*step*res,y+light[1]/len*step*res),occ=q-height-step*light[2]/len;shadow=Math.max(shadow,S((occ-.035)/.36));}
 const broad=noise(wx*.38+11,wy*.38),med=noise(wx*1.7+9,wy*1.7-7),fine=noise(wx*7.6,wy*7.6);
 const grass=mix([177,162,105],[99,138,83],C(wet*.53+fert*.28+broad*.19)),wood=mix([58,91,57],[89,112,64],med);
 let base=mix(grass,wood,S((forest-.15)/.8)*.82),rock=S((H-.38)/.16)*(.37+.63*S((slope-.08)/.55));
 // Strata follow elevation and the actual slope normal rather than a
 // repeating cell-coordinate texture. Rock and scree have distinct tones.
 const strike=(-ny*wx+nx*wy),grain=noise(strike*2.2+height*.37,height*5.6),scree=noise(wx*4.7+height*1.9,wy*4.7-height*.8);
 const stone=mix([128,125,111],[206,194,166],S((grain-.18)/.72)),talus=mix(stone,[166,152,118],S((nz-.22)/.65)*.22);
 base=mix(base,talus,Math.max(rock,S((H-.49)/.13)*.55));base=mix(base,[225,221,203],S((H-.60)/.12)*S((nz-.35)/.55)*.65);
 const variation=geology?0:(broad-.5)*11+(med-.5)*8+(fine-.5)*5+(scree-.5)*rock*10;
 if(geology==='waters'&&source.water){const curvature=at(x+1,y)+at(x-1,y)+at(x,y+1)+at(x,y-1)-4*height;base=(source.polish?atlasMaterial:watersMaterial)({x:wx,y:wy,H,wet,fert,forest,slope,nx,ny,curvature,river},{kind:source.water.kind[k],depth:source.water.depth[k],shore:source.water.shore[k]});}else if(geology==='living'){const curvature=at(x+1,y)+at(x-1,y)+at(x,y+1)+at(x,y-1)-4*height;base=livingMaterial({x:wx,y:wy,H,wet,fert,forest,slope,nx,ny,curvature,river});}else if(geology==='synthesis'){const steep=S((slope-.12)/.53),alpine=S((H-.43)/.22),curvature=(at(x+2,y)+at(x-2,y)+at(x,y+2)+at(x,y-2)-4*height),exposure=C((-nx-ny)*.35+.5),soil=mix([133,119,81],[93,125,76],wet),turf=mix(soil,[157,151,94],fert*.63),cliff=mix([115,113,104],[195,187,169],exposure),talus=mix([136,123,101],[179,168,143],S((curvature+.04)/.16));base=mix(turf,[57,83,50],forest*(1-alpine)*.84);base=mix(base,talus,alpine*S((slope-.03)/.44)*.78);base=mix(base,cliff,steep*(.55+.45*alpine));base=mix(base,[225,222,210],S((H-.66)/.14)*(1-steep*.72));}else if(geology){const steep=S((slope-.12)/.47),alpine=S((H-.40)/.23),exposure=C((nx+ny)*.35+.5),soil=mix([137,121,84],[83,117,71],wet),grass=mix(soil,[148,154,91],fert*.7),scree=mix([133,126,108],[190,179,151],exposure),cliff=mix([116,114,106],[205,198,179],exposure);base=mix(grass,[55,84,52],forest*(1-alpine)*.85);base=mix(base,scree,alpine*.72);base=mix(base,cliff,steep*(.35+.65*alpine));base=mix(base,[226,227,216],S((H-.68)/.12)*(1-steep*.65));}
 const direct=diff*(1-shadow*.88),ambient=.61-.12*S((H-.35)/.24);if(auditFields){normals.set([nx,ny,nz],k*3);lighting.set([direct,ambient],k*2);materials.set(base,k*3);}
 col=base.map((v,i)=>v*(ambient+.58*direct)+variation+[2,5,10][i]*(1-direct));
 if(geology==='waters'&&source.water){if(source.water.kind[k])col=base;}else{
 const bank=1-S((river-.005)/.15);col=mix(col,[91,119,78],bank*.32);
 if(land<.50){const shallow=S(land/.48),wave=(noise(wx*1.1,wy*6.2)-.5)*8;col=mix([38,78,95],[107,157,149],shallow).map(v=>v+wave);}
 else{const shore=1-S(Math.abs(land-.52)/.06);col=mix(col,[191,175,130],shore*.76);
 if(river<.014){const opacity=1-S((river+.010)/.024);col=mix(col,mix([49,93,108],[111,144,120],S((river+.06)/.07)),opacity);}}}
 }
 const i=k*4;pixels[i]=C(col[0],0,255);pixels[i+1]=C(col[1],0,255);pixels[i+2]=C(col[2],0,255);pixels[i+3]=255;
 }await b.yield();}
 const bakeMs=performance.now()-started-(sourceOverride?0:source.stats.ms),bakeSlice=b.max;
 // Two independent index/vertex buffers share one pre-baked material field.
 // Source sampling is 8/cell; mesh is 2 or 4/cell and remains resident.
 const lods=[];for(const stride of (source.contours?[8,4,2,1]:closeLOD?[4,2,1]:[4,2]).filter(stride=>(w-1)%stride===0&&(h-1)%stride===0)){const cols=(w-1)/stride+1,rows=(h-1)/stride+1,vertices=new Float32Array(cols*rows*3),indices=new Uint32Array((cols-1)*(rows-1)*6);for(let y=0;y<rows;y++){for(let x=0;x<cols;x++){const i=(y*stride*w+x*stride)*9,o=(y*cols+x)*3;vertices[o]=v[i];vertices[o+1]=v[i+1];vertices[o+2]=v[i+2];if(x<cols-1&&y<rows-1){const a=y*cols+x,k=(y*(cols-1)+x)*6;indices.set([a,a+1,a+cols+1,a,a+cols+1,a+cols],k);}}await b.yield();}lods.push({vertices,indices,cols,rows});}
 const bytes=pixels.byteLength+lods.reduce((n,l)=>n+l.vertices.byteLength+l.indices.byteLength,0);
 return {contours:source.contours,bounds:source.bounds,center:source.center,width:w,height:h,detail:res,pixels,lods,audit:auditFields?{normals,lighting,materials}:undefined,stats:{...source.stats,ms:performance.now()-started+(sourceOverride?source.stats.ms:0),sourceMs:source.stats.ms,bakeMs,bakeSlice,maxSlice:Math.max(source.stats.maxSlice,b.max),triangles:lods.map(l=>l.indices.length/3),bytes:bytes+(source.contours?.stats.bytes??0),peakSourceBytes:source.stats.bytes}};
}
const VS=`#version 300 es
precision highp float;
layout(location=0) in vec3 pos;
uniform vec2 center, viewport, origin, extent;
uniform float scale, datum, tilt;
out vec2 uv;
void main(){vec3 p=pos-vec3(center,datum);float cs=sqrt(1.-tilt*tilt);uv=(pos.xy-origin)/extent;gl_Position=vec4(p.x*scale*2./viewport.x,-(p.y*cs-p.z*tilt)*scale*2./viewport.y,-(p.y*tilt+p.z*cs)/160.,1.);}`;
const WATER_VS=`#version 300 es
precision highp float;
layout(location=0) in vec3 pos;layout(location=1) in vec3 rgb;
uniform vec2 center,viewport;uniform float scale,datum,tilt;out vec3 shade;
void main(){vec3 p=pos-vec3(center,datum);float cs=sqrt(1.-tilt*tilt);shade=rgb;gl_Position=vec4(p.x*scale*2./viewport.x,-(p.y*cs-p.z*tilt)*scale*2./viewport.y,-(p.y*tilt+p.z*cs)/160.,1.);}`;
const WATER_FS=`#version 300 es
precision mediump float;in vec3 shade;out vec4 color;void main(){color=vec4(shade,1.);}`;
const FS=`#version 300 es
precision mediump float;
in vec2 uv;
uniform sampler2D material;
uniform vec2 texel;
out vec4 color;
void main(){color=texture(material,uv*(1.-texel)+texel*.5);}`;
function compile(gl,type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
// Optional experimental chunk index, no topology changes. Bound each
// chunk in world XYZ, cull only if its projected AABB misses the viewport.
function chunkIndices(l,tile=16){const {cols,rows,vertices,indices}=l,out=new Uint32Array(indices.length),chunks=[];let offset=0;for(let y=0;y<rows-1;y+=tile)for(let x=0;x<cols-1;x+=tile){const X=Math.min(cols-1,x+tile),Y=Math.min(rows-1,y+tile),start=offset;let zmin=Infinity,zmax=-Infinity;for(let j=y;j<=Y;j++)for(let i=x;i<=X;i++){const z=vertices[(j*cols+i)*3+2];zmin=Math.min(zmin,z);zmax=Math.max(zmax,z);}for(let j=y;j<Y;j++)for(let i=x;i<X;i++){const k=(j*(cols-1)+i)*6;out.set(indices.subarray(k,k+6),offset);offset+=6;}chunks.push({offset:start,count:offset-start,x0:vertices[(y*cols+x)*3],x1:vertices[(Y*cols+X)*3],y0:vertices[(y*cols+x)*3+1],y1:vertices[(Y*cols+X)*3+1],zmin,zmax});}return {indices:out,chunks};}
function visible(q,cam,datum,tilt,w,h){const cs=Math.sqrt(1-tilt*tilt),sx=w/(2*cam.s),sy=h/(2*cam.s);if(q.x1<cam.x-sx||q.x0>cam.x+sx)return false;const lo=(q.y0-cam.y)*cs-(q.zmax-datum)*tilt,hi=(q.y1-cam.y)*cs-(q.zmin-datum)*tilt;return hi>=-sy&&lo<=sy;}

export class BakedTerrainGL{
 constructor(canvas,terrain,{chunked=false,adaptive=false}={}){this.chunked=chunked;this.adaptive=adaptive;this.motionLevel=null;this.slow=0;this.fast=0;this.lastFrame=0;const start=performance.now(),gl=canvas.getContext('webgl2',{alpha:false,antialias:!adaptive,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');this.gl=gl;this.canvas=canvas;this.terrain=terrain;const p=gl.createProgram(),vs=compile(gl,gl.VERTEX_SHADER,VS),fs=compile(gl,gl.FRAGMENT_SHADER,FS);gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.deleteShader(vs);gl.deleteShader(fs);this.program=p;this.lods=terrain.lods.map(l=>{const vao=gl.createVertexArray(),vbo=gl.createBuffer(),ibo=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,l.vertices,gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);const chunks=chunked?chunkIndices(l,adaptive?Math.max(8,Math.round((l.cols-1)/(terrain.bounds[2]-terrain.bounds[0])*12)):16):null;gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,chunks?chunks.indices:l.indices,gl.STATIC_DRAW);return {vao,vbo,ibo,count:l.indices.length,chunks:chunks?.chunks};});
 if(terrain.contours){const wp=gl.createProgram(),wv=compile(gl,gl.VERTEX_SHADER,WATER_VS),wf=compile(gl,gl.FRAGMENT_SHADER,WATER_FS);gl.attachShader(wp,wv);gl.attachShader(wp,wf);gl.linkProgram(wp);if(!gl.getProgramParameter(wp,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(wp));gl.deleteShader(wv);gl.deleteShader(wf);const vao=gl.createVertexArray(),vbo=gl.createBuffer(),chunks=[],total=terrain.contours.chunks.reduce((n,c)=>n+c.vertices.length,0),data=new Float32Array(total);let offset=0;for(const c of terrain.contours.chunks){data.set(c.vertices,offset);chunks.push({x0:c.x0,x1:c.x1,y0:c.y0,y1:c.y1,zmin:c.zmin,zmax:c.zmax,offset:offset/6,count:c.vertices.length/6});offset+=c.vertices.length;}gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);for(let i=0;i<2;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,24,i*12);}this.water={program:wp,vao,vbo,chunks,u:Object.fromEntries(['center','viewport','scale','datum','tilt'].map(k=>[k,gl.getUniformLocation(wp,k)]))};}
 this.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,terrain.width,terrain.height,0,gl.RGBA,gl.UNSIGNED_BYTE,terrain.pixels);gl.generateMipmap(gl.TEXTURE_2D);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(.83,.78,.67,1);this.uniforms=Object.fromEntries(['center','viewport','origin','extent','scale','datum','tilt','material','texel'].map(k=>[k,gl.getUniformLocation(p,k)]));const debug=gl.getExtension('WEBGL_debug_renderer_info');this.device={vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmasked:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null};gl.finish();this.uploadMs=performance.now()-start;this.pixel=new Uint8Array(4);}
 draw(cam,{tilt=.54,finish=false,cull=this.chunked,motion=false}={}){const gl=this.gl,u=this.uniforms,t=this.terrain,start=performance.now();let target=this.adaptive?Math.min(this.lods.length-1,cam.s>=105?3:cam.s>=42?2:cam.s>=16?1:0):Math.min(this.lods.length-1,this.lods.length>2&&cam.s>=75?2:cam.s>=45?1:0);if(this.adaptive&&motion){const gap=this.lastFrame?start-this.lastFrame:0;this.lastFrame=start;if(this.motionLevel===null)this.motionLevel=target;if(gap>35){this.slow++;this.fast=0;}else if(gap>0&&gap<24){this.fast++;this.slow=0;}else{this.fast=0;this.slow=0;}if(this.slow>=4){this.motionLevel=Math.max(0,this.motionLevel-1);this.slow=0;}if(this.fast>=18){this.motionLevel=Math.min(target,this.motionLevel+1);this.fast=0;}target=Math.min(target,this.motionLevel);}else{this.motionLevel=null;this.lastFrame=0;this.fast=this.slow=0;}const lod=this.lods[target];gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.bindVertexArray(lod.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform2f(u.center,cam.x,cam.y);gl.uniform2f(u.viewport,this.canvas.width,this.canvas.height);gl.uniform2f(u.origin,t.bounds[0],t.bounds[1]);gl.uniform2f(u.extent,t.bounds[2]-t.bounds[0],t.bounds[3]-t.bounds[1]);gl.uniform2f(u.texel,1/t.width,1/t.height);gl.uniform1f(u.scale,cam.s);const datum=cam.datum??t.center;gl.uniform1f(u.datum,datum);gl.uniform1f(u.tilt,tilt);gl.uniform1i(u.material,0);let drawn=0,calls=0;if(cull&&lod.chunks){for(const q of lod.chunks)if(visible(q,cam,datum,tilt,this.canvas.width,this.canvas.height)){gl.drawElements(gl.TRIANGLES,q.count,gl.UNSIGNED_INT,q.offset*4);drawn+=q.count;calls++;}}else{gl.drawElements(gl.TRIANGLES,lod.count,gl.UNSIGNED_INT,0);drawn=lod.count;calls=1;}let waterTriangles=0,waterCalls=0;if(this.water){const p=this.water,u=p.u;gl.useProgram(p.program);gl.bindVertexArray(p.vao);gl.uniform2f(u.center,cam.x,cam.y);gl.uniform2f(u.viewport,this.canvas.width,this.canvas.height);gl.uniform1f(u.scale,cam.s);gl.uniform1f(u.datum,datum);gl.uniform1f(u.tilt,tilt);for(const q of p.chunks)if(!cull||visible(q,cam,datum,tilt,this.canvas.width,this.canvas.height)){gl.drawArrays(gl.TRIANGLES,q.offset,q.count);waterTriangles+=q.count/3;waterCalls++;}}this.lastDraw={triangles:drawn/3,fullTriangles:lod.count/3,calls,waterTriangles,waterCalls,lod:target};if(finish)gl.readPixels(this.canvas.width>>1,this.canvas.height>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,this.pixel);return performance.now()-start;}
 dispose(){const g=this.gl;if(this.water){g.deleteBuffer(this.water.vbo);g.deleteVertexArray(this.water.vao);g.deleteProgram(this.water.program);this.water=null;}for(const l of this.lods){g.deleteBuffer(l.vbo);g.deleteBuffer(l.ibo);g.deleteVertexArray(l.vao);}g.deleteTexture(this.tex);g.deleteProgram(this.program);}
}

// Integration guard: never access full fine geography for a charted-only map.
export async function prepareGeographicCandidate(s,cam,{bounds,detail=8,contourDetail=8,vertical,diagnostic=false,polish=false}={}){
 if(s.mapVersion===3&&!s.autonomous&&s.map.geography?.lakeId){const snapshot=model(s),source=await prepareTerrain(s,cam,{boundsOverride:bounds,detail,heightStyle:'smooth',textureOnly:true});await chartedContourSource(s,source,snapshot.known,{contourDetail,vertical,polish,yieldRow:()=>new Promise(r=>setTimeout(r,0))});return prepareBakedTerrain(s,cam,{sourceOverride:source,geology:'waters',closeLOD:true});}
 if(s.mapVersion!==3||!s.autonomous){const terrain=await prepareBakedTerrain(s,cam,{sourceOverride:await prepareTerrain(s,cam,{boundsOverride:bounds,detail,heightStyle:'smooth',textureOnly:true}),geology:'living',closeLOD:true});return {...terrain,stats:{...terrain.stats,fogFallback:true}};}
 const source=await contourSource(s,cam,{bounds,detail,contourDetail,vertical,diagnostic,polish,yieldRow:()=>new Promise(r=>setTimeout(r,0))});return prepareBakedTerrain(s,cam,{sourceOverride:source,geology:'waters',closeLOD:true});
}
