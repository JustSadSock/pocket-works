const APP_VERSION = '1.0.0';
const STORAGE_KEY = 'pocket-works:plast:world:v1';
const SETTINGS_KEY = 'pocket-works:plast:settings:v1';
const WORLD_X = 64;
const WORLD_Y = 32;
const WORLD_Z = 64;
const SEA_LEVEL = 10;
const PLAYER_HEIGHT = 1.74;
const PLAYER_RADIUS = 0.29;
const EYE_HEIGHT = 1.58;

const BLOCKS = [
  {id:0, name:'Воздух', color:'#000000', hardness:0},
  {id:1, name:'Дёрн', color:'#70ad45', hardness:.52},
  {id:2, name:'Земля', color:'#7c5738', hardness:.48},
  {id:3, name:'Камень', color:'#777a76', hardness:1.15},
  {id:4, name:'Песок', color:'#d9c27b', hardness:.34},
  {id:5, name:'Вода', color:'#357fb4', hardness:.18},
  {id:6, name:'Бревно', color:'#725038', hardness:.82},
  {id:7, name:'Листва', color:'#4e8a3c', hardness:.28},
  {id:8, name:'Доски', color:'#a77b4e', hardness:.72},
  {id:9, name:'Стекло', color:'#a9d7dc', hardness:.24},
  {id:10, name:'Кирпич', color:'#985849', hardness:1.08},
  {id:11, name:'Булыжник', color:'#62645f', hardness:1.0}
];
const HOTBAR_DEFAULT = [1,2,3,4,6,8,9,10,11];
const WORLD_NAMES = ['ЗЕЛЁНЫЙ РАЗЛОМ','ТИХАЯ ГРЯДА','МОКРЫЙ КРЯЖ','ПЕСЧАНЫЙ ШОВ','СЕВЕРНЫЙ ПЛАСТ','ДОЛИНА КУБОВ'];

const $ = (selector) => document.querySelector(selector);
const appEl = $('#app');
const canvas = $('#world');
const boot = $('#boot');
const bootText = $('#bootText');
const bootFill = $('#bootFill');
const unsupported = $('#unsupported');
const menu = $('#menu');
const hud = $('#hud');
const pauseOverlay = $('#pauseOverlay');
const inventoryOverlay = $('#inventoryOverlay');
const settingsOverlay = $('#settingsOverlay');
const hotbarEl = $('#hotbar');
const inventoryGrid = $('#inventoryGrid');
const targetLabel = $('#targetLabel');
const breakRing = $('#breakRing');
const breakProgress = $('#breakProgress');
const joystick = $('#joystick');
const joystickKnob = $('#joystickKnob');
const lookZone = $('#lookZone');
const hand = $('#hand');
const heldBlock = $('#heldBlock');
const toastEl = $('#toast');
const underwaterEl = $('#underwater');

const defaultSettings = {
  sensitivity: 80,
  distance: 48,
  sound: true,
  haptic: true,
  leftHand: false
};
let settings = loadJson(SETTINGS_KEY, defaultSettings);
settings = {...defaultSettings, ...settings};

let gl = null;
let program = null;
let worldTexture = null;
let uniforms = {};
let world = new Uint8Array(WORLD_X * WORLD_Y * WORLD_Z);
let seed = 1;
let hasWorld = false;
let changedBlocks = 0;
let hotbar = [...HOTBAR_DEFAULT];
let selectedSlot = 0;
let mode = 'boot';
let settingsReturn = 'menu';
let generatedSpawn = {x:WORLD_X/2+.5, y:18, z:WORLD_Z/2+.5};
let target = null;
let mining = false;
let miningCellKey = '';
let miningProgress = 0;
let saveTimer = 0;
let toastTimer = 0;
let lastTime = performance.now();
let frameTimeAverage = 16;
let renderScale = matchMedia('(pointer: coarse)').matches ? .72 : .92;
let lastStepSound = 0;
let previewAngle = 0;
let audioContext = null;

const player = {
  x: WORLD_X/2+.5,
  y: 18,
  z: WORLD_Z/2+.5,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: .2,
  pitch: -.12,
  grounded: false,
  underwater: false,
  jumpHeld: false
};
const controls = {
  joyX: 0,
  joyY: 0,
  joystickPointer: null,
  lookPointer: null,
  lastLookX: 0,
  lastLookY: 0,
  keys: new Set()
};

