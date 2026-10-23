import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});
test('PocketNet v10 permits two-player rune mode, server-owned editor commands and a real battle input stream',async({page})=>{
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.route('**/pocket-id/me',r=>r.fulfill({status:503,body:'offline'}));
 await page.route('**/pocketnet/session',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'v10-mock'})}));
 await page.addInitScript(()=>{
  const roomId='aabbbccc-0000-4000-8000-000000000000';
  const players=[{id:'host',name:'Маг камня'},{id:'guest',name:'Маг огня'}];
  const mock={mode:'rupture',schools:['stone','fire'],phase:'lobby',revision:0,commands:[],match:null,book:null,ready:false,socket:null};
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
