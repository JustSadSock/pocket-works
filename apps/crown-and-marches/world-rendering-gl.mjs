// World Rendering & Art Standard. Isolated terrain experiment, no campaign hooks.
import {model} from './geography-review.mjs';
import {livingLand,livingRivers} from './landscape-surface.mjs';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
const pause=()=>new Promise(r=>setTimeout(r,0));
function hash(x,y){let n=Math.imul(x+631,374761393)^Math.imul(y+289,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=smooth(x-i),v=smooth(y-j);return lerp(lerp(hash(i,j),hash(i+1,j),u),lerp(hash(i,j+1),hash(i+1,j+1),u),v);}
function dist(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);}
function sampleHeight(m,x,y){const u=x-.5,v=y-.5,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,z=m.sample(x,y,'height')??0,get=(x,y)=>{const k=m.at(x,y);return k>=0&&m.known[k]?m.m.height[k]:z;},p=get(i,j),q=get(i+1,j),r=get(i,j+1),s=get(i+1,j+1);
 // Bilinear interpolation of the four source samples. No new extrema.
 const f=lerp(lerp(p,q,a),lerp(r,s,a),b),range=Math.max(p,q,r,s)-Math.min(p,q,r,s),gate=smooth((f-.39)/.16);
 // Sub-cell rock structure: residual is zero at every source node. No
 // arbitrary peaks on plains; small erosion detail constrained by local range.
 const lith=(x,y)=>{const a=1-Math.abs(2*noise(x*1.8+y*.4,y*1.25)-1),b=1-Math.abs(2*noise(x*4.2+y*.9,y*3.1+19)-1);return a*a*.74+b*b*.26;};
 const correction=lerp(lerp(lith(i+.5,j+.5),lith(i+1.5,j+.5),a),lerp(lith(i+.5,j+1.5),lith(i+1.5,j+1.5),a),b);
 return clamp(f+(lith(x,y)-correction)*Math.min(.055,range*.32)*gate,Math.min(p,q,r,s),Math.max(p,q,r,s));}
