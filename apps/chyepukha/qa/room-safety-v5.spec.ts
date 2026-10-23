import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});
async function install(page){
 await page.addInitScript(()=>{
  const identity='00000000-0000-4000-8000-000000000001';
  const players=[{id:'qa-host',name:'Марта',submitted:false,verified:true,accountId:identity,avatar:'moss'},
                 {id:'qa-guest',name:'Олеся',submitted:false,verified:false}];
  const settings={maxPlayers:4,questionSet:'custom',customQuestions:['Хто герой?','Як усе закінчилося?'],visibleTailWords:3,genre:'absurdComedy',showNextQuestion:true};
  const get=(k)=>sessionStorage.getItem('v5-qa-'+k);
  const set=(k,v)=>sessionStorage.setItem('v5-qa-'+k,String(v));
  const state=()=>{
   const phase=get('phase')||'lobby',last=get('received');
   const s={protocol:1,revision:Number(get('revision')||1),phase,round:0,total:2,host:'qa-host',
    players:players.map(p=>({...p,submitted:p.id==='qa-host'&&!!last})),settings,questionSets:[{id:'custom',label:'Свої питання'}],genres:[{id:'absurdComedy',label:'Абсурдна комедія'}],
    lastReceipt:last?{requestId:last,round:0,sheetId:'sheet-0',accepted:true}:null};
   if(phase==='writing')return {...s,waiting:!!last,sheet:{id:'sheet-0',set:'custom',setLabel:'Свої питання',genre:'absurdComedy',genreLabel:'Абсурдна комедія',starter:'Марта',gender:null,tail:'',question:{prompt:'Хто герой?',guidance:'Назви героя',creativeFreedom:'Не завершуй сюжет'},nextQuestion:'Як усе закінчилося?'}};
   return s;
  };
  window.__v5SendLog=[];
  window.__v5SetLoss=mode=>{window.__v5Loss=mode};
  class Socket{
   static OPEN=1;
   readyState=0;closed=false;
   constructor(){window.__v5Socket=this;setTimeout(()=>{if(this.closed)return;this.readyState=1;this.onopen?.()},3)}
   respond(x){if(!this.closed)this.onmessage?.({data:JSON.stringify(x)})}
   send(body){
    const packet=JSON.parse(body);window.__v5SendLog.push(packet);
    if(packet.type==='auth')this.respond({type:'authenticated',player:{id:'qa-host',name:'Марта',accountId:identity,verified:true}});
    if(packet.type==='create_room'||packet.type==='join_room')
      this.respond({type:'room_joined',roomId:'abcdef12-aaaa-4bbb-8ccc-abcdefabcdef',gameId:'chyepukha',version:'v5',state:state()});
    if(packet.type==='game_message'){
      if(packet.payload?.type==='start'){set('phase','writing');this.respond({type:'game_event',event:{type:'state',payload:state()}})}
      if(packet.payload?.type==='submit'){
       if(window.__v5Loss==='before'){
        window.__v5Loss=null;this.close();return;
       }
       const requestId=packet.payload.requestId;
       set('received',requestId);
       if(window.__v5Loss==='after'){window.__v5Loss=null;this.close();return}
       this.respond({type:'game_event',event:{type:'state',payload:state()}});
       this.respond({type:'game_event',event:{type:'receipt',payload:{requestId,round:0,sheetId:'sheet-0',accepted:true}}});
      }
      if(packet.payload?.type==='sync')this.respond({type:'game_event',event:{type:'state',payload:state()}});
    }
   }
   close(){if(this.closed)return;this.closed=true;this.readyState=3;this.onclose?.({})}
  }
  window.WebSocket=Socket;
 });
 await page.route('**/pocket-id/me',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:'00000000-0000-4000-8000-000000000001',nickname:'Марта',avatar:'moss',complete:true}})}));
 await page.route('**/pocket-social/me',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({profile:{id:'00000000-0000-4000-8000-000000000001',artwork:'',maskot:null}})}));
 await page.route('**/pocketnet/health',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,modules:['chyepukha']})}));
 await page.route('**/pocketnet/session',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'c'.repeat(64)})}));
}
async function start(page){
 await page.goto('/apps/chyepukha/index.html');
 await page.locator('#createForm button').click();
 await expect(page.locator('.room')).toBeVisible();
 await page.locator('[data-act=start]').click();
 await expect(page.locator('#answer')).toBeVisible();
}
async function manuscript(page){
 await page.locator('#answer').fill('Архіваріус знайшов таємничу флейту біля старої школи');
 await page.locator('#answerForm button[type=submit]').click();
 for(const i of [0,2,4])await page.locator('.word').nth(i).click();
}
test('temporary departure preserves the original seat and unsent local manuscript',async({page})=>{
 await install(page);await start(page);
 await page.locator('#answer').fill('Старий автор загубив листа на міському вокзалі');
 await page.locator('[data-act=leave]:visible').first().click();
 await expect(page.locator('[data-act=disconnect-room]')).toBeVisible();
 await page.locator('[data-act=disconnect-room]').click();
 await expect(page.locator('.return-ticket')).toBeVisible();
 await page.locator('.return-ticket').click();
 await expect(page.locator('#answer')).toHaveValue('Старий автор загубив листа на міському вокзалі');
 expect(await page.evaluate(()=>window.__v5SendLog.some(p=>p.type==='leave_room'))).toBe(false);
});
test('send before server receive: same requestId retries after socket loss',async({page})=>{
 await install(page);await start(page);await manuscript(page);
 await page.evaluate(()=>window.__v5SetLoss('before'));
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.dispatch-room')).toBeVisible({timeout:12000});
 const sends=await page.evaluate(()=>window.__v5SendLog.filter(x=>x.payload?.type==='submit').map(x=>x.payload.requestId));
 expect(sends.length).toBe(2);expect(sends[0]).toBe(sends[1]);
 const pending=await page.evaluate(()=>Object.keys(localStorage).filter(x=>x.includes(':submit:')&&x.includes('chyepukha')));
 expect(pending).toHaveLength(0);
});
test('server accepted before acknowledgement lost: reconnect confirms without duplicate',async({page})=>{
 await install(page);await start(page);await manuscript(page);
 await page.evaluate(()=>window.__v5SetLoss('after'));
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.dispatch-room')).toBeVisible({timeout:12000});
 const sends=await page.evaluate(()=>window.__v5SendLog.filter(x=>x.payload?.type==='submit').map(x=>x.payload.requestId));
 expect(sends).toHaveLength(1);
 const pending=await page.evaluate(()=>Object.keys(localStorage).filter(x=>x.includes(':submit:')&&x.includes('chyepukha')));
 expect(pending).toHaveLength(0);
});
