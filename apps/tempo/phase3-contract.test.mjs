import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js = await readFile(new URL('./phase3.js', import.meta.url), 'utf8');
const css = await readFile(new URL('./phase3.css', import.meta.url), 'utf8');

function values(pattern) {
  return [...js.matchAll(pattern)].map((match) => match[1]);
}

test('every emitted phase-3 action has a click handler', () => {
  const emitted = new Set(values(/data-phase3-action=\\?"([^"\\]+)\\?"/g));
  const handled = new Set(values(/action === '([^']+)'/g));
  for (const action of emitted) assert.ok(handled.has(action), `missing handler for ${action}`);
});

test('every next-step route is supported', () => {
  for (const route of ['episode', 'experiments', 'techniques']) assert.match(js, new RegExp(`action === '${route}'`));
});

test('mobile controls retain touch-sized targets and reduced motion support', () => {
  assert.match(css, /\.nav button\{[^}]*min-height:56px/);
  assert.match(css, /#tempo-quick-add\{[^}]*min-height:48px/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test('privacy language distinguishes lock from encryption', () => {
  assert.match(js, /Код закрывает экран/);
  assert.match(js, /AES‑GCM/);
  assert.match(js, /Без него восстановить файл невозможно/);
});
