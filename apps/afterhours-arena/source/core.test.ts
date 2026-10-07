import { describe, expect, it } from 'vitest';
import { approach } from './core';
describe('approach', () => {
  it('moves toward the target', () => expect(approach(0, 10, 0.2)).toBe(2));
});

