// Pocket Covers can only launch a public game's LOCAL, transient gameplay.
// This module never creates PocketNet rooms, performs account operations,
// confirms destructive actions, or follows navigation links.
const BAD=/(pocket\s*net|pocketnet|multiplayer|multi.player|online|co.?op|join|invite|server|host|lobby|connect|sign.?in|log.?in|sign.?up|register|upload|cloud|sync|profile|shop|purchase|buy|delete|erase|clear data|reset|wipe|archive|админ|аккаунт|войти|регистрац|сервер|сеть|сетев|онлайн|комнат|друз|гост|присоедин|приглас|вместе|по коду|подключ|синхрон|покуп|магазин|очист|удал|стереть|сброс|архив|настро|settings|workshop|tools|quit|exit|back|назад|вернуть в|покинуть|меню|пауза|pause|restart|заново|повторить уровень|новая плёнка|сжечь)/i;
const START=/(^|\b)(start|play|new run|new game|continue game|continue run|single.?player|solo|training|begin|enter game|launch|take the camera|draw|take flight|resume game)(\b|$)|играть|начат|начать|начни|продолжить|тренировк|одиноч|одному|нарисовать|создать рисунок|сесть за стол|взять камеру|в небо|принять ключи|новый эфир|новая колония|свободная сборка|новая игра|запустить|погрузиться|отправиться|войти в игру|собирать|начать резню|первый день|новый забег/i;
const STRONG=/(solo|single.?player|offline|тренировк|одиноч|одному|нарисовать|сесть за стол|взять камеру|в небо|принять ключи|новый эфир|новая колония|свободная сборка|новый забег|new run)/i;
const ACTION_ID=/(^|[-_])(play|start|solo|launch|begin|continue|new[-_]?game|new[-_]?run)([-_]|$)/i;
const BAD_ID=/(^|[-_])(host|room|online|network|invite|join|settings|restart|reset|exit|sound|music|workshop|delete|archive|back|pause)([-_]|$)/i;
const clean=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,260);

export function scoreGameplayControl(control){
  const text=clean(control.text);
  const id=clean(control.id+' '+control.className).slice(0,180);
  const label=clean(control.ariaLabel);
  const content=[text,label,id].join(' ');
  if(control.tag!=='button'&&control.tag!=='input'&&control.tag!=='role-button')return {score:0,reason:'not a button'};
  if(control.disabled||control.hidden)return {score:0,reason:'not actionable'};
  if(control.link)return {score:0,reason:'navigation blocked'};
  if(BAD.test(content)||BAD_ID.test(id))return {score:0,reason:'unsafe or unrelated'};
  if(!START.test(text+' '+label) && !ACTION_ID.test(id) && !control.explicit)return {score:0,reason:'not gameplay'};
  let score=30;
  if(START.test(text+' '+label))score+=32;
  if(STRONG.test(text+' '+label))score+=30;
  if(ACTION_ID.test(id))score+=18;
  if(/(^|\s)(play|start|играть|начать|new run|single.?player|solo)(\s|$)/i.test(text))score+=12;
  if(control.explicit)score+=100;
  if(/continue|продолжить/i.test(text))score-=11;
  if(text.length>90)score-=4;
  return {score,reason:'local gameplay candidate'};
}

export function rankGameplayControls(controls,usedIds=[]){
  const used=new Set(usedIds);
  return controls
    .map((control,index)=>({...control,index,...scoreGameplayControl(control)}))
    .filter(control=>control.score>=58&&!used.has(control.key))
    .sort((a,b)=>b.score-a.score||a.index-b.index);
}

async function inspectControls(page){
  return page.evaluate(()=>{
    const selectors='button, input[type="button"], input[type="submit"], [role="button"]';
    const nodes=Array.from(document.querySelectorAll(selectors)).slice(0,220);
    const hasHiddenParent=element=>Boolean(element.closest('[hidden],[inert],[aria-hidden="true"]'));
    return nodes.map((element,index)=>{
      const rect=element.getBoundingClientRect();
      const style=getComputedStyle(element);
      const blocked=hasHiddenParent(element)||rect.width<6||rect.height<6||
        style.display==='none'||style.visibility==='hidden'||Number(style.opacity)<.12;
      const parentAnchor=element.closest('a[href]');
      const link=parentAnchor?.href||element.getAttribute('href')||'';
      const label=(element.tagName==='INPUT'?element.value:element.innerText||element.textContent||'');
      return {
        key:String(index)+':'+String(element.id||'')+':'+String(label).slice(0,48),
        index,tag:element.getAttribute('role')==='button'?'role-button':element.tagName.toLowerCase(),
        text:String(label).slice(0,260),id:element.id||'',
        ariaLabel:element.getAttribute('aria-label')||'',
        className:typeof element.className==='string'?element.className.slice(0,120):'',
        link,disabled:Boolean(element.disabled||element.getAttribute('aria-disabled')==='true'),
        hidden:blocked,explicit:element.hasAttribute('data-pw-cover-start')
      };
    });
  });
}

// A 2-step menu is common: "new game" -> "start". Follow only buttons
// satisfying the strict local-play classifier, and never repeat a control.
export async function enterCoverGameplay(page,{maxActions=2}={}){
  const actions=[],used=[];
  for(let step=0;step<maxActions;step++){
    const controls=await inspectControls(page);
    const ranked=rankGameplayControls(controls,used);
    const selected=ranked[0];
    if(!selected)break;
    try{
      await page.locator('button, input[type="button"], input[type="submit"], [role="button"]')
        .nth(selected.index).click({timeout:3500});
      used.push(selected.key);
      actions.push({label:clean(selected.text||selected.ariaLabel),id:selected.id,score:selected.score});
      await page.waitForTimeout(900);
      // A single action normally enters the game. A second action is allowed
      // only if a DIFFERENT launch button becomes newly visible on a menu.
      if(step===0){
        const after=await inspectControls(page);
        const next=rankGameplayControls(after,used)[0];
        const changed=!after.find(x=>x.key===selected.key&&!x.hidden);
        if(!changed||!next)break;
        if(next.text===selected.text&&next.id===selected.id)break;
      }
    }catch(error){
      actions.push({label:clean(selected.text),error:String(error.message).slice(0,100)});
      break;
    }
  }
  return {started:actions.some(a=>!a.error),actions};
}
