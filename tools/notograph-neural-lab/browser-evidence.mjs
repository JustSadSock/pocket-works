import {createServer} from 'node:http';import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const [app,fixture,out,engine]=process.argv.slice(2);const require=createRequire(import.meta.url),browserType=require(process.env.PLAYWRIGHT_MODULE??'playwright')[engine];
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Notograph browser evidence</title>');return}if(p==='/fixture.wav'){res.setHeader('Content-Type','audio/wav');res.end(await readFile(fixture));return}if(!/^\/[a-z-]+\.mjs$/.test(p)){res.writeHead(404).end();return}res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.join(app,p.slice(1))))}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await browserType.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(360000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const results=await page.evaluate(async()=>{const ctx=new AudioContext({sampleRate:44100});const a=await ctx.decodeAudioData(await (await fetch('/fixture.wav')).arrayBuffer());const stereo=[new Float32Array(a.getChannelData(0)),new Float32Array(a.getChannelData(1))];await ctx.close();const {toMono22}=await import('/demucs.mjs');
 async function run(message,transfer){const start=performance.now();return await new Promise((resolve,reject)=>{const worker=new Worker('/worker.mjs',{type:'module'});const timer=setTimeout(()=>{worker.terminate();reject(Error('Model timeout'))},300000);const done=(err,value)=>{clearTimeout(timer);worker.terminate();err?reject(Error(err)):resolve({...value,ms:performance.now()-start})};worker.onerror=e=>done(e.message||'Worker failure');worker.onmessage=({data})=>{if(data.progress!==undefined)return;if(data.error){done(data.error);return}const audio=(data.audio||[]).map(x=>({id:x.id,bytes:Array.from(new Uint8Array(x.wav))}));done(null,{tracks:data.tracks,stems:data.stems,audio})};worker.postMessage(message,transfer)})}
 const samples=toMono22(stereo);let neural,demucs;
 try{neural=await run({mode:'neural',samples},[samples.buffer])}catch(e){neural={error:String(e)}}
 try{demucs=await run({mode:'demucs',stereo},stereo.map(x=>x.buffer))}catch(e){demucs={error:String(e)}}
 return {neural,demucs};
 });
 await mkdir(out,{recursive:true});for(const stem of results.demucs.audio||[])await writeFile(path.join(out,stem.id+'.wav'),Buffer.from(stem.bytes));delete results.demucs.audio;
 await writeFile(path.join(out,'result.json'),JSON.stringify({engine,errors,...results},null,2));console.log(JSON.stringify({engine,errors,neuralError:results.neural.error,demucsError:results.demucs.error,neuralNotes:results.neural.tracks?.flatMap(t=>t.events).length,demucsNotes:results.demucs.tracks?.flatMap(t=>t.events).length,stems:results.demucs.stems?.map(s=>s.id)},null,2));
 assert.ok(!results.neural.error,results.neural.error);assert.ok(!results.demucs.error,results.demucs.error);assert.equal(results.demucs.stems.length,4);assert.ok(results.neural.tracks.some(t=>t.events.length));assert.ok(results.demucs.tracks.some(t=>t.events.length));assert.deepEqual(errors,[]);
}finally{await browser?.close();await new Promise(r=>server.close(r))}
