import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {forgeProjectileFrame,forgeImpactFrame,forgeClassFrame,forgeReactionFrame,
 FORGE_SPELL_STYLES,FORGE_REACTIONS,FORGE_CLASSES,FORGE_FRAME_COUNT,forgeSpellsReady} from '../forge-spells.mjs';
import {COURT_TILE,COURT_TILE_NAMES,COURT_SIZE,forgeCourtReady,renderForgeCourt} from '../forge-court.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>JSON.parse(readFileSync(root+path,'utf8'));
const court=read('asset-forge/court-tiles.json'),spells=read('asset-forge/spell-frames.json'),
 manifest=read('asset-forge/manifest.json'),index=read('assets/forge-index.json');
function sig(frame){
 const width=frame.layers[0].rows[0].length,height=frame.layers[0].rows.length;
 const pixels=Array.from({length:height},()=>Array(width).fill('.'));
 const lines=frame.layers[0].rows;
 for(let y=0;y<lines.length;y++)for(let x=0;x<lines[y].length;x++)pixels[y][x]=lines[y][x];
 for(const layer of frame.layers.slice(1))for(let y=0;y<layer.rows.length;y++)
  for(let x=0;x<layer.rows[y].length;x++)if(layer.rows[y][x]!=='.')pixels[y][x]=layer.rows[y][x];
 return pixels.flat().join('');
}
test('real Forge v2 index includes complete arena and spells sources without runtime editable inputs',()=>{
 assert.equal(manifest.version,2);assert.equal(manifest.runtimeRoot,'.');
 assert.deepEqual(manifest.jobs.map(x=>x.id),['compact-mages','court-tiles','spell-frames']);
 assert.deepEqual(index.assets.map(x=>x.id),manifest.jobs.map(x=>x.id));
 for(const job of manifest.jobs){
  assert.equal(job.adapter,'pixel');
  assert.ok(job.source.startsWith('asset-forge/'));
  assert.ok(job.outputs.image.startsWith('assets/'));
  assert.ok(index.assets.find(x=>x.id===job.id).outputs.image.sha256);
 }
 assert.equal(COURT_TILE,32);assert.deepEqual(COURT_SIZE,{width:400,height:620});
 assert.equal(COURT_TILE_NAMES.length,12);assert.equal(FORGE_FRAME_COUNT,154);
});
test('every Forge tile and magic sprite has exactly real palette-indexed editable pixel layers',()=>{
 for(const asset of [court,spells]){
  const palette=new Set(Object.keys(asset.palette));
  const unique=new Set();
  for(const frame of asset.frames){
   assert.ok(frame.name&&!unique.has(frame.name));unique.add(frame.name);
   assert.ok(frame.layers.length>=1);
   for(const layer of frame.layers){
    assert.equal(layer.rows.length,asset.height);
    for(const row of layer.rows){
     assert.equal(row.length,asset.width);
     for(const color of row)assert.ok(palette.has(color),'non-authoring pixel');
    }
   }
   assert.ok(sig(frame).split('').filter(c=>c!=='.').length>4,'empty authored frame: '+frame.name);
  }
  const area=asset.frames.length*asset.width;
  const png=readFileSync(root+(asset===court?'assets/court-tiles.png':'assets/spell-frames.png'));
  assert.deepEqual(Array.from(png.subarray(0,8)),[137,80,78,71,13,10,26,10]);
  assert.equal(png.readUInt32BE(16),area);assert.equal(png.readUInt32BE(20),asset.height);
 }
 assert.equal(court.frames.length,12);assert.equal(spells.frames.length,154);
 assert.equal(court.width,32);assert.equal(spells.width,24);
});
test('material projectile frame angles preserve every 45-degree shot bearing and a real animation step',()=>{
 assert.deepEqual(FORGE_SPELL_STYLES,['orb','flame','bolt','arc','rock','wave','echo']);
 const all=[];
 for(const style of FORGE_SPELL_STYLES){
  const forms=[];
  for(let dir=0;dir<8;dir++)for(let pose=0;pose<2;pose++){
   const theta=dir*Math.PI/4,q={style,x:150,y:310,vx:300*Math.cos(theta),vy:300*Math.sin(theta),owner:0};
   const idx=forgeProjectileFrame(q,pose?1/11:0,false);
   assert.equal(spells.frames[idx].name,`projectile-${style}-${dir}-${pose}`);
   forms.push(sig(spells.frames[idx]));
  }
  assert.ok(new Set(forms).size>=8,style+' lost directions');
  all.push(forms[0]);
 }
 assert.equal(new Set(all).size,7,'material families are not true silhouette differences');
});
test('casting, confirmed hits and elemental reactions use explicit animated Atlas tags',()=>{
 for(const style of FORGE_SPELL_STYLES)for(let frame=0;frame<3;frame++){
  const idx=forgeImpactFrame(style,frame/3+0.01,1);
  assert.equal(spells.frames[idx].name,`impact-${style}-${frame}`);
 }
 for(const cls of FORGE_CLASSES)for(let frame=0;frame<2;frame++){
  const idx=forgeClassFrame(cls,frame);
  assert.equal(spells.frames[idx].name,`sigil-${cls}-${frame}`);
 }
 for(const reaction of FORGE_REACTIONS)for(let frame=0;frame<3;frame++){
  const idx=forgeReactionFrame(reaction,frame/3+.01);
  assert.equal(spells.frames[idx].name,`reaction-${reaction}-${frame}`);
 }
});
test('server-side test canvases cannot silently render browser-only atlas or invent new gameplay state',async()=>{
 assert.equal(await forgeCourtReady(),false);assert.equal(await forgeSpellsReady(),false);
 assert.equal(renderForgeCourt([{x:102,y:180,w:64,h:54}]),null);
});
