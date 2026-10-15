import assert from 'node:assert/strict';
import {medalSVG,cabinetMarkup,achievementDetailMarkup,settingsMarkup,setSettingsTab} from '../atelier-collection.js';
import {zamazkaAchievements} from '../../../shared/capabilities/zamazka-achievements.js';
import {BRUSH_CURSOR_NAMES} from '../brush-cursor.js';
assert.equal(zamazkaAchievements.length,7);
const own=[zamazkaAchievements[0].id,zamazkaAchievements[3].id];
const ready=cabinetMarkup(zamazkaAchievements,own,{status:'ready'});
assert.equal((ready.match(/data-achievement-select=/g)||[]).length,7);
assert.equal((ready.match(/class="cabinet-medal is-owned/g)||[]).length,1); // selected achievement also has is-selected
assert.equal((ready.match(/ is-owned"/g)||[]).length,2);
assert.match(ready,/<strong>2<\/strong><span>из 7/);
assert.match(ready,/aria-pressed="true"/);
assert.match(ready,/Титул «Подмастерье»/);
const other=cabinetMarkup(zamazkaAchievements,own,{status:'ready',selectedId:zamazkaAchievements[3].id});
assert.match(other,/Трижды прозорливый/);
for(const a of zamazkaAchievements){
 const medal=medalSVG(a.id,true);
 assert(medal.includes('<svg')&&medal.includes('viewBox="0 0 96 100"'));
 assert(!medal.includes('<script'));
 const detail=achievementDetailMarkup(a,false,true);
 assert(detail.includes(a.name)&&detail.includes(a.detail)&&detail.includes(a.reward));
}
const error=cabinetMarkup(zamazkaAchievements,[],{status:'error',error:'Нет сети'});
assert.match(error,/data-action="retry-achievements"/);
assert.match(error,/Не проверено/);
assert.doesNotMatch(error,/>Не открыто</);
const guest=cabinetMarkup(zamazkaAchievements,[],{status:'guest',guest:true});
assert.match(guest,/data-action="pocket-profile"/);
assert.match(guest,/Pocket ID/);
assert.doesNotMatch(guest,/>Не открыто</);
const opts={name:'Реставратор',member:false,sound:true,volume:55,confirmVote:false,appearance:'classic',
 brushStyle:0,brushNames:BRUSH_CURSOR_NAMES};
const settings=settingsMarkup(opts);
assert.equal((settings.match(/data-brush-choice=/g)||[]).length,5);
assert.match(settings,/id="settingStrokeCanvas"/);
for(const id of ['settingBrushStyle','settingNewAppearance','settingVolume','settingSound','settingConfirmVote','settingName'])assert(settings.includes('id="'+id+'"'));
const root={buttons:[{dataset:{settingsTab:'brushes'},classList:{toggle(k,v){this[k]=v}},setAttribute(k,v){this[k]=v}},
 {dataset:{settingsTab:'preferences'},classList:{toggle(k,v){this[k]=v}},setAttribute(k,v){this[k]=v}}],
 panels:[{dataset:{settingsPanel:'brushes'},classList:{toggle(k,v){this[k]=v}},hidden:false},
 {dataset:{settingsPanel:'preferences'},classList:{toggle(k,v){this[k]=v}},hidden:true}],
 querySelectorAll(s){return s==='[data-settings-tab]'?this.buttons:this.panels}};
setSettingsTab(root,'preferences');
assert(root.panels[0].hidden&& !root.panels[1].hidden);
assert.equal(root.buttons[1]['aria-selected'],'true');
setSettingsTab(root,'brushes');
assert(!root.panels[0].hidden&&root.panels[1].hidden);
console.log('ZAMAZKA: 7 genuine medal conditions, locked/unverified/guest distinctions, real brush settings and tab semantics OK');
