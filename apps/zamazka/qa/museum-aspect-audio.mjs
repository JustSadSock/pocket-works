import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fitMuseumArtwork,galleryWindow} from '../museum-motion.js';
import {MUSEUM_SOUND_EVENTS,MuseumAudio} from '../museum-audio.js';

for(const [w,h,r] of [[390,260,.7],[390,260,1],[390,260,1.8],[390,260,3.2],[1240,520,.72],[1240,520,1.7],[220,135,.65],[220,135,2.1]]){
 const size=fitMuseumArtwork(w,h,r);
 assert(size.width>0&&size.height>0);
 assert(Math.abs(size.width/size.height-r)<.025,'aspect mismatch '+r+' at '+w+'×'+h);
 assert(size.width+32<=Math.max(110,Math.min(w*.68,w<700?330:480))+1);
 assert(size.height+32<=Math.max(86,h*.91)+1);
}
assert.deepEqual(galleryWindow([0,1,2,3,4,5,6],0).map(x=>x.id),[5,6,0,1,2]);
assert.equal(new Set(MUSEUM_SOUND_EVENTS).size,MUSEUM_SOUND_EVENTS.length);
for(const event of ['brush','frame','paper','tool','token','confirm','reveal','warning','final-warning','clock-tick','time-up']){
 assert(MUSEUM_SOUND_EVENTS.includes(event));
}
const muted=new MuseumAudio(false);
assert.equal(muted.play('press',true),false);
muted.dispose();

const css=fs.readFileSync(new URL('../gallery-motion.css',import.meta.url),'utf8');
assert(css.includes('var(--art-height')&&css.includes('var(--art-width'));
assert(/\.museum-slide img\{[^}]+object-fit:contain/.test(css));
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert(app.includes('onSound:event=>sound(event,true)'));
assert(!app.includes('function sound(f=560)'));
console.log('ZAMAZKA museum proportions and original audio: OK');

// Live countdown scheduler and audio-bus regression, not just event names.
import './clock-soundscape.mjs';

// Crash recovery and every auditionable original sound.
import './pause-and-sounds.mjs';
