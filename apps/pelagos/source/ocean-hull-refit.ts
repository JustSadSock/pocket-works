import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import type { ShipState, ShipTelemetry } from './core';
import { clamp } from './core';
import { getActiveShipLoadout } from './ship-loadout';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

const SPEED_BUCKET = 16;
const LENGTH_BUCKET = 4096;
const BEAM_UNIT_METERS = 0.05;
const GRAVITY = 9.81;
const REFERENCE_LENGTH = 12.8;

export type OceanMetrics = {
  speed: number;
  hullLength: number;
  hullBeam: number;
};

export type HullGeneratedWave = {
  froude: number;
  bowRise: number;
  sternTrough: number;
};

/**
 * PELAGOS' original ShaderMaterial signature only exposes one float for ship speed. Keeping that
 * signature avoids rebuilding OceanWorld just to add two uniforms. Length uses decimetres and beam
 * uses 5 cm units, preserving the 3.35/4.35 m hulls while leaving enough low bits for smooth speed
 * on WebGL highp floats.
 */
export function packOceanMetrics(speed: number, hullLength: number, hullBeam: number): number {
  const safeSpeed = clamp(speed, 0, SPEED_BUCKET - 0.5);
  const lengthDeci = clamp(Math.round(hullLength * 10), 80, 200);
  const beamUnits = clamp(Math.round(hullBeam / BEAM_UNIT_METERS), 48, 140);
  return safeSpeed + lengthDeci * SPEED_BUCKET + beamUnits * LENGTH_BUCKET;
}

export function decodeOceanMetrics(packed: number): OceanMetrics {
  const beamUnits = Math.floor(packed / LENGTH_BUCKET + 1e-6);
  const afterBeam = packed - beamUnits * LENGTH_BUCKET;
  const lengthDeci = Math.floor(afterBeam / SPEED_BUCKET + 1e-6);
  const speed = afterBeam - lengthDeci * SPEED_BUCKET;
  return {
    speed,
    hullLength: lengthDeci / 10,
    hullBeam: beamUnits * BEAM_UNIT_METERS
  };
}

export function hullGeneratedWave(
  speed: number,
  hullBeam: number,
  hullLength = REFERENCE_LENGTH
): HullGeneratedWave {
  const safeLength = clamp(hullLength, 8, 22);
  const froude = Math.max(0, speed) / Math.sqrt(GRAVITY * safeLength);
  const speedFactor = clamp(froude / 0.46, 0, 1.25);
  const beamFactor = clamp(hullBeam / 3.9, 0.82, 1.22);
  return {
    froude,
    bowRise: 0.22 * speedFactor * speedFactor * beamFactor,
    sternTrough: 0.085 * speedFactor * speedFactor * beamFactor
  };
}

let patchApplied = false;

function replaceOnce(source: string, search: string, replacement: string): { source: string; replaced: boolean } {
  if (!source.includes(search)) return { source, replaced: false };
  return { source: source.replace(search, replacement), replaced: true };
}

