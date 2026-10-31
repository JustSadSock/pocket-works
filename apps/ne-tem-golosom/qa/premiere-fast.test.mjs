import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fastDubMP4,inspectFastDubMP4} from '../mp4-fast-cut.js';
import {supportsFastPremiere,renderPremiereFast} from '../premiere-fast.js';

const hasTools=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{stdio:'ignore'}).status===0);
function run(bin,args){
 const result=spawnSync(bin,args,{encoding:'utf8'});
 if(result.status!==0)throw Error(bin+': '+result.stderr);
 return result.stdout;
}
const U32=(v,p)=>v.getUint32(p),STR=(v,p)=>String.fromCharCode(...new Uint8Array(v.buffer,v.byteOffset+p,4));
function boxes(v,start=0,end=v.byteLength){
 const out=[];for(let p=start;p+8<=end;){
  const size=U32(v,p);if(size<8||p+size>end)break;
  out.push({type:STR(v,p+4),start:p,body:p+8,end:p+size});p+=size;
 }return out;
}
const sub=(v,b,type)=>boxes(v,b.body,b.end).find(x=>x.type===type);
function sampleAudio(blob){
 const v=new DataView(blob.buffer,blob.byteOffset,blob.byteLength);
 const moov=boxes(v).find(x=>x.type==='moov');
 const trak=boxes(v,moov.body,moov.end).filter(x=>x.type==='trak').find(x=>STR(v,sub(v,sub(v,x,'mdia'),'hdlr').body+8)==='soun');
 const mdia=sub(v,trak,'mdia'),stbl=sub(v,sub(v,mdia,'minf'),'stbl');
 const sizes=sub(v,stbl,'stsz'),offsets=sub(v,stbl,'stco'),mapping=sub(v,stbl,'stsc');
 assert.equal(U32(v,mapping.body+4),1,'one chunk mapping in fixture');
 const count=U32(v,sizes.body+8);
 const sizeAt=i=>U32(v,sizes.body+4)||U32(v,sizes.body+12+i*4);
 const chunkCount=U32(v,offsets.body+4);
 const perChunk=U32(v,mapping.body+12);
 const frames=[];
 for(let c=0;c<chunkCount;c++){
  let offset=U32(v,offsets.body+8+c*4);
  for(let j=0;j<perChunk&&frames.length<count;j++){
   const size=sizeAt(frames.length);
   frames.push(new Uint8Array(blob.buffer,blob.byteOffset+offset,size).slice());
   offset+=size;
  }
 }
 return frames;
}
test('fast export only activates on a supported browser/WebCodecs implementation',async()=>{
 assert.equal(supportsFastPremiere(),false);
 assert.equal(await renderPremiereFast({source:new Blob(['invalid']),scene:{start:0,duration:15},plan:[],voiceWindow(){} }),null);
});
test('MP4 fast premiere replaces AAC without re-encoding H264 frames',{skip:!hasTools},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ntg-premiere-'));
 t.after(()=>rm(dir,{force:true,recursive:true}));
 const input=join(dir,'input.mp4'),output=join(dir,'out.mp4');
 run('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x90:rate=24',
   '-f','lavfi','-i','sine=frequency=300:sample_rate=44100','-t','4','-c:v','libx264',
   '-pix_fmt','yuv420p','-preset','fast','-crf','30','-g','48',
   '-c:a','aac','-ac','2','-b:a','96k','-movflags','+faststart','-y',input]);
 const bytes=new Uint8Array(await readFile(input));
 const source=new Blob([bytes],{type:'video/mp4'});
 const spec=await inspectFastDubMP4(source);
 assert.ok(spec,'AAC source template');
 assert.equal(spec.sampleRate,44100);
 const packets=sampleAudio(bytes).slice(0,Math.ceil(2*44100/1024));
 assert.equal(packets.length,Math.ceil(2*44100/1024));
 const frames=packets.map((data,i)=>({data,timestamp:Math.round(i*1024*1e6/44100)}));
 const clip=await fastDubMP4({blob:source,start:1,duration:2,frames,description:spec.asc});
 assert.ok(clip instanceof Blob,'smart-mux output');
 await writeFile(output,new Uint8Array(await clip.arrayBuffer()));
 const info=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,codec_type','-of','json',output]));
 assert.ok(Math.abs(Number(info.format.duration)-2)<.15,'scene duration');
 assert.deepEqual(info.streams.map(x=>x.codec_name),['h264','aac']);
 run('ffmpeg',['-v','error','-i',output,'-f','null','-']);
 const mismatch=await fastDubMP4({blob:source,start:1,duration:2,frames,description:new Uint8Array([0,0])});
 assert.equal(mismatch,null,'never mux incompatible AAC');
});
