import { Color3, PBRMaterial, RawTexture, Texture } from '@babylonjs/core';
import { hash2 } from './core.js';

function clampByte(value) { return Math.max(0, Math.min(255, Math.round(value))); }

function makeSnowAlbedo(size) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const grain = hash2(x, y, 131) - 0.5;
      const cell = hash2(Math.floor(x / 19), Math.floor(y / 19), 139) - 0.5;
      const windA = Math.sin(x * 0.092 + Math.sin(y * 0.027) * 1.8);
      const windB = Math.sin(x * 0.033 + y * 0.016 + 1.4);
      const ridge = Math.max(0, windA) * 0.018 + windB * 0.006;
      const lum = 0.985 + grain * 0.018 + cell * 0.012 + ridge;
      data[i] = clampByte(242 * lum);
      data[i + 1] = clampByte(247 * lum);
      data[i + 2] = clampByte(250 * lum);
      data[i + 3] = 255;
    }
  }
  return data;
}

function snowHeight(x, y, size, frequency = 1) {
  const nx = x / size, ny = y / size;
  const warped = nx + Math.sin(ny * Math.PI * 6) * 0.018;
  const longWave = Math.sin((warped * 10.5 * frequency + ny * 0.7) * Math.PI * 2) * 0.28;
  const ripple = Math.sin((warped * 24 * frequency + ny * 1.7) * Math.PI * 2) * 0.10;
  const grain = (hash2(x, y, 151) - 0.5) * 0.15;
  return longWave + ripple + grain;
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
  texture.anisotropicFilteringLevel = 8;
  return texture;
}

export function createSnowMaterials(scene) {
  const albedo = textureFrom(scene, makeSnowAlbedo(256), 256, 'firn-snow-albedo');
  const normal = textureFrom(scene, makeNormal(256, 0.72, 1), 256, 'firn-snow-normal');
  const detail = textureFrom(scene, makeNormal(128, 1.3, 2.2), 128, 'firn-snow-detail');
  albedo.uScale = 0.42; albedo.vScale = 0.42;
  normal.uScale = 0.42; normal.vScale = 0.42;
  detail.uScale = 4.8; detail.vScale = 4.8;

  const near = new PBRMaterial('firn-snow-near', scene);
  near.albedoColor = new Color3(0.985, 0.992, 1.0);
  near.albedoTexture = albedo;
  near.bumpTexture = normal;
  near.bumpTexture.level = 0.34;
  near.metallic = 0;
  near.roughness = 0.82;
  near.environmentIntensity = 0.58;
  near.usePhysicalLightFalloff = true;
  near.useVertexColors = true;
  near.detailMap.texture = detail;
  near.detailMap.isEnabled = true;
  near.detailMap.diffuseBlendLevel = 0.015;
  near.detailMap.roughnessBlendLevel = 0.08;
  near.detailMap.bumpLevel = 0.24;
  near.sheen.isEnabled = true;
  near.sheen.color = new Color3(0.74, 0.86, 0.95);
  near.sheen.roughness = 0.78;
  near.sheen.intensity = 0.18;

  const far = near.clone('firn-snow-far');
  far.bumpTexture.level = 0.08;
  far.detailMap.isEnabled = false;
  far.roughness = 0.9;
  far.sheen.intensity = 0.08;

  const track = new PBRMaterial('firn-track', scene);
  track.albedoColor = new Color3(0.48, 0.57, 0.61);
  track.metallic = 0;
  track.roughness = 0.98;
  track.alpha = 0.38;
  track.disableDepthWrite = false;

  const rock = new PBRMaterial('firn-rock', scene);
  rock.albedoColor = new Color3(0.115, 0.13, 0.14);
  rock.metallic = 0;
  rock.roughness = 0.93;
  rock.environmentIntensity = 0.45;

  return {
    near, far, track, rock,
    dispose() {
      near.dispose(); far.dispose(); track.dispose(); rock.dispose();
      albedo.dispose(); normal.dispose(); detail.dispose();
    }
  };
}
