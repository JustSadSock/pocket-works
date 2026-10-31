import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Exercise the real stateChanged handler (not a reimplementation) against
// deterministic room events; no browser or live PocketNet server is required.
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const begin=source.indexOf('function stateChanged(s){');
const end=source.indexOf('async function connectRoom(',begin);
assert.ok(begin>=0&&end>begin,'room snapshot handler is discoverable');
const handler=source.slice(begin,end);
function run(view,mode='host'){
 const calls=[],blob={size:2048};
 const context={
  state:{phase:'lobby',mediaEpoch:4,players:[{id:'host'}]},
  scene:{id:'new-unsubmitted-video',start:17,duration:25,custom:true},
  sourceBlob:blob,
  me:'host',mode,view,remoteClips:[],peers:new Map(),videoSent:new Set(),
  relayInbox:new Map(),pendingScenePicker:false,sentPremiere:false,
  localClips:[],editHistory:null,selectedClip:null,projectKey:'',restoreGeneration:0,
  TimelineHistory:class {constructor(){this.past=[];this.future=[]}},
  cleanAudios(){calls.push('discard-audio')},
  connectionNotice(){calls.push('notice')},
  meHost(){return mode==='host'},
  setVideoSources(){calls.push('reset-media')},
  roomUI(){calls.push('open-roster')},
  library(){calls.push('open-library')},
  sendVideoTo(){calls.push('send-video')},
  draftWrite(){calls.push('write-draft');return Promise.resolve(true)},
  sceneDraftKey(){return 'draft'},
  stopPremiereExport(){calls.push('stop-export')},
  stopAllPlayback(){},disposeRemoteClips(){},restore(){return Promise.resolve()},
  openEditor(){return Promise.resolve()},waitUI(){},beginPremiere(){},updatePremiereStatus(){}
 };
 runInNewContext(handler,context,{filename:'app.js:stateChanged'});
 const update=(players,epoch=4)=>{
  context.stateChanged({
   phase:'lobby',host:'host',mediaEpoch:epoch,
   players,scene:{id:'old-server-scene',start:0,duration:60,custom:true},
   configured:true,ready:{},assignments:{},mediaReady:{}
  });
 };
 return {context,calls,blob,update};
}
for(const view of ['trim','library']){
 test('host stays in '+view+' when another player joins and socket reconnects',()=>{
  const {context,calls,blob,update}=run(view);
  update([{id:'host'},{id:'guest-1'}]);
  update([{id:'host'},{id:'guest-1'},{id:'guest-2'}]);
  assert.equal(context.scene.id,'new-unsubmitted-video');
  assert.equal(context.sourceBlob,blob);
  assert.equal(context.view,view);
  assert.equal(context.state.players.length,3,'roster snapshots still update');
  assert.ok(!calls.some(x=>['open-roster','reset-media','send-video','write-draft'].includes(x)),calls.join(','));
 });
}
test('normal room screen still receives roster and scene updates',()=>{
 const {context,calls,update}=run('room');
 update([{id:'host'},{id:'guest-1'}]);
 assert.equal(context.scene.id,'old-server-scene');
 assert.ok(calls.includes('open-roster'));
 assert.ok(calls.includes('reset-media'));
});
test('after a premiere, pending next-scene selection happens only once',()=>{
 const {context,calls,update}=run('premiere');
 context.state.phase='premiere';
 context.pendingScenePicker=true;
 update([{id:'host'},{id:'guest-1'}]);
 assert.equal(calls.filter(x=>x==='open-library').length,1);
 assert.equal(context.pendingScenePicker,false);
 context.view='library';
 update([{id:'host'},{id:'guest-1'},{id:'guest-2'}]);
 assert.equal(calls.filter(x=>x==='open-library').length,1);
 assert.ok(!calls.includes('open-roster'));
});
test('late restore of a lobby video cannot interrupt active host setup',()=>{
 assert.match(source,/mode==='host'&&\['library','trim'\]\.includes\(view\)\)return;/);
 assert.match(source,/state\?\.phase==='lobby'&&view==='room'\)roomUI\(\)/);
});
