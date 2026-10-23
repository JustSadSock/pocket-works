import test from 'node:test';
import assert from 'node:assert/strict';
import {readiness,waitingHeading,justSubmitted,mayShowFinaleIntro} from '../finale-state.js';
import {renderWaiting} from '../waiting-view.js';
import {finaleCurtain} from '../finale-intro.js';
const people=[{id:'a',name:'Аліса',submitted:true},{id:'b',name:'Борис',submitted:false},{id:'c',name:'Віра',submitted:false}];
test('receipt cards only expose real submitted flags and names, never story content',()=>{
 const html=renderWaiting({players:people,round:2,totalRounds:10,myId:'a',escape:s=>String(s)});
 assert.equal((html.match(/class="dispatch-card /g)||[]).length,3);
 assert.match(html,/1 \/ 3/);
 assert.match(html,/Чекаємо ще 2 авторів/);
 assert.match(html,/Віра/);
 assert.match(html,/data-receipt-id="a"/);
 assert.doesNotMatch(html,/answer|question|tail|sheetId/i);
});
test('waiting count and newly submitted receipts follow authoritative PocketNet flags',()=>{
 const next=people.map(x=>x.id==='b'?{...x,submitted:true}:x);
 assert.deepEqual(readiness(people),{ready:1,total:3,remaining:2,allReady:false});
 assert.equal(waitingHeading(next),'Залишився один автор');
 assert.deepEqual(justSubmitted(people,next),['b']);
 assert.deepEqual(justSubmitted(next,next),[]);
 assert.equal(waitingHeading(next.map(x=>({...x,submitted:true}))),'Усі аркуші здано');
});
test('edition intro happens only after live writing finishes, never on ordinary sync or reconnect',()=>{
 assert.equal(mayShowFinaleIntro('writing','finished',true),true);
 assert.equal(mayShowFinaleIntro(undefined,'finished',true),false);
 assert.equal(mayShowFinaleIntro('finished','finished',true),false);
 assert.equal(mayShowFinaleIntro('lobby','finished',true),false);
 assert.equal(mayShowFinaleIntro('writing','finished',false),false);
 const html=finaleCurtain({count:4});
 assert.match(html,/Читати зараз/);
 assert.match(html,/04 рукописів/);
 assert.match(html,/data-act="skip-finale"/);
});
