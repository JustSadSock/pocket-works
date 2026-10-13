import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {artworkBounds,drawArtwork,artworkURL} from '../artworks.js';

const wide={naturalWidth:2400,naturalHeight:1200};
const tall={naturalWidth:1200,naturalHeight:2400};
const x=artworkBounds(wide),y=artworkBounds(tall);
assert.deepEqual(x,{x:0,y:75,w:600,h:300},'wide painting letterboxes vertically');
assert.deepEqual(y,{x:187.5,y:0,w:225,h:450},'portrait letterboxes horizontally');
const call=[],ctx={fillStyle:'',fillRect(...args){call.push(['background',...args])},drawImage(...args){call.push(['art',...args])}};
drawArtwork(ctx,wide,1);
assert.deepEqual(call[1],['art',wide,0,0,2400,1200,0,75,600,300],'draw complete source with no centre crop');
call.length=0;drawArtwork(ctx,tall,2);
assert.deepEqual(call[1],['art',tall,0,0,1200,2400,187.5,0,225,450],'portrait is never cropped either');
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
assert.match(styles[2],/\.reveal-option-image canvas\{[^}]*object-fit:contain/,'reveal artwork also keeps full composition');

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
console.log('ZAMAZKA: full artwork ratios, 1920px originals, 3-coin automatic vote and opt-in confirmation OK');
