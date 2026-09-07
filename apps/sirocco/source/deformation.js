import { Mesh, Quaternion, SolidParticleSystem, Vector3, VertexData } from '@babylonjs/core';
import { clamp } from './core.js';

function makeFootprintTemplate(scene) {
  const rows = 14;
  const cols = 8;
  const length = 0.35;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  function widthAt(t) {
    const toe = Math.exp(-Math.pow((t - 0.77) / 0.22, 2)) * 0.034;
    const heel = Math.exp(-Math.pow((t - 0.08) / 0.2, 2)) * 0.012;
    const arch = -Math.exp(-Math.pow((t - 0.43) / 0.16, 2)) * 0.009;
    return 0.064 + toe + heel + arch;
  }

  for (let r = 0; r <= rows; r += 1) {
    const t = r / rows;
    const z = (t - 0.5) * length;
    const half = widthAt(t);
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const x = (u - 0.5) * half * 2;
      const lateral = Math.abs(u - 0.5) * 2;
      const interior = Math.max(0, 1 - lateral * lateral);
      const contact = Math.sin(Math.PI * t) * 0.72 + 0.28;
      const bowl = interior * contact * 0.017;
      const edgeRidge = Math.exp(-Math.pow((lateral - 0.9) / 0.09, 2)) * contact * 0.021;
      const toePress = Math.exp(-Math.pow((t - 0.79) / 0.16, 2)) * interior * 0.006;
      const heelPress = Math.exp(-Math.pow((t - 0.09) / 0.12, 2)) * interior * 0.005;
      positions.push(x, edgeRidge - bowl - toePress - heelPress, z);
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
  const mesh = new Mesh('footprint-template', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  return mesh;
}

export class FootprintField {
  constructor(scene, material, limit = 112) {
    this.scene = scene;
    this.limit = limit;
    this.cursor = 0;
    this.visible = true;
    this.entries = new Array(limit).fill(null);
    const template = makeFootprintTemplate(scene);
    this.sps = new SolidParticleSystem('footprint-sps', scene, { updatable: true });
    this.sps.addShape(template, limit);
    this.mesh = this.sps.buildMesh();
    this.mesh.material = material;
    this.mesh.receiveShadows = true;
    this.mesh.isPickable = false;
    template.dispose();
    for (const particle of this.sps.particles) particle.scaling.setAll(0);
    this.sps.setParticles();
  }

  setLimit(limit) {
    this.limit = Math.max(8, Math.min(this.entries.length, limit));
  }

  add(landing, controller) {
    const index = this.cursor % this.limit;
    this.cursor += 1;
    const p = this.sps.particles[index];
    const normal = new Vector3(landing.normal.x, landing.normal.y, landing.normal.z);
    const forward = new Vector3(Math.sin(landing.yaw), 0, Math.cos(landing.yaw));
    const tangent = forward.subtract(normal.scale(Vector3.Dot(forward, normal))).normalize();
    const penetration = 0.86 + clamp(controller.speed / 3.25, 0, 1) * 0.18 + clamp(controller.lastSlope / 0.65, 0, 1) * 0.13;
    p.position.copyFrom(landing.position.add(normal.scale(0.011)));
    p.rotationQuaternion = Quaternion.FromLookDirectionLH(tangent, normal);
    p.rotationQuaternion = Quaternion.RotationAxis(normal, landing.side === 'left' ? -0.026 : 0.026).multiply(p.rotationQuaternion);
    p.scaling.set(1 + penetration * 0.025, penetration, 1 + penetration * 0.018);
    this.entries[index] = { particle: p };
    this.sps.setParticles();
  }

  shiftOrigin(dx, dz) {
    let changed = false;
    for (const entry of this.entries) {
      if (!entry) continue;
      entry.particle.position.x -= dx;
      entry.particle.position.z -= dz;
      changed = true;
    }
    if (changed) this.sps.setParticles();
  }

  setVisible(enabled) {
    this.visible = enabled;
    this.mesh.setEnabled(enabled);
  }

  get count() {
    return Math.min(this.cursor, this.limit);
  }

  dispose() {
    this.sps.dispose();
  }
}
