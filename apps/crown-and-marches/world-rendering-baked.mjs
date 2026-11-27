// Terrain bake: an isolated rendering experiment. Real height geometry is
// retained; expensive material/normal/shadow evaluation is not per-frame.
import {prepareTerrain} from './world-rendering-gl.mjs';
import {ResidentWorldSurface} from './atlas-resident-surface.mjs';
import {contourSource,chartedContourSource,scaleTerrainSource} from './genesis-contours.mjs';
import {model} from './geography-review.mjs';
import {overviewMaterial,identityBiome,atlasPaper} from './atlas-material-fields.mjs';
import {atlasMaterial} from './genesis-atlas-visual.mjs';
import {watersMaterial} from './genesis-waters.mjs';
import {livingMaterial} from './genesis-living-visual.mjs';
const C=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),L=(a,b,t)=>a+(b-a)*t,S=t=>{t=C(t);return t*t*(3-2*t)},mix=(a,b,t)=>a.map((v,i)=>L(v,b[i],t));
function hash(x,y){let n=Math.imul(x+631,374761393)^Math.imul(y+289,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=S(x-i),v=S(y-j);return L(L(hash(i,j),hash(i+1,j),u),L(hash(i,j+1),hash(i+1,j+1),u),v);}
const sleep=()=>new Promise(r=>setTimeout(r,0));
function budget(){let last=performance.now(),max=0;return {async yield(){const now=performance.now();if(now-last>=6){max=Math.max(max,now-last);await sleep();last=performance.now();}},get max(){return Math.max(max,performance.now()-last);}};}
export async function prepareBakedTerrain(s,cam,{sourceOverride=null,geology=false,closeLOD=false,auditFields=false,check=()=>{}}={}){
 const started=performance.now(),source=sourceOverride||await prepareTerrain(s,cam,{detail:8,heightStyle:'smooth',textureOnly:true}),{vertices:v,elevations:z,cols:w,rows:h,detail:res}=source,b=budget(),pixels=new Uint8Array(w*h*4),normals=auditFields?new Float32Array(w*h*3):null,lighting=auditFields?new Float32Array(w*h*2):null,materials=auditFields?new Float32Array(w*h*3):null,detailMask=source.scaleSurface?new Uint8Array(w*h*4):null,overview=source.scaleSurface&&res<=2;
 // Normal and horizon fields are reconstructed from the actual height mesh.
 // Bilinear horizon lookup removes nearest-texel shadow striping.
 const at=(x,y)=>z[C(y,0,h-1)*w+C(x,0,w-1)],sample=(x,y)=>{const i=Math.floor(x),j=Math.floor(y),u=x-i,t=y-j;return L(L(at(i,j),at(i+1,j),u),L(at(i,j+1),at(i+1,j+1),u),t);};
 const light=[-.62,-.49,.61],len=Math.hypot(light[0],light[1]),scale=1/res;
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const k=y*w+x,o=k*9,wx=v[o],wy=v[o+1],H=v[o+3],wet=v[o+4],fert=v[o+5],forest=v[o+6],land=v[o+7],river=v[o+8],height=z[k];let col=[216,205,178];const ink=source.ink?.[k]??1,paper=source.identity&&source.ink?atlasPaper(wx,wy):[216,205,178];
 if(source.diagnostic){const i=k*4;pixels.set([203,196,177,255],i);continue;}
 if(geology==='waters'&&source.water?.kind[k]&&!auditFields){const water=watersMaterial({x:wx,y:wy},{kind:source.water.kind[k],depth:source.water.depth[k],shore:source.water.shore[k]}),i=k*4;pixels[i]=C(L(paper[0],water[0],ink),0,255);pixels[i+1]=C(L(paper[1],water[1],ink),0,255);pixels[i+2]=C(L(paper[2],water[2],ink),0,255);pixels[i+3]=255;continue;}
 if(river<=1.5){
 const dx=(at(x+1,y)-at(x-1,y))/(2*scale),dy=(at(x,y+1)-at(x,y-1))/(2*scale),norm=Math.hypot(dx,dy,1),nx=source.normalField?.[k*3]??-dx/norm,ny=source.normalField?.[k*3+1]??-dy/norm,nz=source.normalField?.[k*3+2]??1/norm,diff=Math.max(0,nx*light[0]+ny*light[1]+nz*light[2]),slope=1-nz;
 let shadow=0;for(const step of (overview?[.7,2.8,5.6]:[.35,.7,1.2,1.9,2.8,4,5.6,7.4])){const q=sample(x+light[0]/len*step*res,y+light[1]/len*step*res),occ=q-height-step*light[2]/len;shadow=Math.max(shadow,S((occ-.035)/.36));}
 const atlasBake=source.polish&&geology==='waters'&&source.water;let base,variation=0;if(!atlasBake){const broad=noise(wx*.38+11,wy*.38),med=noise(wx*1.7+9,wy*1.7-7),fine=noise(wx*7.6,wy*7.6);
 const grass=mix([177,162,105],[99,138,83],C(wet*.53+fert*.28+broad*.19)),wood=mix([58,91,57],[89,112,64],med);
 base=mix(grass,wood,S((forest-.15)/.8)*.82),rock=S((H-.38)/.16)*(.37+.63*S((slope-.08)/.55));
 // Strata follow elevation and the actual slope normal rather than a
 // repeating cell-coordinate texture. Rock and scree have distinct tones.
 const strike=(-ny*wx+nx*wy),grain=noise(strike*2.2+height*.37,height*5.6),scree=noise(wx*4.7+height*1.9,wy*4.7-height*.8);
 const stone=mix([128,125,111],[206,194,166],S((grain-.18)/.72)),talus=mix(stone,[166,152,118],S((nz-.22)/.65)*.22);
 base=mix(base,talus,Math.max(rock,S((H-.49)/.13)*.55));base=mix(base,[225,221,203],S((H-.60)/.12)*S((nz-.35)/.55)*.65);
 variation=geology?0:(broad-.5)*11+(med-.5)*8+(fine-.5)*5+(scree-.5)*rock*10;}
 if(geology==='waters'&&source.water){const curvature=at(x+1,y)+at(x-1,y)+at(x,y+1)+at(x,y-1)-4*height;base=overview?overviewMaterial({x:wx,y:wy,H,wet,fert,forest,slope,nx,ny,curvature},source.water.shore[k]):(source.polish?atlasMaterial:watersMaterial)({x:wx,y:wy,H,wet,fert,forest,slope,nx,ny,curvature,river,continuous:source.scaleSurface},{kind:source.water.kind[k],depth:source.water.depth[k],shore:source.water.shore[k]});}else if(geology==='living'){const curvature=at(x+1,y)+at(x-1,y)+at(x,y+1)+at(x,y-1)-4*height;base=livingMaterial({x:wx,y:wy,H,wet,fert,forest,slope,nx,ny,curvature,river});}else if(geology==='synthesis'){const steep=S((slope-.12)/.53),alpine=S((H-.43)/.22),curvature=(at(x+2,y)+at(x-2,y)+at(x,y+2)+at(x,y-2)-4*height),exposure=C((-nx-ny)*.35+.5),soil=mix([133,119,81],[93,125,76],wet),turf=mix(soil,[157,151,94],fert*.63),cliff=mix([115,113,104],[195,187,169],exposure),talus=mix([136,123,101],[179,168,143],S((curvature+.04)/.16));base=mix(turf,[57,83,50],forest*(1-alpine)*.84);base=mix(base,talus,alpine*S((slope-.03)/.44)*.78);base=mix(base,cliff,steep*(.55+.45*alpine));base=mix(base,[225,222,210],S((H-.66)/.14)*(1-steep*.72));}else if(geology){const steep=S((slope-.12)/.47),alpine=S((H-.40)/.23),exposure=C((nx+ny)*.35+.5),soil=mix([137,121,84],[83,117,71],wet),grass=mix(soil,[148,154,91],fert*.7),scree=mix([133,126,108],[190,179,151],exposure),cliff=mix([116,114,106],[205,198,179],exposure);base=mix(grass,[55,84,52],forest*(1-alpine)*.85);base=mix(base,scree,alpine*.72);base=mix(base,cliff,steep*(.35+.65*alpine));base=mix(base,[226,227,216],S((H-.68)/.12)*(1-steep*.65));}
 if(source.identity&&source.water)base=identityBiome(base,{x:wx,y:wy,H,wet,fert,forest,slope},source.water.shore[k]);
 const direct=diff*(1-shadow*.88),ambient=(overview?.52:.61)-.12*S((H-.35)/.24);if(auditFields){normals.set([nx,ny,nz],k*3);lighting.set([direct,ambient],k*2);materials.set(base,k*3);}
 col=base.map((v,i)=>v*(ambient+(overview?.74:.58)*direct)+variation+[2,5,10][i]*(1-direct));
 if(geology==='waters'&&source.water){if(source.water.kind[k])col=base;}else{
 const bank=1-S((river-.005)/.15);col=mix(col,[91,119,78],bank*.32);
 if(land<.50){const shallow=S(land/.48),wave=(noise(wx*1.1,wy*6.2)-.5)*8;col=mix([38,78,95],[107,157,149],shallow).map(v=>v+wave);}
 else{const shore=1-S(Math.abs(land-.52)/.06);col=mix(col,[191,175,130],shore*.76);
 if(river<.014){const opacity=1-S((river+.010)/.024);col=mix(col,mix([49,93,108],[111,144,120],S((river+.06)/.07)),opacity);}}}
 }
 const i=k*4;if(detailMask){const known=river<=1.5?ink:0,rock=S((H-.29)/.25)*S((Math.abs(at(x+1,y)-at(x-1,y))+Math.abs(at(x,y+1)-at(x,y-1)))*res*.8);const canopy=source.identity?forest*(.65+.55*noise(wx*.32+11,wy*.32))*S((forest+.15*noise(wx*1.2,wy*1.2))/.35):forest;detailMask[i]=Math.round(C(canopy*(1-rock))*255);detailMask[i+1]=Math.round(rock*255);detailMask[i+2]=Math.round(C(wet)*255);detailMask[i+3]=Math.round(known*255);}pixels[i]=C(L(paper[0],col[0],ink),0,255);pixels[i+1]=C(L(paper[1],col[1],ink),0,255);pixels[i+2]=C(L(paper[2],col[2],ink),0,255);pixels[i+3]=255;
 }await b.yield();check();}
 const bakeMs=performance.now()-started-(sourceOverride?0:source.stats.ms),bakeSlice=b.max,meshStart=performance.now();
 // Two independent index/vertex buffers share one pre-baked material field.
 // Source sampling is 8/cell; mesh is 2 or 4/cell and remains resident.
 const lods=[];for(const stride of (source.contours?[8,4,2,1]:closeLOD?[4,2,1]:[4,2]).filter(stride=>(w-1)%stride===0&&(h-1)%stride===0)){const cols=(w-1)/stride+1,rows=(h-1)/stride+1,vertices=new Float32Array(cols*rows*3),indices=new Uint32Array((cols-1)*(rows-1)*6);for(let y=0;y<rows;y++){for(let x=0;x<cols;x++){const i=(y*stride*w+x*stride)*9,o=(y*cols+x)*3;vertices[o]=v[i];vertices[o+1]=v[i+1];vertices[o+2]=v[i+2];if(x<cols-1&&y<rows-1){const a=y*cols+x,k=(y*(cols-1)+x)*6;indices.set([a,a+1,a+cols+1,a,a+cols+1,a+cols],k);}}await b.yield();check();}lods.push({vertices,indices,cols,rows});}
 const bytes=pixels.byteLength+(detailMask?.byteLength??0)+lods.reduce((n,l)=>n+l.vertices.byteLength+l.indices.byteLength,0);
 return {detailMask,contours:source.contours,bounds:source.bounds,center:source.center,width:w,height:h,detail:res,pixels,lods,audit:auditFields?{normals,lighting,materials}:undefined,stats:{...source.stats,ms:performance.now()-started+(sourceOverride?source.stats.ms:0),sourceMs:source.stats.ms,bakeMs,bakeSlice,meshMs:performance.now()-meshStart,maxSlice:Math.max(source.stats.maxSlice,b.max),triangles:lods.map(l=>l.indices.length/3),bytes:bytes+(source.contours?.stats.bytes??0),peakSourceBytes:source.stats.bytes}};
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
uniform vec2 center,viewport;uniform float scale,datum,tilt;out vec3 shade;out vec2 waterWorld;
void main(){vec3 p=pos-vec3(center,datum);float cs=sqrt(1.-tilt*tilt);shade=rgb;waterWorld=pos.xy;gl_Position=vec4(p.x*scale*2./viewport.x,-(p.y*cs-p.z*tilt)*scale*2./viewport.y,-(p.y*tilt+p.z*cs)/160.,1.);}`;
const WATER_FS=`#version 300 es
precision highp float;in vec3 shade;in vec2 waterWorld;uniform float scale,micro;out vec4 color;void main(){float r=(sin(waterWorld.x*29.+waterWorld.y*13.)+sin(waterWorld.y*37.-waterWorld.x*8.))*.0035;float close=smoothstep(18.,55.,scale)*micro;float water=smoothstep(-.01,.08,shade.b-shade.r);color=vec4(clamp(shade+vec3(r*close*water),0.,1.),1.);}`;
const FS=`#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D material;
uniform vec2 texel,origin,extent;
uniform sampler2D detailMask;
uniform float scale,micro;
out vec4 color;
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
void main(){vec2 t=uv*(1.-texel)+texel*.5;vec3 base=texture(material,t).rgb;if(micro>0.&&scale>9.){vec4 m=texture(detailMask,t);vec2 p=origin+uv*extent;float close=smoothstep(9.,28.,scale),grain=noise(p*vec2(12.,19.))-.5,stone=noise(p*vec2(9.,13.)+vec2(noise(p*2.1),noise(p*1.6+3.))*1.2);float soil=(noise(p*5.)-.5)*.09+grain*.045;float scree=(stone-.5)*.21+grain*.09;vec2 q=p*5.5,cell=floor(q);float crown=0.,shade=0.;if(m.r>.025&&m.a>.001)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 id=cell+vec2(x,y),j=vec2(hash(id),hash(id+19.));vec2 d=q-id-j;float radius=.36+.32*hash(id+41.);float grove=smoothstep(.22,.76,noise(p*.72+vec2(5.1,3.4)));float gap=smoothstep(.27,.65,noise(p*1.7+vec2(8.,12.)));float density=clamp(m.r*(.30+.95*grove)*gap,0.,1.);float crownPresence=step(1.-density,hash(id+83.));float cap=(1.-smoothstep(radius*.67,radius,length(d)))*crownPresence;if(cap>crown){crown=cap;shade=clamp(.5-dot(d,vec2(.6,.5))/radius,0.,1.);}}vec3 forest=mix(vec3(.15,.24,.14),vec3(.34,.43,.23),shade);base+=vec3(mix(soil,scree,m.g))*m.a*close;base=mix(base,forest,crown*m.a*close*.72);base+=vec3((noise(p*.9)-.5)*.06*m.r*m.a);}color=vec4(clamp(base,0.,1.),1.);}`;
const sharedProgramPools=new WeakMap();
function acquireProgram(gl,key,vsCode,fsCode,shared){let pool=sharedProgramPools.get(gl);if(!pool){pool=new Map();sharedProgramPools.set(gl,pool);}let entry=shared?pool.get(key):null;if(entry){entry.refs++;return {program:entry.program,reused:true,release(){if(--entry.refs===0){gl.deleteProgram(entry.program);pool.delete(key);}}};}const program=gl.createProgram(),vs=compile(gl,gl.VERTEX_SHADER,vsCode),fs=compile(gl,gl.FRAGMENT_SHADER,fsCode);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const error=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw Error(error);}entry={program,refs:1};if(shared)pool.set(key,entry);return {program,reused:false,release(){if(--entry.refs===0){gl.deleteProgram(program);if(shared)pool.delete(key);}}};}
function compile(gl,type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
// Optional experimental chunk index, no topology changes. Bound each
// chunk in world XYZ, cull only if its projected AABB misses the viewport.
function chunkIndices(l,tile=16){const {cols,rows,vertices,indices}=l,out=new Uint32Array(indices.length),chunks=[];let offset=0;for(let y=0;y<rows-1;y+=tile)for(let x=0;x<cols-1;x+=tile){const X=Math.min(cols-1,x+tile),Y=Math.min(rows-1,y+tile),start=offset;let zmin=Infinity,zmax=-Infinity;for(let j=y;j<=Y;j++)for(let i=x;i<=X;i++){const z=vertices[(j*cols+i)*3+2];zmin=Math.min(zmin,z);zmax=Math.max(zmax,z);}for(let j=y;j<Y;j++)for(let i=x;i<X;i++){const k=(j*(cols-1)+i)*6;out.set(indices.subarray(k,k+6),offset);offset+=6;}chunks.push({offset:start,count:offset-start,x0:vertices[(y*cols+x)*3],x1:vertices[(Y*cols+X)*3],y0:vertices[(y*cols+x)*3+1],y1:vertices[(Y*cols+X)*3+1],zmin,zmax});}return {indices:out,chunks};}
export function viewportFramebufferRect(canvasWidth,canvasHeight,viewport=null){
 const dpr=Math.max(.01,Number(viewport?.pixelRatio)||1),inset=(v,max)=>C(Math.round((Number(v)||0)*dpr),0,max),left=inset(viewport?.left,canvasWidth),top=inset(viewport?.top,canvasHeight),right=viewport?.rightEdge==null?Math.max(left,canvasWidth-inset(viewport?.right,Math.max(0,canvasWidth-left))):C(Math.round(viewport.rightEdge*dpr),left,canvasWidth),bottom=viewport?.bottomEdge==null?Math.max(top,canvasHeight-inset(viewport?.bottom,Math.max(0,canvasHeight-top))):C(Math.round(viewport.bottomEdge*dpr),top,canvasHeight);
 return {x:left,y:canvasHeight-bottom,width:Math.max(1,right-left),height:Math.max(1,bottom-top),coordinateSpace:'framebuffer-bottom-left',pixelRatio:dpr};
}
function visible(q,cam,datum,tilt,w,h){const cs=Math.sqrt(1-tilt*tilt),sx=w/(2*cam.s),sy=h/(2*cam.s);if(q.x1<cam.x-sx||q.x0>cam.x+sx)return false;const lo=(q.y0-cam.y)*cs-(q.zmax-datum)*tilt,hi=(q.y1-cam.y)*cs-(q.zmin-datum)*tilt;return hi>=-sy&&lo<=sy;}

export class BakedTerrainGL{
 constructor(canvas,terrain,{chunked=false,adaptive=false,sharedPrograms=false,preserveDrawingBuffer=true}={}){this.chunked=chunked;this.adaptive=adaptive;this.motionLevel=null;this.slow=0;this.fast=0;this.lastFrame=0;const start=performance.now(),gl=canvas.getContext('webgl2',{alpha:false,antialias:!adaptive,preserveDrawingBuffer});if(!gl)throw Error('WebGL2 unavailable');this.gl=gl;this.canvas=canvas;this.terrain=terrain;this.terrainProgram=acquireProgram(gl,'terrain',VS,FS,sharedPrograms);const p=this.terrainProgram.program;this.program=p;this.programReuse=this.terrainProgram.reused;this.lods=terrain.lods.map(l=>{const vao=gl.createVertexArray(),vbo=gl.createBuffer(),ibo=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,l.vertices,gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);const chunks=chunked?chunkIndices(l,adaptive?Math.max(8,Math.round((l.cols-1)/(terrain.bounds[2]-terrain.bounds[0])*12)):16):null;gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,chunks?chunks.indices:l.indices,gl.STATIC_DRAW);return {vao,vbo,ibo,count:l.indices.length,chunks:chunks?.chunks};});
 if(terrain.contours){this.waterProgram=acquireProgram(gl,'water',WATER_VS,WATER_FS,sharedPrograms);const wp=this.waterProgram.program;const vao=gl.createVertexArray(),vbo=gl.createBuffer(),chunks=[],total=terrain.contours.chunks.reduce((n,c)=>n+c.vertices.length,0),data=new Float32Array(total);let offset=0;for(const c of terrain.contours.chunks){data.set(c.vertices,offset);chunks.push({x0:c.x0,x1:c.x1,y0:c.y0,y1:c.y1,zmin:c.zmin,zmax:c.zmax,offset:offset/6,count:c.vertices.length/6});offset+=c.vertices.length;}gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);for(let i=0;i<2;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,24,i*12);}this.water={program:wp,vao,vbo,chunks,u:Object.fromEntries(['center','viewport','scale','datum','tilt','micro'].map(k=>[k,gl.getUniformLocation(wp,k)]))};}
 this.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,terrain.width,terrain.height,0,gl.RGBA,gl.UNSIGNED_BYTE,terrain.pixels);gl.generateMipmap(gl.TEXTURE_2D);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(.83,.78,.67,1);if(terrain.detailMask){this.microTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.microTex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,terrain.width,terrain.height,0,gl.RGBA,gl.UNSIGNED_BYTE,terrain.detailMask);}this.uniforms=Object.fromEntries(['center','viewport','origin','extent','scale','datum','tilt','material','texel','detailMask','micro'].map(k=>[k,gl.getUniformLocation(p,k)]));const debug=gl.getExtension('WEBGL_debug_renderer_info');this.device={vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmasked:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null};gl.finish();this.uploadMs=performance.now()-start;this.pixel=new Uint8Array(4);}
 draw(cam,{tilt=.54,finish=false,cull=this.chunked,motion=false,framebufferViewport=null}={}){const gl=this.gl,u=this.uniforms,t=this.terrain,start=performance.now();let target=this.adaptive?Math.min(this.lods.length-1,cam.s>=(cam.campaign?40:105)?3:cam.s>=(cam.campaign?19:42)?2:cam.s>=(cam.campaign?8:16)?1:0):Math.min(this.lods.length-1,this.lods.length>2&&cam.s>=75?2:cam.s>=45?1:0);if(this.adaptive&&motion){const gap=this.lastFrame?start-this.lastFrame:0;this.lastFrame=start;if(this.motionLevel===null)this.motionLevel=target;if(gap>35){this.slow++;this.fast=0;}else if(gap>0&&gap<24){this.fast++;this.slow=0;}else{this.fast=0;this.slow=0;}if(this.slow>=4){this.motionLevel=Math.max(0,this.motionLevel-1);this.slow=0;}if(this.fast>=18){this.motionLevel=Math.min(target,this.motionLevel+1);this.fast=0;}target=Math.min(target,this.motionLevel);}else{this.motionLevel=null;this.lastFrame=0;this.fast=this.slow=0;}if(cam.campaign&&t.detail===2)target=Math.max(Math.min(1,this.lods.length-1),target);const lod=this.lods[target];const viewport=framebufferViewport??viewportFramebufferRect(this.canvas.width,this.canvas.height,cam.viewport);gl.viewport(viewport.x,viewport.y,viewport.width,viewport.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.bindVertexArray(lod.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform2f(u.center,cam.x,cam.y);gl.uniform2f(u.viewport,viewport.width,viewport.height);gl.uniform2f(u.origin,t.bounds[0],t.bounds[1]);gl.uniform2f(u.extent,t.bounds[2]-t.bounds[0],t.bounds[3]-t.bounds[1]);gl.uniform2f(u.texel,1/t.width,1/t.height);gl.uniform1f(u.scale,cam.s);const datum=cam.datum??t.center;gl.uniform1f(u.datum,datum);gl.uniform1f(u.tilt,tilt);gl.uniform1i(u.material,0);gl.uniform1f(u.micro,this.microTex?1:0);gl.uniform1i(u.detailMask,this.microTex?1:0);if(this.microTex){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.microTex);gl.activeTexture(gl.TEXTURE0);}let drawn=0,calls=0;if(cull&&lod.chunks){for(const q of lod.chunks)if(visible(q,cam,datum,tilt,viewport.width,viewport.height)){gl.drawElements(gl.TRIANGLES,q.count,gl.UNSIGNED_INT,q.offset*4);drawn+=q.count;calls++;}}else{gl.drawElements(gl.TRIANGLES,lod.count,gl.UNSIGNED_INT,0);drawn=lod.count;calls=1;}let waterTriangles=0,waterCalls=0;if(this.water){const p=this.water,u=p.u;gl.useProgram(p.program);gl.bindVertexArray(p.vao);gl.uniform2f(u.center,cam.x,cam.y);gl.uniform2f(u.viewport,viewport.width,viewport.height);gl.uniform1f(u.scale,cam.s);gl.uniform1f(u.datum,datum);gl.uniform1f(u.tilt,tilt);gl.uniform1f(u.micro,this.microTex?1:0);for(const q of p.chunks)if(!cull||visible(q,cam,datum,tilt,viewport.width,viewport.height)){gl.drawArrays(gl.TRIANGLES,q.offset,q.count);waterTriangles+=q.count/3;waterCalls++;}}const actual=gl.getParameter(gl.VIEWPORT);this.lastDraw={triangles:drawn/3,fullTriangles:lod.count/3,calls,waterTriangles,waterCalls,lod:target,viewport:{x:actual[0],y:actual[1],width:actual[2],height:actual[3],coordinateSpace:'framebuffer-bottom-left'},viewportPixels:viewport};if(finish)gl.readPixels(viewport.x+(viewport.width>>1),viewport.y+(viewport.height>>1),1,1,gl.RGBA,gl.UNSIGNED_BYTE,this.pixel);return performance.now()-start;}
 // Explicit, destructive diagnostic: clear the live bank, compare one allocation
 // at a time, and restore the default framebuffer. Never used in motion timing.
 residentRasterProbe(cam,tilt,{originalTargets=false}={}){
  const g=this.gl,v=viewportFramebufferRect(this.canvas.width,this.canvas.height,cam.viewport),w=v.width,h=v.height,bank=this.resident??=new ResidentWorldSurface(g),pad=bank.pad;
  bank.clear();const rows=[],images={};
  const state=()=>Object.fromEntries(['RED_BITS','GREEN_BITS','BLUE_BITS','ALPHA_BITS','DEPTH_BITS','STENCIL_BITS','SAMPLES','SAMPLE_BUFFERS','IMPLEMENTATION_COLOR_READ_FORMAT','IMPLEMENTATION_COLOR_READ_TYPE'].map(k=>[k,g.getParameter(g[k])]));
  const read=(x,y)=>{const p=new Uint8Array(w*h*4);g.readPixels(x,y,w,h,g.RGBA,g.UNSIGNED_BYTE,p);return p;};
  const finish=fn=>{const t=performance.now(),value=fn(),submitMs=performance.now()-t,wait=performance.now();g.finish();return {value,submitMs,completionWaitMs:performance.now()-wait};};
  const diff=(a,b)=>{const p=new Uint8Array(a.length);let count=0,max=0;const points=[];for(let i=0;i<a.length;i+=4){let d=0;for(let j=0;j<4;j++)d=Math.max(d,Math.abs(a[i+j]-b[i+j]));if(d){count++;max=Math.max(max,d);if(points.length<4096)points.push([i/4%w,Math.floor(i/4/w),d]);p.set([255,Math.min(255,d*8),0,255],i);}}return {count,max,points,pixels:p};};
  const png=p=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const ctx=cv.getContext('2d'),im=ctx.createImageData(w,h);for(let y=0;y<h;y++)im.data.set(p.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);ctx.putImageData(im,0,0);return cv.toDataURL('image/png').split(',')[1];};
  const compare=(label,p,fresh,metrics)=>{const d=diff(p,fresh);images[label+'-actual']=png(p);images[label+'-fresh']=png(fresh);images[label+'-difference']=png(d.pixels);delete d.pixels;rows.push({label,...metrics,...d});};
  const originalDither=g.isEnabled(g.DITHER);
  try{
   for(const dither of [originalDither,false].filter((v,i,a)=>a.indexOf(v)===i)){
    if(dither)g.enable(g.DITHER);else g.disable(g.DITHER);
    const tag=dither?'dither-on':'dither-off';g.bindFramebuffer(g.FRAMEBUFFER,null);const freshState=state(),freshTime=finish(()=>this.draw(cam,{tilt})),fresh=read(v.x,v.y);
    for(const padded of [false,true]){
     const label=tag+(padded?'-padded':'-same-size'),width=padded?w+2*pad:this.canvas.width,height=padded?h+2*pad:this.canvas.height,rect=padded?{...v,x:0,y:0,width,height}:v;
     const alloc=finish(()=>bank.acquire(width,height)),e=alloc.value;if(!e){rows.push({label,error:'allocation unavailable',freshState});continue;}
     try{g.bindFramebuffer(g.FRAMEBUFFER,e.fb);const offscreenState=state(),raster=finish(()=>this.draw(cam,{tilt,framebufferViewport:rect})),x=padded?pad:v.x,y=padded?pad:v.y,build=read(x,y);
      const metrics={freshState,offscreenState,width,height,viewport:rect,allocation:{submitMs:alloc.submitMs,completionWaitMs:alloc.completionWaitMs},raster:{submitMs:raster.submitMs,completionWaitMs:raster.completionWaitMs},fresh:{submitMs:freshTime.submitMs,completionWaitMs:freshTime.completionWaitMs}};
      compare(label+'-build',build,fresh,metrics);
      const blit=finish(()=>{g.bindFramebuffer(g.DRAW_FRAMEBUFFER,null);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.bindFramebuffer(g.READ_FRAMEBUFFER,e.fb);g.blitFramebuffer(x,y,x+w,y+h,v.x,v.y,v.x+w,v.y+h,g.COLOR_BUFFER_BIT,g.NEAREST);g.bindFramebuffer(g.FRAMEBUFFER,null);});
      compare(label+'-blit',read(v.x,v.y),fresh,{...metrics,blit:{submitMs:blit.submitMs,completionWaitMs:blit.completionWaitMs}});
      if(padded&&pad>=4){const shift=4,shifted={...cam,x:cam.x+shift/cam.s};g.bindFramebuffer(g.FRAMEBUFFER,e.fb);const hit=read(x+shift,y);g.bindFramebuffer(g.FRAMEBUFFER,null);finish(()=>this.draw(shifted,{tilt}));compare(label+'-integer-hit',hit,read(v.x,v.y),metrics);}
     }finally{g.bindFramebuffer(g.FRAMEBUFFER,null);bank.drop(e);bank.clear();}
    }
   }
   // Isolated stable projection: identical clip-space denominator and world
   // center; integer displacement is expressed only as viewport translation.
   // Do not quantize the camera or adopt the experimental raster as baseline.
   if(originalDither)g.enable(g.DITHER);else g.disable(g.DITHER);
   const width=w+2*pad,height=h+2*pad,rect={...v,x:0,y:0,width,height},fixed={...rect,x:v.x-pad,y:v.y-pad},shift=4;
   const experimental={experimental:true,projection:'fixed-extent-integer-viewport-translation',width,height,anchor:{x:cam.x,y:cam.y,s:cam.s},fixedViewport:fixed};
   const e=bank.acquire(width,height);
   if(!e){rows.push({...experimental,label:'stable-allocation',error:'allocation unavailable'});}
   else try{
    g.bindFramebuffer(g.FRAMEBUFFER,null);finish(()=>this.draw(cam,{tilt}));const original=read(v.x,v.y);
    finish(()=>this.draw(cam,{tilt,framebufferViewport:fixed}));const stable=read(v.x,v.y);
    compare('stable-fresh-vs-original',stable,original,experimental);
    g.bindFramebuffer(g.FRAMEBUFFER,e.fb);finish(()=>this.draw(cam,{tilt,framebufferViewport:rect}));const build=read(pad,pad),hitX=read(pad+shift,pad),hitY=read(pad,pad+shift);
    compare('stable-build',build,stable,experimental);
    g.bindFramebuffer(g.DRAW_FRAMEBUFFER,null);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.bindFramebuffer(g.READ_FRAMEBUFFER,e.fb);g.blitFramebuffer(pad,pad,pad+w,pad+h,v.x,v.y,v.x+w,v.y+h,g.COLOR_BUFFER_BIT,g.NEAREST);g.bindFramebuffer(g.FRAMEBUFFER,null);g.finish();compare('stable-blit',read(v.x,v.y),stable,experimental);
    finish(()=>this.draw(cam,{tilt,framebufferViewport:{...fixed,x:fixed.x-shift}}));compare('stable-integer-x',hitX,read(v.x,v.y),{...experimental,exactTarget:{x:cam.x+shift/cam.s,y:cam.y,s:cam.s}});
    finish(()=>this.draw(cam,{tilt,framebufferViewport:{...fixed,y:fixed.y-shift}}));compare('stable-integer-y',hitY,read(v.x,v.y),{...experimental,exactTarget:{x:cam.x,y:cam.y-shift/(cam.s*Math.sqrt(1-tilt*tilt)),s:cam.s},depthAnchorUnchanged:true});
    if(originalTargets){for(const [axis,hit,target] of [['x',hitX,{...cam,x:cam.x+shift/cam.s}],['y',hitY,{...cam,y:cam.y-shift/(cam.s*Math.sqrt(1-tilt*tilt))}]]){finish(()=>this.draw(target,{tilt}));compare('stable-integer-'+axis+'-vs-original',hit,read(v.x,v.y),{...experimental,originalTarget:true,exactTarget:{x:target.x,y:target.y,s:target.s}});}}
   }finally{g.bindFramebuffer(g.FRAMEBUFFER,null);bank.drop(e);bank.clear();}
  }finally{bank.clear();g.bindFramebuffer(g.FRAMEBUFFER,null);if(originalDither)g.enable(g.DITHER);else g.disable(g.DITHER);this.draw(cam,{tilt});}
  return {rows,images,device:this.device,attributes:g.getContextAttributes(),viewport:v,originalDither,precision:g.getShaderPrecisionFormat(g.VERTEX_SHADER,g.HIGH_FLOAT)?.precision,browserCompositionMs:null};
 }
 configureResident(options){this.resident?.clear();this.resident=new ResidentWorldSurface(this.gl,options);}
 drawResident(cam,{tilt=.54,motion=false,allow=false,range=null}={}){
 const viewport=viewportFramebufferRect(this.canvas.width,this.canvas.height,cam.viewport);
 const resident=this.resident??=new ResidentWorldSurface(this.gl);
 const result=resident.draw({view:cam,viewport,tilt,region:this.terrain.bounds,range,allow,motion,render:framebufferViewport=>{const ms=this.draw(cam,{tilt,motion,framebufferViewport});return {ms,draw:this.lastDraw};}});
 this.lastDraw=result.draw;return result.ms;
 }
 dispose(){this.resident?.clear();const g=this.gl;if(this.water){g.deleteBuffer(this.water.vbo);g.deleteVertexArray(this.water.vao);this.waterProgram.release();this.water=null;}for(const l of this.lods){g.deleteBuffer(l.vbo);g.deleteBuffer(l.ibo);g.deleteVertexArray(l.vao);}g.deleteTexture(this.tex);if(this.microTex)g.deleteTexture(this.microTex);this.terrainProgram.release();}
}

// Integration guard: never access full fine geography for a charted-only map.
export async function prepareGeographicCandidate(s,cam,{bounds,detail=8,contourDetail=8,vertical,diagnostic=false,polish=false,surfaceScale=false,identity=false,check=()=>{}}={}){
 check();const yieldRow=async()=>{check();await sleep();check();};
 if(polish&&s.mapVersion===3&&s.discovery?.fullMap&&!s.autonomous)s={...s,autonomous:true};
 if(s.mapVersion===3&&!s.autonomous&&s.map.geography?.lakeId){const snapshot=model(s),source=await prepareTerrain(s,cam,{boundsOverride:bounds,detail,heightStyle:'smooth',textureOnly:true,omitRivers:polish});await chartedContourSource(s,source,snapshot.known,{contourDetail,vertical,polish,yieldRow,continuous:surfaceScale,identity});source.scaleSurface=surfaceScale;source.identity=identity;return prepareBakedTerrain(s,cam,{sourceOverride:source,geology:'waters',closeLOD:true,check});}
 if(s.mapVersion!==3||!s.autonomous){const terrain=await prepareBakedTerrain(s,cam,{sourceOverride:await prepareTerrain(s,cam,{boundsOverride:bounds,detail,heightStyle:'smooth',textureOnly:true}),geology:'living',closeLOD:true});return {...terrain,stats:{...terrain.stats,fogFallback:true}};}
 const source=surfaceScale&&!diagnostic&&s.map.geography?.lakeId?await scaleTerrainSource(s,cam,{bounds,detail,contourDetail,vertical,yieldRow,identity}):await contourSource(s,cam,{bounds,detail,contourDetail,vertical,diagnostic,polish,yieldRow});source.identity=identity;return prepareBakedTerrain(s,cam,{sourceOverride:source,geology:'waters',closeLOD:true,check});
}
