import {blockiesAchievements} from '../../shared/capabilities/blockies-achievements.js';

const catalog=new Map(blockiesAchievements.map(item=>[item.id,item]));
let lastToast=null;

export function showBlockiesAchievementToast(id){
  const award=catalog.get(id),node=document.getElementById('achievement-toast');
  if(!award||!node)return;
  node.replaceChildren();
  const title=document.createElement('strong');title.textContent='Новое достижение · '+award.name;
  const reward=document.createElement('span');reward.textContent=award.reward;
  node.append(title,reward);
  node.hidden=false;
  clearTimeout(lastToast);
  lastToast=setTimeout(()=>{node.hidden=true},5200);
  if(document.getElementById('achievements-screen')?.classList.contains('active'))void refreshAchievements();
}

let loading=false;
export async function refreshAchievements(){
  if(loading)return;
  const grid=document.getElementById('achievements-grid'),status=document.getElementById('achievements-progress');
  if(!grid||!status)return;
  loading=true;
  status.textContent='Проверяем награды Pocket ID…';
  try{
    const response=await fetch('/pocket-social/achievements',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8500)});
    if(response.status===401){
      grid.replaceChildren();
      status.textContent='Войдите в Pocket ID, чтобы сохранять достижения в профиле.';
      return;
    }
    if(!response.ok)throw Error('Не удалось загрузить достижения.');
    const body=await response.json();
    if(!Array.isArray(body.achievements))throw Error('Некорректный ответ сервера.');
    const earned=new Set(body.achievements.filter(a=>typeof a.id==='string').map(a=>a.id));
    const count=blockiesAchievements.filter(a=>earned.has(a.id)).length;
    status.textContent='Открыто '+count+' из '+blockiesAchievements.length;
    grid.replaceChildren();
    for(let i=0;i<blockiesAchievements.length;i++){
      const a=blockiesAchievements[i],unlocked=earned.has(a.id);
      const card=document.createElement('article');card.className='achievement-item';
      card.dataset.unlocked=String(unlocked);
      const countLabel=document.createElement('span');countLabel.className='achievement-index';
      countLabel.textContent=String(i+1).padStart(2,'0');
      const bodyEl=document.createElement('div');
      const heading=document.createElement('h3');heading.textContent=a.name;
      const detail=document.createElement('p');detail.textContent=a.detail;
      const prize=document.createElement('small');prize.textContent=a.reward;
      const tier=document.createElement('span');tier.className='achievement-tier';
      tier.textContent=unlocked?'ПОЛУЧЕНО':a.tier.toUpperCase();
      bodyEl.append(heading,detail,prize);
      card.append(countLabel,bodyEl,tier);grid.append(card);
    }
  }catch(error){
    grid.replaceChildren();
    status.textContent=(error?.name==='AbortError'?'Сервер долго не отвечает.':error?.message)||'Ошибка загрузки наград.';
  }finally{loading=false}
}
export function initBlockiesAchievements(ui){
  const btn=document.getElementById('achievements-btn');
  const back=document.getElementById('achievements-back');
  const retry=document.getElementById('achievements-retry');
  btn?.addEventListener('click',()=>{ui.showScreen('achievementsScreen');void refreshAchievements();});
  back?.addEventListener('click',()=>ui.showScreen('mainMenu'));
  retry?.addEventListener('click',()=>void refreshAchievements());
}
