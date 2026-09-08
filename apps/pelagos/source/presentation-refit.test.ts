import { describe, expect, it } from 'vitest';
import { presentationCameraScale } from './presentation-refit';

describe('PELAGOS presentation framing', () => {
  it('keeps the framing adjustment deliberately modest across every hull and rig', () => {
    const cases = [
      presentationCameraScale(10.8, 0.86, 0.78),
      presentationCameraScale(12.8, 1.08, 1.06),
      presentationCameraScale(14.4, 1.02, 0.96),
      presentationCameraScale(15.6, 1.13, 1.12)
    ];
    for (const scale of cases) {
      expect(scale).toBeGreaterThanOrEqual(1.05);
      expect(scale).toBeLessThanOrEqual(1.105);
    }
  });

  it('gives a tall highboard rig more breathing room than a compact storm cutter', () => {
    const compact = presentationCameraScale(12.8, 0.86, 0.78);
    const tall = presentationCameraScale(15.6, 1.13, 1.12);
    expect(tall).toBeGreaterThan(compact + 0.02);
  });
});
