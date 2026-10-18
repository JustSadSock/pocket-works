// Custom first-person WebGL renderer: real triangles and depth, offline and dependency-free.
import { SIZE } from './world.mjs';
const VERT=['attribute vec3 position;attribute vec3 tint;attribute vec3 normal;','uniform mat4 viewProjection;varying vec3 worldPos;varying vec3 color;varying vec3 surfaceNormal;','void main(){worldPos=position;color=tint;surfaceNormal=normal;gl_Position=viewProjection*vec4(position,1.0);}'].join('\n');
const FRAG=['precision mediump float;','varying vec3 worldPos;varying vec3 color;varying vec3 surfaceNormal;','uniform vec3 eye;uniform vec3 facing;uniform float time;uniform float torch;uniform float glow;','void main(){','float d=distance(worldPos,eye);','vec3 delta=normalize(worldPos-eye+vec3(.0001));','float cone=smoothstep(.61,.94,dot(delta,facing));','float reach=1.0-smoothstep(7.0,31.0,d);','float relief=.77+.23*abs(surfaceNormal.y);','float fall=(.17+torch*cone*reach*1.9)*relief;','float grit=fract(sin(dot(floor(worldPos*4.0),vec3(71.9,21.3,33.7)))*43758.5453);','float streak=sin(worldPos.y*7.0+worldPos.x*2.0+worldPos.z*1.2)*.028;','vec3 shaded=color*(fall*(.90+grit*.12)+streak)+glow*color*.9;','float fog=smoothstep(9.0,37.0,d);','shaded=mix(shaded,vec3(.015,.038,.046),fog);','float pulse=.97+.03*sin(time*.8);','gl_FragColor=vec4(shaded*pulse,1.0);','}'].join('\n');
function shader(gl,type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
function mul(a,b){const r=new Float32Array(16);for(let c=0;c<4;c++)for(let row=0;row<4;row++){let sum=0;for(let k=0;k<4;k++)sum+=a[k*4+row]*b[c*4+k];r[c*4+row]=sum}return r}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0])}
function view(eye,forward){const norm=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)};const cz=norm([-forward[0],-forward[1],-forward[2]]),cx=norm([cz[2],0,-cz[0]]),cy=[cz[1]*cx[2]-cz[2]*cx[1],cz[2]*cx[0]-cz[0]*cx[2],cz[0]*cx[1]-cz[1]*cx[0]];return new Float32Array([cx[0],cy[0],cz[0],0,cx[1],cy[1],cz[1],0,cx[2],cy[2],cz[2],0,-(cx[0]*eye[0]+cx[1]*eye[1]+cx[2]*eye[2]),-(cy[0]*eye[0]+cy[1]*eye[1]+cy[2]*eye[2]),-(cz[0]*eye[0]+cz[1]*eye[1]+cz[2]*eye[2]),1])}
class Mesh{constructor(gl,vertices){this.gl=gl;this.buffer=gl.createBuffer();this.count=vertices.length/9;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW)}dispose(){this.gl.deleteBuffer(this.buffer)}}
function quad(a,b,c,d,col,n,out){for(const v of [a,b,c,a,c,d])out.push(v[0],v[1],v[2],col[0],col[1],col[2],n[0],n[1],n[2])}
function box(x,y,z,w,h,d,col,out){const a=x-w/2,b=x+w/2,l=y,m=y+h,c=z-d/2,e=z+d/2;
 quad([a,l,c],[b,l,c],[b,m,c],[a,m,c],col,[0,0,-1],out);quad([b,l,e],[a,l,e],[a,m,e],[b,m,e],col,[0,0,1],out);
 quad([a,l,e],[a,l,c],[a,m,c],[a,m,e],col,[-1,0,0],out);quad([b,l,c],[b,l,e],[b,m,e],[b,m,c],col,[1,0,0],out);
 quad([a,m,c],[b,m,c],[b,m,e],[a,m,e],col,[0,1,0],out);quad([a,l,e],[b,l,e],[b,l,c],[a,l,c],col,[0,-1,0],out)}
function chamber(world,ch){const v=[],s=SIZE,W=2,wall=[.30,.40,.40],floor=[.28,.33,.30],room=[.32,.38,.34],ceiling=[.17,.24,.25],dark=[.13,.19,.20];
 for(let zz=0;zz<s;zz++)for(let xx=0;xx<s;xx++){const gx=ch.cx*s+xx,gz=ch.cy*s+zz,t=ch.tiles[zz*s+xx],x=gx*W,z=gz*W;
 if(t){const c=t===2?room:floor,variation=((gx*37+gz*19)%7)*.011,cc=c.map(n=>n+variation);
  quad([x,0,z+W],[x+W,0,z+W],[x+W,0,z],[x,0,z],cc,[0,1,0],v);
  quad([x,3.55,z],[x+W,3.55,z],[x+W,3.55,z+W],[x,3.55,z+W],ceiling,[0,-1,0],v);
  if(((gx*31+gz*7)%19)===0)box(x+1,.008,z+1,1.6,.014,1.6,[.38,.43,.39],v)
 }else{const c=((gx*9+gz*13)%11===0)?dark:wall;
  if(world.pass(gx+1,gz))quad([x+W,0,z+W],[x+W,0,z],[x+W,3.55,z],[x+W,3.55,z+W],c,[1,0,0],v);
  if(world.pass(gx-1,gz))quad([x,0,z],[x,0,z+W],[x,3.55,z+W],[x,3.55,z],c,[-1,0,0],v);
  if(world.pass(gx,gz+1))quad([x,0,z+W],[x+W,0,z+W],[x+W,3.55,z+W],[x,3.55,z+W],c,[0,0,1],v);
  if(world.pass(gx,gz-1))quad([x+W,0,z],[x,0,z],[x,3.55,z],[x+W,3.55,z],c,[0,0,-1],v)
 }}return v}
