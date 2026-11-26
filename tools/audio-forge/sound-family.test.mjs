import test from 'node:test';
import assert from 'node:assert/strict';
import {createVariantBag,createSoundFamilyPlayer} from '../../shared/capabilities/sound-family.js';
function fixture(options={}){
  const sources=[],requests=[],nodes=[];
  const node=()=>{const n={connect(){},disconnect(){this.disconnected=true}};nodes.push(n);return n};
  const context={
    state:'running',destination:{},async resume(){this.state='running'},
    async decodeAudioData(data){return {data}},
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
