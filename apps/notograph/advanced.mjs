export function splitVoices(events,name,group=name,limit=15){
 const lanes=[];
 for(const event of [...events].sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.end-b.end)){
  const compatible=lanes.map((lane,i)=>({i,last:lane[lane.length-1]})).filter(x=>x.last.end<=event.start+1e-8).sort((a,b)=>Math.abs(a.last.pitch-event.pitch)-Math.abs(b.last.pitch-event.pitch)||a.i-b.i);
  let i=compatible[0]?.i;
  if(i===undefined){if(lanes.length>=limit)throw Error("Слишком много одновременных голосов.");i=lanes.length;lanes.push([])}
  lanes[i].push({...event});
 }
 return lanes.map((events,i)=>({name:name+(lanes.length>1?" · "+(i+1):""),group,clef:events.reduce((s,n)=>s+n.pitch,0)/events.length<60?"F":"G",events:events.map((n,j)=>({...n,id:group+"-"+i+"-"+j}))}));
}

export function polyphonic(samples,spectrum,progress=()=>{}){
 const hop=256,rate=8192,size=2048,events=[],pending=new Map(),frames=Math.ceil(samples.length/hop);
 function flush(p,k){const n=pending.get(p);if(n&&n.count>=3){const start=n.start*hop/rate,end=Math.min(samples.length,k*hop)/rate;if(end>start)events.push({pitch:p,start,end,confidence:n.sum/n.count})}pending.delete(p)}
 for(let k=0;k<frames;k++){
  const frame=new Float32Array(size),from=k*hop-size/2;frame.set(samples.subarray(Math.max(0,from),Math.min(samples.length,from+size)),Math.max(0,-from));
  const found=new Map();for(const p of spectrum(frame).slice(0,6))if(p.pitch>=36&&p.pitch<=90)found.set(p.pitch,Math.max(found.get(p.pitch)||0,p.confidence));
  for(const p of pending.keys())if(!found.has(p))flush(p,k);
  for(const [p,confidence] of found){const n=pending.get(p);if(n){n.count++;n.sum+=confidence}else pending.set(p,{start:k,count:1,sum:confidence})}
  if(k%32===0)progress(k/frames);
 }
 for(const p of pending.keys())flush(p,frames);
 progress(1);return splitVoices(events,"Многоголосие","polyphonic");
}

export function readAnalysis(data){
 const names={vocals:"Вокал",bass:"Бас",drums:"Ударные",other:"Остальные инструменты",guitar:"Гитара",piano:"Фортепиано",mix:"Вся композиция"};
 if(data?.schema!=="notograph-analysis-v1"||!Array.isArray(data.stems)||data.stems.length<1||data.stems.length>6||!Number.isFinite(data.duration)||data.duration<=0||data.duration>180)throw Error("Неверный формат анализа.");
 const seen=new Set(),tracks=[],stems=[];let total=0;
 for(const stem of data.stems){
  if(!Object.hasOwn(names,stem?.id)||seen.has(stem.id)||!Array.isArray(stem.notes)||stem.notes.length>12000||stem.file!==stem.id+".wav"||!(/^[a-f0-9]{64}$/.test(stem.sha256)))throw Error("Повреждённая дорожка анализа.");
  seen.add(stem.id);const notes=stem.notes.map(n=>{
   if(!Number.isInteger(n.pitch)||n.pitch<21||n.pitch>108||!Number.isFinite(n.start)||!Number.isFinite(n.end)||n.start<0||n.end<=n.start||n.end>data.duration+.1||!Number.isFinite(n.confidence)||n.confidence<0||n.confidence>1)throw Error("Неверная нота в дорожке "+stem.id);
   return {pitch:n.pitch,start:n.start,end:Math.min(data.duration,n.end),confidence:n.confidence};
  }).filter(n=>n.end>n.start);
  total+=notes.length;if(total>12000)throw Error("Слишком большой нотный лист.");
  if(stem.id==="drums"&&notes.length)throw Error("Ударные не должны выдаваться за тональные ноты.");
  tracks.push(...splitVoices(notes,names[stem.id],stem.id,15-tracks.length));stems.push({id:stem.id,name:names[stem.id],file:stem.file,sha256:stem.sha256});
 }
 if(tracks.length>15)throw Error("Более 15 одновременных нотных голосов.");
 return {tracks,stems,duration:data.duration,title:typeof data.title==="string"?data.title.slice(0,100):"Моя композиция"};
}

export function forgeManifest(tracks,bpm,quantize){
 const programs={vocals:52,bass:33,guitar:24,piano:0,other:0,mix:0,polyphonic:0};
 if(!Number.isFinite(bpm)||bpm<40||bpm>240||tracks.length>15)throw Error("Недопустимые настройки партитуры.");
 const channels=[0,1,2,3,4,5,6,7,8,10,11,12,13,14,15];
 const rows=tracks.filter(t=>t.events.length).map((t,i)=>({program:programs[t.group]??0,channel:channels[i],humanizeBeats:0,humanizeVelocity:0,notes:quantize(t.events,bpm).map(n=>({note:n.pitch,beat:n.start/4,duration:(n.end-n.start)/4,velocity:80}))}));
 if(!rows.length)throw Error("Нет нот для Sound Forge.");
 return {version:2,jobs:[{name:"notograph-score",type:"music",tempo:bpm,seed:26,synthGain:.45,output:"generated/notograph-score.wav",tracks:rows,post:{normalizeDb:-5}}]};
}
