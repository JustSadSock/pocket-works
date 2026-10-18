import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEV_QUERY,DEV_SCENES,devScene,isDevKey} from '../dev-gallery.js';
import {initialMatch,simulateRound,validatePlan} from '../engine.js';

const file=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [app,html,css,sw]=await Promise.all(['app.js','index.html','dev-gallery.css','sw.js'].map(file));
const required=['Меню','PocketNet','План','Диалоги','Повторы','Анимации','Эффекты','Звуки','Обучение','Настройки'];
test('all QA categories and 45 selectable previews exist',()=>{
 assert.equal(DEV_SCENES.length,45);
 assert.equal(new Set(DEV_SCENES.map(x=>x.id)).size,45);
 for(const category of required)assert.ok(DEV_SCENES.some(x=>x.group===category),category);
 assert.equal(devScene('not-a-real-scene'),'menu');
 assert.equal(devScene('anim-attack'),'anim-attack');
 assert.equal(DEV_QUERY,'__arena_dev');
 assert.ok(isDevKey({code:'Backquote',key:'Backquote'}));
 assert.ok(isDevKey({code:'KeyO',key:'ё'}));
});
test('inspector is mounted from ⋯ everywhere, with Workshop diagnostics retained',()=>{
 assert.ok((html.match(/data-workshop-trigger/g)||[]).length>=3);
 assert.match(app,/mountArenaDevGallery\(\{onDiagnostics:\(\)=>workshop\.open\(\)\}\)/);
 assert.match(app,/createWorkshopMode/);
 assert.match(app,/triggerSelector:'\[data-workshop-diagnostics-trigger\]'/);
 assert.ok(html.includes('./dev-gallery.css'));
 assert.ok(sw.includes('./dev-gallery.js'));
 assert.ok(sw.includes('./dev-gallery.css'));
});
test('QA frame does not touch PocketNet, profile, app storage or updater',()=>{
 assert.match(app,/IS_DEV_FRAME=window\.parent!==window/);
 assert.match(app,/if\(IS_DEV_FRAME\)return fallback/);
 assert.match(app,/if\(IS_DEV_FRAME\)return;try\{localStorage\.setItem/);
 assert.match(app,/if\(IS_DEV_FRAME\)\{initDevPreview\(action/);
 assert.match(app,/if\(IS_DEV_FRAME\)\{if\(payload/);
 assert.match(app,/if\(!IS_DEV_FRAME\)getPocketIdentity/);
 assert.match(html,/removeAttribute\("data-update-manager"\)/);
});
test('real shared combat renderer supports adjustable playback speed',()=>{
 assert.match(app,/animateRecord\(completed\.record\)/);
 assert.match(app,/playArenaBeat\(\$\('board'\)/);
 assert.match(app,/playArenaBeat\(\$\('replayBoard'\)/);
 assert.match(app,/speed:devAnimationSpeed/);
 assert.match(app,/devAnimationSpeed=event\.data\.speed/);
 assert.ok(css.includes('.arena-dev__frame'));
});
test('audio lab calls all seven real action sounds',()=>{
 for(const event of ['tap','plan','move','hit','block','win','error'])
  assert.ok(app.includes("['"+event+"'"),event);
 assert.match(app,/soundFX\(id\)/);
 assert.match(app,/root\.querySelectorAll\('\[data-arena-audio\]'\)/);
});
test('demo battle plans are valid and exercise shield, hit, trade, collapse',()=>{
 const atk=d=>({type:'attack',dirs:[d]});
 const plans={
  move:{A:['right','right','up','down','shield'],B:['left','left','up','down','shield']},
  strike:{A:[atk('down'),'up','left','right','shield'],B:['up','down','left','right','shield']},
  shield:{A:[atk('down'),'up','left','right','shield'],B:['shield','up','down','left','right']},
  mutual:{A:[atk('down'),'up','left','right','shield'],B:[atk('up'),'down','left','right','shield']},
  collapse:{A:['up','down','left','right','shield'],B:['up','down','left','right','shield']}
 };
 for(const [type,p] of Object.entries(plans)){
  assert.equal(validatePlan(p.A),null,type+' A');assert.equal(validatePlan(p.B),null,type+' B');
  const g=initialMatch();
  if(type==='collapse')g.round=4;
  else if(type!=='move'){g.units.A={x:2,y:2,alive:true};g.units.B={x:2,y:3,alive:true}}
  const result=simulateRound(g,p);
  assert.ok(result.record.frames.length>=1,type);
  if(type==='shield')assert.ok(result.record.frames[0].events.some(e=>e.type==='block'));
  if(type==='mutual')assert.equal(result.match.outcome,'draw');
  if(type==='collapse')assert.ok(result.record.frames[0].events.some(e=>e.type==='collapse'));
 }
});