const VERTEX_SHADER = `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler3D;
out vec4 outColor;
uniform vec2 uResolution;
uniform vec3 uCameraPos;
uniform mat3 uCamera;
uniform float uTime;
uniform float uMaxDistance;
uniform usampler3D uWorld;
uniform ivec3 uTarget;
uniform int uHasTarget;
uniform int uUnderwater;
const ivec3 WORLD = ivec3(${WORLD_X}, ${WORLD_Y}, ${WORLD_Z});

float hash31(vec3 p) {
  p = fract(p * .1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 skyColor(vec3 rd) {
  float h = clamp(rd.y * .72 + .35, 0.0, 1.0);
  vec3 horizon = vec3(.72,.86,.93);
  vec3 zenith = vec3(.28,.61,.88);
  vec3 sky = mix(horizon, zenith, h);
  vec3 sunDir = normalize(vec3(-.55,.72,.35));
  float sun = pow(max(dot(rd, sunDir), 0.0), 720.0);
  float glow = pow(max(dot(rd, sunDir), 0.0), 9.0);
  sky += vec3(1.0,.82,.46) * sun * 1.7 + vec3(1.0,.72,.35) * glow * .16;
  if (rd.y > .02) {
    vec2 cloudPos = rd.xz / max(rd.y, .04) * 2.2 + vec2(uTime * .006, 0.0);
    float cloud = hash21(floor(cloudPos * 2.0));
    cloud = smoothstep(.67,.82,cloud) * smoothstep(.02,.18,rd.y);
    sky = mix(sky, vec3(.96,.98,1.0), cloud * .48);
  }
  return sky;
}
vec3 blockBase(uint id, vec3 normal, ivec3 cell, vec3 hp) {
  vec3 c;
  if (id == 1u) {
    c = normal.y > .5 ? vec3(.36,.65,.20) : (normal.y < -.5 ? vec3(.43,.29,.18) : mix(vec3(.34,.53,.19), vec3(.46,.31,.19), smoothstep(.34,.72,fract(hp.y))));
  } else if (id == 2u) c = vec3(.43,.29,.19);
  else if (id == 3u) c = vec3(.43,.45,.43);
  else if (id == 4u) c = vec3(.78,.69,.39);
  else if (id == 6u) c = abs(normal.y) > .5 ? vec3(.43,.29,.18) : vec3(.34,.23,.15);
  else if (id == 7u) c = vec3(.25,.50,.18);
  else if (id == 8u) c = vec3(.58,.39,.22);
  else if (id == 9u) c = vec3(.65,.82,.84);
  else if (id == 10u) c = vec3(.52,.24,.19);
  else if (id == 11u) c = vec3(.34,.35,.33);
  else c = vec3(.55);
  vec2 faceUv = abs(normal.x) > .5 ? hp.zy : (abs(normal.y) > .5 ? hp.xz : hp.xy);
  vec2 px = floor(fract(faceUv) * 8.0);
  float grain = hash31(vec3(cell) + vec3(px, float(id) * 3.17));
  c *= mix(.82,1.12,grain);
  if (id == 8u) {
    float seam = step(.86, fract(faceUv.y * 4.0));
    c *= 1.0 - seam * .25;
  }
  if (id == 10u) {
    vec2 b = fract(faceUv * vec2(3.0,5.0) + vec2(mod(floor(faceUv.y*5.0),2.0)*.5,0.0));
    float mortar = step(b.x,.07) + step(b.y,.08);
    c = mix(c, vec3(.72,.63,.53), clamp(mortar,0.0,1.0));
  }
  if (id == 11u) {
    float crack = step(.84, hash31(vec3(px * 2.0, float(cell.x + cell.z))));
    c *= 1.0 - crack * .22;
  }
  return c;
}
bool inside(ivec3 c) { return all(greaterThanEqual(c, ivec3(0))) && all(lessThan(c, WORLD)); }
uint voxel(ivec3 c) { return inside(c) ? texelFetch(uWorld, c, 0).r : 0u; }

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
  vec3 rd = normalize(uCamera * vec3(uv * .72, 1.0));
  vec3 ro = uCameraPos;
  vec3 sky = skyColor(rd);
  vec3 inv = 1.0 / max(abs(rd), vec3(1e-6)) * sign(rd);
  vec3 a = (vec3(0.0) - ro) * inv;
  vec3 b = (vec3(WORLD) - ro) * inv;
  vec3 mn = min(a,b);
  vec3 mx = max(a,b);
  float enterT = max(max(mn.x,mn.y),mn.z);
  float exitT = min(min(mx.x,mx.y),mx.z);
  if (exitT < max(enterT,0.0)) {
    outColor = vec4(sky,1.0);
    return;
  }
  enterT = max(enterT,0.0);
  vec3 start = ro + rd * (enterT + .001);
  ivec3 cell = ivec3(floor(start));
  ivec3 stepDir = ivec3(sign(rd));
  vec3 delta = 1.0 / max(abs(rd), vec3(1e-6));
  vec3 side;
  side.x = rd.x > 0.0 ? (float(cell.x + 1) - start.x) / rd.x : (rd.x < 0.0 ? (float(cell.x) - start.x) / rd.x : 1e9);
  side.y = rd.y > 0.0 ? (float(cell.y + 1) - start.y) / rd.y : (rd.y < 0.0 ? (float(cell.y) - start.y) / rd.y : 1e9);
  side.z = rd.z > 0.0 ? (float(cell.z + 1) - start.z) / rd.z : (rd.z < 0.0 ? (float(cell.z) - start.z) / rd.z : 1e9);
  float travel = enterT;
  vec3 normal = -sign(rd) * step(vec3(.51), abs(rd));
  float waterT = -1.0;
  vec3 waterNormal = vec3(0.0,1.0,0.0);
  ivec3 waterCell = ivec3(0);
  vec3 waterPoint = vec3(0.0);
  for (int i=0; i<160; i++) {
    if (!inside(cell) || travel > exitT || travel > uMaxDistance) break;
    uint id = voxel(cell);
    if (id == 5u) {
      if (waterT < 0.0) {
        waterT = travel;
        waterNormal = normal;
        waterCell = cell;
        waterPoint = ro + rd * travel;
      }
    } else if (id != 0u) {
      vec3 hp = ro + rd * travel;
      vec3 c = blockBase(id, normal, cell, hp);
      vec3 sunDir = normalize(vec3(-.55,.72,.35));
      float diffuse = .58 + max(dot(normal,sunDir),0.0)*.42;
      float faceShade = normal.y < -.5 ? .53 : (abs(normal.x) > .5 ? .86 : 1.0);
      c *= diffuse * faceShade;
      float ao = 1.0;
      if (normal.y > .5) {
        uint above = voxel(cell + ivec3(0,1,0));
        ao = above == 0u || above == 5u ? 1.0 : .72;
      }
      c *= ao;
      if (uHasTarget == 1 && all(equal(cell,uTarget))) {
        vec2 fuv = abs(normal.x)>.5 ? hp.zy : (abs(normal.y)>.5 ? hp.xz : hp.xy);
        fuv = fract(fuv);
        float edge = min(min(fuv.x,1.0-fuv.x),min(fuv.y,1.0-fuv.y));
        c = mix(vec3(1.0), c, smoothstep(.025,.065,edge));
      }
      float fog = smoothstep(uMaxDistance*.48,uMaxDistance,travel);
      c = mix(c,sky,fog);
      if (waterT >= 0.0) {
        float depth = clamp((travel-waterT)*.11,0.0,.72);
        vec3 wc = mix(vec3(.18,.55,.74),vec3(.04,.24,.38),depth);
        c = mix(c,wc,.27+depth*.55);
        float sparkle = pow(max(dot(reflect(rd,waterNormal),sunDir),0.0),42.0);
        c += sparkle * vec3(1.0,.9,.65) * .32;
      }
      if (id == 9u) c = mix(sky,c,.58);
      if (uUnderwater == 1) c = mix(c,vec3(.04,.30,.48),.34);
      outColor = vec4(c,1.0);
      return;
    }
    if (side.x < side.y && side.x < side.z) {
      travel = enterT + side.x; side.x += delta.x; cell.x += stepDir.x; normal = vec3(-float(stepDir.x),0.0,0.0);
    } else if (side.y < side.z) {
      travel = enterT + side.y; side.y += delta.y; cell.y += stepDir.y; normal = vec3(0.0,-float(stepDir.y),0.0);
    } else {
      travel = enterT + side.z; side.z += delta.z; cell.z += stepDir.z; normal = vec3(0.0,0.0,-float(stepDir.z));
    }
  }
  if (waterT >= 0.0) {
    float ripple = sin((waterPoint.x + waterPoint.z) * 6.0 + uTime * 1.4) * .025;
    vec3 wc = vec3(.17,.53,.73) + ripple;
    float fog = smoothstep(uMaxDistance*.35,uMaxDistance,waterT);
    outColor = vec4(mix(wc,sky,fog*.7),1.0);
  } else {
    vec3 c = sky;
    if (uUnderwater == 1) c = mix(c,vec3(.03,.28,.46),.58);
    outColor = vec4(c,1.0);
  }
}`;

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch { return fallback; }
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a,b,t) { return a + (b-a)*t; }
function smoothstep(t) { return t*t*(3-2*t); }
function hashInt(x,z,s=seed) {
  let n = (Math.imul(x,374761393) + Math.imul(z,668265263) + Math.imul(s,69069)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function hash3(x,y,z,s=seed) {
  let n = Math.imul(x,73856093) ^ Math.imul(y,19349663) ^ Math.imul(z,83492791) ^ Math.imul(s,2654435761);
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967295;
}
function noise2(x,z) {
  const x0=Math.floor(x), z0=Math.floor(z), tx=smoothstep(x-x0), tz=smoothstep(z-z0);
  const a=hashInt(x0,z0), b=hashInt(x0+1,z0), c=hashInt(x0,z0+1), d=hashInt(x0+1,z0+1);
  return lerp(lerp(a,b,tx),lerp(c,d,tx),tz);
}
function noise3(x,y,z) {
  const x0=Math.floor(x), y0=Math.floor(y), z0=Math.floor(z);
  const tx=smoothstep(x-x0), ty=smoothstep(y-y0), tz=smoothstep(z-z0);
  const at=(ix,iy,iz)=>hash3(x0+ix,y0+iy,z0+iz);
  const x00=lerp(at(0,0,0),at(1,0,0),tx), x10=lerp(at(0,1,0),at(1,1,0),tx);
  const x01=lerp(at(0,0,1),at(1,0,1),tx), x11=lerp(at(0,1,1),at(1,1,1),tx);
  return lerp(lerp(x00,x10,ty),lerp(x01,x11,ty),tz);
}
function indexOf(x,y,z) { return x + y*WORLD_X + z*WORLD_X*WORLD_Y; }
function inWorld(x,y,z) { return x>=0 && y>=0 && z>=0 && x<WORLD_X && y<WORLD_Y && z<WORLD_Z; }
function getBlock(x,y,z) {
  if (!inWorld(x,y,z)) return y < 0 ? 3 : 0;
  return world[indexOf(x,y,z)];
}
function setBlockRaw(x,y,z,id) {
  if (!inWorld(x,y,z)) return;
  world[indexOf(x,y,z)] = id;
}
function isSolid(id) { return id !== 0 && id !== 5; }
function topSolid(x,z) {
  for (let y=WORLD_Y-2; y>=0; y--) if (isSolid(getBlock(x,y,z))) return y;
  return 0;
}

function generateWorld(nextSeed) {
  seed = nextSeed >>> 0 || 1;
  world.fill(0);
  const heights = new Uint8Array(WORLD_X*WORLD_Z);
  for (let z=0; z<WORLD_Z; z++) {
    for (let x=0; x<WORLD_X; x++) {
      const broad = noise2(x*.055,z*.055);
      const medium = noise2(x*.125+19.4,z*.125-11.7);
      const ridges = Math.abs(noise2(x*.035-7.2,z*.035+4.6)-.5)*2;
      let h = Math.floor(7 + broad*8 + medium*3 + ridges*2);
      const edge = Math.min(x,z,WORLD_X-1-x,WORLD_Z-1-z);
      if (edge < 5) h = Math.min(h, 8 + edge);
      h = clamp(h,4,WORLD_Y-8);
      heights[x+z*WORLD_X] = h;
      for (let y=0; y<=h; y++) {
        let id = y < h-3 ? 3 : (y < h ? 2 : 1);
        if (h <= SEA_LEVEL+1 && y >= h-2) id = 4;
        if (y > 2 && y < h-2) {
          const cave = noise3(x*.19,y*.21,z*.19) * .67 + noise3(x*.39+9,y*.31,z*.39-4)*.33;
          if (cave > .78) id = 0;
        }
        setBlockRaw(x,y,z,id);
      }
      for (let y=h+1; y<=SEA_LEVEL; y++) setBlockRaw(x,y,z,5);
    }
  }
  for (let z=3; z<WORLD_Z-3; z++) {
    for (let x=3; x<WORLD_X-3; x++) {
      const h=heights[x+z*WORLD_X];
      if (h <= SEA_LEVEL+1 || getBlock(x,h,z)!==1 || hashInt(x*7,z*11) < .965) continue;
      const trunk = 3 + Math.floor(hashInt(x*13,z*17)*3);
      for (let y=1; y<=trunk && h+y<WORLD_Y-2; y++) setBlockRaw(x,h+y,z,6);
      const cy=h+trunk;
      for (let dy=-2; dy<=2; dy++) for (let dz=-2; dz<=2; dz++) for (let dx=-2; dx<=2; dx++) {
        const dist=Math.abs(dx)+Math.abs(dz)+Math.abs(dy)*.8;
        if (dist > 3.7 || !inWorld(x+dx,cy+dy,z+dz)) continue;
        if (getBlock(x+dx,cy+dy,z+dz)===0 && hash3(x+dx,cy+dy,z+dz)>.12) setBlockRaw(x+dx,cy+dy,z+dz,7);
      }
      setBlockRaw(x,cy+2,z,7);
    }
  }
  const sx=Math.floor(WORLD_X/2), sz=Math.floor(WORLD_Z/2);
  for (let r=0; r<12; r++) {
    for (let dz=-r; dz<=r; dz++) for (let dx=-r; dx<=r; dx++) {
      const x=sx+dx,z=sz+dz;
      const y=topSolid(x,z);
      if (getBlock(x,y,z)!==5 && y>SEA_LEVEL) {
        generatedSpawn={x:x+.5,y:y+1.05,z:z+.5};
        r=99; dx=99; dz=99;
      }
    }
  }
  changedBlocks=0;
  uploadWorldTexture();
}

function compileShader(type, source) {
  const shader=gl.createShader(type);
  gl.shaderSource(shader,source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
    const error=gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(error || 'Shader compile error');
  }
  return shader;
}
function initRenderer() {
  gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
  if (!gl) return false;
  const vs=compileShader(gl.VERTEX_SHADER,VERTEX_SHADER);
  const fs=compileShader(gl.FRAGMENT_SHADER,FRAGMENT_SHADER);
  program=gl.createProgram();
  gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());
  uniforms={
    resolution:gl.getUniformLocation(program,'uResolution'), cameraPos:gl.getUniformLocation(program,'uCameraPos'),
    camera:gl.getUniformLocation(program,'uCamera'), time:gl.getUniformLocation(program,'uTime'),
    maxDistance:gl.getUniformLocation(program,'uMaxDistance'), world:gl.getUniformLocation(program,'uWorld'),
    target:gl.getUniformLocation(program,'uTarget'), hasTarget:gl.getUniformLocation(program,'uHasTarget'),
    underwater:gl.getUniformLocation(program,'uUnderwater')
  };
  worldTexture=gl.createTexture();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D,worldTexture);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  gl.texImage3D(gl.TEXTURE_3D,0,gl.R8UI,WORLD_X,WORLD_Y,WORLD_Z,0,gl.RED_INTEGER,gl.UNSIGNED_BYTE,world);
  gl.uniform1i(uniforms.world,0);
  canvas.addEventListener('webglcontextlost',(event)=>{event.preventDefault(); showToast('3D-контекст потерян');});
  return true;
}
function uploadWorldTexture() {
  if (!gl || !worldTexture) return;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D,worldTexture);
  gl.texImage3D(gl.TEXTURE_3D,0,gl.R8UI,WORLD_X,WORLD_Y,WORLD_Z,0,gl.RED_INTEGER,gl.UNSIGNED_BYTE,world);
}
function uploadVoxel(x,y,z) {
  if (!gl || !inWorld(x,y,z)) return;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D,worldTexture);
  gl.texSubImage3D(gl.TEXTURE_3D,0,x,y,z,1,1,1,gl.RED_INTEGER,gl.UNSIGNED_BYTE,new Uint8Array([getBlock(x,y,z)]));
}
function resizeCanvas() {
  const quality=renderScale;
  const w=Math.max(2,Math.floor(innerWidth*quality));
  const h=Math.max(2,Math.floor(innerHeight*quality));
  if (canvas.width!==w || canvas.height!==h) { canvas.width=w; canvas.height=h; gl?.viewport(0,0,w,h); }
}
function cameraVectors(yaw=player.yaw,pitch=player.pitch) {
  const cp=Math.cos(pitch), sp=Math.sin(pitch), sy=Math.sin(yaw), cy=Math.cos(yaw);
  const forward=[sy*cp,sp,cy*cp];
  const right=[cy,0,-sy];
  const up=[-sy*sp,cp,-cy*sp];
  return {forward,right,up,matrix:new Float32Array([...right,...up,...forward])};
}
function render(now) {
  resizeCanvas();
  gl.useProgram(program);
  let cx=player.x, cy=player.y+EYE_HEIGHT, cz=player.z, yaw=player.yaw, pitch=player.pitch;
  if (mode==='menu' || mode==='boot') {
    previewAngle += .000045 * Math.min(35,now-lastTime);
    const radius=18;
    cx=WORLD_X/2 + Math.sin(previewAngle)*radius;
    cz=WORLD_Z/2 + Math.cos(previewAngle)*radius;
    cy=21 + Math.sin(previewAngle*.7)*2;
    yaw=previewAngle+Math.PI;
    pitch=-.28;
  }
  const vectors=cameraVectors(yaw,pitch);
  gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);
  gl.uniform3f(uniforms.cameraPos,cx,cy,cz);
  gl.uniformMatrix3fv(uniforms.camera,false,vectors.matrix);
  gl.uniform1f(uniforms.time,now*.001);
  gl.uniform1f(uniforms.maxDistance,Number(settings.distance));
  gl.uniform1i(uniforms.underwater,player.underwater&&mode==='game'?1:0);
  if (target && mode==='game') {
    gl.uniform3i(uniforms.target,target.x,target.y,target.z); gl.uniform1i(uniforms.hasTarget,1);
  } else gl.uniform1i(uniforms.hasTarget,0);
  gl.drawArrays(gl.TRIANGLES,0,3);
}

