import { Color3, Mesh, MeshBuilder, PBRMaterial, Scene, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import type { VehicleSpec, VisualPreset } from './config';

/**
 * Authored, dimensionally driven trim. All decorations are children of the
 * original Rapier chassis, never extra colliders. The crumple shell stays the
 * only deforming painted surface.
 */
export type VehicleArt = {
  panels: Map<string, Mesh>;
  wheels: Mesh[];
  headlights: Mesh[];
  taillights: Mesh[];
  windshield: Mesh;
};

export function buildVehicleArt(
  scene: Scene,
  root: TransformNode,
  spec: VehicleSpec,
  preset: VisualPreset,
  paint: PBRMaterial,
  trim: PBRMaterial,
  glass: PBRMaterial,
  lampOn: PBRMaterial,
  tailOn: PBRMaterial
): VehicleArt {
  const panels = new Map<string, Mesh>();
  const wheels: Mesh[] = [];
  const headlights: Mesh[] = [];
  const taillights: Mesh[] = [];
  const w = spec.width, l = spec.length, h = spec.bodyHeight;
  const suv = spec.id === 'bastion';
  const hatch = spec.id === 'kestrel';

  function mat(name: string, hex: string, metal = 0, rough = 0.75) {
    const m = new PBRMaterial(spec.id + '-' + name, scene);
    m.albedoColor = Color3.FromHexString(hex);
    m.metallic = metal; m.roughness = rough;
    return m;
  }
  const tire = mat('rubber', '#16191a', 0, 0.98);
  const wheelPaint = mat('alloy', preset.wheel, 0.72, 0.36);
  const brake = mat('brake-disc', '#6b6d69', 0.8, 0.53);
  const black = mat('black-insets', '#171d20', 0.15, 0.74);
  const reflector = mat('mirror', '#9fb6bb', 0.58, 0.2);
  const marker = mat('side-marker', '#e8ad58', 0.08, 0.31);
  const plate = mat('license', '#e4e0d1', 0.12, 0.74);
  const seams = mat('seams', '#283034', 0.3, 0.64);
  glass.backFaceCulling = false;

  const box = (name: string, pos: [number, number, number], dim: [number, number, number], material: PBRMaterial, parent: TransformNode | Mesh = root) => {
    const mesh = MeshBuilder.CreateBox(spec.id + '-' + name, { width: dim[0], height: dim[1], depth: dim[2] }, scene);
    mesh.parent = parent;
    mesh.position.set(...pos);
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    return mesh;
  };
  const panel = (name: string, pos: [number, number, number], dim: [number, number, number], material: PBRMaterial) => {
    const mesh = box(name, pos, dim, material);
    panels.set(name, mesh);
    return mesh;
  };
  const frame = (name: string, a: Vector3, b: Vector3, diameter = 0.045) => {
    const mesh = MeshBuilder.CreateTube(spec.id + '-' + name, { path: [a, b], radius: diameter / 2, tessellation: 5, cap: Mesh.CAP_ALL }, scene);
    mesh.parent = root;
    mesh.material = trim;
    mesh.isPickable = false;
    return mesh;
  };
  function pane(name: string, corners: [Vector3, Vector3, Vector3, Vector3]) {
    const positions = corners.flatMap(p => [p.x, p.y, p.z]);
    const indices = [0, 1, 2, 0, 2, 3];
    const mesh = new Mesh(spec.id + '-' + name, scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    data.normals = normals;
    data.applyToMesh(mesh);
    mesh.parent = root;
    mesh.material = glass;
    mesh.isPickable = false;
    corners.forEach((v, i) => frame(name + '-seal-' + i, v, corners[(i + 1) % 4], 0.034));
    return mesh;
  }

  // Each body style has a different greenhouse / glass ratio.
  const frontBase = l * (suv ? 0.245 : hatch ? 0.21 : 0.165);
  const frontTop = l * (suv ? 0.185 : hatch ? 0.075 : 0.06);
  const rearTop = -l * (suv ? 0.285 : hatch ? 0.205 : 0.21);
  const rearBase = -l * (suv ? 0.37 : hatch ? 0.415 : 0.325);
  const roof = spec.cabinHeight * (suv ? 0.86 : 0.8);
  const sill = h * (suv ? 0.51 : 0.47);
  const glassWidth = w * (suv ? 0.405 : 0.39);
  const windshield = pane('windscreen', [
    new Vector3(-glassWidth, sill, frontBase),
    new Vector3(glassWidth, sill, frontBase),
    new Vector3(glassWidth * 0.9, roof, frontTop),
    new Vector3(-glassWidth * 0.9, roof, frontTop)
  ]);
  pane('rear-window', [
    new Vector3(glassWidth * 0.89, roof, rearTop),
    new Vector3(-glassWidth * 0.89, roof, rearTop),
    new Vector3(-glassWidth, sill, rearBase),
    new Vector3(glassWidth, sill, rearBase)
  ]);
  const pillarZ = frontTop + (rearTop - frontTop) * (hatch ? 0.53 : 0.48);
  for (const side of [-1, 1]) {
    const x = side * glassWidth * 1.025;
    const xRoof = side * glassWidth * 0.91;
    pane('front-quarter-' + side, [
      new Vector3(x, sill, frontBase - 0.045),
      new Vector3(xRoof, roof - 0.018, frontTop - 0.03),
      new Vector3(xRoof, roof - 0.018, pillarZ + 0.035),
      new Vector3(x, sill, pillarZ + 0.035)
    ]);
    pane('rear-quarter-' + side, [
      new Vector3(x, sill, pillarZ - 0.035),
      new Vector3(xRoof, roof - 0.018, pillarZ - 0.035),
      new Vector3(xRoof, roof - 0.018, rearTop + 0.03),
      new Vector3(x, sill, rearBase + 0.03)
    ]);
    // A readable dark door cut, handles, rocker and side marker.
    box('door-cut-' + side, [side * w * 0.502, h * 0.055, -l * 0.075], [0.012, h * 0.64, 0.022], seams);
    box('rocker-' + side, [side * w * 0.49, -h * 0.305, -l * 0.01], [0.074, 0.105, l * 0.47], trim);
    for (const z of [l * 0.065, -l * 0.17]) {
      box('handle-' + side + '-' + z, [side * w * 0.504, h * 0.235, z], [0.055, 0.035, 0.17], trim);
    }
    box('mirror-stalk-' + side, [side * w * 0.51, sill + 0.03, frontBase - 0.08], [0.15, 0.055, 0.065], trim);
    box('mirror-housing-' + side, [side * w * 0.59, sill + 0.065, frontBase - 0.08], [0.20, 0.13, 0.24], paint);
    box('mirror-glass-' + side, [side * w * 0.585, sill + 0.065, frontBase - 0.208], [0.17, 0.09, 0.014], reflector);
    box('sidemarker-' + side, [side * w * 0.505, h * 0.13, l * 0.34], [0.018, 0.07, 0.16], marker);

    // Wheel arch trim follows a curved silhouette rather than another rectangle.
    for (const z of [spec.wheelBase / 2, -spec.wheelBase / 2]) {
      const arch: Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI * i / 16;
        arch.push(new Vector3(side * w * 0.506, -h * 0.29 + Math.sin(a) * (spec.wheelRadius + 0.115), z + Math.cos(a) * (spec.wheelRadius + 0.115)));
      }
      const edge = MeshBuilder.CreateTube(spec.id + '-wheel-arch', { path: arch, radius: 0.036, tessellation: 6, cap: Mesh.CAP_ALL }, scene);
      edge.parent = root; edge.material = trim; edge.isPickable = false;
    }
  }

  // The body panels remain independently detachable Rapier objects.
  panel('hood', [0, h * 0.455, l * 0.342], [w * 0.76, 0.046, l * (suv ? 0.205 : hatch ? 0.22 : 0.3)], paint);
  panel('trunk', [0, h * 0.45, -l * (hatch ? 0.425 : 0.395)], [w * 0.77, 0.046, l * (hatch ? 0.11 : 0.205)], paint);
  panel('door-left', [-w * 0.491, h * 0.07, -l * 0.045], [0.041, h * 0.53, l * 0.30], paint);
  panel('door-right', [w * 0.491, h * 0.07, -l * 0.045], [0.041, h * 0.53, l * 0.30], paint);
  panel('front-bumper', [0, -h * 0.155, l * 0.478], [w * 0.91, 0.16, 0.15], trim);
  panel('rear-bumper', [0, -h * 0.155, -l * 0.478], [w * 0.91, 0.16, 0.15], trim);
  box('front-grille', [0, h * 0.08, l * 0.501], [w * (suv ? 0.48 : 0.41), h * 0.25, 0.034], black);
  for (let i = -2; i <= 2; i++) {
    box('grille-fin-' + i, [0, h * 0.08 + i * h * 0.041, l * 0.527], [w * 0.35, 0.015, 0.02], trim);
  }
  for (const front of [true, false]) {
    const z = (front ? 1 : -1) * l * 0.501;
    for (const side of [-1, 1]) {
      const lamp = box((front ? 'headlight' : 'taillight') + side,
        [side * w * 0.305, h * 0.165, z],
        [w * (suv ? 0.18 : 0.215), suv ? 0.17 : 0.125, 0.045],
        front ? lampOn : tailOn);
      (front ? headlights : taillights).push(lamp);
      box('lamp-border-' + front + side, [side * w * 0.305, h * 0.08, z + (front ? -0.012 : 0.012)], [w * 0.23, 0.022, 0.05], trim);
    }
    box('plate-' + front, [0, -h * 0.125, z * 1.018], [0.47, 0.13, 0.026], plate);
    box('plate-line-' + front, [0, -h * 0.12, z * 1.024], [0.35, 0.017, 0.01], seams);
  }
  if (suv) {
    for (const side of [-1, 1]) {
      box('roof-rail-' + side, [side * glassWidth * 0.9, roof + 0.07, -l * 0.04], [0.065, 0.09, l * 0.52], trim);
    }
    box('skid-plate', [0, -h * 0.27, l * 0.497], [w * 0.48, 0.1, 0.065], brake);
  } else if (hatch) {
    box('hatch-spoiler', [0, roof + 0.028, rearTop - 0.025], [w * 0.72, 0.045, 0.18], paint);
  } else {
    box('boot-lip', [0, h * 0.52, -l * 0.46], [w * 0.76, 0.04, 0.07], paint);
  }

  for (let i = 0; i < 4; i++) {
    const wheel = MeshBuilder.CreateCylinder(spec.id + '-tyre-' + i, {
      diameter: spec.wheelRadius * 2, height: spec.wheelWidth, tessellation: 28
    }, scene);
    wheel.parent = root;
    wheel.material = tire;
    wheel.rotationQuaternion = undefined;
    wheel.receiveShadows = true;
    wheel.isPickable = false;
    const hub = MeshBuilder.CreateCylinder(spec.id + '-alloy-' + i, {
      diameter: spec.wheelRadius * 1.36, height: spec.wheelWidth * 1.065, tessellation: 24
    }, scene);
    hub.parent = wheel; hub.material = wheelPaint;
    const disc = MeshBuilder.CreateCylinder(spec.id + '-disc-' + i, {
      diameter: spec.wheelRadius * 1.07, height: spec.wheelWidth * 1.10, tessellation: 24
    }, scene);
    disc.parent = wheel; disc.material = brake;
    for (let spoke = 0; spoke < 5; spoke++) {
      const a = spoke * Math.PI * 2 / 5;
      const s = box('spoke-' + i + '-' + spoke,
        [Math.sin(a) * spec.wheelRadius * 0.36, -spec.wheelWidth * 0.565, Math.cos(a) * spec.wheelRadius * 0.36],
        [spec.wheelRadius * 0.19, 0.025, spec.wheelRadius * 0.67], wheelPaint, wheel);
      s.rotation.y = a;
    }
    const lip = MeshBuilder.CreateTorus(spec.id + '-rim-lip-' + i, {
      diameter: spec.wheelRadius * 1.42, thickness: 0.027, tessellation: 24
    }, scene);
    lip.parent = wheel; lip.position.y = -spec.wheelWidth * 0.552; lip.material = wheelPaint;
    wheels.push(wheel);
  }
  return { panels, wheels, headlights, taillights, windshield };
}
