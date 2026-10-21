import { describe, expect, it } from 'vitest';
import { Matrix, Vector3 } from '@babylonjs/core';
import { wheelPose } from './wheel-pose';

function wheelAxis(heading: number, camber: number, spin: number) {
  const matrix = Matrix.Identity();
  wheelPose(heading, camber, spin).toRotationMatrix(matrix);
  return Vector3.TransformNormal(Vector3.Up(), matrix).normalize();
}
describe('wheel axis stability', () => {
  it('keeps the axle fixed while the rim spins, even when steering', () => {
    for (const heading of [0, 0.3, -0.4]) {
      for (const spin of [0, 0.4, 1, 3.14, 8.7]) {
        const a = wheelAxis(heading, 0.18, 0);
        const b = wheelAxis(heading, 0.18, spin);
        expect(Vector3.Distance(a, b)).toBeLessThan(0.00001);
      }
    }
  });
  it('changes camber only when physically commanded', () => {
    const normal = wheelAxis(0, 0, 0);
    const bent = wheelAxis(0, 0.32, 0);
    expect(Vector3.Distance(normal, bent)).toBeGreaterThan(0.2);
  });
});
