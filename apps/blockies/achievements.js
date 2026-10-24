import {blockiesAchievements} from '../../shared/capabilities/blockies-achievements.js';
const modal=document.querySelector('#achievements-modal');
const openButton=document.querySelector('#achievements-btn');
const list=document.querySelector('#achievements-list');
const status=document.querySelector('#achievements-status');
const count=document.querySelector('#achievements-count');
const refreshButton=document.querySelector('#achievements-refresh');
let earned=new Set(),verified=false,requestId=0;
const english=()=>localStorage.getItem('pocket-works:blockies:language')==='en';
const copy=(a,key)=>english()&&a[key+'En']?a[key+'En']:a[key];
function render(){
  list.replaceChildren();
  count.textContent=verified?earned.size+' / '+blockiesAchievements.length:'— / '+blockiesAchievements.length;
  const order=['Лёгкое','Среднее','Сложное','Легендарное'],translations=['Easy','Medium','Hard','Legendary'];
  for(const [i,tier] of order.entries()){
    const section=document.createElement('section');section.className='achievements-tier';
    const heading=document.createElement('h3');heading.textContent=english()?translations[i]:tier;section.append(heading);
    for(const a of blockiesAchievements.filter(a=>a.tier===tier)){
      const owned=verified&&earned.has(a.id);
      const card=document.createElement('article');card.className='achievement-card'+(owned?' is-earned':'');
      const icon=document.createElement('span');icon.className='achievement-icon';icon.textContent=String(blockiesAchievements.indexOf(a)+1).padStart(2,'0');
      const body=document.createElement('div');
      const title=document.createElement('h4');title.textContent=copy(a,'name');
      const detail=document.createElement('p');detail.textContent=copy(a,'detail');
      const reward=document.createElement('small');reward.textContent=copy(a,'reward');body.append(title,detail,reward);
      const mark=document.createElement('span');mark.className='achievement-state';
      mark.textContent=!verified?(english()?'Unverified':'Не проверено'):owned?(english()?'Earned':'Получено'):(english()?'Locked':'Закрыто');
      card.append(icon,body,mark);section.append(card);
    }
    list.append(section);
  }
}
async function refresh(){
  const current=++requestId;
  status.textContent=english()?'Checking Pocket Works account…':'Проверяем награды Pocket Works…';
  try{
    const response=await fetch('/pocket-social/achievements',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw Error([401,403].includes(response.status)?'guest':'network');
    const data=await response.json();
    if(current!==requestId)return;
    earned=new Set((data.achievements||[]).map(x=>x.id).filter(id=>blockiesAchievements.some(a=>a.id===id)));
    verified=true;
    status.textContent=english()?'Server-verified rewards · Online matches only.':'Награды подтверждены сервером · Засчитываются сетевые партии.';
  }catch(error){
    if(current!==requestId)return;
    verified=false;earned.clear();
    status.textContent=error.message==='guest'?
      (english()?'Sign in to Pocket Works to earn profile rewards.':'Войдите в Pocket Works, чтобы получать награды в профиль.'):
      (english()?'Cannot verify rewards. Retry while online.':'Нет связи с Pocket Social. Награды пока не проверены.');
  }
  render();
}
function toggle(visible){
  window.dispatchEvent(new CustomEvent('blockies:awards-visibility',{detail:{visible}}));
  modal.hidden=!visible;openButton.setAttribute('aria-expanded',String(visible));
  if(visible){void refresh();document.querySelector('#achievements-close').focus();}
  else openButton.focus();
}
openButton.addEventListener('click',()=>toggle(true));
document.querySelector('#achievements-close').addEventListener('click',()=>toggle(false));
refreshButton.addEventListener('click',()=>void refresh());
modal.addEventListener('click',e=>{if(e.target===modal)toggle(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden){e.stopImmediatePropagation();e.preventDefault();toggle(false)}},true);
window.addEventListener('blockies:award',event=>{
  const a=blockiesAchievements.find(a=>a.id===event.detail?.id);
  if(!a)return;void refresh();
  const toast=document.createElement('div');toast.className='achievement-toast';toast.setAttribute('role','status');
  toast.textContent=(english()?'Achievement unlocked: ':'Достижение открыто: ')+copy(a,'name');
  document.body.append(toast);setTimeout(()=>toast.remove(),4400);
});
window.addEventListener('online',()=>void refresh());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
render();void refresh();
