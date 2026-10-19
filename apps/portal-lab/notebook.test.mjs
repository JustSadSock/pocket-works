import test from 'node:test';
import assert from 'node:assert/strict';
import {
 NOTEBOOK_SCHEMA,NOTEBOOK_MAX,MODE_LABELS,metric,makeRecord,createRecord,
 validateRecords,appendRecord,removeRecord,renameRecord,compareRecords,
 exportNotebook,importNotebook
} from './notebook.js';
const base=(id='exp-1a2b3c')=>({
 id,at:1792420000000,mode:'wave',title:'Пакет света',
 metric:{a:1.2,eta:.25,shape:0,shapeWidth:1.45,lapseBump:0,lapseWidth:1.3},
 setup:{global:{model:'redshift',a:1.2,eta:.25,kind:'light',
  source:{l:3.15,phi:Math.PI,alpha:Math.PI}},
  wave:{j:2,width:1.25,wavelength:2,double:false,relativePhase:0}},
 measures:{
  'geometry-a':{value:1.2,label:'Масштаб горловины a',unit:'a'},
  'wave-budget':{value:.991,label:'Баланс энергии',unit:'E₀'}
 }
});
test('all eleven physical experiment modes are valid archive sources',()=>{
 for(const mode of ['observer','matter','wave','designer','rotation','causality','atlas','map','profile','volume','field3d']){
  const r=makeRecord({...base(),mode,title:MODE_LABELS[mode]});
  assert.equal(r.mode,mode);
 }
});
test('physically meaningful numeric metrics are stored without rounding',()=>{
 const inData=base();
 inData.measures['wave-budget'].value=.999999991342138;
 const out=makeRecord(inData);
 assert.equal(out.measures['wave-budget'].value,.999999991342138);
 assert.equal(out.setup.wave.width,1.25);
});
test('record construction never mutates input measurements or preparation',()=>{
 const input=base();
 const record=makeRecord(input);
 record.setup.wave.j=4;
 record.measures['wave-budget'].value=0;
 assert.equal(input.setup.wave.j,2);
 assert.equal(input.measures['wave-budget'].value,.991);
});
test('createRecord assigns default human-readable mode name',()=>{
 const a=base();
 delete a.title;
 const r=createRecord(a);
 assert.equal(r.title,'Волны');
});
test('append retains chronological insertion order and does not alter original array',()=>{
 const a=makeRecord(base('exp-aaaaaa'));
 const b=makeRecord(base('exp-bbbbbb'));
 const list=appendRecord([a],b);
 assert.deepEqual(list.map(r=>r.id),['exp-aaaaaa','exp-bbbbbb']);
 assert.equal(list.length,2);
 assert.equal(a.id,'exp-aaaaaa');
});
test('bounded local record storage evicts oldest when 33rd record is added',()=>{
 let list=[];
 for(let i=0;i<NOTEBOOK_MAX+5;i++){
  list=appendRecord(list,base('exp-'+String(i).padStart(6,'0')));
 }
 assert.equal(list.length,NOTEBOOK_MAX);
 assert.equal(list[0].id,'exp-000005');
 assert.equal(list.at(-1).id,'exp-000036');
});
test('duplicate IDs are rejected, never silently overwrite measurements',()=>{
 const r=base();
 assert.throws(()=>appendRecord([r],r));
 assert.throws(()=>validateRecords([r,r]));
});
test('rename only targets the selected recording and preserves measured values',()=>{
 const a=base('exp-aaaaaa'),b=base('exp-bbbbbb');
 const out=renameRecord([a,b],'exp-aaaaaa','  Новое   имя ');
 assert.equal(out[0].title,'Новое имя');
 assert.equal(out[1].title,b.title);
 assert.equal(out[0].measures['wave-budget'].value,.991);
});
test('deleting record does not modify any other entry',()=>{
 const a=base('exp-aaaaaa'),b=base('exp-bbbbbb');
 const out=removeRecord([a,b],a.id);
 assert.equal(out.length,1);assert.equal(out[0].id,b.id);
});
test('comparing matching measurements returns true numerical B-A',()=>{
 const a=base('exp-aaaaaa'),b=base('exp-bbbbbb');
 b.measures['wave-budget'].value=.883;
 const info=compareRecords(a,b);
 const energy=info.rows.find(x=>x.key==='wave-budget');
 assert.equal(info.sameMode,true);
 assert.equal(info.shared,2);
 assert.ok(Math.abs(energy.delta+.108)<1e-12);
});
test('unrelated metrics are shown side by side without forged numerical deltas',()=>{
 const a=base('exp-aaaaaa'),b=base('exp-bbbbbb');
 b.mode='matter';
 b.measures['wave-budget']={value:1.1,label:'Разрыв материала',unit:'шт'};
 const info=compareRecords(a,b);
 const m=info.rows.find(x=>x.key==='wave-budget');
 assert.equal(info.sameMode,false);
 assert.equal(m.comparable,false);
 assert.equal(m.delta,null);
 assert.ok(info.rows.find(x=>x.key==='geometry-a').comparable);
});
test('export followed by import preserves physical parameters and measurements',()=>{
 const a=base('exp-aaaaaa'),b=base('exp-bbbbbb');
 const serialized=exportNotebook([a,b]);
 const parsed=JSON.parse(serialized);
 assert.equal(parsed.schema,NOTEBOOK_SCHEMA);
 assert.equal(parsed.app,'portal-lab');
 const imported=importNotebook(serialized);
 assert.deepEqual(imported,validateRecords([a,b]));
});
test('import merges new records without erasing existing archive',()=>{
 const a=base('exp-aaaaaa'),b=base('exp-bbbbbb');
 const out=importNotebook(exportNotebook([b]),[a]);
 assert.equal(out.length,2);
 assert.ok(out.some(x=>x.id===a.id));
 assert.ok(out.some(x=>x.id===b.id));
});
test('idempotent import safely ignores exact duplicate records',()=>{
 const a=base('exp-aaaaaa');
 const out=importNotebook(exportNotebook([a]),[a]);
 assert.equal(out.length,1);
});
test('conflicting import ID fails before existing data changes',()=>{
 const a=base('exp-aaaaaa'),b=base('exp-aaaaaa');
 b.measures['wave-budget'].value=.25;
 const archive=[makeRecord(a)];
 assert.throws(()=>importNotebook(exportNotebook([b]),archive),/Конфликт ID/);
 assert.equal(archive[0].measures['wave-budget'].value,.991);
});
test('replace import works for deliberate full archive restoration',()=>{
 const a=base('exp-aaaaaa'),b=base('exp-bbbbbb');
 const out=importNotebook(exportNotebook([b]),[a],'replace');
 assert.equal(out.length,1);
 assert.equal(out[0].id,b.id);
});
test('invalid mode, non-finite measurements and missing setup are rejected',()=>{
 assert.throws(()=>makeRecord({...base(),mode:'fiction'}));
 assert.throws(()=>makeRecord({...base(),setup:null}));
 const x=base();x.measures['wave-budget'].value=Infinity;
 assert.throws(()=>makeRecord(x));
});
test('malformed schema, unsupported JSON and oversized files are rejected',()=>{
 assert.throws(()=>importNotebook('{}'));
 assert.throws(()=>importNotebook('{error}'));
 assert.throws(()=>importNotebook('x'.repeat(250001)));
 assert.throws(()=>importNotebook(JSON.stringify({schema:'shov-v0',app:'portal-lab',records:[]})));
});
test('prototype pollution and complex nested objects are rejected',()=>{
 const x=base();
 x.setup.wave.constructor={prototype:{unsafe:true}};
 assert.throws(()=>makeRecord(x));
 const y=base();
 y.setup.a={b:{c:{d:{e:{f:{g:1}}}}}};
 assert.throws(()=>makeRecord(y));
 assert.equal({}.unsafe,undefined);
});
test('stored setup blocks unreasonably long strings, arrays and object graphs',()=>{
 const x=base();x.setup.wave.text='a'.repeat(258);
 assert.throws(()=>makeRecord(x));
 const y=base();y.setup.big=Array(41).fill(3);
 assert.throws(()=>makeRecord(y));
});
test('metric helper refuses NaN and Infinity instead of displaying fake numbers',()=>{
 assert.equal(metric(NaN,'unknown'),null);
 assert.equal(metric(Infinity,'unknown'),null);
 assert.deepEqual(metric(1.234,'Measured','m'),{value:1.234,label:'Measured',unit:'m'});
});
test('history count and title caps are enforced',()=>{
 const x=base();x.title='x'.repeat(81);
 assert.throws(()=>makeRecord(x));
 assert.throws(()=>validateRecords(Array.from({length:NOTEBOOK_MAX+1},(_,i)=>base('exp-'+String(i).padStart(6,'0')))));
});
