import test from 'node:test';
import assert from 'node:assert/strict';
import {createVariantBag,createSoundFamilyPlayer} from '../../shared/capabilities/sound-family.js';
function fixture(options={}){
  const sources=[],requests=[],nodes=[];
  const node=()=>{const n={connect(){},disconnect(){this.disconnected=true}};nodes.push(n);return n};
  const context={
    state:'running',destination:{},async resume(){this.state='running'},
    async decodeAudioData(data){return {data,length:480,numberOfChannels:1}},
    createBufferSource(){const s={...node(),playbackRate:{value:1},start(){this.started=true},stop(){this.stopped=true;this.onended?.()}};sources.push(s);return s},
    createGain(){return {...node(),gain:{value:1}}},
    createStereoPanner(){return {...node(),pan:{value:0}}}
  };
  const fetcher=async url=>{requests.push(url);return {ok:true,arrayBuffer:async()=>url}};
  const player=createSoundFamilyPlayer({context,fetcher,random:()=>.5,families:{steel:{variants:['a','b','c'],gain:.8,pitchCents:0,gainSpread:0}},...options});
  return {player,context,sources,requests,nodes};
}
test('shuffle bag has full coverage and never repeats across boundaries',()=>{
  const bag=createVariantBag(['a','b','c'],()=>0);
  let last;
  for(let round=0;round<100;round++){
    const group=Array.from({length:3},()=>bag.next());
    assert.equal(new Set(group).size,3);assert.notEqual(group[0],last);last=group.at(-1);
  }
  assert.equal(createVariantBag(['a']).next(),'a');
  assert.throws(()=>createVariantBag(['a','a']));
});
test('preload, reuse decoded buffers, honor pitch and polyphony',async()=>{
  const {player,context,sources,requests}=fixture({maxVoices:2});
  context.state='suspended';
  assert.equal(await player.preload('steel'),true);assert.equal(requests.length,3);
  for(let i=0;i<7;i++) assert.equal(await player.play('steel',{rate:1.25}),true);
  assert.equal(context.state,'running');assert.equal(requests.length,3);
  assert.equal(player.stats.voices,2);assert.equal(sources.filter(s=>s.stopped).length,5);
  assert.ok(sources.every(s=>s.playbackRate.value===1.25));
  assert.notEqual(sources[2].buffer.data,sources[3].buffer.data);
  sources.at(-1).onended();assert.equal(player.stats.voices,1);
  player.destroy();assert.equal(player.stats.voices,0);assert.equal(player.stats.buffers,0);
  assert.equal(await player.play('steel'),false);
});
test('low priority cannot steal important voice',async()=>{
  const {player,sources}=fixture({maxVoices:1});
  assert.equal(await player.play('steel',{priority:9}),true);
  assert.equal(await player.play('steel',{priority:0}),false);
  assert.equal(sources[0].stopped,undefined);
  assert.equal(await player.play('steel',{priority:10}),true);assert.equal(sources[0].stopped,true);
});
test('bounded cache evicts decoded entries',async()=>{
  const {player,requests}=fixture({maxBuffers:1});
  assert.equal(await player.preload('steel'),true);
  assert.equal(player.stats.buffers,1);assert.equal(requests.length,3);
  await player.play('steel');assert.equal(player.stats.buffers,1);
});
test('disable during fetch prevents late voice and destroy is idempotent',async()=>{
  let release,started;const waiting=new Promise(r=>{started=r});
  const {player,sources}=fixture({fetcher:()=>{started();return new Promise(r=>{release=r})}});
  const play=player.play('steel');await waiting;player.setEnabled(false);
  release({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
  assert.equal(await play,false);assert.equal(sources.length,0);assert.equal(player.stats.pending,0);
  player.destroy();player.destroy();
});
test('failed fetch can retry; unsupported family returns false',async()=>{
  let attempts=0;
  const {player}=fixture({families:{steel:{variants:['a']}},fetcher:async()=>++attempts===1?{ok:false,status:503}:{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}});
  assert.equal(await player.play('missing'),false);assert.equal(await player.play('steel'),false);
  assert.equal(await player.play('steel'),true);assert.equal(attempts,2);
});
test('destroy aborts pending download',async()=>{
  let started;const waiting=new Promise(r=>{started=r});
  const {player}=fixture({fetcher:(_,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});started()})});
  const play=player.play('steel');await waiting;player.destroy();
  assert.equal(await play,false);assert.equal(player.stats.pending,0);assert.equal(player.stats.buffers,0);
});

