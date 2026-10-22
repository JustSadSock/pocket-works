import test from 'node:test';
import assert from 'node:assert/strict';
import {buildComicPrompt} from '../comic-prompt.js';
const story={genre:'Абсурдна комедія',setLabel:'Ланцюг провалів',fragments:Array.from({length:10},(_,i)=>({question:'Етап '+(i+1),answer:'Подія номер '+(i+1)+' з кумедним наслідком.'}))};
test('single copied prompt describes four distinct comic pages with all 10 scenes in order',()=>{
 const prompt=buildComicPrompt(story);
 assert.match(prompt,/ЧЕТЫРЕ ПОСЛЕДОВАТЕЛЬНЫЕ/);
 assert.equal((prompt.match(/СТРАНИЦА [1-4]\./g)||[]).length,4);
 assert.equal((prompt.match(/ЧАСТЬ \d+ \/ Этап/g)||[]).length,10);
 const positions=Array.from({length:10},(_,i)=>prompt.indexOf('- Эпизод '+(i+1)+' ('));
 assert.ok(positions.every((x,i)=>x>=0&&(i===0||x>positions[i-1])));
 assert.match(prompt,/не четыре альтернативных варианта/);
});
test('safety adaptation is an instruction to output a standalone revised prompt, not pictures',()=>{
 const text=buildComicPrompt(story,{adapt:true});
 assert.match(text,/НЕ ГЕНЕРИРУЙ КАРТИНКИ/);
 assert.match(text,/для НОВОГО ЧАТА/);
 assert.match(text,/самостоятельный безопасный сценарий|безопасный сценарий|допустимые комедийные/);
 assert.match(text,/ПОЛНЫЙ ИСХОДНЫЙ ТЕКСТ/);
});
test('malformed or empty manuscripts are handled without synthetic scenes',()=>{
 assert.equal(buildComicPrompt({fragments:[]}), '');
 assert.equal(buildComicPrompt(null),'');
});
