import { Scene } from '@babylonjs/core/scene';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { TrackModel } from './track-model';

export function makeMaterial(scene: Scene, name: string, color: Color3, specular = 0.08): StandardMaterial {
  const value = new StandardMaterial(name, scene);
  value.diffuseColor = color;
  value.specularColor = new Color3(specular, specular, specular);
  value.roughness = 0.82;
  return value;
}

function ribbon(
  scene: Scene,
  track: TrackModel,
  name: string,
  innerOffset: number,
  outerOffset: number,
  yOffset: number,
  material: StandardMaterial,
  alternatingColors?: number[]
): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];

  for (let index = 0; index < track.samples.length; index += 1) {
    const sample = track.samples[index];
    const inner = sample.position.add(sample.right.scale(innerOffset)).add(sample.up.scale(yOffset));
    const outer = sample.position.add(sample.right.scale(outerOffset)).add(sample.up.scale(yOffset));
    positions.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
    normals.push(sample.up.x, sample.up.y, sample.up.z, sample.up.x, sample.up.y, sample.up.z);
    uvs.push(0, sample.distance / 7, 1, sample.distance / 7);
    if (alternatingColors) {
      const colorIndex = (Math.floor(sample.distance / 8) % (alternatingColors.length / 4)) * 4;
      for (let vertex = 0; vertex < 2; vertex += 1) {
        colors.push(
          alternatingColors[colorIndex],
          alternatingColors[colorIndex + 1],
          alternatingColors[colorIndex + 2],
          alternatingColors[colorIndex + 3]
        );
      }
    }
    if (index < track.samples.length - 1) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;
  if (colors.length) data.colors = colors;
  data.applyToMesh(mesh);
  mesh.material = material;
  mesh.receiveShadows = true;
  if (colors.length) {
    mesh.useVertexColors = true;
    mesh.hasVertexAlpha = false;
  }
  return mesh;
}

function barrier(scene: Scene, track: TrackModel, name: string, side: number, material: StandardMaterial): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < track.samples.length; index += 1) {
    const sample = track.samples[index];
    const base = sample.position.add(sample.right.scale(side * 7.65));
    const top = base.add(sample.up.scale(1.3));
    positions.push(base.x, base.y, base.z, top.x, top.y, top.z);
    const facing = sample.right.scale(-side);
    normals.push(facing.x, facing.y, facing.z, facing.x, facing.y, facing.z);
    uvs.push(sample.distance / 12, 0, sample.distance / 12, 1);
    if (index < track.samples.length - 1) {
      const baseIndex = index * 2;
      if (side < 0) indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 1, baseIndex + 3, baseIndex + 2);
      else indices.push(baseIndex, baseIndex + 2, baseIndex + 1, baseIndex + 1, baseIndex + 2, baseIndex + 3);
    }
  }

  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.material = material;
  mesh.receiveShadows = true;
  return mesh;
}

function safeFeature(label: string, build: () => void): void {
  try {
    build();
  } catch (error) {
    console.warn(`[ПЕТЛЯ 17] Декоративный блок «${label}» пропущен.`, error);
  }
}

function configureAsphalt(scene: Scene, material: StandardMaterial): void {
  material.diffuseColor = new Color3(0.13, 0.155, 0.145);
  material.specularColor = new Color3(0.05, 0.05, 0.05);
  material.roughness = 0.93;

  let asphaltTexture: DynamicTexture | null = null;
  try {
    asphaltTexture = new DynamicTexture('asphalt-texture', { width: 256, height: 512 }, scene, false);
    const context = asphaltTexture.getContext();
    if (!context) throw new Error('2D canvas context is unavailable.');
    context.fillStyle = '#222826';
    context.fillRect(0, 0, 256, 512);
    for (let index = 0; index < 1450; index += 1) {
      const shade = 27 + Math.floor(Math.random() * 31);
      context.fillStyle = `rgba(${shade},${shade + 3},${shade + 1},${0.08 + Math.random() * 0.19})`;
      context.fillRect(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 4);
    }
    for (let x = 48; x < 256; x += 71) {
      context.fillStyle = 'rgba(4,7,6,.18)';
      context.fillRect(x, 0, 9, 512);
    }
    asphaltTexture.update(false);
    asphaltTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    asphaltTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    asphaltTexture.uScale = 1.8;
    asphaltTexture.vScale = 34;
    material.diffuseTexture = asphaltTexture;
  } catch (error) {
    asphaltTexture?.dispose();
    material.diffuseTexture = null;
    console.warn('[ПЕТЛЯ 17] Процедурная фактура асфальта недоступна; используется безопасный материал.', error);
  }
}

