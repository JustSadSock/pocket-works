import { Color3, PBRMaterial, RawTexture, Texture } from '@babylonjs/core';
import { hash2 } from './core.js';

function makeAlbedoData(size) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const grain = hash2(x, y, 101) - 0.5;
      const broad = hash2(Math.floor(x / 17), Math.floor(y / 17), 107) - 0.5;
      const warm = hash2(Math.floor(x / 39), Math.floor(y / 39), 113) - 0.5;
      const lum = 1 + grain * 0.010 + broad * 0.016;
      data[i] = Math.max(0, Math.min(255, (226 + warm * 5) * lum));
      data[i + 1] = Math.max(0, Math.min(255, (176 + warm * 3) * lum));
      data[i + 2] = Math.max(0, Math.min(255, (110 - warm * 2) * lum));
      data[i + 3] = 255;
    }
  }
  return data;
}

function rippleHeight(x, y, size) {
  const wx = x / size;
  const wy = y / size;
  const phaseWarp = Math.sin(wy * Math.PI * 7.1) * 0.12 + Math.sin(wy * Math.PI * 2.3 + 1.4) * 0.055;
  const primary = Math.sin((wx * 15.5 + phaseWarp) * Math.PI * 2) * 0.145;
  const secondary = Math.sin((wx * 31.0 + wy * 2.1 + phaseWarp * 1.7) * Math.PI * 2) * 0.035;
  const cross = Math.sin((wx * 5.2 + wy * 8.7) * Math.PI * 2) * 0.018;
  const grain = (hash2(x, y, 211) - 0.5) * 0.038;
  return primary + secondary + cross + grain;
}

function makeNormalData(size, strength = 0.24) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const dx = (rippleHeight(xp, y, size) - rippleHeight(xm, y, size)) * strength;
      const dy = (rippleHeight(x, yp, size) - rippleHeight(x, ym, size)) * strength;
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

function makeSandMaterial(scene, name, albedo, normal, useVertexColors = false) {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = new Color3(1.0, 0.965, 0.90);
  material.albedoTexture = albedo;
  material.bumpTexture = normal;
  material.bumpTexture.level = 0.34;
  material.metallic = 0;
  material.roughness = 0.945;
  material.environmentIntensity = 0.58;
  material.usePhysicalLightFalloff = true;
  material.useParallax = false;
  material.useVertexColors = useVertexColors;
  material.vertexColorUseAlpha = false;
  material.backFaceCulling = true;
  return material;
}

export function createSandMaterials(scene) {
  const albedo = textureFrom(scene, makeAlbedoData(384), 384, 'sand-albedo-procedural');
  const normal = textureFrom(scene, makeNormalData(384, 0.24), 384, 'sand-normal-combined');
  albedo.uScale = 0.92;
  albedo.vScale = 0.92;
  normal.uScale = 3.1;
  normal.vScale = 3.1;

  // Do not clone materials containing RawTexture instances. Babylon can
  // serialise a cloned procedural texture name as a URL and attempt a network
  // request, making far/local LODs optically different. All three materials
  // are constructed explicitly and share the exact same GPU textures.
  const near = makeSandMaterial(scene, 'sand-pbr-near', albedo, normal, false);
  const far = makeSandMaterial(scene, 'sand-pbr-far', albedo, normal, false);
  const local = makeSandMaterial(scene, 'sand-pbr-physical-local', albedo, normal, true);

  return {
    near,
    far,
    local,
    setWireframe(enabled) {
      near.wireframe = enabled;
      far.wireframe = enabled;
      local.wireframe = enabled;
    },
    dispose() {
      near.dispose();
      far.dispose();
      local.dispose();
      albedo.dispose();
      normal.dispose();
    }
  };
}
