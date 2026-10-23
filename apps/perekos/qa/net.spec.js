import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});
async function mockPocketNet(page,{guest=false}={}){
 await page.route('**/pocket-id/me',route=>route.fulfill({status:503,body:'offline'}));
 await page.route('**/pocketnet/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'fake-pocketnet-token'})}));
 await page.addInitScript(({guest})=>{
  const roomId='aabbbccc-0000-4000-8000-000000000000';
  const players=[{id:'host',name:'Первый маг',avatar:'clay',verified:false},{id:'guest',name:'Второй маг',avatar:'wave',verified:false}];
  const mock={roomId,players,packetCount:0,commands:[],match:null,phase:'lobby',revision:1,code:'AABBBCCC',guest,picked:false,ready:false,makeMatch:null,startRound:null};
  const my=guest?1:0;
  const view=()=>({phase:mock.phase,revision:++mock.revision,host:'host',me:my,seats:['host','guest'],rulesVersion:9,match:mock.match,players,mages:['kindle','wire'],picked:mock.picked,ready:mock.ready,offers:['on_hurt','heal','double'],connected:true,opponentConnected:true});
  function event(socket,m){socket.onmessage?.({data:JSON.stringify({wireVersion:1,...m})})}
  function refresh(socket){event(socket,{type:'game_event',roomId,event:{type:'state',payload:view()}})}
  function join(socket){event(socket,{type:'room_joined',roomId,gameId:'perekos',version:'v9',state:view(),players})}
  class FakeWebSocket{
   static OPEN=1;static CLOSED=3;
   constructor(){this.readyState=0;mock.socket=this;setTimeout(()=>{if(this.readyState!==3){this.readyState=1;this.onopen?.()}},8)}
   async send(data){
    const msg=JSON.parse(data);mock.commands.push(msg);
    if(msg.type==='auth'){event(this,{type:'authenticated',player:{id:guest?'guest':'host',name:'Маг'}});return}
    if(msg.type==='create_room'||msg.type==='join_room'){join(this);return}
    if(msg.type!=='game_message')return;
    const p=msg.payload||{};
    if(p.type==='mage'){mock.commands.push({kind:'mage_selected',mageId:p.mageId});return}
    if(p.type==='start'||p.type==='rematch'){
     mock.match=mock.makeMatch(123);
     mock.phase='fight';mock.packetCount=0;mock.picked=false;mock.ready=false;
     refresh(this);
    }else if(p.type==='input'&&mock.phase==='fight'){
     mock.packetCount++;
     if(mock.packetCount>5){mock.phase='draft';mock.match.phase='draft';mock.match.score[0]=1;mock.match.lastWinner=0;refresh(this)}
     else if(mock.packetCount%2===0)refresh(this);
    }else if(p.type==='pick'&&mock.phase==='draft'){
     if(!mock.picked){mock.match.actors[my].runes.push(p.rune);mock.picked=true;refresh(this)}
    }else if(p.type==='ready'&&mock.phase==='draft'){
     mock.ready=true;mock.match.actors[my].runes=[...p.runes];
     mock.startRound(mock.match);mock.phase='fight';mock.packetCount=0;refresh(this);
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
 await page.evaluate(async()=>{const core=await import('/apps/perekos/core.mjs');window.__netMock.makeMatch=core.makeMatch;window.__netMock.startRound=core.startRound});
 await page.locator('#online-open').click();
 await expect(page.locator('#online-lobby')).toBeVisible();
 await page.locator('#net-create').click();
 await expect(page.locator('#net-room-info')).toBeVisible();
 await expect(page.locator('#net-copy-code')).toHaveText('AABBBCCC');
 await expect(page.locator('#net-players .net-player')).toHaveCount(2);
 await expect(page.locator('#net-start')).toBeVisible();
 await page.locator('#net-start').click();
 await expect(page.locator('#hud')).toBeVisible({timeout:9000});
 await expect.poll(()=>page.evaluate(()=>window.__netMock.commands.filter(m=>m.payload?.type==='input').length),{timeout:6000}).toBeGreaterThan(5);
 await expect(page.locator('#draft')).toBeVisible({timeout:6000});
 await expect(page.locator('.rune-choice')).toHaveCount(3);
 await page.locator('.rune-choice').first().click();
 await expect(page.locator('#build')).toBeVisible();
 await expect(page.locator('.bench-slot')).toHaveCount(3);
 await page.locator('#bench-fight').click();
 await expect(page.locator('#hud')).toBeVisible();
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

test('PocketNet v10 permits two-player rune mode, server-owned editor commands and a real battle input stream',async({page})=>{
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.route('**/pocket-id/me',r=>r.fulfill({status:503,body:'offline'}));
 await page.route('**/pocketnet/session',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'v10-mock'})}));
 await page.addInitScript(()=>{
  const roomId='aabbbccc-0000-4000-8000-000000000000';
  const players=[{id:'host',name:'Маг камня'},{id:'guest',name:'Маг огня'}];
  const mock={mode:'rupture',schools:['fire','fire'],phase:'lobby',revision:0,commands:[],match:null,book:null,ready:false,socket:null};
  const push=(type,data)=>mock.socket?.onmessage?.({data:JSON.stringify({wireVersion:1,type,...data})});
  const view=()=>({phase:mock.phase,revision:++mock.revision,host:'host',me:0,seats:['host','guest'],
    rulesVersion:10,gameMode:mock.mode,schools:mock.schools,mages:['kindle','wire'],
    archetypes:['striker','shaper'],match:mock.match,loadout:mock.book,picked:false,
    ready:mock.ready,nextSeq:0,players,connected:true,opponentConnected:true});
  const refresh=()=>push('game_event',{roomId,event:{type:'state',payload:view()}});
  class WebSocketMock{
   constructor(){this.readyState=0;mock.socket=this;setTimeout(()=>{this.readyState=1;this.onopen?.()},8)}
   send(data){
    const msg=JSON.parse(data);mock.commands.push(msg);
    if(msg.type==='auth'){push('authenticated',{player:{id:'host',name:'Маг'}});return}
    if(msg.type==='create_room'){
     push('room_joined',{roomId,gameId:'perekos',version:'v10',state:view(),players});return;
    }
    if(msg.type!=='game_message')return;
    const p=msg.payload||{};
    if(p.type==='mode'){mock.mode=p.gameMode;refresh()}
    else if(p.type==='magic-school'){mock.schools[0]=p.school;refresh()}
    else if(p.type==='start'&&mock.mode==='magic-v2'){
     mock.book=window.__netMagic.createMagicLoadout(mock.schools[0],{starter:'attack'});
     for(const id of ['u_on_cast','u_guard','st_shards','st_wall','u_size']){
      const add=window.__netMagic.grantEarnedMagicRune(mock.book,id);
      if(add.ok)mock.book=add.state;
     }
     mock.match=window.__netMagic.makeMagicV2Practice(mock.schools[0]);
     mock.match.gameMode='duel';mock.match.magicLoadouts[0]=mock.book;
     mock.match.magicLoadouts[1]=window.__netMagic.createMagicLoadout('fire',{starter:'attack'});
     mock.match.magicSchool=mock.schools[0];
     mock.phase='magic-build';refresh();
    }
    else if(p.type==='magic-edit'&&mock.phase==='magic-build'){
     const reply=window.__netMagic.applyMagicEdit(mock.book,p.command);
     if(reply.ok){mock.book=reply.state;mock.match.magicLoadouts[0]=mock.book;refresh()}
    }
    else if(p.type==='magic-ready'&&mock.phase==='magic-build'){
     mock.ready=true;refresh();
     mock.phase='fight';mock.match.phase='fight';mock.ready=false;refresh();
    }
    else if(p.type==='sync')refresh();
   }
   close(){this.readyState=3;this.onclose?.({})}
  }
  WebSocketMock.OPEN=1;
  window.WebSocket=WebSocketMock;window.__netV10=mock;
 });
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
  const [rules,core]=await Promise.all([import('/apps/perekos/magic-v2-rules.mjs'),import('/apps/perekos/core.mjs')]);
  window.__netMagic={createMagicLoadout:rules.createMagicLoadout,
   grantEarnedMagicRune:rules.grantEarnedMagicRune,applyMagicEdit:rules.applyMagicEdit,
   makeMagicV2Practice:core.makeMagicV2Practice};
 });
 await page.locator('#online-open').click();await page.locator('#net-create').click();
 await expect(page.locator('#net-mode-magic-v2')).toBeEnabled();
 await page.locator('#net-mode-magic-v2').click();
 await expect(page.locator('#net-school-area')).toBeVisible();
 await page.locator('#net-school-options .v2-stone').click();
 await page.locator('#net-start').click();
 await expect(page.locator('#magic-v2')).toBeVisible();
 await expect(page.locator('.v2-kicker')).toContainText('Камень');
 await page.locator('.v2-tab').nth(1).click();
 const avail=page.locator('.v2-reserve-item').filter({hasText:'При выстреле'});
 await avail.locator('.v2-equip').first().click();
 await page.locator('.v2-reserve-item').filter({hasText:'Защититься'}).locator('.v2-equip').first().click();
 await expect(page.locator('.v2-editor .v2-installed')).toHaveCount(2);
 page.once('dialog',d=>d.accept());await page.locator('.v2-seal').click();
 await expect(page.locator('.v2-sealed')).toHaveCount(1);
 expect(await page.evaluate(()=>window.__netV10.commands.some(x=>x.payload?.type==='magic-edit'&&x.payload?.command?.type==='seal'))).toBe(true);
 await page.locator('.v2-play').click();
 await expect(page.locator('#hud')).toBeVisible({timeout:8000});
 await expect.poll(()=>page.evaluate(()=>window.__netV10.commands.filter(x=>x.payload?.type==='input').length),{timeout:5000}).toBeGreaterThan(0);
 expect(pageErrors).toEqual([]);
});
