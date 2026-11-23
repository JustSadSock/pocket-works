import test from 'node:test';
import assert from 'node:assert/strict';
import {stories} from '../stories.js';
import {validateStory,snapshotAt} from '../core.js';
import {cloneAsDraft,createPhaseDraft,parseStory,exportPackage,parseImport} from '../studio-data.js';
import {validateTactics,commandRoster,commandAt,orderAt,validPolygon,
  polygonArea,pointInPolygon} from '../tactics.js';
const battle=stories.find(s=>s.id==='breitenfeld');

test('documented command groups and phase orders remain independent of interpolation',()=>{
  assert.deepEqual(validateTactics(battle),[]);
  const start=commandRoster(battle,1),middle=commandRoster(battle,3),end=commandRoster(battle,5);
  assert.equal(start.length,3);
  assert.equal(start.reduce((sum,x)=>sum+x.count,0),7);
  assert.equal(middle.find(x=>x.id==='saxon-command').units[0].order.action,'rout');
  assert.equal(end.find(x=>x.id==='imperial-command').units.length,3);
  assert.equal(commandAt(battle,battle.entities.find(x=>x.id==='horn')).commander,'Густав II Адольф');
  assert.equal(orderAt(battle.entities.find(x=>x.id==='pappenheim'),1),null);
  assert.equal(orderAt(battle.entities.find(x=>x.id==='pappenheim'),2).action,'advance');
});

test('frontier polygons are topologically valid, clipped and clickable',()=>{
  const f=battle.features.find(f=>f.kind==='boundary');
  assert.ok(f);
  assert.equal(validPolygon(f.points,battle.world),true);
  assert.ok(polygonArea(f.points)>100);
  assert.ok(pointInPolygon(310,391,f.points));
  assert.ok(!pointInPolygon(990,690,f.points));
  assert.equal(snapshotAt(battle,2).features.some(x=>x.id===f.id),false);
  assert.equal(snapshotAt(battle,3).features.some(x=>x.id===f.id),true);
  assert.equal(snapshotAt(battle,5).features.some(x=>x.id===f.id),false);
  assert.equal(validPolygon([[0,0],[200,200],[0,200],[200,0]],battle.world),false);
  assert.equal(validPolygon([[0,0],[30,0],[0,1]],{width:100,height:100}),false);
});

test('phase story can be authored with nested hierarchy and explicit tactical orders',()=>{
  const story=createPhaseDraft();
  story.commands.push({id:'blue-army',name:'Северная армия',side:'allied',commander:'Автор',
    sources:[]});
  story.entities.push({id:'blue-core',type:'army',name:'Центр армии',x:200,y:200,
    from:1,confidence:'hypothetical',sources:[],description:'',current:'',
    commandId:'blue-army',
    orders:[{time:2,action:'reform',note:'Перестроение по авторскому сценарию',
      confidence:'hypothetical',sources:[]}]});
  story.entities.push({id:'blue-wing',type:'army',name:'Левое крыло',x:170,y:255,
    from:1,confidence:'hypothetical',sources:[],description:'',current:'',
    commandId:'blue-army',parentId:'blue-core'});
  story.features.push({id:'front-line',kind:'boundary',x:550,y:300,rx:110,ry:80,
    label:'Условная граница',from:2,until:4,confidence:'hypothetical',
    points:[[410,220],[610,225],[600,390],[400,380]],sources:[]});
  const restored=parseImport(exportPackage(story));
  assert.deepEqual(validateStory(restored),[]);
  assert.equal(restored.commands.length,1);
  assert.equal(restored.entities[1].parentId,'blue-core');
  const command=commandRoster(restored,3)[0];
  assert.equal(command.units.length,1);
  assert.equal(command.units[0].children[0].name,'Левое крыло');
  assert.equal(orderAt(restored.entities[0],3).action,'reform');
  assert.equal(restored.features[0].points.length,4);
});

test('invalid tactical relationships and source-free confirmations reject cleanly',()=>{
  const s=createPhaseDraft();
  s.commands.push({id:'camp1',name:'Первый штаб',side:'imperial',commander:'',sources:[]});
  s.entities.push({id:'one',type:'army',name:'Первое крыло',x:100,y:100,from:1,
    confidence:'hypothetical',sources:[],commandId:'camp1',description:'',current:''});
  s.entities.push({id:'two',type:'army',name:'Второе крыло',x:180,y:180,from:1,
    confidence:'hypothetical',sources:[],commandId:'camp1',description:'',current:''});
  s.entities[0].parentId='two';s.entities[1].parentId='one';
  assert.ok(validateStory(s).some(e=>e.includes('Цикл')));
  s.entities[1].parentId=undefined;s.entities[0].parentId=undefined;
  s.entities[0].orders=[{time:3,action:'advance',note:'',confidence:'confirmed',sources:[]}];
  assert.ok(validateStory(s).some(e=>e.includes('источник')));
  assert.throws(()=>parseStory(s),/приказ требует источник|приказ|источник/);
  s.entities[0].orders=[];
  s.features.push({id:'bad-border',kind:'boundary',label:'Непроверенная',
    x:200,y:200,rx:50,ry:50,from:1,confidence:'confirmed',
    sources:[],points:[[150,150],[200,200],[230,150]]});
  assert.throws(()=>parseStory(s),/граница требует источника/);
});

test('legacy user stories survive additive command and polygon schema',()=>{
  const old=createPhaseDraft();
  delete old.commands;
  const clean=parseStory(old);
  assert.deepEqual(clean.commands,[]);
  assert.equal(clean.timeUnit,'phase');
  const copied=cloneAsDraft(battle);
  assert.equal(copied.commands.length,3);
  assert.equal(copied.entities.reduce((n,e)=>n+(e.orders?.length||0),0),16);
  assert.deepEqual(validateStory(copied),[]);
});
