import {
  Color3,
  Color4,
  DirectionalLight,
  EngineStore,
  HemisphericLight,
  MeshBuilder,
  PointLight,
  StandardMaterial,
  Vector3
} from '@babylonjs/core';
import { ROUTES, routePoint } from './traversal.js';

function emissiveFor(name) {
  if (/sensor|beacon/i.test(name)) return new Color3(0.05, 0.52, 0.38);
  if (/edge/i.test(name)) return new Color3(0.14, 0.105, 0.038);
  if (/bone/i.test(name)) return new Color3(0.13, 0.135, 0.108);
  if (/tissue/i.test(name)) return new Color3(0.075, 0.020, 0.016);
  if (/heart/i.test(name)) return new Color3(0.12, 0.018, 0.012);
  if (/player/i.test(name)) return new Color3(0.14, 0.105, 0.060);
  if (/cloth/i.test(name)) return new Color3(0.075, 0.078, 0.066);
  if (/interior/i.test(name)) return new Color3(0.095, 0.105, 0.090);
  if (/armor/i.test(name)) return new Color3(0.105, 0.125, 0.112);
  return null;
}

function addRouteReadability(scene) {
  const material = new StandardMaterial('route-readability-brass', scene);
  material.disableLighting = true;
  material.diffuseColor = new Color3(0.30, 0.23, 0.105);
  material.emissiveColor = new Color3(0.24, 0.17, 0.068);
  material.specularColor = Color3.Black();

  const jointMaterial = new StandardMaterial('route-readability-joint', scene);
  jointMaterial.disableLighting = true;
  jointMaterial.diffuseColor = new Color3(0.075, 0.25, 0.21);
  jointMaterial.emissiveColor = new Color3(0.065, 0.36, 0.29);
  jointMaterial.specularColor = Color3.Black();

  const parentNames = {
    back: 'carrier-back',
    shoulder: 'carrier-shoulder',
    interior: 'carrier-interior',
    head: 'carrier-head'
  };

  for (const [carrier, route] of Object.entries(ROUTES)) {
    const parent = scene.getTransformNodeByName(parentNames[carrier]);
    if (!parent) continue;

    route.pads.forEach(([a, b], index) => {
      const midZ = (a + b) * 0.5;
      const point = routePoint(carrier, 0, midZ);
      const edgeX = Math.max(1.25, point.width * 0.72);
      const depth = Math.max(0.35, b - a - 0.18);

      for (const side of [-1, 1]) {
        const rail = MeshBuilder.CreateBox(`readable-${carrier}-${index}-${side}`, {
          width: 0.085,
          height: 0.045,
          depth
        }, scene);
        rail.parent = parent;
        rail.position.set(edgeX * side, point.y + 0.055, midZ);
        rail.material = material;
      }

      const dashCount = Math.max(1, Math.floor(depth / 1.45));
      for (let dash = 0; dash < dashCount; dash += 1) {
        const t = (dash + 0.5) / dashCount;
        const z = a + (b - a) * t;
        const p = routePoint(carrier, 0, z);
        const marker = MeshBuilder.CreateBox(`readable-dash-${carrier}-${index}-${dash}`, {
          width: 0.30,
          height: 0.035,
          depth: 0.075
        }, scene);
        marker.parent = parent;
        marker.position.set(0, p.y + 0.058, z);
        marker.material = index === route.pads.length - 1 ? jointMaterial : material;
      }
    });
  }
}

