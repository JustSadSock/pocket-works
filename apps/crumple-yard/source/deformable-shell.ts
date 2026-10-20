import {
  Color3,
  Matrix,
  Mesh,
  PBRMaterial,
  Quaternion,
  Scene,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData
} from '@babylonjs/core';
import type { DamageZone } from './damage';
import type { VehicleSpec, VisualPreset } from './config';
import { bodySections, type BodySection } from './body-profile';

function hex(value: string): Color3 {
  return Color3.FromHexString(value);
}

function ring(section: BodySection) {
  const w = section.halfWidth;
  const roofX = w * section.roofHalf;
  const shoulder = section.shoulderY;
  const crown = section.crownY;
  const z = section.z;
  return [
    new Vector3(-w * 0.8, section.floorY, z),
    new Vector3(-w * 0.98, section.floorY * 0.42, z),
    new Vector3(-w, shoulder * 0.65, z),
    new Vector3(-w * 0.98, shoulder, z),
    new Vector3(-roofX, crown * 0.965, z),
    new Vector3(-roofX * 0.53, crown, z),
    new Vector3(0, crown * 1.01, z),
    new Vector3(roofX * 0.53, crown, z),
    new Vector3(roofX, crown * 0.965, z),
    new Vector3(w * 0.98, shoulder, z),
    new Vector3(w, shoulder * 0.65, z),
    new Vector3(w * 0.98, section.floorY * 0.42, z),
    new Vector3(w * 0.8, section.floorY, z),
    new Vector3(0, section.floorY * 1.04, z)
  ];
}

export class DeformableShell {
  readonly root: TransformNode;
  readonly mesh: Mesh;
  readonly basePositions: number[];
  readonly positions: number[];
  readonly indices: number[];
  readonly normals: number[];
  readonly vertexCrush: Float32Array;
  private vertexColors: Float32Array;
  private inverse = Matrix.Identity();

  constructor(scene: Scene, root: TransformNode, spec: VehicleSpec, preset: VisualPreset) {
    this.root = root;
    const sections = bodySections(spec, 3);
    const rings = sections.map(ring);
    const ringSize = rings[0].length;
    const positions: number[] = [];
    const indices: number[] = [];

    for (const points of rings) {
      for (const point of points) positions.push(point.x, point.y, point.z);
    }
    for (let s = 0; s < rings.length - 1; s += 1) {
      for (let i = 0; i < ringSize; i += 1) {
        const next = (i + 1) % ringSize;
        const a = s * ringSize + i;
        const b = s * ringSize + next;
        const c = (s + 1) * ringSize + next;
        const d = (s + 1) * ringSize + i;
        indices.push(a, b, c, a, c, d);
      }
    }
    const cap = (sectionIndex: number, flip: boolean) => {
      const centerIndex = positions.length / 3;
      const points = rings[sectionIndex];
      const center = points.reduce((acc, point) => acc.add(point), Vector3.Zero()).scale(1 / points.length);
      positions.push(center.x, center.y, center.z);
      for (let i = 0; i < ringSize; i += 1) {
        const next = (i + 1) % ringSize;
        const a = sectionIndex * ringSize + i;
        const b = sectionIndex * ringSize + next;
        if (flip) indices.push(centerIndex, b, a);
        else indices.push(centerIndex, a, b);
      }
    };
    cap(0, true);
    cap(rings.length - 1, false);

    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const mesh = new Mesh('deformable-body-shell', scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    const vertexColors = new Float32Array(positions.length / 3 * 4);
    vertexColors.fill(1);
    data.colors = vertexColors;
    data.applyToMesh(mesh, true);
    mesh.parent = root;
    mesh.isPickable = false;
    mesh.receiveShadows = true;

    const material = new PBRMaterial('body-paint', scene);
    material.albedoColor = hex(preset.paint);
    material.metallic = 0.32;
    material.roughness = 0.3;
    material.environmentIntensity = 0.72;
    mesh.material = material;

    this.mesh = mesh;
    this.basePositions = positions.slice();
    this.positions = positions;
    this.indices = indices;
    this.normals = normals;
    this.vertexCrush = new Float32Array(positions.length / 3);
    this.vertexColors = vertexColors;
  }

  setPaint(paint: string) {
    const material = this.mesh.material as PBRMaterial;
    material.albedoColor = hex(paint);
  }

  worldToLocal(point: Vector3) {
    this.root.computeWorldMatrix(true).invertToRef(this.inverse);
    return Vector3.TransformCoordinates(point, this.inverse);
  }

  deform(worldPoint: Vector3, worldNormal: Vector3, severity: number, zone: DamageZone) {
    if (severity < 0.015) return 0;
    this.root.computeWorldMatrix(true).invertToRef(this.inverse);
    const localPoint = Vector3.TransformCoordinates(worldPoint, this.inverse);
    let localNormal = Vector3.TransformNormal(worldNormal, this.inverse);
    if (localNormal.lengthSquared() < 0.001) localNormal = new Vector3(0, 0, 1);
    localNormal.normalize();

    const radius = 0.47 + Math.min(0.88, severity * 0.87);
    const radius2 = radius * radius;
    const centerPull = localPoint.lengthSquared() > 0.01 ? localPoint.normalizeToNew().scale(-1) : localNormal.scale(-1);
    const crushDirection = Vector3.Lerp(localNormal.scale(-1), centerPull, 0.64).normalize();
    const zoneFactor = zone === 'chassis' ? 0.58 : zone === 'roof' ? 0.72 : 1;
    let moved = 0;

    for (let i = 0; i < this.positions.length; i += 3) {
      const px = this.positions[i];
      const py = this.positions[i + 1];
      const pz = this.positions[i + 2];
      const dx = px - localPoint.x;
      const dy = py - localPoint.y;
      const dz = pz - localPoint.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > radius2) continue;

      const vertex = i / 3;
      const distance = Math.sqrt(d2);
      const t = 1 - distance / radius;
      const falloff = t * t * (3 - 2 * t);
      const existing = this.vertexCrush[vertex];
      const capacity = Math.max(0, 1 - existing / 0.52);
      if (capacity <= 0.02) continue;

      const amount = Math.min(0.17, severity * 0.22) * falloff * zoneFactor * (0.38 + 0.62 * capacity);
      this.positions[i] += crushDirection.x * amount;
      this.positions[i + 1] += crushDirection.y * amount;
      this.positions[i + 2] += crushDirection.z * amount;
      this.vertexCrush[vertex] = Math.min(0.52, existing + amount);
      const distress = this.vertexCrush[vertex] / 0.52;
      const colorIndex = vertex * 4;
      this.vertexColors[colorIndex] = 1 - distress * 0.48;
      this.vertexColors[colorIndex + 1] = 1 - distress * 0.43;
      this.vertexColors[colorIndex + 2] = 1 - distress * 0.35;
      moved = Math.max(moved, amount);
    }

    if (moved > 0) {
      VertexData.ComputeNormals(this.positions, this.indices, this.normals);
      this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions, false, false);
      this.mesh.updateVerticesData(VertexBuffer.NormalKind, this.normals, false, false);
      this.mesh.updateVerticesData(VertexBuffer.ColorKind, this.vertexColors, false, false);
      this.mesh.refreshBoundingInfo();
    }
    return moved;
  }

  deformationScore() {
    let total = 0;
    for (const value of this.vertexCrush) total += value;
    return total / Math.max(1, this.vertexCrush.length);
  }
}

export function quaternionFromRapier(rotation: { x: number; y: number; z: number; w: number }) {
  return new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
}
