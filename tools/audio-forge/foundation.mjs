// Universal Sound Forge 0.1 — deterministic, sample-free production primitives.
const TAU = 2 * Math.PI;
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function bounded(value, fallback, min, max, label) {
  const n = value ?? fallback;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error('Invalid '+label);
  return n;
}
const models = new Set(['sword', 'shield', 'glass', 'explosion', 'rain']);
export function expandManifest(manifest) {
  if (!manifest || ![1,2].includes(manifest.version) || !Array.isArray(manifest.jobs)) throw new Error('Invalid audio manifest');
  if (manifest.version === 1) return manifest.jobs;
  const jobs = [...manifest.jobs];
  const ids = new Set();
  if (manifest.families !== undefined && !Array.isArray(manifest.families)) throw new Error('families must be an array');
  for (const f of manifest.families ?? []) {
    if (!f || typeof f.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(f.id) || ids.has(f.id)) throw new Error('Invalid or duplicate family id');
    ids.add(f.id);
    if (!models.has(f.model)) throw new Error('Unknown family model: '+f.model);
    if (f.source !== undefined && f.source !== 'original') throw new Error('External samples are not supported by foundation');
    const count = bounded(f.variants, 8, 2, 32, 'variants');
    const seed = bounded(f.seed, 42, 0, 0xffffffff, 'seed');
    if (!Number.isInteger(count) || !Number.isInteger(seed)) throw new Error('Expected integer variants and seed');
    const output = f.outputDir;
    if (typeof output !== 'string' || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(output)) throw new Error('Invalid outputDir');
    const format = f.format ?? 'ogg';
    if (!['wav','ogg'].includes(format)) throw new Error('Invalid family format');
    const strength = bounded(f.strength, .65, .1, 1, 'strength');
    const spread = bounded(f.spread, .18, 0, .4, 'spread');
    const hybrid = f.sampleId !== undefined || f.sampleMix !== undefined;
    if (hybrid && (typeof f.sampleId !== 'string' || typeof f.sampleMix !== 'number' || !Number.isFinite(f.sampleMix) || f.sampleMix < 0 || f.sampleMix > 1)) throw new Error('Invalid family hybrid recipe');
    const random = rng(seed);
    for (let i=0;i<count;i++) {
      const name = f.id+'-'+String(i+1).padStart(2,'0');
      jobs.push({name,type:hybrid?'hybrid':'physics',...(hybrid?{sampleId:f.sampleId,sampleMix:f.sampleMix}:{}),model:f.model,seed:Math.floor(random()*4294967296),strength:Math.max(.1,Math.min(1,strength+(random()*2-1)*spread)),duration:f.duration,output:output+'/'+name+'.'+format,post:{...f.post}});
    }
  }
  if (jobs.length > 512) throw new Error('Manifest exceeds 512 jobs');
  const outputs = new Set();
  const names = new Set();
  for (const j of jobs) {
    if (!j || typeof j.output !== 'string' || outputs.has(j.output)) throw new Error('Missing or duplicate output');
    outputs.add(j.output);
    if (typeof j.name !== 'string' || names.has(j.name)) throw new Error('Missing or duplicate job name');
    names.add(j.name);
  }
  return jobs;
}
// Rendering is dry: room acoustics belong to runtime or explicit post processing.
export function renderPhysics(job) {
  if (!models.has(job.model)) throw new Error('Unknown physics model');
  const sr = 48000;
  const dur = bounded(job.duration, ({sword:.65,shield:.5,glass:1.3,explosion:2.4,rain:6})[job.model],.08,20,'duration');
  const strength = bounded(job.strength,.65,.1,1,'strength');
  const r = rng(bounded(job.seed,42,0,0xffffffff,'seed'));
  const frames = Math.round(dur*sr), out = new Float32Array(frames*2);
  function add(i,v,pan=0) {
    if (i<0 || i>=frames) return;
    out[i*2] += v*Math.sqrt((1-pan)/2);
    out[i*2+1] += v*Math.sqrt((1+pan)/2);
  }
  function burst(at,len,amp,lo,hi,pan,decay=5) {
    const start=Math.round(at*sr), n=Math.round(len*sr);
    const a=1-Math.exp(-TAU*lo/sr), b=1-Math.exp(-TAU*hi/sr);
    let l=0,h=0;
    for(let i=0;i<n && start+i<frames;i++){
      const w=r()*2-1;l+=a*(w-l);h+=b*(w-h);
      const env=Math.min(1,i/12)*Math.exp(-decay*i/n);
      add(start+i,(h-l)*env*amp,pan);
    }
  }
  function ring(at,freq,len,amp,pan,decay=6,glide=0){
    const start=Math.round(at*sr), n=Math.round(len*sr);
    let phase=r()*TAU;
    for(let i=0;i<n && start+i<frames;i++){
      const t=i/sr;phase+=TAU*freq*(1+glide*t/len)/sr;
      add(start+i,amp*Math.sin(phase)*Math.min(1,i/18)*Math.exp(-decay*i/n),pan);
    }
  }
  const shift=(.87+r()*.26)*(.85+.2*strength);
  if(job.model==='sword'||job.model==='shield'){
    const sword=job.model==='sword';
    burst(.002,.026,.95,900,15500,0,6);
    burst(.008,.13,.48,1800,12500,.15,5);
    for(const f of (sword?[1730,2780,4210,5830,8110,10900]:[170,520,1380,2650,4200])){
      ring(.002,f*shift,.12+r()*.28,(sword?.11:.075)*(.6+r()*.8),r()*.6-.3,7);
    }
    burst(.006,.12,sword?.11:.55,65,850,0,6);
    if(sword) for(let i=0;i<8;i++) burst(.025+i*.009,.021,.11,2600,14500,.2,4);
  } else if(job.model==='glass'){
    burst(.002,.025,.8,700,15000,0,4);
    for(let k=0;k<65;k++){
      const at=.007+Math.pow(r(),2)*dur*.72, pan=r()*1.8-.9, amp=(.1+r()*.25)*Math.exp(-3*at/dur);
      burst(at,.016+r()*.036,amp,1600,16500,pan,4);
      ring(at,2200+r()*9200,.04+r()*.13,amp*.55,pan,7);
    }
  } else if(job.model==='explosion'){
    burst(.002,.13,1.5,50,13500,0,6);
    burst(.008,.9,1.8,18,220,0,4);
    burst(.025,1.1,1.1,110,2500,0,4);
    for(let i=0;i<28;i++) burst(.03+r()*Math.min(dur*.7,1.1),.05+r()*.12,.25*r(),200,8000,r()*1.7-.85,5);
  } else {
    for(let i=0;i<frames;i++) {
      // Continuous, unpitched rain bed with independent droplets.
      const w=r()*2-1;add(i,w*.045,0);
    }
    for(let i=0;i<Math.ceil(dur*220);i++) burst(r()*dur,.012+r()*.035,.07+r()*.13,500,9000,r()*1.9-.95,5);
  }
  let peak=0;
  for(let i=0;i<frames;i++){
    const fade=Math.min(1,i/96,(frames-1-i)/(job.model==='rain'?2400:960));
    for(let c=0;c<2;c++){const k=i*2+c;out[k]*=fade;peak=Math.max(peak,Math.abs(out[k]));}
  }
  if(!Number.isFinite(peak)||peak<=0) throw new Error('Silent or invalid synthesis');
  const gain=(.38+.5*strength)/peak;
  for(let i=0;i<out.length;i++) out[i]*=gain;
  out[0]=out[1]=out[out.length-2]=out[out.length-1]=0;
  return {samples:out,sampleRate:sr,channels:2};
}
function pitchKey(note){
  if (typeof note === 'number' && Number.isInteger(note) && note>=0 && note<=127) return note;
  const m=/^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(note));
  if(!m) throw new Error('Invalid note');
  const key=(Number(m[3])+1)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[m[1].toUpperCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0);
  if(key<0||key>127) throw new Error('Out-of-range note');
  return key;
}
// Opt-in expressive MIDI arrangement. Legacy flat notes remain untouched.
export function arrangeTracks(job){
  if(!Array.isArray(job.tracks)||!job.tracks.length||job.tracks.length>15) throw new Error('Expected 1–15 music tracks');
  const seed=bounded(job.seed,42,0,0xffffffff,'seed'), used=new Set();
  if (!Number.isInteger(seed)) throw new Error('Expected integer music seed');
  return job.tracks.map((track,index)=>{
    const channel=bounded(track.channel,index<9?index:index+1,0,15,'channel');
    const program=bounded(track.program,0,0,127,'program');
    if(!Number.isInteger(channel)||!Number.isInteger(program)||used.has(channel)||channel===9) throw new Error('Invalid or shared melodic channel');
    used.add(channel);
    const r=rng((seed+Math.imul(index+1,2654435761))>>>0);
    const timing=bounded(track.humanizeBeats,.012,0,.06,'humanizeBeats');
    const dynamic=bounded(track.humanizeVelocity,5,0,15,'humanizeVelocity');
    const legato=bounded(track.legato,0,0,.12,'legato');
    if(!Array.isArray(track.notes)||!track.notes.length||track.notes.length>10000) throw new Error('Invalid track notes');
    const sorted=track.notes.map(n=>({...n,note:pitchKey(n.note),beat:bounded(n.beat,0,0,10000,'beat'),duration:bounded(n.duration,1,.02,1000,'duration'),velocity:bounded(n.velocity,80,1,127,'velocity')})).sort((a,b)=>a.beat-b.beat);
    // Legato is explicit and monophonic: never overlap a repeated pitch.
    if(legato&&sorted.some((n,i)=>i>0&&n.beat<sorted[i-1].beat+sorted[i-1].duration-1e-7)) throw new Error('Legato track must be monophonic');
    const notes=sorted.map(n=>({...n,channel,beat:Math.max(0,n.beat+(r()*2-1)*timing),velocity:Math.round(Math.max(1,Math.min(127,n.velocity+(r()*2-1)*dynamic)))}));
    if(legato) for(let i=0;i<notes.length-1;i++){
      const n=notes[i],next=notes[i+1], gap=sorted[i+1].beat-sorted[i].beat-sorted[i].duration;
      const touch=gap<=.025;
      const overlap=touch&&pitchKey(n.note)!==pitchKey(next.note)?legato:0;
      n.duration=Math.max(.02,Math.min(touch?next.beat-n.beat+overlap:n.duration,next.beat-n.beat+overlap));
    }
    const controls=[[7,bounded(track.volume,100,0,127,'volume')],[10,bounded(track.pan,64,0,127,'pan')],[11,bounded(track.expression,110,0,127,'expression')],[1,bounded(track.modulation,0,0,127,'modulation')]];
    return {channel,program,notes,controls:controls.map(([cc,v])=>[cc,Math.round(v)])};
  });
}