export function buildFallbackTrackWorld(scene: Scene, track: TrackModel): void {
  if (scene.getMeshByName('road')) return;
  const roadMaterial = makeMaterial(scene, 'fallback-asphalt', new Color3(0.13, 0.155, 0.145), 0.03);
  roadMaterial.roughness = 0.95;
  const edgeMaterial = makeMaterial(scene, 'fallback-edge', new Color3(0.78, 0.72, 0.58), 0.03);
  ribbon(scene, track, 'road', -5.9, 5.9, 0, roadMaterial);
  ribbon(scene, track, 'fallback-left-edge', -6.25, -5.9, 0.02, edgeMaterial);
  ribbon(scene, track, 'fallback-right-edge', 5.9, 6.25, 0.02, edgeMaterial);
  const groundMaterial = makeMaterial(scene, 'fallback-ground', new Color3(0.1, 0.13, 0.11), 0.01);
  const ground = MeshBuilder.CreateGround('fallback-port-ground', { width: 620, height: 620, subdivisions: 1 }, scene);
  ground.position.y = -2.2;
  ground.material = groundMaterial;
}

export function buildTrackWorld(scene: Scene, track: TrackModel, shadowGenerator: ShadowGenerator): void {
  const asphaltMaterial = new StandardMaterial('asphalt', scene);
  configureAsphalt(scene, asphaltMaterial);

  const curbMaterial = makeMaterial(scene, 'curb', new Color3(1, 1, 1), 0.05);
  const barrierMaterial = makeMaterial(scene, 'barrier', new Color3(0.68, 0.67, 0.59), 0.14);
  const lineMaterial = makeMaterial(scene, 'line', new Color3(0.93, 0.88, 0.73), 0.03);
  lineMaterial.emissiveColor = new Color3(0.12, 0.11, 0.08);
  const groundMaterial = makeMaterial(scene, 'ground', new Color3(0.12, 0.15, 0.13), 0.02);
  const waterMaterial = makeMaterial(scene, 'water', new Color3(0.08, 0.23, 0.25), 0.34);
  waterMaterial.alpha = 0.86;

  try {
    ribbon(scene, track, 'road', -5.9, 5.9, 0, asphaltMaterial);
    const curbColors = [0.88, 0.25, 0.11, 1, 0.94, 0.88, 0.72, 1];
    ribbon(scene, track, 'curb-left', -6.62, -5.9, 0.025, curbMaterial, curbColors);
    ribbon(scene, track, 'curb-right', 5.9, 6.62, 0.025, curbMaterial, curbColors);
    barrier(scene, track, 'barrier-left', -1, barrierMaterial);
    barrier(scene, track, 'barrier-right', 1, barrierMaterial);
  } catch (error) {
    console.error('[ПЕТЛЯ 17] Основная геометрия трассы не собрана; включён резервный контур.', error);
    buildFallbackTrackWorld(scene, track);
  }

  safeFeature('разметка', () => {
    const dashSource = MeshBuilder.CreateBox('dash-source', { width: 0.12, height: 0.025, depth: 4.6 }, scene);
    dashSource.material = lineMaterial;
    dashSource.isVisible = false;
    for (let distance = 7; distance < track.length; distance += 14) {
      const sample = track.sample(distance);
      const dash = dashSource.createInstance(`dash-${Math.floor(distance)}`);
      dash.position.copyFrom(sample.position.add(sample.up.scale(0.04)));
      dash.rotationQuaternion = Quaternion.FromLookDirectionLH(sample.tangent, sample.up);
    }
  });

  safeFeature('портовая площадка', () => {
    const ground = MeshBuilder.CreateGround('port-ground', { width: 620, height: 620, subdivisions: 1 }, scene);
    ground.position.y = -2.2;
    ground.material = groundMaterial;
    ground.receiveShadows = true;

    const water = MeshBuilder.CreateGround('dock-water', { width: 170, height: 520, subdivisions: 1 }, scene);
    water.position.set(245, -1.4, 0);
    water.rotation.y = Math.PI * 0.08;
    water.material = waterMaterial;
  });

  safeFeature('контейнеры', () => {
    const containerMaterials = [
      makeMaterial(scene, 'container-rust', new Color3(0.46, 0.16, 0.08), 0.08),
      makeMaterial(scene, 'container-green', new Color3(0.08, 0.27, 0.23), 0.08),
      makeMaterial(scene, 'container-yellow', new Color3(0.55, 0.38, 0.08), 0.08),
      makeMaterial(scene, 'container-blue', new Color3(0.12, 0.27, 0.39), 0.08)
    ];
    const sources = containerMaterials.map((material, index) => {
      const box = MeshBuilder.CreateBox(`container-source-${index}`, { width: 2.5, height: 2.35, depth: 6.1 }, scene);
      box.material = material;
      box.isVisible = false;
      return box;
    });

    let propIndex = 0;
    for (let distance = 28; distance < track.length; distance += 29) {
      const sample = track.sample(distance);
      const side = propIndex % 2 === 0 ? -1 : 1;
      const stackCount = propIndex % 5 === 0 ? 3 : propIndex % 3 === 0 ? 2 : 1;
      for (let stack = 0; stack < stackCount; stack += 1) {
        const source = sources[(propIndex + stack) % sources.length];
        const instance = source.createInstance(`container-${propIndex}-${stack}`);
        const lateral = 11.2 + (propIndex % 4) * 1.1;
        instance.position.copyFrom(sample.position.add(sample.right.scale(side * lateral)));
        instance.position.y += 1.17 + stack * 2.38;
        instance.rotationQuaternion = Quaternion.FromLookDirectionLH(sample.tangent, sample.up);
        instance.scaling.z = 0.9 + (propIndex % 3) * 0.12;
      }
      propIndex += 1;
    }
  });

  safeFeature('освещение трассы', () => {
    const postMaterial = makeMaterial(scene, 'post', new Color3(0.11, 0.13, 0.12), 0.12);
    const lampMaterial = makeMaterial(scene, 'lamp', new Color3(0.78, 0.65, 0.25), 0.05);
    lampMaterial.emissiveColor = new Color3(0.45, 0.29, 0.06);
    for (let distance = 80; distance < track.length; distance += 82) {
      const sample = track.sample(distance);
      const side = Math.floor(distance / 82) % 2 === 0 ? -1 : 1;
      const position = sample.position.add(sample.right.scale(side * 9.3));
      const pole = MeshBuilder.CreateCylinder(`pole-${distance}`, { height: 8.5, diameter: 0.18, tessellation: 8 }, scene);
      pole.position.copyFrom(position.add(new Vector3(0, 4.25, 0)));
      pole.material = postMaterial;
      shadowGenerator.addShadowCaster(pole);
      const lamp = MeshBuilder.CreateBox(`lamp-${distance}`, { width: 1.2, height: 0.16, depth: 0.38 }, scene);
      lamp.position.copyFrom(position.add(new Vector3(0, 8.5, 0)));
      lamp.rotationQuaternion = Quaternion.FromLookDirectionLH(sample.tangent, sample.up);
      lamp.material = lampMaterial;
    }
  });

  safeFeature('портальные фермы', () => {
    const gantryMaterial = makeMaterial(scene, 'gantry', new Color3(0.08, 0.1, 0.09), 0.18);
    const signMaterial = makeMaterial(scene, 'sign', new Color3(0.78, 0.24, 0.09), 0.08);
    signMaterial.emissiveColor = new Color3(0.12, 0.025, 0.008);
    for (let distance = 190; distance < track.length; distance += 330) {
      const sample = track.sample(distance);
      for (const side of [-1, 1]) {
        const position = sample.position.add(sample.right.scale(side * 7.3));
        const leg = MeshBuilder.CreateBox(`gantry-leg-${distance}-${side}`, { width: 0.42, height: 6.2, depth: 0.42 }, scene);
        leg.position.copyFrom(position.add(new Vector3(0, 3.1, 0)));
        leg.rotationQuaternion = Quaternion.FromLookDirectionLH(sample.tangent, sample.up);
        leg.material = gantryMaterial;
        shadowGenerator.addShadowCaster(leg);
      }
      const beam = MeshBuilder.CreateBox(`gantry-beam-${distance}`, { width: 14.8, height: 0.42, depth: 0.45 }, scene);
      beam.position.copyFrom(sample.position.add(new Vector3(0, 6.2, 0)));
      beam.rotationQuaternion = Quaternion.FromLookDirectionLH(sample.right, sample.up);
      beam.material = gantryMaterial;
      const sign = MeshBuilder.CreateBox(`gantry-sign-${distance}`, { width: 4.8, height: 1.1, depth: 0.18 }, scene);
      sign.position.copyFrom(sample.position.add(new Vector3(0, 5.7, 0)));
      sign.rotationQuaternion = Quaternion.FromLookDirectionLH(sample.tangent, sample.up);
      sign.material = signMaterial;
    }
  });
}