test('byte budget counts unique cached and playing PCM; active buffers cannot be evicted from accounting',async()=>{
 const {player,sources}=fixture({maxDecodedBytes:1920,maxVoices:2});
 assert.equal(await player.play('steel'),true);assert.equal(player.stats.decodedBytes,1920);
 assert.equal(await player.play('steel'),false);assert.equal(player.stats.decodedBytes,1920);
 sources[0].onended();assert.equal(await player.play('steel'),true);
 assert.equal(player.stats.decodedBytes,1920);player.destroy();assert.equal(player.stats.decodedBytes,0);
 const small=fixture({maxDecodedBytes:100}).player;
 assert.equal(await small.play('steel'),false);assert.equal(small.stats.decodedBytes,0);small.destroy();
});

test('context bags are independent and rejected requests do not consume the selected variant',async()=>{
 const families={step:{contexts:{wood:{variants:['w1','w2','w3']},gravel:{variants:['g1','g2','g3']}},pitchCents:0,gainSpread:0}};
 const {player,requests}=fixture({families,maxVoices:1});
 const baseline=fixture({families,maxVoices:1}).player;
 const a=[],b=[];const start=x=>r=>x.push(r.url);
 assert.equal(await player.play('step'),false);
 assert.equal(await player.play('step',{context:'invalid'}),false);
 assert.equal(await player.play('step',{context:'wood',canStart:()=>false}),false);
 assert.equal(requests.length,0);
 for(let i=0;i<3;i++){
  assert.equal(await player.play('step',{context:'wood',priority:9,onStart:start(a)}),true);
  const count=requests.length;
  assert.equal(await player.play('step',{context:'wood',priority:0}),false);
  assert.equal(requests.length,count);
  player.stopAll();
  assert.equal(await baseline.play('step',{context:'wood',priority:9,onStart:start(b)}),true);baseline.stopAll();
 }
 assert.deepEqual(a,b);assert.equal(new Set(a).size,3);
 const g=[];for(let i=0;i<3;i++){assert.equal(await player.play('step',{context:'gravel',onStart:start(g)}),true);player.stopAll()}
 assert.equal(new Set(g).size,3);assert.ok(g.every(x=>x.startsWith('g')));
 assert.equal(await player.play('step',{context:'wood',onStart:start(a)}),true);assert.notEqual(a[2],a[3]);
 assert.ok(player.stats.cacheHits>0);assert.equal(player.stats.accepted,7);
 player.destroy();baseline.destroy();
});
test('failed post-decode eligibility retries identical reserved variant',async()=>{
 let allowed=true,release,entered;const waiting=new Promise(r=>{entered=r});
 const {player,requests}=fixture({fetcher:url=>{requests.push(url);entered();return new Promise(r=>{release=()=>r({ok:true,arrayBuffer:async()=>url})})}});
 const p=player.play('steel',{canStart:()=>allowed});await waiting;allowed=false;release();
 assert.equal(await p,false);assert.equal(player.stats.accepted,0);allowed=true;let selected;
 assert.equal(await player.play('steel',{onStart:r=>selected=r.url}),true);
 assert.equal(requests.length,1);assert.equal(selected,requests[0]);assert.equal(player.stats.cacheHits,1);
 player.destroy();
});

test('cancelled in-flight decode is counted and cannot consume a variant',async()=>{
 let release,entered;const waiting=new Promise(r=>{entered=r});
 const {player,context,requests}=fixture();
 context.decodeAudioData=async data=>{entered();return new Promise(r=>{release=()=>r({data,length:480,numberOfChannels:1})})};
 const controller=new AbortController();let receipt;
 const pending=player.play('steel',{signal:controller.signal,onStart:r=>{receipt=r}});
 await waiting;controller.abort();player.stopAll();release();
 assert.equal(await pending,false);assert.equal(receipt,undefined);
 assert.equal(player.stats.decodes,1);assert.equal(player.stats.decodesAfterEpochChange,1);
 assert.equal(player.stats.cancelledAfterLoad,1);assert.equal(player.stats.accepted,0);
 assert.equal(await player.play('steel',{onStart:r=>{receipt=r}}),true);
 assert.equal(receipt.url,requests[0]);assert.equal(requests.length,1);
 assert.equal(player.stats.cachedDecodedBytes,1920);assert.equal(player.stats.activeDecodedBytes,1920);
 assert.equal(player.stats.decodedBytes,1920);assert.ok(player.stats.peakDecodedObservedBytes>=1920);
 player.destroy();assert.equal(player.stats.decodedBytes,0);
});
