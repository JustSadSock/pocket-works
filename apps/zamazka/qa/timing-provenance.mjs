import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {ARTS,REAL_COUNT} from '../artworks.js';
import {ART_SCHOOLS,CREATION_PLACES} from '../art-provenance.js';

assert.equal(REAL_COUNT,54,'all 54 real artworks are present');
assert.equal(ART_SCHOOLS.length,REAL_COUNT,'every real painting has curated origin information');
for(let id=0;id<REAL_COUNT;id++){
 assert.equal(typeof ARTS[id].schoolCountry,'string','painting '+id+' school country');
 assert.ok(ARTS[id].schoolCountry.length>2);
}
for(const [id,place] of Object.entries(CREATION_PLACES)){
 assert.ok(Number(id)>=0&&Number(id)<REAL_COUNT);
 assert.equal(ARTS[id].creationPlace.city,place.city);
 assert.equal(ARTS[id].creationPlace.country,place.country);
}
assert.equal(ARTS[6].creationPlace.city,'Сен-Реми-де-Прованс','Chicago Bedroom copy was NOT painted in Arles');
assert.equal(ARTS[1].schoolCountry,'Нидерланды','a Dutch painter working in France');
assert.equal(ARTS[1].creationPlace.country,'Франция','the work was painted in France');

let now=5000;
class Clock extends Date{static now(){return now}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
runInNewContext(compiled,{exports,Date:Clock,Math,Array,Number,Object,Error,JSON,Set,Map,console});
assert.equal(exports.RULESET_VERSION,6,'new server rules version');
const player={id:'author',name:'Restorer'},guest={id:'peer',name:'Observer'},players=[player,guest];
const game=exports.default,state=game.createRoom({player}).state;
game.onJoin({state,player:guest,players});
game.onMessage({state,player,players,payload:{type:'start',rounds:1}});
assert.equal(state.phase,'preview');
now=state.deadline+1;
game.onMessage({state,player,players,payload:{type:'pulse'}});
assert.equal(state.phase,'drawing');
assert.equal(state.deadline-now,160000,'drawing time must be 2:40');
assert.ok(readFileSync(new URL('../app.js',import.meta.url),'utf8').includes('practice.deadline=Date.now()+160000'),'practice uses identical duration');
console.log('ZAMAZKA: 160s online/practice, 54 origins, and independently labeled creation cities OK');
