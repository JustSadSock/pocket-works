import { Mesh, Vector3, VertexBuffer, VertexData } from '@babylonjs/core';
import type { DamageZone } from './damage';

export type DetailZone = 'front' | 'rear' | 'left' | 'right' | 'roof';
type Detail = { mesh: Mesh; zone: DetailZone; vertices: Float32Array; crush: Float32Array };

const maxDepth = 0.48;

/** One plastic/metal detail point retains its own crush limit across contacts. */
export function dentVertices(
  vertices: Float32Array,
  crush: Float32Array,
  contact: Vector3,
  inward: Vector3,
  radius: number,
  severity: number
): number {
  const r2 = radius * radius;
  let greatest = 0;
  for (let i = 0; i < vertices.length; i += 3) {
    const dx = vertices[i] - contact.x;
    const dy = vertices[i + 1] - contact.y;
    const dz = vertices[i + 2] - contact.z;
    const distance2 = dx * dx + dy * dy + dz * dz;
    if (distance2 >= r2) continue;
    const index = i / 3;
    const remaining = Math.max(0, 1 - crush[index] / maxDepth);
    if (remaining < 0.01) continue;
    const t = 1 - Math.sqrt(distance2) / radius;
    const smooth = t * t * (3 - 2 * t);
    const amount = Math.min(0.20, severity * 0.29) * smooth * remaining;
    vertices[i] += inward.x * amount;
    vertices[i + 1] += inward.y * amount;
    vertices[i + 2] += inward.z * amount;
    crush[index] = Math.min(maxDepth, crush[index] + amount);
    greatest = Math.max(greatest, amount);
  }
  return greatest;
}

export function impactDirection(zone: DetailZone, contact: Vector3): Vector3 {
  switch (zone) {
    case 'front': return new Vector3(-contact.x * 0.14, -0.10, -1).normalize();
    case 'rear': return new Vector3(-contact.x * 0.14, -0.10, 1).normalize();
    case 'left': return new Vector3(1, -0.08, -contact.z * 0.08).normalize();
    case 'right': return new Vector3(-1, -0.08, -contact.z * 0.08).normalize();
    case 'roof': return new Vector3(-contact.x * 0.07, -1, 0).normalize();
  }
}

function compatible(actual: DetailZone, impact: DamageZone) {
  return actual === impact || (impact === 'chassis' && (actual === 'left' || actual === 'right'));
}

/**
 * Deform authored panel and fascia geometry at vertex level so painted hood,
 * grille and plastic components follow the crushed shell instead of floating
 * unbent in front of it. All edits are local to this vehicle.
 */
export class DetailCrushSystem {
  private details: Detail[] = [];

  register(mesh: Mesh, zone: DetailZone) {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!positions?.length) return;
    this.details.push({
      mesh, zone,
      vertices: new Float32Array(positions),
      crush: new Float32Array(positions.length / 3)
    });
  }

  deform(root: import('@babylonjs/core').TransformNode, worldPoint: Vector3, severity: number, zone: DamageZone) {
    if (severity < 0.025) return;
    root.computeWorldMatrix(true);
    const rootInverse = root.getWorldMatrix().clone().invert();
    const contactRoot = Vector3.TransformCoordinates(worldPoint, rootInverse);
    const radius = 0.73 + Math.min(1.22, severity * 1.53);
    for (const detail of this.details) {
      if (!compatible(detail.zone, zone) || detail.mesh.isDisposed() || detail.mesh.parent !== root) continue;
      detail.mesh.computeWorldMatrix(true);
      const inverse = detail.mesh.getWorldMatrix().clone().invert();
      const localContact = Vector3.TransformCoordinates(worldPoint, inverse);
      const forward = impactDirection(detail.zone, contactRoot);
      const rootDirection = Vector3.TransformNormal(forward, root.getWorldMatrix()).normalize();
      const direction = Vector3.TransformNormal(rootDirection, inverse).normalize();
      const moved = dentVertices(detail.vertices, detail.crush, localContact, direction, radius, severity);
      if (moved > 0) {
        detail.mesh.updateVerticesData(VertexBuffer.PositionKind, detail.vertices, true, false);
        const indices = detail.mesh.getIndices();
        if (indices?.length) {
          const normals = new Float32Array(detail.vertices.length);
          VertexData.ComputeNormals(detail.vertices, indices, normals);
          detail.mesh.updateVerticesData(VertexBuffer.NormalKind, normals, false, false);
        }
        detail.mesh.refreshBoundingInfo();
      }
    }
  }
}
