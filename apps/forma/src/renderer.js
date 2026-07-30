import { combineBounds } from './mesher.js';

const VERT = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform mat3 uNormal;
varying vec3 vNormal;
varying vec3 vWorld;
void main(){
  vec4 world=uModel*vec4(aPosition,1.0);
  vWorld=world.xyz;
  vNormal=normalize(uNormal*aNormal);
  gl_Position=uMVP*vec4(aPosition,1.0);
}`;
const FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uLight;
uniform float uSelected;
varying vec3 vNormal;
varying vec3 vWorld;
void main(){
  vec3 n=normalize(vNormal);
  float diffuse=max(dot(n,normalize(uLight)),0.0);
  float rim=pow(1.0-max(dot(n,normalize(vec3(0.25,-0.45,0.86))),0.0),2.0);
  vec3 base=uColor*(0.34+0.66*diffuse)+vec3(0.12)*rim;
  base=mix(base,vec3(1.0,0.62,0.10),uSelected*0.22);
  gl_FragColor=vec4(base,1.0);
}`;
const LINE_VERT = `attribute vec3 aPosition;uniform mat4 uMVP;void main(){gl_Position=uMVP*vec4(aPosition,1.0);}`;
const LINE_FRAG = `precision mediump float;uniform vec4 uColor;void main(){gl_FragColor=uColor;}`;

