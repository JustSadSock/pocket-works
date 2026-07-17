import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [loaderCss, ...appChunks] = await Promise.all([
  read('./styles.css'),
  ...[0, 1, 2, 3].map((index) => read(`./bundle/app-${index}.txt`))
]);
const app = gunzipSync(Buffer.from(appChunks.join(''), 'base64')).toString('utf8');
const pointy = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)';
const flat = 'polygon(25% 6.7%,75% 6.7%,100% 50%,75% 93.3%,25% 93.3%,0 50%)';

assert(loaderCss.includes(`${pointy}!important`), 'pointy-top override is missing');
assert(!loaderCss.includes(flat), 'loader must not reintroduce flat-top geometry');
assert(app.includes('x:sqrt3*(q+r/2),y:1.5*r'), 'renderer must use pointy-top axial centers');
assert(app.includes('cellWidth=sqrt3*size;const cellHeight=2*size'), 'renderer must use a regular pointy-top aspect ratio');

const directions = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
for (const radius of [3, 4, 5]) {
  const cells = [];
  const indexByKey = new Map();
  for (let r = -radius; r <= radius; r += 1) {
    const qMin = Math.max(-radius, -r - radius);
    const qMax = Math.min(radius, -r + radius);
    for (let q = qMin; q <= qMax; q += 1) {
      indexByKey.set(`${q},${r}`, cells.length);
      cells.push({ q, r });
    }
  }
  assert.equal(cells.length, 1 + 3 * radius * (radius + 1));

  const centers = cells.map(({ q, r }) => ({
    x: Math.sqrt(3) * (q + r / 2),
    y: 1.5 * r
  }));

  cells.forEach(({ q, r }, from) => {
    directions.forEach(([dq, dr]) => {
      const to = indexByKey.get(`${q + dq},${r + dr}`);
      if (to === undefined) return;
      const distance = Math.hypot(
        centers[to].x - centers[from].x,
        centers[to].y - centers[from].y
      );
      assert(Math.abs(distance - Math.sqrt(3)) < 1e-10, `radius ${radius}: unequal neighbor spacing`);
      const reverse = indexByKey.get(`${q + dq - dq},${r + dr - dr}`);
      assert.equal(reverse, from);
    });
  });
}

console.log('СЛЕД 2.0.1 hex geometry tests: ok');
