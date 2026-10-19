import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const art = Array.from({length:6},(_,i)=>({
  filename:'puzzle-'+String(i+1).padStart(2,'0')+'.svg',
  text:readFileSync(join(root,'assets/puzzles/puzzle-'+String(i+1).padStart(2,'0')+'.svg'),'utf8')
}));
function count(str,tag){return (str.match(new RegExp('<'+tag+'(?:[\\s>])','g'))||[]).length}
for(const {filename,text} of art) {
 test(filename+' has canonical SVG dimensions and rooted crop geometry',()=>{
  assert.match(text,/<svg\s[^>]*width="1600"[^>]*height="1200"[^>]*viewBox="0 0 1600 1200"/);
  assert.ok(text.includes('</svg>'));
  assert.equal(count(text,'svg'),1);
  assert.equal(count(text,'g'),(text.match(/<\/g>/g)||[]).length,'all grouped elements close');
  assert.equal(count(text,'defs'),(text.match(/<\/defs>/g)||[]).length);
  assert.ok(count(text,'path')>=4,'mural must have recognizable forms');
  assert.ok(!text.includes('<script'),'SVG art must be inert');
  assert.ok(!/href\s*=\s*["']https?:/i.test(text),'art may not load remote resources');
 });
}
test('first six puzzle canvases have genuinely different compositions',()=>{
 const normalized=art.map(a=>a.text
   .replace(/#[0-9a-f]{3,8}/gi,'#COLOR')
   .replace(/\d+(?:\.\d+)?/g,'N')
   .replace(/\s+/g,' ')
   .slice(0,1500));
 assert.equal(new Set(normalized).size,art.length);
 const signatures=['circle cx="1160"','ellipse transform="rotate(','stroke="#162a40"',
   'M-230 540V-65','M-100 380L-58-230','cx="770" cy="400"'];
 signatures.forEach((sig,index)=>assert.ok(art[index].text.includes(sig),art[index].filename+' missing hero motif'));
});
