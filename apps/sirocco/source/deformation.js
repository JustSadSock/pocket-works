import { Matrix, Mesh, Quaternion, SolidParticleSystem, Vector3, VertexData } from '@babylonjs/core';
import { clamp } from './core.js';

function makeFootprintTemplate(scene) {
  const rows = 12;
  const cols = 6;
  const length = 0.34;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  function widthAt(t) {
    const toe = Math.exp(-Math.pow((t - 0.76) / 0.24, 2)) * 0.032;
    const arch = Math.exp(-Math.pow((t - 0.1) / 0.25, 2)) * 0.012;
    return 0.064 + toe + arch;
  }

  for (let r = 0; r <= rows; r += 1) {
    const t = r / rows;
    const z = (t - 0.5) * length;
    const half = widthAt(t);
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const x = (u - 0.5) * half * 2;
      const lateral = Math.abs(u - 0.5) * 2;
      const edgeRidge = Math.exp(-Math.pow((lateral - 0.84) / 0.13, 2)) * 0.018;
      const heelToe = 0.003 * Math.sin(t * Math.PI * 2);
      const bowl = (1 - lateral * lateral) * (0.004 + Math.sin(t * Math.PI) * 0.003);
      positions.push(x, 0.008 + edgeRidge - bowl + heelToe, z);
      normals.push(0, 1, 0);
      uvs.push(u, t);
    }
  }
  const row = cols + 1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = r * row + c, b = a + 1, d = a + row, e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const mesh = new Mesh('footprint-template', scene);
  const vd = new VertexData();
  vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.indices = indices;
  VertexData.ComputeNormals(positions, indices, normals);
  vd.normals = normals;
  vd.applyToMesh(mesh);
  return mesh;
}

export class FootprintField {
  constructor(scene, material, limit = 84) {
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
    for (const particle of this.sps.particles) particle.scale.setAll(0);
    this.sps.setParticles();
  }

  setLimit(limit) {
    this.limit = Math.min(this.entries.length, limit);
  }

  add(landing, controller) {
    const index = this.cursor % this.limit;
    this.cursor += 1;
    const p = this.sps.particles[index];
    const normal = new Vector3(landing.normal.x, landing.normal.y, landing.normal.z);
    const forward = new Vector3(Math.sin(landing.yaw), 0, Math.cos(landing.yaw));
    const tangent = forward.subtract(normal.scale(Vector3.Dot(forward, normal))).normalize();
    p.position.copyFrom(landing.position.add(normal.scale(0.003)));
    p.rotationQuaternion = Quaternion.FromLookDirectionLH(tangent, normal);
    if (landing.side === 'left') {
      const mirror = Quaternion.RotationAxis(normal, -0.025);
      p.rotationQuaternion = mirror.multiply(p.rotationQuaternion);
    } else {
      const mirror = Quaternion.RotationAxis(normal, 0.025);
      p.rotationQuaternion = mirror.multiply(p.rotationQuaternion);
    }
    const penetration = 0.9 + clamp(controller.speed / 3.25, 0, 1) * 0.14 + clamp(controller.lastSlope / 0.65, 0, 1) * 0.09;
    p.scale.set(1, penetration, 1);
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
