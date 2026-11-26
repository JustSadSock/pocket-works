import test from 'node:test';
import assert from 'node:assert/strict';
import {createMusicDucker} from '../../shared/capabilities/music-ducking.js';
function fixture(){
 const events=[],gain={value:1,cancelScheduledValues(t){events.push(['cancel',t])},setValueAtTime(v,t){events.push(['set',v,t])},linearRampToValueAtTime(v,t){events.push(['ramp',v,t])}};
 const node={gain,connect(){},disconnect(){this.disconnected=true}};
 const context={currentTime:0,createGain:()=>node};
 return {context,node,events,d:createMusicDucker({context,destination:{},attack:.05,release:.2})};
}
test('duck envelope follows audio time and restores unity independently of music volume',()=>{
 const {context,d,node}=fixture();
 d.trigger({gain:.4,duration:.5});
 context.currentTime=.025;assert.ok(Math.abs(d.state.gain-.7)<1e-9);
 context.currentTime=.25;assert.equal(d.state.gain,.4);
 context.currentTime=.6;assert.ok(Math.abs(d.state.gain-.7)<1e-9);
 context.currentTime=.8;assert.equal(d.state.gain,1);
 d.destroy();assert.equal(node.disconnected,true);assert.equal(d.trigger(),false);
});
test('overlapping reactions retain strongest attenuation and extend hold without discontinuity',()=>{
 const {context,d,events}=fixture();
 d.trigger({gain:.3,duration:.5});
 context.currentTime=.2;d.trigger({gain:.7,duration:.5});
 assert.equal(d.state.gain,.3);assert.ok(Math.abs(d.state.until-.9)<1e-9);
 context.currentTime=.8;const held=d.state.gain;d.trigger({gain:.4,duration:.2});
 assert.equal(d.state.gain,held);assert.equal(events.at(-4)[1],held);
 context.currentTime=1.3;assert.equal(d.state.gain,1);
 d.destroy();
});
test('invalid requests leave scheduled envelope unchanged',()=>{
 const {d}=fixture();
 assert.throws(()=>d.trigger({gain:-1}));
 assert.throws(()=>d.trigger({duration:61}));
 assert.equal(d.state.gain,1);assert.equal(d.state.until,null);
 d.destroy();
});
