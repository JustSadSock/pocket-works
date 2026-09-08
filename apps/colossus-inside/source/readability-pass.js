import { Color3, Color4, EngineStore } from '@babylonjs/core';

const setEmissive = (material, r, g, b) => {
  if ('emissiveColor' in material) material.emissiveColor = new Color3(r, g, b);
};

export function installReadabilityPass() {
  const scene = EngineStore.LastCreatedScene;
  if (!scene) return;
  globalThis.__PW_READABILITY_PASS__ = { ready: true, version: 1 };

  const apply = () => {
    const inside = globalThis.__PW_TEST_STATE__?.carrier === 'interior';
    scene.clearColor = inside ? new Color4(.045, .055, .050, 1) : new Color4(.075, .095, .100, 1);
    scene.imageProcessingConfiguration.exposure = inside ? 1.52 : 1.58;
    scene.imageProcessingConfiguration.contrast = inside ? 1.02 : 1.00;
    if (!inside) {
      scene.fogDensity = Math.min(scene.fogDensity || .0014, .0014);
      scene.fogColor = new Color3(.145, .175, .180);
    }

    for (const material of scene.materials) {
      const name = material.name || '';
      if (name === 'faceted-route-armor') setEmissive(material, .105, .128, .120);
      else if (name === 'faceted-route-edge') setEmissive(material, .205, .135, .030);
      else if (name === 'faceted-route-recess') setEmissive(material, .022, .033, .031);
      else if (name === 'dorsal-mechanism') setEmissive(material, .070, .080, .066);
      else if (name === 'route-fallback-armor') setEmissive(material, .048, .062, .058);
      else if (name === 'route-fallback-edge') setEmissive(material, .120, .076, .016);
      else if (name === 'dorsal-shelter') setEmissive(material, .058, .074, .069);
      else if (name === 'route-inlay-brass') setEmissive(material, .24, .155, .026);
      else if (name === 'route-inlay-joint') setEmissive(material, .028, .31, .245);
      else if (/^authored-(player|cloth)/i.test(name)) setEmissive(material, .16, .115, .065);
    }
  };

  apply();
  let frames = 0;
  scene.onBeforeRenderObservable.add(() => {
    if ((frames++ % 30) === 0) apply();
  });
}