export class Renderer{
 constructor(canvas){this.canvas=canvas;const gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:false,powerPreference:'high-performance'})||canvas.getContext('experimental-webgl');if(!gl)throw Error('WebGL unavailable');this.gl=gl;this.lost=false;this.cache=new Map();
 const program=gl.createProgram();gl.attachShader(program,shader(gl,gl.VERTEX_SHADER,VERT));gl.attachShader(program,shader(gl,gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 this.program=program;gl.useProgram(program);this.aPos=gl.getAttribLocation(program,'position');this.aCol=gl.getAttribLocation(program,'tint');this.aNormal=gl.getAttribLocation(program,'normal');for(const a of [this.aPos,this.aCol,this.aNormal])gl.enableVertexAttribArray(a);
 this.mvp=gl.getUniformLocation(program,'viewProjection');this.eye=gl.getUniformLocation(program,'eye');this.facing=gl.getUniformLocation(program,'facing');this.torch=gl.getUniformLocation(program,'torch');this.time=gl.getUniformLocation(program,'time');this.glow=gl.getUniformLocation(program,'glow');
 this.dynamic=gl.createBuffer();gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true})}
 resize(){const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,window.innerWidth<800?1.25:1.6),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(w!==this.canvas.width||h!==this.canvas.height){this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h)}}
 bind(buffer){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const sz=9*4;gl.vertexAttribPointer(this.aPos,3,gl.FLOAT,false,sz,0);gl.vertexAttribPointer(this.aCol,3,gl.FLOAT,false,sz,12);gl.vertexAttribPointer(this.aNormal,3,gl.FLOAT,false,sz,24)}
 draw(world,player,enemies,anchors,flash,t){if(this.lost)return;this.resize();const gl=this.gl;gl.clearColor(.008,.021,.028,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
 const yy=1.48+(player.bob||0),eye=[player.x*2,yy,player.z*2],dir=[Math.sin(player.yaw)*Math.cos(player.pitch),-Math.sin(player.pitch),-Math.cos(player.yaw)*Math.cos(player.pitch)];
 gl.uniformMatrix4fv(this.mvp,false,mul(perspective(Math.PI*.46,this.canvas.width/this.canvas.height,.08,85),view(eye,dir)));gl.uniform3fv(this.eye,eye);gl.uniform3fv(this.facing,dir);gl.uniform1f(this.torch,flash?1:0);gl.uniform1f(this.time,t);gl.uniform1f(this.glow,0);
 const cx=Math.floor(player.x/SIZE),cy=Math.floor(player.z/SIZE),needed=new Set();
 for(const [k,ch] of world.chunks){if(Math.max(Math.abs(ch.cx-cx),Math.abs(ch.cy-cy))>1)continue;needed.add(k);
  let entry=this.cache.get(k);if(!entry||entry.version!==ch.version){entry?.mesh.dispose();entry={version:ch.version,mesh:new Mesh(gl,chamber(world,ch))};this.cache.set(k,entry)}
  this.bind(entry.mesh.buffer);gl.drawArrays(gl.TRIANGLES,0,entry.mesh.count)}
 for(const [k,entry] of this.cache)if(!needed.has(k)){entry.mesh.dispose();this.cache.delete(k)}
 const dyn=[];
 for(const a of anchors){const x=a.x*2,z=a.z*2,dist=Math.hypot(a.x-player.x,a.z-player.z);if(dist>36)continue;
  const c=a.home?[.25,.57,.64]:[.94,.65,.33],lift=.35+.12*Math.sin(t*2+z);
  box(x,.04,z,1.6,.15,1.6,[.18,.28,.28],dyn);box(x,lift,z,.34,.9,.34,c,dyn);box(x,.42+lift,z,.65,.10,.65,c,dyn);
  for(const d of [-1,1])box(x+d*.56,.16,z,.12,.6,.12,c,dyn)}
 for(const e of enemies){const dist=Math.hypot(e.x-player.x,e.z-player.z);if(dist>33)continue;
  const x=e.x*2,z=e.z*2,bob=.09*Math.sin(t*4+e.x),c=e.real?[.56,.16,.19]:[.35,.56,.57];
  box(x,.23+bob,z,.55,1.75,.40,c,dyn);box(x,2.03+bob,z,.62,.67,.54,c,dyn);
  box(x-.40,.45+bob,z,.15,1.15,.15,c,dyn);box(x+.40,.45+bob,z,.15,1.15,.15,c,dyn);
  box(x-.18,0,z,.16,.38,.34,c,dyn);box(x+.18,0,z,.16,.38,.34,c,dyn)}
 if(dyn.length){gl.uniform1f(this.glow,1);this.bind(this.dynamic);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(dyn),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,dyn.length/9)}
 }
 dispose(){for(const entry of this.cache.values())entry.mesh.dispose();this.cache.clear()}
}