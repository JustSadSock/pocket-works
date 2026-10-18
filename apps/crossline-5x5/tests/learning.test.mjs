import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {simulateRound,validatePlan} from '../engine.js';
import {GUIDE_ACTIONS,GUIDE_OPPONENT,GUIDE_STEPS,createGuideMatch,guideStep,guideAccept,guideReady,sanitizeMarks,cycleCellMark} from '../learning.js';

test('complete guided sequence uses real legal engine orders and demonstrates a shield block',()=>{
 assert.equal(validatePlan(GUIDE_ACTIONS),null);
 assert.equal(validatePlan(GUIDE_OPPONENT),null);
 assert.equal(guideReady(GUIDE_ACTIONS),true);
 const simulation=simulateRound(createGuideMatch(),{A:GUIDE_ACTIONS,B:GUIDE_OPPONENT});
 assert.ok(simulation.record.frames.length>=5);
 assert.ok(simulation.record.frames.some(frame=>frame.events.some(e=>e.type==='move')));
 assert.ok(simulation.record.frames.some(frame=>frame.events.some(e=>e.type==='attack')));
 assert.ok(simulation.record.frames.some(frame=>frame.events.some(e=>e.type==='block')));
 assert.ok(simulation.record.frames.some(frame=>frame.events.some(e=>e.type==='shield')));
 assert.equal(simulation.record.plans.A[1].dirs[0],'down');
});
test('real control sequence rejects wrong directions and does not increment lesson',()=>{
 assert.equal(GUIDE_STEPS.length,6);
 for(let i=0;i<5;i++)assert.equal(guideAccept(i,GUIDE_ACTIONS[i]),true);
 assert.equal(guideAccept(0,'up'),false);
 assert.equal(guideAccept(1,{type:'attack',dirs:['left']}),false);
 assert.equal(guideAccept(1,{type:'attack',dirs:['up','down']}),false);
 assert.equal(guideAccept(2,'up'),false);
 assert.equal(guideAccept(4,'right'),false);
 assert.equal(guideReady(['right','up','shield','up','left']),false);
 assert.equal(guideStep(1,true,['down']).hint,'✓');
 assert.equal(guideStep(1,true,[]).hint,'↓');
 assert.equal(guideStep(5).key,'submit');
});
test('tactical marks cycle watch → danger → clear without corrupting unmarked cells',()=>{
 const first=cycleCellMark({},2,3);
 assert.deepEqual(first,{'2,3':'watch'});
 const second=cycleCellMark(first,2,3);
 assert.deepEqual(second,{'2,3':'danger'});
 const third=cycleCellMark(second,2,3);
 assert.deepEqual(third,{});
 assert.deepEqual(first,{'2,3':'watch'});
});
test('invalid/outside-grid or attacker-controlled mark data never enters board',()=>{
 assert.deepEqual(cycleCellMark({'0,0':'watch'},-1,5),{'0,0':'watch'});
 assert.deepEqual(sanitizeMarks({'1,2':'danger','x,y':'watch','4,5':'danger','1,3':'cat'}),{'1,2':'danger'});
 assert.deepEqual(sanitizeMarks(null),{});
});
test('tutorial and game marks do not alter rules or authoritative PocketNet snapshot',async()=>{
 const [app,html,sw]=await Promise.all(['app.js','index.html','sw.js'].map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')));
 assert.match(app,/function startTutorial\(\)/);
 assert.match(app,/mode='tutorial';offline=/);
 assert.match(app,/if\(mode==='tutorial'\)return;if\(offline\)/);
 assert.match(app,/if\(mode==='tutorial'&&!guideAccept\(plan.length,action\)\)/);
 assert.match(app,/if\(mode==='tutorial'\)\{offline\.pending\.B=JSON\.parse/);
 assert.match(app,/if\(mode==='tutorial'\)\{tutorialFinished\(\);return\}/);
 assert.match(app,/paintCellMarks\(host,ownMarks\(\)/);
 assert.match(app,/write\('onlineMarks'/);
 assert.match(html,/id="lessonPanel"/);
 assert.match(html,/id="arenaSettings"/);
 assert.match(sw,/\.\/learning\.js/);
});
test('settings affect real WebAudio gain/haptic and persist; no visual-only toggles',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/arenaSoundscape\.play\(type,\{enabled:sound,volume,preview:IS_DEV_FRAME\}\)/);
 const audio=await readFile(new URL('../audio-design.js',import.meta.url),'utf8');
 assert.match(audio,/clamp\(Number\(volume\)\|\|0,0,100\)\/140/);
 assert.match(app,/if\(!haptics\)return/);
 assert.match(app,/write\('volume',volume\)/);
 assert.match(app,/write\('sound',sound\?'on':'off'\)/);
 assert.match(app,/write\('motion',motion\?'on':'off'\)/);
 assert.match(app,/write\('haptics',haptics\?'on':'off'\)/);
 assert.match(app,/\$\('settingsClose'\)\.onclick=closeSettings/);
 assert.match(app,/\$\('pauseSettings'\)\.onclick=openSettings/);
});
