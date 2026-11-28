// Artistic research only: new original themes and matched expression controls.
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]??'.audio-artistic-lab');
mkdirSync(root,{recursive:true});
const note=(note,beat,duration,velocity)=>({note,beat,duration,velocity});
const track=(program,notes,pan=64,volume=90)=>({program,notes,pan,volume,humanizeBeats:0,humanizeVelocity:0});
function phrase(pitches,rhythm,start,velocity){
 let beat=start;
 return pitches.map((p,i)=>{const [step,hold,accent=0]=rhythm[i],n=note(p,beat,hold,velocity+accent);beat+=step;return n});
}
function expressive(t,kind){
 const config={flute:[13,5.2,9,88,115,69],pipe:[8,4.6,4,100,118,88],cello:[24,5.1,-24,68,119,57],horn:[12,4.9,-13,80,120,65]}[kind];
 const [depth,rate,bend,low,high,tail]=config;
 const points=new Map();
 for(const n of t.notes){
  const at=n.beat,d=n.duration;
  for(const [f,value] of [[0,low],[.16,Math.round((low+high)/2)],[.43,high],[.78,Math.round((high+tail)/2)],[1,tail]])points.set(at+d*f,{beat:at+d*f,value});
 }
 return {...t,expression:low,performance:{curves:{expression:[...points.values()].sort((a,b)=>a.beat-b.beat)},vibrato:{depthCents:depth,rateHz:rate,delayBeats:.22},attackBend:{cents:bend,durationBeats:.09}}};
}
const themes=[];
function add(id,tempo,meter,bars,tracks,expressions){themes.push({id,tempo,meter,bars,tracks,expressions});}
// Modal folk tune: the pipe plays a melody over a drone, then trades phrases with flute.
const r=[[.5,.45,3],[.5,.46,0],[1,.92,7],[1,.9,0],[.5,.44,-3],[.5,.45,0],[2,1.75,5]];
const folk=Array.from({length:4},(_,i)=>phrase([
 ['D5','E5','F5','A5','G5','F5','D5'],
 ['F5','G5','A5','C6','Bb5','A5','G5'],
 ['A5','G5','F5','D5','E5','F5','A5'],
 ['G5','F5','E5','A4','C5','E5','D5']
][i],r,i*6,81)).flat();
const drone=Array.from({length:8},(_,i)=>[note('D3',i*3,2.95,48),note('A3',i*3,2.95,43)]).flat();
const lute=Array.from({length:8},(_,i)=>['D4','A3',i%2?'C4':'F4','A3','D4','A3'].map((p,k)=>note(p,i*3+k*.5,.41,58+(k===0?9:0)))).flat();
add('moorland',96,3,8,[track(109,folk.slice(0,14),52,90),track(73,folk.slice(14),76,95),track(24,lute,81,86),track(42,drone,45,60)],{0:'pipe',1:'flute'});
// Long cello line with harmonic tension, delayed resolution and a responding horn.
const lamentR=[[2,1.85,4],[1,.92,-4],[1,.9,0],[2,1.82,8],[1,.92,0],[1,.88,-4],[4,3.65,3]];
const cello=[...phrase(['D4','E4','F4','A4','G4','F4','E4'],lamentR,0,73),...phrase(['F4','G4','Ab4','C5','Bb4','A4','D4'],lamentR,12,78)];
const harmony=[['D3','A3','F4'],['Bb2','F3','D4'],['G2','D3','Bb3'],['A2','E3','C#4'],['Eb3','Bb3','G4'],['G2','D3','Bb3'],['A2','E3','C#4'],['D3','A3','F#4']];
const strings=harmony.flatMap((ch,i)=>ch.map(p=>note(p,i*3,2.88,49+i%3*5)));
const horn=[note('A3',3,2.6,66),note('D4',9,2.5,72),note('E4',15,2.4,75),note('D4',21,2.7,69)];
add('last-standard',72,3,8,[track(42,cello,45,100),track(48,strings,64,78),track(60,horn,82,85)],{0:'cello',2:'horn'});
// 16-bar battle composition: alternation, counter-melody and a distinct second section.
const chords=[['D2','A2','F3'],['Bb2','F3','D4'],['G2','D3','Bb3'],['A2','E3','C#4'],['D2','A2','F3'],['F2','C3','A3'],['Bb2','F3','D4'],['A2','E3','G3'],['G2','D3','Bb3'],['Eb2','Bb2','G3'],['D2','A2','F3'],['A2','E3','C#4'],['D2','A2','F3'],['Bb2','F3','D4'],['A2','E3','C#4'],['D2','A2','F3']];
const battleMelodies=[['D4','F4','A4','G4','F4','D4'],['A4','G4','F4','E4','D4','A3'],['G4','Bb4','D5','C5','Bb4','G4'],['A4','C#5','E5','D5','C#5','A4'],['D5','C5','A4','F4','G4','A4'],['Bb4','G4','Eb4','G4','F4','Eb4'],['F4','A4','D5','E5','F5','A4'],['A4','G4','E4','C#4','E4','D4']];
const battleRhythm=[[.5,.42,0],[.5,.44,5],[1,.87,8],[1,.9,0],[1,.86,-3],[4,3.5,5]];
const lead=battleMelodies.flatMap((p,i)=>phrase(p,battleRhythm,i*8,91));
const ostinato=chords.flatMap((ch,i)=>Array.from({length:8},(_,j)=>note(ch[(j+(i>=8?1:0))%3],i*4+j*.5,.36+(j%3===0?.05:0),73+(j%4===0?12:0))));
const bass=chords.flatMap((ch,i)=>[note(ch[0],i*4,1.7,81),note(ch[1],i*4+2,.85,75),note(ch[0],i*4+3,.8,83)]);
const timpani=chords.flatMap((ch,i)=>[note(ch[0],i*4,.45,98),note(ch[0],i*4+(i>=8?2.5:2),.37,88),...(i%4===3?[note(ch[0],i*4+3.5,.24,100)]:[])]);
const response=chords.flatMap((ch,i)=>i%2===1?[note(ch[2],i*4+.5,1.1,73),note(ch[1],i*4+2,1.45,80)]:[]);
add('iron-horizon',126,4,16,[track(60,lead,48,102),track(48,ostinato,66,90),track(42,bass,38,94),track(47,timpani,64,93),track(61,response,83,83)],{0:'horn'});
const jobs=themes.flatMap(t=>['control','expressive'].map(mode=>({
 name:t.id+'-'+mode,type:'music',tempo:t.tempo,seed:713,synthGain:.42,
 tracks:t.tracks.map((tr,i)=>mode==='expressive'&&t.expressions[i]?expressive(tr,t.expressions[i]):tr),
 output:'generated/music/'+t.id+'-'+mode+'.wav',post:{normalizeDb:-4}
})));
const families=[
 {id:'boot-earth',model:'boot-earth',seed:701,strength:.65},
 {id:'hoof-earth',model:'hoof-earth',seed:702,strength:.75},
 {id:'armor-leather',model:'armor-leather',seed:703,strength:.5},
 {id:'shield-wood',model:'shield-wood',seed:704,strength:.8}
].map(f=>({...f,variants:6,spread:.2,source:'original',format:'wav',outputDir:'generated/effects/'+f.id}));
writeFileSync(path.join(root,'manifest.json'),JSON.stringify({version:2,jobs,families},null,2)+'\n');
writeFileSync(path.join(root,'audition-plan.json'),JSON.stringify({approval:'research-only',themes:themes.map(({id,tempo,meter,bars})=>({id,tempo,meter,bars})),families:families.map(f=>({id:f.id,variants:f.variants}))},null,2)+'\n');
