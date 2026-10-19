import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const client = await readFile(new URL('../game.js',import.meta.url),'utf8');
const server = await readFile(new URL('../server/module.ts',import.meta.url),'utf8');

function segment(source, begin, end) {
  const start = source.indexOf(begin);
  assert.ok(start >= 0, 'Missing shared physics anchor: '+begin);
  const finish = source.indexOf(end,start+begin.length);
  assert.ok(finish>start, 'Missing ending anchor after '+begin);
  return source.slice(start,finish).trim();
}

// Until Blockies gets a single build-time engine source, lock the duplicate
// collision/rotation/bag logic against silent divergence in ordinary PRs.
const identical = [
  ['tetrominoes','const SHAPES = {','// Default colors for players'],
  ['shared random source','function randomFloat()','// Shared seven-bag:'],
  ['seven-bag logic','function nextBaggedPiece()','function formatKeyLabel('],
  ['collision with active/locked pieces','    checkCollision(','    move(dir,'],
  ['grid movement','    move(dir,','    rotate({ broadcast'],
  ['rotation and bounded kicks','    rotate({ broadcast','    drop({ broadcast'],
  ['piece reserve swap','    hold({ broadcast','    placeSpawn()'],
  ['spawn and blocked cells','    placeSpawn()','    checkCollision('],
  ['other active players','function isCellOccupiedByOtherPiece(','function checkAllPlayersGameOver(']
];
for (const [name,begin,end] of identical) {
  test('client/server physics parity: '+name,()=>{
    assert.equal(segment(client,begin,end),segment(server,begin,end));
  });
}

test('line-clear scoring remains byte-equivalent after excluding client-only effects',()=>{
  const sanitize = source => segment(source,'    clearLines() {','    update(deltaTime) {')
    .replace(/^\s*\/\/.*$/gm,'')
    .replace(/\s*window\.uiManager\?\.signalImpact\(linesCleared\);/g,'')
    .replace(/\s+/g,'');
  assert.equal(sanitize(client),sanitize(server));
});

test('hard drop is equivalent apart from purely visual impact effects',()=>{
  const sanitize = source => segment(source,'    hardDrop({ broadcast','    merge() {')
    .replace(/\s*window\.uiManager\?\.signalImpact\(\);/g,'')
    .replace(/\s+/g,'');
  assert.equal(sanitize(client),sanitize(server));
});
