import { Color3, DirectionalLight, EngineStore, HemisphericLight, PointLight, Vector3 } from '@babylonjs/core';

const clamp01 = (value) => Math.max(0, Math.min(1, value));

function emissiveFor(name) {
  if (/sensor/i.test(name)) return new Color3(0.025, 0.22, 0.17);
  if (/edge/i.test(name)) return new Color3(0.055, 0.040, 0.014);
  if (/bone/i.test(name)) return new Color3(0.040, 0.042, 0.034);
  if (/tissue|heart/i.test(name)) return new Color3(0.035, 0.006, 0.005);
  if (/player|cloth/i.test(name)) return new Color3(0.030, 0.027, 0.021);
  if (/interior/i.test(name)) return new Color3(0.034, 0.039, 0.033);
  if (/armor/i.test(name)) return new Color3(0.032, 0.041, 0.038);
  return null;
}

export function installColossusVisualTuning() {
  const scene = EngineStore.LastCreatedScene;
  if (!scene) return;

  // Mobile WebKit/Chromium both render the deliberately dark albedo much darker
  // than Blender's authored viewport. Keep the storm black, but lift surfaces so
  // the player can read geometry, gaps and climb anchors without a flashlight UI.
  scene.ambientColor = new Color3(0.20, 0.22, 0.20);
  scene.imageProcessingConfiguration.exposure = 1.30;
  scene.imageProcessingConfiguration.contrast = 1.10;

  const skyFill = new HemisphericLight('cross-browser-sky-fill', new Vector3(0.25, 1, 0.15), scene);
  skyFill.intensity = 0.72;
  skyFill.diffuse = new Color3(0.58, 0.66, 0.64);
  skyFill.groundColor = new Color3(0.16, 0.145, 0.11);
  skyFill.specular = new Color3(0.20, 0.21, 0.18);

  const rim = new DirectionalLight('cross-browser-rim', new Vector3(0.52, -0.72, -0.42), scene);
  rim.position.set(-18, 28, 26);
  rim.intensity = 0.72;
  rim.diffuse = new Color3(0.78, 0.70, 0.54);
  rim.specular = new Color3(0.65, 0.62, 0.52);

  const cameraLamp = new PointLight('camera-readable-fill', new Vector3(0, 0.4, 0.8), scene);
  cameraLamp.parent = scene.activeCamera;
  cameraLamp.intensity = 0.88;
  cameraLamp.range = 22;
  cameraLamp.diffuse = new Color3(0.72, 0.70, 0.60);
  cameraLamp.specular = new Color3(0.35, 0.33, 0.27);

  const tune = () => {
    for (const material of scene.materials) {
      const glow = emissiveFor(material.name || '');
      if (glow && 'emissiveColor' in material) {
        const existing = material.emissiveColor;
        material.emissiveColor = new Color3(
          Math.max(existing?.r || 0, glow.r),
          Math.max(existing?.g || 0, glow.g),
          Math.max(existing?.b || 0, glow.b)
        );
      }
      if ('ambientColor' in material && /^authored-/.test(material.name || '')) {
        material.ambientColor = new Color3(0.55, 0.55, 0.50);
      }
    }

    for (const light of scene.lights) {
      if (/route-light|traveler-lamp/i.test(light.name || '')) {
        light.intensity = Math.max(light.intensity, /traveler/i.test(light.name) ? 0.72 : 0.74);
        light.range = Math.max(light.range || 0, /traveler/i.test(light.name) ? 12 : 9.5);
      }
    }
  };

  tune();
  let passes = 0;
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (passes < 180) {
      if (passes % 15 === 0) tune();
      passes += 1;
    } else {
      scene.onBeforeRenderObservable.remove(observer);
    }

    // Keep fill useful inside the storm without flattening the scene after the
    // finale brightens the sky.
    const finaleFactor = clamp01((scene.imageProcessingConfiguration.exposure - 1.15) / 0.5);
    rim.intensity = 0.72 - finaleFactor * 0.12;
  });
}
