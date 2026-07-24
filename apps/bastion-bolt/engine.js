export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a || 1), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const v3 = (x=0,y=0,z=0) => [x,y,z];
export const add3 = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub3 = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const mul3 = (a,s) => [a[0]*s,a[1]*s,a[2]*s];
export const dot3 = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const len3 = a => Math.hypot(a[0],a[1],a[2]);
export const norm3 = a => { const l=len3(a)||1; return [a[0]/l,a[1]/l,a[2]/l]; };
export const cross3 = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

export function mat4Identity(){ return new Float32Array([1,0,0,0,0,1,0,0,0,1,0,0,0,1]); }
export function mat4Multiply(a,b){
  const o=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return o;
}
export function mat4Perspective(fov,aspect,near,far){ const f=1/Math.tan(fov/2),nf=1/(near-far); return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]); }
export function mat4LookAt(eye,target,up=[0,1,0]){ const z=norm3(sub3(eye,target)),x=norm3(cross3(up,z)),y=cross3(z,x); return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot3(x,eye),-dot3(y,eye),-dot3(z,eye),1]); }
export function mat4Compose(p,r,s){
  const [sx,sy,sz]=s,[rx,ry,rz]=r,cx=Math.cos(rx),sxv=Math.sin(rx),cy=Math.cos(ry),syv=Math.sin(ry),cz=Math.cos(rz),szv=Math.sin(rz);
  const m00=cy*cz,m01=sxv*syv*cz-cx*szv,m02=cx*syv*cz+sxv*szv;
  const m10=cy*szv,m11=sxv*syv*szv+cx*cz,m12=cx*syv*szv-sxv*cz;
  const m20=-syv,m21=sxv*cy,m22=cx*cy;
  return new Float32Array([m00*sx,m01*sx,m02*sx,0,m10*sy,m11*sy,m12*sy,0,m20*sz,m21*sz,m22*sz,0,p[0],p[1],p[2],1]);
}
export function transformPoint(m,p){ const x=p[0],y=p[1],z=p[2],w=m[3]*x+m[7]*y+m[11]*z+m[15]||1; return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w,(m[1]*x+m[5]*y+m[9]*z+m[13])/w,(m[2]*x+m[6]*y+m[10]*z+m[14])/w]; }

function compile(gl,type,src){ const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'shader');return s; }
function program(gl,vs,fs){ const p=gl.createProgram(),v=compile(gl,gl.VERTEX_SHADER,vs),f=compile(gl,gl.FRAGMENT_SHADER,fs);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'program');return p; }
function pushTri(pos,nor,col,a,b,c,na=null,nb=null,nc=null,ca=null,cb=null,cc=null){
  const n=na||norm3(cross3(sub3(b,a),sub3(c,a))); const ns=[na||n,nb||n,nc||n],cs=[ca||[1,1,1],cb||[1,1,1],cc||[1,1,1]];
  [a,b,c].forEach((v,i)=>{pos.push(...v);nor.push(...ns[i]);col.push(...cs[i]);});
}
function pushQuad(pos,nor,col,a,b,c,d,n=null,normals=null){ pushTri(pos,nor,col,a,b,c,normals?.[0]||n,normals?.[1]||n,normals?.[2]||n);pushTri(pos,nor,col,a,c,d,normals?.[0]||n,normals?.[2]||n,normals?.[3]||n); }
function finish(pos,nor,col){ return {positions:new Float32Array(pos),normals:new Float32Array(nor),colors:new Float32Array(col),count:pos.length/3}; }

