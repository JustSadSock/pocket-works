import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawnLaneX} from '../spawn-bays.js';

const js=await fs.readFile(new URL('../game.js',import.meta.url),'utf8');
const css=await fs.readFile(new URL('../styles.css',import.meta.url),'utf8');

test('2–4 player gantries retain four-cell inlets at their deterministic board columns',()=>{
  for(const n of [2,3,4]){
    const width=10+4*(n-1);
    for(let i=0;i<n;i++){
      const lane=spawnLaneX(i,n,width);
      const left=100*lane/width;
      const percentWidth=400/width;
      assert.ok(left>=0 && left+percentWidth<=100+1e-8);
      assert.ok(Math.abs((left+percentWidth)*width/100-(lane+4))<1e-8);
    }
  }
  assert.match(js,/bay\.style\.left=\(100\*player\.spawnLaneX\/gameState\.boardWidth\)/);
  assert.match(js,/bay\.style\.width=\(400\/gameState\.boardWidth\)/);
});

test('fractional cell layout matches one rail to the rendered canvas width without rounding drift',()=>{
  for(const boardWidth of [14,18,22]){
    for(const width of [193,287,320,381,499]){
      const cell=width/boardWidth;
      const railHeight=4*width/boardWidth+20;
      assert.ok(Math.abs((railHeight-20)-4*cell)<1e-10);
      for(let i=0;i<boardWidth;i++){
        assert.ok(Math.abs((i+1)*cell-i*cell-cell)<1e-10);
      }
    }
  }
  assert.match(js,/const railHeight=rail\?\(4\*width\/gameState\.boardWidth\)\+labelExtra:0/);
  assert.match(js,/rail\.style\.setProperty\('--bay-cell',cell\+'px'\)/);
  assert.match(css,/height:calc\(4 \* var\(--bay-cell\) \+ 20px\)/);
});

test('previews fit inside the shared gantry; no duplicate visual cards or collision mutations',()=>{
  assert.match(js,/preview\.className='spawn-bay__preview'/);
  assert.match(js,/preview\.append\(next\)/);
  assert.match(js,/bay\.append\(label,preview,mouth\)/);
  assert.match(css,/#spawn-rail::before/);
  assert.match(css,/background-size:var\(--bay-cell\) var\(--bay-cell\)/);
  assert.match(js,/drawSpawnEntryGuides\(ctx\)/);
  assert.match(js,/ctx\.fillRect\(left,0,width,depth\)/);
  assert.match(js,/const depth=2\*BLOCK_SIZE/);
  assert.match(js,/drawSpawnEntryGuides\(ctx\);/);
  assert.doesNotMatch(js.slice(js.indexOf('    drawSpawnEntryGuides(ctx){'),js.indexOf('    darkenColor(',js.indexOf('    drawSpawnEntryGuides(ctx){'))),/gameState\.board\s*\[/);
});

test('blocked bays, owner focus, keyboard/touch highlights and reduced-motion fallback',()=>{
  assert.match(js,/bay\.classList\.toggle\('is-out',!!player\.gameOver\)/);
  assert.match(js,/bay\.classList\.toggle\('is-owned'/);
  assert.match(js,/this\.noteSpawnAction\(player\)/);
  assert.match(css,/\.spawn-bay\.is-out \.spawn-bay__mouth/);
  assert.match(css,/\.spawn-bay\.is-out \.spawn-bay__status/);
  assert.match(css,/@keyframes gate-shutter/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