function collidesAt(x,y,z) {
  const minX=Math.floor(x-PLAYER_RADIUS), maxX=Math.floor(x+PLAYER_RADIUS);
  const minY=Math.floor(y), maxY=Math.floor(y+PLAYER_HEIGHT-.01);
  const minZ=Math.floor(z-PLAYER_RADIUS), maxZ=Math.floor(z+PLAYER_RADIUS);
  for (let by=minY;by<=maxY;by++) for (let bz=minZ;bz<=maxZ;bz++) for (let bx=minX;bx<=maxX;bx++) {
    if (bx<0||bz<0||bx>=WORLD_X||bz>=WORLD_Z||by<0) return true;
    if (by<WORLD_Y && isSolid(getBlock(bx,by,bz))) return true;
  }
  return false;
}
function moveAxis(axis,amount) {
  if (!amount) return;
  const steps=Math.max(1,Math.ceil(Math.abs(amount)/.18));
  const step=amount/steps;
  for (let i=0;i<steps;i++) {
    const nx=axis==='x'?player.x+step:player.x;
    const ny=axis==='y'?player.y+step:player.y;
    const nz=axis==='z'?player.z+step:player.z;
    if (!collidesAt(nx,ny,nz)) { player.x=nx; player.y=ny; player.z=nz; }
    else {
      if (axis==='x') player.vx=0;
      if (axis==='y') player.vy=0;
      if (axis==='z') player.vz=0;
      break;
    }
  }
}
function blockAtBody(id=5) {
  const points=[[player.x,player.y+.15,player.z],[player.x,player.y+1.1,player.z],[player.x,player.y+EYE_HEIGHT,player.z]];
  return points.some(([x,y,z])=>getBlock(Math.floor(x),Math.floor(y),Math.floor(z))===id);
}
function updatePhysics(dt,now) {
  const keyX=(controls.keys.has('KeyD')||controls.keys.has('ArrowRight')?1:0)-(controls.keys.has('KeyA')||controls.keys.has('ArrowLeft')?1:0);
  const keyY=(controls.keys.has('KeyW')||controls.keys.has('ArrowUp')?1:0)-(controls.keys.has('KeyS')||controls.keys.has('ArrowDown')?1:0);
  let mx=clamp(controls.joyX+keyX,-1,1), my=clamp(-controls.joyY+keyY,-1,1);
  const len=Math.hypot(mx,my); if (len>1) {mx/=len;my/=len;}
  player.underwater=blockAtBody(5);
  const speed=player.underwater?2.7:4.4;
  const sy=Math.sin(player.yaw), cy=Math.cos(player.yaw);
  const targetVx=(cy*mx+sy*my)*speed;
  const targetVz=(-sy*mx+cy*my)*speed;
  const accel=1-Math.exp(-(player.grounded?14:player.underwater?8:4.5)*dt);
  player.vx=lerp(player.vx,targetVx,accel); player.vz=lerp(player.vz,targetVz,accel);
  player.grounded=collidesAt(player.x,player.y-.055,player.z);
  if (player.underwater) {
    player.vy += (player.jumpHeld||controls.keys.has('Space') ? 8.2 : 3.2)*dt;
    player.vy -= 5.2*dt;
    player.vy*=Math.pow(.18,dt);
  } else {
    if ((player.jumpHeld||controls.keys.has('Space')) && player.grounded) {
      player.vy=6.6; player.grounded=false; pulseHaptic(15); playTone('jump');
    }
    player.vy-=18.5*dt;
  }
  moveAxis('x',player.vx*dt); moveAxis('z',player.vz*dt); moveAxis('y',player.vy*dt);
  if (player.y<1 || !Number.isFinite(player.y)) respawn();
  const moving=Math.hypot(player.vx,player.vz)>.65;
  if (moving&&player.grounded&&now-lastStepSound>390) { lastStepSound=now; playTone('step'); }
  underwaterEl.classList.toggle('active',player.underwater);
}
function respawn() {
  Object.assign(player,{...generatedSpawn,vx:0,vy:0,vz:0,pitch:-.08});
  showToast('Возвращение на поверхность');
}
function raycast(maxDistance=6) {
  const {forward}=cameraVectors();
  const ox=player.x, oy=player.y+EYE_HEIGHT, oz=player.z;
  let lastX=Math.floor(ox),lastY=Math.floor(oy),lastZ=Math.floor(oz);
  for (let d=.05;d<=maxDistance;d+=.045) {
    const x=Math.floor(ox+forward[0]*d), y=Math.floor(oy+forward[1]*d), z=Math.floor(oz+forward[2]*d);
    if (x===lastX&&y===lastY&&z===lastZ) continue;
    const id=getBlock(x,y,z);
    if (id!==0&&id!==5) return {x,y,z,id,px:lastX,py:lastY,pz:lastZ,distance:d};
    lastX=x;lastY=y;lastZ=z;
  }
  return null;
}
function updateTarget() {
  target=raycast();
  if (target) {
    targetLabel.hidden=false; targetLabel.textContent=BLOCKS[target.id]?.name.toUpperCase()||'БЛОК';
  } else targetLabel.hidden=true;
}
function playerIntersectsBlock(x,y,z) {
  return x+1>player.x-PLAYER_RADIUS && x<player.x+PLAYER_RADIUS && z+1>player.z-PLAYER_RADIUS && z<player.z+PLAYER_RADIUS && y+1>player.y && y<player.y+PLAYER_HEIGHT;
}
function editBlock(x,y,z,id) {
  if (!inWorld(x,y,z)) return false;
  setBlockRaw(x,y,z,id); uploadVoxel(x,y,z); changedBlocks++; scheduleSave(); return true;
}
function settleSand(x,y,z) {
  for (let sy=y;sy<WORLD_Y-1;sy++) {
    if (getBlock(x,sy,z)!==4) continue;
    let ny=sy;
    while (ny>0 && (getBlock(x,ny-1,z)===0 || getBlock(x,ny-1,z)===5)) ny--;
    if (ny!==sy) {
      const displaced=getBlock(x,ny,z);
      setBlockRaw(x,sy,z,displaced===5?5:0); setBlockRaw(x,ny,z,4);
      uploadVoxel(x,sy,z); uploadVoxel(x,ny,z);
    }
  }
}
function letWaterIn(x,y,z) {
  if (getBlock(x,y,z)!==0) return;
  const neighbors=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]];
  if (neighbors.some(([dx,dy,dz])=>getBlock(x+dx,y+dy,z+dz)===5)) {
    setTimeout(()=>{ if(getBlock(x,y,z)===0){setBlockRaw(x,y,z,5);uploadVoxel(x,y,z);scheduleSave();}},180);
  }
}
function mineTick(dt) {
  if (!mining || !target) { miningProgress=0; breakRing.classList.remove('active'); return; }
  const key=`${target.x},${target.y},${target.z}`;
  if (key!==miningCellKey) { miningCellKey=key; miningProgress=0; }
  const hardness=BLOCKS[target.id]?.hardness||.5;
  miningProgress+=dt/Math.max(.12,hardness);
  breakRing.classList.add('active');
  breakProgress.style.setProperty('--break-angle',`${miningProgress*360}deg`);
  if (miningProgress>=1) {
    const {x,y,z,id}=target;
    editBlock(x,y,z,0); settleSand(x,y+1,z); letWaterIn(x,y,z);
    miningProgress=0; miningCellKey=''; swingHand(); pulseHaptic(id===3||id===11?32:18); playTone('break',id);
    updateTarget();
  }
}
function placeSelected() {
  if (mode!=='game' || !target) { showToast('Подойди ближе к поверхности'); return; }
  const id=hotbar[selectedSlot];
  const {px:x,py:y,pz:z}=target;
  if (!inWorld(x,y,z) || playerIntersectsBlock(x,y,z)) { showToast('Здесь стоишь ты'); pulseHaptic(8); return; }
  if (getBlock(x,y,z)!==0 && getBlock(x,y,z)!==5) return;
  editBlock(x,y,z,id); swingHand(); pulseHaptic(18); playTone('place',id); updateTarget();
}

