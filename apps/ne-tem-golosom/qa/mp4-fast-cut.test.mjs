import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fastCutMP4} from '../mp4-fast-cut.js';

const available=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0 &&
 spawnSync('ffprobe',['-version'],{stdio:'ignore'}).status===0;
const cmd=(bin,args)=> {
 const r=spawnSync(bin,args,{encoding:'utf8'});
 if(r.status!==0)throw Error(bin+' failed: '+r.stderr);
 return r.stdout;
};
const inspect=path=>JSON.parse(cmd('ffprobe',['-v','error','-show_entries','format=duration,size:stream=codec_name,codec_type','-of','json',path]));
test('AVC/AAC MP4 smart cut preserves decodable video/audio and respects scene length',
 {skip:!available},async t=>{
  const dir=await mkdtemp(join(tmpdir(),'pocket-fastcut-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const source=join(dir,'source.mp4');
  cmd('ffmpeg',['-hide_banner','-loglevel','error',
   '-f','lavfi','-i','color=c=blue:s=64x64:r=5',
   '-f','lavfi','-i','sine=frequency=440:sample_rate=44100',
   '-t','4','-c:v','libx264','-preset','ultrafast','-crf','38',
   '-g','5','-pix_fmt','yuv420p','-c:a','aac','-b:a','12k','-movflags','+faststart','-y',source]);
  const original=await readFile(source),blob=new Blob([original],{type:'video/mp4'});
  for(const [label,keepAudio] of [['sound',true],['mute',false]]){
   const result=await fastCutMP4({blob,start:1,duration:2,keepAudio});
   assert.ok(result instanceof Blob,label+' returns a Blob');
   assert.equal(result.type,'video/mp4');
   assert.ok(result.size<original.length,label+' outputs less data than original');
   const target=join(dir,label+'.mp4');
   await writeFile(target,new Uint8Array(await result.arrayBuffer()));
   const meta=inspect(target);
   assert.ok(Math.abs(Number(meta.format.duration)-2)<0.15,'requested duration');
   assert.equal(meta.streams.filter(x=>x.codec_type==='video').length,1);
   assert.equal(meta.streams.filter(x=>x.codec_type==='audio').length,keepAudio?1:0);
   cmd('ffmpeg',['-v','error','-i',target,'-f','null','-']);
  }
  assert.equal(await fastCutMP4({blob,start:1,duration:2,keepAudio:false,signal:{aborted:true}}),null);
  assert.equal(await fastCutMP4({blob:new Blob(['garbage']),start:1,duration:2,keepAudio:false}),null);
});
test('lossless copy handles H.264 B-frames, arbitrary seek and edit-list offsets',
 {skip:!available},async t=>{
  const dir=await mkdtemp(join(tmpdir(),'pocket-bframe-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const source=join(dir,'source.mp4');
  cmd('ffmpeg',['-hide_banner','-loglevel','error',
   '-f','lavfi','-i','testsrc2=size=160x90:rate=30',
   '-f','lavfi','-i','sine=frequency=330:sample_rate=48000',
   '-t','5','-c:v','libx264','-preset','veryfast','-crf','28',
   '-g','60','-pix_fmt','yuv420p','-c:a','aac','-b:a','48k',
   '-movflags','+faststart','-y',source]);
  const blob=new Blob([await readFile(source)],{type:'video/mp4'});
  for(const start of [0.2,1.4,2.7]){
   const result=await fastCutMP4({blob,start,duration:1.3,keepAudio:true});
   assert.ok(result,'fast cutter supports B-frames at '+start);
   const target=join(dir,'cut-'+start+'.mp4');
   await writeFile(target,new Uint8Array(await result.arrayBuffer()));
   assert.ok(Math.abs(Number(inspect(target).format.duration)-1.3)<0.15);
   cmd('ffmpeg',['-v','error','-i',target,'-f','null','-']);
  }
});
test('UI can use lossless copy only when export settings preserve original resolution',()=>{
 const code=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(code,/import \{fastCutMP4\} from '\.\/mp4-fast-cut\.js'/);
 assert.match(code,/if\(canUseLosslessCut\(\)&&\['original','mute'\]\.includes\(selectedSound\(\)\)\)/);
 assert.match(code,/if\(!result\)\{/);
 assert.match(code,/result=await exportVideo\(/);
});
