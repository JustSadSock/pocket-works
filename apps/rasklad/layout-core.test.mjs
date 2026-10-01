import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPackedLayout, hasOverlap } from './layout-core.js';

const PAGE_W = 2480;
const PAGE_H = 3508;
const RATIOS = [0.45, 0.62, 0.8, 1, 1.25, 1.6, 2.1];

function imagesFor(count, seed) {
  return Array.from({ length: count }, (_, index) => {
    const height = 4200;
    const ratio = RATIOS[(index + seed) % RATIOS.length];
    return {
      id: `${count}-${seed}-${index}`,
      width: Math.round(height * ratio),
      height
    };
  });
}

for (const count of [1, 3, 6, 10, 20, 40, 60]) {
  test(`packs ${count} images without overlap`, () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const images = imagesFor(count, seed);
      const result = buildPackedLayout(images, seed * 7919 + count);

      assert.equal(result.items.length, count);
      assert.equal(hasOverlap(result.items), false);

      for (const item of result.items) {
        assert.ok(item.x >= 0 && item.y >= 0, 'item starts inside page');
        assert.ok(item.x + item.w <= 1 + 1e-8, 'item width stays inside page');
        assert.ok(item.y + item.h <= 1 + 1e-8, 'item height stays inside page');

        const source = images.find((image) => image.id === item.id);
        assert.ok(item.w * PAGE_W <= source.width + 1, 'layout never upscales width beyond source');
        assert.ok(item.h * PAGE_H <= source.height + 1, 'layout never upscales height beyond source');
      }

      if (count >= 10) {
        assert.ok(result.coverage >= 0.5, `dense layouts should use at least half the page, got ${result.coverage}`);
      }
    }
  });
}


test('density slider increases page usage without overlaps', () => {
  for (const count of [10, 20, 40, 60]) {
    for (let seed = 1; seed <= 10; seed += 1) {
      const images = imagesFor(count, seed);
      const layoutSeed = seed * 3571 + count;
      const loose = buildPackedLayout(images, layoutSeed, { density: 0 });
      const dense = buildPackedLayout(images, layoutSeed, { density: 100 });

      assert.equal(hasOverlap(loose.items), false);
      assert.equal(hasOverlap(dense.items), false);
      assert.ok(
        dense.coverage >= loose.coverage + 0.05,
        `density should reduce whitespace for ${count} images: ${loose.coverage} -> ${dense.coverage}`
      );
    }
  }
});

test('density input is clamped and defaults to 85', () => {
  const images = imagesFor(12, 3);
  assert.equal(buildPackedLayout(images, 42).density, 85);
  assert.equal(buildPackedLayout(images, 42, { density: -20 }).density, 0);
  assert.equal(buildPackedLayout(images, 42, { density: 140 }).density, 100);
});
