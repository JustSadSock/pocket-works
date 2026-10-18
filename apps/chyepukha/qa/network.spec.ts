import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});

async function runPocketRoom(page,mode='normal'){
 await page.addInitScript((socketMode)=>{
  const identity='00000000-0000-4000-8000-000000000001';
  const players=[
   {id:'qa-host',name:'Марта',verified:true,accountId:identity,avatar:'moss',submitted:false},
   {id:'qa-peer',name:'Олеся',verified:false,accountId:null,avatar:null,submitted:false}
  ];
  const settings={maxPlayers:4,questionSet:'custom',customQuestions:['Хто це?','Чим усе закінчилося?'],visibleTailWords:3,genre:'absurdComedy',customGenre:''};
  function state(){
   const phase=sessionStorage.getItem('chyepukha-qa-phase')||'lobby';
   const common={protocol:1,revision:1,phase,host:'qa-host',players,settings,round:0,total:2,
    questionSets:[{id:'custom',label:'Свій набір'}],genres:[{id:'absurdComedy',label:'Абсурдна комедія'}]};
   if(phase==='writing')return {...common,sheet:{id:'sheet-0',set:'custom',setLabel:'Свій набір',genre:'absurdComedy',genreLabel:'Абсурдна комедія',starter:'Марта',gender:null,question:{prompt:'Хто це був?',guidance:'Опиши героя',creativeFreedom:'Пиши сміливо'},tail:''},waiting:false};
   if(phase==='waiting')return {...common,phase:'writing',sheet:{id:'sheet-0',set:'custom',setLabel:'Свій набір',genre:'absurdComedy',genreLabel:'Абсурдна комедія',starter:'Марта',gender:null,question:{prompt:'Хто це був?'},tail:''},waiting:true};
   if(phase==='finished')return {...common,phase:'finished',round:2,stories:[{id:'sheet-0',starter:'Марта',setLabel:'Свій набір',genre:'Абсурдна комедія',heroGender:'unspecified',fragments:[{answer:'Марта загубила древній ключ',author:'Марта',question:'Хто це?'},{answer:'Ключ знайшли у печері',author:'Олеся',question:'Чим усе закінчилося?'}]}]};
   return common;
  }
  class FakeSocket {
   static OPEN=1;static CLOSED=3;
   readyState=0;closed=false;messages=[];
   constructor(url){this.url=url;window.__chySockets??=[];window.__chySockets.push(this);setTimeout(()=>{if(this.closed)return;this.readyState=1;this.onopen?.()},4)}
   respond(message){if(!this.closed)this.onmessage?.({data:JSON.stringify(message)})}
   send(text){
    const packet=JSON.parse(text);this.messages.push(packet);
    if(packet.type==='auth'){
     if(socketMode!=='stalled')this.respond({type:'authenticated',player:{id:'qa-host',name:'Марта',accountId:identity,verified:true}});
    }else if(packet.type==='create_room'||packet.type==='join_room'){
     this.respond({type:'room_joined',roomId:'abcdef12',gameId:'chyepukha',version:'v3',state:state()});
    }else if(packet.type==='game_message'){
     if(packet.payload?.type==='start'){
      sessionStorage.setItem('chyepukha-qa-phase','writing');
      this.respond({type:'game_event',event:{type:'state',payload:state()}});
     }else if(packet.payload?.type==='submit'){
      sessionStorage.setItem('chyepukha-qa-phase','waiting');
      this.respond({type:'game_event',event:{type:'state',payload:state()}});
     }else if(packet.payload?.type==='sync')this.respond({type:'game_event',event:{type:'state',payload:state()}});
    }
   }
   close(){if(this.closed)return;this.closed=true;this.readyState=3;this.onclose?.({})}
  }
  window.WebSocket=FakeSocket;
  window.__finishQaGame=()=>{
   sessionStorage.setItem('chyepukha-qa-phase','finished');
   const socket=window.__chySockets?.at(-1);socket?.respond({type:'game_event',event:{type:'state',payload:state()}});
  };
  window.__qaDisconnect=()=>window.__chySockets?.at(-1)?.close();
 },mode);
 const identity=mode==='guest'?null:{id:'00000000-0000-4000-8000-000000000001',nickname:'Марта',complete:true,avatar:'moss'};
 await page.route('**/pocket-id/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:identity})}));
 await page.route('**/pocket-social/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({profile:{id:identity?.id||'',artwork:'',maskot:null}})}));
 await page.route('**/pocketnet/health',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,modules:['chyepukha']})}));
 await page.route('**/pocketnet/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'a'.repeat(64)})}));
}
async function newRoom(page){
 await page.goto('/apps/chyepukha/index.html');
 await expect(page.locator('.home-identity.is-member')).toBeVisible();
 await page.locator('#createForm button').click();
 await expect(page.locator('.room')).toBeVisible();
 await expect(page.locator('.code')).toContainText('ABCDEF12');
}
test('verified account can create a v3 room, play, submit a fragment and read final result',async({page})=>{
 await runPocketRoom(page);
 await newRoom(page);
 await page.locator('[data-act=start]').click();
 await expect(page.locator('#answer')).toBeVisible();
 await page.locator('#answer').fill('Архіваріус знайшов чудернацьке дзеркало у старій башті');
 await page.locator('.word').nth(0).click();
 await page.locator('.word').nth(2).click();
 await page.locator('.word').nth(4).click();
 await expect(page.locator('.word.selected')).toHaveCount(3);
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.wax')).toBeVisible();
 await page.evaluate(()=>window.__finishQaGame());
 await expect(page.locator('.story-paper')).toContainText('Марта загубила древній ключ');
 await expect(page.locator('.story-paper')).toContainText('Ключ знайшли у печері');
 await expect(page.locator('[data-act=copy-story]')).toBeVisible();
});

