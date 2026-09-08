import { Mesh, VertexData } from '@babylonjs/core';
import { clamp, smoothstep } from './core.js';
import { terrainNormal } from './terrain.js';
import { appendBabylonGroundCell } from './world.js';

const LIGHT_TO_SURFACE = (() => {
  const x = 0.44, y = 0.52, z = -0.73;
  const inv = 1 / Math.hypot(x, y, z);
  return { x: x * inv, y: y * inv, z: z * inv };
})();

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
    this.setQuality(preset);
  }

  setQuality(preset) {
    this.radius = preset.id === 'high' ? 5.0 : preset.id === 'medium' ? 4.4 : 3.8;
    this.segments = preset.id === 'high' ? 64 : preset.id === 'medium' ? 52 : 40;
    this.snapStep = preset.id === 'high' ? 1.9 : preset.id === 'medium' ? 2.1 : 2.4;
    this.holeRatio = 0.76;
    this.dirty = true;
  }

  markDirty() { this.dirty = true; }

  sampleHeight(x, z) {
    return this.world.sampleBaseHeight(x, z) + clamp(this.sand.sampleOffset(x, z), -0.11, 0.075);
  }

  sampleNormal(x, z) {
    const step = 0.075;
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
    const segments = this.segments;
    const diameter = this.radius * 2;
    const step = diameter / segments;
    const row = segments + 1;
    const vertexCount = row * row;
    const positions = new Array(vertexCount * 3);
    const normals = new Array(vertexCount * 3).fill(0);
    const uvs = new Array(vertexCount * 2);
    const colors = new Array(vertexCount * 4);
    const radial = new Array(vertexCount);
    const deformations = new Array(vertexCount);
    const indices = [];
    let p = 0, uv = 0, c = 0, vertex = 0;

    for (let iz = 0; iz <= segments; iz += 1) {
      const lz = -this.radius + iz * step;
      for (let ix = 0; ix <= segments; ix += 1) {
        const lx = -this.radius + ix * step;
        const gx = this.centerX + lx;
        const gz = this.centerZ + lz;
        const r = Math.hypot(lx, lz) / this.radius;
        radial[vertex] = r;
        const deformFade = 1 - smoothstep(0.68, 0.86, r);
        const rawDeformation = clamp(this.sand.sampleOffset(gx, gz), -0.11, 0.075);
        const deformation = rawDeformation * deformFade;
        deformations[vertex] = deformation;
        positions[p] = lx;
        positions[p + 1] = this.world.sampleBaseHeight(gx, gz) + deformation;
        positions[p + 2] = lz;
        p += 3;
        uvs[uv] = gx * 0.055;
        uvs[uv + 1] = gz * 0.055;
        uv += 2;

        // Base chroma contrast: compressed sand is darker and slightly redder,
        // displaced dry rims are a touch lighter. A second directional pass is
        // applied after normals are known so this remains stable and local.
        const compact = smoothstep(0.004, 0.070, -deformation);
        const deposit = smoothstep(0.004, 0.052, deformation);
        colors[c] = 1 - compact * 0.105 + deposit * 0.020;
        colors[c + 1] = 1 - compact * 0.135 + deposit * 0.014;
        colors[c + 2] = 1 - compact * 0.175 + deposit * 0.006;
        colors[c + 3] = 1;
        c += 4;
        vertex += 1;
      }
    }

    const renderRadius = this.radius * 0.985;
    for (let z = 0; z < segments; z += 1) {
      for (let x = 0; x < segments; x += 1) {
        const cellX = -this.radius + (x + 0.5) * step;
        const cellZ = -this.radius + (z + 0.5) * step;
        if (Math.hypot(cellX, cellZ) >= renderRadius) continue;
        const a = z * row + x, b = a + 1, d = a + row, e = d + 1;
        appendBabylonGroundCell(indices, a, b, d, e);
      }
    }

    VertexData.ComputeNormals(positions, indices, normals);

    for (let iz = 0; iz <= segments; iz += 1) {
      const lz = -this.radius + iz * step;
      for (let ix = 0; ix <= segments; ix += 1) {
        const lx = -this.radius + ix * step;
        const i = iz * row + ix;
        const r = radial[i];
        const gx = this.centerX + lx, gz = this.centerZ + lz;
        const base = terrainNormal(gx, gz, 0.42);
        const ni = i * 3;

        // Preserve high-res normals through the physical footprint itself, but
        // fade them to the procedural dune normal before the patch boundary.
        const edgeBlend = smoothstep(0.70, 0.91, r);
        if (edgeBlend > 0) {
          let nx = normals[ni] + (base.x - normals[ni]) * edgeBlend;
          let ny = normals[ni + 1] + (base.y - normals[ni + 1]) * edgeBlend;
          let nz = normals[ni + 2] + (base.z - normals[ni + 2]) * edgeBlend;
          const inv = 1 / Math.hypot(nx, ny, nz);
          normals[ni] = nx * inv;
          normals[ni + 1] = ny * inv;
          normals[ni + 2] = nz * inv;
        }

        // Stable pseudo self-shadow: compare the deformed normal to the base
        // dune under the same sun. Only local loss of direct light darkens the
        // albedo, so untouched terrain and the render-radius edge stay identical.
        const localLambert = Math.max(0, normals[ni] * LIGHT_TO_SURFACE.x + normals[ni + 1] * LIGHT_TO_SURFACE.y + normals[ni + 2] * LIGHT_TO_SURFACE.z);
        const baseLambert = Math.max(0, base.x * LIGHT_TO_SURFACE.x + base.y * LIGHT_TO_SURFACE.y + base.z * LIGHT_TO_SURFACE.z);
        const directionalShade = clamp((baseLambert - localLambert) * 0.72, 0, 0.24);
        const cavity = smoothstep(0.006, 0.060, -deformations[i]) * 0.11;
        const shade = 1 - directionalShade - cavity;
        const ci = i * 4;
        colors[ci] *= shade;
        colors[ci + 1] *= shade;
        colors[ci + 2] *= shade;
      }
    }

    const vd = new VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.uvs = uvs;
    vd.colors = colors;
    vd.indices = indices;
    vd.applyToMesh(this.mesh, true);
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
