import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { ShipState, ShipTelemetry, WindState } from './core';
import { DEG, TAU, WAVE_COMPONENTS, clamp, hash2, idealSailTrim, smoothTo } from './core';

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

type WorldMarker = {
  root: TransformNode;
  type: 'rock' | 'buoy' | 'wreck';
  cellX: number;
  cellZ: number;
};

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

void addWave(in vec2 p, in float dir, in float amp, in float length, in float speed, inout float h, inout vec2 slope) {
  float k = 6.28318530718 / length;
  vec2 d = vec2(sin(dir), cos(dir));
  float phase = k * dot(p, d) - speed * k * uTime;
  h += sin(phase) * amp * uWaveScale;
  slope += cos(phase) * amp * uWaveScale * k * d;
}

void main(void) {
  vec4 wp = world * vec4(position, 1.0);
  vec2 globalP = wp.xz + uOrigin;
  float h = 0.0;
  vec2 slope = vec2(0.0);
  addWave(globalP, ${WAVE_COMPONENTS[0].direction.toFixed(8)}, ${WAVE_COMPONENTS[0].amplitude.toFixed(8)}, ${WAVE_COMPONENTS[0].wavelength.toFixed(8)}, ${WAVE_COMPONENTS[0].speed.toFixed(8)}, h, slope);
  addWave(globalP, ${WAVE_COMPONENTS[1].direction.toFixed(8)}, ${WAVE_COMPONENTS[1].amplitude.toFixed(8)}, ${WAVE_COMPONENTS[1].wavelength.toFixed(8)}, ${WAVE_COMPONENTS[1].speed.toFixed(8)}, h, slope);
  addWave(globalP, ${WAVE_COMPONENTS[2].direction.toFixed(8)}, ${WAVE_COMPONENTS[2].amplitude.toFixed(8)}, ${WAVE_COMPONENTS[2].wavelength.toFixed(8)}, ${WAVE_COMPONENTS[2].speed.toFixed(8)}, h, slope);
  addWave(globalP, ${WAVE_COMPONENTS[3].direction.toFixed(8)}, ${WAVE_COMPONENTS[3].amplitude.toFixed(8)}, ${WAVE_COMPONENTS[3].wavelength.toFixed(8)}, ${WAVE_COMPONENTS[3].speed.toFixed(8)}, h, slope);
  addWave(globalP, ${WAVE_COMPONENTS[4].direction.toFixed(8)}, ${WAVE_COMPONENTS[4].amplitude.toFixed(8)}, ${WAVE_COMPONENTS[4].wavelength.toFixed(8)}, ${WAVE_COMPONENTS[4].speed.toFixed(8)}, h, slope);
  wp.y += h;
  vWorldPos = wp.xyz;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  vCrest = h + length(slope) * 1.9;
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
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main(void) {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(uCamera - vWorldPos);
  float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 4.2);
  float daylight = smoothstep(-0.18, 0.15, uDay);
  vec3 deepDay = vec3(0.015, 0.17, 0.19);
  vec3 shallowDay = vec3(0.055, 0.34, 0.37);
  vec3 deepNight = vec3(0.006, 0.025, 0.055);
  vec3 shallowNight = vec3(0.025, 0.09, 0.15);
  vec3 deep = mix(deepNight, deepDay, daylight);
  vec3 shallow = mix(shallowNight, shallowDay, daylight);
  float facing = clamp(n.y, 0.0, 1.0);
  vec3 water = mix(deep, shallow, facing * 0.62 + fresnel * 0.24);
  vec3 sky = mix(vec3(0.035, 0.07, 0.11), vec3(0.34, 0.57, 0.62), daylight * (1.0 - uCloud * 0.32));
  water = mix(water, sky, fresnel * 0.72);

  vec3 reflected = reflect(-normalize(uSun), n);
  float sparkle = pow(max(dot(reflected, viewDir), 0.0), mix(54.0, 112.0, 1.0 - uStorm));
  sparkle *= daylight * (1.0 - uCloud * 0.74);

  vec2 rel = vWorldPos.xz - uShip;
  vec2 fwd = vec2(sin(uHeading), cos(uHeading));
  vec2 right = vec2(cos(uHeading), -sin(uHeading));
  float back = -dot(rel, fwd);
  float side = abs(dot(rel, right));
  float wakeWidth = 0.62 + max(back, 0.0) * 0.11;
  float wake = exp(-side * side / max(0.2, wakeWidth * wakeWidth)) * smoothstep(0.5, 7.0, back) * (1.0 - smoothstep(32.0, 68.0, back));
  wake *= clamp(uSpeed / 4.2, 0.0, 1.0);

  float micro = hash(floor(vWorldPos.xz * 2.1 + vec2(vWorldPos.y * 5.0))) * 0.035;
  float crest = smoothstep(0.72, 1.42 + uWaveScale * 0.12, vCrest) * (0.28 + uStorm * 0.72);
  float foam = clamp(crest + wake * 0.78, 0.0, 1.0);
  vec3 foamColor = mix(vec3(0.66, 0.82, 0.81), vec3(0.86, 0.94, 0.91), daylight);
  water += vec3(sparkle * 1.28 + micro);
  water = mix(water, foamColor, foam * 0.58);
  gl_FragColor = vec4(water, 0.985);
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
varying vec3 vDir;
float hash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
void main(void) {
  vec3 d = normalize(vDir);
  float daylight = smoothstep(-0.17, 0.14, uDay);
  float horizon = pow(clamp(1.0 - abs(d.y), 0.0, 1.0), 3.0);
  vec3 nightTop = vec3(0.008, 0.018, 0.055);
  vec3 nightHorizon = vec3(0.035, 0.07, 0.10);
  vec3 dayTop = mix(vec3(0.19, 0.45, 0.62), vec3(0.17, 0.25, 0.29), uCloud);
  vec3 dayHorizon = mix(vec3(0.72, 0.82, 0.79), vec3(0.39, 0.45, 0.45), uCloud);
  vec3 sky = mix(mix(nightTop, nightHorizon, horizon), mix(dayTop, dayHorizon, horizon), daylight);
  float sunset = exp(-abs(uDay) * 8.0) * horizon;
  sky += vec3(0.48, 0.18, 0.055) * sunset * (1.0 - uCloud * 0.35);
  float sunDot = max(dot(d, normalize(-uSun)), 0.0);
  sky += vec3(1.0, 0.74, 0.36) * pow(sunDot, 620.0) * daylight * (1.0 - uCloud * 0.85) * 4.0;
  float moonDot = max(dot(d, normalize(uSun)), 0.0);
  sky += vec3(0.62, 0.72, 0.92) * pow(moonDot, 780.0) * (1.0 - daylight) * 2.2;
  vec3 cell = floor(d * 520.0);
  float star = step(0.997, hash3(cell)) * pow(max(d.y, 0.0), 0.35) * (1.0 - daylight) * (1.0 - uCloud);
  sky += vec3(star * 0.9);
  sky = mix(sky, vec3(0.12, 0.16, 0.17), uStorm * 0.36);
  gl_FragColor = vec4(sky, 1.0);
}`;

Effect.ShadersStore.pelagosOceanVertexShader = oceanVertex;
Effect.ShadersStore.pelagosOceanFragmentShader = oceanFragment;
Effect.ShadersStore.pelagosSkyVertexShader = skyVertex;
Effect.ShadersStore.pelagosSkyFragmentShader = skyFragment;

function material(scene: Scene, name: string, diffuse: Color3, specular: Color3, power: number): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = diffuse;
  mat.specularColor = specular;
  mat.specularPower = power;
  return mat;
}

function buildHull(scene: Scene, mat: StandardMaterial): Mesh {
  const stations = [
    { z: -4.2, w: 0.92, y: -0.08 },
    { z: -3.0, w: 1.42, y: 0 },
    { z: -1.2, w: 1.62, y: 0.03 },
    { z: 1.0, w: 1.52, y: 0.06 },
    { z: 2.9, w: 1.18, y: 0.14 },
    { z: 4.45, w: 0.16, y: 0.5 }
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const station of stations) {
    const keel = -1.12 + Math.abs(station.z) * 0.035;
    positions.push(-station.w, station.y, station.z);
    positions.push(-station.w * 0.82, station.y - 0.68, station.z);
    positions.push(0, keel, station.z);
    positions.push(station.w * 0.82, station.y - 0.68, station.z);
    positions.push(station.w, station.y, station.z);
  }
  for (let s = 0; s < stations.length - 1; s += 1) {
    for (let j = 0; j < 4; j += 1) {
      const a = s * 5 + j;
      const b = a + 1;
      const c = (s + 1) * 5 + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  const mesh = new Mesh('carved-hull', scene);
  vertexData.applyToMesh(mesh);
  mesh.material = mat;
  mesh.isPickable = false;
  return mesh;
}

function createSail(scene: Scene, sailMaterial: StandardMaterial): { mesh: Mesh; positions: Float32Array; base: Float32Array } {
  const rows = 7;
  const cols = 6;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    const v = row / (rows - 1);
    const halfWidth = 1.72 * (1 - v * 0.63);
    for (let col = 0; col < cols; col += 1) {
      const u = col / (cols - 1);
      vertices.push((u * 2 - 1) * halfWidth, 2.55 + v * 3.35, 0.08);
    }
  }
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(vertices, indices, normals);
  const data = new VertexData();
  data.positions = vertices;
  data.indices = indices;
  data.normals = normals;
  const mesh = new Mesh('main-sail', scene);
  data.applyToMesh(mesh, true);
  mesh.material = sailMaterial;
  mesh.isPickable = false;
  const base = new Float32Array(vertices);
  return { mesh, positions: new Float32Array(vertices), base };
}

function buildShip(scene: Scene): {
  root: TransformNode;
  sail: Mesh;
  sailPositions: Float32Array;
  sailBase: Float32Array;
  rudder: TransformNode;
  oars: OarRig[];
} {
  const root = new TransformNode('ship-root', scene);
  const wood = material(scene, 'aged-walnut', new Color3(0.23, 0.105, 0.047), new Color3(0.18, 0.12, 0.07), 48);
  const deckMat = material(scene, 'salted-deck', new Color3(0.46, 0.28, 0.13), new Color3(0.16, 0.12, 0.07), 38);
  const metal = material(scene, 'iron', new Color3(0.12, 0.14, 0.14), new Color3(0.64, 0.72, 0.68), 92);
  const ropeMat = material(scene, 'rope', new Color3(0.31, 0.23, 0.15), new Color3(0.05, 0.05, 0.04), 16);
  const sailMat = material(scene, 'canvas-sail', new Color3(0.76, 0.72, 0.58), new Color3(0.16, 0.14, 0.09), 28);
  sailMat.backFaceCulling = false;
  sailMat.twoSidedLighting = true;

  const hull = buildHull(scene, wood);
  hull.parent = root;
  const deck = MeshBuilder.CreateBox('deck', { width: 2.62, height: 0.14, depth: 6.8 }, scene);
  deck.position.y = 0.02;
  deck.position.z = -0.12;
  deck.material = deckMat;
  deck.parent = root;

  const sternDeck = MeshBuilder.CreateBox('stern-deck', { width: 2.48, height: 0.34, depth: 1.62 }, scene);
  sternDeck.position.set(0, 0.34, -3.02);
  sternDeck.material = deckMat;
  sternDeck.parent = root;

  const bowRail = MeshBuilder.CreateBox('bow-rail', { width: 2.1, height: 0.16, depth: 0.16 }, scene);
  bowRail.position.set(0, 0.52, 2.95);
  bowRail.material = wood;
  bowRail.parent = root;

  const mast = MeshBuilder.CreateCylinder('mast', { diameterTop: 0.12, diameterBottom: 0.2, height: 7.7, tessellation: 12 }, scene);
  mast.position.set(0, 3.36, 0.18);
  mast.material = wood;
  mast.parent = root;
  const yard = MeshBuilder.CreateCylinder('yard', { diameter: 0.11, height: 4.1, tessellation: 10 }, scene);
  yard.rotation.z = Math.PI / 2;
  yard.position.set(0, 5.56, 0.18);
  yard.material = wood;
  yard.parent = root;

  const sailRig = createSail(scene, sailMat);
  sailRig.mesh.parent = root;

  const bowsprit = MeshBuilder.CreateCylinder('bowsprit', { diameter: 0.13, height: 3.0, tessellation: 10 }, scene);
  bowsprit.rotation.x = Math.PI / 2;
  bowsprit.position.set(0, 0.82, 4.65);
  bowsprit.material = wood;
  bowsprit.parent = root;

  const metalBandA = MeshBuilder.CreateTorus('mast-band-a', { diameter: 0.25, thickness: 0.035, tessellation: 12 }, scene);
  metalBandA.rotation.x = Math.PI / 2;
  metalBandA.position.set(0, 1.25, 0.18);
  metalBandA.material = metal;
  metalBandA.parent = root;
  const metalBandB = metalBandA.clone('mast-band-b');
  if (metalBandB) {
    metalBandB.position.y = 5.45;
    metalBandB.parent = root;
  }

  const ropePaths = [
    [new Vector3(-1.34, 0.36, -2.8), new Vector3(0, 6.9, 0.18), new Vector3(-0.86, 0.35, 2.7)],
    [new Vector3(1.34, 0.36, -2.8), new Vector3(0, 6.9, 0.18), new Vector3(0.86, 0.35, 2.7)],
    [new Vector3(0, 6.9, 0.18), new Vector3(0, 0.9, 5.45)]
  ];
  ropePaths.forEach((path, index) => {
    const rope = MeshBuilder.CreateTube(`rigging-${index}`, { path, radius: 0.018, tessellation: 5, cap: Mesh.CAP_ALL }, scene);
    rope.material = ropeMat;
    rope.parent = root;
  });

  const rudder = new TransformNode('rudder-pivot', scene);
  rudder.position.set(0, -0.25, -4.14);
  rudder.parent = root;
  const rudderBlade = MeshBuilder.CreateBox('rudder', { width: 0.78, height: 1.18, depth: 0.12 }, scene);
  rudderBlade.position.y = -0.35;
  rudderBlade.material = wood;
  rudderBlade.parent = rudder;
  const tiller = MeshBuilder.CreateCylinder('tiller', { diameter: 0.09, height: 1.6, tessellation: 8 }, scene);
  tiller.rotation.x = Math.PI / 2;
  tiller.position.set(0, 0.2, 0.65);
  tiller.material = wood;
  tiller.parent = rudder;

  const oars: OarRig[] = [];
  for (const side of [-1, 1]) {
    for (const z of [-1.45, 0.65]) {
      const pivot = new TransformNode(`oar-${side}-${z}`, scene);
      pivot.position.set(side * 1.22, 0.18, z);
      pivot.parent = root;
      const shaft = MeshBuilder.CreateCylinder('oar-shaft', { diameter: 0.07, height: 3.35, tessellation: 8 }, scene);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = side * 1.48;
      shaft.material = wood;
      shaft.parent = pivot;
      const blade = MeshBuilder.CreateBox('oar-blade', { width: 0.42, height: 0.08, depth: 0.7 }, scene);
      blade.position.x = side * 3.05;
      blade.rotation.y = Math.PI / 2;
      blade.material = deckMat;
      blade.parent = pivot;
      oars.push({ pivot, side, phase: z > 0 ? 0 : 0.48 });
    }
  }

  const lanternMat = material(scene, 'lantern-metal', new Color3(0.18, 0.13, 0.08), new Color3(0.7, 0.42, 0.12), 88);
  const glowMat = new StandardMaterial('lantern-glow', scene);
  glowMat.diffuseColor = new Color3(0.8, 0.4, 0.08);
  glowMat.emissiveColor = new Color3(1.0, 0.38, 0.06);
  for (const side of [-1, 1]) {
    const frame = MeshBuilder.CreateCylinder('lantern-frame', { diameter: 0.18, height: 0.38, tessellation: 8 }, scene);
    frame.position.set(side * 0.88, 0.72, -3.44);
    frame.material = lanternMat;
    frame.parent = root;
    const glow = MeshBuilder.CreateSphere('lantern-glow-core', { diameter: 0.09, segments: 6 }, scene);
    glow.position.copyFrom(frame.position);
    glow.material = glowMat;
    glow.parent = root;
  }

  return { root, sail: sailRig.mesh, sailPositions: sailRig.positions, sailBase: sailRig.base, rudder, oars };
}

function createParticleTexture(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture('foam-particle', { width: 32, height: 32 }, scene, false);
  const context = texture.getContext();
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(240,255,252,1)');
  gradient.addColorStop(0.45, 'rgba(220,247,244,.7)');
  gradient.addColorStop(1, 'rgba(220,247,244,0)');
  context.clearRect(0, 0, 32, 32);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

export class OceanWorld {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: UniversalCamera;
  readonly shipRoot: TransformNode;
  private readonly sun: DirectionalLight;
  private readonly skyLight: HemisphericLight;
  private readonly ocean: Mesh;
  private readonly oceanMaterial: ShaderMaterial;
  private readonly sky: Mesh;
  private readonly skyMaterial: ShaderMaterial;
  private readonly sail: Mesh;
  private readonly sailPositions: Float32Array;
  private readonly sailBase: Float32Array;
  private readonly rudder: TransformNode;
  private readonly oars: OarRig[];
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
  private autoScale = 1.35;

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
    this.scene.clearColor = new Color4(0.04, 0.12, 0.14, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0019;
    this.scene.fogColor = new Color3(0.45, 0.59, 0.59);
    this.scene.imageProcessingConfiguration.exposure = 1.03;
    this.scene.imageProcessingConfiguration.contrast = 1.12;
    this.scene.skipPointerMovePicking = true;

    this.camera = new UniversalCamera('portrait-chase', new Vector3(0, 5.4, -10.5), this.scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.08;
    this.camera.maxZ = 760;
    this.camera.fov = 0.92;
    this.scene.activeCamera = this.camera;

    this.skyLight = new HemisphericLight('hemisphere', new Vector3(0.1, 1, 0.18), this.scene);
    this.skyLight.intensity = 0.82;
    this.skyLight.groundColor = new Color3(0.055, 0.09, 0.09);
    this.sun = new DirectionalLight('sun', new Vector3(-0.2, -1, 0.3), this.scene);
    this.sun.position = new Vector3(80, 120, -80);
    this.sun.intensity = 1.4;

    this.oceanMaterial = new ShaderMaterial('ocean-material', this.scene, { vertex: 'pelagosOcean', fragment: 'pelagosOcean' }, {
      attributes: ['position'],
      uniforms: ['world', 'viewProjection', 'uTime', 'uOrigin', 'uWaveScale', 'uCamera', 'uSun', 'uShip', 'uHeading', 'uStorm', 'uDay', 'uCloud', 'uSpeed']
    });
    this.oceanMaterial.backFaceCulling = false;
    this.ocean = MeshBuilder.CreateGround('camera-relative-ocean', { width: 360, height: 360, subdivisions: 96, updatable: false }, this.scene);
    this.ocean.material = this.oceanMaterial;
    this.ocean.isPickable = false;

    this.skyMaterial = new ShaderMaterial('sky-material', this.scene, { vertex: 'pelagosSky', fragment: 'pelagosSky' }, {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'uSun', 'uDay', 'uCloud', 'uStorm']
    });
    this.skyMaterial.backFaceCulling = false;
    this.sky = MeshBuilder.CreateSphere('sky-dome', { diameter: 640, segments: 18, sideOrientation: Mesh.BACKSIDE }, this.scene);
    this.sky.material = this.skyMaterial;
    this.sky.isPickable = false;
    this.sky.infiniteDistance = true;

    const ship = buildShip(this.scene);
    this.shipRoot = ship.root;
    this.sail = ship.sail;
    this.sailPositions = ship.sailPositions;
    this.sailBase = ship.sailBase;
    this.rudder = ship.rudder;
    this.oars = ship.oars;

    const particleTexture = createParticleTexture(this.scene);
    this.spray = new ParticleSystem('bow-spray', 280, this.scene);
    this.spray.particleTexture = particleTexture;
    this.spray.emitter = this.sprayEmitter;
    this.spray.minSize = 0.035;
    this.spray.maxSize = 0.14;
    this.spray.minLifeTime = 0.18;
    this.spray.maxLifeTime = 0.55;
    this.spray.emitRate = 0;
    this.spray.direction1 = new Vector3(-0.7, 1.5, -0.8);
    this.spray.direction2 = new Vector3(0.7, 2.4, 0.3);
    this.spray.minEmitPower = 1.0;
    this.spray.maxEmitPower = 3.2;
    this.spray.gravity = new Vector3(0, -5.2, 0);
    this.spray.color1 = new Color4(0.8, 0.95, 0.94, 0.78);
    this.spray.color2 = new Color4(0.55, 0.79, 0.8, 0.45);
    this.spray.start();

    this.rain = new ParticleSystem('rain', 520, this.scene);
    this.rain.particleTexture = particleTexture;
    this.rain.emitter = this.rainEmitter;
    this.rain.minEmitBox = new Vector3(-14, 0, -10);
    this.rain.maxEmitBox = new Vector3(14, 0, 18);
    this.rain.minSize = 0.018;
    this.rain.maxSize = 0.035;
    this.rain.minLifeTime = 0.35;
    this.rain.maxLifeTime = 0.65;
    this.rain.emitRate = 0;
    this.rain.direction1 = new Vector3(-0.5, -10, -0.5);
    this.rain.direction2 = new Vector3(0.5, -13, 0.5);
    this.rain.minEmitPower = 1;
    this.rain.maxEmitPower = 1.5;
    this.rain.color1 = new Color4(0.7, 0.84, 0.9, 0.33);
    this.rain.color2 = new Color4(0.85, 0.92, 0.94, 0.18);
    this.rain.start();

    this.oarSplash = new ParticleSystem('oar-splash', 90, this.scene);
    this.oarSplash.particleTexture = particleTexture;
    this.oarSplash.emitter = this.oarEmitter;
    this.oarSplash.emitRate = 0;
    this.oarSplash.minSize = 0.025;
    this.oarSplash.maxSize = 0.12;
    this.oarSplash.minLifeTime = 0.14;
    this.oarSplash.maxLifeTime = 0.38;
    this.oarSplash.direction1 = new Vector3(-1.2, 1.3, -0.4);
    this.oarSplash.direction2 = new Vector3(1.2, 2.1, 0.7);
    this.oarSplash.minEmitPower = 0.7;
    this.oarSplash.maxEmitPower = 2.4;
    this.oarSplash.gravity = new Vector3(0, -5, 0);
    this.oarSplash.color1 = new Color4(0.75, 0.93, 0.92, 0.8);
    this.oarSplash.color2 = new Color4(0.5, 0.76, 0.8, 0.45);
    this.oarSplash.start();

    this.buildWorldPool();
  }

  private buildWorldPool(): void {
    const rockMat = material(this.scene, 'wet-rock', new Color3(0.13, 0.16, 0.15), new Color3(0.12, 0.18, 0.17), 34);
    const buoyMat = material(this.scene, 'buoy-red', new Color3(0.46, 0.11, 0.065), new Color3(0.25, 0.22, 0.17), 42);
    const wreckMat = material(this.scene, 'driftwood', new Color3(0.18, 0.11, 0.065), new Color3(0.08, 0.06, 0.04), 24);
    for (let index = 0; index < 14; index += 1) {
      const selector = index % 3;
      const root = new TransformNode(`world-marker-${index}`, this.scene);
      let type: WorldMarker['type'];
      if (selector === 0) {
        type = 'rock';
        const base = MeshBuilder.CreateSphere('rock', { diameter: 1.9, segments: 7 }, this.scene);
        base.scaling.set(1.4, 0.72, 1.0);
        base.position.y = -0.15;
        base.material = rockMat;
        base.parent = root;
      } else if (selector === 1) {
        type = 'buoy';
        const body = MeshBuilder.CreateCylinder('buoy', { diameterTop: 0.22, diameterBottom: 0.48, height: 1.05, tessellation: 8 }, this.scene);
        body.position.y = 0.24;
        body.material = buoyMat;
        body.parent = root;
        const pole = MeshBuilder.CreateCylinder('buoy-pole', { diameter: 0.07, height: 0.8, tessellation: 6 }, this.scene);
        pole.position.y = 1.0;
        pole.material = buoyMat;
        pole.parent = root;
      } else {
        type = 'wreck';
        const timber = MeshBuilder.CreateBox('wreck-timber', { width: 0.3, height: 0.22, depth: 3.1 }, this.scene);
        timber.rotation.y = 0.34;
        timber.material = wreckMat;
        timber.parent = root;
      }
      this.markers.push({ root, type, cellX: Number.NaN, cellZ: Number.NaN });
    }
  }

  setQuality(mode: QualityMode): void {
    this.quality = mode;
    this.applyQuality(false);
  }

  private applyQuality(initial: boolean): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let scale = 1.45;
    if (this.quality === 'high') scale = Math.max(1, dpr / 2.35);
    if (this.quality === 'medium') scale = Math.max(1.28, dpr / 2.05);
    if (this.quality === 'low') scale = Math.max(1.65, dpr / 1.72);
    if (this.quality === 'auto') scale = initial ? Math.max(1.32, dpr / 2.1) : this.autoScale;
    this.autoScale = scale;
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

    const fwdX = Math.sin(state.yaw);
    const fwdZ = Math.cos(state.yaw);
    const rightX = Math.cos(state.yaw);
    const rightZ = -Math.sin(state.yaw);
    this.ocean.position.x = state.x;
    this.ocean.position.z = state.z;
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
    this.oceanMaterial.setFloat('uDay', this.sunUniform.y * -1);
    this.oceanMaterial.setFloat('uCloud', environment.cloud);
    this.oceanMaterial.setFloat('uSpeed', telemetry.speed);

    this.updateEnvironment(environment);
    this.updateCamera(state, telemetry.speed, dt, lookYaw, lookPitch);

    this.sprayEmitter.set(state.x + fwdX * 3.75, state.y - 0.2, state.z + fwdZ * 3.75);
    this.rainEmitter.set(state.x, state.y + 10, state.z + 4);
    const particleFactor = this.quality === 'low' ? 0.55 : this.quality === 'medium' ? 0.78 : 1;
    this.spray.emitRate = (18 + telemetry.speed * 25 + environment.storm * 70) * particleFactor * clamp(telemetry.speed / 0.7, 0, 1);
    this.rain.emitRate = environment.rain * 430 * particleFactor;

    if (rowing > 0.2 && state.rowingPhase < this.previousRowingPhase) {
      const side = Math.sin(time * 4.2) > 0 ? 1 : -1;
      this.oarEmitter.set(state.x + rightX * side * 3.1 - fwdX * 0.6, state.y - 0.35, state.z + rightZ * side * 3.1 - fwdZ * 0.6);
      this.oarSplash.manualEmitCount = Math.round((6 + rowing * 9) * particleFactor);
    }
    this.previousRowingPhase = state.rowingPhase;

    this.elapsedForMarkers += dt;
    if (this.elapsedForMarkers > 1.4) {
      this.elapsedForMarkers = 0;
      this.updateWorldMarkers(state);
    }
    this.adaptQuality(dt);
  }

  private animateSail(state: ShipState, telemetry: ShipTelemetry, environment: EnvironmentFrame, time: number): void {
    const ideal = idealSailTrim(telemetry.windAngle);
    const load = clamp(telemetry.apparentWindSpeed / 15, 0, 1) * telemetry.sailEfficiency;
    const slack = 1 - clamp(load * 1.4, 0, 1);
    const billow = 0.22 + load * 0.72;
    const sign = Math.sign(Math.sin(telemetry.windAngle)) || 1;
    this.sail.rotation.y = sign * (0.12 + state.sailAngle * 0.78);
    for (let i = 0; i < this.sailPositions.length; i += 3) {
      const x = this.sailBase[i];
      const y = this.sailBase[i + 1];
      const u = clamp((x / 1.72 + 1) * 0.5, 0, 1);
      const v = clamp((y - 2.55) / 3.35, 0, 1);
      const shape = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      const flutter = Math.sin(time * (5.2 + environment.wind.speed * 0.18) + v * 11 + u * 3.5) * (0.025 + slack * 0.11) * v;
      this.sailPositions[i] = x * (0.96 + load * 0.04);
      this.sailPositions[i + 1] = y + Math.sin(time * 2.2 + u * 4) * 0.012 * slack;
      this.sailPositions[i + 2] = this.sailBase[i + 2] + sign * (shape * billow + flutter);
    }
    this.sail.updateVerticesData(VertexBuffer.PositionKind, this.sailPositions, false, false);
    this.sail.scaling.y = 0.992 + ideal * 0.008;
  }

  private animateOars(state: ShipState, rowing: number): void {
    for (const oar of this.oars) {
      const phase = ((state.rowingPhase + oar.phase) % 1) * TAU;
      const active = clamp(rowing, 0, 1);
      const sweep = Math.sin(phase) * 0.42 * active;
      const dip = Math.max(0, Math.sin(phase + Math.PI * 0.15)) * 0.33 * active;
      oar.pivot.rotation.y = sweep * oar.side;
      oar.pivot.rotation.z = oar.side * (0.12 + dip);
      oar.pivot.rotation.x = -0.08 - dip * 0.5;
    }
  }

  private updateCamera(state: ShipState, speed: number, dt: number, lookYaw: number, lookPitch: number): void {
    const cameraYaw = state.yaw + lookYaw;
    const fwdX = Math.sin(cameraYaw);
    const fwdZ = Math.cos(cameraYaw);
    const distance = 9.4 + clamp(speed, 0, 8) * 0.38;
    const height = 4.65 + clamp(speed, 0, 8) * 0.11 + lookPitch * 1.7;
    this.desiredCamera.set(state.x - fwdX * distance, state.y + height, state.z - fwdZ * distance);
    this.camera.position.x = smoothTo(this.camera.position.x, this.desiredCamera.x, 3.5, dt);
    this.camera.position.y = smoothTo(this.camera.position.y, this.desiredCamera.y, 2.25, dt);
    this.camera.position.z = smoothTo(this.camera.position.z, this.desiredCamera.z, 3.5, dt);
    const shipFwdX = Math.sin(state.yaw);
    const shipFwdZ = Math.cos(state.yaw);
    this.cameraTarget.set(state.x + shipFwdX * (6.4 + speed * 0.5), state.y + 0.82 + lookPitch * 1.2, state.z + shipFwdZ * (6.4 + speed * 0.5));
    this.camera.setTarget(this.cameraTarget);
    this.camera.fov = smoothTo(this.camera.fov, 0.91 + clamp(speed / 9, 0, 1) * 0.095, 2.6, dt);
    this.sky.position.copyFrom(this.camera.position);
  }

  private updateEnvironment(environment: EnvironmentFrame): void {
    const sunAngle = (environment.timeOfDay - 0.25) * TAU;
    const elevation = Math.sin(sunAngle);
    const horizontal = Math.cos(sunAngle);
    this.sunUniform.set(horizontal * 0.48, -elevation, 0.36);
    this.sun.direction.copyFrom(this.sunUniform);
    const daylight = clamp((elevation + 0.12) / 0.4, 0, 1);
    this.sun.intensity = (0.08 + daylight * 1.65) * (1 - environment.cloud * 0.42);
    this.sun.diffuse = Color3.Lerp(new Color3(0.45, 0.55, 0.75), new Color3(1, 0.86, 0.64), daylight);
    this.skyLight.intensity = 0.16 + daylight * 0.72;
    this.skyLight.diffuse = Color3.Lerp(new Color3(0.16, 0.24, 0.38), new Color3(0.73, 0.86, 0.84), daylight);
    this.scene.fogDensity = 0.0015 + (1 - environment.visibility) * 0.009 + environment.rain * 0.002;
    this.scene.fogColor = Color3.Lerp(new Color3(0.09, 0.13, 0.15), new Color3(0.48, 0.61, 0.6), daylight * (1 - environment.storm * 0.35));
    this.scene.clearColor = new Color4(this.scene.fogColor.r, this.scene.fogColor.g, this.scene.fogColor.b, 1);
    this.skyMaterial.setVector3('uSun', this.sunUniform);
    this.skyMaterial.setFloat('uDay', elevation);
    this.skyMaterial.setFloat('uCloud', environment.cloud);
    this.skyMaterial.setFloat('uStorm', environment.storm);
  }

  private updateWorldMarkers(state: ShipState): void {
    const cellSize = 96;
    const baseX = Math.floor(state.worldX / cellSize);
    const baseZ = Math.floor(state.worldZ / cellSize);
    for (let index = 0; index < this.markers.length; index += 1) {
      const marker = this.markers[index];
      const ring = 2 + (index % 4);
      const angle = (index / this.markers.length) * TAU + hash2(baseX + index, baseZ - index) * 1.3;
      const cellX = baseX + Math.round(Math.sin(angle) * ring);
      const cellZ = baseZ + Math.round(Math.cos(angle) * ring);
      if (marker.cellX === cellX && marker.cellZ === cellZ) continue;
      marker.cellX = cellX;
      marker.cellZ = cellZ;
      const jitterX = (hash2(cellX * 5 + 3, cellZ * 7 - 2) - 0.5) * cellSize * 0.58;
      const jitterZ = (hash2(cellX * 11 - 5, cellZ * 13 + 4) - 0.5) * cellSize * 0.58;
      const globalX = cellX * cellSize + jitterX;
      const globalZ = cellZ * cellSize + jitterZ;
      marker.root.position.x = state.x + (globalX - state.worldX);
      marker.root.position.z = state.z + (globalZ - state.worldZ);
      marker.root.position.y = marker.type === 'rock' ? -0.3 : marker.type === 'wreck' ? -0.18 : -0.05;
      const random = hash2(cellX * 19, cellZ * 23);
      const scale = marker.type === 'rock' ? 0.7 + random * 1.9 : marker.type === 'buoy' ? 0.78 + random * 0.3 : 0.75 + random * 0.65;
      marker.root.scaling.setAll(scale);
      marker.root.rotation.y = random * TAU;
      marker.root.setEnabled(random > (marker.type === 'rock' ? 0.26 : 0.45));
    }
  }

  private adaptQuality(dt: number): void {
    if (this.quality !== 'auto') return;
    const fps = this.engine.getFps();
    if (!Number.isFinite(fps) || fps <= 0) return;
    this.fpsAccumulator += fps;
    this.fpsSamples += 1;
    this.fpsClock += dt;
    if (this.fpsClock < 2.8) return;
    const average = this.fpsAccumulator / Math.max(1, this.fpsSamples);
    this.fpsAccumulator = 0;
    this.fpsSamples = 0;
    this.fpsClock = 0;
    if (average < 48 && this.autoScale < 2.05) this.autoScale = Math.min(2.05, this.autoScale + 0.12);
    else if (average > 58 && this.autoScale > 1.18) this.autoScale = Math.max(1.18, this.autoScale - 0.055);
    this.engine.setHardwareScalingLevel(this.autoScale);
    document.documentElement.dataset.fps = average.toFixed(0);
    document.documentElement.dataset.qualityScale = this.autoScale.toFixed(2);
  }

  render(): void {
    this.scene.render();
  }

  dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }
}