test('draft survives real page reload and reconnecting into an active writing round',async({page})=>{
 await runPocketRoom(page);
 await newRoom(page);
 await page.locator('[data-act=start]').click();
 await page.locator('#answer').fill('Цей рукопис варто зберегти навіть після перезавантаження');
 await page.reload();
 await expect(page.locator('#answer')).toHaveValue('Цей рукопис варто зберегти навіть після перезавантаження');
 await expect(page.locator('.code')).toHaveCount(0);
 await expect(page.locator('#network')).toContainText('ONLINE');
});

test('leaving the room while disconnected invalidates stored room token',async({page})=>{
 await runPocketRoom(page);
 await newRoom(page);
 await page.evaluate(()=>window.__qaDisconnect());
 await page.locator('[data-act=leave]').click();
 await expect(page.locator('[data-act=confirm-leave]')).toBeVisible();
 await page.locator('[data-act=confirm-leave]').click();
 await expect(page.locator('.home-cover')).toBeVisible();
 await expect(page.locator('.return-ticket')).toHaveCount(0);
 const previous=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('pocket-net:'+location.origin+'/pocketnet')||'null'));
 expect(previous?.roomId||null).toBeNull();
});

test('a stalled authenticated session is explicitly cancellable, then allows retry',async({page})=>{
 await runPocketRoom(page,'stalled');
 await page.goto('/apps/chyepukha/index.html');
 await expect(page.locator('#createForm button')).toBeEnabled();
 await page.locator('#createForm button').click();
 await expect(page.locator('[data-act=cancel-connect]')).toBeVisible();
 await page.locator('[data-act=cancel-connect]').click();
 await expect(page.locator('.home-cover')).toBeVisible();
 await expect(page.locator('#createForm button')).toBeEnabled();
});

test('guest username is persisted and the same room resumes after reload',async({page})=>{
 await runPocketRoom(page,'guest');
 await page.goto('/apps/chyepukha/index.html');
 await expect(page.locator('.home-identity.is-guest')).toBeVisible();
 await page.locator('#guestNick').fill('Олеся');
 await page.locator('#createForm button').click();
 await expect(page.locator('.room')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('pocket-works:chyepukha:name'))).toBe('Олеся');
 await page.reload();
 await expect(page.locator('.room')).toBeVisible();
 await expect(page.locator('.code')).toContainText('ABCDEF12');
});
