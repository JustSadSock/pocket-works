import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {artworkBounds,artworkAspect,setArtworkFrame,drawArtwork,artworkURL,zoneFor} from '../artworks.js';

const wide={naturalWidth:2400,naturalHeight:1200};
const tall={naturalWidth:1200,naturalHeight:2400};
const x=artworkBounds(wide),y=artworkBounds(tall);
assert.deepEqual(x,{x:0,y:0,w:600,h:450},'wide originals fill the entire logical restoration world');
assert.deepEqual(y,{x:0,y:0,w:600,h:450},'portrait originals also fill the world; no blank-mask strips');
assert.equal(artworkAspect(wide),2);
assert.equal(artworkAspect(tall),.5);
const frame={
 style:{aspectRatio:'',vars:{},setProperty(key,val){this.vars[key]=val}},
 closest(){return this.parent;}
};
frame.parent={style:{vars:{},setProperty(key,val){this.vars[key]=val}},matches:()=>true,parentElement:null};
frame.parentElement=frame.parent;
assert.equal(setArtworkFrame(frame,wide),2);
assert.equal(frame.parent.style.vars['--art-aspect'],'2','the physical museum frame matches a wide painting');
assert.equal(frame.style.aspectRatio,'2');
assert.equal(setArtworkFrame(frame,tall),.5);
assert.equal(frame.parent.style.vars['--art-aspect'],'0.5','portrait frame is resized rather than letterboxed');
const archiveOuter={style:{vars:{},setProperty(key,val){this.vars[key]=val}},matches:q=>q.includes('.archive-art-frame'),parentElement:null};
const archiveRim={style:{vars:{},setProperty(key,val){this.vars[key]=val}},matches:q=>q.includes('.archive-rim'),parentElement:archiveOuter};
const archiveCanvas={style:{aspectRatio:'',vars:{},setProperty(key,val){this.vars[key]=val}},parentElement:archiveRim};
for(const ratio of [.32,.5,1,4/3,2,3.1]){
 const img={naturalWidth:ratio*1000,naturalHeight:1000};
 assert(Math.abs(setArtworkFrame(archiveCanvas,img)-ratio)<1e-6);
 assert.equal(Number(archiveRim.style.vars['--art-aspect']),ratio,'snug archival rim '+ratio);
 assert.equal(Number(archiveOuter.style.vars['--art-aspect']),ratio,'archive staging inherits geometry '+ratio);
 assert.equal(Number(archiveCanvas.style.vars['--art-aspect']),ratio,'restored canvas follows source '+ratio);
}
const comparisonWindow={style:{vars:{},setProperty(key,val){this.vars[key]=val}},matches:q=>q.includes('.round-view-window'),parentElement:null};
const comparisonImage={style:{vars:{},setProperty(key,val){this.vars[key]=val}},matches:q=>q.includes('.round-view-image'),parentElement:comparisonWindow};
const restored={style:{vars:{},setProperty(key,val){this.vars[key]=val}},parentElement:comparisonImage};
setArtworkFrame(restored,tall);
assert.equal(comparisonImage.style.vars['--art-aspect'],'0.5');
assert.equal(comparisonWindow.style.vars['--art-aspect'],'0.5','restored lightbox and original must share one portrait ratio');

