import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { TrackModel } from './track-model';
import { buildTrackWorld } from './world-track';
import { VisualRig, type CarVisual, type CockpitMotion } from './world-visuals';

export class RaceWorld {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: UniversalCamera;
  readonly rearCamera: UniversalCamera;
  readonly track = new TrackModel(840);
  readonly shadows: ShadowGenerator;
  readonly visuals: VisualRig;

  private frameCounter = 0;
  private fpsAccumulator = 0;
  private fpsTimer = 0;

  constructor(canvas: HTMLCanvasElement, quality: 'auto' | 'high') {
    this.engine = new Engine(canvas, true, {
      antialias: true,
      preserveDrawingBuffer: false,
      stencil: true,
      powerPreference: 'high-performance',
      doNotHandleContextLost: false
    }, true);
    this.setQuality(quality);

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.075, 0.1, 0.09, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0038;
    this.scene.fogColor = new Color3(0.46, 0.56, 0.54);
    this.scene.imageProcessingConfiguration.contrast = 1.2;
    this.scene.imageProcessingConfiguration.exposure = 1.03;

    this.camera = new UniversalCamera('cockpit-camera', new Vector3(), this.scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.04;
    this.camera.maxZ = 900;
    this.camera.fov = 1.02;
    this.camera.layerMask = 0x3;
    this.scene.activeCamera = this.camera;

    this.rearCamera = new UniversalCamera('rear-camera', new Vector3(), this.scene);
    this.rearCamera.inputs.clear();
    this.rearCamera.minZ = 0.08;
    this.rearCamera.maxZ = 340;
    this.rearCamera.fov = 1.08;
    this.rearCamera.layerMask = 0x1;

    const sky = new HemisphericLight('sky-light', new Vector3(0.2, 1, 0.15), this.scene);
    sky.intensity = 0.7;
    sky.diffuse = new Color3(0.78, 0.85, 0.82);
    sky.groundColor = new Color3(0.14, 0.12, 0.1);

    const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, 0.28), this.scene);
    sun.position = new Vector3(120, 180, -120);
    sun.intensity = 1.7;
    sun.diffuse = new Color3(1, 0.87, 0.65);
    this.shadows = new ShadowGenerator(1024, sun);
    this.shadows.useBlurExponentialShadowMap = true;
    this.shadows.blurKernel = 18;
    this.shadows.bias = 0.0008;
    this.shadows.normalBias = 0.03;

    this.visuals = new VisualRig(this.scene, this.camera, this.rearCamera, this.track);
  }

  build(): void {
    buildTrackWorld(this.scene, this.track, this.shadows);
    this.visuals.buildCockpit();
    this.visuals.buildSpeedStreaks();
    this.visuals.initializeCamera();
  }

  createCar(name: string, color: Color3, stripe: Color3, index: number): CarVisual {
    return this.visuals.createCar(name, color, stripe, index, this.shadows);
  }

  placeCar(car: CarVisual, distance: number, lane: number, yawOffset: number, bodyRoll: number, bodyPitch: number, speed: number): void {
    this.visuals.placeCar(car, distance, lane, yawOffset, bodyRoll, bodyPitch, speed);
  }

  updateCockpit(motion: CockpitMotion, delta: number): void {
    this.visuals.updateCockpit(motion, delta);
  }

  impact(strength: number): void {
    this.visuals.applyImpact(strength);
  }

  setQuality(quality: 'auto' | 'high'): void {
    this.engine.setHardwareScalingLevel(quality === 'high' ? 1 : Math.max(1, Math.min(1.55, window.devicePixelRatio / 2)));
  }

  adaptQuality(delta: number, quality: 'auto' | 'high'): void {
    this.frameCounter += 1;
    this.fpsTimer += delta;
    this.fpsAccumulator += 1 / Math.max(delta, 0.0001);
    if (this.fpsTimer < 2.5) return;
    const average = this.fpsAccumulator / this.frameCounter;
    this.frameCounter = 0;
    this.fpsTimer = 0;
    this.fpsAccumulator = 0;
    if (quality === 'auto') {
      const current = this.engine.getHardwareScalingLevel();
      if (average < 46 && current < 2) this.engine.setHardwareScalingLevel(Math.min(2, current + 0.16));
      else if (average > 58 && current > 1.05) this.engine.setHardwareScalingLevel(Math.max(1.05, current - 0.08));
    }
    document.documentElement.dataset.fps = average.toFixed(0);
    document.documentElement.dataset.qualityScale = this.engine.getHardwareScalingLevel().toFixed(2);
  }
}
