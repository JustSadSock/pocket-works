import { Color3, PBRMaterial, RawTexture, Texture } from '@babylonjs/core';
import { hash2 } from './core.js';

function makeSnowAlbedo(size) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const grain = hash2(x, y, 131) - 0.5;
      const broad = hash2(Math.floor(x / 11), Math.floor(y / 11), 139) - 0.5;
      const wind = Math.sin(x * 0.16 + Math.sin(y * 0.045) * 1.4) * 0.012;
      const lum = 0.985 + grain * 0.025 + broad * 0.02 + wind;
      data[i] = Math.max(0, Math.min(255, 236 * lum));
      data[i + 1] = Math.max(0, Math.min(255, 245 * lum));
      data[i + 2] = Math.max(0, Math.min(255, 249 * lum));
      data[i + 3] = 255;
    }
  }
  return data;
}

function snowHeight(x, y, size, frequency = 1) {
  const nx = x / size, ny = y / size;
  const sastrugi = Math.sin((nx * 18 * frequency + Math.sin(ny * 7) * 0.46) * Math.PI * 2) * 0.48;
  const cross = Math.sin((nx * 7 + ny * 2.8) * Math.PI * 2) * 0.13;
  const grain = (hash2(x, y, 151) - 0.5) * 0.22;
  return sastrugi + cross + grain;
}

function makeNormal(size, strength = 1.2, frequency = 1) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const ym = (y - 1 + size) % size, yp = (y + 1) % size;
      const dx = (snowHeight(xp, y, size, frequency) - snowHeight(xm, y, size, frequency)) * strength;
      const dy = (snowHeight(x, yp, size, frequency) - snowHeight(x, ym, size, frequency)) * strength;
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

export function createSnowMaterials(scene) {
  const albedo = textureFrom(scene, makeSnowAlbedo(256), 256, 'firn-snow-albedo');
  const normal = textureFrom(scene, makeNormal(256, 1.15, 1), 256, 'firn-snow-normal');
  const detail = textureFrom(scene, makeNormal(128, 2.35, 2.4), 128, 'firn-snow-detail');
  albedo.uScale = 0.65; albedo.vScale = 0.65;
  normal.uScale = 0.65; normal.vScale = 0.65;
  detail.uScale = 6.4; detail.vScale = 6.4;

  const near = new PBRMaterial('firn-snow-near', scene);
  near.albedoColor = new Color3(0.97, 0.985, 1.0);
  near.albedoTexture = albedo;
  near.bumpTexture = normal;
  near.bumpTexture.level = 0.52;
  near.metallic = 0;
  near.roughness = 0.68;
  near.environmentIntensity = 0.72;
  near.usePhysicalLightFalloff = true;
  near.useVertexColors = true;
  near.detailMap.texture = detail;
  near.detailMap.isEnabled = true;
  near.detailMap.diffuseBlendLevel = 0.03;
  near.detailMap.roughnessBlendLevel = 0.12;
  near.detailMap.bumpLevel = 0.38;

  const far = near.clone('firn-snow-far');
  far.bumpTexture.level = 0.18;
  far.detailMap.isEnabled = false;
  far.roughness = 0.78;

  const track = new PBRMaterial('firn-track', scene);
  track.albedoColor = new Color3(0.57, 0.68, 0.73);
  track.metallic = 0;
  track.roughness = 0.94;
  track.alpha = 0.46;
  track.disableDepthWrite = false;

  const rock = new PBRMaterial('firn-rock', scene);
  rock.albedoColor = new Color3(0.19, 0.23, 0.25);
  rock.metallic = 0;
  rock.roughness = 0.96;

  return {
    near, far, track, rock,
    dispose() {
      near.dispose(); far.dispose(); track.dispose(); rock.dispose();
      albedo.dispose(); normal.dispose(); detail.dispose();
    }
  };
}
