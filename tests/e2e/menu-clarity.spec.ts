import {expect,test,type Page,type TestInfo} from '@playwright/test';
import {assertNoHorizontalOverflow,attachCriticalScreenshot} from './helpers';

async function boot(page:Page){
  await page.addInitScript(()=>{
    const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    let user:any={id,nickname:'Илья',avatar:'clay',complete:true,linkedGoogle:false,entitlements:[]};
    let profile:any={...user,owned:true,background:'forest',backgroundMode:'preset',frame:'clean',portraitFrame:'wood',
      artwork:'',maskot:{animal:'cat',hat:'beret',clothes:'tunic',face:'none'},title:'',favoriteGame:'zamazka',
      unlocked:[],discoverable:true,presenceVisible:true,allowInvites:true};
    const friends=['Яся','Елисей','Длинный_никнейм_игрока'].map((nickname,i)=>({...profile,id:`friend-${i}`,nickname,owned:false,online:i<2,
      activity:i===0?{gameId:'zamazka',players:2,maxPlayers:6,joinable:true}:null}));
    const original=window.fetch.bind(window);(window as any).__menuWrites=[];
    window.fetch=async(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof Request?input.url:String(input),location.href);
      const body=init?.body?JSON.parse(String(init.body)):null;
      if(body)(window as any).__menuWrites.push(url.pathname);
      let data:any=null;
      if(url.pathname==='/pocket-id/me')data={user};
      if(url.pathname==='/pocket-id/config')data={googleEnabled:true,avatars:[]};
      if(url.pathname==='/pocket-id/global-archive')data={archived:[],pinned:[],canManage:false};
      if(url.pathname==='/pocket-id/profile'){user={...user,...body};profile.nickname=user.nickname;data={user};}
      if(url.pathname==='/pocket-id/logout'){user=null;data={ok:true};}
      if(url.pathname==='/pocket-social/profile'&&(window as any).__failMenuSave)return new Response(JSON.stringify({error:'network'}),{status:503,headers:{'content-type':'application/json'}});
      if(url.pathname==='/pocket-social/profile'){profile={...profile,...body};data={profile};}
      if(url.pathname==='/pocket-social/me')data=user?{profile,friends,incoming:[],outgoing:[],blocked:[],party:[],invites:(window as any).__menuInvites?[{id:'invite-one',incoming:true,status:'pending',fromId:'friend-0',fromName:'Яся',gameId:'zamazka',expiresAt:Date.now()+60000}]:[]}: {profile:null};
      if(url.pathname==='/pocket-social/sync')data={revision:'same'};
      if(url.pathname==='/pocket-social/presence')data={ok:true};
      if(url.pathname==='/pocket-social/search')data={users:friends.filter(p=>p.nickname.includes(url.searchParams.get('q')||''))};
      if(url.pathname==='/pocket-social/user')data={profile:{...friends[0],friendship:'friends'}};
      if(url.pathname==='/pocket-cloud/usage')data={usedBytes:21000,maxBytes:16000000,freeBytes:15979000,usedItems:1,maxItems:160,byApp:[{app:'zamazka',usedBytes:21000,items:1}],items:[]};
      return data?new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}}):original(input,init);
    };
  });
  await page.goto('/',{waitUntil:'networkidle'});
  await expect.poll(()=>page.evaluate(()=>(window as any).PocketID?.getUser()?.nickname)).toBe('Илья');
  await page.locator('#pocket-id-trigger').click();
  await expect(page.locator('.pws-content h2')).toHaveText('Профиль');
}
async function shot(page:Page,info:TestInfo,name:string){
  await assertNoHorizontalOverflow(page);
  const delta=await page.locator('dialog[open]').evaluateAll(ds=>ds.map(d=>d.scrollWidth-d.clientWidth));
  expect(delta.every(x=>x<=1)).toBe(true);
  await attachCriticalScreenshot(page,info,name,{fullPage:false});
}

