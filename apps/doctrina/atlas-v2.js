import {PROVINCES,FACTIONS,EDICTS,LAWS,DIPLOMACY,PETITIONS,newGame,validState,governmentName,enactEdict,enactLaw,foreignAction,choosePetition,endTurn,scoreState,warnings} from './core-v2.js';
import {installMobileRuntime} from '../../shared/mobile-runtime.js';
installMobileRuntime();
const SAVE_KEY='pocket-works:doctrina:atlas:v2';
const root=document.getElementById('app');
const safe=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function restore(){try{const v=JSON.parse(localStorage.getItem(SAVE_KEY));return validState(v)?v:null;}catch{return null;}}
const saved=restore();
let state=saved||newGame('crown',1348),chosen='capital',page='council',modal=saved?(state.phase==='finished'?'end':null):'start',notice='',soundContext;
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch{notify('Не удалось сохранить — хранилище заполнено.');}}
function notify(message){notice=message;const el=document.querySelector('.toast');if(el){el.textContent=message;el.classList.add('show');}}
function ping(f=420){if(state.flags?.sound===false)return;try{const Audio=window.AudioContext||window.webkitAudioContext;soundContext ||=new Audio();const o=soundContext.createOscillator(),g=soundContext.createGain();o.type='triangle';o.frequency.value=f;g.gain.value=.035;g.gain.exponentialRampToValueAtTime(.0001,soundContext.currentTime+.13);o.connect(g);g.connect(soundContext.destination);o.start();o.stop(soundContext.currentTime+.14);}catch{}}
function act(result){if(!result.ok){ping(170);notify(result.message);return;}ping(420);save();if(state.phase==='finished')modal='end';else if(state.petition)modal='petition';render();notify(result.message);}
const date=()=>['Весна','Лето','Осень','Зима'][(state.turn-1)%4]+' '+(1348+Math.floor((state.turn-1)/4));
