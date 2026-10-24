import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const [client,server]=await Promise.all([
 fs.readFile(new URL('../game.js',import.meta.url),'utf8'),
 fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8')
]);
function extract(source,start,end){
 const at=source.indexOf(start);
 assert.ok(at>=0,`missing: ${start}`);
 const last=source.indexOf(end,at+start.length);
 assert.ok(last>=0,`missing boundary after ${start}`);
 return source.slice(at,last).trim();
}
test('core shapes, kick offsets, headroom and lock budgets match across client and server',()=>{
 const boundaries=[
  ['const SHAPES = {','// Default colors'],
  ['const PIECE_TYPES=','function inferShapeType('],
  ['const SAFE_LANE_ROWS =','const ADDITIONAL_COLUMNS_PER_PLAYER'],
 ];
 // Extract semantic values rather than unrelated sound or DOM integrations.
 for(const [start,end] of boundaries){
  const a=extract(client,start,end),b=extract(server,start,end);
  if(start==='const SHAPES = {')assert.equal(a.split('};')[0],b.split('};')[0]);
  else if(start==='const PIECE_TYPES='){
   assert.equal(a,b);
  }else assert.equal(a.split('\n')[0].replace(/\/\/.*$/,'').trim(),b.split('\n')[0].replace(/\/\/.*$/,'').trim());
 }
 for(const prefix of ['const LOCK_DELAY_MS=','const MAX_LOCK_RESETS=','const KICK_OFFSETS=']){
  const take=src=>src.slice(src.indexOf(prefix),src.indexOf('\n',src.indexOf(prefix)));
  assert.equal(take(client),take(server),prefix);
 }
});
test('per-player clear-line attribution code is identical locally and online',()=>{
 const start='function creditClearedRows(';
 const end='function setRandomSeed(';
 assert.equal(extract(client,start,end),extract(server,start,end));
});
