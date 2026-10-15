import assert from 'node:assert/strict';
import {BRUSH_CURSOR_NAMES,BRUSH_CURSOR_KEY,brushCursorSVG,getBrushCursorStyle,setBrushCursorStyle} from '../brush-cursor.js';

assert.equal(BRUSH_CURSOR_NAMES.length,5);
assert.equal(BRUSH_CURSOR_NAMES[0],'Соболь');
const refs=[];
for(let i=0;i<5;i++){
  const svg=brushCursorSVG(i,'#9d4c3c');
  assert.match(svg,/<svg viewBox="0 0 138 138"/);
  assert.match(svg,/translate\(16 16\) rotate\(-45\)/); // Same exact hotspot, regardless of shape.
  assert.match(svg,/fill="#9d4c3c"/);
  assert.match(svg,/zc-hair/);
  assert.match(svg,/zc-metal/);
  assert.match(svg,/zc-wood/);
  refs.push(svg);
}
assert.equal(new Set(refs).size,5);
assert.ok(!brushCursorSVG(0,'"><script>bad()</script>').includes('<script>'));
assert.equal(brushCursorSVG(999),brushCursorSVG(0));

const entries=new Map();
globalThis.localStorage={
  getItem:key=>entries.has(key)?entries.get(key):null,
  setItem:(key,value)=>entries.set(key,value)
};
assert.equal(getBrushCursorStyle(),0);
assert.equal(setBrushCursorStyle(4),4);
assert.equal(entries.get(BRUSH_CURSOR_KEY),'4');
assert.equal(getBrushCursorStyle(),4);
assert.equal(setBrushCursorStyle(123),0);
entries.set(BRUSH_CURSOR_KEY,'NaN');
assert.equal(getBrushCursorStyle(),0);
delete globalThis.localStorage;

console.log('Animated Zamazka brush cursor geometry, SVG safety, and persistence: OK');