function rleEncode(data) {
  const out=[];
  for (let i=0;i<data.length;) {
    const value=data[i]; let run=1;
    while (i+run<data.length && data[i+run]===value && run<65535) run++;
    out.push(value,run&255,run>>>8); i+=run;
  }
  const bytes=new Uint8Array(out); let binary='';
  for (let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
function rleDecode(encoded,length) {
  const binary=atob(encoded); const out=new Uint8Array(length); let p=0;
  for (let i=0;i+2<binary.length;i+=3) {
    const value=binary.charCodeAt(i), run=binary.charCodeAt(i+1)|(binary.charCodeAt(i+2)<<8);
    if (!run || p+run>length) throw new Error('Invalid world data'); out.fill(value,p,p+run); p+=run;
  }
  if (p!==length) throw new Error('Incomplete world data'); return out;
}
function saveWorld() {
  if (!hasWorld) return;
  try {
    const payload={version:1,appVersion:APP_VERSION,seed,world:rleEncode(world),changedBlocks,hotbar,selectedSlot,player:{x:player.x,y:player.y,z:player.z,yaw:player.yaw,pitch:player.pitch},savedAt:Date.now()};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(payload));
    updateMenuMeta(payload.savedAt);
  } catch (error) { console.error(error); showToast('Не удалось сохранить мир'); }
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer=setTimeout(saveWorld,650); }
function loadWorld() {
  try {
    const raw=localStorage.getItem(STORAGE_KEY); if (!raw) return false;
    const data=JSON.parse(raw); if (data.version!==1 || !data.world) return false;
    world=rleDecode(data.world,WORLD_X*WORLD_Y*WORLD_Z); seed=data.seed>>>0; changedBlocks=Number(data.changedBlocks)||0;
    hotbar=Array.isArray(data.hotbar)&&data.hotbar.length===9?data.hotbar.map(v=>clamp(Number(v)||1,1,BLOCKS.length-1)):[...HOTBAR_DEFAULT];
    selectedSlot=clamp(Number(data.selectedSlot)||0,0,8);
    uploadWorldTexture();
    const spawnY=topSolid(Math.floor(WORLD_X/2),Math.floor(WORLD_Z/2))+1.05;
    generatedSpawn={x:WORLD_X/2+.5,y:spawnY,z:WORLD_Z/2+.5};
    if (data.player) Object.assign(player,{x:data.player.x,y:data.player.y,z:data.player.z,yaw:data.player.yaw,pitch:data.player.pitch,vx:0,vy:0,vz:0});
    if (collidesAt(player.x,player.y,player.z)) respawn();
    hasWorld=true; updateMenuMeta(data.savedAt); return true;
  } catch (error) { console.warn('Saved world rejected',error); localStorage.removeItem(STORAGE_KEY); return false; }
}
function updateMenuMeta(savedAt=0) {
  $('#worldName').textContent=WORLD_NAMES[seed%WORLD_NAMES.length];
  $('#worldMeta').textContent=hasWorld ? `${changedBlocks} изменений · ${savedAt?new Date(savedAt).toLocaleDateString('ru-RU'):'сейчас'}` : 'ещё не создан';
  $('#continueLabel').textContent=hasWorld?'ПРОДОЛЖИТЬ':'СОЗДАТЬ МИР';
}

function buildHotbar() {
  hotbarEl.innerHTML='';
  hotbar.forEach((id,index)=>{
    const button=document.createElement('button'); button.className=`hotbar-slot${index===selectedSlot?' selected':''}`; button.dataset.slot=index;
    button.setAttribute('aria-label',`${index+1}. ${BLOCKS[id].name}`);
    button.innerHTML=`<i class="block-icon" style="--block:${BLOCKS[id].color}"></i>`;
    button.addEventListener('pointerdown',(event)=>{event.preventDefault();selectSlot(index);}); hotbarEl.append(button);
  });
  updateHeldBlock();
}
function buildInventory() {
  inventoryGrid.innerHTML='';
  BLOCKS.slice(1).forEach(block=>{
    const button=document.createElement('button'); button.className=`inventory-item${hotbar[selectedSlot]===block.id?' selected':''}`; button.dataset.block=block.id;
    button.innerHTML=`<i class="block-icon" style="--block:${block.color}"></i><span>${block.name}</span>`;
    button.addEventListener('click',()=>{hotbar[selectedSlot]=block.id;buildHotbar();buildInventory();$('#selectedBlockName').textContent=block.name;playTone('ui');scheduleSave();});
    inventoryGrid.append(button);
  });
  $('#selectedBlockName').textContent=BLOCKS[hotbar[selectedSlot]].name;
}
function selectSlot(index) { selectedSlot=clamp(index,0,8); buildHotbar(); buildInventory(); playTone('ui'); scheduleSave(); }
function updateHeldBlock() { heldBlock.style.setProperty('--held',BLOCKS[hotbar[selectedSlot]].color); }
function swingHand() { hand.classList.remove('swing'); void hand.offsetWidth; hand.classList.add('swing'); }
function showToast(message) { toastEl.textContent=message; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toastEl.classList.remove('show'),1350); }
function pulseHaptic(duration) { if (settings.haptic && navigator.vibrate) navigator.vibrate(duration); }
function ensureAudio() {
  if (!settings.sound) return null;
  if (!audioContext) audioContext=new (window.AudioContext||window.webkitAudioContext)();
  if (audioContext.state==='suspended') audioContext.resume(); return audioContext;
}
function playTone(type,id=1) {
  const ctx=ensureAudio(); if (!ctx) return;
  const now=ctx.currentTime, osc=ctx.createOscillator(), gain=ctx.createGain();
  let f=180,d=.07,wave='square',volume=.035;
  if(type==='break'){f=90+(id%4)*22;d=.11;volume=.055;wave='sawtooth';}
  if(type==='place'){f=150+(id%5)*18;d=.065;volume=.045;}
  if(type==='jump'){f=250;d=.08;wave='triangle';}
  if(type==='step'){f=70+(Math.random()*20);d=.035;volume=.018;wave='square';}
  if(type==='ui'){f=420;d=.025;volume=.018;}
  osc.type=wave; osc.frequency.setValueAtTime(f,now); osc.frequency.exponentialRampToValueAtTime(Math.max(40,f*.72),now+d);
  gain.gain.setValueAtTime(volume,now); gain.gain.exponentialRampToValueAtTime(.0001,now+d);
  osc.connect(gain).connect(ctx.destination); osc.start(now); osc.stop(now+d+.01);
}