test('profile drafts survive tabs; cancel, discard and save are distinct',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page);await shot(page,info,'profile');
  await page.locator('[data-pws=edit-data]').click();
  await expect(page.locator('.pws-maskot-tabs')).toBeHidden();
  await page.locator('#pws-nickname').fill('Илья_новый');
  await page.locator('[data-pws-tab=friends]').click();
  await expect(page.locator('.pws-person')).toHaveCount(3);
  await shot(page,info,'friends');
  const height=await page.locator('.pws-person').first().evaluate(e=>e.getBoundingClientRect().height);expect(height).toBeLessThan(165);
  const join=await page.locator('[data-pws=join-friend]').boundingBox();expect(join!.height).toBeGreaterThanOrEqual(44);
  await page.locator('[data-pws-tab=profile]').click();
  await expect(page.locator('#pws-nickname')).toHaveValue('Илья_новый');
  await page.locator('[data-pws=close]').first().click();
  await expect(page.locator('.pw-confirm')).toBeVisible();await shot(page,info,'unsaved');
  await page.locator('.pw-confirm [data-choice=cancel]').click();
  await expect(page.locator('#pws-nickname')).toHaveValue('Илья_новый');
  await page.locator('[data-pws=save-profile]').click();
  await expect(page.locator('.pws-card__name')).toHaveText('Илья_новый');
  await page.locator('[data-pws=edit]').click();
  await page.locator('[data-pws=maskot-item][data-value=rabbit]').click();
  await shot(page,info,'appearance');
  await page.keyboard.press('Escape');
  await page.locator('.pw-confirm [data-choice=discard]').click();
  await expect(page.locator('.pws-dialog')).toBeHidden();
  await page.locator('#pocket-id-trigger').click();
  await expect(page.locator('.pws-card__name')).toHaveText('Илья_новый');
  expect(errors).toEqual([]);
});

test('privacy and sign-in stay inside one social window and protect pending changes',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page);await page.locator('[data-pws=privacy]').click();
  await expect(page.locator('#pws-account-host #pocket-id-signout')).toBeVisible();
  await expect(page.locator('#pocket-id-dialog')).toBeHidden();
  await page.locator('#pws-presence').uncheck();
  await shot(page,info,'privacy');
  await page.locator('#pocket-id-signout').click();
  await expect(page.locator('.pw-confirm')).toBeVisible();
  await page.locator('.pw-confirm [data-choice=cancel]').click();
  expect(await page.evaluate(()=>(window as any).__menuWrites.includes('/pocket-id/logout'))).toBe(false);
  await page.locator('[data-pws=save-privacy]').click();
  await expect(page.locator('#pws-presence')).not.toBeChecked();
  await page.locator('#pocket-id-recovery-action').click();
  await expect(page.locator('.pw-confirm')).toContainText('Прежний ключ перестанет работать');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>(window as any).__menuWrites.includes('/pocket-id/new-key'))).toBe(false);
  await page.locator('[data-pws=profile-back]').click();
  await page.locator('[data-pws-tab=friends]').click();
  await page.locator('[data-pws=open-user]').first().click();
  await expect(page.locator('[data-pws=block-friend]')).toBeHidden();
  await page.locator('.pws-more summary').click();
  await expect(page.locator('[data-pws=block-friend]')).toBeVisible();
  await shot(page,info,'friend-profile');
  await page.locator('[data-pws-tab=profile]').click();
  await page.locator('[data-pws=privacy]').click();
  await page.locator('#pocket-id-signout').click();
  await expect(page.locator('[data-pws=login]')).toBeVisible();
  await page.locator('[data-pws=close]').first().click();
  await page.locator('#pocket-id-trigger').click();
  await expect(page.locator('#pocket-id-dialog #pocket-id-save')).toBeVisible();
  expect(errors).toEqual([]);
});

