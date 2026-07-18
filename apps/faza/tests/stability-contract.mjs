import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../stability.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

assert.match(css, /\.move-impact\[hidden\][\s\S]*display:\s*block\s*!important/);
assert.match(css, /\.confirm-move\[hidden\][\s\S]*display:\s*block\s*!important/);
assert.match(css, /\.turn-console\s*\{[\s\S]*min-block-size:/);
assert.match(css, /\.board \.stone\.is-new[\s\S]*animation:\s*none\s*!important/);
assert.match(css, /\.board \.cell\.is-preview \.cell-shape[\s\S]*transform:\s*none\s*!important/);
assert.doesNotMatch(css, /@keyframes/);
assert.match(app, /1\.1\.1/);

console.log(JSON.stringify({ status: 'ok', checks: 7 }, null, 2));
