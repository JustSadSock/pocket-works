import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialMatch,simulateRound} from '../engine.js';
import {HISTORY_LIMIT,HISTORY_KEY,archiveId,captureHistory,normalizeHistory,addHistory,
 getHistory,saveHistory,deleteHistory,outcomeText,commandLabel,analyzeBeat,exportMatch} from '../replay-archive.js';

const attack=d=>({type:'attack',dirs:[d]});
const planA=[attack('down'),'up','left','right','shield'];
const planB=['up','down','left','right','shield'];
function fixture(){
 const g=initialMatch();g.units.A={x:2,y:2,alive:true};g.units.B={x:2,y:3,alive:true};
 return simulateRound(g,{A:planA,B:planB}).match;
}
function store(limit=Infinity){
 const map=new Map();let writes=0;
 return {getItem:k=>map.get(k)||null,setItem(k,v){
  if(v.length>limit)throw Error('QuotaExceededError');
  map.set(k,v);writes++;
 },removeItem:k=>map.delete(k),get writes(){return writes}};
}
const capture=(id='test',match=fixture(),timestamp=100)=>captureHistory(match,{
 mode:'hotseat',seriesId:id,players:['Синий','Оранжевый'],score:{A:2,B:1}
},timestamp);

test('finished match copy is immutable even when original live match changes',()=>{
 const match=fixture(),entry=capture('abc',match);
 assert.equal(entry.match.outcome,'A');
 assert.equal(entry.match.replays.length,1);
 assert.deepEqual(entry.match.replays[0].plans.A,planA);
 match.replays[0].plans.A[0].dirs[0]='left';
 assert.equal(entry.match.replays[0].plans.A[0].dirs[0],'down');
 assert.equal(archiveId(match,{mode:'hotseat',seriesId:'abc'}),'local:abc');
});
test('ongoing matches cannot be archived; forfeits with no rounds can be exported',()=>{
 const ongoing=initialMatch();
 assert.equal(captureHistory(ongoing),null);
 ongoing.outcome='B';ongoing.termination={type:'forfeit',by:'A'};
 const entry=capture('forfeit',ongoing);
 assert.equal(entry.match.replays.length,0);
 const data=JSON.parse(exportMatch(entry));
 assert.equal(data.match.termination.type,'forfeit');
 assert.equal(data.match.outcome,'B');
});
test('history is ordered, deduplicated, capped, and survives recreation of storage wrapper',()=>{
 const storage=store(),entries=[];
 for(let i=0;i<HISTORY_LIMIT+6;i++)entries.push(capture('id-'+i,fixture(),1000+i));
 for(const entry of entries){const result=saveHistory(storage,entry);assert.equal(result.saved,true)}
 const loaded=getHistory(storage);
 assert.equal(loaded.length,HISTORY_LIMIT);
 assert.equal(loaded[0].id,'local:id-'+(HISTORY_LIMIT+5));
 assert.equal(loaded.at(-1).id,'local:id-6');
 saveHistory(storage,entries[3]);
 assert.equal(getHistory(storage).length,HISTORY_LIMIT);
 assert.equal(normalizeHistory([{id:'junk',match:{}},null,...loaded]).length,HISTORY_LIMIT);
 assert.ok(storage.getItem(HISTORY_KEY));
});
test('quota fallback removes old entries and gracefully preserves already saved data',()=>{
 const bytes=JSON.stringify([capture('id-1')]).length+40;
 const storage=store(bytes);
 assert.equal(saveHistory(storage,capture('id-1')).saved,true);
 assert.equal(saveHistory(storage,capture('id-2',fixture(),200)).saved,true);
 assert.equal(getHistory(storage).length,1);
 assert.equal(getHistory(storage)[0].id,'local:id-2');
 const tiny=store(2);
 assert.equal(saveHistory(tiny,capture('no-space')).saved,false);
 assert.deepEqual(getHistory(tiny),[]);
});
test('delete only selected history entry and preserve other entries',()=>{
 const storage=store();
 saveHistory(storage,capture('one'));saveHistory(storage,capture('two',fixture(),200));
 const result=deleteHistory(storage,'local:one');
 assert.equal(result.saved,true);assert.equal(result.items.length,1);
 assert.equal(getHistory(storage)[0].id,'local:two');
});
test('revealed plans are preserved for both players at any beat including pre-play',()=>{
 const match=fixture(),record=match.replays[0];
 assert.equal(record.frames.length,1);
 const before=analyzeBeat(record,0);
 assert.equal(before.step,0);
 assert.deepEqual(before.projected.A.planned,{x:record.begin.A.x,y:record.begin.A.y});
 assert.equal(before.projected.A.verdict,'До начала');
 const after=analyzeBeat(record,1);
 assert.deepEqual(after.projected.A.action,planA[0]);
 assert.equal(after.projected.A.verdict,'Атаковал');
 assert.equal(after.projected.B.verdict,'Получил удар');
 assert.equal(after.projected.B.actual.alive,false);
 assert.equal(after.total,1);
 assert.equal(commandLabel(planA[0]),'⚔↓');
});
test('JSON export contains all rounds, action frames, metadata and winner',()=>{
 const m=fixture(),entry=capture('full',m);
 const out=JSON.parse(exportMatch(entry));
 assert.equal(out.format,'crossline-5x5');assert.equal(out.version,2);
 assert.equal(out.id,'local:full');assert.equal(out.match.replays.length,1);
 assert.deepEqual(out.match.replays[0].plans.B,planB);
 assert.equal(out.match.outcome,'A');
 assert.equal(outcomeText('draw'),'Ничья');
});
test('UI shows real archive, duel outcome, independent replay and full-match WebM',async()=>{
 const [app,html,css,sw,dev]=await Promise.all(['app.js','index.html','styles.css','sw.js','dev-gallery.js'].map(f=>readFile(new URL('../'+f,import.meta.url),'utf8')));
 for(const id of ['archiveOpen','archiveBack','archiveList','archiveEmpty','replayAnalysis','replayStepBack','replayStepForward'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(app,/function rememberFinished/);
 assert.match(app,/captureHistory\(game\(\)/);
 assert.match(app,/function viewHistory/);
 assert.match(app,/data-archive-remove/);
 assert.match(app,/deleteHistory\(localStorage/);
 assert.match(app,/exportMatch\(entry\)/);
 assert.match(app,/for\(const round of rounds\)for\(let i=0;i<round\.frames\.length;i\+\+\)/);
 assert.match(app,/analyzeBeat\(rec,replayIndex\)/);
 assert.match(app,/data-analysis-beat/);
 assert.ok(css.includes('.archive-list'));
 assert.ok(dev.includes('replay-analysis'));
 assert.ok(sw.includes('./replay-archive.js'));
});