export function boxGeometry(){
  const p=[],n=[],c=[],a=[-.5,-.5,-.5],b=[.5,-.5,-.5],d=[-.5,.5,-.5],e=[.5,.5,-.5],f=[-.5,-.5,.5],g=[.5,-.5,.5],h=[-.5,.5,.5],i=[.5,.5,.5];
  pushQuad(p,n,c,f,g,i,h,[0,0,1]);pushQuad(p,n,c,b,a,d,e,[0,0,-1]);pushQuad(p,n,c,a,f,h,d,[-1,0,0]);pushQuad(p,n,c,g,b,e,i,[1,0,0]);pushQuad(p,n,c,d,h,i,e,[0,1,0]);pushQuad(p,n,c,a,b,g,f,[0,-1,0]);return finish(p,n,c);
}
export function planeGeometry(size=1,segments=1,heightFn=null){
  const p=[],n=[],c=[];for(let z=0;z<segments;z++)for(let x=0;x<segments;x++){const x0=(x/segments-.5)*size,x1=((x+1)/segments-.5)*size,z0=(z/segments-.5)*size,z1=((z+1)/segments-.5)*size;const y00=heightFn?heightFn(x0,z0):0,y10=heightFn?heightFn(x1,z0):0,y11=heightFn?heightFn(x1,z1):0,y01=heightFn?heightFn(x0,z1):0;pushQuad(p,n,c,[x0,y00,z0],[x1,y10,z0],[x1,y11,z1],[x0,y01,z1]);}return finish(p,n,c);
}
export function cylinderGeometry(segments=12,cap=true){
  const p=[],n=[],c=[];for(let i=0;i<segments;i++){const a=i/segments*TAU,b=(i+1)/segments*TAU,pa=[Math.cos(a)*.5,-.5,Math.sin(a)*.5],pb=[Math.cos(b)*.5,-.5,Math.sin(b)*.5],pc=[Math.cos(b)*.5,.5,Math.sin(b)*.5],pd=[Math.cos(a)*.5,.5,Math.sin(a)*.5],na=[Math.cos(a),0,Math.sin(a)],nb=[Math.cos(b),0,Math.sin(b)];pushQuad(p,n,c,pa,pb,pc,pd,null,[na,nb,nb,na]);if(cap){pushTri(p,n,c,[0,.5,0],pd,pc,[0,1,0],[0,1,0],[0,1,0]);pushTri(p,n,c,[0,-.5,0],pb,pa,[0,-1,0],[0,-1,0],[0,-1,0]);}}return finish(p,n,c);
}
export function coneGeometry(segments=12){
  const p=[],n=[],c=[];for(let i=0;i<segments;i++){const a=i/segments*TAU,b=(i+1)/segments*TAU,pa=[Math.cos(a)*.5,-.5,Math.sin(a)*.5],pb=[Math.cos(b)*.5,-.5,Math.sin(b)*.5],top=[0,.5,0];pushTri(p,n,c,pa,pb,top);pushTri(p,n,c,[0,-.5,0],pb,pa,[0,-1,0],[0,-1,0],[0,-1,0]);}return finish(p,n,c);
}
export function sphereGeometry(lat=8,lon=12){
  const p=[],n=[],c=[];const pt=(a,b)=>{const y=Math.cos(a)*.5,r=Math.sin(a)*.5;return [Math.cos(b)*r,y,Math.sin(b)*r]};for(let y=0;y<lat;y++)for(let x=0;x<lon;x++){const a0=y/lat*Math.PI,a1=(y+1)/lat*Math.PI,b0=x/lon*TAU,b1=(x+1)/lon*TAU,q0=pt(a0,b0),q1=pt(a0,b1),q2=pt(a1,b1),q3=pt(a1,b0);pushQuad(p,n,c,q0,q1,q2,q3,null,[norm3(q0),norm3(q1),norm3(q2),norm3(q3)]);}return finish(p,n,c);
}
export function wedgeGeometry(){
  const p=[],n=[],c=[],a=[-.5,-.5,-.5],b=[.5,-.5,-.5],d=[-.5,-.5,.5],e=[.5,-.5,.5],f=[-.5,.5,-.5],g=[.5,.5,-.5];
  pushQuad(p,n,c,a,b,e,d,[0,-1,0]);pushQuad(p,n,c,a,f,g,b,[0,0,-1]);pushQuad(p,n,c,d,e,g,f);pushTri(p,n,c,a,d,f,[-1,0,0],[-1,0,0],[-1,0,0]);pushTri(p,n,c,b,g,e,[1,0,0],[1,0,0],[1,0,0]);return finish(p,n,c);
}

export class Node {
  constructor({mesh=null,color=[1,1,1],position=[0,0,0],rotation=[0,0,0],scale=[1,1,1],visible=true,emissive=0,alpha=1,roughness=.8,name=''}={}){Object.assign(this,{mesh,color:[...color],position:[...position],rotation:[...rotation],scale:[...scale],visible,emissive,alpha,roughness,name});this.children=[];this.parent=null;this.world=mat4Identity();this.userData={};}
  add(node){node.parent=this;this.children.push(node);return node;}
  remove(node){const i=this.children.indexOf(node);if(i>=0)this.children.splice(i,1);node.parent=null;}
}

