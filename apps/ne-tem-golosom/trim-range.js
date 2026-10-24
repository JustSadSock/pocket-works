// Two-ended, keyboard-accessible film selection. All positions are source-video seconds.
export const MIN_SCENE_SECONDS=10;
export const MAX_SCENE_SECONDS=90;
export const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export function normalizeRange(start,end,total){
  const length=Number.isFinite(total)&&total>0?total:Math.max(MAX_SCENE_SECONDS,Number(end)||0);
  const limit=Math.max(MIN_SCENE_SECONDS,length);
  let a=clamp(Number(start)||0,0,limit-MIN_SCENE_SECONDS);
  let b=clamp(Number(end)||a+60,a+MIN_SCENE_SECONDS,Math.min(limit,a+MAX_SCENE_SECONDS));
  if(b-a>MAX_SCENE_SECONDS)b=a+MAX_SCENE_SECONDS;
  return {start:a,end:b,total:limit};
}
export function moveBound(range,bound,value){
  const {start,end,total}=range,seconds=Number(value);
  if(!Number.isFinite(seconds))return range;
  if(bound==='start'){
    const a=clamp(seconds,Math.max(0,end-MAX_SCENE_SECONDS),end-MIN_SCENE_SECONDS);
    return {start:a,end,total};
  }
  if(bound==='end'){
    const b=clamp(seconds,start+MIN_SCENE_SECONDS,Math.min(total,start+MAX_SCENE_SECONDS));
    return {start,end:b,total};
  }
  const width=end-start, a=clamp(seconds,0,Math.max(0,total-width));
  return {start:a,end:a+width,total};
}
export const filmTime=seconds=>{
  const n=Math.max(0,Math.floor(Number(seconds)||0));
  return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
};

