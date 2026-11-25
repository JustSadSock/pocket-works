import test from 'node:test';
import assert from 'node:assert/strict';
import {layout,pdfFromJpegs} from './core.mjs';
test('exact millimetres, copies and page breaks',()=>{const p=layout([{id:'a',w:10,h:15,copies:5}]);assert.equal(p.pages.length,5);assert.deepEqual(p.pages[0][0],{id:'a',x:5,y:5,w:100,h:150})});
test('fits mixed sizes with no overlap or overflow',()=>{for(const landscape of [false,true])for(let k=1;k<30;k++){const p=layout(Array.from({length:20},(_,i)=>({id:i,w:1+(i*k%14),h:1+(i*3%14),copies:2})),landscape);for(const page of p.pages)for(const a of page){assert.ok(a.x>=5&&a.y>=5&&a.x+a.w<=p.W-5+.00001&&a.y+a.h<=p.H-5+.00001);for(const b of page)if(a!==b)assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y)}}});
test('reject oversized and nonnumeric dimensions',()=>assert.deepEqual(layout([{id:1,w:30,h:1},{id:2,w:NaN,h:5}]).invalid,[1,2]));
test('PDF has precise A4 MediaBox and valid offsets',async()=>{const b=await pdfFromJpegs([{width:1,height:1,bytes:new Uint8Array([255,216,255,217])}],210,297).arrayBuffer();const s=new TextDecoder('latin1').decode(b);assert.match(s,/MediaBox \[0 0 595\.275591 841\.889764\]/);const x=Number(s.match(/startxref\n(\d+)/)[1]);assert.equal(s.slice(x,x+4),'xref');for(const [i,line] of s.slice(x).split('\n').slice(3,8).entries())assert.ok(s.slice(Number(line.slice(0,10))).startsWith((i+1)+' 0 obj'))});
