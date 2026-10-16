import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MuseumAudio,MUSEUM_SOUND_EVENTS} from '../museum-audio.js';
import {preparingMarkup} from '../passage-ui.js';
import {SOUND_GALLERY} from '../sound-gallery.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const css=read('visual-critique-146.css');
const app=read('app.js');
const sw=read('sw.js'),html=read('index.html');
assert.match(html,/visual-critique-146\.css/);
assert.match(sw,/\.\/visual-critique-146\.css/,'fifth pass must work offline');
assert.match(app,/is-vote-waiting/,'wait screen needs its own visual state');
assert.match(css,/\.passage-connection-panel::before/,'remove connecting dividers');
assert.match(css,/\.passage-prep-header,[\s\S]*?\.passage-prep-progress/,'no extra labels interrupt moving originals');
assert.match(css,/\.passage-prep-status\[data-state="error"\]/,'failures remain visible');
assert.match(css,/data-action="retry-art-preload"/,'retry available when loading fails');
assert.match(css,/\.round-art-card\{\s*flex:0 0 calc\(\(100% - 2 \* var\(--zam-review-gap\)\) \/ 3\)/,'restoration gallery enlarges to three at once');
const prep=preparingMarkup({round:2,total:5,ready:2});
assert.equal((prep.match(/data-art-slot=/g)||[]).length,5);
assert.match(prep,/data-action="retry-art-preload"/);
assert.equal(new Set(SOUND_GALLERY.flatMap(g=>g.items.map(i=>i[0]))).size,MUSEUM_SOUND_EVENTS.length+1);

class Param{
 constructor(){this.value=1;this.log=[]}
 setValueAtTime(v,t){this.value=v;this.log.push(['set',v,t])}
 exponentialRampToValueAtTime(v,t){this.value=v;this.log.push(['ramp',v,t])}
 setTargetAtTime(v,t,k){this.value=v;this.log.push(['target',v,t,k])}
 cancelScheduledValues(t){this.log.push(['cancel',t])}
}
class Node{
 constructor(ctx){this.ctx=ctx;this.gain=new Param();this.frequency=new Param();this.Q=new Param();this.playbackRate=new Param()}
 connect(){return this}
 disconnect(){}
 start(t){this.ctx.starts.push(t)}
 stop(t){this.ctx.stops.push(t)}
}
class FakeAudioContext{
 constructor(){this.currentTime=10;this.sampleRate=22050;this.destination=new Node(this);this.state='running';this.starts=[];this.stops=[]}
 createGain(){return new Node(this)}
 createBuffer(){return {getChannelData:()=>new Float32Array(22050)}}
 createBufferSource(){return new Node(this)}
 createBiquadFilter(){return new Node(this)}
 createOscillator(){return new Node(this)}
 close(){return Promise.resolve()}
}
const original=globalThis.AudioContext;
globalThis.AudioContext=FakeAudioContext;
try{
 const audio=new MuseumAudio(true);
 assert.equal(audio.play('press',true),true,'tap enables Web Audio');
 const crafted=['frame','paper','door','reveal','brush','fill','press','confirm','warning','error','token'];
 for(const name of crafted){
  audio.context.currentTime+=2;
  const before=audio.context.starts.length;
  assert.equal(audio.play(name,true),true,'cannot play '+name);
  assert(audio.context.starts.length>=before+3,name+' should sound layered, not one generic beep');
 }
 audio.context.currentTime+=2;
 assert.equal(audio.syncCountdown('fifth',15000,0),true);
 const bus=audio.clock.bus;
 const levels=[];
 for(const now of [0,4000,8000,12000,14400]){
  audio.clock.duckUntil=0;
  audio.syncCountdown('fifth',15000,now);
  levels.push(bus.gain.log.filter(e=>e[0]==='target').at(-1)[1]);
 }
 assert(levels[0]<.12, 'opening clock must be quiet');
 assert(levels.at(-1)>.90,'last seconds must be much louder');
 assert(levels.every((x,i)=>i===0||x>=levels[i-1]),'ticks must intensify monotonically');
 audio.context.currentTime+=2;
 assert.equal(audio.play('watch-warning',true),true,'chosen Clockmaker signals retained');
 assert(bus.gain.log.some(e=>e[0]==='target'&&e[1]===.045),'clock must duck under watch bells');
 audio.setEnabled(false);
 assert.equal(audio.clock,null,'muting must end the growing tick loop');
 audio.dispose();
}finally{
 if(original===undefined)delete globalThis.AudioContext;
 else globalThis.AudioContext=original;
}
console.log('ZAMAZKA 1.40.6: full layered foley, strong crescendo, alert ducking, simplified prep, linked voting and larger exhibition OK');
