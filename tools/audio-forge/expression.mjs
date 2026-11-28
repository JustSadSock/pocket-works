// Expressive MIDI control compiler. Controls are channel-wide, not per voice.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function number(n,min,max,label){
  if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw new Error('Invalid '+label);
  return n;
}
const CC={expression:11,breath:2,modulation:1};
export function compileExpression(track,notes,channel){
  const config=track.performance;
  if(config===undefined)return [];
  if(!config||typeof config!=='object'||Array.isArray(config))throw new Error('Invalid performance');
  const allowed=new Set(['curves','vibrato','attackBend']);
  for(const key of Object.keys(config))if(!allowed.has(key))throw new Error('Unknown performance property: '+key);
  const events=new Map(),ppq=480;
  function put(beat,key,value){
    const tick=Math.round(beat*ppq);
    const bytes=key==='bend'?[0xe0|channel,value&127,(value>>7)&127]:[0xb0|channel,CC[key],value];
    events.set(key+':'+tick,{tick,priority:0,bytes});
    if(events.size>100000)throw new Error('Performance exceeds event budget');
  }
  const end=Math.max(...notes.map(n=>n.beat+n.duration));
  const curves=config.curves??{};
  if(!curves||typeof curves!=='object'||Array.isArray(curves))throw new Error('Invalid curves');
  for(const [key,points] of Object.entries(curves)){
    if(!Object.hasOwn(CC,key)||!Array.isArray(points)||!points.length||points.length>2048)throw new Error('Invalid curve '+key);
    let prev=null;
    for(const p of points){
      if(!p||typeof p!=='object')throw new Error('Invalid curve point');
      const beat=number(p.beat,0,end+.001,'curve beat'),value=number(p.value,0,127,'curve value');
      if(prev&&beat<=prev.beat)throw new Error('Curve beats must increase');
      if(prev){
        const count=Math.ceil((beat-prev.beat)*32);
        if(count>100000||events.size+count>100000)throw new Error('Curve exceeds event budget');
        for(let i=1;i<count;i++){const t=i/count;put(prev.beat+(beat-prev.beat)*t,key,Math.round(prev.value+(value-prev.value)*t))}
      }
      put(beat,key,Math.round(value));prev={beat,value};
    }
  }
  if(config.vibrato!==undefined||config.attackBend!==undefined){
    if(notes.some((n,i)=>i&&n.beat<notes[i-1].beat+notes[i-1].duration-1e-7))throw new Error('Pitch expression requires non-overlapping monophonic notes');
    const v=config.vibrato??{depthCents:0,rateHz:5,delayBeats:0};
    const depth=number(v.depthCents,0,80,'vibrato depth');
    const rate=number(v.rateHz,1,9,'vibrato rate');
    const delay=number(v.delayBeats??.2,0,2,'vibrato delay');
    const attack=config.attackBend??{cents:0,durationBeats:.08};
    const cents=number(attack.cents,-100,100,'attack bend cents');
    const duration=number(attack.durationBeats,.02,.5,'attack bend duration');
    const tempo=number(track.tempo??100,20,300,'tempo');
    for(const n of notes){
      const count=Math.ceil(n.duration*60/tempo*100);
      if(count>100000||events.size+count>100000)throw new Error('Pitch expression exceeds event budget');
      const ticks=Math.round(n.beat*ppq),endTick=Math.round((n.beat+n.duration)*ppq);
      for(let i=0;i<count;i++){
        const t=n.duration*i/count, tick=Math.round((n.beat+t)*ppq);
        if(tick>=endTick)break;
        const ramp=clamp((t-delay)/.18,0,1)*clamp((n.duration-t)/.08,0,1);
        const bend=cents*Math.max(0,1-t/duration)**2+depth*ramp*Math.sin(2*Math.PI*rate*(t-delay)*60/tempo);
        put(tick/ppq,'bend',clamp(Math.round(8192+bend*8192/200),0,16383));
      }
      if(endTick>ticks)put(endTick/ppq,'bend',8192);
    }
  }
  const result=[...events.values()].sort((a,b)=>a.tick-b.tick);
  // Explicitly establish the +/-2 semitone range before the first bend.
  if(config.vibrato!==undefined||config.attackBend!==undefined){
    result.unshift(...[[101,0],[100,0],[6,2],[38,0],[101,127],[100,127]].map(([cc,value])=>({tick:0,priority:0,bytes:[0xb0|channel,cc,value]})));
  }
  return result;
}
