import { edgeCameraFit } from './edge-layout.js';
import { makeFloorWithHole, makeFrameWithOpening, makePerimeterHardware, makeSphere, makeTorus, makeUnifiedWalls, makeWell } from './render-geometry.js';
import { marbleModelMatrix, sampleGoalCapture } from './marble-motion.js';
import {
  VERTEX_SOURCE, OPAQUE_FRAGMENT_SOURCE, GLASS_FRAGMENT_SOURCE,
  DEPTH_VERTEX_SOURCE, DEPTH_FRAGMENT_SOURCE,
  BLIT_VERTEX_SOURCE, BLIT_FRAGMENT_SOURCE, chooseOpticalProfile
} from './render-materials.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

function translation(x,y,z) {
  const out = new Float32Array(IDENTITY);
  out[12]=x; out[13]=y; out[14]=z;
  return out;
}
function multiply(a,b) {
  const out=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++)
    for(let k=0;k<4;k++) out[c*4+r]+=a[k*4+r]*b[c*4+k];
  return out;
}
function normalize(v) {
  const d=Math.hypot(...v)||1;
  return v.map(n=>n/d);
}
function cross(a,b) {return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dot(a,b) {return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function lookAt(eye,target,up) {
  const z=normalize(eye.map((v,i)=>v-target[i]));
  const x=normalize(cross(up,z)), y=cross(z,x);
  return new Float32Array([
    x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
    -dot(x,eye),-dot(y,eye),-dot(z,eye),1
  ]);
}
function perspective(fov,aspect,near,far) {
  const f=1/Math.tan(fov/2);
  return new Float32Array([
    f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)/(near-far),-1,
    0,0,2*far*near/(near-far),0
  ]);
}
function orthographic(extent,near,far) {
  return new Float32Array([
    1/extent,0,0,0, 0,1/extent,0,0, 0,0,-2/(far-near),0,
    0,0,-(far+near)/(far-near),1
  ]);
}
function shader(gl,type,source) {
  const sh=gl.createShader(type);
  gl.shaderSource(sh,source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) {
    const reason=gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('ОТВЕС WebGL shader: '+reason);
  }
  return sh;
}
function program(gl,vert,frag) {
  const result=gl.createProgram();
  const vs=shader(gl,gl.VERTEX_SHADER,vert);
  const fs=shader(gl,gl.FRAGMENT_SHADER,frag);
  gl.attachShader(result,vs); gl.attachShader(result,fs);
  gl.linkProgram(result);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(result,gl.LINK_STATUS)) {
    const reason=gl.getProgramInfoLog(result);
    gl.deleteProgram(result);
    throw new Error('ОТВЕС WebGL program: '+reason);
  }
  return result;
}
function upload(gl,data) {
  const vao=gl.createVertexArray();
  const buffers=[];
  gl.bindVertexArray(vao);
  for(const [slot,values] of [[0,data.positions],[1,data.normals]]) {
    const b=gl.createBuffer();
    buffers.push(b);
    gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(slot);
    gl.vertexAttribPointer(slot,3,gl.FLOAT,false,0,0);
  }
  const indices=gl.createBuffer();
  buffers.push(indices);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return {
    vao,buffers,count:data.indices.length,
    dispose() {
      gl.deleteVertexArray(vao);
      for(const buffer of buffers) gl.deleteBuffer(buffer);
    }
  };
}
function commonUniforms(gl,p) {
  const get=(name)=>gl.getUniformLocation(p,name);
  return {
    vp:get('uVP'),model:get('uModel'),light:get('uLightVP'),
    eye:get('uEye'),direction:get('uLightDirection'),
    shadow:get('uShadowMap'),hasShadows:get('uHasShadows'),
    surface:get('uSurface'),scene:get('uSceneColor'),
    viewport:get('uViewport'),refraction:get('uUseRefraction'),
    glassType:get('uGlassType'),impact:get('uImpact')
  };
}

// Two color targets share the SAME opaque depth renderbuffer:
//   scene A = opaque surfaces (sample only)
//   scene B = A copied once, then refractive ball and translucent glass drawn
// Sharing the depth attachment means walls behind a marble cannot falsely
// render on top of it, and there is no invalid multisample default-FBO blit.
function makeOpticalTargets(gl,width,height) {
  const colors=[],fbos=[];
  let depth=null;
  try {
    depth=gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER,depth);
    gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,width,height);
    for(let i=0;i<2;i++) {
      const color=gl.createTexture();
      colors.push(color);
      gl.bindTexture(gl.TEXTURE_2D,color);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      const fbo=gl.createFramebuffer();
      fbos.push(fbo);
      gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Optical FBO incomplete');
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.bindTexture(gl.TEXTURE_2D,null);
    gl.bindRenderbuffer(gl.RENDERBUFFER,null);
    return {
      opaqueFbo:fbos[0],compositeFbo:fbos[1],scene:colors[0],composite:colors[1],
      dispose() {
        for(const fbo of fbos) gl.deleteFramebuffer(fbo);
        for(const color of colors) gl.deleteTexture(color);
        gl.deleteRenderbuffer(depth);
      }
    };
  } catch(error) {
    for(const fbo of fbos) gl.deleteFramebuffer(fbo);
    for(const color of colors) gl.deleteTexture(color);
    if(depth) gl.deleteRenderbuffer(depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.bindTexture(gl.TEXTURE_2D,null);
    gl.bindRenderbuffer(gl.RENDERBUFFER,null);
    console.warn('ОТВЕС: refraction target unavailable',error);
    return null;
  }
}

