import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 STUDY_METHODS,researchMethod,subtractResidualVocals,wavMetadata,decodeWav,resamplePCM,channelSummary,
 multichannelME,stereoPCM,sumMusicEffects,matchResultToSegment,comparisonMetrics,comparisonRecord
} from '../research-core.js';
import {wavPCM16} from '../audio-utils.js';
const pcm=(freq,frames=8000,rate=8000,vol=.25)=>Float32Array.from({length:frames},(_,i)=>vol*Math.sin(i*2*Math.PI*freq/rate));
function pcmWav(channels,rate=8000){
 const frames=channels[0].length,n=channels.length,bytes=44+frames*n*2;
 const b=new ArrayBuffer(bytes),v=new DataView(b),name=(a,s)=>[...s].forEach((c,i)=>v.setUint8(a+i,c.charCodeAt(0)));
 name(0,'RIFF');v.setUint32(4,bytes-8,true);name(8,'WAVE');name(12,'fmt ');v.setUint32(16,16,true);
 v.setUint16(20,1,true);v.setUint16(22,n,true);v.setUint32(24,rate,true);v.setUint32(28,rate*n*2,true);
 v.setUint16(32,n*2,true);v.setUint16(34,16,true);name(36,'data');v.setUint32(40,bytes-44,true);
 let pos=44;
 for(let i=0;i<frames;i++)for(const c of channels){v.setInt16(pos,Math.round(Math.max(-1,Math.min(1,c[i]))*32767),true);pos+=2}
 return b;
}
test('model registry distinguishes local, channel, imported services (without pretending to execute them)',()=>{
 assert.deepEqual(STUDY_METHODS.filter(x=>x.type==='local').map(x=>x.id),['mrx','mrx-scnet']);
 assert.deepEqual(STUDY_METHODS.filter(x=>x.type==='surround').map(x=>x.id),['surround']);
 for(const id of ['dnr-scnet','dnr-ensemble','bandit','sam'])assert.equal(researchMethod(id)?.type,'import');
 assert.equal(researchMethod('fake'),null);
});
test('multichannel PCM WAV parser preserves six channels and known center energy',()=>{
 const N=8000;
 const tracks=[pcm(100,N),pcm(140,N),pcm(220,N,8000,.45),pcm(50,N),pcm(450,N),pcm(520,N)];
 const raw=pcmWav(tracks);
 const meta=wavMetadata(raw);
 assert.equal(meta.channels,6);assert.equal(meta.frames,N);assert.equal(meta.rate,8000);
 const decoded=decodeWav(raw);
 assert.equal(decoded.channels.length,6);
 const summary=channelSummary(decoded.channels,8000);
 assert(summary[2].rms>summary[0].rms);
 assert.equal(summary[2].label,'C');
 const result=multichannelME(decoded.channels,0);
 assert.equal(result.length,2);
 assert(Math.abs(result[0][173]-(.76*decoded.channels[0][173]+.52*decoded.channels[4][173]))<1e-6);
});
test('direct surround path removes center even when loud female voice is placed exclusively there',()=>{
 const a=pcm(210,8000),b=pcm(240,8000),female=pcm(1000,8000,8000,.7);
 const surround=[a,b,female,new Float32Array(8000),new Float32Array(8000),new Float32Array(8000)];
 const out=multichannelME(surround);
 assert(Math.abs(out[0][100]-.76*a[100])<1e-6);
 const withCenter=multichannelME(surround,1);
 assert(Math.abs(withCenter[0][101]-out[0][101])>.001);
 assert.throws(()=>multichannelME([a,b],0));
});
test('roundtrip stereo WAV and trim external full film to target selected seconds',async()=>{
 const left=pcm(220,4*8000),right=pcm(350,4*8000);
 const wav=await wavPCM16([left,right],8000).arrayBuffer();
 const decoded=decodeWav(wav);
 const matched=matchResultToSegment(decoded.channels,decoded.meta.rate,1,1,8000);
 assert.equal(matched.length,2);assert.equal(matched[0].length,8000);
 assert(Math.abs(matched[1][400]-right[8400])<.0001);
});
test('mix distinct music and effects stems, then emit honest objective comparison',()=>{
 const a=pcm(220,8000),b=pcm(450,8000),orig=[pcm(220,8000,8000,.6),pcm(450,8000,8000,.6)];
 const mixed=sumMusicEffects([a],[b]);
 assert.equal(mixed.length,2);
 assert(Math.abs(mixed[0][8]-(a[8]+b[8]))<1e-6);
 const metrics=comparisonMetrics(orig,mixed,8000);
 assert(Number.isFinite(metrics.changeDb));
 assert(Number.isFinite(metrics.removedRmsDb));
 const record=comparisonRecord('dnr-scnet',1,2500,metrics);
 assert.equal(record.realTimeFactor,2.5);
 assert.throws(()=>comparisonRecord('unknown',1,10,metrics));
});
test('invalid WAV and unmatched durations cannot silently replace clean audio',()=>{
 assert.throws(()=>decodeWav(new ArrayBuffer(50)),/WAV/);
 const wav=pcmWav([pcm(100,8000),pcm(200,8000)]);
 const decoded=decodeWav(wav);
 assert.throws(()=>matchResultToSegment(decoded.channels,8000,0,3,8000),/короче/);
 assert.throws(()=>decodeWav(wav,{start:99}),/пределами/);
});
test('browser app actually binds external imports to original video monitor and video export',()=>{
 const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(js,/registerStudyResult\('mrx'/);
 assert.match(js,/mixed=sumMusicEffects\(/);
 assert.match(js,/activeStudy/);
 assert.match(js,/if\(!activeStudy\|\|!range\|\|exporting\)return/);
 assert.match(js,/await selectStudyResult\(method\)/);
});

test('real SCNet vocal estimate is subtracted from the real MRX M&E, not from original',()=>{
 const me=[new Float32Array([.5,.25,.1])],vocals=[new Float32Array([.2,.1,.05])];
 const fixed=subtractResidualVocals(me,vocals,.8);
 assert(Math.abs(fixed[0][0]-.34)<1e-6);
 assert.deepEqual([...me[0]],[...new Float32Array([.5,.25,.1])]);
 assert.deepEqual([...subtractResidualVocals(me,vocals,0)[0]],[...me[0]]);
 assert.throws(()=>subtractResidualVocals(me,vocals,2),/0–100/);
});
test('specialist import stays closed by default, simple model choice drives inference',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(html,/<details id="study-advanced"/);
 assert.match(html,/value="scnet"/);
 assert.match(js,/if\(\$\('quality-mode'\)\.value==='scnet'\)/);
 assert.match(js,/await separate\(clean,Math\.min\(10/);
});
