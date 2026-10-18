import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const g={};g.window=g;g.globalThis=g;vm.createContext(g);
vm.runInContext(read('js/replay-codec.js'),g);
vm.runInContext(read('js/save-schema.js'),g);
const codec=g.FogReplayCodec,schema=g.FogSaveSchema;
const clean=o=>JSON.parse(JSON.stringify(o));
function frame(n){
 return {units:[{id:1,r:1,c:2+n%2,owner:1,hp:5,mp:1,type:'swordsman'}],
  buildings:[{r:1,c:1,type:'base',owner:1,hp:10-n%3,gen:0}],
  state:{turn:n,currentPlayer:n%2+1,gold:{1:10+n,2:10}}};
}
function events(n){return Array.from({length:n},(_,i)=>({type:'action',
 action:{type:'move'},snapshot:frame(i),turn:i}));}
function save(replayEvents=[]){
 const rows=10,cols=15,blank=()=>Array.from({length:rows},()=>Array(cols).fill(false));
 return {version:4,origin:'offline',aiMode:true,aiLevel:6,modeBeta:false,
 map:Array.from({length:rows},()=>Array(cols).fill(0)),units:frame(0).units,
 buildings:frame(0).buildings,nextUnitId:2,
 state:{turn:0,currentPlayer:1,gold:{1:10,2:10},fog:{1:blank(),2:blank()},
 seen:{1:blank(),2:blank()},lastSeen:{1:{},2:{}},log:{1:[],2:[]},grace:{1:null,2:null}},
 timestamp:Date.now(),replayEvents};
}
test('600 events roundtrip as keyframes and deltas',()=>{
 const original=events(600),packed=clean(codec.pack(original));
 assert.deepEqual(clean(codec.expand(packed)),original);
 assert.equal(packed.records.filter(x=>x.k).length,30);
 assert.ok(JSON.stringify(packed).length<JSON.stringify(original).length*.5);
});
test('replay memory is capped and first retained event is a keyframe',()=>{
 const archive=clean(codec.pack(events(1400)));
 assert.equal(archive.records.length,1200);assert.ok(archive.records[0].k);
 assert.equal(codec.expand(archive)[0].turn,200);
});
test('existing version 4 save migrates without losing its replay',()=>{
 const old=schema.normalize(save(events(40)));
 const compressed=clean(codec.packSave(old));
 assert.equal(compressed.replayEvents,undefined);
 const restored=clean(schema.normalize(compressed));
 assert.deepEqual(restored.replayEvents,clean(old.replayEvents));
 assert.equal(restored.aiLevel,6);assert.equal(restored.version,5);
});
test('invalid archive is rejected before use',()=>{
 const packed=clean(codec.packSave(schema.normalize(save(events(4)))));
 const damaged=clean(packed);
 damaged.replayArchive.records[1].d={u:{c:[],r:[],o:[7]}};
 assert.throws(()=>schema.normalize(damaged),/Повреждённый повтор/);
 const mixed=clean(packed);mixed.replayEvents=[];
 assert.throws(()=>schema.normalize(mixed),/Повреждённое сохранение/);
});
test('retired network path is not present',()=>{
 const html=read('index.html'),sw=read('sw.js'),ui=read('js/ui.js');
 for(const marker of ['js/network.js','js/lobby.js','app.js'])
  assert.ok(!html.includes(marker)&&!sw.includes(marker));
 assert.ok(!ui.includes('connectLobbyWrapper()'));
});
