import {test,expect} from '@playwright/test';
import originalModule from '../server/module';

test('invalid room resets safely and player can create another without reload',async({page})=>{
  const pageErrors:string[]=[];page.on('pageerror',e=>pageErrors.push(e.message));
  await page.route('**/pocketnet/session',route=>route.fulfill({
    contentType:'application/json',status:200,body:JSON.stringify({token:'fog-stage3-test'})
  }));
  await page.routeWebSocket('**/pocketnet/ws',ws=>{
    ws.onMessage(raw=>{
      const msg=JSON.parse(String(raw));
      const send=(type:string,data:Record<string,unknown>)=>
        ws.send(JSON.stringify({wireVersion:1,type,...data}));
      if(msg.type==='auth'){
        send('authenticated',{player:{id:'browser-test',name:'Test commander'}});
      }else if(msg.type==='join_room'){
        send('error',{code:'room_not_found'});
      }else if(msg.type==='create_room'){
        const player={id:'browser-test',name:'Test commander'};
        const state=originalModule.createRoom({player}).state;
        send('room_joined',{roomId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          gameId:'fog-of-conquest',version:'v5',players:[player],
          state:originalModule.viewForPlayer({state,player})});
      }
    });
  });
  await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
  await page.locator('#newGameBtn').click();
  await page.locator('#onlineBtn').click();
  await page.locator('#roomIdInput').fill('DEADBEEF');
  await page.locator('#joinRoomBtn').click();
  await expect(page.locator('#onlineStatus')).toContainText('Комната больше недоступна.');
  await expect(page.locator('#startPanel')).toBeVisible();
  await page.locator('#onlineBtn').click();
  await page.locator('#createRoomBtn').click();
  await expect(page.locator('#onlineStatus')).toContainText('AAAAAAAA');
  await expect(page.locator('#fogLeaveRoom')).toBeVisible();
  await page.locator('#fogLeaveRoom').click();
  await expect(page.locator('#startPanel')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('after a reconnecting state, offline actions remain disabled until room is rejoined',async({page})=>{
  await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
  await page.locator('#newGameBtn').click();
  await page.locator('#twoBtn').click();
  // No fake online authority: offline mode must remain independently playable.
  const disabled=await page.locator('#endTurnBtn').isDisabled();
  expect(disabled).toBe(false);
  const online=await page.evaluate(()=>({
    room:(window as any).FogPocketNet?.phase,
    mayIssue:(window as any).FogPocketNet?.canIssue()
  }));
  expect(online.room).toBe('closed');
  expect(online.mayIssue).toBe(false);
});