function showMenu() {
  mode='menu'; menu.hidden=false; hud.hidden=true; pauseOverlay.hidden=true; inventoryOverlay.hidden=true; settingsOverlay.hidden=true;
  mining=false; controls.joyX=controls.joyY=0; resetJoystick(); updateMenuMeta(); saveWorld();
}
function startGame(forceNew=false) {
  if (forceNew || !hasWorld) {
    generateWorld((Date.now() ^ Math.floor(Math.random()*0xffffffff))>>>0);
    Object.assign(player,{...generatedSpawn,vx:0,vy:0,vz:0,yaw:.25,pitch:-.08});
    hasWorld=true; hotbar=[...HOTBAR_DEFAULT]; selectedSlot=0; changedBlocks=0; buildHotbar(); buildInventory(); saveWorld();
  }
  mode='game'; menu.hidden=true; hud.hidden=false; pauseOverlay.hidden=true; inventoryOverlay.hidden=true; settingsOverlay.hidden=true;
  lastTime=performance.now(); showToast(BLOCKS[hotbar[selectedSlot]].name);
}
function pauseGame() { if(mode!=='game')return; mode='paused'; pauseOverlay.hidden=false; mining=false; $('#pauseSeed').textContent=seed.toString(16).toUpperCase(); $('#changedCount').textContent=changedBlocks; saveWorld(); }
function resumeGame() { mode='game'; pauseOverlay.hidden=true; settingsOverlay.hidden=true; lastTime=performance.now(); }
function openInventory() { if(mode!=='game')return; mode='inventory'; inventoryOverlay.hidden=false; mining=false; buildInventory(); }
function closeInventory() { inventoryOverlay.hidden=true; mode='game'; lastTime=performance.now(); }
function openSettings(from) { settingsReturn=from; settingsOverlay.hidden=false; if(from==='menu')menu.hidden=true; if(from==='paused')pauseOverlay.hidden=true; mode='settings'; syncSettingsUI(); }
function closeSettings() {
  settingsOverlay.hidden=true;
  if(settingsReturn==='menu'){menu.hidden=false;mode='menu';} else {pauseOverlay.hidden=false;mode='paused';}
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); applySettings();
}
function syncSettingsUI() {
  $('#sensitivityInput').value=settings.sensitivity; $('#sensitivityOutput').textContent=`${settings.sensitivity}%`;
  $('#distanceInput').value=settings.distance; $('#distanceOutput').textContent=settings.distance;
  $('#soundToggle i').textContent=settings.sound?'ВКЛ':'ВЫКЛ'; $('#hapticToggle i').textContent=settings.haptic?'ВКЛ':'ВЫКЛ'; $('#leftHandToggle i').textContent=settings.leftHand?'ВКЛ':'ВЫКЛ';
}
function applySettings() { appEl.classList.toggle('left-handed',settings.leftHand); }

