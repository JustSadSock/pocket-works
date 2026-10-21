import { Color3, Mesh, MeshBuilder, PBRMaterial, Scene, Vector3 } from '@babylonjs/core';

type SkidMark = { mesh: Mesh; remaining: number; maxLife: number };

type Particle = {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
  maxLife: number;
  kind: 'spark' | 'dust' | 'glass';
};

export class ImpactEffects {
  private pool: Particle[] = [];
  private sparkMaterial: PBRMaterial;
  private dustMaterial: PBRMaterial;
  private glassMaterial: PBRMaterial;
  private markPool: SkidMark[] = [];
  private markCursor = 0;

  constructor(private scene: Scene, size = 48) {
    this.sparkMaterial = new PBRMaterial('impact-spark', scene);
    this.sparkMaterial.albedoColor = new Color3(1, 0.38, 0.08);
    this.sparkMaterial.emissiveColor = new Color3(1, 0.22, 0.02);
    this.sparkMaterial.metallic = 0.1;
    this.sparkMaterial.roughness = 0.32;

    this.dustMaterial = new PBRMaterial('impact-dust', scene);
    this.dustMaterial.albedoColor = new Color3(0.55, 0.49, 0.4);
    this.dustMaterial.roughness = 1;

    this.glassMaterial = new PBRMaterial('impact-glass', scene);
    this.glassMaterial.albedoColor = new Color3(0.55, 0.72, 0.75);
    this.glassMaterial.alpha = 0.66;
    this.glassMaterial.metallic = 0.08;
    this.glassMaterial.roughness = 0.18;

    const tread = new PBRMaterial('ground-rubber-trail', scene);
    tread.albedoColor = new Color3(0.027, 0.03, 0.03);
    tread.roughness = 1;
    tread.alpha = 0.47;
    tread.transparencyMode = 2;
    for (let i = 0; i < 80; i++) {
      const mesh = MeshBuilder.CreateGround('skid-trail-' + i, { width: 0.16, height: 0.58 }, scene);
      mesh.material = tread;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.markPool.push({ mesh, remaining: 0, maxLife: 1 });
    }

    for (let i = 0; i < size; i += 1) {
      const mesh = MeshBuilder.CreateBox('impact-bit-' + i, { size: 0.035 }, scene);
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.pool.push({ mesh, velocity: Vector3.Zero(), life: 0, maxLife: 0, kind: 'spark' });
    }
  }

  burst(point: Vector3, normal: Vector3, severity: number, glass = false) {
    if (severity < 0.025) return;
    const count = Math.min(14, 2 + Math.floor(severity * 13));
    const baseNormal = normal.lengthSquared() > 0.01 ? normal.normalizeToNew() : Vector3.Up();
    for (let i = 0; i < count; i += 1) {
      const particle = this.pool.find((entry) => entry.life <= 0);
      if (!particle) break;
      const kind: Particle['kind'] = glass && i % 2 === 0 ? 'glass' : severity > 0.14 && i % 3 !== 0 ? 'spark' : 'dust';
      particle.kind = kind;
      particle.life = particle.maxLife = kind === 'spark' ? 0.26 + severity * 0.3 : kind === 'glass' ? 0.55 : 0.46;
      particle.mesh.material = kind === 'spark' ? this.sparkMaterial : kind === 'glass' ? this.glassMaterial : this.dustMaterial;
      particle.mesh.scaling.setAll(kind === 'dust' ? 1.8 : kind === 'glass' ? 1.3 : 0.72);
      particle.mesh.position.copyFrom(point);
      const phase = (i + 1) * 2.399963;
      const side = new Vector3(Math.cos(phase), 0.25 + ((i * 7) % 5) * 0.09, Math.sin(phase));
      particle.velocity = baseNormal.scale(1.5 + severity * 3.8).add(side.scale(0.9 + severity * 2.4));
      particle.mesh.setEnabled(true);
    }
  }

  skid(point: Vector3, direction: Vector3, intensity: number) {
    // Brief wheel smoke/dust, pooled and capped like the collision fragments.
    const count = Math.min(4, Math.max(1, Math.round(intensity * 3)));
    for (let i = 0; i < count; i++) {
      const particle = this.pool.find(entry => entry.life <= 0);
      if (!particle) return;
      particle.kind = 'dust';
      particle.life = particle.maxLife = 0.25 + Math.min(0.36, intensity * 0.14);
      particle.mesh.material = this.dustMaterial;
      particle.mesh.scaling.setAll(2.2 + intensity * 1.1);
      particle.mesh.position.copyFrom(point);
      const angle = (i + 1) * 2.4;
      particle.velocity = direction.scale(0.45 + intensity * 0.25)
        .add(new Vector3(Math.cos(angle) * 0.4, 0.65 + i * 0.09, Math.sin(angle) * 0.4));
      particle.mesh.visibility = 0.72;
      particle.mesh.setEnabled(true);
    }
  }

  markTire(point: Vector3, forward: Vector3, intensity: number) {
    if (intensity < 0.15) return;
    const mark = this.markPool[this.markCursor];
    this.markCursor = (this.markCursor + 1) % this.markPool.length;
    mark.mesh.position.set(point.x, 0.018, point.z);
    mark.mesh.rotation.y = Math.atan2(forward.x, forward.z);
    mark.mesh.scaling.x = 0.84 + Math.min(0.5, intensity * 0.22);
    mark.remaining = mark.maxLife = 9 + Math.min(5, intensity * 1.5);
    mark.mesh.visibility = Math.min(0.85, 0.24 + intensity * 0.2);
    mark.mesh.setEnabled(true);
  }

  clearTracks() {
    for (const mark of this.markPool) {
      mark.remaining = 0;
      mark.mesh.setEnabled(false);
    }
    this.markCursor = 0;
  }

  update(dt: number) {
    for (const mark of this.markPool) {
      if (mark.remaining <= 0) continue;
      mark.remaining -= dt;
      if (mark.remaining <= 0) {
        mark.mesh.setEnabled(false);
      } else {
        const fade = Math.min(1, mark.remaining / 2.8);
        mark.mesh.visibility = 0.42 * fade;
      }
    }
    for (const particle of this.pool) {
      if (particle.life <= 0) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.mesh.setEnabled(false);
        continue;
      }
      particle.velocity.y -= 7.6 * dt;
      particle.velocity.scaleInPlace(Math.max(0, 1 - dt * (particle.kind === 'dust' ? 4.4 : 1.3)));
      particle.mesh.position.addInPlace(particle.velocity.scale(dt));
      particle.mesh.rotation.x += dt * 7;
      particle.mesh.rotation.z += dt * 4;
      particle.mesh.visibility = Math.max(0, particle.life / particle.maxLife);
    }
  }

  get activeCount() {
    return this.pool.reduce((count, particle) => count + (particle.life > 0 ? 1 : 0), 0);
  }
}
