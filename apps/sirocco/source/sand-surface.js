import { Mesh, VertexBuffer, VertexData } from '@babylonjs/core';
import { clamp, smoothstep } from './core.js';
import { meshTerrainShadingNormal } from './terrain.js';
import { appendBabylonGroundCell } from './world.js';

function warpLocalAxis(value, radius) {
  const n = clamp(value / radius, -1, 1);
  const a = Math.abs(n);
  return radius * n * (0.62 + 0.38 * a);
}

export class LocalSandSurface {
  constructor(scene, world, sand, material, preset) {
    this.scene = scene;
    this.world = world;
    this.sand = sand;
    this.material = material;
    this.mesh = new Mesh('local-physical-sand-replacement', scene);
    this.mesh.material = material;
    this.mesh.receiveShadows = false;
    this.mesh.isPickable = false;
    this.centerX = Number.NaN;
    this.centerZ = Number.NaN;
    this.replacementRadius = Number.NaN;
    this.dirty = true;
    this.vertexDataApplied = false;
    this.uvCenterX = Number.NaN;
    this.uvCenterZ = Number.NaN;
    this.setQuality(preset);
  }

  setQuality(preset) {
    const nextRadius = preset.id === 'high' ? 3.7 : preset.id === 'medium' ? 3.3 : 2.9;
    const nextSegments = preset.id === 'high' ? 68 : preset.id === 'medium' ? 56 : 44;
    const topologyChanged = this.radius !== nextRadius || this.segments !== nextSegments;
    this.radius = nextRadius;
    this.segments = nextSegments;
    this.snapStep = preset.id === 'high' ? 1.55 : preset.id === 'medium' ? 1.78 : 2.0;
    this.holeRatio = 0.90;
    if (topologyChanged || !this.buffers) this.allocateBuffers();
    this.dirty = true;
  }

  allocateBuffers() {
    const segments = this.segments;
    const row = segments + 1;
    const vertexCount = row * row;
    const diameter = this.radius * 2;
    const uniformStep = diameter / segments;
    const localXs = new Float32Array(row);
    const localZs = new Float32Array(row);
    for (let i = 0; i <= segments; i += 1) {
      const uniform = -this.radius + i * uniformStep;
      const warped = warpLocalAxis(uniform, this.radius);
      localXs[i] = warped;
      localZs[i] = warped;
    }

    const indices = [];
    const renderRadius = this.radius * 0.992;
    for (let z = 0; z < segments; z += 1) {
      for (let x = 0; x < segments; x += 1) {
        const cellX = (localXs[x] + localXs[x + 1]) * 0.5;
        const cellZ = (localZs[z] + localZs[z + 1]) * 0.5;
        if (Math.hypot(cellX, cellZ) >= renderRadius) continue;
        const a = z * row + x, b = a + 1, d = a + row, e = d + 1;
        appendBabylonGroundCell(indices, a, b, d, e);
      }
    }

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const colors = new Float32Array(vertexCount * 4);
    const radial = new Float32Array(vertexCount);
    let p = 0, c = 0, vertex = 0;
    for (let iz = 0; iz <= segments; iz += 1) {
      const lz = localZs[iz];
      for (let ix = 0; ix <= segments; ix += 1) {
        const lx = localXs[ix];
        positions[p] = lx;
        positions[p + 2] = lz;
        p += 3;
        radial[vertex] = Math.hypot(lx, lz) / this.radius;
        colors[c] = 1; colors[c + 1] = 1; colors[c + 2] = 1; colors[c + 3] = 1;
        c += 4;
        vertex += 1;
      }
    }

    this.buffers = {
      row,
      vertexCount,
      positions,
      normals,
      uvs,
      colors,
      radial,
      deformations: new Float32Array(vertexCount),
      looseValues: new Float32Array(vertexCount),
      compactValues: new Float32Array(vertexCount),
      localXs,
      localZs,
      indices: new Uint32Array(indices)
    };
    this.vertexDataApplied = false;
    this.uvCenterX = Number.NaN;
    this.uvCenterZ = Number.NaN;
  }

  markDirty() { this.dirty = true; }

  sampleHeight(x, z) {
    return this.world.sampleBaseHeight(x, z) + clamp(this.sand.sampleOffset(x, z), -0.11, 0.075);
  }

  sampleSoftness(x, z) { return this.sand.sampleSoftness?.(x, z) ?? 0.48; }

  sampleNormal(x, z) {
    const step = 0.065;
    const hx0 = this.sampleHeight(x - step, z), hx1 = this.sampleHeight(x + step, z);
    const hz0 = this.sampleHeight(x, z - step), hz1 = this.sampleHeight(x, z + step);
    let nx = -(hx1 - hx0) / (step * 2), ny = 1, nz = -(hz1 - hz0) / (step * 2);
    const inv = 1 / Math.hypot(nx, ny, nz);
    return { x: nx * inv, y: ny * inv, z: nz * inv };
  }

  downhill(x, z) {
    const n = this.sampleNormal(x, z);
    const len = Math.hypot(n.x, n.z) || 1;
    return { x: n.x / len, z: n.z / len };
  }

  update(controller, force = false) {
    const snappedX = Math.round(controller.globalX / this.snapStep) * this.snapStep;
    const snappedZ = Math.round(controller.globalZ / this.snapStep) * this.snapStep;
    const moved = !Number.isFinite(this.centerX) || snappedX !== this.centerX || snappedZ !== this.centerZ;
    const holeRadius = this.radius * this.holeRatio;
    const radiusChanged = !Number.isFinite(this.replacementRadius) || Math.abs(this.replacementRadius - holeRadius) > 0.001;
    if (moved || radiusChanged) {
      this.centerX = snappedX;
      this.centerZ = snappedZ;
      this.world.setLocalReplacement(this.centerX, this.centerZ, holeRadius);
      this.replacementRadius = holeRadius;
      this.dirty = true;
    }
    if (!force && !this.dirty) return false;
    this.rebuild();
    return true;
  }