export class Renderer {
  constructor(canvas){
    this.canvas=canvas;this.gl=canvas.getContext('webgl',{alpha:false,antialias:true,premultipliedAlpha:false,powerPreference:'high-performance'})||canvas.getContext('experimental-webgl');if(!this.gl)throw new Error('WebGL unavailable');
    const gl=this.gl;this.program=program(gl,`
attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;
uniform mat4 uMVP;uniform mat4 uModel;uniform mat4 uNormal;
varying vec3 vNormal;varying vec3 vWorld;varying vec3 vColor;
void main(){vec4 w=uModel*vec4(aPosition,1.0);vWorld=w.xyz;vNormal=normalize((uNormal*vec4(aNormal,0.0)).xyz);vColor=aColor;gl_Position=uMVP*vec4(aPosition,1.0);}`,
`
precision mediump float;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vColor;
uniform vec3 uColor;uniform vec3 uLightDir;uniform vec3 uFogColor;uniform vec3 uCamera;uniform float uFogNear;uniform float uFogFar;uniform float uEmissive;uniform float uAlpha;uniform float uTime;uniform float uRoughness;
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
void main(){vec3 n=normalize(vNormal);float sun=max(dot(n,normalize(-uLightDir)),0.0);float sky=.44+.28*max(n.y,0.0);float bounce=.12*max(-n.y,0.0);float rim=pow(1.0-max(dot(n,normalize(uCamera-vWorld)),0.0),2.0)*.12;float grain=(hash(floor(vWorld*3.2))-.5)*.11*uRoughness;vec3 base=uColor*vColor*(sky+sun*.62+bounce+rim+grain+uEmissive);float d=distance(vWorld,uCamera);float fog=smoothstep(uFogNear,uFogFar,d);gl_FragColor=vec4(mix(base,uFogColor,fog),uAlpha);}`);
    this.loc={};['aPosition','aNormal','aColor'].forEach(n=>this.loc[n]=gl.getAttribLocation(this.program,n));['uMVP','uModel','uNormal','uColor','uLightDir','uFogColor','uCamera','uFogNear','uFogFar','uEmissive','uAlpha','uTime','uRoughness'].forEach(n=>this.loc[n]=gl.getUniformLocation(this.program,n));
    this.buffers=new WeakMap();this.width=0;this.height=0;this.camera={position:[0,4,12],target:[0,2,0],fov:48*Math.PI/180,near:.1,far:260};this.lightDir=norm3([-.5,-1,-.25]);this.fogColor=[.44,.43,.36];this.fogNear=55;this.fogFar=155;this.clearColor=[.42,.43,.37];this.time=0;
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  }
  prepare(mesh){if(this.buffers.has(mesh))return this.buffers.get(mesh);const gl=this.gl,b={};b.pos=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b.pos);gl.bufferData(gl.ARRAY_BUFFER,mesh.positions,gl.STATIC_DRAW);b.nor=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b.nor);gl.bufferData(gl.ARRAY_BUFFER,mesh.normals,gl.STATIC_DRAW);b.col=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b.col);gl.bufferData(gl.ARRAY_BUFFER,mesh.colors,gl.STATIC_DRAW);b.count=mesh.count;this.buffers.set(mesh,b);return b;}
  resize(){const dpr=Math.min(window.devicePixelRatio||1,1.65),w=Math.max(1,Math.floor(this.canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(this.canvas.clientHeight*dpr));if(w!==this.width||h!==this.height){this.width=w;this.height=h;this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h);}}
  updateWorld(node,parent=mat4Identity()){node.world=mat4Multiply(parent,mat4Compose(node.position,node.rotation,node.scale));for(const child of node.children)this.updateWorld(child,node.world);}
  render(root){
    this.resize();const gl=this.gl;gl.clearColor(...this.clearColor,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);const view=mat4LookAt(this.camera.position,this.camera.target),proj=mat4Perspective(this.camera.fov,this.width/this.height,this.camera.near,this.camera.far),vp=mat4Multiply(proj,view);this.viewProjection=vp;this.updateWorld(root);
    gl.uniform3fv(this.loc.uLightDir,this.lightDir);gl.uniform3fv(this.loc.uFogColor,this.fogColor);gl.uniform3fv(this.loc.uCamera,this.camera.position);gl.uniform1f(this.loc.uFogNear,this.fogNear);gl.uniform1f(this.loc.uFogFar,this.fogFar);gl.uniform1f(this.loc.uTime,this.time);
    const opaque=[],transparent=[];const collect=n=>{if(n.visible&&n.mesh)(n.alpha<.999?transparent:opaque).push(n);for(const c of n.children)collect(c)};collect(root);transparent.sort((a,b)=>len3(sub3(b.position,this.camera.position))-len3(sub3(a.position,this.camera.position)));
    for(const n of [...opaque,...transparent])this.drawNode(n,vp);
  }
  drawNode(n,vp){const gl=this.gl,b=this.prepare(n.mesh),mvp=mat4Multiply(vp,n.world);if(n.alpha<.999){gl.enable(gl.BLEND);gl.depthMask(false)}else{gl.disable(gl.BLEND);gl.depthMask(true)}gl.uniformMatrix4fv(this.loc.uMVP,false,mvp);gl.uniformMatrix4fv(this.loc.uModel,false,n.world);gl.uniformMatrix4fv(this.loc.uNormal,false,n.world);gl.uniform3fv(this.loc.uColor,n.color);gl.uniform1f(this.loc.uEmissive,n.emissive);gl.uniform1f(this.loc.uAlpha,n.alpha);gl.uniform1f(this.loc.uRoughness,n.roughness);
    gl.bindBuffer(gl.ARRAY_BUFFER,b.pos);gl.enableVertexAttribArray(this.loc.aPosition);gl.vertexAttribPointer(this.loc.aPosition,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,b.nor);gl.enableVertexAttribArray(this.loc.aNormal);gl.vertexAttribPointer(this.loc.aNormal,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,b.col);gl.enableVertexAttribArray(this.loc.aColor);gl.vertexAttribPointer(this.loc.aColor,3,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,b.count);if(n.alpha<.999){gl.depthMask(true);gl.disable(gl.BLEND)}}
  project(point){if(!this.viewProjection)return null;const p=transformPoint(this.viewProjection,point);return {x:(p[0]*.5+.5)*this.canvas.clientWidth,y:(-.5*p[1]+.5)*this.canvas.clientHeight,z:p[2]};}
}
