import { Color3, PBRMaterial, RawTexture, Texture } from '@babylonjs/core';
import { hash2 } from './core.js';

function makeAlbedoData(size) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const grain = hash2(x, y, 101) - 0.5;
      const broad = hash2(Math.floor(x / 9), Math.floor(y / 9), 107) - 0.5;
      const ripple = Math.sin((x * 0.22) + Math.sin(y * 0.041) * 1.5) * 0.018;
      const lum = 1 + grain * 0.032 + broad * 0.026 + ripple;
      data[i] = Math.max(0, Math.min(255, 211 * lum));
      data[i + 1] = Math.max(0, Math.min(255, 158 * lum));
      data[i + 2] = Math.max(0, Math.min(255, 96 * lum));
      data[i + 3] = 255;
    }
  }
  return data;
}

function rippleHeight(x, y, size) {
  const wx = x / size;
  const wy = y / size;
  const primary = Math.sin((wx * 30 + Math.sin(wy * 9) * 0.34) * Math.PI * 2) * 0.68;
  const cross = Math.sin((wx * 11 + wy * 3.5) * Math.PI * 2) * 0.16;
  const grain = (hash2(x, y, 211) - 0.5) * 0.16;
  return primary + cross + grain;
}

function makeNormalData(size, strength = 2.1) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const dx = (rippleHeight(xp, y, size) - rippleHeight(xm, y, size)) * strength;
      const dy = (rippleHeight(x, yp, size) - rippleHeight(x, ym, size)) * strength;
      let nx = -dx;
      let ny = 1;
      let nz = -dy;
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
  const normal = textureFrom(scene, makeNormalData(256, 1.45), 256, 'sand-normal-procedural');
  const detail = textureFrom(scene, makeNormalData(128, 2.7), 128, 'sand-detail-normal');

  albedo.uScale = 0.9;
  albedo.vScale = 0.9;
  normal.uScale = 0.9;
  normal.vScale = 0.9;
  detail.uScale = 7.5;
  detail.vScale = 7.5;

  const near = new PBRMaterial('sand-pbr-near', scene);
  near.albedoColor = new Color3(1.0, 0.81, 0.55);
  near.albedoTexture = albedo;
  near.bumpTexture = normal;
  near.bumpTexture.level = 0.72;
  near.metallic = 0;
  near.roughness = 0.88;
  near.environmentIntensity = 0.48;
  near.usePhysicalLightFalloff = true;
  near.useParallax = false;
  near.useVertexColors = true;
  near.backFaceCulling = true;
  near.detailMap.texture = detail;
  near.detailMap.isEnabled = true;
  near.detailMap.diffuseBlendLevel = 0.06;
  near.detailMap.roughnessBlendLevel = 0.16;
  near.detailMap.bumpLevel = 0.47;

  const far = near.clone('sand-pbr-far');
  far.bumpTexture = normal;
  far.bumpTexture.level = 0.28;
  far.detailMap.isEnabled = false;
  far.roughness = 0.91;

  const footprint = near.clone('sand-footprint-pbr');
  footprint.albedoColor = new Color3(0.84, 0.62, 0.37);
  footprint.bumpTexture.level = 0.9;
  footprint.detailMap.bumpLevel = 0.65;
  footprint.roughness = 0.94;

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
