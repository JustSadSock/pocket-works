'use strict';
const W=240,H=420,TAU=Math.PI*2,SAVE='pocket-works:pepelnick:save-v1';
const $=id=>document.getElementById(id), canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;
const ui={menu:$('menu'),rules:$('rules'),relic:$('relicScreen'),pause:$('pause'),end:$('end'),controls:$('controls'),top:$('topHud'),room:$('roomLabel'),boss:$('bossWrap'),toast:$('toast')};
let save=load(),mode='menu',last=performance.now(),shake=0,flash=0,room=1,kills=0,runCoal=0,frame=0,paused=false;
let player,enemies=[],shots=[],particles=[],texts=[],ashes=[],relicsOwned=[],roomDelay=0,boss=null;
const input={x:0,y:0,attack:false,dash:false,keys:new Set(),pointer:null};
const baseRelics=[
['Горячая кость','◆','Удары наносят +25% урона.','power'],['Пустой шлем','□','Максимальная жизнь +24.','hp'],['Шаг угольщика','»','Рывок восстанавливается на 20% быстрее.','dash'],['Крючок мясника','⌁','Третий удар притягивает слабых врагов.','hook'],['Пепельное сердце','♥','Казнь лечит 8 жизни.','executeHeal'],['Чёрный звон','◉','Идеальное уклонение выпускает ударную волну.','parryWave'],['Треснувшая чаша','∪','Воля заполняется на 35% быстрее.','will'],['Зуб великана','▲','Третий удар становится тяжелее и шире.','heavy'],['Сажа в глазах','✦','Первый удар после рывка критический.','dashCrit'],['Гвоздь паломника','†','Каждый пятый удар пробивает всех врагов.','pierce'],['Ржавая корона','♜','Урон растёт на 2% за каждого убитого врага.','crown'],['Мокрый пепел','≈','Враги замедляются после попадания.','slow'],['Сломанный нимб','○','Раз в зал смертельный удар оставляет 1 жизнь.','halo'],['Пепельная кожа','▦','Получаемый урон снижен на 18%.','armor'],['Колокол без языка','◇','Убийство сокращает откат рывка.','killDash'],['Чужая фаланга','⌐','Дальность серии увеличена.','range'],['Серое семя','✣','В начале зала лечит 12 жизни.','roomHeal'],['Осколок воли','Ψ','При полной Воле каждый удар выпускает искру.','willSpark']];
function load(){try{return Object.assign({embers:0,bestRoom:0,wins:0,up:{vital:0,edge:0,step:0},sound:true,vibe:true},JSON.parse(localStorage.getItem(SAVE)||'{}'))}catch{return{embers:0,bestRoom:0,wins:0,up:{vital:0,edge:0,step:0},sound:true,vibe:true}}}
function store(){localStorage.setItem(SAVE,JSON.stringify(save));updateMenu()}
function updateMenu(){
 $('embers').textContent=save.embers;$('bestRoom').textContent=save.bestRoom;$('wins').textContent=save.wins;
 const costs={vital:12+save.up.vital*14,edge:16+save.up.edge*18,step:20+save.up.step*20};
 for(const k in costs){const el=$(k+'Cost');el.textContent=save.up[k]>=5?'МАКС':costs[k]+' угля'}
}
let audio=null;function tone(freq=160,dur=.06,type='square',vol=.035){if(!save.sound)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+dur);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}catch{}}
function vibe(ms=15){if(save.vibe&&navigator.vibrate)navigator.vibrate(ms)}
function show(name){for(const k of ['menu','rules','relic','pause','end'])ui[k].classList.add('hidden');if(name)ui[name].classList.remove('hidden');const playing=!name;ui.controls.classList.toggle('hidden',!playing);ui.top.classList.toggle('hidden',!playing)}
function toast(t){ui.toast.textContent=t;ui.toast.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>ui.toast.classList.remove('show'),1000)}
function rnd(a,b){return a+Math.random()*(b-a)}function clamp(v,a,b){return Math.max(a,Math.min(b,v))}function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}function ang(a,b){return Math.atan2(b.y-a.y,b.x-a.x)}
function has(id){return relicsOwned.includes(id)}
function resetRun(){room=1;kills=0;runCoal=0;relicsOwned=[];boss=null;enemies=[];shots=[];particles=[];texts=[];player={x:120,y:326,r:7,maxHp:92+save.up.vital*8,hp:92+save.up.vital*8,power:10+save.up.edge,will:0,speed:72,face:-Math.PI/2,combo:0,comboT:0,attackT:0,dashT:0,dashCd:0,dashes:2,inv:0,hurt:0,hits:0,halo:true};spawnRoom()}
function spawnRoom(){enemies=[];shots=[];boss=null;player.x=120;player.y=330;player.hp=Math.min(player.maxHp,player.hp+(has('roomHeal')?12:0));player.halo=true;roomDelay=0;const count=room===7?1:2+room;
 if(room===7){boss=makeEnemy('boss',120,92);enemies.push(boss);ui.boss.classList.add('show')}else{ui.boss.classList.remove('show');for(let i=0;i<count;i++){const types=room<2?['husk']:room<4?['husk','archer','wisp']:['husk','archer','wisp','brute'];enemies.push(makeEnemy(types[(Math.random()*types.length)|0],rnd(32,208),rnd(84,245)))} }
 ui.room.textContent='ЗАЛ '+roman(room)+' / Ⅶ';toast(room===7?'ХРАНИТЕЛЬ ПРОСНУЛСЯ':'ЗАЛ '+room);tone(90,.2,'sawtooth',.05)}
function roman(n){return['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ'][n-1]}
function makeEnemy(type,x,y){const d={husk:[22,7,24],archer:[18,6,18],wisp:[14,5,28],brute:[48,10,14],boss:[360,18,19]}[type];return{type,x,y,r:d[1],hp:d[0]+room*3,maxHp:d[0]+room*3,speed:d[2],cd:rnd(.2,1.1),hurt:0,dead:false,phase:1,tele:0,slow:0,seed:Math.random()*99}}
