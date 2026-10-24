import test from 'node:test';
import assert from 'node:assert/strict';
import {demoView} from '../preview-data.js';
import {SCREENS} from '../screen-inspector.js';
import {renderWriting} from '../writing-view.js';
import {controlsBar} from '../moderation-view.js';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function screen(id){
 const state=demoView(id),writer=renderWriting({view:state.view,roomVersion:'v7',draft:state.answer||'',
  meta:{step:state.writerStep||'draft',anchor:'Марта',gender:'unspecified'},chosen:state.selection||[],
  escape,rosterCompact:()=>'',turnProgress:()=>'',genres:{'Абсурдна комедія':'Порада дублюється'},genders:[['unspecified','Неважливо'],['female','Жінка']]});
 return {state,writer};
}
test('inspector enumerates unique real v7 fixtures, including host moderation',()=>{
 assert.equal(SCREENS.length,26);
 assert.equal(new Set(SCREENS.map(x=>x.id)).size,26);
 for(const id of ['writing-v7','writing-v7-selection','writing-v7-final','moderation-v7'])
  assert.ok(SCREENS.some(x=>x.id===id),id);
});
test('v7 first, word handoff, final and host access follow actual render functions',()=>{
 const intro=screen('writing-v7');
 assert.equal(intro.state.view.round,0);
 assert.match(intro.writer,/id="heroAnchor"/);
 assert.match(intro.writer,/Хто вирішив утнути/);
 assert.doesNotMatch(intro.writer,/ТОН ЖАНРУ/);
 const select=screen('writing-v7-selection');
 assert.match(select.writer,/writer-selection/);
 assert.match(select.writer,/слова-зачіпки/);
 assert.match(select.writer,/НАСТУПНИЙ АВТОР/);
 const final=screen('writing-v7-final');
 assert.equal(final.state.view.round,final.state.view.total-1);
 assert.match(final.writer,/final-stage-note/);
 assert.match(final.writer,/Запечатати аркуш/);
 assert.doesNotMatch(final.writer,/id="wordTray"/);
 const admin=demoView('moderation-v7');
 assert.equal(admin.modal,'moderation');
 assert.match(controlsBar(admin.view,admin.me,'v7',escape),/moderation-bar/);
});
