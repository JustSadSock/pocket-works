import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(process.argv[2]??'.audio-string-lab');
const m=JSON.parse(readFileSync(path.join(root,'string-metrics.json'),'utf8'));
const frames=m.arrangement.frames,control='river-crossing-gm-aligned.wav';
const sox=args=>execFileSync('sox',['-R',...args]);
sox([path.join(root,'river-crossing-gm.wav'),'-r','48000','-c','2','-b','16',path.join(root,control),'pad','0',frames+'s','trim','0',frames+'s','fade','t','.005','0','.05']);
function metric(file){
 const b=readFileSync(path.join(root,file));
 const pcm=execFileSync('sox',['-R',path.join(root,file),'-t','raw','-e','floating-point','-b','32','-L','-','rate','48000','channels','2'],{maxBuffer:32*1024*1024});
 if(pcm.length!==frames*8)throw Error('Wrong string comparison grid');
 let peak=0,energy=0;
 for(let i=0;i<pcm.length;i+=4){const v=pcm.readFloatLE(i);if(!Number.isFinite(v))throw Error('Bad PCM');peak=Math.max(peak,Math.abs(v));energy+=v*v;}
 if(peak>=.999||energy<=0)throw Error('Invalid audition');
 return {file,sha256:createHash('sha256').update(b).digest('hex'),frames,peak,rms:Math.sqrt(energy/(pcm.length/4))};
}
const pair=[metric(control),metric(m.arrangement.file)],target=Math.min(...pair.map(p=>p.rms)),gains=pair.map(p=>target/p.rms);
for(let i=0;i<2;i++)sox([path.join(root,pair[i].file),path.join(root,'ab-'+i+'.wav'),'vol',String(gains[i])]);
sox(['-n','-r','48000','-c','2','-b','16',path.join(root,'gap.wav'),'trim','0','.7']);
const name='river-crossing-AB.wav';
sox([path.join(root,'ab-0.wav'),path.join(root,'gap.wav'),path.join(root,'ab-1.wav'),path.join(root,name)]);
for(const f of ['ab-0.wav','ab-1.wav','gap.wav'])rmSync(path.join(root,f));
m.comparison={files:pair,file:name,order:['general-midi','physical-string'],gains,secondStarts:frames/48000+.7,sha256:createHash('sha256').update(readFileSync(path.join(root,name))).digest('hex')};
writeFileSync(path.join(root,'string-metrics.json'),JSON.stringify(m,null,2)+'\n');
