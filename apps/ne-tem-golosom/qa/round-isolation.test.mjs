import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const begin=source.indexOf('function stateChanged(s){');
const end=source.indexOf('async function connectRoom(',begin);
const handler=source.slice(begin,end);
assert.ok(begin>=0&&end>begin);

function harness({phase='premiere',round=4,sceneId='same',view='premiere'}={}){
 const calls=[];
 const old={id:'old-voice',start:2,end:3,owner:'host',blob:{size:23}};
 const oldRemote={id:'guest-old',owner:'guest',blob:{size:4}};
 const context={
  state:{phase,round,mediaEpoch:9,players:[{id:'host'},{id:'guest'}]},
  scene:{id:sceneId,start:0,duration:30,custom:true},sourceBlob:{size:222},
  localClips:[old],remoteClips:[oldRemote],
  editHistory:{undo:true},selectedClip:'old-voice',projectKey:'round-4-draft',
  me:'host',mode:'host',view,restoreGeneration:12,
  peers:new Map(),videoSent:new Set(),relayInbox:new Map(),
  pendingScenePicker:false,sentPremiere:true,
  TimelineHistory:class {constructor(){this.past=[];this.future=[]}},
  connectionNotice(){},
  meHost(){return true},
  setVideoSources(){calls.push('reset-video')},
  roomUI(){calls.push('room')},
  library(){calls.push('library')},
  sendVideoTo(){calls.push('send-video')},
  draftWrite(){calls.push(['saved',context.projectKey,context.localClips.map(c=>c.id)]);return Promise.resolve(true)},
  sceneDraftKey(){return 'round-'+context.state.round+'-draft'},
  stopPremiereExport(){calls.push('stop-export')},
  stopAllPlayback(){calls.push('stop-play')},
  cleanAudios(){calls.push('dispose-old-audio')},
  disposeRemoteClips(){context.remoteClips=[]},
  restore(){calls.push('restore');return Promise.resolve(true)},
  openEditor(){calls.push('open-editor');return Promise.resolve(true)},
  waitUI(){},beginPremiere(){},updatePremiereStatus(){},
  sendGame(){},toast(){}
 };
 runInNewContext(handler,context);
 const update=(nextRound,phaseNext,sceneNext=sceneId)=>context.stateChanged({
  phase:phaseNext,round:nextRound,mediaEpoch:9,host:'host',configured:true,
  players:[{id:'host'},{id:'guest'}],scene:{id:sceneNext,start:0,duration:30,custom:true},
  ready:{},assignments:{},mediaReady:{}
 });
 return {context,calls,update,old};
}
test('starting another movie in the same PocketNet room discards previous host voices',()=>{
 const h=harness();
 h.update(5,'lobby');
 assert.equal(h.context.localClips.length,0);
 assert.equal(h.context.remoteClips.length,0);
 assert.equal(h.context.selectedClip,null);
 assert.equal(h.context.projectKey,'');
 assert.equal(h.context.restoreGeneration,13);
 assert(h.calls.some(x=>Array.isArray(x)&&x[0]==='saved'&&x[1]==='round-4-draft'&&x[2].includes('old-voice')));
 h.update(5,'recording');
 assert(h.calls.includes('open-editor'));
 assert.equal(h.context.localClips.length,0);
});
test('reconnect/presence in the same round retains previously recorded voices',()=>{
 const h=harness({phase:'recording',view:'editor'});
 h.update(4,'recording');
 assert.equal(h.context.localClips[0],h.old);
 assert.equal(h.context.restoreGeneration,12);
 assert(!h.calls.includes('dispose-old-audio'));
});
test('delayed packet from a previous round cannot bring old voices back',()=>{
 const h=harness();
 h.update(5,'lobby');
 h.update(4,'premiere');
 assert.equal(h.context.state.round,5);
 assert.equal(h.context.localClips.length,0);
});
test('changing the film before recording does not copy prior takes into its draft',()=>{
 const h=harness({phase:'lobby',view:'room'});
 h.update(4,'lobby','second-film');
 assert.equal(h.context.localClips.length,0);
 assert.equal(h.context.scene.id,'second-film');
 const saved=h.calls.filter(Array.isArray).filter(x=>x[0]==='saved');
 assert.deepEqual(saved.map(x=>x[1]),['round-4-draft','round-4-draft']);
 assert.deepEqual(saved.map(x=>x[2]),[['old-voice'],[]]);
});
