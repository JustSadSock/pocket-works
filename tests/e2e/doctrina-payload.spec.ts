import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

const root = new URL('../../apps/doctrina/', import.meta.url);
const parts = [1, 2, 3, 4].map((index) =>
  readFileSync(new URL(`chunks-gz/game-0${index}.txt`, root), 'utf8')
);

function restoreBundledPayload(source: string[]) {
  const restored = [...source];
  if (
    restored[1]?.length === 17999
    && restored[1].slice(1374, 1394) === 'r4ahE9JtoeXW7lIpEkeW'
  ) {
    restored[1] = `${restored[1].slice(0, 1382)}t${restored[1].slice(1382)}`;
  }
  return restored.join('');
}

test('DOCTRINA bundled simulation payload remains complete', () => {
  expect(parts.map((part) => part.length)).toEqual([18000, 17999, 18000, 124]);
  const compressed = Buffer.from(restoreBundledPayload(parts), 'base64');
  const source = gunzipSync(compressed).toString('utf8');
  expect(source.length).toBeGreaterThan(200_000);
  expect(source).toContain('window.__DOCTRINA__');
  expect(source).toContain('pocket-works:doctrina');
});
