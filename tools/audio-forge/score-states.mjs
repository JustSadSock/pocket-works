// Original state-specific scores. Same melodic identity, different musical syntax.
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]??'.audio-score-states');
mkdirSync(root,{recursive:true});
const note=(note,beat,duration,velocity)=>({note,beat,duration,velocity});
const track=(program,notes,pan=64,volume=94)=>({program,notes,pan,volume,humanizeBeats:0,humanizeVelocity:3});
function motif(pitches,rhythm,start,velocity){let t=start;return pitches.map((p,i)=>{const [step,hold]=rhythm[i];const n=note(p,t,hold,velocity+(i===3?6:0));t+=step;return n})}
function chords(voicings,step,hold,velocity){return voicings.flatMap((ch,i)=>ch.map(p=>note(p,i*step,hold,velocity)))}
function arp(voicings,step,pattern,velocity){return voicings.flatMap((ch,i)=>pattern.map(([idx,t,d],j)=>note(ch[idx%ch.length],i*step+t,d,velocity+(j%3===0?8:0))))}
const states=[];
function score(id,tempo,beatsPerBar,bars,tracks,description){
 const duration=60/tempo*beatsPerBar*bars;
 states.push({id,tempo,beatsPerBar,bars,duration,description,tracks});
}
// D major/modal: a wide pastoral melody, breathing room and plucked counterpoint.
const peaceChords=[['D3','A3','F#4'],['G3','D4','B4'],['B2','F#3','D4'],['A2','E3','C#4'],['D3','A3','F#4'],['G3','B3','D4'],['A2','E3','G3'],['D3','A3','F#4']];
score('peace',76,3,8,[
 track(73,[...motif(['D5','E5','F#5','A5','G5','E5','D5'],[[1,.86],[.5,.42],[1.5,1.32],[2,1.65],[1,.88],[1,.85],[2,1.72]],0,76),...motif(['F#5','E5','D5','B4','D5','E5','D5'],[[1,.8],[1,.85],[2,1.72],[1,.8],[1,.85],[1,.88],[3,2.6]],12,70)],49,100),
 track(46,arp(peaceChords,3,[[0,0,.9],[1,.75,.6],[2,1.5,.6],[1,2.25,.65]],65),82,91),
 track(42,chords(peaceChords.map(c=>[c[0]]),3,2.8,48),62,72)
],'Pastoral triple meter, D major, flute and harp');
// D minor with altered dominant and Phrygian colour; sparse, asymmetrical pulse.
const tensionChords=[['D2','A2','F3'],['Eb2','Bb2','G3'],['D2','Ab2','F3'],['A2','C#3','G3']];
score('tension',104,5,4,[
 track(42,[...motif(['D3','E3','F3','A3','G3','Eb3','D3'],[[1.5,1.35],[.5,.4],[1, .8],[2,1.8],[1,.8],[1,.8],[2,1.8]],0,76),...motif(['D3','Eb3','F3','Ab3','G3','C#3','D3'],[[1,.85],[.5,.4],[1.5,1.3],[2,1.8],[1,.85],[1,.8],[2,1.8]],10,83)],58,100),
 track(45,arp(tensionChords,5,[[0,0,.3],[1,1.5,.25],[0,2,.3],[2,3.5,.25],[1,4,.25]],78),84,94),
 track(48,chords(tensionChords,5,4.75,56),48,83),
 track(47,tensionChords.flatMap((c,i)=>[note(c[0],i*5,.48,80),note(c[0],i*5+3,.45,66)]),64,85)
],'Uneven 5/4, dissonance, low strings and anticipatory timpani');
// Rhythmic diminution and stronger brass: battle motif is a call, not an added layer.
const battleChords=[['D2','A2','F3'],['Bb2','F3','D4'],['G2','D3','Bb3'],['A2','E3','C#4'],['D2','A2','F3'],['C2','G2','E3'],['Bb2','F3','D4'],['A2','E3','C#4']];
const calls=[];
for(let bar=0;bar<8;bar+=2){
 const p=bar===6?['D4','E4','F4','A4','G4','E4','D4']:bar===4?['F4','G4','A4','C5','Bb4','G4','A4']:['D4','E4','F4','A4','G4','E4','D4'];
 calls.push(...motif(p,[[.5,.44],[.5,.44],[1,.9],[1.5,1.3],[.5,.43],[.5,.42],[2.5,2.2]],bar*4,104));
}
score('battle',144,4,8,[
 track(60,calls,47,108),
 track(61,calls.filter((_,i)=>i%7===0||i%7===3||i%7===6).map(n=>({...n,note:({D4:'D3',A4:'A3',F4:'F3',C5:'C4',Bb4:'Bb3'}[n.note]??'D3'),velocity:94})),80,101),
 track(48,arp(battleChords,4,Array.from({length:8},(_,i)=>[i%3,i*.5,.41]),82),66,94),
 track(42,battleChords.flatMap((c,i)=>[note(c[0],i*4,.85,95),note(c[1],i*4+1,.82,83),note(c[0],i*4+2,1.7,96)]),35,94),
 track(47,battleChords.flatMap((c,i)=>[note('D2',i*4,.38,110),note('A2',i*4+1.5,.25,88),note('D2',i*4+2,.38,104),note('A2',i*4+3.5,.25,95)]),64,110)
],'144 BPM march, motif in brass, string ostinato and accented timpani');
// Aftermath suspends the conflict, resolves minor into the original mode.
score('aftermath',68,4,4,[
 track(42,motif(['D4','F4','E4','A3','G3','E3','D3'],[[2,1.8],[1,.9],[1,.9],[3,2.6],[2,1.8],[2,1.8],[4,3.5]],0,70),48,99),
 track(48,chords([['D3','A3','F4'],['Bb2','F3','D4'],['A2','E3','C#4'],['D3','A3','F#4']],4,3.7,53),76,82),
 track(46,[note('D4',0,1.5,46),note('A3',4,1.5,48),note('E4',8,1.5,48),note('F#4',12,1.5,52),note('D5',14,1.65,46)],83,80)
],'Slow aftermath, cello lament, Picardy resolution');
const jobs=states.map(s=>({name:'score-'+s.id,type:'music',tempo:s.tempo,seed:42,synthGain:.5,tracks:s.tracks,output:'generated/'+s.id+'.wav',post:{normalizeDb:-3}}));
const graph={version:1,initial:'peace',states:Object.fromEntries(states.map(({tracks,...s})=>[s.id,{...s,file:'states/'+s.id+'.wav'}])),edges:{peace:['tension','battle'],tension:['peace','battle'],battle:['aftermath'],aftermath:['peace','tension','battle']}};
writeFileSync(path.join(root,'manifest.json'),JSON.stringify({version:2,jobs},null,2)+'\n');
writeFileSync(path.join(root,'score-graph.json'),JSON.stringify(graph,null,2)+'\n');