function resetJoystick() { joystickKnob.style.transform='translate(0,0)'; controls.joyX=controls.joyY=0; controls.joystickPointer=null; }
function updateJoystick(event) {
  const rect=joystick.getBoundingClientRect(), cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
  let dx=event.clientX-cx,dy=event.clientY-cy; const max=rect.width*.34, len=Math.hypot(dx,dy);
  if(len>max){dx=dx/len*max;dy=dy/len*max;}
  controls.joyX=dx/max;controls.joyY=dy/max;joystickKnob.style.transform=`translate(${dx}px,${dy}px)`;
}
function bindHold(button,onStart,onEnd) {
  button.addEventListener('pointerdown',(e)=>{e.preventDefault();button.setPointerCapture(e.pointerId);button.classList.add('pressed');onStart();});
  const end=()=>{button.classList.remove('pressed');onEnd();}; button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);
}
function bindUi() {
  $('#continueButton').addEventListener('click',()=>startGame(false));
  $('#newWorldButton').addEventListener('click',()=>{if(!hasWorld||confirm('Создать новый мир? Текущий будет заменён.'))startGame(true);});
  $('#menuSettingsButton').addEventListener('click',()=>openSettings('menu'));
  $('#pauseButton').addEventListener('click',pauseGame); $('#resumeButton').addEventListener('click',resumeGame);
  $('#pauseSettingsButton').addEventListener('click',()=>openSettings('paused')); $('#saveExitButton').addEventListener('click',showMenu);
  $('#inventoryButton').addEventListener('pointerdown',(e)=>{e.preventDefault();openInventory();}); $('#inventoryClose').addEventListener('click',closeInventory);
  $('#settingsClose').addEventListener('click',closeSettings);
  $('#sensitivityInput').addEventListener('input',(e)=>{settings.sensitivity=Number(e.target.value);$('#sensitivityOutput').textContent=`${settings.sensitivity}%`;});
  $('#distanceInput').addEventListener('input',(e)=>{settings.distance=Number(e.target.value);$('#distanceOutput').textContent=settings.distance;});
  $('#soundToggle').addEventListener('click',()=>{settings.sound=!settings.sound;syncSettingsUI();playTone('ui');});
  $('#hapticToggle').addEventListener('click',()=>{settings.haptic=!settings.haptic;syncSettingsUI();pulseHaptic(12);});
  $('#leftHandToggle').addEventListener('click',()=>{settings.leftHand=!settings.leftHand;syncSettingsUI();applySettings();});
  $('#eraseWorldButton').addEventListener('click',()=>{if(confirm('Удалить сохранённый мир без возможности восстановления?')){localStorage.removeItem(STORAGE_KEY);hasWorld=false;changedBlocks=0;generateWorld((Date.now()^0x9e3779b9)>>>0);updateMenuMeta();closeSettings();showToast('Мир удалён');}});
  joystick.addEventListener('pointerdown',(e)=>{e.preventDefault();controls.joystickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);updateJoystick(e);});
  joystick.addEventListener('pointermove',(e)=>{if(e.pointerId===controls.joystickPointer)updateJoystick(e);});
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>joystick.addEventListener(type,(e)=>{if(e.pointerId===controls.joystickPointer)resetJoystick();}));
  lookZone.addEventListener('pointerdown',(e)=>{if(mode!=='game')return;e.preventDefault();controls.lookPointer=e.pointerId;controls.lastLookX=e.clientX;controls.lastLookY=e.clientY;lookZone.setPointerCapture(e.pointerId);});
  lookZone.addEventListener('pointermove',(e)=>{if(e.pointerId!==controls.lookPointer||mode!=='game')return;const mult=settings.sensitivity*.000095;player.yaw+=(e.clientX-controls.lastLookX)*mult;player.pitch=clamp(player.pitch-(e.clientY-controls.lastLookY)*mult,-1.38,1.38);controls.lastLookX=e.clientX;controls.lastLookY=e.clientY;});
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>lookZone.addEventListener(type,(e)=>{if(e.pointerId===controls.lookPointer)controls.lookPointer=null;}));
  bindHold($('#jumpButton'),()=>player.jumpHeld=true,()=>player.jumpHeld=false);
  bindHold($('#mineButton'),()=>{if(mode==='game'){mining=true;swingHand();}},()=>{mining=false;miningProgress=0;breakRing.classList.remove('active');});
  $('#placeButton').addEventListener('pointerdown',(e)=>{e.preventDefault();placeSelected();});
  addEventListener('keydown',(e)=>{controls.keys.add(e.code);if(/^Digit[1-9]$/.test(e.code))selectSlot(Number(e.code.slice(5))-1);if(e.code==='KeyE'&&mode==='game')openInventory();if(e.code==='Escape'){if(mode==='game')pauseGame();else if(mode==='paused')resumeGame();else if(mode==='inventory')closeInventory();}});
  addEventListener('keyup',(e)=>controls.keys.delete(e.code));
  canvas.addEventListener('contextmenu',(e)=>e.preventDefault());
  canvas.addEventListener('pointerdown',(e)=>{if(e.pointerType!=='mouse'||mode!=='game')return;if(e.button===0){mining=true;swingHand();}if(e.button===2)placeSelected();});
  addEventListener('pointerup',(e)=>{if(e.pointerType==='mouse')mining=false;});
  addEventListener('resize',resizeCanvas); addEventListener('orientationchange',resizeCanvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){saveWorld();if(mode==='game')pauseGame();}});
  addEventListener('pagehide',saveWorld);
}

