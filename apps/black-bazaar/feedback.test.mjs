import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newLogEntries,classifyFeedback,createAudioFeedback} from './feedback.js';

const p={id:'me',items:[],inspections:[],resources:{gold:90,parts:2,crystals:4}};
const snapshot=(fields={})=>({
 phase:'play',revision:12,round:3,turnId:'other',log:['Раунд 3: ход игрока.'],
 listing:null,bids:[],blackLots:[],you:p,...fields
});
test('Only a new authoritative revision can trigger a transaction cue',()=>{
 const old=snapshot();
 assert.equal(classifyFeedback(null,old,'me'),null);
 assert.equal(classifyFeedback(old,{...old},'me'),null);
 assert.equal(classifyFeedback(old,{...old,revision:11,log:['Прямая сделка между A и B заключена.',...old.log]},'me'),null);
 const verified={...old,revision:13,log:['Прямая сделка между A и B заключена.',...old.log]};
 assert.deepEqual(classifyFeedback(old,verified,'me'),{kind:'deal',label:'Сделка заключена'});
 assert.equal(classifyFeedback(verified,verified,'me'),null);
});
test('Changes copied from an old room without a common log cannot masquerade as recent sales',()=>{
 const old=snapshot();
 assert.deepEqual(newLogEntries(old.log,['Совсем другой журнал']),[]);
 assert.equal(classifyFeedback(old,{...old,revision:13,log:['Совсем другой журнал']},'me'),null);
});
test('Cue selection prioritizes curse/urgent consequences over sale updates',()=>{
 const old=snapshot();
 const next={...old,revision:13,log:['Проклятие «Алчность жабы» ударило по Ведьма.','Прямая сделка между A и B заключена.',...old.log]};
 assert.deepEqual(classifyFeedback(old,next,'me'),{kind:'curse',label:'Проклятие сработало'});
 assert.deepEqual(classifyFeedback(old,{...next,log:['Ведьма избежал штрафа по срочному заказу: защитная печать разряжена.',...old.log]},'me'),
 {kind:'ward',label:'Амулет защитил'});
});
test('Public bids and individual inspections react without claiming command acceptance early',()=>{
 const old=snapshot();
 assert.equal(classifyFeedback(old,{...old,revision:13,bids:[{buyer:'guest',offer:{gold:40}}]},'me')?.kind,'bid');
 assert.equal(classifyFeedback(old,{...old,revision:13,you:{...p,inspections:[{itemId:'lot-1',negative:{type:'gold',value:10}}]}},'me')?.kind,'inspect');
 assert.equal(classifyFeedback(old,{...old,revision:13,log:['Маг получил доход от подработки.',...old.log]},'me')?.kind,'reward');
 assert.equal(classifyFeedback(old,{...old,revision:13,log:['Маг сдал предмет в ломбард.',...old.log]},'me')?.kind,'craft');
 assert.equal(classifyFeedback(old,{...old,revision:13,round:4,turnId:'me'},'me')?.kind,'round');
 assert.equal(classifyFeedback(old,{...old,revision:13,turnId:'me'},'me')?.kind,'turn');
});
test('Silent preference persists; oscillator playback requires an unlocked context',()=>{
 let persisted=new Map([['black-bazaar:sound','off']]);
 const storage={getItem:k=>persisted.get(k)??null,setItem:(k,v)=>persisted.set(k,v)};
 let instances=0;
 class MockContext {
  constructor(){instances++ ;this.state='running';this.currentTime=0;this.destination={};}
  createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}
  createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}}}
  suspend(){this.state='suspended';return Promise.resolve()}
  resume(){this.state='running';return Promise.resolve()}
 }
 const audio=createAudioFeedback({storage,AudioContextCtor:MockContext});
 assert.equal(audio.isEnabled(),false);
 assert.equal(audio.play('deal'),false);
 audio.unlock();assert.equal(instances,0);
 assert.equal(audio.setEnabled(true),true);audio.unlock();assert.equal(instances,1);
 assert.equal(audio.play('deal'),true);
 audio.setEnabled(false);assert.equal(audio.play('curse'),false);
 assert.equal(persisted.get('black-bazaar:sound'),'off');
});

test('Resource and artifact motion is gated by server snapshots',()=>{
 const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 assert.match(source,/function showConfirmedMovement\(before,after\)/);
 assert.match(source,/before\.revision===after\.revision/);
 assert.match(source,/showConfirmedMovement\(previous,incoming\)/);
 assert.match(source,/data-resource/);
});