function patchOceanShaders(): void {
  const vertexKey = 'pelagosOceanVertexShader';
  const fragmentKey = 'pelagosOceanFragmentShader';
  let vertex = Effect.ShadersStore[vertexKey];
  let fragment = Effect.ShadersStore[fragmentKey];
  if (!vertex || !fragment) return;

  const vertexUniforms = replaceOnce(
    vertex,
    'uniform float uWaveScale;\nvarying vec3 vWorldPos;',
    'uniform float uWaveScale;\nuniform vec2 uShip;\nuniform float uHeading;\nuniform float uSpeed;\nvarying vec3 vWorldPos;'
  );
  vertex = vertexUniforms.source;

  const vertexMotion = replaceOnce(
    vertex,
    '  wp.xz += chop;\n  wp.y += h;\n  vWorldPos = wp.xyz;',
    `  float speedValue = mod(uSpeed, 16.0);\n  float hullLength = clamp(floor(mod(uSpeed / 16.0, 256.0) + 0.001) * 0.1, 8.0, 20.0);\n  float hullBeam = clamp(floor(uSpeed / 4096.0 + 0.001) * 0.05, 2.4, 7.0);\n  vec2 relShip = wp.xz - uShip;\n  vec2 shipForward = vec2(sin(uHeading), cos(uHeading));\n  vec2 shipRight = vec2(cos(uHeading), -sin(uHeading));\n  float localForward = dot(relShip, shipForward);\n  float localSide = dot(relShip, shipRight);\n  float along = abs(localForward) / max(1.0, hullLength * 0.50);\n  // Narrow the hidden relief toward bow and transom. A rectangular calm patch around a pointed\n  // hull looks like a rendering mask; this tapered footprint follows the actual cutter silhouette.\n  float beamTaper = mix(1.0, 0.30, smoothstep(0.52, 1.02, along));\n  float across = abs(localSide) / max(0.32, hullBeam * 0.50 * beamTaper);\n  float footprint = max(along, across);\n  float hullRelief = 1.0 - smoothstep(0.62, 1.08, footprint);\n  // Bridge short visible waves under the displacement volume instead of digging a depression. In a\n  // trough attenuation raises the surface toward the mean; on a crest it lowers it. The untouched\n  // perimeter and explicit waterline contact pass keep this from becoming a flat halo.\n  wp.xz += chop * (1.0 - hullRelief * 0.70);\n  wp.y += h * (1.0 - hullRelief * 0.56);\n\n  // Self-generated water is keyed to Froude number rather than raw m/s. A short harbor hull therefore\n  // reaches the wave-making regime sooner than a long cruiser at the same absolute speed.\n  float froude = speedValue / sqrt(9.81 * hullLength);\n  float hullSpeed = clamp(froude / 0.46, 0.0, 1.25);\n  float hullSpeed2 = hullSpeed * hullSpeed;\n  float halfLength = hullLength * 0.47;\n  float pressureStretch = mix(0.88, 1.18, clamp(froude / 0.50, 0.0, 1.0));\n  float bowLong = (localForward - halfLength * 0.98) / max(0.55, hullBeam * 0.42 * pressureStretch);\n  float bowSide = localSide / max(0.45, hullBeam * 0.48);\n  float bowPressure = exp(-bowLong * bowLong * 1.45 - bowSide * bowSide * 1.15);\n  float sternLong = (localForward + halfLength * 0.98) / max(0.55, hullBeam * 0.52 * pressureStretch);\n  float sternSide = localSide / max(0.45, hullBeam * 0.52);\n  float sternTrough = exp(-sternLong * sternLong * 1.45 - sternSide * sternSide * 1.35);\n  float shoulderLong = (localForward - halfLength * 0.48) / max(1.0, hullLength * (0.24 + froude * 0.12));\n  float shoulderSide = (abs(localSide) - hullBeam * 0.53) / max(0.24, hullBeam * 0.22);\n  float shoulderCrest = exp(-shoulderLong * shoulderLong * 1.8 - shoulderSide * shoulderSide * 2.2);\n  float beamFactor = clamp(hullBeam / 3.9, 0.82, 1.22);\n  float generatedWave = (bowPressure * 0.22 + shoulderCrest * 0.055 - sternTrough * 0.085) * hullSpeed2 * beamFactor;\n  wp.y += generatedWave * (1.0 - hullRelief * 0.22);\n  vWorldPos = wp.xyz;`
  );
  vertex = vertexMotion.source;

  const fragmentWake = replaceOnce(
    fragment,
    `  float speedFactor = smoothstep(0.35, 4.8, uSpeed);\n  float centerWake = exp(-side * side / max(0.12, 0.45 + back * 0.055)) * smoothstep(0.9, 5.2, back) * (1.0 - smoothstep(40.0, 76.0, back));\n  float vLine = abs(abs(side) - max(back, 0.0) * 0.255);\n  float vWake = exp(-vLine * vLine * 2.4) * smoothstep(2.0, 7.0, back) * (1.0 - smoothstep(32.0, 72.0, back));\n  float bow = exp(-pow(forward - 3.7, 2.0) * 1.1 - side * side * 0.7);\n  float wake = (centerWake * 0.75 + vWake * 0.82 + bow * 0.7) * speedFactor;`,
    `  float speedValue = mod(uSpeed, 16.0);\n  float hullLength = clamp(floor(mod(uSpeed / 16.0, 256.0) + 0.001) * 0.1, 8.0, 20.0);\n  float hullBeam = clamp(floor(uSpeed / 4096.0 + 0.001) * 0.05, 2.4, 7.0);\n  float froude = speedValue / sqrt(9.81 * hullLength);\n  float speedFactor = smoothstep(0.025, 0.43, froude);\n  float halfLength = hullLength * 0.47;\n  float bowLong = (forward - halfLength) / max(0.60, hullBeam * (0.25 + froude * 0.10));\n  float bowSide = side / max(0.45, hullBeam * 0.36);\n  float bowPressure = exp(-bowLong * bowLong * 1.7 - bowSide * bowSide * 1.2);\n  float transomBack = -forward - halfLength * 0.98;\n  float sternGate = smoothstep(0.0, max(0.40, hullLength * 0.06), transomBack)\n    * (1.0 - smoothstep(hullLength * 0.25, hullLength * (0.58 + froude * 0.24), transomBack));\n  float sternSide = side / max(0.50, hullBeam * 0.44);\n  float sternPressure = exp(-sternSide * sternSide * 1.5) * sternGate;\n  // The shader owns only the pressure field directly against the hull. The broken-wake runtime\n  // owns the long trail, avoiding two differently-scaled wakes fighting each other.\n  float wake = (bowPressure * 0.42 + sternPressure * 0.24) * speedFactor;`
  );
  fragment = fragmentWake.source;

  patchApplied = vertexUniforms.replaced && vertexMotion.replaced && fragmentWake.replaced;
  if (!patchApplied) {
    console.warn('[PELAGOS] Ocean hull shader patch did not match the current base shader.');
    return;
  }

  Effect.ShadersStore[vertexKey] = vertex;
  Effect.ShadersStore[fragmentKey] = fragment;
  if (typeof document !== 'undefined') document.documentElement.dataset.pelagosOceanPatch = '1';
}

export function isOceanHullPatchApplied(): boolean {
  return patchApplied;
}

patchOceanShaders();

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosOceanHullRefitV3?: boolean };
if (!prototype.__pelagosOceanHullRefitV3) {
  prototype.__pelagosOceanHullRefitV3 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function oceanHullRefitUpdate(
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
    const dimensions = getActiveShipLoadout().dimensions;
    const oceanMaterial = (this as unknown as { oceanMaterial?: ShaderMaterial }).oceanMaterial;
    oceanMaterial?.setFloat('uSpeed', packOceanMetrics(telemetry.speed, dimensions.length, dimensions.beam));
    if (typeof document !== 'undefined') {
      const generated = hullGeneratedWave(telemetry.speed, dimensions.beam, dimensions.length);
      document.documentElement.dataset.pelagosOceanHull = `${dimensions.length.toFixed(1)}x${dimensions.beam.toFixed(1)}`;
      document.documentElement.dataset.pelagosBowWave = generated.bowRise.toFixed(3);
      document.documentElement.dataset.pelagosSternTrough = generated.sternTrough.toFixed(3);
      document.documentElement.dataset.pelagosOceanFroude = generated.froude.toFixed(4);
    }
  };
}