export class FormaRenderer {
  constructor(canvas, { onInteraction } = {}) {
    this.canvas=canvas; this.gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true}) || canvas.getContext('experimental-webgl');
    if(!this.gl) throw new Error('WebGL недоступен на этом устройстве.');
    this.onInteraction=onInteraction;
    this.meshes=[]; this.resources=[]; this.selectedId=null; this.wireframe=false; this.autoRotate=false;
    this.target=[0,0,0]; this.yaw=-0.72; this.pitch=0.72; this.distance=120; this.minDistance=8; this.maxDistance=4000;
    this.pointers=new Map(); this.lastPinch=0; this.lastCenter=null; this.dirty=true; this.running=true; this.lastTime=performance.now();
    this.program=createProgram(this.gl,VERT,FRAG); this.lineProgram=createProgram(this.gl,LINE_VERT,LINE_FRAG);
    this.locations={
      pos:this.gl.getAttribLocation(this.program,'aPosition'),normal:this.gl.getAttribLocation(this.program,'aNormal'),mvp:this.gl.getUniformLocation(this.program,'uMVP'),model:this.gl.getUniformLocation(this.program,'uModel'),normalM:this.gl.getUniformLocation(this.program,'uNormal'),color:this.gl.getUniformLocation(this.program,'uColor'),light:this.gl.getUniformLocation(this.program,'uLight'),selected:this.gl.getUniformLocation(this.program,'uSelected')
    };
    this.lineLocations={pos:this.gl.getAttribLocation(this.lineProgram,'aPosition'),mvp:this.gl.getUniformLocation(this.lineProgram,'uMVP'),color:this.gl.getUniformLocation(this.lineProgram,'uColor')};
    this.grid=createGrid(this.gl);
    this.resizeObserver=new ResizeObserver(()=>this.resize()); this.resizeObserver.observe(canvas);
    this.bindControls(); this.resize(); requestAnimationFrame(t=>this.frame(t));
  }
  destroy(){this.running=false;this.resizeObserver.disconnect();}
  setMeshes(meshes){this.disposeResources();this.meshes=meshes||[];this.resources=this.meshes.map(mesh=>uploadMesh(this.gl,mesh));this.fit();this.dirty=true;}
  updateMeshVisibility(id,visible){const m=this.meshes.find(x=>x.id===id);if(m)m.visible=visible;this.dirty=true;}
  updateMeshColor(id,color){const m=this.meshes.find(x=>x.id===id);if(m)m.color=color;this.dirty=true;}
  setSelected(id){this.selectedId=id;this.dirty=true;}
  setWireframe(value){this.wireframe=Boolean(value);this.dirty=true;}
  setAutoRotate(value){this.autoRotate=Boolean(value);this.dirty=true;}
  fit(){const b=combineBounds(this.meshes);this.target=b.center.slice();const radius=Math.max(...b.size,10)*0.65;this.distance=radius/Math.tan(35*Math.PI/180)+radius;this.minDistance=Math.max(4,radius*0.25);this.maxDistance=Math.max(200,this.distance*12);this.dirty=true;}
  viewPreset(name){if(name==='front'){this.yaw=0;this.pitch=Math.PI/2;}else if(name==='top'){this.yaw=0;this.pitch=0.001;}else if(name==='right'){this.yaw=-Math.PI/2;this.pitch=Math.PI/2;}else{this.yaw=-0.72;this.pitch=0.72;}this.dirty=true;}
  screenshot(){return new Promise(resolve=>this.canvas.toBlob(resolve,'image/png'));}
  disposeResources(){const gl=this.gl;for(const r of this.resources){gl.deleteBuffer(r.position);gl.deleteBuffer(r.normal);gl.deleteBuffer(r.index);gl.deleteBuffer(r.edges);}this.resources=[];}
  resize(){const dpr=Math.min(devicePixelRatio||1,2);const w=Math.max(1,Math.round(this.canvas.clientWidth*dpr));const h=Math.max(1,Math.round(this.canvas.clientHeight*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.dirty=true;}}
  bindControls(){const c=this.canvas;
    c.addEventListener('contextmenu',e=>e.preventDefault());
    c.addEventListener('pointerdown',e=>{c.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,px:e.clientX,py:e.clientY});this.autoRotate=false;this.onInteraction?.();});
    c.addEventListener('pointermove',e=>{const p=this.pointers.get(e.pointerId);if(!p)return;p.px=p.x;p.py=p.y;p.x=e.clientX;p.y=e.clientY;const ps=[...this.pointers.values()];if(ps.length===1){this.yaw-= (p.x-p.px)*0.009;this.pitch=clamp(this.pitch-(p.y-p.py)*0.009,0.03,Math.PI-0.03);}else if(ps.length>=2){const a=ps[0],b=ps[1];const dist=Math.hypot(a.x-b.x,a.y-b.y);const center=[(a.x+b.x)/2,(a.y+b.y)/2];if(this.lastPinch){this.distance=clamp(this.distance*(this.lastPinch/dist),this.minDistance,this.maxDistance);}if(this.lastCenter){const dx=center[0]-this.lastCenter[0],dy=center[1]-this.lastCenter[1];this.pan(dx,dy);}this.lastPinch=dist;this.lastCenter=center;}this.dirty=true;});
    const end=e=>{this.pointers.delete(e.pointerId);if(this.pointers.size<2){this.lastPinch=0;this.lastCenter=null;}this.dirty=true;};c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
    c.addEventListener('wheel',e=>{e.preventDefault();this.distance=clamp(this.distance*Math.exp(e.deltaY*0.001),this.minDistance,this.maxDistance);this.dirty=true;},{passive:false});
  }
  pan(dx,dy){const scale=this.distance/Math.max(300,this.canvas.clientHeight)*1.15;const eye=this.eye();const forward=normalize(sub(this.target,eye));const right=normalize(cross(forward,[0,0,1]));const up=normalize(cross(right,forward));for(let i=0;i<3;i++)this.target[i]+=(-dx*right[i]+dy*up[i])*scale;}
  eye(){const s=Math.sin(this.pitch);return [this.target[0]+this.distance*s*Math.cos(this.yaw),this.target[1]+this.distance*s*Math.sin(this.yaw),this.target[2]+this.distance*Math.cos(this.pitch)];}
  frame(time){if(!this.running)return;const dt=Math.min(0.05,(time-this.lastTime)/1000);this.lastTime=time;if(this.autoRotate&&!document.hidden){this.yaw+=dt*0.35;this.dirty=true;}if(this.dirty&&!document.hidden)this.draw();requestAnimationFrame(t=>this.frame(t));}
  draw(){this.dirty=false;const gl=this.gl;this.resize();gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0.925,0.914,0.875,1);gl.clearDepth(1);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const aspect=this.canvas.width/this.canvas.height;const proj=perspective(45*Math.PI/180,aspect,Math.max(0.05,this.distance/1500),this.distance*20+5000);const view=lookAt(this.eye(),this.target,[0,0,1]);const model=identity();const vp=multiply(proj,view);const mvp=multiply(vp,model);
    this.drawGrid(mvp);
    gl.useProgram(this.program);gl.uniformMatrix4fv(this.locations.mvp,false,mvp);gl.uniformMatrix4fv(this.locations.model,false,model);gl.uniformMatrix3fv(this.locations.normalM,false,new Float32Array([1,0,0,0,1,0,0,0,1]));gl.uniform3f(this.locations.light,-0.35,-0.45,0.82);
    for(let i=0;i<this.meshes.length;i++){const mesh=this.meshes[i],r=this.resources[i];if(mesh.visible===false||!mesh.indices.length)continue;const rgb=hexRgb(mesh.color);gl.uniform3f(this.locations.color,rgb[0],rgb[1],rgb[2]);gl.uniform1f(this.locations.selected,mesh.id===this.selectedId?1:0);gl.bindBuffer(gl.ARRAY_BUFFER,r.position);gl.enableVertexAttribArray(this.locations.pos);gl.vertexAttribPointer(this.locations.pos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,r.normal);gl.enableVertexAttribArray(this.locations.normal);gl.vertexAttribPointer(this.locations.normal,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,r.index);gl.drawElements(gl.TRIANGLES,r.count,r.indexType,0);}
    if(this.wireframe){gl.disable(gl.CULL_FACE);gl.useProgram(this.lineProgram);gl.uniformMatrix4fv(this.lineLocations.mvp,false,mvp);gl.uniform4f(this.lineLocations.color,0.12,0.12,0.11,0.35);for(let i=0;i<this.meshes.length;i++){const mesh=this.meshes[i],r=this.resources[i];if(mesh.visible===false||!r.edgeCount)continue;gl.bindBuffer(gl.ARRAY_BUFFER,r.position);gl.enableVertexAttribArray(this.lineLocations.pos);gl.vertexAttribPointer(this.lineLocations.pos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,r.edges);gl.drawElements(gl.LINES,r.edgeCount,r.indexType,0);}gl.enable(gl.CULL_FACE);}
  }
  drawGrid(mvp){const gl=this.gl;gl.useProgram(this.lineProgram);gl.uniformMatrix4fv(this.lineLocations.mvp,false,mvp);gl.bindBuffer(gl.ARRAY_BUFFER,this.grid.buffer);gl.enableVertexAttribArray(this.lineLocations.pos);gl.vertexAttribPointer(this.lineLocations.pos,3,gl.FLOAT,false,0,0);gl.uniform4f(this.lineLocations.color,0.24,0.25,0.22,0.28);gl.drawArrays(gl.LINES,0,this.grid.minor);gl.uniform4f(this.lineLocations.color,0.12,0.13,0.11,0.48);gl.drawArrays(gl.LINES,this.grid.minor,this.grid.major);}
}

