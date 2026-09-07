import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { ShipState, ShipTelemetry, WindState } from './core';
import { TAU, WAVE_COMPONENTS, clamp, hash2, idealSailTrim, sampleWave, smoothTo } from './core';

export type QualityMode = 'auto' | 'high' | 'medium' | 'low';

export type EnvironmentFrame = {
  waveScale: number;
  rain: number;
  storm: number;
  cloud: number;
  visibility: number;
  label: string;
  timeOfDay: number;
  wind: WindState;
};

type OarRig = { pivot: TransformNode; side: number; phase: number };

type SailRig = {
  mesh: Mesh;
  positions: Float32Array;
  base: Float32Array;
  normals: Float32Array;
  indices: number[];
};

type WorldMarker = {
  root: TransformNode;
  type: 'rock' | 'buoy' | 'wreck';
  cellX: number;
  cellZ: number;
  baseY: number;
};

type ShipBuild = {
  root: TransformNode;
  sail: SailRig;
  rudder: TransformNode;
  oars: OarRig[];
  lanterns: PointLight[];
  shadowCasters: Mesh[];
};

const waveShaderCalls = WAVE_COMPONENTS.map((wave) => `
  addWave(globalP, ${wave.direction.toFixed(8)}, ${wave.amplitude.toFixed(8)}, ${wave.wavelength.toFixed(8)}, ${wave.speed.toFixed(8)}, ${wave.steepness.toFixed(8)}, h, slope, chop);`).join('');

const oceanVertex = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float uTime;
uniform vec2 uOrigin;
uniform float uWaveScale;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;
varying float vSlope;

void addWave(in vec2 p, in float dir, in float amp, in float length, in float speed, in float steepness, inout float h, inout vec2 slope, inout vec2 chop) {
  float k = 6.28318530718 / length;
  vec2 d = vec2(sin(dir), cos(dir));
  float phase = k * dot(p, d) - speed * k * uTime;
  float a = amp * uWaveScale;
  h += sin(phase) * a;
  slope += cos(phase) * a * k * d;
  chop += d * cos(phase) * a * steepness * 0.22;
}

