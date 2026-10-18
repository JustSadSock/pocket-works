import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:rules}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
const ROOM='01234567-0000-4000-8000-000000000001';

test('two real browser clients: private plans, simultaneous turns, reload and forfeit',async({browser})=>{
 const people=new Map(),tabs=new Set(),errors=[];
 let room=null;
 async function deliver(page,message){
  if(page.isClosed())return;
  await page.evaluate(msg=>{window.__trafficitySocket?.deliver(msg);},message).catch(()=>{});
 }
 async function broadcast(events){
  if(!room)return;
  for(const [page,session] of people){
   if(!tabs.has(page)||page.isClosed())continue;
   for(const e of events){
    if(e.to&&e.to!==session.id)continue;
    const event=e.type==='state'?{type:'state',payload:rules.viewForPlayer({state:room.state,player:session,players:room.players})}:e;
    await deliver(page,{type:'game_event',roomId:ROOM,event});
   }
  }
 }
 async function dispatch(page,data){
  const player=people.get(page);
  if(data.type==='auth'){await deliver(page,{type:'authenticated',player});return;}
  if(!player)throw Error('no authenticated session');
  if(data.type==='create_room'){
   room={players:[player],state:rules.createRoom({player}).state};tabs.add(page);
   await deliver(page,{type:'room_joined',roomId:ROOM,gameId:'trafficity',version:'v2',players:room.players,
    state:rules.viewForPlayer({state:room.state,player,players:room.players})});return;
  }
  if(data.type==='join_room'){
   if(!room||![ROOM,ROOM.slice(0,8)].includes(String(data.roomId).toLowerCase())){await deliver(page,{type:'error',code:'room_not_found'});return;}
   if(!room.players.some(p=>p.id===player.id)){
    const joined=rules.onJoin({state:structuredClone(room.state),player,players:[...room.players,player]});
    room.players.push(player);room.state=joined.state;
   }
   tabs.add(page);
   await deliver(page,{type:'room_joined',roomId:ROOM,gameId:'trafficity',version:'v2',players:room.players,
    state:rules.viewForPlayer({state:room.state,player,players:room.players})});
   await broadcast([{type:'state'}]);return;
  }
  if(data.type==='game_message'){
   const out=rules.onMessage({state:structuredClone(room.state),player,players:room.players,payload:data.payload});
   room.state=out.state;await broadcast(out.events);return;
  }
 }
 async function pageFor(name,width){
  const context=await browser.newContext({viewport:{width,height:width===390?844:768},serviceWorkers:'block'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(name+': '+e.message));
  people.set(page,{id:name,name});tabs.add(page);
  await page.route('**/pocketnet/session',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'token-'+name})}));
  await page.exposeBinding('__trafficitySend',async(source,data)=>{await dispatch(source.page,data);});
  await page.addInitScript(()=>{
   class LocalSocket{
    static OPEN=1;
    readyState=0;
    constructor(){window.__trafficitySocket=this;setTimeout(()=>{this.readyState=1;this.onopen?.();},10);}
    send(raw){const data=JSON.parse(raw);void window.__trafficitySend(data);}
    deliver(data){this.onmessage?.({data:JSON.stringify(data)});}
    close(){this.readyState=3;this.onclose?.({});}
   }
   window.WebSocket=LocalSocket;
  });
  await page.goto('/apps/trafficity/',{waitUntil:'domcontentloaded'});
  return {page,context};
 }
 const host=await pageFor('host',390),guest=await pageFor('guest',1366);
 try{
  await host.page.locator('#host').click();await host.page.locator('#nickname').fill('Хозяин');
  await host.page.locator('#dialogOk').click();
  await expect(host.page.locator('#lobby')).toBeVisible();
  await guest.page.locator('#join').click();await guest.page.locator('#nickname').fill('Гость');
  await guest.page.locator('#invite').fill('01234567');await guest.page.locator('#dialogOk').click();
  await expect(guest.page.locator('#lobby')).toBeVisible();
  await expect(host.page.locator('#start')).toBeEnabled();
  await host.page.locator('#start').click();
  await expect(host.page.locator('#dispatch')).toBeVisible();
  await expect(guest.page.locator('#dispatch')).toBeVisible();
  await host.page.locator('#auto').click();
  await host.page.waitForFunction(()=>window.__AI_TEST_STATE__.cars[0].route.length>0);
  const mine=await host.page.evaluate(()=>window.__AI_TEST_STATE__);
  const theirs=await guest.page.evaluate(()=>window.__AI_TEST_STATE__);
  expect(mine.cars[0].route.length).toBeGreaterThan(0);
  expect(theirs.cars[0].route).toEqual([]);
  expect(theirs.cars[0].goal).toBe(-1);
  await guest.page.locator('#auto').click();
  await guest.page.waitForFunction(()=>window.__AI_TEST_STATE__.cars[2].route.length>0);
  await host.page.locator('#next').click();
  expect(room.state.game.turn).toBe(0);
  await guest.page.locator('#next').click();
  await host.page.waitForFunction(()=>window.__AI_TEST_STATE__.turn===1);
  await guest.page.waitForFunction(()=>window.__AI_TEST_STATE__.turn===1);
  expect(room.state.game.turn).toBe(1);
  // Web page refresh preserves token and room; explicit resume must restore the same guest seat.
  await guest.page.reload({waitUntil:'domcontentloaded'});
  await expect(guest.page.locator('#resumeNet')).toBeVisible();
  await guest.page.locator('#resumeNet').click();
  await expect(guest.page.locator('#dispatch')).toBeVisible();
  expect((await guest.page.evaluate(()=>window.__AI_TEST_STATE__)).turn).toBe(1);
  // Time can be administratively advanced in this test without waiting 3 wall-clock minutes.
  await host.page.locator('#next').click();
  room.state.lastAction[1]=Date.now()-182000;
  await broadcast([{type:'state'}]);
  await host.page.evaluate(()=>{window.dispatchEvent(new Event('focus'));});
  await expect(host.page.locator('#claimIdle')).toBeVisible({timeout:5000});
  await host.page.locator('#claimIdle').click();
  await expect(host.page.locator('#finish')).toBeVisible();
  await expect(guest.page.locator('#finish')).toBeVisible();
  expect(room.state.game.winnerOverride).toBe(0);
  expect(errors).toEqual([]);
 }finally{await host.context.close();await guest.context.close();}
});