// Slope-limited Hermite reconstruction. The derivative is shared across cells
// and zero at actual extrema; the simulation's height anchors are untouched.
function smoothHeight(m,x,y){
 const u=x-.5,v=y-.5,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,mid=m.sample(x,y,'height')??0;
 const get=(x,y)=>{const k=m.at(x,y);return k>=0&&m.known[k]?m.m.height[k]:mid;};
 const cubic=(p,q,r,s,t)=>{const d=r-q,prev=q-p,next=s-r,tangent=(a,b)=>a*b>0?2*a*b/(a+b):0,A=tangent(prev,d),B=tangent(d,next);return q+t*(A+t*(3*d-2*A-B+t*(A+B-2*d)));};
 const rows=[];for(let k=-1;k<=2;k++)rows.push(cubic(get(i-1,j+k),get(i,j+k),get(i+1,j+k),get(i+2,j+k),a));
 const anchors=[get(i,j),get(i+1,j),get(i,j+1),get(i+1,j+1)];return clamp(cubic(...rows,b),Math.min(...anchors),Math.max(...anchors));
}
export const vertical=h=>Math.max(0,h-.12)*3.1+Math.max(0,h-.34)*19+Math.max(0,h-.48)*9;
export async function prepareTerrain(s,cam,{width=1280,height=800,detail=8,heightStyle='original',textureOnly=false}={}){
 const start=performance.now(),m=model(s),network=livingRivers(m),x0=Math.max(0,Math.floor(cam.x-width/cam.s*.7-6)),y0=Math.max(0,Math.floor(cam.y-height/cam.s*.95-12)),x1=Math.min(m.width,Math.ceil(cam.x+width/cam.s*.7+6)),y1=Math.min(m.height,Math.ceil(cam.y+height/cam.s*.95+12));
 const buckets=new Map();let last=performance.now(),maxSlice=last-start;const yieldIf=async()=>{const n=performance.now();if(n-last>=6){maxSlice=Math.max(maxSlice,n-last);await pause();last=performance.now();}};
 for(const e of network){const w=clamp(.025+.025*Math.log2(Math.max(1,m.m.flow[e.i]/58)),.025,.145);for(let k=1;k<e.points.length;k++){const a=e.points[k-1],b=e.points[k];if(Math.max(a[0],b[0])<x0-1||Math.min(a[0],b[0])>x1+1||Math.max(a[1],b[1])<y0-1||Math.min(a[1],b[1])>y1+1)continue;for(let y=Math.floor(Math.min(a[1],b[1])-.45);y<=Math.floor(Math.max(a[1],b[1])+.45);y++)for(let x=Math.floor(Math.min(a[0],b[0])-.45);x<=Math.floor(Math.max(a[0],b[0])+.45);x++){const key=x+','+y;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({a,b,w});}}await yieldIf();}
 const cols=(x1-x0)*detail+1,rows=(y1-y0)*detail+1,n=cols*rows,vertices=new Float32Array(n*9),elevations=new Float32Array(n),indices=new Uint32Array(textureOnly?0:(cols-1)*(rows-1)*6);let minH=Infinity,maxH=-Infinity,minZ=Infinity,maxZ=-Infinity,anchorError=0,landCount=0,mountainCount=0;
 // Material channels: source height, moisture, fertility, forest, land
 // coverage, river distance, and known mask. Actual Z is a separate channel.
 for(let j=0;j<rows;j++){for(let i=0;i<cols;i++){const x=Math.min(m.width-.0001,x0+i/detail),y=Math.min(m.height-.0001,y0+j/detail),k=j*cols+i,o=k*9,cell=m.at(Math.floor(x),Math.floor(y)),land=livingLand(m,x,y),known=land!==null&&cell>=0,h=known?(heightStyle==='smooth'?smoothHeight(m,x,y):sampleHeight(m,x,y)):0;
 let river=1;if(known)for(const e of buckets.get(Math.floor(x)+','+Math.floor(y))||[])river=Math.min(river,dist(x,y,e.a,e.b)-e.w*.5);
 const coverage=land??0,base=vertical(h)*smooth((coverage-.49)/.25),bank=smooth(1-clamp((river+.035)/.23)),z=known?coverage<.50?-.035:Math.max(-.025,base-bank*.10):0;
 vertices.set([x,y,z,h,known?(m.sample(x,y,'moisture')??0):0,known?(m.sample(x,y,'fert')??0):0,known?(m.sample(x,y,'forest')??0):0,coverage,known?clamp(river,-.2,1):2],o);elevations[k]=z;
 if(known&&m.m.land[cell]){minH=Math.min(minH,h);maxH=Math.max(maxH,h);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
 if(i%detail===detail/2&&j%detail===detail/2&&known){anchorError=Math.max(anchorError,Math.abs(h-m.m.height[cell]));if(m.m.land[cell]){landCount++;if(m.m.terrain[cell]===4||m.m.terrain[cell]===3)mountainCount++;}}
 }await yieldIf();}
 if(!textureOnly)for(let j=0;j<rows-1;j++){for(let i=0;i<cols-1;i++){const a=j*cols+i,b=a+1,c=a+cols,d=c+1,k=(j*(cols-1)+i)*6;indices.set([a,b,d,a,d,c],k);}await yieldIf();}
 const center=vertical(m.sample(cam.x,cam.y,'height')??0);
 return {vertices,indices,elevations,cols,rows,detail,bounds:[x0,y0,x1,y1],center,stats:{ms:performance.now()-start,maxSlice:Math.max(maxSlice,performance.now()-last),minH,maxH,minZ,maxZ,anchorError,landCount,mountainCount,triangles:indices.length/3,bytes:vertices.byteLength+indices.byteLength+elevations.byteLength}};
}
const VS=`#version 300 es
precision highp float;
layout(location=0) in vec3 pos;
layout(location=1) in vec4 material;
layout(location=2) in vec2 hydro;
uniform vec2 center, viewport;
uniform float scale,datum,tilt;
out vec3 world;
out vec4 surface;
out vec2 water;
void main(){float cs=sqrt(1.-tilt*tilt);vec3 p=pos-vec3(center,datum);world=pos;surface=material;water=hydro;
gl_Position=vec4(p.x*scale*2./viewport.x,-(p.y*cs-p.z*tilt)*scale*2./viewport.y,-(p.y*tilt+p.z*cs)/160.,1.);}`;
const FS=`#version 300 es
precision highp float;
in vec3 world;
in vec4 surface;
in vec2 water;
uniform sampler2D elevation;
uniform vec2 origin, dimensions;
uniform float density;
out vec4 color;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float H(vec2 p){vec2 uv=(p-origin)*density;ivec2 i=ivec2(clamp(round(uv),vec2(0),dimensions-1.));return texelFetch(elevation,i,0).r;}
void main(){
 if(water.y>1.5){color=vec4(.83,.78,.67,1.);return;}
 vec3 n=normalize(cross(dFdx(world),dFdy(world)));if(n.z<0.)n=-n;
 vec3 light=normalize(vec3(-.68,-.53,.54));float diffuse=max(0.,dot(n,light)),slope=1.-n.z;
 float h=surface.x,wet=surface.y,fert=surface.z,forest=surface.w;
 float broad=noise(world.xy*.29),medium=noise(world.xy*1.9),fine=noise(world.xy*13.);
 vec3 grass=mix(vec3(.62,.56,.31),vec3(.33,.48,.23),clamp(wet*.67+fert*.22+broad*.11,0.,1.));
 grass=mix(grass,vec3(.19,.32,.19),smoothstep(.18,.9,forest)*.8);
 float rock=smoothstep(.34,.55,h)*smoothstep(.06,.49,slope);
 float stratum=noise(vec2(world.x*4.+world.z*2.4,world.y*.9+world.z*4.5));
 vec3 stone=mix(vec3(.38,.35,.29),vec3(.76,.72,.62),smoothstep(.17,.83,stratum));
 vec3 base=mix(grass,stone,max(rock,smoothstep(.46,.65,h)*.72));
 base=mix(base,vec3(.87,.86,.81),smoothstep(.63,.76,h)*smoothstep(.4,.94,n.z));
 base+=vec3((broad-.5)*.085+(medium-.5)*.045+(fine-.5)*.023);
 float horizon=0.;for(int k=1;k<=12;k++){float d=float(k)*.43;vec2 q=world.xy+normalize(light.xy)*d;float occ=H(q)-world.z-d*light.z/length(light.xy);horizon=max(horizon,smoothstep(.03,.30,occ));}
 float illumination=.50+.60*diffuse*(1.-horizon*.77);vec3 ground=base*illumination+vec3(.025,.033,.044)*(1.-diffuse);
 float shore=1.-smoothstep(0.,.09,abs(water.x-.51));ground=mix(ground,vec3(.68,.59,.40)*illumination,shore*.78);
 float bank=1.-smoothstep(.01,.14,water.y);ground=mix(ground,vec3(.32,.39,.23)*illumination,bank*.32);
 if(water.x<.50){float shallow=smoothstep(.08,.49,water.x),waves=noise(world.xy*vec2(2.,8.))-.5;color=vec4(mix(vec3(.10,.24,.32),vec3(.29,.48,.46),shallow)+waves*.018,1.);return;}
 if(water.y<0.){float bank=smoothstep(-.055,0.,water.y);ground=mix(vec3(.13,.30,.33),vec3(.33,.43,.32),bank*.55);}
 color=vec4(clamp(ground,0.,1.),1.);
}`;
function shader(gl,type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
export class TerrainGL{
 constructor(canvas,terrain){
 const start=performance.now(),gl=canvas.getContext('webgl2',{alpha:false,antialias:true,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');this.gl=gl;this.canvas=canvas;this.terrain=terrain;
 const p=gl.createProgram(),vs=shader(gl,gl.VERTEX_SHADER,VS),fs=shader(gl,gl.FRAGMENT_SHADER,FS);gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.deleteShader(vs);gl.deleteShader(fs);this.program=p;
 this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.vbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);gl.bufferData(gl.ARRAY_BUFFER,terrain.vertices,gl.STATIC_DRAW);for(const [i,n,offset] of [[0,3,0],[1,4,12],[2,2,28]]){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,36,offset);}
 this.ibo=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,terrain.indices,gl.STATIC_DRAW);
 this.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,terrain.cols,terrain.rows,0,gl.RED,gl.FLOAT,terrain.elevations);
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(.83,.78,.67,1);gl.useProgram(p);
 this.uniforms=Object.fromEntries(['center','viewport','scale','datum','tilt','elevation','origin','dimensions','density'].map(k=>[k,gl.getUniformLocation(p,k)]));const debug=gl.getExtension('WEBGL_debug_renderer_info');this.device={vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmasked:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,maxTexture:gl.getParameter(gl.MAX_TEXTURE_SIZE)};gl.finish();this.uploadMs=performance.now()-start;
 }
 draw(cam,{tilt=.54,finish=false}={}){const gl=this.gl,u=this.uniforms,t=this.terrain,start=performance.now();gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex);gl.uniform2f(u.center,cam.x,cam.y);gl.uniform2f(u.viewport,this.canvas.width,this.canvas.height);gl.uniform1f(u.scale,cam.s);gl.uniform1f(u.datum,t.center);gl.uniform1f(u.tilt,tilt);gl.uniform1i(u.elevation,0);gl.uniform2f(u.origin,t.bounds[0],t.bounds[1]);gl.uniform2f(u.dimensions,t.cols,t.rows);gl.uniform1f(u.density,t.detail);gl.drawElements(gl.TRIANGLES,t.indices.length,gl.UNSIGNED_INT,0);if(finish)gl.finish();return performance.now()-start;}
 dispose(){const g=this.gl;g.deleteBuffer(this.vbo);g.deleteBuffer(this.ibo);g.deleteTexture(this.tex);g.deleteVertexArray(this.vao);g.deleteProgram(this.program);}
}
