import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderWriting} from '../writing-view.js';
import {controlsBar} from '../moderation-view.js';
import {handoffCount} from '../writer-flow.js';

const repoFile=path=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8');
const moduleSource=repoFile('apps/chyepukha/server/module.ts');
const locked=JSON.parse(repoFile('pocketnet/modules.lock.json'));

test('PocketNet v7 is pinned for new rooms; prior versions remain immutable',()=>{
 assert.equal(locked.chyepukha.current,'v7');
 assert.deepEqual(locked.chyepukha.versions,['v1','v2','v3','v4','v5','v6','v7']);
 assert.equal(repoFile('pocketnet/module-versions/chyepukha/v7.ts'),moduleSource);
 assert.notEqual(repoFile('pocketnet/module-versions/chyepukha/v6.ts'),moduleSource);
});

test('new v7 rooms retain checkpointing, presence and moderation in the hub',()=>{
 const hub=repoFile('pocketnet/hub.mjs');
 assert.match(hub,/\['v6','v7'\]\.includes\(room\.version\)/);
 assert.match(hub,/\['v5','v6','v7'\]\.includes\(room\.version\)/);
 assert.ok(!/room\.version\s*(?:===|!==)\s*'v6'/.test(hub));
 const client=repoFile('apps/chyepukha/app.js');
 assert.match(client,/\['v1','v2','v3','v4','v5','v6','v7'\]/);
 assert.match(client,/\['v5','v6','v7'\]/);
});

test('v7 writing shows the passport and finishes without transferred words',()=>{
 const view={
  phase:'writing',host:'author',round:0,total:10,
  settings:{visibleTailWords:3},players:[],
  sheet:{setLabel:'Ланцюг провалів',genreLabel:'Абсурдна комедія',
   question:{prompt:'Хто герой?',guidance:'Назви героя.',creativeFreedom:'Не пиши фінал.'},
   heroAnchor:'',gender:null,tail:''}
 };
 const props={view,roomVersion:'v7',draft:'Звичайний автор придумав щось украй дивне',
  meta:{step:'draft',anchor:'Мирон',gender:'unspecified'},chosen:[],
  escape:s=>String(s??''),rosterCompact:()=>'',turnProgress:()=>'',genres:{},genders:[['unspecified','Неважливо']]};
 const first=renderWriting(props);
 assert.match(first,/id="heroAnchor"/);
 const final=renderWriting({...props,view:{...view,round:9}});
 assert.match(final,/Це останній аркуш/);
 assert.match(final,/Запечатати аркуш/);
 assert.equal(handoffCount({roomVersion:'v7',round:9,total:10,visibleTailWords:3,answer:props.draft}),0);
});

test('word handoff gives an actionable hint and v7 avoids double genre instruction',()=>{
 const view={
  phase:'writing',host:'author',round:3,total:10,
  settings:{visibleTailWords:3},players:[],
  sheet:{setLabel:'Ланцюг провалів',genreLabel:'Абсурдна комедія',nextQuestion:'Наступний крок?',
   question:{prompt:'Що трапилося?',guidance:'Опиши одну дивину.',creativeFreedom:'Не пиши фінал.'},
   heroAnchor:'Василь',gender:'unspecified',tail:'Василь дивний будинок'}
 };
 const props={view,roomVersion:'v7',draft:'Василь знайшов дивний будинок з жабами',
  meta:{step:'select',anchor:'',gender:'unspecified'},chosen:[],
  escape:s=>String(s??''),rosterCompact:()=>'',turnProgress:()=>'',genres:{'Абсурдна комедія':'Занадто смішна підказка.'},genders:[['unspecified','Неважливо']]};
 const html=renderWriting(props);
 assert.match(html,/Обери слова-зачіпки/);
 assert.match(html,/Наступний крок\?/);
 const writing=renderWriting({...props,meta:{step:'draft',anchor:'',gender:'unspecified'}});
 assert.doesNotMatch(writing,/ТОН ЖАНРУ/);
 const old=renderWriting({...props,roomVersion:'v6',meta:{step:'draft',anchor:'',gender:'unspecified'}});
 assert.match(old,/ТОН ЖАНРУ/);
});

test('host controls remain available in v7 as well as existing v6 rooms',()=>{
 const view={phase:'writing',host:'author',round:1,total:10,paused:false};
 for(const version of ['v6','v7']){
  assert.match(controlsBar(view,'author',version,s=>String(s)),/data-act="pause"/);
  assert.match(controlsBar(view,'guest',version,s=>String(s)),/data-act="manage-players"/);
 }
});

test('client, offline cache and release metadata agree on version 1.8.3',()=>{
 const config=JSON.parse(repoFile('apps/chyepukha/app.config.json'));
 const sw=repoFile('apps/chyepukha/sw.js');
 const html=repoFile('apps/chyepukha/index.html');
 assert.equal(config.version,'1.8.3');
 assert.equal(config.cacheName,'chyepukha-v1.8.3');
 assert.match(sw,/const APP_VERSION='1\.8\.3'/);
 assert.match(sw,/__pw_build','chyepukha-1\.8\.3'/);
 assert.match(html,/data-app-version="1\.8\.3"/);
});
