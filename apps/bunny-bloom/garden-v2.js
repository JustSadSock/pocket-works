 // GARDEN V2 - live plants and local save, written for the isolated PocketWorks app
export function mountGarden({flowerGif}) {
  const $ = id => document.getElementById(id);
  const STORAGE='pocket-works:bunny-bloom:v2',LEGACY='pocket-works:bunny-bloom:v1';
  const species=[
    {id:'rose',name:'Розоцвет',short:'Роза',unlocks:0,seconds:9,yield:3,tint:'#f29ab6'},
    {id:'bell',name:'Лунный звон',short:'Луна',unlocks:3,seconds:20,yield:7,tint:'#9a90ea'},
    {id:'sun',name:'Солнечник',short:'Солнце',unlocks:8,seconds:34,yield:12,tint:'#efb95a'}
  ];
  const friends=[
    {id:'bee',name:'Пчёлка Биби',cost:8,desc:'Ускоряет рост на 5 секунд',cooldown:25000},
    {id:'frog',name:'Лягушонок Плюх',cost:16,desc:'Поливает все растущие цветы',cooldown:40000},
    {id:'fox',name:'Лисёнок Рыжик',cost:28,desc:'Приносит 3 звезды',cooldown:55000}
  ];
  const tasks=[
    {id:'bouquets',title:'Первый букетик',goal:'Собери 3 букета',reward:6,done:s=>s.harvests>=3},
    {id:'lunar',title:'Лунная ботаника',goal:'Вырастить 2 лунных цветка',reward:12,done:s=>s.counts.bell>=2},
    {id:'friends',title:'Тёплая компания',goal:'Пригласи 2 лесных гостей',reward:10,done:s=>s.friends.length>=2},
    {id:'sunny',title:'Солнечная оранжерея',goal:'Вырастить 3 солнечника',reward:18,done:s=>s.counts.sun>=3}
  ];
  const empty=()=>({stars:0,harvests:0,beds:[null,null,null],friends:[],night:true,bonuses:{},bunnyGift:0,seed:'rose',counts:{rose:0,bell:0,sun:0},claimed:[]});
  const bounded=(x,max=1e9)=>Number.isFinite(x)?Math.max(0,Math.min(max,Math.floor(x))):0;
  function restore(){
    let raw;try{raw=JSON.parse(localStorage.getItem(STORAGE))}catch{}
    if(!raw){let old;try{old=JSON.parse(localStorage.getItem(LEGACY))}catch{}
      if(old&&Array.isArray(old.beds)&&old.beds.length===3){
        raw=empty();const now=Date.now();raw.stars=old.stars;raw.harvests=old.harvests;
        raw.friends=old.friends;raw.night=old.night;raw.bonuses=old.bonuses||old.lastBonus||{};
        raw.beds=old.beds.map(stage=>stage===3?{kind:'rose',plantedAt:now-9000,readyAt:now-1,watered:true}:stage>0?{kind:'rose',plantedAt:now-4000,readyAt:now+(stage===2?2500:6000),watered:stage>=2}:null);
      }
    }
    const s=empty();if(!raw||typeof raw!=='object')return s;
    s.stars=bounded(raw.stars);s.harvests=bounded(raw.harvests);
    s.friends=Array.isArray(raw.friends)?[...new Set(raw.friends.filter(x=>friends.some(f=>f.id===x)))]:[];
    s.night=raw.night!==false;s.seed=species.some(k=>k.id===raw.seed)?raw.seed:'rose';
    s.bunnyGift=bounded(raw.bunnyGift,Date.now()+86400000);
    s.bonuses=raw.bonuses&&typeof raw.bonuses==='object'?Object.fromEntries(friends.map(f=>[f.id,bounded(raw.bonuses[f.id],Date.now()+86400000)])):{};
    s.counts=Object.fromEntries(species.map(k=>[k.id,bounded(raw.counts?.[k.id])]));
    s.claimed=Array.isArray(raw.claimed)?raw.claimed.filter(x=>tasks.some(t=>t.id===x)):[];
    s.beds=Array.from({length:3},(_,i)=>{
      const b=raw.beds?.[i];if(!b||!species.some(x=>x.id===b.kind))return null;
      let plantedAt=bounded(b.plantedAt,Date.now()+86400000),readyAt=bounded(b.readyAt,Date.now()+86400000);
      if(!plantedAt||!readyAt)return null;
      return {kind:b.kind,plantedAt,readyAt:Math.max(plantedAt,readyAt),watered:!!b.watered};
    });return s;
  }
  const s=restore(),persist=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(s))}catch{}};
  const speedup=(b,now)=>{if(!b||b.watered||b.readyAt<=now)return false;b.watered=true;b.readyAt=now+Math.ceil((b.readyAt-now)*.52);return true};
  const svg=body=>`<svg class="bloom-vector" viewBox="0 0 90 90" aria-hidden="true">${body}</svg>`;
  const bellSvg=svg('<path d="M45 73V29" stroke="#598c64" stroke-width="7" stroke-linecap="round"/><path d="M45 57q-17-23-27-11 10 17 27 11m0-15q19-20 28-10-12 15-28 10" fill="#83bb84"/><path d="M21 16q22-17 48 0l-7 34q-17 16-34 0Z" fill="#a59bf6" stroke="#655b9a" stroke-width="5"/><path d="M38 22q-8 8-7 19" stroke="#e2d9ff" stroke-width="6" stroke-linecap="round"/><circle cx="45" cy="50" r="6" fill="#ffe8a7"/>');
  const sunSvg=svg('<path d="M45 75V33" stroke="#58875c" stroke-width="7" stroke-linecap="round"/><path d="M45 63q-23-22-27-8 15 17 27 8m0-18q21-24 28-8-15 14-28 8" fill="#7fb67a"/><g fill="#ffce67" stroke="#e99f51" stroke-width="3"><ellipse cx="45" cy="18" rx="9" ry="16"/><ellipse cx="45" cy="18" rx="9" ry="16" transform="rotate(60 45 34)"/><ellipse cx="45" cy="18" rx="9" ry="16" transform="rotate(120 45 34)"/><ellipse cx="45" cy="18" rx="9" ry="16" transform="rotate(180 45 34)"/><ellipse cx="45" cy="18" rx="9" ry="16" transform="rotate(240 45 34)"/><ellipse cx="45" cy="18" rx="9" ry="16" transform="rotate(300 45 34)"/></g><circle cx="45" cy="34" r="12" fill="#936552"/><circle cx="41" cy="31" r="3" fill="#fff0bb"/><circle cx="50" cy="31" r="3" fill="#fff0bb"/>');
  let toastTimer=0;const announce=msg=>{const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200)};
  const burst=(el,count=8)=>{const r=el.getBoundingClientRect(),host=document.createElement('div');host.className='garden-burst';host.style.left=(r.left+r.width/2)+'px';host.style.top=(r.top+r.height/2)+'px';for(let i=0;i<count;i++){const d=document.createElement('i');d.style.setProperty('--angle',(i*360/count)+'deg');d.style.setProperty('--dist',(38+(i%3)*14)+'px');host.appendChild(d)}document.querySelector('.app-shell')?.appendChild(host);setTimeout(()=>host.remove(),850)};
  const seedbar=$('seedbar');
  for(const k of species){const btn=document.createElement('button');btn.className='seed-option';btn.type='button';btn.id='seed-'+k.id;btn.dataset.seed=k.id;btn.innerHTML=`<i class="seed-dot" style="--seed-color:${k.tint}"></i><span>${k.short}</span><small></small>`;btn.addEventListener('click',()=>{if(s.harvests<k.unlocks){announce(`Откроется после ${k.unlocks} букетов`);return;}s.seed=k.id;persist();render();announce('Выбран '+k.name)});seedbar.appendChild(btn)}
  const beds=[];for(let i=0;i<3;i++){const b=document.createElement('button');b.id='bed'+i;b.className='bed';b.type='button';b.setAttribute('data-native-press','');b.innerHTML='<div class="plant"></div><svg class="pot" viewBox="0 0 64 64"><use href="#pot"/></svg><strong>Посадить</strong><span class="growth-meter"><span></span></span>';b.addEventListener('click',()=>touchBed(i,b));$('beds').appendChild(b);beds.push(b)}
  function touchBed(i,el){const now=Date.now(),b=s.beds[i];if(!b){const k=species.find(x=>x.id===s.seed)||species[0];if(s.harvests<k.unlocks){announce('Этот цветок ещё закрыт');return;}s.beds[i]={kind:k.id,plantedAt:now,readyAt:now+k.seconds*1000,watered:false};announce(k.name+' посажен!');}
    else if(now>=b.readyAt){const k=species.find(x=>x.id===b.kind)||species[0];s.beds[i]=null;s.harvests++;s.counts[k.id]++;s.stars+=k.yield;window.dispatchEvent(new CustomEvent('bunny-bloom:harvest',{detail:{harvests:s.harvests,kind:k.id}}));announce(`+${k.yield} звёзд · ${k.name}`);burst(el,13);}
    else if(speedup(b,now)){announce('Полито! Рост ускорился');burst(el,6)}
    else{announce('Цветок растёт сам · ещё '+Math.ceil((b.readyAt-now)/1000)+' с')}
    el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');persist();render();
  }
  function flowerArt(k){if(k.id==='rose'){const img=document.createElement('img');img.alt='';img.src=flowerGif;return img}const wrap=document.createElement('span');wrap.innerHTML=k.id==='bell'?bellSvg:sunSvg;return wrap.firstElementChild}
  function render(){const now=Date.now();$('bank').textContent='✦ '+s.stars;
    $('harvests').textContent=s.harvests+' '+(s.harvests%10===1&&s.harvests%100!==11?'букет':s.harvests%10>=2&&s.harvests%10<=4&&(s.harvests%100<12||s.harvests%100>14)?'букета':'букетов');
    document.body.classList.toggle('day',!s.night);$('weather').textContent=s.night?'☀ Рассвет':'☾ Ночь';
    $('hint').textContent=s.beds.some(b=>b&&b.readyAt<=now)?'Цветок готов! Собери его и получи звёзды':s.beds.some(b=>b&&!b.watered)?'Полей семечко — оно вырастет быстрее':s.beds.some(b=>b&&b.readyAt>now)?'Растения растут сами, даже когда игра закрыта':'Выбери семя и коснись горшка';
    for(const k of species){const bt=$('seed-'+k.id),locked=s.harvests<k.unlocks;bt.classList.toggle('chosen',s.seed===k.id&&!locked);bt.classList.toggle('locked',locked);bt.setAttribute('aria-pressed',String(s.seed===k.id&&!locked));bt.querySelector('small').textContent=locked?`${k.unlocks} букетов`:`${k.seconds} с · +${k.yield} ✦`;}
    beds.forEach((el,i)=>{const b=s.beds[i],plant=el.querySelector('.plant');let status='empty',label='Посадить',progress=0;
      if(b){const k=species.find(x=>x.id===b.kind)||species[0];progress=Math.max(0,Math.min(1,(now-b.plantedAt)/Math.max(1,b.readyAt-b.plantedAt)));
        if(now>=b.readyAt){status='bloom-'+b.kind;label='Собрать +'+k.yield}
        else{status=progress>.27?'sprout':'seed';label=b.watered?`${Math.ceil((b.readyAt-now)/1000)} с`:'Полить';}el.style.setProperty('--flower-hue',k.tint)}
      if(el.dataset.art!==status){plant.replaceChildren();if(status==='seed'||status==='sprout'){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 64 64');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#'+status);svg.appendChild(use);plant.appendChild(svg)}
        else if(status.startsWith('bloom-')){plant.appendChild(flowerArt(species.find(x=>x.id===b.kind)||species[0]))}el.dataset.art=status}
      el.classList.toggle('ripe',!!b&&now>=b.readyAt);el.classList.toggle('growing',!!b&&now<b.readyAt);el.querySelector('strong').textContent=label;el.querySelector('.growth-meter > span').style.width=(progress*100).toFixed(1)+'%';el.setAttribute('aria-label',`Клумба ${i+1}: ${label}`);});
    for(const f of friends)$(f.id+'Friend').hidden=!s.friends.includes(f.id);
    const pending=tasks.filter(q=>q.done(s)&&!s.claimed.includes(q.id)).length;$('journal').classList.toggle('has-reward',pending>0);$('journal').setAttribute('aria-label',`Задания: ${pending} наград доступно`);
  }
  function openPanel(id,focus){$('toast').classList.remove('show');$(id).hidden=false;document.body.classList.add('modal-open');$(focus).focus()}
  function closePanel(id,back){$(id).hidden=true;document.body.classList.remove('modal-open');$(back).focus()}
  function shop(){const list=$('friendsList');list.replaceChildren();for(const f of friends){const owned=s.friends.includes(f.id),row=document.createElement('div');row.className='row';row.innerHTML=`<svg viewBox="0 0 64 64"><use href="#${f.id}"/></svg><span><strong>${f.name}</strong><small>${f.desc}</small></span>`;const btn=document.createElement('button');btn.type='button';btn.disabled=owned||s.stars<f.cost;btn.textContent=owned?'Живёт здесь':'✦ '+f.cost;btn.onclick=()=>{if(owned||s.stars<f.cost)return;s.stars-=f.cost;s.friends.push(f.id);persist();render();shop();announce(f.name+' переехал!')};row.appendChild(btn);list.appendChild(row)}}
  function journal(){const list=$('journalList');list.replaceChildren();for(const q of tasks){const done=q.done(s),claimed=s.claimed.includes(q.id),row=document.createElement('div');row.className='journal-row';const copy=document.createElement('div');copy.innerHTML=`<strong>${q.title}</strong><small>${q.goal}</small>`;row.appendChild(copy);const btn=document.createElement('button');btn.type='button';btn.disabled=!done||claimed;btn.textContent=claimed?'Получено':done?`Забрать +${q.reward}`:`+${q.reward} ✦`;btn.onclick=()=>{if(!q.done(s)||s.claimed.includes(q.id))return;s.claimed.push(q.id);s.stars+=q.reward;persist();render();journal();announce(`Награда +${q.reward} звёзд!`);burst($('journal'),10)};row.appendChild(btn);list.appendChild(row)}}
  $('shop').onclick=()=>{shop();openPanel('sheet','close')};$('close').onclick=()=>closePanel('sheet','shop');$('sheet').addEventListener('click',e=>{if(e.target===$('sheet'))$('close').click()});
  $('journal').onclick=()=>{journal();openPanel('journalSheet','journalClose')};$('journalClose').onclick=()=>closePanel('journalSheet','journal');$('journalSheet').addEventListener('click',e=>{if(e.target===$('journalSheet'))$('journalClose').click()});
  $('weather').onclick=()=>{s.night=!s.night;persist();render();announce(s.night?'Зажглись ночные огоньки':'Взошло ласковое солнце')};
  $('bunny').onclick=()=>{const now=Date.now();burst($('bunny'),6);if(now-s.bunnyGift>=45000){s.stars++;s.bunnyGift=now;persist();render();announce('Пух нашёл ✦ звёздочку!')}else announce('Пух мурлычет от радости!')};
  for(const f of friends){$(f.id+'Friend').onclick=()=>{if(!s.friends.includes(f.id))return;const now=Date.now();if(now-(s.bonuses[f.id]||0)<f.cooldown){announce(f.name+' отдыхает');return}let result='';
    if(f.id==='bee'){const bed=s.beds.filter(x=>x&&x.readyAt>now).sort((a,b)=>a.readyAt-b.readyAt)[0];if(bed){bed.readyAt=Math.max(now,bed.readyAt-5000);result='Цветок растёт быстрее!'}else{s.stars++;result='+1 звёздочка'}}
    else if(f.id==='frog'){let n=0;for(const bed of s.beds)if(speedup(bed,now))n++;if(n)result='Полито клумб: '+n;else{s.stars++;result='Роса подарила звёздочку'}}
    else{s.stars+=3;result='+3 звезды от Рыжика!'}s.bonuses[f.id]=now;persist();render();burst($(f.id+'Friend'),9);announce(result)}}
  window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('journalSheet').hidden)$('journalClose').click();else if(!$('sheet').hidden)$('close').click()}});
  window.addEventListener('pagehide',persist);
  const ticker=setInterval(()=>{if(!document.hidden)render()},500);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
  persist();render();return {state:s,render,save:persist,dispose:()=>clearInterval(ticker)};
}