test('settings and layout choices persist; destructive reset cancels safely',async({page},info)=>{
  await boot(page);await page.locator('[data-pws=close]').first().click();
  await page.locator('[data-deck-tools]').click();
  await expect(page.locator('#shelf-tools')).toContainText('Сохранения игр в неё не входят');
  await page.locator('#tools-density').selectOption('micro');
  await expect(page.locator('html')).toHaveAttribute('data-deck-density','micro');
  await shot(page,info,'settings');
  await page.locator('.shelf-tools__advanced>summary').click();
  await page.locator('#reset-shelf').click();
  await expect(page.locator('.pw-confirm')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-deck-density','micro');
  await page.locator('#tools-home-layout').click();
  await page.locator('[data-deck-size=continue][data-size-value=half]').click();
  await shot(page,info,'layout');
  await page.locator('#deck-editor-cancel').click();
  await page.locator('.pw-confirm [data-choice=cancel]').click();
  await expect(page.locator('#deck-editor')).toBeVisible();
  await page.locator('#deck-editor-cancel').click();
  await page.locator('.pw-confirm [data-choice=save]').click();
  await expect(page.locator('#deck-editor')).toBeHidden();
  await page.reload({waitUntil:'networkidle'});
  await expect(page.locator('html')).toHaveAttribute('data-deck-density','micro');
  await page.locator('#deck-customize').click();
  await expect(page.locator('[data-deck-size=continue][data-size-value=half]')).toHaveAttribute('aria-pressed','true');
});


test('failed profile save retains the draft and can be retried',async({page})=>{
  await boot(page);await page.locator('[data-pws=edit-data]').click();
  await page.locator('#pws-nickname').fill('Илья_тест');
  await page.evaluate(()=>(window as any).__failMenuSave=true);
  await page.locator('[data-pws=close]').first().click();
  await page.locator('.pw-confirm [data-choice=save]').click();
  await expect(page.locator('.pws-error')).toBeVisible();
  await expect(page.locator('#pws-nickname')).toHaveValue('Илья_тест');
  await expect(page.locator('.pws-dialog')).toBeVisible();
  await page.evaluate(()=>(window as any).__failMenuSave=false);
  await page.locator('[data-pws=save-profile]').click();
  await expect(page.locator('.pws-card__name')).toHaveText('Илья_тест');
});


test('incoming invitations show the player, game and a reachable join action',async({page},info)=>{
  await boot(page);await page.locator('[data-pws=close]').first().click();
  await page.evaluate(()=>(window as any).__menuInvites=true);
  await page.locator('#pocket-id-trigger').click();
  await expect(page.locator('.pws-content h2')).toHaveText('Игровые приглашения');
  await expect(page.locator('.pws-person')).toContainText('Яся');
  await expect(page.locator('.pws-person')).toContainText('ЗАМАЗКА');
  const join=await page.locator('[data-pws=accept-invite]').boundingBox();expect(join!.height).toBeGreaterThanOrEqual(44);
  await shot(page,info,'invitation');
});

test('an unfinished painted background survives a visit to Friends',async({page},info)=>{
  await boot(page);await page.locator('[data-pws=edit]').click();
  await page.locator('[data-pws=maskot-tab][data-value=background]').click();
  await page.locator('[data-pws=background-mode][data-value=drawing]').click();
  await page.locator('[data-pws=paint-open]').click();
  const canvas=page.locator('.pws-studio-canvas');await canvas.scrollIntoViewIfNeeded();
  const box=(await canvas.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(90);
  await shot(page,info,'painting');
  await page.mouse.move(box.x+box.width*.3,box.y+box.height*.4);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5,{steps:6});await page.mouse.up();
  await page.locator('[data-pws-tab=friends]').click();
  await page.locator('[data-pws-tab=profile]').click();
  await expect(page.locator('.pws-drawing-choice__thumbnail img')).toBeVisible();
  await page.locator('[data-pws=save-profile]').click();
  await expect(page.locator('.pws-content .pws-card')).toHaveAttribute('data-background','drawing');
});
