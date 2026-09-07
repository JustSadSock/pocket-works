import { Mesh, Quaternion, SolidParticleSystem, Vector3, VertexData } from '@babylonjs/core';
import { clamp } from './core.js';

function createSlipTemplate(scene) {
  const rows = 10;
  const cols = 5;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let r = 0; r <= rows; r += 1) {
    const t = r / rows;
    const z = (t - 0.18) * 0.62;
    const fade = Math.sin(Math.PI * Math.min(1, t * 1.08));
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const lateral = (u - 0.5) * 2;
      const x = lateral * (0.07 + 0.04 * t);
      const ridge = Math.exp(-Math.pow((Math.abs(lateral) - 0.82) / 0.18, 2)) * 0.018 * fade;
      const trough = (1 - lateral * lateral) * 0.009 * fade;
      const rippled = Math.sin(t * Math.PI * 7 + lateral) * 0.0025 * fade;
      positions.push(x, ridge - trough + rippled, z);
      normals.push(0, 1, 0);
      uvs.push(u, t);
    }
  }
  const row = cols + 1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = r * row + c;
      const b = a + 1;
      const d = a + row;
      const e = d + 1;
      indices.push(b, e, d, a, b, d);
    }
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const mesh = new Mesh('slip-template', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  return mesh;
}

export class SlipField {
  constructor(scene, material, capacity = 36) {
    this.capacity = capacity;
    this.limit = capacity;
    this.cursor = 0;
    this.entries = new Array(capacity).fill(null);
    const template = createSlipTemplate(scene);
    this.sps = new SolidParticleSystem('slope-slip-sps', scene, { updatable: true });
    this.sps.addShape(template, capacity);
    this.mesh = this.sps.buildMesh();
    this.mesh.material = material;
    this.mesh.receiveShadows = true;
    this.mesh.isPickable = false;
    template.dispose();
    for (const particle of this.sps.particles) particle.scaling.setAll(0);
    this.sps.setParticles();
  }

  setQuality(preset) {
    this.limit = preset.id === 'high' ? this.capacity : preset.id === 'medium' ? 26 : 14;
  }

  add(landing, downhill, strength) {
    if (!downhill) return;
    const index = this.cursor % this.limit;
    this.cursor += 1;
    const p = this.sps.particles[index];
    const normal = new Vector3(landing.normal.x, landing.normal.y, landing.normal.z);
    let tangent = new Vector3(downhill.x, 0, downhill.z);
    tangent = tangent.subtract(normal.scale(Vector3.Dot(tangent, normal))).normalize();
    p.position.copyFrom(landing.position.add(normal.scale(0.012)));
    p.rotationQuaternion = Quaternion.FromLookDirectionLH(tangent, normal);
    const amount = clamp(strength, 0.25, 1.4);
    p.scaling.set(0.8 + amount * 0.28, 0.8 + amount * 0.2, 0.75 + amount * 0.62);
    this.entries[index] = { particle: p };
    this.sps.setParticles();
  }

  shiftOrigin(dx, dz) {
    let dirty = false;
    for (const entry of this.entries) {
      if (!entry) continue;
      entry.particle.position.x -= dx;
      entry.particle.position.z -= dz;
      dirty = true;
    }
    if (dirty) this.sps.setParticles();
  }

  dispose() {
    this.sps.dispose();
  }
}
