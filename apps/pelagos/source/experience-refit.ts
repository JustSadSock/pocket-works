import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShipState, ShipTelemetry } from './core';
import { DEG, angleDelta, clamp, smoothTo, wrapAngle } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

type Telltale = {
  root: TransformNode;
  ribbon: Mesh;
  phase: number;
  weight: number;
};

type ExperienceRig = {
  telltales: Telltale[];
  pennantRoot: TransformNode;
  pennant: Mesh;
  pennantYaw: number;
};

type QaSnapshot = {
  shipAsset: string;
  speedKnots: number;
  forwardSpeedKnots: number;
  headingDegrees: number;
  rudderDegrees: number;
  sailEfficiency: number;
  apparentWind: number;
  heelDegrees: number;
  yawVelocity: number;
  mainSailReady: boolean;
  mainSailVertices: number;
  visibleOars: number;
  floatingCues: number;
  rowingInput: number;
  weather: string;
};

const rigs = new WeakMap<OceanWorld, ExperienceRig>();
const qaWindow = window as Window & { __POCKET_WORKS_TEST_STATE__?: QaSnapshot };

function ribbonMaterial(world: OceanWorld, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, world.scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(0.12);
  material.specularColor = new Color3(0.025, 0.02, 0.015);
  material.specularPower = 8;
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  return material;
}

function makeRibbon(
  world: OceanWorld,
  parent: TransformNode,
  name: string,
  position: { x: number; y: number; z: number },
  length: number,
  material: StandardMaterial,
  phase: number,
  weight: number
): Telltale {
  const root = new TransformNode(`${name}-pivot`, world.scene);
  root.parent = parent;
  root.position.set(position.x, position.y, position.z);

  const ribbon = MeshBuilder.CreateBox(name, {
    width: 0.035,
    height: 0.018,
    depth: length
  }, world.scene);
  ribbon.parent = root;
  ribbon.position.z = -length * 0.48;
  ribbon.material = material;
  ribbon.isPickable = false;
  ribbon.receiveShadows = false;
  return { root, ribbon, phase, weight };
}

function ensureExperienceRig(world: OceanWorld): ExperienceRig | null {
  const existing = rigs.get(world);
  if (existing) return existing;

  const mainRig = world.scene.getTransformNodeByName('physical-main-rig');
  if (!mainRig) return null;

  const red = ribbonMaterial(world, 'pelagos-telltale-red', new Color3(0.63, 0.095, 0.055));
  const cream = ribbonMaterial(world, 'pelagos-telltale-cream', new Color3(0.86, 0.69, 0.40));
  const telltales = [
    makeRibbon(world, mainRig, 'pelagos-telltale-low', { x: 0.025, y: 3.05, z: -1.58 }, 0.62, red, 0.4, 0.92),
    makeRibbon(world, mainRig, 'pelagos-telltale-mid', { x: -0.02, y: 4.20, z: -1.30 }, 0.68, cream, 1.7, 1.0),
    makeRibbon(world, mainRig, 'pelagos-telltale-high', { x: 0.02, y: 5.18, z: -0.98 }, 0.58, red, 3.0, 1.12)
  ];

  const pennantRoot = new TransformNode('pelagos-mast-pennant-pivot', world.scene);
  pennantRoot.parent = world.shipRoot;
  pennantRoot.position.set(0, 7.42, 0.32);
  const pennant = MeshBuilder.CreateBox('pelagos-mast-pennant', {
    width: 0.055,
    height: 0.028,
    depth: 1.20
  }, world.scene);
  pennant.parent = pennantRoot;
  pennant.position.z = -0.57;
  pennant.material = red;
  pennant.isPickable = false;
  pennant.receiveShadows = false;

  const rig = { telltales, pennantRoot, pennant, pennantYaw: 0 };
  rigs.set(world, rig);
  return rig;
}