export function installColossusVisualTuning() {
  const scene = EngineStore.LastCreatedScene;
  if (!scene) return;

  globalThis.__PW_VISUAL_TUNING__ = { ready: true, version: 3 };

  // Real Playwright captures showed the authored storm palette collapsing into
  // a near-black canvas on both WebKit and Chromium. Preserve the night storm,
  // but separate sky, silhouettes and traversal surfaces into readable values.
  scene.clearColor = new Color4(0.052, 0.070, 0.073, 1);
  scene.ambientColor = new Color3(0.38, 0.39, 0.35);
  scene.imageProcessingConfiguration.exposure = 1.38;
  scene.imageProcessingConfiguration.contrast = 1.04;
  scene.fogDensity = Math.min(scene.fogDensity || 0.0036, 0.00215);
  scene.fogColor = new Color3(0.115, 0.145, 0.15);

  const skyFill = new HemisphericLight('cross-browser-sky-fill', new Vector3(0.20, 1, 0.18), scene);
  skyFill.intensity = 1.08;
  skyFill.diffuse = new Color3(0.70, 0.77, 0.73);
  skyFill.groundColor = new Color3(0.23, 0.22, 0.17);
  skyFill.specular = new Color3(0.20, 0.21, 0.18);

  const rim = new DirectionalLight('cross-browser-rim', new Vector3(0.50, -0.70, -0.46), scene);
  rim.position.set(-18, 30, 24);
  rim.intensity = 0.96;
  rim.diffuse = new Color3(0.90, 0.77, 0.55);
  rim.specular = new Color3(0.72, 0.65, 0.48);

  const cameraLamp = new PointLight('camera-readable-fill', new Vector3(0, 1.4, 1.6), scene);
  cameraLamp.parent = scene.activeCamera;
  cameraLamp.intensity = 1.65;
  cameraLamp.range = 30;
  cameraLamp.diffuse = new Color3(0.86, 0.80, 0.65);
  cameraLamp.specular = new Color3(0.42, 0.38, 0.30);

  addRouteReadability(scene);

  const tune = () => {
    scene.imageProcessingConfiguration.exposure = Math.max(scene.imageProcessingConfiguration.exposure, 1.34);
    scene.imageProcessingConfiguration.contrast = Math.min(scene.imageProcessingConfiguration.contrast, 1.07);
    if (scene.fogDensity > 0.0024 && globalThis.__PW_TEST_STATE__?.carrier !== 'interior') scene.fogDensity = 0.00215;

    const stormFill = scene.getLightByName('storm-fill');
    if (stormFill) {
      stormFill.intensity = Math.max(stormFill.intensity || 0, 0.92);
      stormFill.groundColor = new Color3(0.17, 0.17, 0.14);
    }
    const stormKey = scene.getLightByName('storm-key');
    if (stormKey) stormKey.intensity = Math.max(stormKey.intensity || 0, 1.48);

    for (const material of scene.materials) {
      const name = material.name || '';
      const glow = emissiveFor(name);
      if (glow && 'emissiveColor' in material) {
        const existing = material.emissiveColor;
        material.emissiveColor = new Color3(
          Math.max(existing?.r || 0, glow.r),
          Math.max(existing?.g || 0, glow.g),
          Math.max(existing?.b || 0, glow.b)
        );
      }
      if ('ambientColor' in material && /^authored-/.test(name)) {
        material.ambientColor = /edge|player/i.test(name)
          ? new Color3(0.68, 0.63, 0.49)
          : new Color3(0.58, 0.59, 0.53);
      }
    }

    for (const light of scene.lights) {
      if (/route-light/i.test(light.name || '')) {
        light.intensity = Math.max(light.intensity || 0, 0.95);
        light.range = Math.max(light.range || 0, 10.5);
      }
      if (/traveler-lamp/i.test(light.name || '')) {
        light.intensity = Math.max(light.intensity || 0, 1.05);
        light.range = Math.max(light.range || 0, 14);
      }
    }
  };

  tune();
  let passes = 0;
  const observer = scene.onBeforeRenderObservable.add(() => {
    // boot()/visibility() changes zone lighting while GLBs arrive asynchronously;
    // keep deterministic readability floors without flattening every frame forever.
    if (passes % 12 === 0) tune();
    passes += 1;
    if (passes > 1800) scene.onBeforeRenderObservable.remove(observer);
  });
}
