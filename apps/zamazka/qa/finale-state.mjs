import assert from 'node:assert/strict';
import {finaleVerdictMarkup,finaleResultsMarkup,finaleRevealAuditMarkup,FINALE_REVISION} from '../finale-ui.js';
import {ARTS,REAL_COUNT,artworkURL} from '../artworks.js';
assert.equal(FINALE_REVISION,'1.39.0');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const selected=Array.from({length:5},(_,i)=>REAL_COUNT+i);
const people=Array.from({length:8},(_,i)=>({id:'id'+i,name:i===0?'Мастер <скрипт>':'Реставратор '+(i+1)}));
const seal=p=>'<span class="member-seal">'+esc(p.name[0])+'</span>';
const dots=n=>'<span class="chip-dots">'+Array.from({length:n},()=>'<i class="chip-dot"></i>').join('')+'</span>';
const head=()=>'<div class="phase-head"><h2>Протокол</h2></div>';
const votes=Object.fromEntries(people.slice(1).map((p,i)=>[p.id,Array.from({length:5},(_,k)=>k===i%5?3:0)]));
const view={phase:'verdict',host:'id0',turn:0,round:1,participants:people,selected,deadline:0,
 gallery:[{name:people[1].name,id:'id1',votes}],
 scores:Object.fromEntries(people.map((p,i)=>[p.id,{mask:100-i*8,eye:60+i*3}]))};
const verdict=finaleVerdictMarkup({view,artworks:ARTS,artworkURL,escapeText:esc,head,chipDots:dots,hostId:'id0'});
assert.equal((verdict.match(/class="verdict-card/g)||[]).length,0); // now annotated cards, not unnamed legacy HTML
assert.equal((verdict.match(/finale-ballot-card/g)||[]).length,5);
assert.match(verdict,/21<\/strong>/); // total 7 players × 3 coins, no fictitious stakes
assert.match(verdict,/data-action="advance"/);
assert.doesNotMatch(verdict,/<script>/);
assert.match(verdict,/aria-label="21 фишек"|ЗАРЕГИСТРИРОВАНО/);
const guest=finaleVerdictMarkup({view,artworks:ARTS,artworkURL,escapeText:esc,head,chipDots:dots,hostId:'id2'});
assert.doesNotMatch(guest,/data-action="advance"/);
assert.match(guest,/Ожидаем организатора/);
let results=finaleResultsMarkup({view,escapeText:esc,memberSeal:seal,pocketPlayerBadge:()=>'',hostId:'id0'});
assert.equal((results.match(/finale-ranking-row/g)||[]).length,8);
assert.match(results,/data-action="next"/);
assert.doesNotMatch(results,/<script>/);
const ties={...view,scores:{...view.scores,id2:{...view.scores.id0}}};
results=finaleResultsMarkup({view:ties,escapeText:esc,memberSeal:seal,pocketPlayerBadge:()=>'',hostId:'id4'});
assert.match(results,/ПЕРВОЕ МЕСТО РАЗДЕЛИЛИ/);
assert.doesNotMatch(results,/data-action="next"/);
const audit=finaleRevealAuditMarkup({breakdown:[{name:'Игрок <2>',correct:2,wrong:1,points:50}],wrong:1,bonus:10,escapeText:esc,chipDots:dots});
assert.match(audit,/\+50/);assert.match(audit,/\+10/);assert.match(audit,/Игрок &lt;2&gt;/);
console.log('ZAMAZKA finale: actual totals, 5 artworks, 8 players, tie, host, guest, escaped labels, and score audit OK');
