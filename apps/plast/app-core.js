const APP_VERSION = '1.1.0';
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
const ITEMS = {
  100:{id:100,key:'apple',name:'Яблоко',color:'#c84b3d',type:'food',food:4},
  101:{id:101,key:'meat',name:'Провиант',color:'#c9826d',type:'food',food:3}
};
function itemSpec(id){return ITEMS[id]||BLOCKS[id]||BLOCKS[1];}
function isValidItemId(id){return Boolean(ITEMS[id]||BLOCKS[id]&&id>0);}
const HOTBAR_DEFAULT = [1,2,3,4,6,8,9,10,11];
const WORLD_NAMES = ['ЗЕЛЁНЫЙ РАЗЛОМ','ТИХАЯ ГРЯДА','МОКРЫЙ КРЯЖ','ПЕСЧАНЫЙ ШОВ','СЕВЕРНЫЙ ПЛАСТ','ДОЛИНА КУБОВ'];

const $ = (selector) => document.querySelector(selector);
const appEl = $('#app');
const canvas = $('#world');
const entityCanvas = $('#entities');
const entityCtx = entityCanvas.getContext('2d', {alpha:true});
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
const sprintVignette = $('#sprintVignette');
const healthBar = $('#healthBar');
const hungerBar = $('#hungerBar');
const airBar = $('#airBar');

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
let supplies = {apple:2, meat:0};
let selectedSlot = 0;
let mode = 'boot';
let settingsReturn = 'menu';
let generatedSpawn = {x:WORLD_X/2+.5, y:18, z:WORLD_Z/2+.5};
let target = null;
let entityTarget = null;
let worldTime = .31;
let worldDay = 1;
let entities = [];
let particles = [];
let survivalTick = 0;
let regenerationTick = 0;
let drowningTick = 0;
let hitCooldown = 0;
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
let currentFov = .72;
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
  jumpHeld: false,
  crouching: false,
  sprinting: false,
  health: 20,
  hunger: 20,
  air: 10,
  walkPhase: 0
};
const controls = {
  joyX: 0,
  joyY: 0,
  joystickPointer: null,
  lookPointer: null,
  lastLookX: 0,
  lastLookY: 0,
  lastForwardTap: 0,
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
uniform vec3 uSunDir;
uniform float uDaylight;
uniform float uBreakProgress;
uniform float uFov;
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
  float day = clamp(uDaylight, 0.0, 1.0);
  vec3 daySky = mix(vec3(.72,.86,.93), vec3(.28,.61,.88), h);
  vec3 duskSky = mix(vec3(.72,.31,.23), vec3(.10,.12,.28), h);
  vec3 nightSky = mix(vec3(.055,.075,.12), vec3(.008,.018,.055), h);
  float horizonGlow = (1.0-day) * smoothstep(-.18,.08,uSunDir.y) * (1.0-smoothstep(.08,.32,uSunDir.y));
  vec3 sky = mix(nightSky, daySky, day);
  sky = mix(sky, duskSky, horizonGlow * .72);
  float sun = pow(max(dot(rd, uSunDir), 0.0), 720.0);
  float glow = pow(max(dot(rd, uSunDir), 0.0), 9.0);
  sky += vec3(1.0,.82,.46) * sun * (1.25 + day*.65) + vec3(1.0,.62,.28) * glow * .17;
  vec3 moonDir = -uSunDir;
  float moon = pow(max(dot(rd, moonDir), 0.0), 520.0) * (1.0-day);
  sky += vec3(.68,.79,1.0) * moon * 1.1;
  if (rd.y > .02) {
    vec2 starUv = floor((rd.xz / max(rd.y + .18,.04)) * 94.0);
    float stars = step(.9925, hash21(starUv));
    stars *= smoothstep(.03,.35,rd.y) * (1.0-day);
    sky += vec3(.72,.82,1.0) * stars * 1.25;
    vec2 cloudPos = rd.xz / max(rd.y, .04) * 2.2 + vec2(uTime * .006, 0.0);
    float cloud = hash21(floor(cloudPos * 2.0));
    cloud = smoothstep(.67,.82,cloud) * smoothstep(.02,.18,rd.y);
    sky = mix(sky, mix(vec3(.20,.23,.30),vec3(.96,.98,1.0),day), cloud * mix(.20,.48,day));
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
  vec3 rd = normalize(uCamera * vec3(uv * uFov, 1.0));
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
      float diffuse = mix(.27,.55,uDaylight) + max(dot(normal,uSunDir),0.0)*mix(.16,.45,uDaylight);
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
        if (uBreakProgress > 0.0) {
          vec2 crackUv = floor(fuv * 32.0);
          float crack = step(1.0-uBreakProgress*.31, hash21(crackUv + floor(uBreakProgress*7.0)*19.0));
          c *= 1.0 - crack * .58;
        }
      }
      float fog = smoothstep(uMaxDistance*.48,uMaxDistance,travel);
      c = mix(c,sky,fog);
      if (waterT >= 0.0) {
        float depth = clamp((travel-waterT)*.11,0.0,.72);
        vec3 wc = mix(vec3(.18,.55,.74),vec3(.04,.24,.38),depth);
        c = mix(c,wc,.27+depth*.55);
        float sparkle = pow(max(dot(reflect(rd,waterNormal),uSunDir),0.0),42.0);
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