  rebuild() {
    const {
      row, positions, normals, uvs, colors, radial, deformations, looseValues,
      compactValues, localXs, localZs, indices
    } = this.buffers;
    const segments = this.segments;
    const uvChanged = this.uvCenterX !== this.centerX || this.uvCenterZ !== this.centerZ;

    let p = 0, uv = 0, c = 0, vertex = 0;
    for (let iz = 0; iz <= segments; iz += 1) {
      const lz = localZs[iz];
      for (let ix = 0; ix <= segments; ix += 1) {
        const lx = localXs[ix];
        const gx = this.centerX + lx;
        const gz = this.centerZ + lz;
        const r = radial[vertex];
        const deformFade = 1 - smoothstep(0.70, 0.88, r);
        const rawDeformation = clamp(this.sand.sampleOffset(gx, gz), -0.11, 0.075);
        const deformation = rawDeformation * deformFade;
        const loose = (this.sand.sampleLoose?.(gx, gz) ?? 0) * deformFade;
        const compaction = (this.sand.sampleCompaction?.(gx, gz) ?? 0) * deformFade;
        deformations[vertex] = deformation;
        looseValues[vertex] = loose;
        compactValues[vertex] = compaction;
        positions[p + 1] = this.world.sampleBaseHeight(gx, gz) + deformation;
        p += 3;

        if (uvChanged) {
          uvs[uv] = gx * 0.055;
          uvs[uv + 1] = gz * 0.055;
        }
        uv += 2;

        const compactBowl = smoothstep(0.004, 0.060, -deformation);
        const deposit = smoothstep(0.004, 0.050, deformation);
        const looseLift = loose * 0.034;
        const packedShade = compaction * 0.042;
        colors[c] = 1 - compactBowl * 0.075 - packedShade + deposit * 0.026 + looseLift;
        colors[c + 1] = 1 - compactBowl * 0.095 - packedShade * 1.08 + deposit * 0.021 + looseLift * 0.78;
        colors[c + 2] = 1 - compactBowl * 0.125 - packedShade * 1.16 + deposit * 0.011 + looseLift * 0.50;
        colors[c + 3] = 1;
        c += 4;
        vertex += 1;
      }
    }

    if (uvChanged) {
      this.uvCenterX = this.centerX;
      this.uvCenterZ = this.centerZ;
    }

    normals.fill(0);
    VertexData.ComputeNormals(positions, indices, normals);

    for (let iz = 0; iz <= segments; iz += 1) {
      const lz = localZs[iz];
      for (let ix = 0; ix <= segments; ix += 1) {
        const lx = localXs[ix];
        const i = iz * row + ix;
        const r = radial[i];
        const gx = this.centerX + lx, gz = this.centerZ + lz;
        const base = meshTerrainShadingNormal(gx, gz, this.world.quality.segments);
        const ni = i * 3;
        const edgeFade = 1 - smoothstep(0.68, 0.90, r);
        const heightActivity = smoothstep(0.0015, 0.020, Math.abs(deformations[i]));
        const stateActivity = clamp(looseValues[i] * 0.32 + compactValues[i] * 0.22, 0, 1);
        const physicalActivity = clamp(Math.max(heightActivity, stateActivity) * edgeFade, 0, 1);
        const meshWeight = physicalActivity * 0.42;
        let nx = base.x * (1 - meshWeight) + normals[ni] * meshWeight;
        let ny = base.y * (1 - meshWeight) + normals[ni + 1] * meshWeight;
        let nz = base.z * (1 - meshWeight) + normals[ni + 2] * meshWeight;
        const inv = 1 / Math.hypot(nx, ny, nz);
        normals[ni] = nx * inv;
        normals[ni + 1] = ny * inv;
        normals[ni + 2] = nz * inv;

        const cavity = smoothstep(0.005, 0.055, -deformations[i]);
        const shade = 1 - cavity * (0.080 + compactValues[i] * 0.060);
        const ci = i * 4;
        colors[ci] *= shade;
        colors[ci + 1] *= shade;
        colors[ci + 2] *= shade;
      }
    }

    if (!this.vertexDataApplied) {
      const vd = new VertexData();
      vd.positions = positions;
      vd.normals = normals;
      vd.uvs = uvs;
      vd.colors = colors;
      vd.indices = indices;
      vd.applyToMesh(this.mesh, true);
      this.vertexDataApplied = true;
    } else {
      this.mesh.updateVerticesData(VertexBuffer.PositionKind, positions, true, false);
      this.mesh.updateVerticesData(VertexBuffer.NormalKind, normals, false, false);
      if (uvChanged) this.mesh.updateVerticesData(VertexBuffer.UVKind, uvs, false, false);
      this.mesh.updateVerticesData(VertexBuffer.ColorKind, colors, false, false);
    }

    this.mesh.position.x = this.centerX - this.world.offsetX;
    this.mesh.position.z = this.centerZ - this.world.offsetZ;
    this.mesh.refreshBoundingInfo();
    this.dirty = false;
  }

  syncOrigin() {
    if (!Number.isFinite(this.centerX)) return;
    this.mesh.position.x = this.centerX - this.world.offsetX;
    this.mesh.position.z = this.centerZ - this.world.offsetZ;
  }

  dispose() { this.mesh.dispose(); }
}
