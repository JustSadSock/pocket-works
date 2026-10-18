import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});
async function mockPocketNet(page,{guest=false}={}){
 await page.route('**/pocket-id/me',route=>route.fulfill({status:503,body:'offline'}));
 await page.route('**/pocketnet/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'fake-pocketnet-token'})}));
 await page.addInitScript(({guest})=>{
  const roomId='aabbbccc-0000-4000-8000-000000000000';
  const players=[{id:'host',name:'Первый маг',avatar:'clay',verified:false},{id:'guest',name:'Второй маг',avatar:'wave',verified:false}];
  const mock={roomId,players,packetCount:0,commands:[],match:null,phase:'lobby',revision:1,code:'AABBBCCC',guest,picked:false,ready:false};
  const my=guest?1:0;
  const view=()=>({phase:mock.phase,revision:++mock.revision,host:'host',me:my,seats:['host','guest'],rulesVersion:1,match:mock.match,players,picked:mock.picked,ready:mock.ready,offers:['on_hurt','heal','double'],connected:true,opponentConnected:true});
  function event(socket,m){socket.onmessage?.({data:JSON.stringify({wireVersion:1,...m})})}
  function refresh(socket){event(socket,{type:'game_event',roomId,event:{type:'state',payload:view()}})}
  function join(socket){event(socket,{type:'room_joined',roomId,gameId:'perekos',version:'v1',state:view(),players})}
  class FakeWebSocket{
   static OPEN=1;static CLOSED=3;
   constructor(){this.readyState=0;mock.socket=this;setTimeout(()=>{if(this.readyState!==3){this.readyState=1;this.onopen?.()}},8)}
   async send(data){
    const msg=JSON.parse(data);mock.commands.push(msg);
    if(msg.type==='auth'){event(this,{type:'authenticated',player:{id:guest?'guest':'host',name:'Маг'}});return}
    if(msg.type==='create_room'||msg.type==='join_room'){join(this);return}
    if(msg.type!=='game_message')return;
    const p=msg.payload||{};
    if(p.type==='start'||p.type==='rematch'){
     const rules=await import('/apps/perekos/core.mjs');mock.match=rules.makeMatch(123);
     mock.phase='fight';mock.packetCount=0;mock.picked=false;mock.ready=false;
     refresh(this);
    }else if(p.type==='input'&&mock.phase==='fight'){
     mock.packetCount++;
     if(mock.packetCount>5){mock.phase='draft';mock.match.phase='draft';mock.match.score[0]=1;mock.match.lastWinner=0;refresh(this)}
     else if(mock.packetCount%2===0)refresh(this);
    }else if(p.type==='pick'&&mock.phase==='draft'){
     if(!mock.picked){mock.match.actors[my].runes.push(p.rune);mock.picked=true;refresh(this)}
    }else if(p.type==='ready'&&mock.phase==='draft'){
     const rules=await import('/apps/perekos/core.mjs');mock.ready=true;mock.match.actors[my].runes=[...p.runes];
     rules.startRound(mock.match);mock.phase='fight';mock.packetCount=0;refresh(this);
    }else if(p.type==='sync')refresh(this);
   }
   close(){this.readyState=3;this.onclose?.({})}
  }
  window.WebSocket=FakeWebSocket;window.__netMock=mock;
 },{guest});
}
test('PocketNet menu: create, room invitation, active fight, private rune and ready transition',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mockPocketNet(page);
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#online-open').click();
 await expect(page.locator('#online-lobby')).toBeVisible();
 await page.locator('#net-create').click();
 await expect(page.locator('#net-room-info')).toBeVisible();
 await expect(page.locator('#net-copy-code')).toHaveText('AABBBCCC');
 await expect(page.locator('#net-players .net-player')).toHaveCount(2);
 await expect(page.locator('#net-start')).toBeVisible();
 await page.locator('#net-start').click();
 await expect(page.locator('#controls')).toBeVisible({timeout:9000});
 await expect.poll(()=>page.evaluate(()=>window.__netMock.commands.filter(m=>m.payload?.type==='input').length),{timeout:6000}).toBeGreaterThan(5);
 await expect(page.locator('#draft')).toBeVisible({timeout:6000});
 await expect(page.locator('.rune-choice')).toHaveCount(3);
 await page.locator('.rune-choice').first().click();
 await expect(page.locator('#build')).toBeVisible();
 await expect(page.locator('.bench-slot')).toHaveCount(3);
 await page.locator('#bench-fight').click();
 await expect(page.locator('#controls')).toBeVisible();
 expect(await page.evaluate(()=>window.__netMock.commands.some(m=>m.payload?.type==='ready'))).toBe(true);
 expect(errors).toEqual([]);
});
test('friend accepts invite and joins on the second stable server seat',async({page})=>{
 await mockPocketNet(page,{guest:true});
 await page.goto('/apps/perekos/?room=AABBBCCC',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#online-lobby')).toBeVisible();
 await page.locator('#net-join').click();
 await expect(page.locator('#net-room-info')).toBeVisible();
 await expect(page.locator('#net-start')).toBeHidden();
 await expect(page.locator('#net-copy-code')).toHaveText('AABBBCCC');
 expect(await page.evaluate(()=>window.__netMock.commands.some(m=>m.type==='join_room'))).toBe(true);
 await page.locator('#net-back').click();
 await expect(page.locator('#menu')).toBeVisible();
});
