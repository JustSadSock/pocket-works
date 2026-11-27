// VCSL dedicated release laboratory; source identity is pinned and verified.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareRecordedNote} from './recorded-instruments.mjs';
import {prepareDedicatedRelease} from './recorded-release.mjs';
import {renderRecordedPerformance} from './recorded-performance.mjs';
const root=path.resolve(process.argv[2]??'.audio-dedicated-release'),SR=48000;
mkdirSync(path.join(root,'sources'),{recursive:true});
const revision='c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e',repo='https://github.com/sgossner/VCSL',dir='Aerophones/Edge-blown Aerophones/Ocarina, Typical';
// Upstream labels use a different octave convention; both body and release must pass independent pitch admission.
const pins=[
 [74,'D4','f5b0f1c2d30b26cd52520280bcf81b67256f2884','7921483087a860e641ce575d58850cd621409e8f'],
 [76,'E4','dc938241a8c5f00ec53ce79c1ed0b9e77dc16db0','fb15e7e9e194b360cc45df1463218ed23c97bc13'],
 [81,'A4','70b4d1c20c7acdce9e2405faafa1d0a285cfed2e','f40a8907492f1236e001c0e9be9dc36b57f5ae5e'],
 [84,'C5','7568769951199353ab174baaab3491c41f43bf06','1121a0316fd71fcd6246a4509874aa3333c0cb6c']
];
const sha=b=>createHash('sha256').update(b).digest('hex');
function acquire(relative,blob,file){
 const url='https://raw.githubusercontent.com/sgossner/VCSL/'+revision+'/'+relative.split('/').map(encodeURIComponent).join('/');
 const b=execFileSync('curl',['--fail','--silent','--show-error','--proto','=https','--max-time','45','--retry','2','--max-filesize','16777216',url],{maxBuffer:16777216});
 if(createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')!==blob)throw Error('VCSL pinned blob mismatch '+relative);
 writeFileSync(path.join(root,file),b);
 return {path:file,upstreamPath:relative,blob,sha256:sha(b),url:repo+'/blob/'+revision+'/'+relative.split('/').map(encodeURIComponent).join('/')};
}
const license=acquire('LICENSE','0e259d42c996742e9e3cba14c677129b2c1b6311','LICENSE');
function decode(file){
 const raw=execFileSync('sox',['-R','-v','.8',path.join(root,file),'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-'],{maxBuffer:12*1024*1024});
 if(!raw.length||raw.length%4)throw Error('Invalid dedicated source PCM');
 const a=new Float32Array(raw.length/4);for(let i=0;i<a.length;i++)a[i]=raw.readFloatLE(i*4);return a;
}
const zones=[],releaseBank=[],pairs=[],metrics=[];
for(const [midi,note,bodyBlob,releaseBlob] of pins){
 const body=acquire(dir+'/Sustains/Sus/StdOcarina_Sus_'+note+'.wav',bodyBlob,'sources/ocarina-'+note+'-body.wav');
 const tail=acquire(dir+'/Releases/Sus/StdOcarina_Sus_'+note+'_rel.wav',releaseBlob,'sources/ocarina-'+note+'-release.wav');
 const z={...prepareRecordedNote(decode(body.path).slice(0,12*SR),midi),id:'vcsl-ocarina-'+note.toLowerCase(),instrument:'ocarina',articulation:'sustain',velocity:.65,variant:1,sourceSha256:body.sha256};
 const r=prepareDedicatedRelease(decode(tail.path),z,{id:z.id+'-release',expectedMidi:midi,instrument:z.instrument,articulation:z.articulation,bodySha256:body.sha256,sha256:tail.sha256});
 const {samples,...receipt}=r;zones.push(z);releaseBank.push(r);pairs.push({midi,upstreamLabel:note,bodyMeasuredMidi:z.measuredMidi,body,tail,receipt});
}
function write(file,a){
 const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);
 let e=0,peak=0;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i])||Math.abs(a[i])>=1)throw Error('Invalid audition');peak=Math.max(peak,Math.abs(a[i]));e+=a[i]**2;b.writeInt16LE(Math.round(a[i]*32767),44+2*i);}
 if(peak<1e-7)throw Error('Silent audition');
 writeFileSync(path.join(root,file),b);const m={file,sha256:sha(b),frames:a.length,channels:1,peak,rms:Math.sqrt(e/a.length)};metrics.push(m);return m;
}
function compare(name,notes,seconds){
 const opts={zones,instrument:'ocarina',seconds};
 const dry=renderRecordedPerformance({...opts,notes:notes.map(({release,...n})=>n)});
 const wet=renderRecordedPerformance({...opts,notes,releaseBank});
 const count=notes.filter(n=>n.release==='recorded').length;
 const receipts=wet.choices.filter(c=>c.release);
 if(receipts.length!==count||receipts.some(c=>c.release.kind!=='dedicated-release-asset'||c.release.boundaryStep>.15)||dry.samples.every((x,i)=>x===wet.samples[i]))throw Error('Dedicated release branch not exercised');
 const a=write(name+'-control.wav',dry.samples),b=write(name+'-dedicated.wav',wet.samples),target=Math.min(a.rms,b.rms),gap=33600,out=new Float32Array(dry.samples.length*2+gap);
 for(const [i,r] of [dry,wet].entries())for(let j=0;j<r.samples.length;j++)out[(i?dry.samples.length+gap:0)+j]=r.samples[j]*target/[a,b][i].rms;
 write(name+'-AB.wav',out);
 return {file:name+'-AB.wav',secondStarts:seconds+.7,choices:wet.choices,releaseCount:count};
}
const note=(midi,start,duration,pressure,connected=false,release=true)=>({midi,start,duration,pressure,articulation:'sustain',connected,...(release?{release:'recorded'}:{})});
const isolated=compare('ocarina-release-study',pins.map(([m],i)=>note(m,i*2.4,.7,.68)),10);
// Original melody in D minor; only qualified roots used, phrase endings separated.
const melody=[[62,64,69],[72,69,64],[62,69,72],[69,64,62],[64,69,72],[72,69,64],[69,64,69],[64,62,62]];
const score=melody.flatMap((p,i)=>p.map((m,j)=>note(m+12,i*3+j*.55,j===2?.7:.55,[.58,.62,.70,.64,.73,.68,.62,.52][i],j>0,j===2)));
const piece=compare('clay-and-wind',score,24);
if(metrics.length!==6||pairs.length!==4)throw Error('Dedicated audition inventory mismatch');
writeFileSync(path.join(root,'metrics.json'),JSON.stringify({approval:'research-only',library:'VCSL',revision,license:{spdx:'CC0-1.0',...license},pairs,comparisons:[isolated,piece],metrics,intervalTransitionCoverage:0},null,2)+'\n');
