import type { VehicleId, VehicleSpec } from './config';

export type BodySection = {
  z: number;
  halfWidth: number;
  floorY: number;
  shoulderY: number;
  crownY: number;
  roofHalf: number;
};

type Anchor = [number, number, number, number, number];

// The normalized anchors are a design tool, not collision proxies.
// Their silhouettes retain three distinct proportions while every produced
// vertex remains deformable after an impact.
const PROFILES: Record<VehicleId, Anchor[]> = {
  kestrel: [
    [0.50, 0.38, 0.10, 0.17, 0.64],
    [0.46, 0.48, 0.23, 0.31, 0.72],
    [0.31, 0.50, 0.41, 0.47, 0.82],
    [0.21, 0.49, 0.46, 0.52, 0.78],
    [0.075, 0.485, 0.48, 1.00, 0.72],
    [-0.20, 0.485, 0.49, 1.01, 0.75],
    [-0.41, 0.48, 0.40, 0.56, 0.84],
    [-0.48, 0.45, 0.24, 0.33, 0.75],
    [-0.50, 0.34, 0.10, 0.17, 0.68]
  ],
  meridian: [
    [0.50, 0.31, 0.11, 0.20, 0.66],
    [0.46, 0.46, 0.26, 0.35, 0.76],
    [0.26, 0.50, 0.42, 0.49, 0.85],
    [0.17, 0.50, 0.45, 0.53, 0.83],
    [0.045, 0.49, 0.49, 1.00, 0.73],
    [-0.205, 0.49, 0.49, 1.01, 0.76],
    [-0.33, 0.495, 0.44, 0.52, 0.82],
    [-0.465, 0.45, 0.27, 0.37, 0.76],
    [-0.50, 0.34, 0.12, 0.19, 0.67]
  ],
  bastion: [
    [0.50, 0.38, 0.12, 0.21, 0.76],
    [0.46, 0.475, 0.29, 0.42, 0.85],
    [0.27, 0.50, 0.49, 0.59, 0.86],
    [0.235, 0.50, 0.50, 0.62, 0.86],
    [0.17, 0.50, 0.52, 1.00, 0.87],
    [-0.29, 0.50, 0.53, 1.02, 0.88],
    [-0.415, 0.485, 0.49, 0.98, 0.85],
    [-0.465, 0.47, 0.28, 0.43, 0.83],
    [-0.50, 0.37, 0.14, 0.20, 0.76]
  ]
};

export function bodySections(spec: VehicleSpec, subdivisions = 3): BodySection[] {
  const anchors = PROFILES[spec.id];
  const n = Math.max(1, Math.min(5, Math.round(subdivisions)));
  const result: BodySection[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    for (let step = 0; step < n; step++) {
      const t = step / n, a = anchors[i], b = anchors[i + 1];
      const v = a.map((x, k) => x + (b[k] - x) * t);
      result.push({
        z: v[0] * spec.length,
        halfWidth: v[1] * spec.width,
        floorY: -spec.bodyHeight * 0.43,
        shoulderY: v[2] * spec.bodyHeight,
        crownY: v[3] * spec.cabinHeight * 0.82,
        roofHalf: v[4]
      });
    }
  }
  const tail = anchors[anchors.length - 1];
  result.push({
    z: tail[0] * spec.length,
    halfWidth: tail[1] * spec.width,
    floorY: -spec.bodyHeight * 0.43,
    shoulderY: tail[2] * spec.bodyHeight,
    crownY: tail[3] * spec.cabinHeight * 0.82,
    roofHalf: tail[4]
  });
  return result;
}