function uploadMesh(gl,mesh){const position=buffer(gl,gl.ARRAY_BUFFER,mesh.positions);const normal=buffer(gl,gl.ARRAY_BUFFER,mesh.normals);const maxIndex=mesh.positions.length/3;const use32=maxIndex>65535;const idx=use32?mesh.indices:new Uint16Array(mesh.indices);if(use32&&!gl.getExtension('OES_element_index_uint'))throw new Error('Модель слишком детальная для этого WebGL-устройства. Снизьте детализацию.');const index=buffer(gl,gl.ELEMENT_ARRAY_BUFFER,idx);const edgeList=[];const seen=new Set();for(let i=0;i<mesh.indices.length;i+=3){for(const [a,b] of [[mesh.indices[i],mesh.indices[i+1]],[mesh.indices[i+1],mesh.indices[i+2]],[mesh.indices[i+2],mesh.indices[i]]]){const x=Math.min(a,b),y=Math.max(a,b),k=x+':'+y;if(!seen.has(k)){seen.add(k);edgeList.push(x,y);}}}const edgesData=use32?new Uint32Array(edgeList):new Uint16Array(edgeList);const edges=buffer(gl,gl.ELEMENT_ARRAY_BUFFER,edgesData);return{position,normal,index,edges,count:idx.length,edgeCount:edgesData.length,indexType:use32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT};}
function buffer(gl,target,data){const b=gl.createBuffer();gl.bindBuffer(target,b);gl.bufferData(target,data,gl.STATIC_DRAW);return b;}
function createGrid(gl){const minor=[],major=[];const half=120;for(let i=-half;i<=half;i+=10){const dst=i%50===0?major:minor;dst.push(-half,i,0,half,i,0,i,-half,0,i,half,0);}const data=new Float32Array([...minor,...major]);return{buffer:buffer(gl,gl.ARRAY_BUFFER,data),minor:minor.length/3,major:major.length/3};}
function createProgram(gl,v,f){const vs=shader(gl,gl.VERTEX_SHADER,v),fs=shader(gl,gl.FRAGMENT_SHADER,f),p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
function shader(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));const sub=(a,b)=>a.map((v,i)=>v-b[i]);const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const normalize=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)};
function identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
function lookAt(eye,target,up){const z=normalize(sub(eye,target)),x=normalize(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function hexRgb(hex){const n=parseInt(String(hex).replace('#',''),16)||0xcccccc;return[((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];}
