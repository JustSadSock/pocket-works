import assert from 'node:assert/strict';
import {test} from 'node:test';
import {scoreGameplayControl,rankGameplayControls} from './cover-gameplay-entry.mjs';
const btn=(text,id='')=>({tag:'button',text,id,className:'',ariaLabel:'',link:'',disabled:false,hidden:false});
test('enter clearly local games and art canvases',()=>{
 for(const [text,id] of [
  ['Играть → Два героя, один экран','soloBtn'],
  ['Нарисовать ↗','new-work'],
  ['НАЧАТЬ РЕЗНЮ ОДИН ПАЛЕЦ →','play'],
  ['Новая колония королева + 9 рабочих','newButton'],
  ['NEW RUN →',''],
  ['Сесть за стол','start-table'],
  ['ВЗЯТЬ КАМЕРУ','continueButton'],
  ['Начать тренировку ↗','soloButton']
 ])assert.ok(scoreGameplayControl(btn(text,id)).score>=58,text);
});
test('never press network or destructive actions',()=>{
 for(const text of [
  'Создать комнату ↗ PocketNet · с друзьями',
  'Начать вместе ↗','Join online lobby','New Game (Multiplayer)',
  'Войти в аккаунт','Стереть сохранение и начать заново','Создать PocketNet',
  'Синхронизировать','Запустить Workshop','НАСТРОЙКИ','В меню ×'
 ])assert.equal(scoreGameplayControl(btn(text,'hostButton')).score,0,text);
});
test('reject visual controls, hidden actions, and external links',()=>{
 assert.equal(scoreGameplayControl(btn('♪','soundBtn')).score,0);
 assert.equal(scoreGameplayControl({...btn('Играть','soloBtn'),hidden:true}).score,0);
 assert.equal(scoreGameplayControl({...btn('Играть','soloBtn'),link:'https://example.com'}).score,0);
});
test('safe solo entry is preferred over ambiguous continue',()=>{
 const list=[btn('Продолжить','continueButton'),btn('Играть → Два героя, один экран','soloBtn'),btn('Создать PocketNet','hostBtn')];
 const ranked=rankGameplayControls(list);
 assert.equal(ranked[0].id,'soloBtn');
 assert.equal(ranked.some(x=>x.id==='hostBtn'),false);
});
