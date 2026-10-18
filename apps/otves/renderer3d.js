import { makeBox, makeFloorWithHole, makeSphere, makeTorus, makeUnifiedWalls, makeWell } from './render-geometry.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

function translation(x, y, z) {
  const result = new Float32Array(IDENTITY);
  result[12] = x; result[13] = y; result[14] = z;
  return result;
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[col*4+row] += a[k*4+row] * b[col*4+k];
    }
  }
  return out;
}

function normalize(v) {
  const len = Math.hypot(...v) || 1;
  return v.map((n) => n / len);
}
function cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
function dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function lookAt(eye, target, up) {
  const z = normalize(eye.map((v,i) => v-target[i]));
  const x = normalize(cross(up,z));
  const y = cross(z,x);
  return new Float32Array([
    x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
    -dot(x,eye),-dot(y,eye),-dot(z,eye),1
  ]);
}
function perspective(fov,aspect,near,far) {
  const f = 1/Math.tan(fov/2);
  return new Float32Array([
    f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)/(near-far),-1,
    0,0,2*far*near/(near-far),0
  ]);
}
function orthographic(extent,near,far) {
  const l=-extent, r=extent, b=-extent, t=extent;
  return new Float32Array([
    2/(r-l),0,0,0, 0,2/(t-b),0,0, 0,0,-2/(far-near),0,
    -(r+l)/(r-l),-(t+b)/(t-b),-(far+near)/(far-near),1
  ]);
}

const VERTEX_SOURCE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uVP;
uniform mat4 uLightVP;
out vec3 vPosition;
out vec3 vNormal;
out vec4 vLightSpace;
void main() {
  vec4 world = uModel * vec4(aPosition,1.0);
  vPosition = world.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vLightSpace = uLightVP * world;
  gl_Position = uVP * world;
}`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec4 vLightSpace;
uniform vec3 uEye;
uniform vec3 uLightDirection;
uniform sampler2D uShadowMap;
uniform bool uHasShadows;
uniform int uSurface;
out vec4 outColor;

float shadowFactor(vec3 normal) {
  if (!uHasShadows) return 1.0;
  vec3 projected = vLightSpace.xyz / vLightSpace.w * 0.5 + 0.5;
  if (projected.x <= 0.0 || projected.x >= 1.0 || projected.y <= 0.0 ||
      projected.y >= 1.0 || projected.z <= 0.0 || projected.z >= 1.0) return 1.0;
  float bias = max(0.0010,0.0030*(1.0-max(dot(normal,uLightDirection),0.0)));
  vec2 texel = 1.0 / vec2(textureSize(uShadowMap,0));
  float total = 0.0;
  for (int x=0; x<2; x++) {
    for (int y=0; y<2; y++) {
      float depth = texture(uShadowMap,projected.xy + (vec2(float(x),float(y))-.5)*texel).r;
      total += (projected.z-bias <= depth) ? 1.0 : 0.0;
    }
  }
  return mix(0.36,1.0,total*0.25);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uEye-vPosition);
  float lambert = max(dot(N,uLightDirection),0.0);
  float edge = pow(1.0-max(dot(N,V),0.0),2.3);
  vec3 base;
  float metal = 0.0;
  float gloss = 40.0;

  if (uSurface == 0) {
    float grain = sin(vPosition.x*21.6)*sin(vPosition.z*17.2);
    base = vec3(.245,.307,.260) + grain*.006;
    gloss = 55.0;
  } else if (uSurface == 1) {
    base = vec3(.51,.685,.575);
    base += edge*vec3(.13,.17,.14);
    gloss = 80.0;
  } else if (uSurface == 2) {
    base = mix(vec3(.16,.39,.295),vec3(.45,.71,.58),smoothstep(-.5,.85,N.y));
    base = mix(base,vec3(.82,.94,.84),edge*.64);
    gloss = 125.0;
  } else if (uSurface == 3) {
    base = vec3(.61,.475,.255);
    metal = .75; gloss = 95.0;
  } else if (uSurface == 4) {
    base = vec3(.065,.080,.061);
    gloss = 9.0;
  } else {
    base = vec3(.115,.177,.143);
    gloss = 35.0;
  }

  float shadow = uSurface == 4 ? 1.0 : shadowFactor(N);
  float lighting = (.47 + .53*lambert*shadow);
  vec3 reflected = reflect(-uLightDirection,N);
  float spec = pow(max(dot(reflected,V),0.0),gloss);
  float strength = uSurface == 2 ? 1.0 : (uSurface == 3 ? .53 : .16);
  vec3 color = base*lighting + vec3(1.0,.97,.82)*spec*strength*shadow;
  if (uSurface == 2) color += vec3(.08,.17,.12)*edge;
  if (uSurface == 4) color *= .68 + .25*clamp(-vPosition.y/.25,0.0,1.0);
  // Mild display transfer: no fake glow, blur or chromatic aberration.
  color = pow(max(color,vec3(0.0)),vec3(.89));
  outColor = vec4(color,1.0);
}`;

