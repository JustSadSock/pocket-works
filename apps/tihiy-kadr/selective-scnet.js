// Selective SCNet: detect the speech-like residuals left by Open-Unmix,
// run SCNet on bounded ORIGINAL excerpts, and crossfade only those portions.
// SCNet is not fed a heavily filtered Open-Unmix mix (distribution mismatch).
export const SAMPLE_RATE=44100;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const BLOCK_SECONDS=.25,SECTION_SECONDS=5,CONTEXT_SECONDS=.85,GAP_SECONDS=.5,FADE_SECONDS=.42;
function validateAudio(audio,name){
 if(!Array.isArray(audio)||!audio.length||audio.length>2||
    audio.some(x=>!(x instanceof Float32Array)||x.length!==audio[0].length))
  throw Error('Некорректная дорожка '+name);
}
function makeStereo(audio){
 validateAudio(audio,'источника');
 return audio.length===2?audio:[audio[0],audio[0]];
}
export function scoreResidualWindows(original,vocals,artifact,rate=SAMPLE_RATE){
 const input=makeStereo(original),voice=makeStereo(vocals),buzz=makeStereo(artifact);
 const count=input[0].length;
 if(voice[0].length!==count||buzz[0].length!==count)throw Error('Разные длины аудио при анализе остатков.');
 const block=Math.max(128,Math.round(rate*BLOCK_SECONDS)),out=[];
 for(let start=0;start<count;start+=block){
  const end=Math.min(count,start+block);
  let ve=0,ce=0,be=0,used=0;
  // Match the post-UMX residual at 100%; do not amplify preview settings.
  for(let i=start;i<end;i+=4){
   for(let ch=0;ch<2;ch++){
    const v=voice[ch][i],c=input[ch][i]-v,b=buzz[ch][i];
    ve+=v*v;ce+=c*c;be+=b*b;used++;
   }
  }
  const v=Math.sqrt(ve/Math.max(1,used)),c=Math.sqrt(ce/Math.max(1,used)),b=Math.sqrt(be/Math.max(1,used));
  const vocalPresent=clamp((v-.004)/.03);
  const buzzProminence=clamp((b/(c+.0007)-.012)/.16);
  const speechDominance=clamp(v/(v+c+.0005)*1.25);
  const score=vocalPresent*buzzProminence*(.38+.62*speechDominance);
  out.push(score);
 }
 return out;
}
// Greedy top nonoverlapping five-second windows. Ordered output is chronological
// so the batched inference can use one ONNX initialization. Score is based on
// the detected vocal estimate AND the independent buzzing-removal estimate.
export function selectProblemSegments(original,vocals,artifact,{budgetSeconds=12,rate=SAMPLE_RATE}={}){
 if(!Number.isFinite(budgetSeconds)||budgetSeconds<4||budgetSeconds>30)throw Error('Лимит точечной SCNet: 4–30 секунд.');
 const scores=scoreResidualWindows(original,vocals,artifact,rate),total=original[0].length;
 if(total<rate*3)return [];
 const binsPer=Math.max(1,Math.round(SECTION_SECONDS/BLOCK_SECONDS));
 const full=Array.from({length:scores.length+1},(_,i)=>i===0?0:0);
 for(let i=0;i<scores.length;i++)full[i+1]=full[i]+scores[i];
 const chosen=[],limit=Math.max(1,Math.floor(budgetSeconds/SECTION_SECONDS)),duration=total/rate;
 for(let k=0;k<limit;k++){
  let best=-1,bestScore=0;
  for(let i=0;i<scores.length;i++){
   const sec=i*BLOCK_SECONDS;
   if(sec>duration-2.8)break;
   const endSec=Math.min(duration,sec+SECTION_SECONDS),endBin=Math.min(scores.length,Math.ceil(endSec/BLOCK_SECONDS));
   const avg=(full[endBin]-full[i])/Math.max(1,endBin-i);
   if(avg<.033)continue;
   const center=(sec+endSec)/2;
   if(chosen.some(x=>Math.abs((x.start+x.end)/2-center)<SECTION_SECONDS+2*CONTEXT_SECONDS+.02))continue;
   if(avg>bestScore){bestScore=avg;best=i}
  }
  if(best<0)break;
  let start=Math.round(best*BLOCK_SECONDS*rate),end=Math.min(total,start+Math.round(SECTION_SECONDS*rate));
  // Never include a shorter-than-3s "last fragment" unless it is the entire scene.
  if(end-start<rate*2.8)break;
  chosen.push({start,end,score:bestScore});
 }
 return chosen.sort((a,b)=>a.start-b.start);
}
// Pack discontinuous clips with silence between them, plus genuine surrounding
// context. This reduces repeated expensive ONNX model initialization.
export function packProblemSegments(original,segments,{rate=SAMPLE_RATE}={}){
 const stereo=makeStereo(original),total=stereo[0].length;
 if(!Array.isArray(segments)||!segments.length)throw Error('Не выбраны проблемные участки.');
 const context=Math.round(CONTEXT_SECONDS*rate),gap=Math.round(GAP_SECONDS*rate);
 let length=0;const layout=[];
 for(const segment of segments){
  if(!Number.isSafeInteger(segment.start)||!Number.isSafeInteger(segment.end)||
     segment.start<0||segment.end>total||segment.end<=segment.start)
   throw Error('Неправильные границы проблемного участка.');
  const start=Math.max(0,segment.start-context),end=Math.min(total,segment.end+context);
  if(layout.length&&start<layout.at(-1).sourceEnd)throw Error('Проблемные участки пересекаются.');
  if(layout.length)length+=gap;
  layout.push({start:segment.start,end:segment.end,sourceStart:start,sourceEnd:end,
   packedOffset:length,score:segment.score});
  length+=end-start;
 }
 const packed=[new Float32Array(length),new Float32Array(length)];
 for(const item of layout)for(let ch=0;ch<2;ch++)
  packed[ch].set(stereo[ch].subarray(item.sourceStart,item.sourceEnd),item.packedOffset);
 return {packed,layout,packedSeconds:length/rate,selectedSeconds:segments.reduce((n,s)=>n+(s.end-s.start)/rate,0)};
}
export function composeSelectivePatches(layout,scnetVocals,umxVocals,{rate=SAMPLE_RATE}={}){
 const repaired=makeStereo(scnetVocals),base=makeStereo(umxVocals);
 if(!layout?.length)throw Error('Нет разметки точечной SCNet.');
 const fade=Math.max(1,Math.round(FADE_SECONDS*rate)),patches=[];
 for(const item of layout){
  const frames=item.end-item.start,offset=item.packedOffset+item.start-item.sourceStart;
  if(offset<0||offset+frames>repaired[0].length||item.end>base[0].length)
   throw Error('Ответ SCNet не совпадает с фрагментом оригинала.');
  const delta=[new Float32Array(frames),new Float32Array(frames)];
  for(let i=0;i<frames;i++){
   const n=Math.min(i,frames-1-i)/fade;
   const weight=Math.sin(.5*Math.PI*clamp(n))**2;
   for(let ch=0;ch<2;ch++){
    const correction=(base[ch][item.start+i]-repaired[ch][offset+i])*weight;
    delta[ch][i]=Number.isFinite(correction)?correction:0;
   }
  }
  patches.push({start:item.start,end:item.end,score:item.score,delta});
 }
 return patches;
}
export function mixSelectivePatches(clean,patches,amount=1){
 validateAudio(clean,'результата');
 if(!Number.isFinite(amount)||amount<0||amount>1.5)throw Error('Некорректная сила совмещения.');
 if(!Array.isArray(patches)||!patches.length||!amount)return clean;
 for(const p of patches){
  if(!Number.isSafeInteger(p.start)||!Number.isSafeInteger(p.end)||p.start<0||p.end>clean[0].length||
   !Array.isArray(p.delta)||p.delta.length!==2||p.delta.some(x=>!(x instanceof Float32Array)||x.length!==p.end-p.start))
   throw Error('Некорректная подготовленная вставка SCNet.');
  for(let ch=0;ch<clean.length;ch++){
   const audio=clean[ch],fix=p.delta[ch];
   for(let i=0;i<fix.length;i++)audio[p.start+i]+=fix[i]*amount;
  }
 }
 return clean;
}
