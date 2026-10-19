// MEAT.EXE — field journal derived from actual gameplay timings, no fake scores.
const names=['СОСУДЫ','ЖЕЛУДОК','КОСТНЫЙ МОЗГ','НЕРВЫ','СЕРДЦЕ'];
const positive=n=>Number.isFinite(n)?Math.min(99999,Math.max(0,Math.floor(n))):0;
export function durationLabel(seconds){
 const n=positive(seconds);
 return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
}
export function organTimings(run){
 const totals=new Map();
 if(Array.isArray(run?.stageTimes)){
  for(const item of run.stageTimes){
   if(!item||!Number.isInteger(item.wave)||item.wave<1||item.wave>5||
      !Number.isFinite(item.seconds))continue;
   totals.set(item.wave,positive(item.seconds));
  }
 }
 if(Number.isInteger(run?.wave)&&run.wave>=1&&run.wave<=5){
  // The current organ's measured duration overrides a stale loaded entry.
  totals.set(run.wave,positive(run.waveTime));
 }
 return [...totals].sort((a,b)=>a[0]-b[0]).map(([wave,seconds])=>({
  wave,name:names[wave-1],seconds,label:durationLabel(seconds)
 }));
}
export function campaignReport(run,victory){
 const rows=organTimings(run);
 const times=rows.map(o=>o.name+' '+o.label).join(' · ');
 const slow=rows.length?[...rows].sort((a,b)=>b.seconds-a.seconds)[0]:null;
 return (victory?'ЗАБЕГ ЗАВЕРШЁН':'ЭКСПЕДИЦИЯ ПРЕРВАНА')+
  '\nПО ОРГАНАМ: '+(times||'НЕТ ДАННЫХ')+
  (slow?'\nДОЛЬШЕ ВСЕГО: '+slow.name+' · '+slow.label:'')+
  '\nВРЕМЯ '+durationLabel(run?.elapsed)+' · УРОН '+positive(run?.damageTaken)+
  ' · МАКС. ЦЕПЬ ×'+positive(run?.peakCombo);
}
