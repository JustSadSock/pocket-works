// Folkarium: deterministic composition engine, audio voices and offline export.
export const MODES={
  dorian:{label:'Дорийский',intervals:[0,2,3,5,7,9,10]},
  aeolian:{label:'Эолийский',intervals:[0,2,3,5,7,8,10]},
  mixolydian:{label:'Миксолидийский',intervals:[0,2,4,5,7,9,10]},
  phrygian:{label:'Фригийский',intervals:[0,1,3,5,7,8,10]}
};
export const MOODS={
  ballad:{label:'Баллада',tempo:96,mode:'dorian'},
  dance:{label:'Пляска',tempo:136,mode:'mixolydian'},
  lament:{label:'Плач',tempo:78,mode:'aeolian'},
  march:{label:'Поход',tempo:112,mode:'phrygian'}
};
export const INSTRUMENTS=[
  {id:'vielle',label:'Виела',role:'Ведущая мелодия',level:.82,midi:40},
  {id:'lute',label:'Лютня',role:'Щипковый ритм',level:.72,midi:24},
  {id:'hurdy',label:'Колёсная лира',role:'Бурдон',level:.52,midi:21},
  {id:'flute',label:'Флейта',role:'Подголосок',level:.66,midi:73},
  {id:'harp',label:'Арфа',role:'Переборы',level:.63,midi:46},
  {id:'drum',label:'Бубен',role:'Пульс',level:.45,midi:0}
];
export const SECTIONS=[{name:'Пролог',bars:4},{name:'Песнь',bars:8},{name:'Отголосок',bars:8},{name:'Эпилог',bars:4}];
export const STEPS=16;
export const ROOT=57;
function rng(seed){let t=seed>>>0;return ()=>{t+=0x6d2b79f5;let v=t;v=Math.imul(v^(v>>>15),v|1);v^=v+Math.imul(v^(v>>>7),v|61);return ((v^(v>>>14))>>>0)/4294967296}}
function bound(n,lo,hi){return Math.max(lo,Math.min(hi,n))}
export function degreeToMidi(degree,mode='dorian'){
  const steps=(MODES[mode]||MODES.dorian).intervals;
  const octave=Math.floor(degree/7);
  const index=((degree%7)+7)%7;
  return ROOT+octave*12+steps[index];
}
export function pitches(mode){return Array.from({length:15},(_,i)=>({d:14-i,midi:degreeToMidi(14-i,mode)}))}
export function pitchLabel(midi){
  const names=['До','До♯','Ре','Ре♯','Ми','Фа','Фа♯','Соль','Соль♯','Ля','Ля♯','Си'];
  return names[((midi%12)+12)%12]+String(Math.floor(midi/12)-1);
}
function note(d,len=1,v=.78){return {d:bound(Math.round(d),0,14),len:bound(len,1,16),v:bound(v,.25,1)}}
export function makePattern(id,sectionIndex,song,seed){
  const p=Array(STEPS).fill(null),r=rng(seed),density=bound(song.density??.56,0,1);
  const intensity=[.35,.86,.76,.48][sectionIndex]||.5;
  const dance=song.mood==='dance',lament=song.mood==='lament',march=song.mood==='march';
  const base=[5,6,8,5][sectionIndex]+(dance?1:0);
  if(id==='vielle'){
    let d=base+Math.floor(r()*3);
    for(let s=0;s<16;s+=2){
      if(s>0)d=bound(d+[-2,-1,-1,0,1,1,2][Math.floor(r()*7)],3,13);
      if(r()>.08) p[s]=note(d,r()<.25?3:2,.67+r()*.28);
      if(!lament&&s+1<16&&r()<density*.42*intensity)p[s+1]=note(bound(d+(r()<.5?-1:1),0,14),1,.53);
    }
    p[0]=note(base,2,.9);p[14]=note(base-1,2,.83);
  }else if(id==='lute'){
    const chord=[0,2,4,2,0,3,4,2];
    for(let s=0;s<16;s+=2){
      if(r()<.58+density*.34)p[s]=note(chord[Math.floor(s/2)%8]+(sectionIndex===2?1:0),1,.48+r()*.33);
      if((dance||march)&&r()<density*.5)p[s+1]=note(chord[(Math.floor(s/2)+1)%8]+7,1,.46);
    }
  }else if(id==='hurdy'){
    p[0]=note(0,8,.62);p[8]=note(sectionIndex===2?3:0,8,.57);
    if(density>.72)p[4]=note(4,4,.37);
  }else if(id==='flute'){
    for(let s=2;s<16;s+=2){
      if(r()<density*intensity*.72)p[s]=note(bound(base+3+Math.floor(r()*5)-2,0,14),r()<.5?2:3,.5+r()*.26);
    }
  }else if(id==='harp'){
    const line=[0,4,7,9,7,4,2,4];
    for(let s=0;s<16;s+=2){
      if(r()<density*.9)p[s]=note(line[(Math.floor(s/2)+sectionIndex)%line.length],2,.44+r()*.23);
      if(density>.65&&r()<.3)p[s+1]=note(7+Math.floor(r()*3),1,.35);
    }
  }else if(id==='drum'){
    for(let s=0;s<16;s+=2){
      const down=s%8===0;
      if(down||r()<density*(dance?.8:.46))p[s]=note(down?0:(s%4===0?1:2),1,down?.85:.51);
      if(dance&&s+1<16&&r()<density*.46)p[s+1]=note(2,1,.38);
    }
  }
  return p;
}
export function makeSong(settings={}){
  const mood=MOODS[settings.mood]?settings.mood:'ballad';
  const mode=MODES[settings.mode]?settings.mode:MOODS[mood].mode;
  const seed=Number.isInteger(settings.seed)?settings.seed>>>0:Math.floor(Math.random()*0xffffffff);
  const song={
    id:settings.id||String(Date.now())+'-'+seed.toString(16).slice(0,5),
    title:typeof settings.title==='string'&&settings.title.trim()?settings.title.trim():'Баллада без названия',
    mood,mode,tempo:bound(Number(settings.tempo)||MOODS[mood].tempo,55,180),
    density:bound(Number.isFinite(settings.density)?settings.density:.56,0,1),
    seed,tracks:[]
  };
  song.tracks=INSTRUMENTS.map((inst,i)=>({
    id:inst.id,on:settings.activeTracks?settings.activeTracks.includes(inst.id):i<5,
    level:inst.level,
    patterns:SECTIONS.map((_,s)=>makePattern(inst.id,s,song,(seed+i*509+s*7919)>>>0))
  }));
  return song;
}
export function regenerate(song,trackId=null,sectionIndex=null){
  const next=structuredClone(song);next.seed=(next.seed+0x9e3779b9)>>>0;
  next.tracks.forEach((t,i)=>{
    if(trackId&&t.id!==trackId)return;
    t.patterns=t.patterns.map((p,s)=>sectionIndex!==null&&s!==sectionIndex?p:makePattern(t.id,s,next,(next.seed+i*509+s*7919)>>>0));
  });
  return next;
}
export function validSong(s){
  return !!(s&&typeof s.id==='string'&&s.id.length<120&&typeof s.title==='string'&&s.title.length<180&&
    MOODS[s.mood]&&MODES[s.mode]&&Number.isFinite(s.tempo)&&s.tempo>=55&&s.tempo<=180&&Number.isFinite(s.density)&&s.density>=0&&s.density<=1&&
    Array.isArray(s.tracks)&&s.tracks.length===INSTRUMENTS.length&&
    s.tracks.every((t,i)=>t.id===INSTRUMENTS[i].id&&typeof t.on==='boolean'&&Number.isFinite(t.level)&&t.level>=0&&t.level<=1&&
      Array.isArray(t.patterns)&&t.patterns.length===SECTIONS.length&&t.patterns.every(p=>Array.isArray(p)&&p.length===STEPS&&p.every(n=>n===null||(Number.isInteger(n.d)&&n.d>=0&&n.d<=14&&Number.isInteger(n.len)&&n.len>=1&&n.len<=16&&Number.isFinite(n.v)&&n.v>=.25&&n.v<=1)))));
}
export function totalSteps(){return SECTIONS.reduce((n,s)=>n+s.bars*8,0)}
export function buildEvents(song){
  const result=[];let offset=0;
  SECTIONS.forEach((section,s)=>{
    for(let bar=0;bar<section.bars;bar++){
      song.tracks.forEach((track)=>{
        if(!track.on||track.level===0)return;
        for(let local=0;local<8;local++){
          const step=(bar%2)*8+local,n=track.patterns[s][step];
          if(!n)continue;
          // In the quieter bookends, keep each part but leave room between entries.
          if((s===0||s===3)&&(track.id==='flute'||track.id==='drum')&&bar%2===0)continue;
          result.push({track:track.id,midi:track.id==='drum'?[36,38,42][Math.min(2,n.d)]:degreeToMidi(n.d,song.mode),
            at:offset+bar*8+local,len:Math.min(n.len,section.bars*8-bar*8-local),velocity:n.v*track.level});
        }
      });
    }
    offset+=section.bars*8;
  });
  result.sort((a,b)=>a.at-b.at);
  return result.filter(e=>e.len>0);
}
export function stepSeconds(song){return 30/song.tempo}
export function durationSeconds(song){return totalSteps()*stepSeconds(song)}
export function noteFrequency(midi){return 440*Math.pow(2,(midi-69)/12)}
function drumVoice(ctx,midi,at,level,out){
  const length=.16,buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*length),ctx.sampleRate),data=buffer.getChannelData(0);
  let z=(midi*1729+Math.floor(at*1000))>>>0;
  for(let i=0;i<data.length;i++){z=(1664525*z+1013904223)>>>0;data[i]=(z/2147483648-1);}
  const src=ctx.createBufferSource();src.buffer=buffer;
  const filter=ctx.createBiquadFilter();filter.type=midi===36?'lowpass':'highpass';filter.frequency.value=midi===36?220:900;
  const gain=ctx.createGain();gain.gain.setValueAtTime(Math.max(.0001,level*.14),at);gain.gain.exponentialRampToValueAtTime(.0001,at+length);
  src.connect(filter);filter.connect(gain);gain.connect(out);src.start(at);src.stop(at+length);
}
export function synth(ctx,kind,midi,time,duration,velocity=1,out=ctx.destination){
  const at=Math.max(time,ctx.currentTime+.003),level=bound(velocity,0,1);
  if(kind==='drum'){drumVoice(ctx,midi,at,level,out);return}
  const f=noteFrequency(midi);
  const isBowed=kind==='vielle'||kind==='hurdy';
  const attack=isBowed?.08:kind==='flute'?.06:.009;
  const release=isBowed?.26:kind==='flute'?.14:.21;
  const hold=Math.max(.08,duration);
  const gain=ctx.createGain(),filter=ctx.createBiquadFilter();
  filter.type='lowpass';
  filter.frequency.value=kind==='vielle'?1800:kind==='hurdy'?850:kind==='lute'?2200:kind==='harp'?2900:2400;
  filter.Q.value=kind==='hurdy'?.7:.35;
  gain.gain.setValueAtTime(.0001,at);
  const peak=(kind==='hurdy'?.095:kind==='vielle'?.12:kind==='lute'?.20:kind==='harp'?.16:.11)*level;
  gain.gain.linearRampToValueAtTime(Math.max(.0002,peak),at+attack);
  if(isBowed||kind==='flute'){
    gain.gain.setValueAtTime(peak*.8,at+Math.max(attack,hold));
  }else{
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,peak*.15),at+Math.max(attack+.025,hold));
  }
  gain.gain.exponentialRampToValueAtTime(.0001,at+hold+release);
  filter.connect(gain);gain.connect(out);
  const definitions=kind==='vielle'?[['sawtooth',1,0,.75],['triangle',2,3,.27]]:
    kind==='hurdy'?[['sawtooth',1,0,.6],['triangle',.5,0,.5]]:
    kind==='lute'?[['triangle',1,0,.9],['sine',2,0,.28]]:
    kind==='harp'?[['sine',1,0,.93],['triangle',2,0,.25]]:
    [['sine',1,0,.92],['triangle',2,0,.12]];
  definitions.forEach(([type,mul,detune,amount])=>{
    const osc=ctx.createOscillator(),mix=ctx.createGain();osc.type=type;osc.frequency.value=f*mul;osc.detune.value=detune;mix.gain.value=amount;
    osc.connect(mix);mix.connect(filter);osc.start(at);osc.stop(at+hold+release+.025);
  });
}
function sequenceEvents(song){const s=stepSeconds(song);return buildEvents(song).map(e=>({...e,start:e.at*s,duration:e.len*s*.89}))}
export function playEvent(ctx,event,when,out){synth(ctx,event.track,event.midi,when,event.duration,event.velocity,out)}
export function schedulePreview(ctx,track,midi){synth(ctx,track,midi,ctx.currentTime+.008,.28,.62)}
function wavHeader(view,frames,rate){
  const dataSize=frames*4;
  function put(at,s){for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i))}
  put(0,'RIFF');view.setUint32(4,36+dataSize,true);put(8,'WAVE');put(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
  view.setUint32(24,rate,true);view.setUint32(28,rate*4,true);view.setUint16(32,4,true);
  view.setUint16(34,16,true);put(36,'data');view.setUint32(40,dataSize,true);
}
export async function renderWav(song){
  const rate=32000,frames=Math.ceil((durationSeconds(song)+1.3)*rate);
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline)throw Error('На этом устройстве нет OfflineAudioContext.');
  const ctx=new Offline(2,frames,rate);
  const master=ctx.createGain();master.gain.value=.78;master.connect(ctx.destination);
  const events=sequenceEvents(song);
  events.forEach(e=>playEvent(ctx,e,e.start+.015,master));
  const buffer=await ctx.startRendering();
  const bytes=new ArrayBuffer(44+frames*4),view=new DataView(bytes);
  wavHeader(view,frames,rate);
  const left=buffer.getChannelData(0),right=buffer.getChannelData(1);
  for(let i=0;i<frames;i++){
    view.setInt16(44+i*4,Math.round(bound(left[i],-1,1)*32767),true);
    view.setInt16(46+i*4,Math.round(bound(right[i],-1,1)*32767),true);
  }
  return new Blob([bytes],{type:'audio/wav'});
}
function vlen(n){let a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a}
function chunk(type,data){const len=data.length;return [...type.split('').map(c=>c.charCodeAt(0)),(len>>>24)&255,(len>>>16)&255,(len>>>8)&255,len&255,...data]}
export function renderMidi(song){
  const ppq=480,ticksPerStep=240,micro=Math.round(60000000/song.tempo);
  const header=[77,84,104,100,0,0,0,6,0,1,0,7,1,224];
  const meta=[0,255,81,3,(micro>>>16)&255,(micro>>>8)&255,micro&255,0,255,47,0];
  const blocks=[chunk('MTrk',meta)];
  const events=buildEvents(song);
  INSTRUMENTS.forEach((inst,i)=>{
    const channel=i===5?9:i;
    const raw=[{t:0,priority:0,data:[0xC0|channel,inst.midi]}];
    events.filter(e=>e.track===inst.id).forEach(e=>{
      const at=e.at*ticksPerStep,off=at+Math.max(45,Math.round(e.len*ticksPerStep*.89));
      raw.push({t:at,priority:2,data:[0x90|channel,e.midi,Math.round(bound(e.velocity,.1,1)*115)]});
      raw.push({t:off,priority:1,data:[0x80|channel,e.midi,0]});
    });
    raw.sort((a,b)=>a.t-b.t||a.priority-b.priority);
    let previous=0,data=[];
    raw.forEach(x=>{data.push(...vlen(x.t-previous),...x.data);previous=x.t});
    data.push(0,255,47,0);
    blocks.push(chunk('MTrk',data));
  });
  return new Blob([new Uint8Array([...header,...blocks.flat()])],{type:'audio/midi'});
}