for(const id of [1,6,12,29,44,50]){
 for(const seed of [0,42,123456789]){
  const z=zoneFor(id,seed);
  assert.ok(z.points.every(([px,py])=>px>=0&&px<=600&&py>=0&&py<=450),'damage path is on actual painting');
 }
}
const call=[],ctx={fillStyle:'',fillRect(...args){call.push(['background',...args])},drawImage(...args){call.push(['art',...args])}};
drawArtwork(ctx,wide,1);
assert.deepEqual(call,[['art',wide,0,0,2400,1200,0,0,600,450]],'wide painting paints every pixel, with no fill bands');
call.length=0;drawArtwork(ctx,tall,2);
assert.deepEqual(call,[['art',tall,0,0,1200,2400,0,0,600,450]],'portrait paint covers the mask without margins');
assert.ok(artworkURL(1).includes('/1920px-'),'gallery uses detailed 1920px master instead of 1280px');

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const styles=[
 readFileSync(new URL('../gallery-theme.css',import.meta.url),'utf8'),
 readFileSync(new URL('../experience.css',import.meta.url),'utf8'),
 readFileSync(new URL('../restoration-17.css',import.meta.url),'utf8')
];
assert.match(styles[0],/\.picture img,\.picture canvas\{aspect-ratio:4\/3;object-fit:contain/,'preview tiles keep every edge');
assert.match(styles[1],/\.screen \.gallery \.picture img\{object-fit:contain/,'late preview overrides do not crop');
assert.match(styles[2],/\.stake-frame img,\.verdict-image img\{[^}]*object-fit:contain/,'voting and results preserve ratio');
assert.match(styles[2],/\.reveal-option-image canvas\{[^}]*object-fit:contain/,'legacy reveal CSS still keeps full source');
const native=readFileSync(new URL('../native-art.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const aspectCSS=readFileSync(new URL('../aspect-integrity-1412.css',import.meta.url),'utf8');
assert.match(aspectCSS,/\.archive-rim/,'archive frame is not an arbitrary 4:3 border');
assert.match(aspectCSS,/\.zam-exhibit-rim > :is\(img,canvas\)/,'jury and original share fitted apertures');
assert.match(aspectCSS,/\.round-view-image > canvas/,'comparison window shares natural canvas geometry');

assert.match(html,/responsive-scale\.css.*native-art\.css/,'dynamic frame rules override fixed aspect styles');
assert.match(worker,/\.\/native-art\.css/,'new styles are available offline');
for(const selector of ['.restore .viewport','.unveil-frame','.round-view-window','.round-art-image']){
 assert.ok(native.includes(selector),'natural ratio styling exists: '+selector);
}
assert.match(native,/aspect-ratio:var\(--art-aspect/,'physical picture frame size is driven by source dimensions');

const get=(name,next)=>source.slice(source.indexOf('function '+name+'('),source.indexOf('function '+next+'('));
const actions=get('submitVote','chipDots')+get('chipDots','updateChips')+get('updateChips','vote');
assert.ok(actions.includes('850'),'automatic three-coin vote has a correction window');
const callbacks=new Map();let nextTimer=1,records=0,confirmed=0,setting='off';
const context={
 chips:[1,1,0,0,0],view:{phase:'voting',round:1,turn:0,voted:[]},
 page:'vote',roomId:'room-1',me:{id:'guest'},pendingVote:null,
 voteToken:()=> 'room-1:1:0',persistVote(){confirmed++},attemptVote(){records++},
 localStorage:{getItem:()=>setting},CONFIRM_VOTE_KEY:'confirm-coins',
 autoVoteTimer:null,
 setTimeout(fn){const id=nextTimer++;callbacks.set(id,fn);return id},
 clearTimeout(id){callbacks.delete(id)},
 screen:{
  querySelectorAll:()=>[],
  querySelector:selector=>selector==='#coinVoteStatus'?{textContent:''}:null
 },
};
runInNewContext(actions,context);
context.updateChips();
assert.equal(callbacks.size,0,'first two coins must not send');
context.chips[2]=1;context.updateChips();
assert.equal(callbacks.size,1,'third coin queues one automatic vote');
context.chips[2]=0;context.updateChips();
assert.equal(callbacks.size,0,'removing coin cancels queued vote');
assert.equal(records,0,'no early commit');
context.chips[2]=1;context.updateChips();
const action=[...callbacks.values()][0];callbacks.clear();action();
assert.equal(records,1,'all three coins are submitted automatically');
assert.deepEqual(Array.from(context.pendingVote.chips),[1,1,1,0,0],'server receives exact distribution');
context.updateChips();assert.equal(callbacks.size,0,'pending server receipt prevents duplicate submit');
context.pendingVote=null;
setting='on';context.updateChips();assert.equal(callbacks.size,0,'manual-confirm setting suppresses auto vote');
assert.match(source,/settingConfirmVote/,'voting confirmation option available');
assert.match(source,/function doSubmit\(\)[\s\S]*?modal\('Сдать реставрацию\?'/,'drawing submit retains its own confirmation');
assert.doesNotMatch(source,/settingConfirmSubmit/,'incorrect painting-submit preference removed');
console.log('ZAMAZKA: natural museum frames, no artwork padding, in-mask damage, unchanged coin auto-vote OK');
