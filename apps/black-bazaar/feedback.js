// Small, deterministic game feedback layer. Never infer success from a button
// click: only snapshots sent by PocketNet can confirm a deal or consequence.
// No hidden item traits or private information from other players is inspected.
const fx=(kind,label)=>({kind,label});
const asArray=x=>Array.isArray(x)?x:[];
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);

/** Only messages inserted ahead of an overlapping prior log can count as new. */
export function newLogEntries(previous,current){
 const before=asArray(previous),after=asArray(current);
 if(!before.length||!after.length)return [];
 const first=before[0],at=after.indexOf(first);
 return at<0?[]:after.slice(0,at);
}
export function classifyFeedback(previous,next,myId){
 if(!previous||!next||previous.phase!=='play'||(next.phase!=='play'&&next.phase!=='done'))return null;
 if(previous.revision!=null&&next.revision!=null&&next.revision<=previous.revision)return null;
 const latest=newLogEntries(previous.log,next.log);
 // Select highest-significance occurrence of this network update, not a stack
 // of toasts/sounds when multiple transitions resolve within one round.
 const matching=(re)=>latest.some(line=>re.test(String(line)));
 if(matching(/Проклятие «.+» ударило/))return fx('curse','Проклятие сработало');
 if(matching(/избежал штрафа.+печать разряжена/))return fx('ward','Амулет защитил');
 if(matching(/провалил срочный заказ/))return fx('warning','Заказ провален');
 if(matching(/выполнил срочный заказ/))return fx('reward','Заказ выполнен');
 if(matching(/Прямая сделка между/))return fx('deal','Сделка заключена');
 if(matching(/Анонимный лот продан/))return fx('deal','Лот продан');
 if(matching(/купил «.+» у/))return fx('deal','Предмет продан');
 if(matching(/купил запечатанный предмет/))return fx('reward','Новая находка');
 if(matching(/разобрал предмет/))return fx('craft','Предмет разобран');
 if(matching(/сдал предмет в ломбард/))return fx('craft','Предмет сдан');
 if(matching(/обменял ресурсы в ломбарде/))return fx('reward','Ресурсы обменяны');
 if(matching(/получил доход от подработки/))return fx('reward','Подработка выполнена');
 if(matching(/оплатил независимую экспертизу/))return fx('inspect','Предмет проверен');
 if(matching(/перепаковал один предмет/))return fx('craft','Этикетка заменена');
 if(next.phase==='done'&&previous.phase!=='done')return fx('finish','Партия окончена');
 const prevYou=previous.you,nextYou=next.you;
 if(prevYou?.inspections&&nextYou?.inspections&&nextYou.inspections.length>prevYou.inspections.length)
  return fx('inspect','Предмет проверен');
 const previousBlack=asArray(previous.blackLots),nextBlack=asArray(next.blackLots);
 const previousBids=asArray(previous.bids),nextBids=asArray(next.bids);
 if(nextBids.length>previousBids.length||
   nextBids.some(b=>!same(previousBids.find(p=>p.buyer===b.buyer)?.offer,b.offer))||
   nextBlack.some(l=>{
     const prev=previousBlack.find(x=>x.id===l.id);
     return prev&&(l.bidCount>prev.bidCount||!same(l.myBid,prev.myBid)&&l.myBid);
   }))return fx('bid','Новая ставка');
 // Counteroffers often replace a previous deal one-for-one, so array length
 // alone cannot announce the message addressed to this player.
 if(asArray(next.deals).some(d=>d.to===myId&&!asArray(previous.deals).some(p=>p.id===d.id)))
  return fx('bid','Тебе предложили обмен');
 if(nextBlack.some(l=>l.myCounter?.id&&!previousBlack.some(p=>
   p.id===l.id&&p.myCounter?.id===l.myCounter.id)))
  return fx('bid','Посредник принёс встречную цену');
 if(matching(/На анонимном рынке появился новый лот/))return fx('reveal','Новый лот');
 if(!previous.listing&&next.listing)return fx('reveal','Новый лот');
 if(previous.round!==next.round)return fx('round','Новый раунд');
 if(previous.turnId!==next.turnId&&next.turnId===myId)return fx('turn','Твой ход');
 return null;
}
const sequences={
 gold:[[540,0,.055,'sine'],[760,.045,.075,'triangle']],
 crystals:[[820,0,.09,'sine'],[1160,.075,.14,'sine']],
 parts:[[285,0,.05,'triangle'],[390,.06,.065,'triangle']],
 tap:[[440,.035,.045,'sine']],
 open:[[350,.0,.055,'triangle'],[480,.07,.045,'sine']],
 close:[[390,.0,.046,'triangle']],
 bid:[[520,0,.10,'triangle'],[690,.075,.105,'sine']],
 deal:[[392,0,.11,'triangle'],[523,.095,.12,'triangle'],[784,.21,.19,'sine']],
 reward:[[660,0,.105,'sine'],[880,.12,.17,'triangle']],
 curse:[[210,0,.18,'sawtooth'],[148,.12,.24,'triangle']],
 warning:[[265,0,.14,'triangle'],[232,.18,.16,'triangle']],
 ward:[[474,0,.11,'sine'],[711,.12,.2,'sine']],
 craft:[[316,0,.045,'triangle'],[266,.065,.07,'square']],
 inspect:[[710,0,.045,'sine'],[940,.075,.14,'sine']],
 reveal:[[330,0,.10,'triangle'],[490,.11,.14,'sine']],
 round:[[392,0,.09,'sine'],[523,.12,.09,'sine']],
 turn:[[493,0,.08,'sine'],[622,.11,.1,'sine']],
 finish:[[392,0,.12,'triangle'],[523,.12,.12,'triangle'],[784,.25,.22,'sine']]
};
export function createAudioFeedback({storage=typeof localStorage==='undefined'?null:localStorage,
 AudioContextCtor=typeof window==='undefined'?null:(window.AudioContext||window.webkitAudioContext)}={}){
 const key='black-bazaar:sound',get=()=>{try{return storage?.getItem(key)}catch{return null}};
 let enabled=get()!=='off',context=null;
 const isEnabled=()=>enabled;
 function setEnabled(value){
  enabled=!!value;try{storage?.setItem(key,enabled?'on':'off')}catch{}
  if(!enabled&&context?.state==='running')context.suspend().catch(()=>{});
  return enabled;
 }
 function unlock(){
  if(!enabled||!AudioContextCtor)return;
  try{
   context??=new AudioContextCtor();
   if(context.state==='suspended')context.resume().catch(()=>{});
  }catch{context=null}
 }
 function play(kind){
  if(!enabled||!context||context.state!=='running')return false;
  const seq=sequences[kind]||sequences.tap,t=context.currentTime+.006;
  for(const [freq,at,duration,type] of seq){
   try{
    const source=context.createOscillator(),gain=context.createGain();
    source.type=type;source.frequency.setValueAtTime(freq,t+at);
    if(kind==='curse')source.frequency.exponentialRampToValueAtTime(Math.max(65,freq*.66),t+at+duration);
    const volume=kind==='curse'?.021:.036;
    gain.gain.setValueAtTime(.0001,t+at);
    gain.gain.exponentialRampToValueAtTime(volume,t+at+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,t+at+duration);
    source.connect(gain);gain.connect(context.destination);
    source.start(t+at);source.stop(t+at+duration+.012);
   }catch{return false}
  }
  return true;
 }
 return {isEnabled,setEnabled,unlock,play};
}
