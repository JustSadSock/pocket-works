import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAppearance,safeArtwork,paintingPigments,cosmeticFeatures,COLORSETS,DEFAULT_APPEARANCE,decodeAppearance} from '../avatar-profile.mjs';
import {drawMage} from '../mage-art.mjs';
const ID='11111111-1111-4111-8111-111111111111';
const person={id:ID,complete:true,nickname:'Пиксельный мастер',avatar:'wave'};
const social=(maskot,artwork='')=>({profile:{id:ID,maskot,artwork}});
test('guest and incomplete or malformed identities cannot claim personalized profile',()=>{
 for(const user of [null,{}, {id:ID,complete:false,avatar:'moss'}, {...person,id:'malformed'}]){
  const look=normalizeAppearance(user,social({animal:'cat'}));assert.equal(look.source,'guest');assert.equal(look.artwork,'');
 }
});
test('eight Pocket ID presets map to fixed individual coats without extra privileges',()=>{
 assert.equal(Object.keys(COLORSETS).length,8);
 for(const avatar of Object.keys(COLORSETS)){
  const look=normalizeAppearance({...person,avatar});
  assert.equal(look.source,'preset');assert.equal(look.preset,avatar);assert.deepEqual(look.colors,COLORSETS[avatar]);
 }
 const unknown=normalizeAppearance({...person,avatar:'http://attacker.example/img'});
 assert.equal(unknown.preset,'clay');
});
test('the social profile must belong to the verified Pocket ID account',()=>{
 const foreign={profile:{id:'22222222-2222-4222-8222-222222222222',maskot:{animal:'frog',hat:'crown'},artwork:'data:image/png;base64,AAAA'}};
 const look=normalizeAppearance(person,foreign);
 assert.equal(look.source,'preset');assert.equal(look.mascot,null);assert.equal(look.artwork,'');
});
test('official mascot species, hats, clothes and facial features survive validation',()=>{
 const variants=[
  {animal:'cat',hat:'crown',clothes:'mantle',face:'glasses'},
  {animal:'rabbit',hat:'beret',clothes:'vest',face:'stars'},
  {animal:'frog',hat:'bascinet',clothes:'tabard',face:'monocle'},
 ];
 for(const m of variants){const look=normalizeAppearance(person,social(m));assert.equal(look.source,'maskot');
 assert.equal(look.mascot.animal,m.animal);assert.equal(look.mascot.hat,m.hat);assert.equal(look.mascot.clothes,m.clothes);assert.equal(look.mascot.face,m.face)}
});
test('invalid SVG, URLs, data escapes, MIME and oversized art rejected',()=>{
 for(const a of ['https://site/avatar.png','data:image/svg+xml;base64,AAAA','data:text/html;base64,AAAA','data:image/webp;base64,\\evil','data:image/png;base64,'+'A'.repeat(24000),'data:image/png;base64,AA!!']){
  assert.equal(safeArtwork(a),'');
 }
 const valid=safeArtwork('data:image/webp;base64,AA==');assert.ok(valid);
});
test('own art can be used but arbitrary foreign art is rejected',()=>{
 const art='data:image/png;base64,AAAA';
 const own=normalizeAppearance(person,social(null,art));
 assert.equal(own.source,'drawing');assert.equal(own.artwork,art);
 const stranger=normalizeAppearance(person,{profile:{id:'not-me',artwork:art}});
 assert.equal(stranger.source,'preset');assert.equal(stranger.artwork,'');
});
test('decoding failures produce safe original preset rather than broken portrait',async()=>{
 const art='data:image/png;base64,AAAA',look=normalizeAppearance(person,social(null,art));
 const result=await decodeAppearance(look,{imageFactory:()=>{const fake={naturalWidth:0,naturalHeight:0};Object.defineProperty(fake,'src',{set(){queueMicrotask(()=>fake.onerror?.(new Error('decode')))}});return fake}});
 assert.equal(result.source,'preset');assert.equal(result.artwork,'');assert.equal(result.artCanvas,null);
});
test('painting inks are picked from actual saturated pixels, not pale corners',()=>{
 const rgba=new Uint8ClampedArray(16*16*4);
 for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=(y*16+x)*4,ink=x>=3&&x<13&&y>=3&&y<13;rgba[i]=ink?200:245;rgba[i+1]=ink?70:245;rgba[i+2]=ink?95:245;rgba[i+3]=255}
 const result=paintingPigments(rgba,16,16);assert.ok(result);assert.match(result[0],/^#[0-9a-f]{6}$/);
 assert.notEqual(result[0],'#f0f0f0');
});
test('rune outfit logic is cosmetic and deterministic',()=>{
 const ids=['on_cast','ball','armor','clone','cool'];
 const before=JSON.stringify(ids),p=cosmeticFeatures(ids);
 assert.equal(p.ember,true);assert.equal(p.stone,true);assert.equal(p.echoes,true);assert.equal(p.frost,true);assert.equal(p.healing,false);assert.equal(JSON.stringify(ids),before);
});
test('portrait renderer composes visible custom features without throwing',()=>{
 const ops=[],ctx={
  fillRect(...args){ops.push(['rect',...args])},beginPath(){},arc(){},ellipse(){},fill(){},moveTo(){},lineTo(){},closePath(){},
  setLineDash(){},stroke(){},save(){},restore(){},translate(){},scale(){},
  set fillStyle(v){this.color=v},get fillStyle(){return this.color},
  set globalAlpha(v){this.a=v},get globalAlpha(){return this.a??1},
  set strokeStyle(v){},set lineWidth(v){}
 };
 const id=normalizeAppearance(person,social({animal:'rabbit',hat:'crown',clothes:'mantle',face:'glasses'}));
 drawMage(ctx,id,{x:30,y:50,runes:['armor','clone','ball'],time:0});
 assert.ok(ops.length>25);assert.ok(ops.some(o=>o[0]==='rect'));
 assert.deepEqual(DEFAULT_APPEARANCE.colors,COLORSETS.clay);
});