void main(void) {
  vec4 wp = world * vec4(position, 1.0);
  vec2 globalP = wp.xz + uOrigin;
  float h = 0.0;
  vec2 slope = vec2(0.0);
  vec2 chop = vec2(0.0);${waveShaderCalls}
  wp.xz += chop;
  wp.y += h;
  vWorldPos = wp.xyz;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  vSlope = length(slope);
  vCrest = h + vSlope * 1.75;
  gl_Position = viewProjection * wp;
}`;

const oceanFragment = `
precision highp float;
uniform vec3 uCamera;
uniform vec3 uSun;
uniform vec2 uShip;
uniform float uHeading;
uniform float uWaveScale;
uniform float uStorm;
uniform float uDay;
uniform float uCloud;
uniform float uSpeed;
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;
varying float vSlope;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main(void) {
  vec2 p = vWorldPos.xz;
  float microA = sin(dot(p, vec2(2.84, 1.77)) + uTime * 1.25);
  float microB = sin(dot(p, vec2(-4.31, 2.26)) - uTime * 1.68);
  float microC = sin(dot(p, vec2(7.2, -5.1)) + uTime * 2.22);
  vec3 n = normalize(vNormal + vec3((microA + microC * 0.35) * 0.035, 0.0, (microB - microC * 0.28) * 0.035) * (0.45 + uWaveScale * 0.32));
  vec3 viewDir = normalize(uCamera - vWorldPos);
  float ndv = max(dot(viewDir, n), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  float daylight = smoothstep(-0.18, 0.16, uDay);
  float dusk = exp(-abs(uDay) * 7.2);

  vec3 deepNight = vec3(0.004, 0.018, 0.035);
  vec3 shallowNight = vec3(0.012, 0.055, 0.075);
  vec3 deepDay = mix(vec3(0.006, 0.105, 0.135), vec3(0.012, 0.075, 0.09), uStorm);
  vec3 shallowDay = mix(vec3(0.025, 0.29, 0.33), vec3(0.055, 0.16, 0.17), uStorm);
  vec3 deep = mix(deepNight, deepDay, daylight);
  vec3 shallow = mix(shallowNight, shallowDay, daylight);
  float up = clamp(n.y, 0.0, 1.0);
  vec3 refracted = mix(deep, shallow, up * 0.72 + 0.08);

  vec3 skyLow = mix(vec3(0.018, 0.04, 0.07), vec3(0.44, 0.60, 0.62), daylight);
  vec3 skyHigh = mix(vec3(0.012, 0.026, 0.06), vec3(0.19, 0.43, 0.58), daylight);
  vec3 skyReflection = mix(skyLow, skyHigh, clamp(reflect(-viewDir, n).y * 0.5 + 0.5, 0.0, 1.0));
  skyReflection = mix(skyReflection, vec3(0.13, 0.17, 0.18), uCloud * 0.62 + uStorm * 0.2);
  skyReflection += vec3(0.42, 0.17, 0.06) * dusk * 0.18;
  vec3 water = mix(refracted, skyReflection, fresnel * 0.91);

  vec3 sunDir = normalize(-uSun);
  vec3 reflectedSun = reflect(-sunDir, n);
  float sparkleCore = pow(max(dot(reflectedSun, viewDir), 0.0), mix(92.0, 38.0, uStorm));
  float sparkleNoise = 0.52 + hash(floor(p * 6.0 + uTime * vec2(0.6, -0.35))) * 0.62;
  float sparkle = sparkleCore * sparkleNoise * daylight * (1.0 - uCloud * 0.72);

  vec2 rel = vWorldPos.xz - uShip;
  vec2 fwd = vec2(sin(uHeading), cos(uHeading));
  vec2 right = vec2(cos(uHeading), -sin(uHeading));
  float forward = dot(rel, fwd);
  float back = -forward;
  float side = dot(rel, right);
  float speedFactor = smoothstep(0.35, 4.8, uSpeed);
  float centerWake = exp(-side * side / max(0.12, 0.45 + back * 0.055)) * smoothstep(0.9, 5.2, back) * (1.0 - smoothstep(40.0, 76.0, back));
  float vLine = abs(abs(side) - max(back, 0.0) * 0.255);
  float vWake = exp(-vLine * vLine * 2.4) * smoothstep(2.0, 7.0, back) * (1.0 - smoothstep(32.0, 72.0, back));
  float bow = exp(-pow(forward - 3.7, 2.0) * 1.1 - side * side * 0.7);
  float wake = (centerWake * 0.75 + vWake * 0.82 + bow * 0.7) * speedFactor;

  float whitecapThreshold = mix(1.38, 0.72, clamp((uWaveScale - 0.5) / 1.8, 0.0, 1.0));
  float crest = smoothstep(whitecapThreshold, whitecapThreshold + 0.42, vCrest + vSlope * 0.32);
  crest *= 0.18 + uStorm * 0.82;
  float foamNoise = 0.72 + hash(floor(p * 2.4 + vec2(uTime * 0.5, -uTime * 0.33))) * 0.38;
  float foam = clamp((crest * foamNoise) + wake, 0.0, 1.0);
  vec3 foamColor = mix(vec3(0.56, 0.72, 0.72), vec3(0.91, 0.96, 0.93), daylight);

  float subsurface = pow(max(dot(-sunDir, n), 0.0), 2.0) * (1.0 - fresnel) * daylight;
  water += vec3(0.015, 0.085, 0.075) * subsurface * (0.35 + uWaveScale * 0.18);
  water += vec3(1.0, 0.79, 0.48) * sparkle * 1.75;
  water = mix(water, foamColor, foam * 0.72);
  float distanceFade = clamp(length(uCamera - vWorldPos) / 260.0, 0.0, 1.0);
  water = mix(water, skyReflection, distanceFade * 0.22);
  gl_FragColor = vec4(water, 1.0);
}`;

const skyVertex = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(void) {
  vDir = normalize(position);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

const skyFragment = `
precision highp float;
uniform vec3 uSun;
uniform float uDay;
uniform float uCloud;
uniform float uStorm;
uniform float uRain;
uniform float uTime;
varying vec3 vDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0,0.0)), f.x), mix(hash21(i + vec2(0.0,1.0)), hash21(i + vec2(1.0,1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  v += noise(p) * 0.52; p = p * 2.03 + 17.1;
  v += noise(p) * 0.27; p = p * 2.01 + 8.7;
  v += noise(p) * 0.14; p = p * 2.05 + 4.2;
  v += noise(p) * 0.07;
  return v;
}

void main(void) {
  vec3 d = normalize(vDir);
  float daylight = smoothstep(-0.17, 0.14, uDay);
  float horizon = pow(clamp(1.0 - abs(d.y), 0.0, 1.0), 3.2);
  vec3 nightTop = vec3(0.006, 0.014, 0.045);
  vec3 nightHorizon = vec3(0.025, 0.055, 0.085);
  vec3 dayTop = mix(vec3(0.15, 0.38, 0.58), vec3(0.13, 0.18, 0.21), uCloud);
  vec3 dayHorizon = mix(vec3(0.68, 0.80, 0.79), vec3(0.35, 0.40, 0.40), uCloud);
  vec3 sky = mix(mix(nightTop, nightHorizon, horizon), mix(dayTop, dayHorizon, horizon), daylight);

  float sunset = exp(-abs(uDay) * 7.0) * pow(horizon, 0.8);
  sky += vec3(0.62, 0.22, 0.055) * sunset * (1.0 - uCloud * 0.44);
  float sunDot = max(dot(d, normalize(-uSun)), 0.0);
  sky += vec3(1.0, 0.72, 0.34) * pow(sunDot, 740.0) * daylight * (1.0 - uCloud * 0.86) * 4.8;
  sky += vec3(1.0, 0.54, 0.16) * pow(sunDot, 32.0) * daylight * (1.0 - uCloud) * 0.23;
  float moonDot = max(dot(d, normalize(uSun)), 0.0);
  sky += vec3(0.62, 0.72, 0.94) * pow(moonDot, 900.0) * (1.0 - daylight) * 2.4;

  vec3 cell = floor(d * 560.0);
  float star = step(0.9975, hash21(cell.xy + cell.z)) * pow(max(d.y, 0.0), 0.28) * (1.0 - daylight) * (1.0 - uCloud);
  sky += vec3(star * 0.85);

  float denom = max(0.16, d.y + 0.42);
  vec2 cloudUv = d.xz / denom * 1.65 + vec2(uTime * 0.0038, -uTime * 0.0023);
  float cloudField = fbm(cloudUv);
  float cloudMask = smoothstep(0.48 - uCloud * 0.22, 0.72 - uCloud * 0.1, cloudField) * smoothstep(-0.05, 0.28, d.y);
  vec3 cloudLight = mix(vec3(0.17,0.19,0.2), vec3(0.82,0.84,0.81), daylight);
  cloudLight = mix(cloudLight, vec3(0.14,0.16,0.17), uStorm * 0.62 + uRain * 0.18);
  sky = mix(sky, cloudLight, cloudMask * (0.38 + uCloud * 0.54));
  sky = mix(sky, vec3(0.095, 0.12, 0.13), uStorm * 0.23);
  gl_FragColor = vec4(sky, 1.0);
}`;

Effect.ShadersStore.pelagosOceanVertexShader = oceanVertex;
Effect.ShadersStore.pelagosOceanFragmentShader = oceanFragment;
Effect.ShadersStore.pelagosSkyVertexShader = skyVertex;
Effect.ShadersStore.pelagosSkyFragmentShader = skyFragment;

function makeTexture(scene: Scene, name: string, size: number, painter: (ctx: CanvasRenderingContext2D, size: number) => void): DynamicTexture {
  const texture = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  painter(ctx, size);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.update(false);
  return texture;
}

function woodTexture(scene: Scene, name: string, dark = false): DynamicTexture {
  return makeTexture(scene, name, 256, (ctx, size) => {
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    if (dark) {
      grad.addColorStop(0, '#29170f'); grad.addColorStop(0.48, '#4a2b19'); grad.addColorStop(1, '#24150f');
    } else {
      grad.addColorStop(0, '#5f381d'); grad.addColorStop(0.5, '#8a562d'); grad.addColorStop(1, '#4d2a17');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 10) {
      ctx.strokeStyle = `rgba(22,10,5,${0.12 + (y % 30) / 180})`;
      ctx.lineWidth = 1 + (y % 3);
      ctx.beginPath();
      for (let x = 0; x <= size; x += 8) {
        const yy = y + Math.sin(x * 0.055 + y) * 2.5 + Math.sin(x * 0.017) * 3;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 7; i += 1) {
      const x = 18 + ((i * 67) % 218);
      const y = 22 + ((i * 41) % 210);
      ctx.strokeStyle = 'rgba(28,12,6,.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 10 + (i % 3) * 4, 4 + (i % 2) * 2, 0.25, 0, TAU);
      ctx.stroke();
    }
  });
}

function deckTexture(scene: Scene): DynamicTexture {
  return makeTexture(scene, 'deck-planks', 256, (ctx, size) => {
    ctx.fillStyle = '#8a6237';
    ctx.fillRect(0, 0, size, size);
    const plank = 26;
    for (let x = 0; x < size; x += plank) {
      ctx.fillStyle = x % (plank * 2) ? 'rgba(255,225,165,.055)' : 'rgba(48,24,9,.055)';
      ctx.fillRect(x, 0, plank, size);
      ctx.strokeStyle = 'rgba(32,17,8,.42)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    }
    for (let y = 0; y < size; y += 64) {
      ctx.strokeStyle = 'rgba(35,18,8,.30)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }
    for (let i = 0; i < 60; i += 1) {
      const x = (i * 43) % size; const y = (i * 79) % size;
      ctx.fillStyle = 'rgba(32,20,12,.5)';
      ctx.fillRect(x, y, 2, 2);
    }
  });
}

function sailTexture(scene: Scene): DynamicTexture {
  return makeTexture(scene, 'sail-cloth', 256, (ctx, size) => {
    ctx.fillStyle = '#cdbf96';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 4) {
      ctx.strokeStyle = y % 16 === 0 ? 'rgba(74,57,31,.12)' : 'rgba(255,255,240,.035)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }
    for (let x = 0; x < size; x += 32) {
      ctx.strokeStyle = 'rgba(71,52,28,.2)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(92,58,28,.24)';
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, size - 6, size - 6);
    ctx.fillStyle = 'rgba(110,72,34,.08)';
    ctx.beginPath(); ctx.arc(188, 82, 28, 0, TAU); ctx.fill();
  });
}

function material(scene: Scene, name: string, diffuse: Color3, specular: Color3, power: number, texture?: DynamicTexture): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = diffuse;
  mat.specularColor = specular;
  mat.specularPower = power;
  if (texture) mat.diffuseTexture = texture;
  return mat;
}

function addMesh(mesh: Mesh, parent: TransformNode, mat: StandardMaterial, casters: Mesh[], receive = true): Mesh {
  mesh.parent = parent;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.receiveShadows = receive;
  casters.push(mesh);
  return mesh;
}

const HULL_STATIONS = [
  { z: -4.35, w: 0.76, sheer: 0.14 },
  { z: -3.55, w: 1.22, sheer: 0.12 },
  { z: -2.25, w: 1.50, sheer: 0.08 },
  { z: -0.65, w: 1.62, sheer: 0.04 },
  { z: 1.05, w: 1.55, sheer: 0.06 },
  { z: 2.55, w: 1.30, sheer: 0.16 },
  { z: 3.65, w: 0.82, sheer: 0.34 },
  { z: 4.48, w: 0.12, sheer: 0.72 }
] as const;

function buildHull(scene: Scene, mat: StandardMaterial): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const ring = 7;
  for (const station of HULL_STATIONS) {
    const keel = -1.18 + Math.abs(station.z) * 0.026;
    positions.push(-station.w, station.sheer, station.z);
    positions.push(-station.w * 0.94, station.sheer - 0.42, station.z);
    positions.push(-station.w * 0.62, station.sheer - 0.84, station.z);
    positions.push(0, keel, station.z);
    positions.push(station.w * 0.62, station.sheer - 0.84, station.z);
    positions.push(station.w * 0.94, station.sheer - 0.42, station.z);
    positions.push(station.w, station.sheer, station.z);
  }
  for (let s = 0; s < HULL_STATIONS.length - 1; s += 1) {
    for (let j = 0; j < ring - 1; j += 1) {
      const a = s * ring + j;
      const b = a + 1;
      const c = (s + 1) * ring + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const closeRing = (s: number, reverse: boolean) => {
    const center = positions.length / 3;
    const station = HULL_STATIONS[s];
    positions.push(0, station.sheer - 0.45, station.z);
    for (let j = 0; j < ring - 1; j += 1) {
      const a = s * ring + j;
      const b = s * ring + j + 1;
      if (reverse) indices.push(center, b, a); else indices.push(center, a, b);
    }
  };
  closeRing(0, true);
  closeRing(HULL_STATIONS.length - 1, false);
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  const mesh = new Mesh('full-carvel-hull', scene);
  vertexData.applyToMesh(mesh);
  mesh.material = mat;
  mesh.isPickable = false;
  return mesh;
}

function buildDeck(scene: Scene, mat: StandardMaterial): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const station of HULL_STATIONS) {
    const w = Math.max(0.08, station.w - 0.08);
    const y = station.sheer + 0.025;
    positions.push(-w, y, station.z, w, y, station.z);
  }
  for (let s = 0; s < HULL_STATIONS.length - 1; s += 1) {
    const a = s * 2; const b = a + 1; const c = a + 2; const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions; data.indices = indices; data.normals = normals;
  const mesh = new Mesh('cambered-deck', scene);
  data.applyToMesh(mesh);
  mesh.material = mat;
  mesh.isPickable = false;
  return mesh;
}

function createSail(scene: Scene, sailMaterial: StandardMaterial): SailRig {
  const rows = 12;
  const cols = 10;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    const v = row / (rows - 1);
    const halfWidth = 1.82 * (1 - v * 0.66);
    for (let col = 0; col < cols; col += 1) {
      const u = col / (cols - 1);
      vertices.push((u * 2 - 1) * halfWidth, 2.45 + v * 3.62, 0.10);
    }
  }
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const a = row * cols + col; const b = a + 1; const c = a + cols; const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const normals = new Float32Array(vertices.length);
  VertexData.ComputeNormals(vertices, indices, normals);
  const data = new VertexData();
  data.positions = vertices; data.indices = indices; data.normals = normals;
  const mesh = new Mesh('working-main-sail', scene);
  data.applyToMesh(mesh, true);
  mesh.material = sailMaterial;
  mesh.isPickable = false;
  return { mesh, positions: new Float32Array(vertices), base: new Float32Array(vertices), normals, indices };
}

function buildTriangularSail(scene: Scene, name: string, points: [Vector3, Vector3, Vector3], mat: StandardMaterial): Mesh {
  const positions = points.flatMap((p) => [p.x, p.y, p.z]);
  const indices = [0, 1, 2];
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals;
  const mesh = new Mesh(name, scene); data.applyToMesh(mesh); mesh.material = mat; mesh.isPickable = false;
  return mesh;
}

function buildShip(scene: Scene): ShipBuild {
  const root = new TransformNode('ship-root', scene);
  const casters: Mesh[] = [];
  const darkWoodTex = woodTexture(scene, 'dark-wood', true);
  const woodTex = woodTexture(scene, 'warm-wood');
  const deckTex = deckTexture(scene);
  const clothTex = sailTexture(scene);
  darkWoodTex.uScale = 2.2; darkWoodTex.vScale = 5.2;
  woodTex.uScale = 2.6; woodTex.vScale = 3.8;
  deckTex.uScale = 3.0; deckTex.vScale = 1.1;
  clothTex.uScale = 1.1; clothTex.vScale = 1.2;

  const hullMat = material(scene, 'oiled-mahogany-hull', new Color3(0.31, 0.17, 0.08), new Color3(0.24, 0.16, 0.09), 58, darkWoodTex);
  const deckMat = material(scene, 'sun-bleached-deck', new Color3(0.64, 0.46, 0.25), new Color3(0.15, 0.11, 0.07), 34, deckTex);
  const wood = material(scene, 'spars-and-rails', new Color3(0.44, 0.25, 0.11), new Color3(0.18, 0.12, 0.06), 44, woodTex);
  const iron = material(scene, 'blackened-iron', new Color3(0.055, 0.065, 0.064), new Color3(0.62, 0.70, 0.68), 118);
  const brass = material(scene, 'weathered-brass', new Color3(0.44, 0.30, 0.095), new Color3(0.88, 0.65, 0.25), 128);
  const rope = material(scene, 'hemp-rigging', new Color3(0.29, 0.22, 0.14), new Color3(0.035, 0.03, 0.022), 12);
  const cloth = material(scene, 'salted-canvas', new Color3(0.86, 0.82, 0.67), new Color3(0.12, 0.10, 0.065), 24, clothTex);
  cloth.backFaceCulling = false;
  cloth.twoSidedLighting = true;

  addMesh(buildHull(scene, hullMat), root, hullMat, casters);
  addMesh(buildDeck(scene, deckMat), root, deckMat, casters);

  const keel = MeshBuilder.CreateBox('keel', { width: 0.16, height: 0.62, depth: 6.5 }, scene);
  keel.position.set(0, -1.04, -0.05);
  addMesh(keel, root, hullMat, casters);

  for (const side of [-1, 1]) {
    const railPath = HULL_STATIONS.slice(0, -1).map((s) => new Vector3(side * (s.w + 0.02), s.sheer + 0.17, s.z));
    const gunwale = MeshBuilder.CreateTube(`gunwale-${side}`, { path: railPath, radius: 0.07, tessellation: 8, cap: Mesh.CAP_ALL }, scene);
    addMesh(gunwale, root, wood, casters);
    for (let i = 1; i < HULL_STATIONS.length - 2; i += 1) {
      const s = HULL_STATIONS[i];
      const post = MeshBuilder.CreateCylinder(`rail-post-${side}-${i}`, { diameter: 0.065, height: 0.42, tessellation: 7 }, scene);
      post.position.set(side * (s.w - 0.03), s.sheer + 0.35, s.z);
      addMesh(post, root, wood, casters);
    }
    const upper = railPath.map((p) => new Vector3(p.x, p.y + 0.38, p.z));
    const upperRail = MeshBuilder.CreateTube(`upper-rail-${side}`, { path: upper, radius: 0.035, tessellation: 7, cap: Mesh.CAP_ALL }, scene);
    addMesh(upperRail, root, wood, casters);
  }

  const cabin = MeshBuilder.CreateBox('stern-cabin', { width: 2.18, height: 0.72, depth: 1.62 }, scene);
  cabin.position.set(0, 0.55, -3.15);
  addMesh(cabin, root, hullMat, casters);
  const cabinRoof = MeshBuilder.CreateBox('cabin-roof', { width: 2.42, height: 0.13, depth: 1.84 }, scene);
  cabinRoof.position.set(0, 0.96, -3.12);
  addMesh(cabinRoof, root, deckMat, casters);
  for (const side of [-1, 1]) {
    const windowMat = material(scene, `cabin-glass-${side}`, new Color3(0.035, 0.085, 0.09), new Color3(0.55, 0.75, 0.78), 150);
    const win = MeshBuilder.CreateBox(`cabin-window-${side}`, { width: 0.58, height: 0.28, depth: 0.035 }, scene);
    win.position.set(side * 0.62, 0.64, -3.98);
    addMesh(win, root, windowMat, casters, false);
  }
  const hatch = MeshBuilder.CreateBox('cargo-hatch', { width: 1.5, height: 0.14, depth: 1.15 }, scene);
  hatch.position.set(0, 0.23, -0.8);
  addMesh(hatch, root, hullMat, casters);
  for (const dx of [-0.58, 0.58]) {
    const hatchBar = MeshBuilder.CreateBox('hatch-bar', { width: 0.08, height: 0.08, depth: 1.24 }, scene);
    hatchBar.position.set(dx, 0.32, -0.8); addMesh(hatchBar, root, iron, casters);
  }
  const capstan = MeshBuilder.CreateCylinder('capstan', { diameter: 0.48, height: 0.68, tessellation: 12 }, scene);
  capstan.position.set(0, 0.48, 1.42); addMesh(capstan, root, wood, casters);
  for (let i = 0; i < 4; i += 1) {
    const bar = MeshBuilder.CreateCylinder(`capstan-bar-${i}`, { diameter: 0.055, height: 1.25, tessellation: 7 }, scene);
    bar.position.set(0, 0.72, 1.42); bar.rotation.z = Math.PI / 2; bar.rotation.y = i * Math.PI / 4;
    addMesh(bar, root, wood, casters);
  }

  const wheel = new TransformNode('helm-wheel', scene);
  wheel.position.set(0, 1.25, -2.22); wheel.parent = root; wheel.rotation.x = Math.PI / 2;
  const wheelRing = MeshBuilder.CreateTorus('wheel-ring', { diameter: 0.82, thickness: 0.07, tessellation: 20 }, scene);
  addMesh(wheelRing, wheel, wood, casters);
  for (let i = 0; i < 8; i += 1) {
    const spoke = MeshBuilder.CreateCylinder(`wheel-spoke-${i}`, { diameter: 0.045, height: 0.9, tessellation: 6 }, scene);
    spoke.rotation.z = Math.PI / 2; spoke.rotation.y = i * Math.PI / 4;
    addMesh(spoke, wheel, wood, casters);
  }
  const hub = MeshBuilder.CreateCylinder('wheel-hub', { diameter: 0.18, height: 0.18, tessellation: 10 }, scene);
  hub.rotation.x = Math.PI / 2; addMesh(hub, wheel, brass, casters);

  const mast = MeshBuilder.CreateCylinder('main-mast', { diameterTop: 0.12, diameterBottom: 0.23, height: 8.1, tessellation: 14 }, scene);
  mast.position.set(0, 3.46, 0.32); addMesh(mast, root, wood, casters);
  const yard = MeshBuilder.CreateCylinder('main-yard', { diameterTop: 0.075, diameterBottom: 0.12, height: 4.45, tessellation: 12 }, scene);
  yard.rotation.z = Math.PI / 2; yard.position.set(0, 5.63, 0.32); addMesh(yard, root, wood, casters);
  const boom = MeshBuilder.CreateCylinder('boom', { diameterTop: 0.075, diameterBottom: 0.12, height: 4.05, tessellation: 10 }, scene);
  boom.rotation.x = Math.PI / 2; boom.position.set(0, 2.42, -1.55); addMesh(boom, root, wood, casters);
  const bowsprit = MeshBuilder.CreateCylinder('bowsprit', { diameterTop: 0.075, diameterBottom: 0.15, height: 3.35, tessellation: 11 }, scene);
  bowsprit.rotation.x = Math.PI / 2; bowsprit.position.set(0, 0.92, 4.86); addMesh(bowsprit, root, wood, casters);

  for (const y of [1.22, 5.46]) {
    const band = MeshBuilder.CreateTorus(`mast-band-${y}`, { diameter: 0.26, thickness: 0.035, tessellation: 12 }, scene);
    band.rotation.x = Math.PI / 2; band.position.set(0, y, 0.32); addMesh(band, root, iron, casters);
  }

  const sail = createSail(scene, cloth);
  sail.mesh.parent = root; sail.mesh.receiveShadows = true; casters.push(sail.mesh);
  const jib = buildTriangularSail(scene, 'jib-sail', [new Vector3(0, 5.15, 0.3), new Vector3(0, 1.02, 5.82), new Vector3(0, 1.18, 1.35)], cloth);
  jib.rotation.y = 0.055; addMesh(jib, root, cloth, casters);

  const ropePaths = [
    [new Vector3(-1.28, 0.42, -3.4), new Vector3(0, 7.25, 0.32), new Vector3(-0.82, 0.48, 3.42)],
    [new Vector3(1.28, 0.42, -3.4), new Vector3(0, 7.25, 0.32), new Vector3(0.82, 0.48, 3.42)],
    [new Vector3(0, 7.25, 0.32), new Vector3(0, 0.96, 6.25)],
    [new Vector3(-2.15, 5.63, 0.32), new Vector3(-1.42, 0.48, -1.75)],
    [new Vector3(2.15, 5.63, 0.32), new Vector3(1.42, 0.48, -1.75)]
  ];
  ropePaths.forEach((path, index) => {
    const line = MeshBuilder.CreateTube(`rigging-${index}`, { path, radius: 0.014, tessellation: 5, cap: Mesh.CAP_ALL }, scene);
    addMesh(line, root, rope, casters, false);
  });

  const rudder = new TransformNode('rudder-pivot', scene);
  rudder.position.set(0, -0.15, -4.18); rudder.parent = root;
  const rudderBlade = MeshBuilder.CreateBox('rudder-blade', { width: 0.82, height: 1.32, depth: 0.11 }, scene);
  rudderBlade.position.y = -0.48; addMesh(rudderBlade, rudder, wood, casters);
  const tiller = MeshBuilder.CreateCylinder('tiller', { diameter: 0.085, height: 1.7, tessellation: 8 }, scene);
  tiller.rotation.x = Math.PI / 2; tiller.position.set(0, 0.18, 0.72); addMesh(tiller, rudder, wood, casters);

  const oars: OarRig[] = [];
  for (const side of [-1, 1]) {
    for (const z of [-1.48, 0.66]) {
      const pivot = new TransformNode(`oar-${side}-${z}`, scene);
      pivot.position.set(side * 1.18, 0.2, z); pivot.parent = root;
      const shaft = MeshBuilder.CreateCylinder('oar-shaft', { diameterTop: 0.055, diameterBottom: 0.075, height: 3.52, tessellation: 9 }, scene);
      shaft.rotation.z = Math.PI / 2; shaft.position.x = side * 1.55; addMesh(shaft, pivot, wood, casters);
      const blade = MeshBuilder.CreateBox('oar-blade', { width: 0.46, height: 0.065, depth: 0.78 }, scene);
      blade.position.x = side * 3.22; blade.rotation.y = Math.PI / 2; addMesh(blade, pivot, deckMat, casters);
      oars.push({ pivot, side, phase: z > 0 ? 0 : 0.48 });
    }
  }

  for (const side of [-1, 1]) {
    const anchorRoot = new TransformNode(`anchor-${side}`, scene);
    anchorRoot.position.set(side * 1.12, -0.02, 3.18); anchorRoot.rotation.z = side * 0.18; anchorRoot.parent = root;
    const shank = MeshBuilder.CreateCylinder('anchor-shank', { diameter: 0.075, height: 0.85, tessellation: 7 }, scene);
    shank.rotation.z = 0.12; addMesh(shank, anchorRoot, iron, casters);
    const stock = MeshBuilder.CreateCylinder('anchor-stock', { diameter: 0.055, height: 0.72, tessellation: 7 }, scene);
    stock.rotation.z = Math.PI / 2; stock.position.y = 0.22; addMesh(stock, anchorRoot, iron, casters);
    const ring = MeshBuilder.CreateTorus('anchor-ring', { diameter: 0.26, thickness: 0.045, tessellation: 12 }, scene);
    ring.position.y = 0.49; ring.rotation.x = Math.PI / 2; addMesh(ring, anchorRoot, iron, casters);
  }

  const glowMat = new StandardMaterial('lantern-glass', scene);
  glowMat.diffuseColor = new Color3(0.5, 0.24, 0.04);
  glowMat.emissiveColor = new Color3(1.0, 0.34, 0.055);
  const lanterns: PointLight[] = [];
  for (const side of [-1, 1]) {
    const frame = MeshBuilder.CreateCylinder(`lantern-frame-${side}`, { diameter: 0.2, height: 0.42, tessellation: 8 }, scene);
    frame.position.set(side * 0.92, 1.22, -3.55); addMesh(frame, root, brass, casters);
    const glow = MeshBuilder.CreateSphere(`lantern-glow-${side}`, { diameter: 0.105, segments: 7 }, scene);
    glow.position.copyFrom(frame.position); addMesh(glow, root, glowMat, casters, false);
    const light = new PointLight(`lantern-light-${side}`, frame.position.clone(), scene);
    light.diffuse = new Color3(1, 0.46, 0.16); light.intensity = 0.42; light.range = 5.5; light.parent = root;
    lanterns.push(light);
  }

  return { root, sail, rudder, oars, lanterns, shadowCasters: casters };
}

function createParticleTexture(scene: Scene): DynamicTexture {
  return makeTexture(scene, 'foam-particle', 32, (ctx) => {
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(245,255,252,1)');
    gradient.addColorStop(0.42, 'rgba(222,248,245,.74)');
    gradient.addColorStop(1, 'rgba(220,247,244,0)');
    ctx.clearRect(0, 0, 32, 32); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32);
  });
}

export class OceanWorld {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: UniversalCamera;
  readonly shipRoot: TransformNode;
  private readonly sun: DirectionalLight;
  private readonly skyLight: HemisphericLight;
  private readonly shadowGenerator: ShadowGenerator;
  private readonly ocean: Mesh;
  private readonly oceanMaterial: ShaderMaterial;
  private readonly sky: Mesh;
  private readonly skyMaterial: ShaderMaterial;
  private readonly sail: SailRig;
  private readonly rudder: TransformNode;
  private readonly oars: OarRig[];
  private readonly lanterns: PointLight[];
  private readonly spray: ParticleSystem;
  private readonly rain: ParticleSystem;
  private readonly oarSplash: ParticleSystem;
  private readonly sprayEmitter = new Vector3();
  private readonly rainEmitter = new Vector3();
  private readonly oarEmitter = new Vector3();
  private readonly originUniform = new Vector2();
  private readonly shipUniform = new Vector2();
  private readonly cameraUniform = new Vector3();
  private readonly sunUniform = new Vector3(0.2, -1, 0.3);
  private readonly cameraTarget = new Vector3();
  private readonly desiredCamera = new Vector3();
  private readonly markers: WorldMarker[] = [];
  private elapsedForMarkers = 0;
  private previousRowingPhase = 0;
  private fpsAccumulator = 0;
  private fpsSamples = 0;
  private fpsClock = 0;
  private quality: QualityMode;
  private autoScale = 1.36;

  constructor(canvas: HTMLCanvasElement, quality: QualityMode) {
    this.quality = quality;
    this.engine = new Engine(canvas, true, {
      antialias: true,
      preserveDrawingBuffer: false,
      stencil: true,
      powerPreference: 'high-performance',
      doNotHandleContextLost: false
    }, true);
    this.applyQuality(true);

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.035, 0.095, 0.11, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0017;
    this.scene.fogColor = new Color3(0.43, 0.57, 0.58);
    this.scene.imageProcessingConfiguration.exposure = 1.08;
    this.scene.imageProcessingConfiguration.contrast = 1.16;
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this.scene.skipPointerMovePicking = true;

    this.camera = new UniversalCamera('portrait-chase', new Vector3(0, 5.25, -10.8), this.scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.08;
    this.camera.maxZ = 820;
    this.camera.fov = 0.88;
    this.scene.activeCamera = this.camera;

    this.skyLight = new HemisphericLight('hemisphere', new Vector3(0.08, 1, 0.12), this.scene);
    this.skyLight.intensity = 0.78;
    this.skyLight.groundColor = new Color3(0.045, 0.07, 0.07);
    this.sun = new DirectionalLight('sun', new Vector3(-0.2, -1, 0.3), this.scene);
    this.sun.position = new Vector3(95, 140, -105);
    this.sun.intensity = 1.55;
    this.shadowGenerator = new ShadowGenerator(1024, this.sun);
    this.shadowGenerator.bias = 0.0009;
    this.shadowGenerator.normalBias = 0.03;
    this.shadowGenerator.usePercentageCloserFiltering = true;
    this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;

    this.oceanMaterial = new ShaderMaterial('ocean-material', this.scene, { vertex: 'pelagosOcean', fragment: 'pelagosOcean' }, {
      attributes: ['position'],
      uniforms: ['world', 'viewProjection', 'uTime', 'uOrigin', 'uWaveScale', 'uCamera', 'uSun', 'uShip', 'uHeading', 'uStorm', 'uDay', 'uCloud', 'uSpeed']
    });
    this.oceanMaterial.backFaceCulling = false;
    this.ocean = MeshBuilder.CreateGround('camera-relative-ocean', { width: 420, height: 420, subdivisions: 112, updatable: false }, this.scene);
    this.ocean.material = this.oceanMaterial;
    this.ocean.isPickable = false;

    this.skyMaterial = new ShaderMaterial('sky-material', this.scene, { vertex: 'pelagosSky', fragment: 'pelagosSky' }, {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'uSun', 'uDay', 'uCloud', 'uStorm', 'uRain', 'uTime']
    });
    this.skyMaterial.backFaceCulling = false;
    this.sky = MeshBuilder.CreateSphere('sky-dome', { diameter: 700, segments: 24, sideOrientation: Mesh.BACKSIDE }, this.scene);
    this.sky.material = this.skyMaterial;
    this.sky.isPickable = false;
    this.sky.infiniteDistance = true;

    const ship = buildShip(this.scene);
    this.shipRoot = ship.root;
    this.sail = ship.sail;
    this.rudder = ship.rudder;
    this.oars = ship.oars;
    this.lanterns = ship.lanterns;
    for (const mesh of ship.shadowCasters) this.shadowGenerator.addShadowCaster(mesh, false);

    const particleTexture = createParticleTexture(this.scene);
    this.spray = new ParticleSystem('bow-spray', 360, this.scene);
    this.spray.particleTexture = particleTexture;
    this.spray.emitter = this.sprayEmitter;
    this.spray.minSize = 0.03; this.spray.maxSize = 0.16;
    this.spray.minLifeTime = 0.16; this.spray.maxLifeTime = 0.62;
    this.spray.emitRate = 0;
    this.spray.direction1 = new Vector3(-0.85, 1.35, -1.1);
    this.spray.direction2 = new Vector3(0.85, 2.65, 0.4);
    this.spray.minEmitPower = 1.0; this.spray.maxEmitPower = 3.8;
    this.spray.gravity = new Vector3(0, -5.7, 0);
    this.spray.color1 = new Color4(0.86, 0.97, 0.94, 0.82);
    this.spray.color2 = new Color4(0.52, 0.76, 0.79, 0.38);
    this.spray.start();

    this.rain = new ParticleSystem('rain', 720, this.scene);
    this.rain.particleTexture = particleTexture;
    this.rain.emitter = this.rainEmitter;
    this.rain.minEmitBox = new Vector3(-15, 0, -12); this.rain.maxEmitBox = new Vector3(15, 0, 20);
    this.rain.minSize = 0.012; this.rain.maxSize = 0.028;
    this.rain.minLifeTime = 0.34; this.rain.maxLifeTime = 0.68;
    this.rain.emitRate = 0;
    this.rain.direction1 = new Vector3(-0.7, -11.5, -0.8); this.rain.direction2 = new Vector3(0.1, -15.5, 0.35);
    this.rain.minEmitPower = 1; this.rain.maxEmitPower = 1.45;
    this.rain.color1 = new Color4(0.72, 0.85, 0.91, 0.34); this.rain.color2 = new Color4(0.9, 0.94, 0.96, 0.14);
    this.rain.start();

    this.oarSplash = new ParticleSystem('oar-splash', 120, this.scene);
    this.oarSplash.particleTexture = particleTexture; this.oarSplash.emitter = this.oarEmitter; this.oarSplash.emitRate = 0;
    this.oarSplash.minSize = 0.025; this.oarSplash.maxSize = 0.13;
    this.oarSplash.minLifeTime = 0.13; this.oarSplash.maxLifeTime = 0.4;
    this.oarSplash.direction1 = new Vector3(-1.35, 1.2, -0.5); this.oarSplash.direction2 = new Vector3(1.35, 2.3, 0.8);
    this.oarSplash.minEmitPower = 0.75; this.oarSplash.maxEmitPower = 2.6;
    this.oarSplash.gravity = new Vector3(0, -5.3, 0);
    this.oarSplash.color1 = new Color4(0.78, 0.94, 0.92, 0.8); this.oarSplash.color2 = new Color4(0.48, 0.74, 0.79, 0.42);
    this.oarSplash.start();

    this.buildWorldPool();
  }

  private buildWorldPool(): void {
    const rockMat = material(this.scene, 'wet-rock', new Color3(0.11, 0.135, 0.13), new Color3(0.18, 0.24, 0.23), 48);
    const buoyMat = material(this.scene, 'weathered-buoy', new Color3(0.48, 0.095, 0.05), new Color3(0.24, 0.2, 0.15), 38);
    const wreckMat = material(this.scene, 'driftwood', new Color3(0.22, 0.13, 0.07), new Color3(0.07, 0.05, 0.035), 22, woodTexture(this.scene, 'wreck-wood', true));
    for (let index = 0; index < 15; index += 1) {
      const selector = index % 3;
      const root = new TransformNode(`world-marker-${index}`, this.scene);
      let type: WorldMarker['type'];
      let baseY = -0.1;
      if (selector === 0) {
        type = 'rock'; baseY = -0.42;
        const base = MeshBuilder.CreateSphere('rock', { diameter: 1.9, segments: 8 }, this.scene);
        base.scaling.set(1.45, 0.68, 1.0); base.position.y = -0.05; base.material = rockMat; base.parent = root; base.isPickable = false;
      } else if (selector === 1) {
        type = 'buoy'; baseY = -0.02;
        const body = MeshBuilder.CreateCylinder('buoy', { diameterTop: 0.2, diameterBottom: 0.52, height: 1.12, tessellation: 10 }, this.scene);
        body.position.y = 0.32; body.material = buoyMat; body.parent = root; body.isPickable = false;
        const pole = MeshBuilder.CreateCylinder('buoy-pole', { diameter: 0.065, height: 0.9, tessellation: 7 }, this.scene);
        pole.position.y = 1.14; pole.material = buoyMat; pole.parent = root; pole.isPickable = false;
        const ring = MeshBuilder.CreateTorus('buoy-ring', { diameter: 0.28, thickness: 0.035, tessellation: 10 }, this.scene);
        ring.position.y = 1.62; ring.material = buoyMat; ring.parent = root; ring.isPickable = false;
      } else {
        type = 'wreck'; baseY = -0.1;
        for (let timberIndex = 0; timberIndex < 3; timberIndex += 1) {
          const timber = MeshBuilder.CreateBox('wreck-timber', { width: 0.22, height: 0.18, depth: 2.7 + timberIndex * 0.35 }, this.scene);
          timber.rotation.y = -0.28 + timberIndex * 0.29; timber.position.x = (timberIndex - 1) * 0.34; timber.material = wreckMat; timber.parent = root; timber.isPickable = false;
        }
      }
      this.markers.push({ root, type, cellX: Number.NaN, cellZ: Number.NaN, baseY });
    }
  }

  setQuality(mode: QualityMode): void {
    const changedToAuto = mode === 'auto' && this.quality !== 'auto';
    this.quality = mode;
    if (changedToAuto) this.autoScale = this.recommendedAutoScale();
    this.applyQuality(false);
  }

  private recommendedAutoScale(): number {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    return Math.max(1.28, dpr / 2.1);
  }

  private applyQuality(initial: boolean): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let scale = 1.45;
    if (this.quality === 'high') scale = Math.max(1, dpr / 2.4);
    if (this.quality === 'medium') scale = Math.max(1.3, dpr / 2.05);
    if (this.quality === 'low') scale = Math.max(1.7, dpr / 1.7);
    if (this.quality === 'auto') {
      if (initial) this.autoScale = this.recommendedAutoScale();
      scale = this.autoScale;
    }
    this.engine.setHardwareScalingLevel(scale);
  }

  resize(): void {
    this.engine.resize();
  }

  update(state: ShipState, telemetry: ShipTelemetry, environment: EnvironmentFrame, time: number, dt: number, originX: number, originZ: number, lookYaw: number, lookPitch: number, rowing: number): void {
    this.shipRoot.position.set(state.x, state.y, state.z);
    this.shipRoot.rotationQuaternion = Quaternion.RotationYawPitchRoll(state.yaw, state.pitch, state.roll);
    this.rudder.rotation.y = -state.rudder * 1.02;

    this.animateSail(state, telemetry, environment, time);
    this.animateOars(state, rowing);

    const fwdX = Math.sin(state.yaw); const fwdZ = Math.cos(state.yaw);
    const rightX = Math.cos(state.yaw); const rightZ = -Math.sin(state.yaw);
    this.ocean.position.x = state.x; this.ocean.position.z = state.z;
    this.originUniform.set(originX, originZ);
    this.shipUniform.set(state.x, state.z);
    this.cameraUniform.copyFrom(this.camera.position);
    this.oceanMaterial.setFloat('uTime', time);
    this.oceanMaterial.setVector2('uOrigin', this.originUniform);
    this.oceanMaterial.setFloat('uWaveScale', environment.waveScale);
    this.oceanMaterial.setVector3('uCamera', this.cameraUniform);
    this.oceanMaterial.setVector3('uSun', this.sunUniform);
    this.oceanMaterial.setVector2('uShip', this.shipUniform);
    this.oceanMaterial.setFloat('uHeading', state.yaw);
    this.oceanMaterial.setFloat('uStorm', environment.storm);
    this.oceanMaterial.setFloat('uDay', -this.sunUniform.y);
    this.oceanMaterial.setFloat('uCloud', environment.cloud);
    this.oceanMaterial.setFloat('uSpeed', telemetry.speed);

    this.updateEnvironment(environment, time);
    this.updateCamera(state, telemetry.speed, dt, lookYaw, lookPitch);

    this.sprayEmitter.set(state.x + fwdX * 3.92, state.y - 0.16, state.z + fwdZ * 3.92);
    this.rainEmitter.set(state.x, state.y + 11, state.z + 5);
    const particleFactor = this.quality === 'low' ? 0.48 : this.quality === 'medium' ? 0.76 : 1;
    this.spray.emitRate = (16 + telemetry.speed * 28 + environment.storm * 82) * particleFactor * clamp(telemetry.speed / 0.65, 0, 1);
    this.rain.emitRate = environment.rain * 560 * particleFactor;

    if (rowing > 0.2 && state.rowingPhase < this.previousRowingPhase) {
      const side = Math.sin(time * 4.2) > 0 ? 1 : -1;
      this.oarEmitter.set(state.x + rightX * side * 3.25 - fwdX * 0.7, state.y - 0.32, state.z + rightZ * side * 3.25 - fwdZ * 0.7);
      this.oarSplash.manualEmitCount = Math.round((7 + rowing * 10) * particleFactor);
    }
    this.previousRowingPhase = state.rowingPhase;

    this.elapsedForMarkers += dt;
    if (this.elapsedForMarkers > 1.2) {
      this.elapsedForMarkers = 0;
      this.updateWorldMarkers(state);
    }
    this.animateWorldMarkers(time, environment.waveScale, originX, originZ);
    this.adaptQuality(dt);
  }

  private animateSail(state: ShipState, telemetry: ShipTelemetry, environment: EnvironmentFrame, time: number): void {
    const ideal = idealSailTrim(telemetry.windAngle);
    const load = clamp(telemetry.apparentWindSpeed / 15.5, 0, 1) * telemetry.sailEfficiency;
    const slack = 1 - clamp(load * 1.45, 0, 1);
    const billow = 0.18 + load * 0.86;
    const sign = Math.sign(Math.sin(telemetry.windAngle)) || 1;
    this.sail.mesh.rotation.y = sign * (0.1 + state.sailAngle * 0.76);
    for (let i = 0; i < this.sail.positions.length; i += 3) {
      const x = this.sail.base[i]; const y = this.sail.base[i + 1];
      const u = clamp((x / 1.82 + 1) * 0.5, 0, 1);
      const v = clamp((y - 2.45) / 3.62, 0, 1);
      const shape = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      const leech = Math.pow(u, 2.4) * v;
      const flutter = Math.sin(time * (5.4 + environment.wind.speed * 0.2) + v * 12.5 + u * 4.1) * (0.018 + slack * 0.13) * v;
      this.sail.positions[i] = x * (0.98 + load * 0.02);
      this.sail.positions[i + 1] = y + Math.sin(time * 2.3 + u * 4.4) * 0.013 * slack;
      this.sail.positions[i + 2] = this.sail.base[i + 2] + sign * (shape * billow + flutter + leech * flutter * 0.55);
    }
    VertexData.ComputeNormals(this.sail.positions, this.sail.indices, this.sail.normals);
    this.sail.mesh.updateVerticesData(VertexBuffer.PositionKind, this.sail.positions, false, false);
    this.sail.mesh.updateVerticesData(VertexBuffer.NormalKind, this.sail.normals, false, false);
    this.sail.mesh.scaling.y = 0.992 + ideal * 0.008;
  }

  private animateOars(state: ShipState, rowing: number): void {
    for (const oar of this.oars) {
      const phase = ((state.rowingPhase + oar.phase) % 1) * TAU;
      const active = clamp(rowing, 0, 1);
      const sweep = Math.sin(phase) * 0.44 * active;
      const dip = Math.max(0, Math.sin(phase + Math.PI * 0.16)) * 0.34 * active;
      oar.pivot.rotation.y = sweep * oar.side;
      oar.pivot.rotation.z = oar.side * (0.11 + dip);
      oar.pivot.rotation.x = -0.08 - dip * 0.52;
    }
  }

  private updateCamera(state: ShipState, speed: number, dt: number, lookYaw: number, lookPitch: number): void {
    const cameraYaw = state.yaw + lookYaw;
    const fwdX = Math.sin(cameraYaw); const fwdZ = Math.cos(cameraYaw);
    const distance = 9.8 + clamp(speed, 0, 8) * 0.36;
    const height = 4.82 + clamp(speed, 0, 8) * 0.1 + lookPitch * 1.7;
    this.desiredCamera.set(state.x - fwdX * distance, state.y + height, state.z - fwdZ * distance);
    this.camera.position.x = smoothTo(this.camera.position.x, this.desiredCamera.x, 3.4, dt);
    this.camera.position.y = smoothTo(this.camera.position.y, this.desiredCamera.y, 2.35, dt);
    this.camera.position.z = smoothTo(this.camera.position.z, this.desiredCamera.z, 3.4, dt);
    const shipFwdX = Math.sin(state.yaw); const shipFwdZ = Math.cos(state.yaw);
    this.cameraTarget.set(state.x + shipFwdX * (6.0 + speed * 0.5), state.y + 1.02 + lookPitch * 1.15, state.z + shipFwdZ * (6.0 + speed * 0.5));
    this.camera.setTarget(this.cameraTarget);
    this.camera.fov = smoothTo(this.camera.fov, 0.875 + clamp(speed / 9, 0, 1) * 0.09, 2.5, dt);
    this.sky.position.copyFrom(this.camera.position);
  }

  private updateEnvironment(environment: EnvironmentFrame, time: number): void {
    const sunAngle = (environment.timeOfDay - 0.25) * TAU;
    const elevation = Math.sin(sunAngle);
    const horizontal = Math.cos(sunAngle);
    this.sunUniform.set(horizontal * 0.5, -elevation, 0.34);
    this.sun.direction.copyFrom(this.sunUniform);
    const daylight = clamp((elevation + 0.12) / 0.42, 0, 1);
    this.sun.intensity = (0.06 + daylight * 1.8) * (1 - environment.cloud * 0.46);
    this.sun.diffuse = Color3.Lerp(new Color3(0.42, 0.5, 0.72), new Color3(1, 0.84, 0.6), daylight);
    this.skyLight.intensity = 0.14 + daylight * 0.76;
    this.skyLight.diffuse = Color3.Lerp(new Color3(0.15, 0.22, 0.36), new Color3(0.72, 0.84, 0.82), daylight);
    this.scene.fogDensity = 0.00135 + (1 - environment.visibility) * 0.0098 + environment.rain * 0.0022;
    this.scene.fogColor = Color3.Lerp(new Color3(0.07, 0.105, 0.13), new Color3(0.47, 0.59, 0.59), daylight * (1 - environment.storm * 0.36));
    this.scene.clearColor = new Color4(this.scene.fogColor.r, this.scene.fogColor.g, this.scene.fogColor.b, 1);
    this.skyMaterial.setVector3('uSun', this.sunUniform);
    this.skyMaterial.setFloat('uDay', elevation);
    this.skyMaterial.setFloat('uCloud', environment.cloud);
    this.skyMaterial.setFloat('uStorm', environment.storm);
    this.skyMaterial.setFloat('uRain', environment.rain);
    this.skyMaterial.setFloat('uTime', time);
    const night = 1 - daylight;
    for (let i = 0; i < this.lanterns.length; i += 1) this.lanterns[i].intensity = 0.18 + night * 0.95 + environment.storm * 0.18;
  }

  private updateWorldMarkers(state: ShipState): void {
    const cellSize = 104;
    const baseX = Math.floor(state.worldX / cellSize);
    const baseZ = Math.floor(state.worldZ / cellSize);
    for (let index = 0; index < this.markers.length; index += 1) {
      const marker = this.markers[index];
      const ring = 2 + (index % 4);
      const angle = index / this.markers.length * TAU + hash2(baseX + index, baseZ - index) * 1.3;
      const cellX = baseX + Math.round(Math.sin(angle) * ring);
      const cellZ = baseZ + Math.round(Math.cos(angle) * ring);
      if (marker.cellX === cellX && marker.cellZ === cellZ) continue;
      marker.cellX = cellX; marker.cellZ = cellZ;
      const jitterX = (hash2(cellX * 5 + 3, cellZ * 7 - 2) - 0.5) * cellSize * 0.58;
      const jitterZ = (hash2(cellX * 11 - 5, cellZ * 13 + 4) - 0.5) * cellSize * 0.58;
      const globalX = cellX * cellSize + jitterX; const globalZ = cellZ * cellSize + jitterZ;
      marker.root.position.x = state.x + (globalX - state.worldX);
      marker.root.position.z = state.z + (globalZ - state.worldZ);
      const random = hash2(cellX * 19, cellZ * 23);
      const scale = marker.type === 'rock' ? 0.7 + random * 1.9 : marker.type === 'buoy' ? 0.78 + random * 0.3 : 0.75 + random * 0.65;
      marker.root.scaling.setAll(scale);
      marker.root.rotation.y = random * TAU;
      marker.root.setEnabled(random > (marker.type === 'rock' ? 0.28 : 0.5));
    }
  }

  private animateWorldMarkers(time: number, waveScale: number, originX: number, originZ: number): void {
    for (const marker of this.markers) {
      if (!marker.root.isEnabled()) continue;
      const water = sampleWave(marker.root.position.x + originX, marker.root.position.z + originZ, time, waveScale);
      if (marker.type === 'rock') {
        marker.root.position.y = marker.baseY + water.height * 0.12;
      } else {
        marker.root.position.y = marker.baseY + water.height;
        marker.root.rotation.x = clamp(-water.normalZ * 0.35, -0.22, 0.22);
        marker.root.rotation.z = clamp(water.normalX * 0.35, -0.22, 0.22);
      }
    }
  }

  private adaptQuality(dt: number): void {
    if (this.quality !== 'auto') return;
    const fps = this.engine.getFps();
    if (!Number.isFinite(fps) || fps <= 0) return;
    this.fpsAccumulator += fps; this.fpsSamples += 1; this.fpsClock += dt;
    if (this.fpsClock < 3.0) return;
    const average = this.fpsAccumulator / Math.max(1, this.fpsSamples);
    this.fpsAccumulator = 0; this.fpsSamples = 0; this.fpsClock = 0;
    if (average < 46 && this.autoScale < 2.15) this.autoScale = Math.min(2.15, this.autoScale + 0.13);
    else if (average > 58.5 && this.autoScale > 1.16) this.autoScale = Math.max(1.16, this.autoScale - 0.05);
    this.engine.setHardwareScalingLevel(this.autoScale);
    document.documentElement.dataset.fps = average.toFixed(0);
    document.documentElement.dataset.qualityScale = this.autoScale.toFixed(2);
  }

  render(): void {
    this.scene.render();
  }

  dispose(): void {
    this.shadowGenerator.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
