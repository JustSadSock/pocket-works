import { Scene } from '@babylonjs/core/scene';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { TrackModel } from './track-model';

/**
 * ПЕТЛЯ 17 / Coastline Circuit.
 * Everything that reads as a road is built before any scenery. The track remains
 * legible even when canvas textures, decorative meshes or shadows are unavailable.
 * Every road surface is double sided to guard against winding/backface regressions.
 */
function material(scene: Scene, name: string, hex: string, specular = 0.08): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(specular, specular, specular);
  m.backFaceCulling = false;
  m.roughness = 0.9;
  return m;
}
function band(
  scene: Scene, track: TrackModel, name: string,
  left: number, right: number, height: number, mat: StandardMaterial,
  stripes?: readonly [number, number, number][]
): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  // Duplicate boundary vertices so paint and normal changes cannot blur across corners.
  for (let i = 0; i < track.segments; i++) {
    const a = track.samples[i], b = track.samples[i + 1];
    const verts = [
      a.position.add(a.right.scale(left)).add(a.up.scale(height)),
      a.position.add(a.right.scale(right)).add(a.up.scale(height)),
      b.position.add(b.right.scale(left)).add(b.up.scale(height)),
      b.position.add(b.right.scale(right)).add(b.up.scale(height))
    ];
    const n = [a.up, a.up, b.up, b.up];
    for (let v = 0; v < 4; v++) {
      positions.push(verts[v].x, verts[v].y, verts[v].z);
      normals.push(n[v].x, n[v].y, n[v].z);
    }
    const d0 = a.distance / 11, d1 = b.distance / 11;
    uvs.push(0, d0, 1, d0, 0, d1, 1, d1);
    const base = i * 4;
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    if (stripes) {
      const c = stripes[Math.floor(a.distance / 5.6) % stripes.length];
      for (let v = 0; v < 4; v++) colors.push(c[0], c[1], c[2], 1);
    }
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;
  if (stripes) data.colors = colors;
  data.applyToMesh(mesh);
  mesh.material = mat;
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  return mesh;
}
function box(scene: Scene, name: string, size: [number, number, number], at: Vector3, mat: StandardMaterial, parent?: TransformNode): Mesh {
  const part = MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene);
  part.position.copyFrom(at);
  if (parent) part.parent = parent;
  part.material = mat;
  part.isPickable = false;
  return part;
}
function trackRig(scene: Scene, track: TrackModel, d: number, lateral = 0): TransformNode {
  const s = track.sample(d);
  const root = new TransformNode('track-prop-' + Math.round(d) + '-' + lateral, scene);
  root.position.copyFrom(s.position.add(s.right.scale(lateral)));
  root.rotationQuaternion = Quaternion.FromLookDirectionLH(s.tangent, s.up);
  return root;
}
function asphaltTexture(scene: Scene, mat: StandardMaterial): void {
  let tex: DynamicTexture | undefined;
  try {
    tex = new DynamicTexture('handmade-asphalt', { width: 256, height: 512 }, scene, false);
    const ctx = tex.getContext();
    if (!ctx) throw new Error('canvas context unavailable');
    ctx.fillStyle = '#404b4d';
    ctx.fillRect(0, 0, 256, 512);
    let seed = 17017;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    for (let i = 0; i < 2400; i++) {
      const light = Math.round(65 + rand() * 80);
      ctx.fillStyle = 'rgba(' + light + ',' + light + ',' + Math.min(255, light + 4) + ',' + (0.08 + rand() * 0.2) + ')';
      ctx.fillRect(rand() * 256, rand() * 512, 1 + rand() * 2.4, 1 + rand() * 3.5);
    }
    ctx.fillStyle = 'rgba(5,13,16,.085)';
    for (const x of [46, 204]) ctx.fillRect(x, 0, 4, 512);
    tex.update(false);
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.uScale = 1;
    tex.vScale = 1;
    mat.diffuseTexture = tex;
    mat.diffuseColor = new Color3(1, 1, 1);
  } catch (err) {
    tex?.dispose();
    mat.diffuseTexture = null;
    console.warn('[ПЕТЛЯ 17] Asphalt texture fallback', err);
  }
}
function roadGeometry(scene: Scene, track: TrackModel): void {
  const asphalt = material(scene, 'tarmac', '#454b4c', 0.09);
  asphaltTexture(scene, asphalt);
  const apron = material(scene, 'apron', '#776f61', 0.05);
  const sand = material(scene, 'dry-shoulder', '#998c70', 0.035);
  const paint = material(scene, 'line-white', '#f7ecca', 0.04);
  paint.emissiveColor = new Color3(0.13, 0.13, 0.11);
  const curb = material(scene, 'painted-kerb', '#ffffff', 0.05);
  const kerbColors: [number, number, number][] = [[0.95, 0.26, 0.16], [0.98, 0.91, 0.75]];
  // Skirts connect the elevated ribbon to earth; no suspended spaghetti track.
  band(scene, track, 'outer-left', -21, -7.4, -0.19, sand);
  band(scene, track, 'outer-right', 7.4, 21, -0.19, sand);
  band(scene, track, 'left-runoff', -7.55, -6.55, -0.025, apron);
  band(scene, track, 'right-runoff', 6.55, 7.55, -0.025, apron);
  band(scene, track, 'race-asphalt', -5.9, 5.9, 0, asphalt);
  band(scene, track, 'kerb-left', -6.52, -5.9, 0.045, curb, kerbColors);
  band(scene, track, 'kerb-right', 5.9, 6.52, 0.045, curb, kerbColors);
  band(scene, track, 'edge-left', -5.73, -5.60, 0.052, paint);
  band(scene, track, 'edge-right', 5.60, 5.73, 0.052, paint);
  // Deliberately broken center line, readable even without textured asphalt.
  for (let d = 16; d < track.length; d += 14) {
    const s = track.sample(d);
    const stripe = box(scene, 'lane-' + Math.floor(d), [0.13, 0.016, 5.2], s.position.add(s.up.scale(0.055)), paint);
    stripe.rotationQuaternion = Quaternion.FromLookDirectionLH(s.tangent, s.up);
  }
  // Broad pit-grid/start markings: semantic, not arbitrary decoration.
  const gridWhite = material(scene, 'grid-white', '#fff1ce');
  for (let i = 0; i < 12; i++) {
    const s = track.sample(6 + i * 0.77);
    for (let j = 0; j < 8; j++) {
      if ((i + j) % 2) continue;
      const tile = box(scene, 'finish-' + i + '-' + j, [1.42, 0.02, 0.73],
        s.position.add(s.right.scale((j - 3.5) * 1.45)).add(s.up.scale(0.072)), gridWhite);
      tile.rotationQuaternion = Quaternion.FromLookDirectionLH(s.tangent, s.up);
    }
  }
}
function rail(scene: Scene, track: TrackModel, side: number, concrete: StandardMaterial, orange: StandardMaterial): void {
  // Solid base is an actual heightful wall, not an infinitely thin disappearing quad.
  const pts: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < track.segments; i++) {
    const a = track.samples[i], b = track.samples[i + 1];
    const p = [a, b].map(s => s.position.add(s.right.scale(side * 8.05)));
    const q = [p[0].add(a.up.scale(1.18)), p[1].add(b.up.scale(1.18))];
    const base = pts.length / 3;
    for (const v of [p[0], q[0], p[1], q[1]]) {
      pts.push(v.x, v.y, v.z);
      normals.push(-side * a.right.x, -side * a.right.y, -side * a.right.z);
    }
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  const mesh = new Mesh('safety-wall-' + side, scene);
  const data = new VertexData();
  data.positions = pts;
  data.normals = normals;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.material = concrete;
  mesh.receiveShadows = true;
  for (let d = 14; d < track.length; d += 17) {
    const root = trackRig(scene, track, d, side * 8.1);
    box(scene, 'rail-cap-' + side + '-' + Math.round(d), [0.12, 0.14, 3.6], new Vector3(0, 1.22, 0), orange, root);
    if (Math.round(d / 17) % 2 === 0) {
      box(scene, 'reflect-' + side + '-' + Math.round(d), [0.55, 0.31, 0.08], new Vector3(0, 0.75, -0.16), orange, root);
    }
  }
}
function signTexture(scene: Scene, title: string): StandardMaterial {
  const m = material(scene, 'painted-' + title, '#e9a749');
  try {
    const tex = new DynamicTexture('paint-' + title, { width: 512, height: 128 }, scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = '#eacb87';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#183a3c';
    ctx.font = '900 80px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 256, 65);
    tex.update();
    m.diffuseTexture = tex;
    m.diffuseColor = new Color3(1, 1, 1);
    m.emissiveColor = new Color3(0.15, 0.12, 0.06);
  } catch {
    // Colored physical sign still exists if canvas textures are unavailable.
  }
  return m;
}
function finishArch(scene: Scene, track: TrackModel): void {
  const steel = material(scene, 'arch-steel', '#263c3e', 0.14);
  const sign = signTexture(scene, 'P17  /  COAST RUN');
  const r = trackRig(scene, track, 4);
  box(scene, 'arch-left', [0.40, 8.4, 0.46], new Vector3(-7.5, 4.2, 0), steel, r);
  box(scene, 'arch-right', [0.40, 8.4, 0.46], new Vector3(7.5, 4.2, 0), steel, r);
  box(scene, 'arch-crossbar', [15.3, 0.47, 0.5], new Vector3(0, 8.15, 0), steel, r);
  const banner = box(scene, 'arch-banner', [11.9, 2.38, 0.21], new Vector3(0, 7.35, 0), sign, r);
  banner.isPickable = false;
  const light = material(scene, 'arch-light', '#e9c77a');
  light.emissiveColor = new Color3(0.6, 0.32, 0.08);
  box(scene, 'arch-marker-left', [0.32, 0.25, 0.34], new Vector3(-6.6, 5.82, -0.32), light, r);
  box(scene, 'arch-marker-right', [0.32, 0.25, 0.34], new Vector3(6.6, 5.82, -0.32), light, r);
}
function containers(scene: Scene, track: TrackModel): void {
  const shells = ['#bb5437', '#3e7770', '#c9a160', '#516c81', '#d2ccc0'].map((c, i) => material(scene, 'freight-' + i, c, 0.11));
  const seam = material(scene, 'freight-ribs', '#263c3e');
  for (let i = 0; i < 20; i++) {
    const d = 48 + i * 53;
    if (d > track.length) break;
    const side = i % 3 === 0 ? -1 : 1;
    const root = trackRig(scene, track, d, side * (24 + (i % 4) * 2.9));
    const levels = i % 5 === 0 ? 3 : i % 2 === 0 ? 2 : 1;
    for (let h = 0; h < levels; h++) {
      const color = shells[(i + h * 2) % shells.length];
      box(scene, 'freight-main-' + i + '-' + h, [4.8, 2.6, 9], new Vector3(0, 1.3 + h * 2.65, 0), color, root);
      for (const xx of [-2.2, -1.45, -0.7, 0, 0.7, 1.45, 2.2]) {
        box(scene, 'freight-rib-' + i + '-' + h + '-' + xx, [0.065, 2.38, 9.08], new Vector3(xx, 1.3 + h * 2.65, 0), seam, root);
      }
      box(scene, 'freight-edge-' + i + '-' + h, [4.98, 0.10, 9.1], new Vector3(0, 2.56 + h * 2.65, 0), seam, root);
    }
  }
}
function portArchitecture(scene: Scene, track: TrackModel): void {
  const dark = material(scene, 'port-iron', '#284245', 0.17);
  const bright = material(scene, 'port-concrete', '#b5a686');
  const red = material(scene, 'port-signal', '#d76b3e');
  red.emissiveColor = new Color3(0.24, 0.065, 0.017);
  for (let i = 0; i < 5; i++) {
    const d = 130 + i * 210;
    if (d > track.length) break;
    const rig = trackRig(scene, track, d, i % 2 === 0 ? 39 : -42);
    // Tall recognizable port gantry, repeated sparingly as a silhouette.
    box(scene, 'crane-foot-a-' + i, [0.95, 20, 0.95], new Vector3(-6, 10, 0), dark, rig);
    box(scene, 'crane-foot-b-' + i, [0.95, 20, 0.95], new Vector3(6, 10, 0), dark, rig);
    box(scene, 'crane-deck-' + i, [16, 1, 1], new Vector3(0, 19.7, 0), bright, rig);
    box(scene, 'crane-boom-' + i, [2, 0.7, 31], new Vector3(1.5, 21.2, 5.2), dark, rig);
    box(scene, 'crane-back-' + i, [8, 1.1, 3.1], new Vector3(0, 20.6, -4), red, rig);
    box(scene, 'crane-cable-' + i, [0.09, 8, 0.09], new Vector3(1.5, 15, 15), dark, rig);
    box(scene, 'crane-load-' + i, [4, 2.7, 4.2], new Vector3(1.5, 10.6, 15), bright, rig);
  }
}
function landscape(scene: Scene, track: TrackModel): void {
  const earth = material(scene, 'coast-earth', '#b0a17c', 0.025);
  const sea = material(scene, 'coastal-water', '#357581', 0.18);
  sea.emissiveColor = new Color3(0.015, 0.05, 0.06);
  const ground = MeshBuilder.CreateGround('coastal-plain', { width: 1050, height: 1050 }, scene);
  ground.position.y = -3.5;
  ground.material = earth;
  ground.receiveShadows = true;
  const water = MeshBuilder.CreateGround('coastal-bay', { width: 500, height: 1050 }, scene);
  water.position.set(430, -3.25, 0);
  water.material = sea;
  const hill = material(scene, 'ochre-hill', '#8c967c');
  const hillNear = material(scene, 'pale-hill', '#6f8d7d');
  // Distant ridgeline has real 3D volume but a deliberately simple outline.
  for (let i = 0; i < 26; i++) {
    const t = i / 26 * Math.PI * 2;
    const radius = 390 + (i % 5) * 29;
    const height = 42 + (i * 11 % 7) * 13;
    const rock = MeshBuilder.CreateCylinder('coast-ridge-' + i, {
      height, diameterTop: 0, diameterBottom: 125 + i % 4 * 12, tessellation: 5
    }, scene);
    rock.position.set(Math.sin(t) * radius, height * .5 - 6, Math.cos(t) * radius);
    rock.rotation.y = t * 0.54;
    rock.material = i % 4 === 0 ? hillNear : hill;
  }
  const trunk = material(scene, 'windbreak-trunk', '#5c5f49');
  const canopy = material(scene, 'windbreak-canopy', '#526d5c');
  // Windbreak groves live outside the safety barriers, never on the asphalt.
  for (let i = 0; i < 65; i++) {
    const d = 32 + i * 17.5;
    if (d > track.length - 12) break;
    if (i % 4 === 0) continue; // occasional clear sea view / open pit sightline
    const s = track.sample(d);
    const side = i % 3 === 0 ? -1 : 1;
    const offset = 29 + i % 5 * 3.2;
    const pos = s.position.add(s.right.scale(side * offset));
    const height = 4.1 + i % 5 * 1.7;
    const stem = MeshBuilder.CreateCylinder('windbreak-stem-' + i, { height, diameterTop: 0.48, diameterBottom: 0.8, tessellation: 5 }, scene);
    stem.position.copyFrom(pos.add(new Vector3(0, height / 2, 0)));
    stem.material = trunk;
    const top = MeshBuilder.CreateSphere('windbreak-leaves-' + i, { diameter: 3, segments: 4 }, scene);
    top.position.copyFrom(pos.add(new Vector3(0, height + 1.5, 0)));
    top.scaling.set(1.6, 1.3, 1.4);
    top.material = canopy;
  }
}
function cornerGuides(scene: Scene, track: TrackModel): void {
  const board = material(scene, 'direction-board', '#eee3c2');
  const arrow = material(scene, 'direction-chevron', '#db683f', 0.12);
  arrow.emissiveColor = new Color3(.12, .03, .008);
  let last = -100;
  for (let d = 26; d < track.length - 28; d += 13) {
    const curve = track.curvature(d, 18);
    if (Math.abs(curve) < 0.009 || d - last < 24) continue;
    last = d;
    const outside = Math.sign(curve) * -1;
    const rig = trackRig(scene, track, d, outside * 9.3);
    box(scene, 'curve-board-' + Math.round(d), [2.15, 1.05, 0.16], new Vector3(0, 1.68, 0), board, rig);
    const turn = Math.sign(curve);
    for (const offset of [-0.44, 0.35]) {
      const bar1 = box(scene, 'chevron-top-' + d + '-' + offset, [0.16, 0.66, 0.19], new Vector3(offset - 0.18 * turn, 1.84, -0.13), arrow, rig);
      const bar2 = box(scene, 'chevron-bottom-' + d + '-' + offset, [0.16, 0.66, 0.19], new Vector3(offset - 0.18 * turn, 1.49, -0.13), arrow, rig);
      bar1.rotation.z = turn * -0.76;
      bar2.rotation.z = turn * 0.76;
    }
  }
}
export function buildCircuit32(scene: Scene, track: TrackModel): void {
  // Geometry first, with individually guarded decoration.
  roadGeometry(scene, track);
  const barrier = material(scene, 'concrete-guard', '#d6d0b8');
  const accent = material(scene, 'guard-orange', '#ea7144');
  accent.emissiveColor = new Color3(0.15, 0.04, 0.01);
  for (const side of [-1, 1]) rail(scene, track, side, barrier, accent);
  const features: [string, () => void][] = [
    ['terrain', () => landscape(scene, track)],
    ['finish', () => finishArch(scene, track)],
    ['corners', () => cornerGuides(scene, track)],
    ['freight', () => containers(scene, track)],
    ['harbor', () => portArchitecture(scene, track)]
  ];
  for (const [label, build] of features) {
    try { build(); }
    catch (e) { console.warn('[ПЕТЛЯ 17] Decorative feature skipped: ' + label, e); }
  }
}
