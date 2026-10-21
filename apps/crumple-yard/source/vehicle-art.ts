import { Color3, Mesh, MeshBuilder, PBRMaterial, Scene, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import type { VehicleSpec, VisualPreset } from './config';
import type { DetailZone } from './detail-crush';

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
  rearWindow: Mesh;
  sideWindows: [Mesh[], Mesh[]];
  glassCracks: Map<Mesh, Mesh>;
  crushDetails: Array<{ mesh: Mesh; zone: DetailZone }>;
  frontSignatures: Mesh[];
  rearSignatures: Mesh[];
  rearLightBar: Mesh;
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
  const sideWindows: [Mesh[], Mesh[]] = [[], []];
  const glassCracks = new Map<Mesh, Mesh>();
  const crushDetails: Array<{ mesh: Mesh; zone: DetailZone }> = [];
  const frontSignatures: Mesh[] = [];
  const rearSignatures: Mesh[] = [];
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
  const led = mat('signature-led', '#d9f2fa', 0.09, 0.12);
  led.emissiveColor = new Color3(0.7, 0.85, 1);
  const redLed = mat('rear-led', '#d22b24', 0.09, 0.2);
  redLed.emissiveColor = new Color3(0.8, 0.025, 0.012);
  glass.backFaceCulling = false;

  function damageZone(name: string): DetailZone | null {
    if (/^(hood$|front-|grille-|headlight|skid-plate|led-drl-true|lamp-border-true)/.test(name)) return 'front';
    if (/^(trunk$|rear-|taillight|boot-lip|led-drl-false|lamp-border-false)/.test(name)) return 'rear';
    if (/^(door-left$|mirror-housing--1|mirror-glass--1|side-aero-skirt--1)/.test(name)) return 'left';
    if (/^(door-right$|mirror-housing-1|mirror-glass-1|side-aero-skirt-1)/.test(name)) return 'right';
    if (name === 'roof') return 'roof';
    return null;
  }
  const box = (name: string, pos: [number, number, number], dim: [number, number, number], material: PBRMaterial, parent: TransformNode | Mesh = root) => {
    const zone = parent === root ? damageZone(name) : null;
    const mesh = MeshBuilder.CreateBox(spec.id + '-' + name, { width: dim[0], height: dim[1], depth: dim[2], updatable: Boolean(zone) }, scene);
    mesh.parent = parent;
    mesh.position.set(...pos);
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    if (zone) crushDetails.push({ mesh, zone });
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
    // A fixed, deterministic radial fracture motif is invisible until that
    // pane's health falls. Both side windows have their OWN damage state.
    const edge1 = corners[1].subtract(corners[0]);
    const edge2 = corners[3].subtract(corners[0]);
    const offset = Vector3.Cross(edge1, edge2).normalize().scale(0.022);
    const uvPoint = (u: number, v: number) =>
      Vector3.Lerp(
        Vector3.Lerp(corners[0], corners[1], u),
        Vector3.Lerp(corners[3], corners[2], u), v
      ).add(offset);
    const rays: Vector3[][] = [];
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      const u = Math.min(0.97, Math.max(0.03, 0.47 + Math.cos(a) * 0.48));
      const v = Math.min(0.97, Math.max(0.03, 0.52 + Math.sin(a) * 0.46));
      rays.push([
        uvPoint(0.47, 0.52),
        uvPoint(0.47 + (u - 0.47) * 0.34, 0.52 + (v - 0.52) * 0.28),
        uvPoint(0.47 + (u - 0.47) * 0.69 + Math.sin(i * 3.1) * 0.042,
          0.52 + (v - 0.52) * 0.68),
        uvPoint(u, v)
      ]);
    }
    const fractures = MeshBuilder.CreateLineSystem(spec.id + '-' + name + '-fractures', { lines: rays }, scene);
    fractures.parent = root;
    fractures.color = new Color3(0.78, 0.87, 0.88);
    fractures.alpha = 0.72;
    fractures.isVisible = false;
    fractures.isPickable = false;
    glassCracks.set(mesh, fractures);
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
  const rearWindow = pane('rear-window', [
    new Vector3(glassWidth * 0.89, roof, rearTop),
    new Vector3(-glassWidth * 0.89, roof, rearTop),
    new Vector3(-glassWidth, sill, rearBase),
    new Vector3(glassWidth, sill, rearBase)
  ]);
  // Non-structural cabin furnishings give the tinted greenhouse genuine depth,
  // rather than transparent windows revealing an empty rectangular chassis.
  const cabinFloor = mat('cabin-floor', '#222729', 0.05, 0.96);
  const upholstery = mat('upholstery', suv ? '#393a38' : hatch ? '#4b4943' : '#4d4a44', 0.02, 0.92);
  const upholsteryEdge = mat('seat-stitch', '#737068', 0, 0.93);
  box('interior-tub', [0, sill - 0.14, -l * 0.055], [w * 0.81, 0.11, l * 0.43], cabinFloor);
  box('dash', [0, sill + 0.012, frontBase - 0.14], [w * 0.78, 0.17, 0.35], cabinFloor);
  box('dash-instruments', [-w * 0.235, sill + 0.104, frontBase - 0.17], [0.33, 0.035, 0.17], seams);
  box('center-console', [0, sill - 0.02, -l * 0.01], [0.16, 0.15, l * 0.29], trim);
  for (const z of [-l * 0.16, l * 0.048]) {
    for (const side of [-1, 1]) {
      const x = side * w * 0.215;
      const base = box('seat-cushion-' + side + z, [x, sill - 0.035, z],
        [w * 0.32, 0.115, l * 0.135], upholstery);
      base.rotation.x = -0.025;
      const back = box('seat-back-' + side + z, [x, sill + 0.17, z - l * 0.055],
        [w * 0.30, 0.43, 0.105], upholstery);
      back.rotation.x = 0.14;
      box('seat-piping-' + side + z, [x, sill + 0.20, z - l * 0.009],
        [w * 0.25, 0.028, 0.018], upholsteryEdge);
      box('seat-headrest-' + side + z, [x, sill + 0.44, z - l * 0.081],
        [w * 0.21, 0.16, 0.105], upholstery);
    }
  }
  const steeringWheel = MeshBuilder.CreateTorus(spec.id + '-steering-wheel', {
    diameter: 0.38, thickness: 0.044, tessellation: 18
  }, scene);
  steeringWheel.parent = root;
  steeringWheel.position.set(-w * 0.235, sill + 0.18, frontBase - 0.34);
  steeringWheel.rotation.x = -0.35;
  steeringWheel.material = trim;
  const pillarZ = frontTop + (rearTop - frontTop) * (hatch ? 0.53 : 0.48);
  for (const side of [-1, 1]) {
    const x = side * glassWidth * 1.025;
    const xRoof = side * glassWidth * 0.91;
    const paneFront = pane('front-quarter-' + side, [
      new Vector3(x, sill, frontBase - 0.045),
      new Vector3(xRoof, roof - 0.018, frontTop - 0.03),
      new Vector3(xRoof, roof - 0.018, pillarZ + 0.035),
      new Vector3(x, sill, pillarZ + 0.035)
    ]);
    const paneRear = pane('rear-quarter-' + side, [
      new Vector3(x, sill, pillarZ - 0.035),
      new Vector3(xRoof, roof - 0.018, pillarZ - 0.035),
      new Vector3(xRoof, roof - 0.018, rearTop + 0.03),
      new Vector3(x, sill, rearBase + 0.03)
    ]);
    sideWindows[side === -1 ? 0 : 1].push(paneFront, paneRear);
    // A readable dark door cut, handles, rocker and side marker.
    box('door-cut-' + side, [side * w * 0.502, h * 0.055, -l * 0.075], [0.012, h * 0.64, 0.022], seams);
    box('rocker-' + side, [side * w * 0.49, -h * 0.305, -l * 0.01], [0.074, 0.105, l * 0.47], trim);
    for (const z of [l * 0.065, -l * 0.17]) {
      box('handle-' + side + '-' + z, [side * w * 0.504, h * 0.235, z], [0.055, 0.035, 0.17], trim);
    }
    box('mirror-stalk-' + side, [side * w * 0.51, sill + 0.03, frontBase - 0.08], [0.15, 0.055, 0.065], trim);
    box('mirror-housing-' + side, [side * w * 0.59, sill + 0.065, frontBase - 0.08], [0.20, 0.13, 0.24], paint);
    box('mirror-glass-' + side, [side * w * 0.585, sill + 0.065, frontBase - 0.208], [0.17, 0.09, 0.014], reflector);
    box('sidemarker-' + side, [side * w * 0.505, h * 0.13, l * 0.34], [0.018, 0.045, 0.13], marker);
    frame('shoulder-sweep-' + side, new Vector3(side * w * 0.506, h * 0.38, -l * 0.36),
      new Vector3(side * w * 0.51, h * 0.41, l * 0.33), 0.017);
    box('side-aero-skirt-' + side, [side * w * 0.486, -h * 0.35, -l * 0.012], [0.075, 0.047, l * 0.34], trim);

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
  // A structural roof insert remains an independently damageable panel.
  panel('roof', [0, roof * 0.985, (frontTop + rearTop) * 0.5],
    [w * (suv ? 0.76 : 0.70), 0.055, Math.abs(frontTop - rearTop) * 0.94], paint);
  panel('hood', [0, h * 0.455, l * 0.342], [w * 0.76, 0.046, l * (suv ? 0.205 : hatch ? 0.22 : 0.3)], paint);
  panel('trunk', [0, h * 0.45, -l * (hatch ? 0.425 : 0.395)], [w * 0.77, 0.046, l * (hatch ? 0.11 : 0.205)], paint);
  panel('door-left', [-w * 0.491, h * 0.07, -l * 0.045], [0.041, h * 0.53, l * 0.30], paint);
  panel('door-right', [w * 0.491, h * 0.07, -l * 0.045], [0.041, h * 0.53, l * 0.30], paint);
  panel('front-bumper', [0, -h * 0.155, l * 0.478], [w * 0.91, 0.16, 0.15], trim);
  panel('rear-bumper', [0, -h * 0.155, -l * 0.478], [w * 0.91, 0.16, 0.15], trim);
  box('front-grille', [0, h * 0.06, l * 0.502], [w * (suv ? 0.49 : 0.41), h * 0.21, 0.034], black);
  box('front-splitter', [0, -h * 0.295, l * 0.518], [w * 0.73, 0.042, 0.17], trim);
  box('rear-diffuser', [0, -h * 0.31, -l * 0.516], [w * 0.68, 0.065, 0.15], black);
  for (const side of [-1, 1]) {
    box('front-intake-' + side, [side * w * 0.398, -h * 0.075, l * 0.515], [w * 0.13, h * 0.19, 0.029], black);
    box('rear-vent-' + side, [side * w * 0.397, -h * 0.12, -l * 0.513], [w * 0.12, h * 0.12, 0.03], black);
  }
  for (let i = -2; i <= 2; i++) {
    box('grille-fin-' + i, [0, h * 0.08 + i * h * 0.041, l * 0.527], [w * 0.35, 0.015, 0.02], trim);
  }
  let rearLightBar!: Mesh;
  for (const front of [true, false]) {
    const z = (front ? 1 : -1) * l * 0.501;
    for (const side of [-1, 1]) {
      const lamp = box((front ? 'headlight' : 'taillight') + side,
        [side * w * 0.305, h * 0.24, z],
        [w * (suv ? 0.18 : 0.215), suv ? 0.09 : 0.075, 0.052],
        front ? lampOn : tailOn);
      (front ? headlights : taillights).push(lamp);
      box('lamp-border-' + front + side, [side * w * 0.305, h * 0.175, z + (front ? -0.012 : 0.012)], [w * 0.23, 0.025, 0.05], black);
      const signature = box('led-drl-' + front + side, [side * w * 0.305, h * 0.305, z + (front ? 0.035 : -0.035)], [w * 0.203, 0.019, 0.026], front ? led : redLed);
      (front ? frontSignatures : rearSignatures).push(signature);
    }
    if (!front) rearLightBar = box('rear-signature-bar', [0, h * 0.285, z - 0.028], [w * 0.38, 0.014, 0.024], redLed);
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
    wheel.receiveShadows = true;
    wheel.isPickable = false;
    const wheelBarrel = MeshBuilder.CreateCylinder(spec.id + '-inner-barrel-' + i, { diameter: spec.wheelRadius * 1.52, height: spec.wheelWidth * 1.08, tessellation: 28 }, scene);
    wheelBarrel.parent = wheel; wheelBarrel.material = black;
    const hub = MeshBuilder.CreateCylinder(spec.id + '-alloy-' + i, {
      diameter: spec.wheelRadius * 0.45, height: spec.wheelWidth * 1.16, tessellation: 24
    }, scene);
    hub.parent = wheel; hub.material = wheelPaint;
    const disc = MeshBuilder.CreateCylinder(spec.id + '-disc-' + i, {
      diameter: spec.wheelRadius * 1.07, height: spec.wheelWidth * 1.10, tessellation: 24
    }, scene);
    disc.parent = wheel; disc.material = brake;
    const spokeCount = suv ? 6 : hatch ? 7 : 8;
    for (let spoke = 0; spoke < spokeCount; spoke++) {
      const a = spoke * Math.PI * 2 / spokeCount;
      const s = box('spoke-' + i + '-' + spoke,
        [Math.sin(a) * spec.wheelRadius * 0.36, -spec.wheelWidth * 0.595, Math.cos(a) * spec.wheelRadius * 0.36],
        [spec.wheelRadius * 0.12, 0.025, spec.wheelRadius * 0.75], wheelPaint, wheel);
      s.rotation.y = a;
    }
    const lip = MeshBuilder.CreateTorus(spec.id + '-rim-lip-' + i, {
      diameter: spec.wheelRadius * 1.42, thickness: 0.027, tessellation: 24
    }, scene);
    lip.parent = wheel; lip.position.y = -spec.wheelWidth * 0.61; lip.material = wheelPaint;
    wheels.push(wheel);
  }
  return { panels, wheels, headlights, taillights, windshield, rearWindow, sideWindows, glassCracks, crushDetails, frontSignatures, rearSignatures, rearLightBar };
}
