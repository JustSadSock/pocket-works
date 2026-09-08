import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { ShipState, ShipTelemetry } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

type ClothLayout = { name: string; rows: number; cols: number };

const CLOTH_LAYOUTS: ClothLayout[] = [
  { name: 'physical-main-sail', rows: 15, cols: 11 },
  { name: 'physical-jib-sail', rows: 14, cols: 8 }
];

const applied = new WeakSet<object>();

function ensureClothUv(world: OceanWorld): void {
  for (const layout of CLOTH_LAYOUTS) {
    const mesh = world.scene.getMeshByName(layout.name);
    if (!mesh || applied.has(mesh)) continue;
    if (mesh.getTotalVertices() !== layout.rows * layout.cols) continue;

    const uvs = new Float32Array(layout.rows * layout.cols * 2);
    for (let row = 0; row < layout.rows; row += 1) {
      const v = row / Math.max(1, layout.rows - 1);
      for (let col = 0; col < layout.cols; col += 1) {
        const u = col / Math.max(1, layout.cols - 1);
        const index = (row * layout.cols + col) * 2;
        uvs[index] = u;
        uvs[index + 1] = 1 - v;
      }
    }

    mesh.setVerticesData(VertexBuffer.UVKind, uvs, false, 2);
    applied.add(mesh);
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosSailUvV1?: boolean };
if (!prototype.__pelagosSailUvV1) {
  prototype.__pelagosSailUvV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function sailUvUpdate(
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
    ensureClothUv(this);
  };
}