export function createTrimRange({video,onChange=()=>{}}){
  const track=document.getElementById('trim-range-track');
  const fill=document.getElementById('trim-range-fill');
  const playhead=document.getElementById('trim-range-head');
  const startHandle=document.getElementById('trim-range-handle-start');
  const endHandle=document.getElementById('trim-range-handle-end');
  const startLabel=document.getElementById('trim-start-display');
  const endLabel=document.getElementById('trim-end-display');
  const lengthLabel=document.getElementById('trim-range-length');
  const currentLabel=document.getElementById('trim-current-time');
  const totalLabel=document.getElementById('trim-total-time');
  const ticks=document.getElementById('trim-range-ticks');
  let range=normalizeRange(0,60,90);
  let gesture=null;

  const pct=n=>100*clamp(n/Math.max(1,range.total),0,1);
  const point=e=>{
    const box=track.getBoundingClientRect();
    return clamp((e.clientX-box.left)/Math.max(1,box.width),0,1)*range.total;
  };
  const draw=()=>{
    const a=pct(range.start),b=pct(range.end);
    fill.style.left=a+'%';fill.style.width=(b-a)+'%';
    startHandle.style.left=a+'%';endHandle.style.left=b+'%';
    startHandle.setAttribute('aria-valuemin',String(Math.max(0,range.end-MAX_SCENE_SECONDS)));
    startHandle.setAttribute('aria-valuemax',String(range.end-MIN_SCENE_SECONDS));
    startHandle.setAttribute('aria-valuenow',String(Math.round(range.start)));
    startHandle.setAttribute('aria-valuetext',filmTime(range.start));
    endHandle.setAttribute('aria-valuemin',String(range.start+MIN_SCENE_SECONDS));
    endHandle.setAttribute('aria-valuemax',String(Math.min(range.total,range.start+MAX_SCENE_SECONDS)));
    endHandle.setAttribute('aria-valuenow',String(Math.round(range.end)));
    endHandle.setAttribute('aria-valuetext',filmTime(range.end));
    startLabel.textContent=filmTime(range.start);
    endLabel.textContent=filmTime(range.end);
    lengthLabel.textContent=filmTime(range.end-range.start);
    totalLabel.textContent=filmTime(range.total);
    ticks.textContent='';
    for(let i=0;i<=4;i++){const tick=document.createElement('span');tick.textContent=filmTime(range.total*i/4);ticks.append(tick);}
    syncPlayback();
  };
  const notify=()=>{draw();onChange({...range});};
  const apply=(kind,n)=>{
    range=moveBound(range,kind,n);
    notify();
  };
  const syncPlayback=()=>{
    const t=Number.isFinite(video.currentTime)?video.currentTime:0;
    playhead.style.left=pct(t)+'%';
    currentLabel.textContent=filmTime(t);
  };
  const seek=t=>{
    const target=clamp(t,0,Math.max(0,range.total-.02));
    try{video.currentTime=target;}catch{}
    syncPlayback();
  };
  const startAt=t=>{
    const a=clamp(t,0,range.total-MIN_SCENE_SECONDS);
    const b=range.end>=a+MIN_SCENE_SECONDS?Math.min(range.end,a+MAX_SCENE_SECONDS):Math.min(range.total,a+Math.max(MIN_SCENE_SECONDS,Math.min(60,range.total-a)));
    range=normalizeRange(a,b,range.total);
    notify();
  };
  const endAt=t=>{
    const b=clamp(t,MIN_SCENE_SECONDS,range.total);
    const a=range.start<=b-MIN_SCENE_SECONDS?Math.max(range.start,b-MAX_SCENE_SECONDS):Math.max(0,b-MIN_SCENE_SECONDS);
    range=normalizeRange(a,b,range.total);
    notify();
  };
  track.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    const handle=e.target.closest('[data-trim-handle]');
    const t=point(e);
    const kind=handle?.dataset.trimHandle||(t>=range.start&&t<=range.end?'window':'seek');
    gesture={kind,origin:t,start:range.start,end:range.end,moved:false};
    track.setPointerCapture(e.pointerId);
    if(kind==='start'||kind==='end')apply(kind,t);
    else if(kind==='seek')seek(t);
    e.preventDefault();
  });
  track.addEventListener('pointermove',e=>{
    if(!gesture)return;
    const t=point(e);
    if(Math.abs(t-gesture.origin)>range.total*.008)gesture.moved=true;
    if(gesture.kind==='start'||gesture.kind==='end')apply(gesture.kind,t);
    else if(gesture.kind==='window'&&gesture.moved){
      range=moveBound({...range,start:gesture.start,end:gesture.end},'window',gesture.start+t-gesture.origin);
      notify();
    }else if(gesture.kind==='seek')seek(t);
  });
  const finish=e=>{
    if(!gesture)return;
    if(gesture.kind==='window'&&!gesture.moved)seek(point(e));
    gesture=null;
  };
  track.addEventListener('pointerup',finish);
  track.addEventListener('pointercancel',()=>{gesture=null;});
  for(const [handle,kind] of [[startHandle,'start'],[endHandle,'end']]){
    handle.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();
      const step=e.shiftKey?5:1;
      if(e.key==='Home')apply(kind,0);
      else if(e.key==='End')apply(kind,range.total);
      else apply(kind,range[kind]+(e.key==='ArrowRight'?step:-step));
    });
  }
  document.getElementById('trim-mark-start').addEventListener('click',()=>startAt(video.currentTime));
  document.getElementById('trim-mark-end').addEventListener('click',()=>endAt(video.currentTime));
  video.addEventListener('timeupdate',syncPlayback);
  video.addEventListener('seeked',syncPlayback);
  video.addEventListener('durationchange',()=>{
    if(Number.isFinite(video.duration)&&video.duration>=MIN_SCENE_SECONDS&&Math.abs(range.total-video.duration)>.25){
      range=normalizeRange(range.start,range.end,video.duration);notify();
    }
  });
  return {
    setRange(start,end,total){range=normalizeRange(start,end,total);notify();},
    syncPlayback,
    getRange:()=>({...range}),
    resetToStart(){seek(range.start);}
  };
}
