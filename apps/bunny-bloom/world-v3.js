 // The meadow extension owns ambient events; garden remains the sole source of stars and flowers.
const VERSION='pocket-works:bunny-bloom:meadow-v3';
const POSITIONS=[
  {x:61,y:30},{x:82,y:57},{x:34,y:53},{x:73,y:40},{x:17,y:64}
];
const EVENT_DURATION=24000;
const SPAWN_INTERVAL=3900;
function safeInt(value,max){return Number.isSafeInteger(value)?Math.max(0,Math.min(max,value)):0}
export function mountMeadow({garden,pogoGif}){
  const $=id=>document.getElementById(id);
  const world=$('world'),event=$('sky-event'),banner=$('event-banner'),stars=$('starfall-stars');
  const counter=$('starfallCounter'),bunny=$('bunny'),bunnyArt=$('bunny-art');
  const initialMilestone=Math.floor(garden.state.harvests/4);
  let stored=null;
  try{stored=JSON.parse(localStorage.getItem(VERSION))}catch{}
  const model={
    lastMilestone:stored?safeInt(stored.lastMilestone,999999):initialMilestone,
    starsCaught:stored?safeInt(stored.starsCaught,999999):0,
    showers:stored?safeInt(stored.showers,999999):0,
    queued:stored?safeInt(stored.queued,100):0,
    active:null
  };
  if(stored?.active&&typeof stored.active==='object'){
    const a=stored.active;
    const now=Date.now();
    if(Number.isSafeInteger(a.started)&&Number.isSafeInteger(a.until)
      &&a.started<=now&&a.until>now&&a.until-a.started<=EVENT_DURATION
      &&Array.isArray(a.claimed)){
      model.active={started:a.started,until:a.until,claimed:[...new Set(a.claimed.filter(v=>Number.isInteger(v)&&v>=0&&v<5))]};
    }
  }
  const store=()=>{try{localStorage.setItem(VERSION,JSON.stringify(model))}catch{}};
  let lastPaint='',jumpTimer=0;
  const announce=message=>{
    const toast=$('toast');
    toast.textContent=message;toast.classList.add('show');
    clearTimeout(announce.timer);
    announce.timer=setTimeout(()=>toast.classList.remove('show'),1900);
  };
  function paint(){
    const now=Date.now();
    const a=model.active;
    if(a&&a.until<=now){model.active=null;store();if(model.queued>0){model.queued--;begin();return;}}
    const active=!!model.active;
    const remainder=4-garden.state.harvests%4;
    counter.textContent=active?'Звездопад!':'До звездопада: '+remainder;
    $('festivalStats').textContent='Звездопадов: '+model.showers+' · Поймано звёзд: '+model.starsCaught;
    event.hidden=!active;world.classList.toggle('starfall-active',active);
    if(!active){if(lastPaint!==''){stars.replaceChildren();lastPaint=''}return}
    const f=model.active;
    const visible=POSITIONS.map((_,index)=>index).filter(index=>
      now>=f.started+index*SPAWN_INTERVAL&&!f.claimed.includes(index));
    const stamp=f.started+':'+visible.join(',');
    banner.textContent='ЗВЁЗДОПАД · '+f.claimed.length+' из 5';
    if(stamp===lastPaint)return;
    lastPaint=stamp;stars.replaceChildren();
    for(const index of visible){
      const pos=POSITIONS[index],star=document.createElement('button');
      star.type='button';star.className='catch-star';star.dataset.star=String(index);
      star.style.setProperty('--x',pos.x+'%');star.style.setProperty('--y',pos.y+'%');
      star.setAttribute('aria-label','Поймать звезду '+(index+1));
      star.setAttribute('data-native-press','');
      star.innerHTML='<svg viewBox="0 0 72 72" aria-hidden="true"><path d="M36 5 44 24 65 25 49 39 54 62 36 49 17 62 22 39 6 25 28 24Z" fill="#ffdb78" stroke="#fff5c5" stroke-width="4"/><circle cx="30" cy="32" r="3" fill="#87616e"/><circle cx="42" cy="32" r="3" fill="#87616e"/><path d="M32 39q4 5 8 0" stroke="#87616e" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>';
      star.onclick=()=>catchStar(index,star);stars.appendChild(star);
    }
  }
  function begin(){
    if(model.active)return;
    const now=Date.now();
    model.active={started:now,until:now+EVENT_DURATION,claimed:[]};
    model.showers++;store();paint();
    announce('Звездопад! Лови звёздочки в небе');
  }
  function catchStar(index,button){
    const f=model.active;
    if(!f||Date.now()>=f.until||f.claimed.includes(index)||Date.now()<f.started+index*SPAWN_INTERVAL)return;
    f.claimed.push(index);model.starsCaught++;
    garden.state.stars+=2;
    if(f.claimed.length===POSITIONS.length){garden.state.stars+=5;announce('Все звёзды собраны! +15 ✦');model.active=null;}
    else announce('+2 ✦ За пойманную звезду!');
    garden.save();garden.render();store();
    button.classList.add('caught');
    if(!model.active&&model.queued>0){model.queued--;begin();}
    lastPaint='';paint();
  }
  function onHarvest(){
    const current=Math.floor(garden.state.harvests/4);
    if(current>model.lastMilestone){const extra=current-model.lastMilestone;model.lastMilestone=current;if(model.active){model.queued=Math.min(100,model.queued+extra);}else{model.queued=Math.min(100,model.queued+Math.max(0,extra-1));begin();}store();}
    else paint();
  }
  const jump=()=>{
    if(!pogoGif)return;
    clearTimeout(jumpTimer);
    bunny.classList.add('jumping');
    bunnyArt.src=pogoGif;
    jumpTimer=setTimeout(()=>{
      bunnyArt.src=bunnyArt.dataset.idleSrc||bunnyArt.src;
      bunny.classList.remove('jumping');
    },1450);
  };
  bunnyArt.dataset.idleSrc=bunnyArt.src;
  bunny.addEventListener('click',jump);
  const handleHarvest=()=>onHarvest();
  window.addEventListener('bunny-bloom:harvest',handleHarvest);
  const ticker=setInterval(()=>{if(!document.hidden)paint()},370);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)paint()});
  window.addEventListener('pagehide',store);
  store();paint();
  return {state:model,paint,dispose:()=>{clearInterval(ticker);clearTimeout(jumpTimer);window.removeEventListener('bunny-bloom:harvest',handleHarvest)}};
}
