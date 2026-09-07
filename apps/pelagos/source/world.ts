import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import type { ShipState, ShipTelemetry, WindState } from './core';

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

export class OceanWorld {
  readonly engine: Engine;
  readonly scene: Scene;

  constructor(canvas: HTMLCanvasElement, quality: QualityMode) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false, powerPreference: 'high-performance' }, true);
    this.scene = new Scene(this.engine);
    this.setQuality(quality);
  }

  update(_state: ShipState, _telemetry: ShipTelemetry, _environment: EnvironmentFrame, _time: number, _dt: number, _originX: number, _originZ: number, _lookYaw: number, _lookPitch: number, _rowing: number): void {}
  render(): void { this.scene.render(); }
  resize(): void { this.engine.resize(); }
  setQuality(quality: QualityMode): void { this.engine.setHardwareScalingLevel(quality === 'high' ? 1 : 1.35); }
  dispose(): void { this.scene.dispose(); this.engine.dispose(); }
}