function updateWindFeedback(
  rig: ExperienceRig,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  time: number,
  dt: number
): void {
  const safeDt = clamp(dt, 1 / 240, 1 / 24);
  const side = Math.sign(Math.sin(telemetry.windAngle)) || 1;
  const apparent = clamp(telemetry.apparentWindSpeed / 15, 0, 1.35);
  const efficient = clamp(telemetry.sailEfficiency, 0, 1);
  const luff = 1 - efficient;
  const turbulence = clamp(environment.wind.gust * 0.6 + environment.storm * 0.9 + luff * 0.65, 0, 1.8);

  rig.telltales.forEach((telltale, index) => {
    const flutter = Math.sin(time * (7.2 + turbulence * 4.2) + telltale.phase) * (0.035 + turbulence * 0.15);
    const yaw = side * (0.08 + luff * 0.55) + flutter;
    telltale.root.rotation.y = smoothTo(telltale.root.rotation.y, yaw, 9.0, safeDt);
    telltale.root.rotation.x = Math.sin(time * (10.4 + index * 0.7) + telltale.phase) * turbulence * 0.055;
    telltale.root.rotation.z = side * (0.025 + apparent * 0.035) * telltale.weight;
    telltale.ribbon.scaling.z = 0.84 + apparent * 0.18;
    telltale.ribbon.visibility = 0.78 + efficient * 0.22;
  });

  // windAngle is already relative to the ship. Keeping the pennant in the ship's local frame
  // avoids the 360° jumps that appeared when absolute true-wind direction was applied to a
  // node parented under shipRoot.
  const targetPennantYaw = wrapAngle(telemetry.windAngle + Math.PI);
  rig.pennantYaw = wrapAngle(
    rig.pennantYaw + angleDelta(rig.pennantYaw, targetPennantYaw) * (1 - Math.exp(-safeDt * 4.2))
  );
  rig.pennantRoot.rotation.y = rig.pennantYaw;
  rig.pennantRoot.rotation.x = Math.sin(time * 8.6) * (0.025 + turbulence * 0.035);
  rig.pennantRoot.rotation.z = Math.sin(time * 11.2 + 0.8) * turbulence * 0.026;
  rig.pennant.scaling.z = 0.88 + apparent * 0.19;
}

function updateQaBridge(
  world: OceanWorld,
  state: ShipState,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  rowing: number
): void {
  const sail = world.scene.getMeshByName('physical-main-sail');
  const visibleOars = world.scene.meshes.filter((mesh) => mesh.name.startsWith('physical-oar-blade-') && mesh.isEnabled() && mesh.visibility > 0.05).length;
  const floatingCues = world.scene.transformNodes.filter((node) => node.name.startsWith('motion-prop-') && node.isEnabled()).length;
  qaWindow.__POCKET_WORKS_TEST_STATE__ = {
    shipAsset: document.documentElement.dataset.pelagosShipAsset ?? 'loading',
    speedKnots: Number((telemetry.speed * 1.94384).toFixed(3)),
    forwardSpeedKnots: Number((telemetry.forwardSpeed * 1.94384).toFixed(3)),
    headingDegrees: Number((((state.yaw / DEG) % 360 + 360) % 360).toFixed(2)),
    rudderDegrees: Number((state.rudder / DEG).toFixed(2)),
    sailEfficiency: Number(telemetry.sailEfficiency.toFixed(3)),
    apparentWind: Number(telemetry.apparentWindSpeed.toFixed(3)),
    heelDegrees: Number((state.roll / DEG).toFixed(2)),
    yawVelocity: Number(state.yawVelocity.toFixed(4)),
    mainSailReady: Boolean(sail?.isEnabled() && (sail.visibility ?? 1) > 0.05),
    mainSailVertices: sail?.getTotalVertices() ?? 0,
    visibleOars,
    floatingCues,
    rowingInput: Number(clamp(rowing, 0, 1).toFixed(3)),
    weather: environment.label
  };
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosExperienceRefitV1?: boolean };
if (!prototype.__pelagosExperienceRefitV1) {
  prototype.__pelagosExperienceRefitV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function experienceUpdate(
    state: ShipState,
    telemetry: ShipTelemetry,
    environment: EnvironmentFrame,
    time: number,
    dt: number,
    originX: number,
    originZ: number,
    lookYaw: number,
    lookPitch: number,
    rowing: number
  ): void {
    previousUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, rowing);
    const rig = ensureExperienceRig(this);
    if (rig) updateWindFeedback(rig, telemetry, environment, time, dt);
    updateQaBridge(this, state, telemetry, environment, rowing);
  };
}
