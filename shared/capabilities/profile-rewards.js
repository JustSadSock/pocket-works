import {zamazkaAchievements} from './zamazka-achievements.js';
import {canticaAchievements} from './cantica-achievements.js';
import {blockiesAchievements} from './blockies-achievements.js';

// The collection describes real entitlements; it never grants them. Ownership
// is always the list returned by Pocket Social, not local UI state.
const codeRewards=[
  {id:'astronaut',name:'Космонавт',detail:'Награда за специальный код PocketWorks.',reward:'Шлем космонавта и скафандр',items:[{slot:'hat',item:'helmet'},{slot:'clothes',item:'spacesuit'}]},
  {id:'wedding',name:'Свадебный образ',detail:'Награда за специальный код PocketWorks.',reward:'Фата и свадебный наряд',items:[{slot:'hat',item:'veil'},{slot:'clothes',item:'wedding'}]},
  {id:'knight',name:'Страж',detail:'Награда за специальный код PocketWorks.',reward:'Бацинет стража',items:[{slot:'hat',item:'bascinet'}]},
  {id:'herald',name:'Герольд',detail:'Награда за специальный код PocketWorks.',reward:'Накидка герольда',items:[{slot:'clothes',item:'tabard'}]},
  {id:'groom',name:'Жених',detail:'Награда за специальный код PocketWorks.',reward:'Свадебный мужской костюм',items:[{slot:'clothes',item:'groom'}]},
  {id:'seoul-artist',name:'Лунная сцена',detail:'Награда за специальный код PocketWorks.',reward:'Лунная шпилька и сценический ханбок',items:[{slot:'hat',item:'stage-pin'},{slot:'clothes',item:'stage-hanbok'}]},
  {id:'yasya-diadem',name:'Диадема тихого хаоса',detail:'Личный предмет Яси. Активируется отдельным кодом.',reward:'Диадема тихого хаоса',items:[{slot:'hat',item:'quiet-chaos'}]},
  {id:'yasya-guardian',name:'Личный телохранитель',detail:'Личный предмет Яси. Активируется отдельным кодом.',reward:'Белый кролик на плече',items:[{slot:'accessory',item:'tiny-guardian'}]},
  {id:'dragon-keeper',name:'Хранитель дракона',detail:'Награда за специальный код PocketWorks.',reward:'Изумрудный дракон на плече',items:[{slot:'accessory',item:'shoulder-dragon'}]}
];
export const profileRewardSources=[
  {id:'zamazka',name:'Замазка',kind:'game',rewards:zamazkaAchievements.map(a=>({
    id:a.id,name:a.name,detail:a.detail,tier:a.tier,reward:a.reward,items:[{slot:a.slot,item:a.item}]
  }))},
  {id:'cantica',name:'Cantica',kind:'game',rewards:canticaAchievements.map(a=>({
    id:a.id,name:a.name,detail:a.detail,tier:a.tier,reward:a.reward,items:[{slot:a.slot,item:a.item}]
  }))},
  {id:'blockies',name:'Blockies',kind:'game',rewards:blockiesAchievements.map(a=>({
    id:a.id,name:a.name,detail:a.detail,tier:a.tier,reward:a.reward,items:[{slot:a.slot,item:a.item}]
  }))},
  {id:'pocketworks',name:'PocketWorks',kind:'system',rewards:codeRewards.map(a=>({...a,tier:'Код'}))}
];
export const profileRewardById=new Map(profileRewardSources.flatMap(group=>group.rewards.map(a=>[a.id,a])));

export function collectProfileRewards(unlocks=[],games=[]){
  const owned=new Set(Array.isArray(unlocks)?unlocks.filter(id=>typeof id==='string'):[]);
  // Keep the retired combined entitlement from the original release functional.
  if(owned.has('yasya-chaos')){owned.add('yasya-diadem');owned.add('yasya-guardian')}
  const groups=profileRewardSources.map(g=>({...g,rewards:g.rewards.map(r=>({...r,earned:owned.has(r.id)}))}));
  const known=new Set([...profileRewardById.keys(),'yasya-chaos']);
  // Entitlements from future games must not disappear just because the shell
  // has not received their achievement metadata yet. Display only what the
  // trusted server has already unlocked; never fabricate locked achievements.
  for(const id of owned){
    if(known.has(id))continue;
    const sourceId=id.includes('.')?id.split('.')[0]:'pocketworks';
    let group=groups.find(g=>g.id===sourceId);
    if(!group){
      group={id:sourceId,name:games.find(g=>g.slug===sourceId)?.name||sourceId,
        kind:'game',rewards:[]};
      groups.push(group);
    }
    group.rewards.push({id,name:id,detail:'Получено в игре. Описание награды пока не добавлено в каталог PocketWorks.',
      tier:'Получено',reward:'Награда аккаунта',items:[],earned:true,unknown:true});
  }
  return groups.map(group=>({...group,earned:group.rewards.filter(r=>r.earned).length,total:group.rewards.length}));
}
export function rewardIsEquipped(reward,draft){
  if(!reward?.items?.length||!draft)return false;
  return reward.items.every(({slot,item})=>
    ['hat','clothes','face','animal','accessory'].includes(slot)?draft.maskot?.[slot]===item:
      slot==='title'?draft.title===item:
      slot==='background'?draft.background===item&&draft.backgroundMode!=='drawing':
      slot==='portraitFrame'?draft.portraitFrame===item:
      false);
}
export function equipProfileReward(reward,draft){
  if(!reward?.items?.length||!draft)return draft;
  const updated={...draft,maskot:{...draft.maskot}};
  for(const {slot,item} of reward.items){
    if(['hat','clothes','face','animal','accessory'].includes(slot))updated.maskot[slot]=item;
    else if(slot==='title')updated.title=item;
    else if(slot==='background'){updated.background=item;updated.backgroundMode='preset';}
    else if(slot==='portraitFrame')updated.portraitFrame=item;
  }
  return updated;
}