function updateHud() {
  $('#coordsLabel').textContent=`${Math.floor(player.x)} · ${Math.floor(player.y)} · ${Math.floor(player.z)}`;
  const id=getBlock(Math.floor(player.x),Math.floor(player.y-.08),Math.floor(player.z));
  $('#biomeLabel').textContent=player.underwater?'ПОД ВОДОЙ':(id===4?'ПОБЕРЕЖЬЕ':player.y>18?'ВЫСОКОГОРЬЕ':'ЛУГА');
}
function loop(now) {
  const rawDt=Math.min(.05,Math.max(.001,(now-lastTime)/1000)); lastTime=now;
  frameTimeAverage=lerp(frameTimeAverage,rawDt*1000,.04);
  if(frameTimeAverage>30&&renderScale>.58){renderScale=Math.max(.58,renderScale-.04);frameTimeAverage=22;}
  if(mode==='game') { updatePhysics(rawDt,now); updateTarget(); mineTick(rawDt); updateHud(); }
  render(now);
  requestAnimationFrame(loop);
}

async function bootApp() {
  applySettings(); bindUi(); buildHotbar(); buildInventory();
  try {
    bootFill.style.width='18%'; bootText.textContent='проверяем 3D'; await new Promise(r=>setTimeout(r,30));
    if(!initRenderer()) {boot.hidden=true;unsupported.hidden=false;return;}
    bootFill.style.width='42%'; bootText.textContent='поднимаем рельеф'; await new Promise(r=>setTimeout(r,30));
    generateWorld((Date.now()^0x51f15e)>>>0);
    bootFill.style.width='72%'; bootText.textContent='ищем сохранённый мир'; await new Promise(r=>setTimeout(r,30));
    loadWorld();
    if(!hasWorld) Object.assign(player,{...generatedSpawn,vx:0,vy:0,vz:0});
    updateMenuMeta();
    bootFill.style.width='100%'; bootText.textContent='готово';
    setTimeout(()=>{boot.hidden=true;menu.hidden=false;mode='menu';},180);
    requestAnimationFrame(loop);
  } catch(error) {
    console.error(error); boot.hidden=true; unsupported.hidden=false; unsupported.querySelector('p').textContent=`3D-система не запустилась: ${error.message}`;
  }
}

bootApp();
