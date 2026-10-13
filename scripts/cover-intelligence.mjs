// Deterministic, dependency-free gates for genuine Pocket Works screenshots.
const TWO_DAYS=48*60*60*1000;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));

export function shouldCaptureCover({record,revision,exists,forced=false,now=Date.now()}){
  if(forced)return true;
  if(record?.pinned)return false;
  if(record?.lastAttemptRevision===revision && record?.status!=='published' &&
      now-Date.parse(record.lastAttemptAt||0)<TWO_DAYS)return false;
  if(!exists)return true;
  return record?.revision!==revision;
}

export function scoreCoverMetrics(metrics={}){
  const {variance=0,entropy=0,edgeDensity=0,colorfulness=0,centerDetail=0,
    meanLight=0,bytes=0}=metrics;
  const reasons=[];
  if(bytes<9000)reasons.push('image too small');
  if(variance<8)reasons.push('flat frame');
  if(entropy<2.1)reasons.push('low visual detail');
  if(meanLight<12||meanLight>245)reasons.push('over/underexposed');
  const score=Math.round(
    clamp(variance/55,0,1)*25 +
    clamp(entropy/6.5,0,1)*24 +
    clamp(edgeDensity/.095,0,1)*15 +
    clamp(colorfulness/65,0,1)*12 +
    clamp(centerDetail/55,0,1)*17 +
    clamp(1-Math.abs(meanLight-125)/135,0,1)*7
  );
  return {score,pass:reasons.length===0,reasons};
}

export function chooseCover(candidates,{previousScore=null,allowedRegression=7}={}){
  const valid=candidates.filter(c=>c.quality?.pass && !c.aiRejected)
    .sort((a,b)=>(b.visionScore??b.quality.score)-(a.visionScore??a.quality.score) ||
      (b.prepared?1:0)-(a.prepared?1:0));
  if(!valid.length)return {chosen:null,reason:'no eligible gameplay frame'};
  const chosen=valid[0];
  if(Number.isFinite(previousScore) &&
      (chosen.visionScore??chosen.quality.score)<previousScore-allowedRegression)
    return {chosen:null,reason:'existing cover rated higher'};
  return {chosen,reason:'accepted'};
}

export function parseVisionDecision(text,frameCount){
  if(typeof text!=='string')return null;
  try{
    const body=text.slice(text.indexOf('{'),text.lastIndexOf('}')+1);
    const value=JSON.parse(body);
    const pick=Number(value.best);
    if(!Number.isInteger(pick)||pick<0||pick>=frameCount)return null;
    const scores=Array.isArray(value.scores)?value.scores.map(x=>clamp(x,0,100)):[];
    if(scores.length!==frameCount)return null;
    const rejected=Array.isArray(value.reject)?value.reject.filter(x=>Number.isInteger(x)&&x>=0&&x<frameCount):[];
    return {best:pick,scores,rejected};
  }catch{return null;}
}

export function safeRevision(value){
  return typeof value==='string' && /^[a-f0-9]{7,64}$/.test(value)?value:null;
}
