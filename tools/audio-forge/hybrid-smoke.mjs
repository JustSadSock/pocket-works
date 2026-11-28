// Generate an original synthetic fixture, never imply that it is a field recording.
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {renderPhysics} from './foundation.mjs';
const dir=path.resolve(process.argv[2]??'.audio-forge-hybrid');
mkdirSync(dir,{recursive:true});
const {samples,sampleRate}=renderPhysics({model:'explosion',seed:9123,strength:.78});
const data=Buffer.alloc(44+samples.length*2);
data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(sampleRate,24);data.writeUInt32LE(sampleRate*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(samples.length*2,40);
for(let i=0;i<samples.length;i++)data.writeInt16LE(Math.round(samples[i]*32767),44+i*2);
writeFileSync(path.join(dir,'fixture.wav'),data);
const manifest={version:2,samples:[{id:'synthetic-explosion',path:'fixture.wav',license:'original',creator:'Pocket Works Sound Forge',title:'Synthetic explosion fixture',provenance:'renderPhysics explosion seed 9123; original algorithm, not a recording',redistribution:true,sha256:createHash('sha256').update(data).digest('hex'),tags:['synthetic','explosion']}],jobs:[{name:'explosion-dry',type:'physics',model:'explosion',seed:111,strength:.65,output:'generated/explosion-dry.wav'},...([.25,.5,.75,1].map(sampleMix=>({name:'hybrid-'+Math.round(sampleMix*100),type:'hybrid',model:'explosion',seed:111,strength:.65,sampleId:'synthetic-explosion',sampleMix,output:'generated/hybrid-'+Math.round(sampleMix*100)+'.wav'})))],families:[]};
writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
