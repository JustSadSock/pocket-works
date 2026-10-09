import test from 'node:test';
import assert from 'node:assert/strict';
import {fitChapel} from '../playfield-layout.js';
import {LEVELS} from '../logic.js';

test('recess, rose, shafts, altar and sill remain on screen at phone sizes',()=>{
 const widths=[280,300,320,344,360,375,390,414,430,480,540];
 const stages=[275,300,330,360,400,450,500,580,660];
 let checked=0;
 for(const w of widths)for(const h of stages)for(let n=4;n<=7;n++){
   const g=fitChapel(w,h,n,Math.floor(n/2));
   const margin=0.001;
   const relicRadius=Math.min(16,g.tile*.25);
   assert.ok(g.tile>=23, 'Playable glass too small: '+JSON.stringify({w,h,n}));
   assert.ok(g.archTipY>=8-margin,'Crown clipped '+JSON.stringify({w,h,n}));
   assert.ok(g.archLeft-10>=-margin&&g.archRight+10<=w+margin,'Columns outside viewport '+JSON.stringify({w,h,n}));
   assert.ok(g.roseY-g.roseRadius-6>=-margin,'Rose outside upper arch');
   assert.ok(g.roseY+g.roseRadius+6<g.boardY,'Rose overlaps glass');
   assert.ok(g.relicY+relicRadius+3<h,'Relic beyond bottom');
   assert.ok(g.sillY<h,'Sill beyond bottom');
   assert.ok(g.boardX>=0&&g.boardY>=0&&g.boardX+g.gridWidth<=w+margin&&g.gridBottom<h,'Glass beyond viewport');
   assert.ok(g.entryX>=g.boardX&&g.entryX<=g.boardX+g.gridWidth,'Source outside grid');
   checked++;
 }
 assert.equal(checked,396);
});

test('every one of 500 windows has matching touch, sun and masonry geometry',()=>{
 for(let i=0;i<LEVELS.length;i++){
   const level=LEVELS[i],g=fitChapel(390,500,level.size,level.entryCol);
   assert.equal(g.gridWidth,level.size*g.tile);
   assert.equal(g.entryX,g.boardX+(level.entryCol+.5)*g.tile);
   assert.equal(g.boardX+g.gridWidth/2,g.roseX);
   assert.ok(g.sillY>g.relicY);
   assert.ok(g.archTipY<g.roseY);
 }
});

test('taller devices increase panel space instead of leaving a misplaced arch',()=>{
 for(const size of [4,5,6,7]){
   const small=fitChapel(390,380,size,Math.floor(size/2));
   const tall=fitChapel(390,600,size,Math.floor(size/2));
   assert.ok(tall.boardY>small.boardY,'No vertical centering');
   assert.ok(tall.tile>=small.tile,'Tiles shrink when given extra room');
   assert.ok(tall.archTipY>=8,'Tall crown clipped');
 }
});
