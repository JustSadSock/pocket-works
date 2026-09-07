import { Color3, PBRMaterial, RawTexture, Texture } from '@babylonjs/core';
import { hash2 } from './core.js';

function makeAlbedoData(size) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const grain = hash2(x, y, 101) - 0.5;
      const broad = hash2(Math.floor(x / 12), Math.floor(y / 12), 107) - 0.5;
      const warm = hash2(Math.floor(x / 27), Math.floor(y / 27), 113) - 0.5;
      const lum = 1 + grain * 0.014 + broad * 0.018;
      data[i] = Math.max(0, Math.min(255, (214 + warm * 4) * lum));
      data[i + 1] = Math.max(0, Math.min(255, (161 + warm * 2) * lum));
      data[i + 2] = Math.max(0, Math.min(255, (98 - warm * 2) * lum));
      data[i + 3] = 255;
    }
  }
  return data;
}

function rippleHeight(x, y, size, frequency = 10) {
  const wx = x / size;
  const wy = y / size;
  const primary = Math.sin((wx * frequency + Math.sin(wy * 3.7) * 0.18) * Math.PI * 2) * 0.20;
  const secondary = Math.sin((wx * frequency * 0.52 + wy * 1.35) * Math.PI * 2) * 0.050;
  const grain = (hash2(x, y, 211) - 0.5) * 0.045;
  return primary + secondary + grain;
}

function makeNormalData(size, strength = 0.18, frequency = 10) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const dx = (rippleHeight(xp, y, size, frequency) - rippleHeight(xm, y, size, frequency)) * strength;
      const dy = (rippleHeight(x, yp, size, frequency) - rippleHeight(x, ym, size, frequency)) * strength;
      let nx = -dx, ny = 1, nz = -dy;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const i = (y * size + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

function textureFrom(scene, data, size, name) {
  const texture = RawTexture.CreateRGBATexture(data, size, size, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.name = name;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;
  return texture;
}

export function createSandMaterials(scene) {
  const albedo = textureFrom(scene, makeAlbedoData(256), 256, 'sand-albedo-procedural');
  const normal = textureFrom(scene, makeNormalData(256, 0.18, 10), 256, 'sand-normal-wind-ripples');
  const detail = textureFrom(scene, makeNormalData(128, 0.22, 22), 128, 'sand-detail-grain');

  albedo.uScale = 1.35; albedo.vScale = 1.35;
  normal.uScale = 4.8; normal.vScale = 4.8;
  detail.uScale = 18; detail.vScale = 18;

  const near = new PBRMaterial('sand-pbr-unified', scene);
  near.albedoColor = new Color3(1.0, 0.82, 0.57);
  near.albedoTexture = albedo;
  near.bumpTexture = normal;
  near.bumpTexture.level = 0.28;
  near.metallic = 0;
  near.roughness = 0.92;
  near.environmentIntensity = 0.48;
  near.usePhysicalLightFalloff = true;
  near.useParallax = false;
  // Per-vertex tinting differed between near chunks and the horizon mesh and
  // produced the giant dark "shadow" boundary. All terrain now uses one PBR
  // response; geometry/normal direction supplies the large-scale shading.
  near.useVertexColors = false;
  near.backFaceCulling = true;
  near.detailMap.texture = detail;
  near.detailMap.isEnabled = true;
  near.detailMap.diffuseBlendLevel = 0.018;
  near.detailMap.roughnessBlendLevel = 0.08;
  near.detailMap.bumpLevel = 0.16;

  // Keep a distinct object for debug/disposal compatibility, but make it
  // optically identical. LOD must never be visible as a lighting boundary.
  const far = near.clone('sand-pbr-far-unified');

  const footprint = near.clone('sand-deformation-pbr');

  return {
    near,
    far,
    footprint,
    setWireframe(enabled) {
      near.wireframe = enabled;
      far.wireframe = enabled;
      footprint.wireframe = enabled;
    },
    dispose() {
      near.dispose(); far.dispose(); footprint.dispose();
      albedo.dispose(); normal.dispose(); detail.dispose();
    }
  };
}
