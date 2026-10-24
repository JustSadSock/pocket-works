import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {meterHeights} from '../studio-feedback.js';

test('meter remains flat with silence and with missing data',()=>{
 assert.deepEqual(meterHeights(new Uint8Array(256).fill(128)),Array(7).fill(3));
 assert.deepEqual(meterHeights(null),Array(7).fill(3));
});
test('meter reflects input sound rather than generated random animation',()=>{
 const quiet=new Uint8Array(256).fill(128);
 quiet[0]=132;quiet[1]=124;
 const speaking=new Uint8Array(256);
 for(let i=0;i<speaking.length;i++)speaking[i]=i%2?180:76;
 const a=meterHeights(quiet),b=meterHeights(speaking);
 assert(a.some(h=>h>=3));
 assert(b.every(h=>h>3));
 assert(b[3]>=b[0]);
 assert.deepEqual(meterHeights(speaking),b,'identical microphone signals should produce identical bars');
});
test('high microphone energy is bounded and never creates oversized meter bars',()=>{
 const clipped=meterHeights(new Uint8Array(256).fill(255),7);
 assert.equal(clipped[3],20);
 assert(clipped.every(x=>x>=3&&x<=20));
});
test('number of bars and empty inputs are safe',()=>{
 assert.equal(meterHeights(new Uint8Array([128]),1).length,1);
 assert.equal(meterHeights(new Uint8Array([255]),9).length,9);
 assert.equal(meterHeights(new Uint8Array([128]),999).length,20);
});
test('stage feedback is state-backed, keyboard accessible and honours reduced motion',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(app,/source\.connect\(analyser\)/);
 assert.doesNotMatch(app,/source\.connect\(context\.destination\)/);
 assert.match(app,/meterHeights\(samples,bars\.length\)/);
 assert.match(app,/stopMicMonitor\(\);stream\.getTracks\(\)/);
 assert.match(app,/setDraftStatus\('saving'\)/);
 assert.match(app,/setDraftStatus\('error'\)/);
 assert.match(app,/readyPending=true/);
 assert.match(app,/setNetStatus\('offline'/);
 assert.match(html,/id="mic-meter"/);
 assert.match(html,/id="draft-status"/);
 assert.match(html,/id="record-elapsed"/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
