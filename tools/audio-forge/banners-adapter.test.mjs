import test from 'node:test';
import assert from 'node:assert/strict';
import {createBannersAudioAdapter,deriveBattleMusic} from './adapters/banners-of-war.js';
const F={W:1000,H:1000,sample:()=>({canopy:.5}),riverX:()=>20};
const audible=(_F,s,u)=>u.n>0&&!u.pendingArrival&&(!s.fog||u.side===0||u.visible);
const cam={x:0,y:0},unit={id:1,x:0,y:0,n:90,side:0,v:1,contact:0};
const state=(time,units=[unit])=>({time,units,fog:true,terrain:{}});
const extract=(F,s,cam,prior,dt)=>({next:new Map(s.units.map(u=>[u.id,1])),events:dt>0?s.units.map(u=>({id:u.id,kind:'step',variant:2,gain:.5,pan:.2})):[]});
function fixture({delayed=false,score=false}={}){
 const log=[],guarded=[],context={state:'running',currentTime:0,destination:{}};
 const music=score?{state:{current:null,pending:null},async start(){this.state.current='peace';return true},stop(){this.state.current=null;this.state.pending=null},update(){},request(id){log.push(['music',id]);this.state.current=id;return true},setIntensity(x){log.push(['intensity',x])}}:null;
 const scene={music,stats:{allocated:0},mixer:{setBusVolume(...a){log.push(['volume',...a])}},world:{async reconcile(s){log.push(['world',s.sources]);return true}},events:{stopAll(){log.push(['stop'])},async play(id,opts){if(delayed)await new Promise(r=>guarded.push(r));if(!opts.canStart())return false;log.push(['event',id,opts]);return true}},async playStinger(id){log.push(['stinger',id]);return true},destroy(){log.push(['destroy'])}};
 const assets={approved:true,families:{step:{variants:['approved-step']},'step:2':{variants:['approved-variant']}},ambient:{wind:{},water:{},forest:{}},...(score?{score:{graph:{initial:'peace',states:{peace:{},tension:{},battle:{},aftermath:{}},edges:{peace:['tension','battle'],tension:['peace','battle'],battle:['aftermath'],aftermath:['peace','battle','tension']}}},stingers:{victory:{url:'approved-victory'}}}:{})};
 const options={context,F,soundEvents:extract,audible,assets,createScene:()=>scene};
 return {log,guarded,scene,options,adapter:createBannersAudioAdapter(options)};
}
test('no unapproved assets can instantiate an adapter',()=>{
 const {options}=fixture();
 assert.throws(()=>createBannersAudioAdapter({...options,assets:{approved:false}}),/Approved/);
});
test('existing extractor drives effects, variant mapping, ambient and pause without replay',async()=>{
 const {adapter,log}=fixture();await adapter.unlock();
 await adapter.update(state(0),cam,{playing:true});
 await adapter.update(state(.2),cam,{playing:true,speed:4});
 const effects=log.filter(x=>x[0]==='event');
 assert.equal(effects.length,1);assert.equal(effects[0][1],'step:2');assert.equal(effects[0][2].gain,.25);
 assert.equal(effects[0][2].rate,1.6);
 const world=log.find(x=>x[0]==='world')[1];assert.equal(world.length,3);assert.equal(world.find(s=>s.id==='forest').volume,.18);
 await adapter.update(state(.2),cam,{playing:false});
 await adapter.update(state(1),cam,{playing:true});
 assert.equal(log.filter(x=>x[0]==='event').length,1);
 await adapter.update(state(1.1),cam,{active:false,playing:true});
 assert.equal(log.filter(x=>x[0]==='world').at(-1)[1].length,0);
 adapter.destroy();assert.equal(adapter.status().enabled,false);
});
test('hidden, dead, or pending units cannot alter music or late decoded effects',async()=>{
 const hidden={...unit,id:2,side:1,visible:false,contact:30},dead={...unit,id:3,n:0,contact:20},pending={...unit,id:4,pendingArrival:true,contact:40};
 assert.deepEqual(deriveBattleMusic({F,s:state(1,[unit,hidden,dead,pending]),cam,audible}),deriveBattleMusic({F,s:state(1),cam,audible}));
 const {adapter,guarded,log}=fixture({delayed:true});await adapter.unlock();
 await adapter.update(state(0,[{...hidden,visible:true}]),cam,{playing:true});
 await adapter.update(state(.2,[{...hidden,visible:true}]),cam,{playing:true});
 assert.equal(guarded.length,1);
 await adapter.update(state(.3,[hidden]),cam,{playing:true});
 guarded[0]();await Promise.resolve();await Promise.resolve();
 assert.equal(log.filter(x=>x[0]==='event').length,0);adapter.destroy();
});
test('public combat and outcome route score through aftermath and one stinger',async()=>{
 const {adapter,log}=fixture({score:true});await adapter.unlock();
 await adapter.update(state(0,[{...unit,contact:2}]),cam,{playing:true});
 assert.equal(adapter.status().desired,'battle');
 await adapter.update(state(.2),cam,{playing:false,outcome:'victory'});
 await adapter.update(state(.4),cam,{playing:false,outcome:'victory'});
 await adapter.update(state(.6),cam,{playing:false,outcome:'victory'});
 assert.deepEqual(log.filter(x=>x[0]==='music').map(x=>x[1]),['battle','aftermath']);
 assert.equal(log.filter(x=>x[0]==='stinger').length,1);
 adapter.reset();await adapter.update(state(0),cam,{playing:true});
 assert.equal(adapter.status().desired,'peace');adapter.destroy();
});