export class SpatialMazeRenderer {
  constructor(canvas) {
    this.canvas=canvas;
    this.gl=canvas.getContext('webgl2',{
      alpha:false,depth:true,antialias:true,powerPreference:'high-performance',
      preserveDrawingBuffer:false
    });
    if(!this.gl) throw new Error('WebGL2 unavailable');
    this.width=1;this.height=1;
    this.maze=null;
    this.meshes=[];
    this.ballMesh=null;
    this.reducedMotion=false;
    this.lost=false;
    this.canvas.addEventListener('webglcontextlost',(event)=>{
      event.preventDefault();
      this.lost=true;
    });
    this.canvas.addEventListener('webglcontextrestored',()=>{
      this.lost=false;
      this.meshes=[];
      this.ballMesh=null;
      this.maze=null;
      this.targets=null;
      this.shadowFramebuffer=null;
      this.shadowTexture=null;
      try {
        this.init();
        this.resize();
      } catch(error) {
        console.error('ОТВЕС: 3D restoration failed; keeping 2D mode',error);
        this.lost=true;
      }
    });
    this.init();
    this.resize();
  }

  get isReady() { return !this.lost; }
  setReducedMotion(value) { this.reducedMotion=Boolean(value); }

  init() {
    const gl=this.gl;
    this.opaque=program(gl,VERTEX_SOURCE,OPAQUE_FRAGMENT_SOURCE);
    this.glass=program(gl,VERTEX_SOURCE,GLASS_FRAGMENT_SOURCE);
    this.depth=program(gl,DEPTH_VERTEX_SOURCE,DEPTH_FRAGMENT_SOURCE);
    this.blit=program(gl,BLIT_VERTEX_SOURCE,BLIT_FRAGMENT_SOURCE);
    this.opaqueU=commonUniforms(gl,this.opaque);
    this.glassU=commonUniforms(gl,this.glass);
    this.depthU={
      model:gl.getUniformLocation(this.depth,'uModel'),
      light:gl.getUniformLocation(this.depth,'uLightVP')
    };
    this.blitTexture=gl.getUniformLocation(this.blit,'uTexture');
    this.blitVao=gl.createVertexArray();
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.clearColor(.033,.053,.042,1.0);
    this.maxTarget=Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.MAX_TEXTURE_SIZE));
    this.targets=null;
    this.shadowTexture=null;
    this.shadowFramebuffer=null;
    this.shadowSize=0;
  }

  makeShadowTarget(size) {
    if(this.shadowSize===size) return;
    const gl=this.gl;
    this.disposeShadow();
    if(!size) return;
    const texture=gl.createTexture();
    const fb=gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,size,size,0,
      gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,texture,0);
    gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
    const complete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.bindTexture(gl.TEXTURE_2D,null);
    if(!complete) {
      gl.deleteFramebuffer(fb);gl.deleteTexture(texture);
      console.warn('ОТВЕС: depth shadow FBO unavailable');
      return;
    }
    this.shadowFramebuffer=fb;
    this.shadowTexture=texture;
    this.shadowSize=size;
  }

  disposeShadow() {
    const gl=this.gl;
    if(this.shadowFramebuffer) gl.deleteFramebuffer(this.shadowFramebuffer);
    if(this.shadowTexture) gl.deleteTexture(this.shadowTexture);
    this.shadowFramebuffer=null;
    this.shadowTexture=null;
    this.shadowSize=0;
  }

  resize() {
    if(this.lost) return;
    const gl=this.gl;
    const bounds=this.canvas.getBoundingClientRect();
    this.width=Math.max(1,bounds.width);
    this.height=Math.max(1,bounds.height);
    const profile=chooseOpticalProfile({
      width:this.width,height:this.height,
      dpr:window.devicePixelRatio||1,
      maxTextureSize:this.maxTarget,
      deviceMemory:navigator.deviceMemory??6,
      hardwareConcurrency:navigator.hardwareConcurrency??6,
      reducedMotion:this.reducedMotion
    });
    // Keep both the screen buffer and auxiliary textures within GPU limits.
    const dpr=Math.min(profile.pixelRatio,
      this.maxTarget/this.width,this.maxTarget/this.height);
    const w=Math.max(1,Math.round(this.width*dpr));
    const h=Math.max(1,Math.round(this.height*dpr));
    const different=w!==this.canvas.width||h!==this.canvas.height;
    if(different) {
      this.canvas.width=w;
      this.canvas.height=h;
    }
    this.pixelWidth=w;this.pixelHeight=h;
    this.profile=profile;
    if(this.targets && (different || !profile.refraction)) {
      this.targets.dispose();
      this.targets=null;
    }
    if(profile.refraction && !this.targets) {
      this.targets=makeOpticalTargets(gl,w,h);
      if(!this.targets) this.profile={...profile,refraction:false,level:'balanced'};
    }
    this.makeShadowTarget(Math.min(this.profile.shadowSize,this.maxTarget));
    this.canvas.dataset.renderProfile = this.profile.level;
    this.canvas.dataset.opticalRefraction = String(Boolean(this.targets && this.profile.refraction));
    gl.viewport(0,0,w,h);
  }

  clearMeshes() {
    for(const item of this.meshes) item.mesh.dispose();
    this.meshes=[];
    this.ballMesh?.dispose();
    this.ballMesh=null;
  }

  rebuild(maze) {
    this.clearMeshes();
    this.maze=maze;
    const gl=this.gl;
    const add=(data,surface,model=IDENTITY,castsShadow=false)=> {
      this.meshes.push({mesh:upload(gl,data),surface,model,castsShadow});
    };
    for (const slab of makeFrameWithOpening(maze.cols,maze.rows,maze.goal)) add(slab,5);
    add(makeFloorWithHole(maze.cols,maze.rows,maze.goal),0);
    add(makeWell(maze.goal.x,maze.goal.y),4);
    // The dark seal physically seats the glass in the ceramic, while the fine
    // metal edge sits within the walls rather than making a new outer frame.
    add(makeUnifiedWalls(maze.walls,.038),7);
    add(makeUnifiedWalls(maze.walls,.46),1,IDENTITY,true);
    for (const rail of makePerimeterHardware(maze.cols,maze.rows)) add(rail,6);
    add(makeTorus(.396,.040),3,translation(maze.goal.x,.008,maze.goal.y));
    add(makeTorus(.305,.008),3,translation(maze.start.x,.013,maze.start.y));
    this.ballMesh=upload(gl,makeSphere());
  }

  configureCamera(maze,visualTilt={x:0,y:0}) {
    // A screen-height-specific maze is generated by dimensionsForLevel.
    // Zero board margins: camera glances only 8° into the case, allowing
    // the phone's own black bezel to visually close the outer glass walls.
    const fit=edgeCameraFit(maze.cols,maze.rows,this.width,this.height);
    const cx=maze.cols/2,cz=maze.rows/2;
    const distance=Math.max(maze.cols,maze.rows)*1.6+3;
    const eye=[cx,distance,cz+distance*fit.pitchSlope];
    this.cameraVP=multiply(
      new Float32Array([
        1/fit.halfX,0,0,0, 0,1/fit.halfY,0,0,
        0,0,-2/(distance*5-.05),0,
        0,0,-(distance*5+.05)/(distance*5-.05),1
      ]),
      lookAt(eye,[cx,0,cz],[0,0,-1])
    );
    this.cameraEye=eye;
    this.cameraFit=fit;
    this.canvas.dataset.edgeMode=fit.fullBleed?'full':'safe-fit';
    const size=Math.max(maze.cols,maze.rows)+4;
    // The camera never wobbles. Only light and glass reflections react to
    // motion, like a sealed instrument with an air gap below its cover.
    const drift=this.reducedMotion?0:.12;
    const dx=clamp(visualTilt?.x||0,-1,1)*drift;
    const dz=clamp(visualTilt?.y||0,-1,1)*drift;
    const source=[cx-size*(.50-dx*.28),size*1.15,cz-size*(.55-dz*.28)];
    this.lightVP=multiply(orthographic(size*.95,.1,size*4),
      lookAt(source,[cx,0,cz],[0,0,-1]));
    this.lightDirection=normalize([-.49+dx,1.15,-.54+dz]);
  }

  renderShadow(ballModel) {
    if(!this.shadowFramebuffer) return;
    const gl=this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);
    gl.viewport(0,0,this.shadowSize,this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.colorMask(false,false,false,false);
    gl.useProgram(this.depth);
    gl.uniformMatrix4fv(this.depthU.light,false,this.lightVP);
    for(const item of this.meshes) {
      if(!item.castsShadow) continue;
      gl.uniformMatrix4fv(this.depthU.model,false,item.model);
      gl.bindVertexArray(item.mesh.vao);
      gl.drawElements(gl.TRIANGLES,item.mesh.count,gl.UNSIGNED_INT,0);
    }
    gl.uniformMatrix4fv(this.depthU.model,false,ballModel);
    gl.bindVertexArray(this.ballMesh.vao);
    gl.drawElements(gl.TRIANGLES,this.ballMesh.count,gl.UNSIGNED_INT,0);
    gl.bindVertexArray(null);
    gl.colorMask(true,true,true,true);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.viewport(0,0,this.pixelWidth,this.pixelHeight);
  }

  prepareProgram(p,u) {
    const gl=this.gl;
    gl.useProgram(p);
    gl.uniformMatrix4fv(u.vp,false,this.cameraVP);
    gl.uniformMatrix4fv(u.light,false,this.lightVP);
    gl.uniform3fv(u.eye,this.cameraEye);
    gl.uniform3fv(u.direction,this.lightDirection);
    gl.uniform1i(u.hasShadows,this.shadowTexture?1:0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);
    gl.uniform1i(u.shadow,0);
  }

  renderOpaque() {
    const gl=this.gl;
    this.prepareProgram(this.opaque,this.opaqueU);
    for(const item of this.meshes) {
      if(item.surface===1) continue; // refractive ribs never write opaque depth
      gl.uniform1i(this.opaqueU.surface,item.surface);
      gl.uniformMatrix4fv(this.opaqueU.model,false,item.model);
      gl.bindVertexArray(item.mesh.vao);
      gl.drawElements(gl.TRIANGLES,item.mesh.count,gl.UNSIGNED_INT,0);
    }
  }

  renderGlass(ballModel,impact=0) {
    const gl=this.gl;
    this.prepareProgram(this.glass,this.glassU);
    const refract=Boolean(this.targets&&this.profile.refraction);
    gl.uniform1i(this.glassU.refraction,refract?1:0);
    gl.uniform2f(this.glassU.viewport,this.pixelWidth,this.pixelHeight);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,refract?this.targets.scene:null);
    gl.uniform1i(this.glassU.scene,1);
    gl.uniform1i(this.glassU.glassType,2);
    gl.uniform1f(this.glassU.impact,clamp(impact,0,1));
    gl.uniformMatrix4fv(this.glassU.model,false,ballModel);
    gl.bindVertexArray(this.ballMesh.vao);
    gl.drawElements(gl.TRIANGLES,this.ballMesh.count,gl.UNSIGNED_INT,0);

    // Draw walls after the marble: depth test rejects walls behind the ball.
    // For front faces alpha composition preserves visibility through the ribs.
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(this.glassU.glassType,1);
    gl.uniform1f(this.glassU.impact,0);
    for(const item of this.meshes) {
      if(item.surface!==1) continue;
      gl.uniformMatrix4fv(this.glassU.model,false,item.model);
      gl.bindVertexArray(item.mesh.vao);
      gl.drawElements(gl.TRIANGLES,item.mesh.count,gl.UNSIGNED_INT,0);
    }
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,null);
    gl.activeTexture(gl.TEXTURE0);
  }

  draw({maze,marble,completion=0,mode='playing',goalCapture=null,visualTilt={x:0,y:0}}) {
    if(!maze||this.lost) return;
    if(this.maze!==maze) this.rebuild(maze);
    this.configureCamera(maze,visualTilt);
    const gl=this.gl;
    const capture=goalCapture && (mode==='finishing'||mode==='complete')
      ? sampleGoalCapture(goalCapture,completion) : null;
    const pose=capture||{
      position:{x:marble.position.x,y:marble.radius,z:marble.position.y},
      rotation:marble.orientation||[0,0,0,1]
    };
    const ballModel=marbleModelMatrix(pose.position,pose.rotation);
    const impact=capture?0:marble.impact;
    this.renderShadow(ballModel);
    if(this.targets&&this.profile.refraction) {
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets.opaqueFbo);
      gl.viewport(0,0,this.pixelWidth,this.pixelHeight);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      this.renderOpaque();
      // A -> B only color; depth is shared and not copied to the default MSAA FBO.
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.targets.opaqueFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.targets.compositeFbo);
      gl.blitFramebuffer(0,0,this.pixelWidth,this.pixelHeight,
        0,0,this.pixelWidth,this.pixelHeight,gl.COLOR_BUFFER_BIT,gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets.compositeFbo);
      this.renderGlass(ballModel,impact);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,this.pixelWidth,this.pixelHeight);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.blit);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D,this.targets.composite);
      gl.uniform1i(this.blitTexture,0);
      gl.bindVertexArray(this.blitVao);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D,null);
      gl.enable(gl.DEPTH_TEST);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,this.pixelWidth,this.pixelHeight);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      this.renderOpaque();
      this.renderGlass(ballModel,impact);
    }
  }
}