const DEPTH_VERTEX_SOURCE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uLightVP;
void main() { gl_Position = uLightVP * uModel * vec4(aPosition,1.0); }
`;
const DEPTH_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
void main() { }
`;

function shader(gl, type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(result);
    gl.deleteShader(result);
    throw new Error('ОТВЕС WebGL shader: ' + message);
  }
  return result;
}
function program(gl, vertex, fragment) {
  const result = gl.createProgram();
  const vert = shader(gl,gl.VERTEX_SHADER,vertex);
  const frag = shader(gl,gl.FRAGMENT_SHADER,fragment);
  gl.attachShader(result,vert);
  gl.attachShader(result,frag);
  gl.linkProgram(result);
  gl.deleteShader(vert); gl.deleteShader(frag);
  if (!gl.getProgramParameter(result,gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(result);
    gl.deleteProgram(result);
    throw new Error('ОТВЕС WebGL program: ' + message);
  }
  return result;
}

function upload(gl, geometry) {
  const vao = gl.createVertexArray();
  const buffers = [];
  gl.bindVertexArray(vao);
  for (const [slot, array] of [[0,geometry.positions],[1,geometry.normals]]) {
    const buffer = gl.createBuffer();
    buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(slot);
    gl.vertexAttribPointer(slot,3,gl.FLOAT,false,0,0);
  }
  const index = gl.createBuffer();
  buffers.push(index);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,geometry.indices,gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return {
    vao, buffers, count:geometry.indices.length,
    dispose() { gl.deleteVertexArray(vao); for (const buffer of buffers) gl.deleteBuffer(buffer); }
  };
}

// Quick-PWA WebGL2 renderer: bundled locally, with no CDN, extra build pipeline,
// or changes to the game rules. Legacy Canvas 2D remains a fallback in app.js.
export class SpatialMazeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', {
      alpha:false, depth:true, antialias:true, powerPreference:'high-performance',
      preserveDrawingBuffer:false
    });
    if (!this.gl) throw new Error('WebGL2 unavailable');
    this.width = 1; this.height = 1;
    this.maze = null;
    this.meshes = [];
    this.reducedMotion = false;
    this.lost = false;
    canvas.addEventListener('webglcontextlost',(event) => {
      event.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored',() => {
      this.lost = false;
      this.maze = null;
      this.init();
      this.resize();
    });
    this.init();
    this.resize();
  }

  setReducedMotion(value) { this.reducedMotion = !!value; }

  init() {
    const gl = this.gl;
    this.main = program(gl,VERTEX_SOURCE,FRAGMENT_SOURCE);
    this.depth = program(gl,DEPTH_VERTEX_SOURCE,DEPTH_FRAGMENT_SOURCE);
    this.mainUniform = {
      vp:gl.getUniformLocation(this.main,'uVP'),
      model:gl.getUniformLocation(this.main,'uModel'),
      light:gl.getUniformLocation(this.main,'uLightVP'),
      eye:gl.getUniformLocation(this.main,'uEye'),
      direction:gl.getUniformLocation(this.main,'uLightDirection'),
      shadow:gl.getUniformLocation(this.main,'uShadowMap'),
      hasShadows:gl.getUniformLocation(this.main,'uHasShadows'),
      surface:gl.getUniformLocation(this.main,'uSurface')
    };
    this.depthUniform = {
      model:gl.getUniformLocation(this.depth,'uModel'),
      light:gl.getUniformLocation(this.depth,'uLightVP')
    };
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(.038,.063,.047,1);
    this.shadowSize = Math.min(1024,gl.getParameter(gl.MAX_TEXTURE_SIZE));
    this.hasShadows = this.makeShadowTarget();
    this.meshes = [];
    this.ballMesh = null;
  }

  makeShadowTarget() {
    const gl = this.gl;
    try {
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,this.shadowSize,this.shadowSize,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,texture,0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      const valid = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.bindTexture(gl.TEXTURE_2D,null);
      if (!valid) {
        gl.deleteFramebuffer(framebuffer); gl.deleteTexture(texture);
        return false;
      }
      this.shadowFramebuffer = framebuffer;
      this.shadowTexture = texture;
      return true;
    } catch (error) {
      console.warn('OTVES: hardware shadow mapping unavailable',error);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      return false;
    }
  }

  resize() {
    if (this.lost) return;
    const bounds = this.canvas.getBoundingClientRect();
    this.width = Math.max(1,bounds.width);
    this.height = Math.max(1,bounds.height);
    const dpr = clamp(window.devicePixelRatio || 1,1,1.75);
    const w = Math.round(this.width*dpr), h = Math.round(this.height*dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.gl.viewport(0,0,w,h);
  }

  clearMeshes() {
    for (const item of this.meshes) item.mesh.dispose();
    this.meshes = [];
    if (this.ballMesh) this.ballMesh.dispose();
    this.ballMesh = null;
  }

  rebuild(maze) {
    this.clearMeshes();
    this.maze = maze;
    const gl = this.gl;
    const item = (data, surface, model = IDENTITY, castsShadow = false) => {
      this.meshes.push({mesh:upload(gl,data),surface,model,castsShadow});
    };
    // Solid lower frame is separate from the perforated play surface.
    item(makeBox(-.20,-.34,-.20,maze.cols+.20,-.25,maze.rows+.20),5);
    item(makeFloorWithHole(maze.cols,maze.rows,maze.goal),0);
    item(makeWell(maze.goal.x,maze.goal.y),4);
    item(makeUnifiedWalls(maze.walls,.46),1,IDENTITY,true);
    item(makeTorus(.396,.040),3,translation(maze.goal.x,.008,maze.goal.y));
    item(makeTorus(.305,.008),3,translation(maze.start.x,.013,maze.start.y));
    this.ballMesh = upload(gl,makeSphere());
  }

  configureCamera(maze) {
    const aspect = this.width/Math.max(1,this.height);
    const paddingX = this.width < 430 ? 22 : 38;
    const paddingY = this.height < 620 ? 110 : 162;
    const usableWidth = Math.max(1,this.width-paddingX*2);
    const usableHeight = Math.max(1,this.height-paddingY);
    const pxPerUnit = Math.min(usableWidth/(maze.cols+.65),usableHeight/(maze.rows+.65));
    const fov = .61;
    const distance = this.height/(2*Math.tan(fov/2)*Math.max(1,pxPerUnit))*1.065;
    const cx = maze.cols/2, cz = maze.rows/2;
    // A restrained 17-degree rake exposes real wall sides without hiding paths.
    const eye = [cx+distance*.115,distance,cz+distance*.27];
    const target = [cx,0,cz];
    const view = lookAt(eye,target,[0,0,-1]);
    this.cameraVP = multiply(perspective(fov,aspect,.05,Math.max(200,distance+100)),view);
    this.cameraEye = eye;
    const size = Math.max(maze.cols,maze.rows)+4;
    const source = [cx-size*.5,size*1.15,cz-size*.55];
    this.lightVP = multiply(orthographic(size*.95,.1,size*4),
      lookAt(source,[cx,0,cz],[0,0,-1]));
    this.lightDirection = normalize([-0.49,1.15,-0.54]);
  }

  renderShadow(ballModel) {
    if (!this.hasShadows) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);
    gl.viewport(0,0,this.shadowSize,this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.colorMask(false,false,false,false);
    gl.useProgram(this.depth);
    gl.uniformMatrix4fv(this.depthUniform.light,false,this.lightVP);
    for (const item of this.meshes) {
      if (!item.castsShadow) continue;
      gl.uniformMatrix4fv(this.depthUniform.model,false,item.model);
      gl.bindVertexArray(item.mesh.vao);
      gl.drawElements(gl.TRIANGLES,item.mesh.count,gl.UNSIGNED_INT,0);
    }
    gl.uniformMatrix4fv(this.depthUniform.model,false,ballModel);
    gl.bindVertexArray(this.ballMesh.vao);
    gl.drawElements(gl.TRIANGLES,this.ballMesh.count,gl.UNSIGNED_INT,0);
    gl.bindVertexArray(null);
    gl.colorMask(true,true,true,true);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
  }

  draw({maze, marble, completion=0, mode='playing'}) {
    if (!maze || this.lost) return;
    if (this.maze !== maze) this.rebuild(maze);
    this.configureCamera(maze);
    const gl = this.gl;
    const sinking = mode === 'complete' ? .18*(completion*completion) : 0;
    const ballModel = translation(marble.position.x,marble.radius-sinking,marble.position.y);
    this.renderShadow(ballModel);

    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.main);
    const u = this.mainUniform;
    gl.uniformMatrix4fv(u.vp,false,this.cameraVP);
    gl.uniformMatrix4fv(u.light,false,this.lightVP);
    gl.uniform3fv(u.eye,new Float32Array(this.cameraEye));
    gl.uniform3fv(u.direction,new Float32Array(this.lightDirection));
    gl.uniform1i(u.hasShadows,this.hasShadows ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,this.hasShadows ? this.shadowTexture : null);
    gl.uniform1i(u.shadow,0);
    for (const item of this.meshes) {
      gl.uniform1i(u.surface,item.surface);
      gl.uniformMatrix4fv(u.model,false,item.model);
      gl.bindVertexArray(item.mesh.vao);
      gl.drawElements(gl.TRIANGLES,item.mesh.count,gl.UNSIGNED_INT,0);
    }
    gl.uniform1i(u.surface,2);
    gl.uniformMatrix4fv(u.model,false,ballModel);
    gl.bindVertexArray(this.ballMesh.vao);
    gl.drawElements(gl.TRIANGLES,this.ballMesh.count,gl.UNSIGNED_INT,0);
    gl.bindVertexArray(null);
  }
}
