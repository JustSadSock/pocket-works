import {test,expect,type BrowserContext,type WebSocketRoute} from '@playwright/test';
import originalModule from '../server/module';

// Two isolated browser contexts, real PocketNet client WebSockets, and the real
// version-2 authoritative game module. Only the edge transport is simulated.
test('two real clients: short invite, private maps, move, turns and reconnect',async({browser},info)=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  let seq=0;
  const sessions=new Map<string,{id:string,name:string}>();
  const sockets=new Map<WebSocketRoute,{id:string,name:string}>();
  const roomId='abcd1234-1234-4234-8234-123456789012';
  let state:any=null;
  let players:Array<{id:string,name:string}>=[];
  const send=(ws:WebSocketRoute,type:string,body:Record<string,unknown>)=>ws.send(JSON.stringify({wireVersion:1,type,...body}));
  function broadcast(){
    for(const [ws,player] of sockets){
      if(!players.some(p=>p.id===player.id))continue;
      send(ws,'game_event',{roomId,event:{type:'state',payload:originalModule.viewForPlayer({state,player,players})}});
    }
  }
  async function attach(ctx:BrowserContext){
    await ctx.route('**/pocketnet/session',route=>{
      const token='fog-integration-'+(++seq),player={id:'test-player-'+seq,name:'Полководец '+seq};
      sessions.set(token,player);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token})});
    });
    await ctx.routeWebSocket('**/pocketnet/ws',ws=>{
      let me:{id:string,name:string}|null=null;
      ws.onMessage(raw=>{
        try{
          const msg=JSON.parse(String(raw));
          if(msg.type==='auth'){
            me=sessions.get(msg.token)||null;
            if(!me)throw Error('Unknown session');
            sockets.set(ws,me);
            send(ws,'authenticated',{player:me});return;
          }
          if(!me)throw Error('Unauthenticated command');
          if(msg.type==='create_room'){
            if(state)throw Error('Room already created');
            players=[me];
            state=originalModule.createRoom({player:me,players,payload:msg.payload}).state;
            send(ws,'room_joined',{roomId,gameId:'fog-of-conquest',version:'v2',
              players,state:originalModule.viewForPlayer({state,player:me,players})});
            return;
          }
          if(msg.type==='join_room'){
            if(!state||![roomId,'abcd1234'].includes(String(msg.roomId).toLowerCase()))throw Error('Unknown room');
            if(!players.some(p=>p.id===me!.id)){
              players.push(me);
              state=originalModule.onJoin({state,player:me,players}).state;
            }
            send(ws,'room_joined',{roomId,gameId:'fog-of-conquest',version:'v2',players,
              state:originalModule.viewForPlayer({state,player:me,players})});
            broadcast();return;
          }
          if(msg.type==='game_message'){
            const result=originalModule.onMessage({state,player:me,players,payload:msg.payload});
            state=result.state;
            for(const event of result.events){
              if(event.type==='notice'){send(ws,'game_event',{roomId,event});continue;}
              if(event.type==='state')broadcast();
            }
            return;
          }
          if(msg.type==='leave_room'){
            players=players.filter(p=>p.id!==me!.id);
            state=originalModule.onLeave({state,player:me,players}).state;
            broadcast();
            return;
          }
          throw Error('Unrecognized wire command '+msg.type);
        }catch(err){
          errors.push('Mock edge: '+String(err));
          send(ws,'error',{code:'test_error',message:String(err)});
        }
      });
      ws.onClose(()=>sockets.delete(ws));
    });
  }
  const first=await browser.newContext({viewport:{width:1000,height:800},serviceWorkers:'block'});
  const second=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  try{
    await attach(first);await attach(second);
    const a=await first.newPage(),b=await second.newPage();
    a.on('pageerror',e=>errors.push('Host: '+e.message));
    b.on('pageerror',e=>errors.push('Guest: '+e.message));
    const url='/apps/fog-of-conquest/';
    await a.goto(url,{waitUntil:'domcontentloaded'});
    await a.locator('#newGameBtn').click();
    await a.locator('#onlineBtn').click();
    await a.locator('#createRoomBtn').click();
    await expect(a.locator('#onlineStatus')).toContainText('ABCD1234');

    await b.goto(url,{waitUntil:'domcontentloaded'});
    await b.locator('#newGameBtn').click();
    await b.locator('#onlineBtn').click();
    // The UI copies only 8 chars; the hub resolves them to a UUID.
    await b.locator('#roomIdInput').fill('ABCD1234');
    await b.locator('#joinRoomBtn').click();
    await expect(a.locator('#onlineLobbyControls button').first()).toBeEnabled();
    await a.locator('#onlineLobbyControls button').first().click();
    await expect.poll(()=>a.evaluate(()=>window.units?.filter(u=>u.owner===1).length)).toBe(2);
    await expect.poll(()=>b.evaluate(()=>window.units?.filter(u=>u.owner===2).length)).toBe(2);
    expect(await b.evaluate(()=>window.units.some(u=>u.owner===1))).toBe(false);
    expect(await a.evaluate(()=>window.units.some(u=>u.owner===2))).toBe(false);
    // The southern player must not spawn looking at an empty northern corner.
    await expect.poll(()=>b.evaluate(()=>document.getElementById('battleViewport')!.scrollLeft)).toBeGreaterThan(0);
    await a.screenshot({path:info.outputPath('pocketnet-host.png')});
    await b.screenshot({path:info.outputPath('pocketnet-guest.png')});

    const clickCell=async(p:any,r:number,c:number)=>p.evaluate(({r,c}:{r:number,c:number})=>{
      const canvas=document.getElementById('canvas') as HTMLCanvasElement;
      const rect=canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,
        clientX:rect.left+(c+.5)*rect.width/window.COLS,
        clientY:rect.top+(r+.5)*rect.height/window.ROWS}));
    },{r,c});
    await clickCell(a,1,2);await clickCell(a,1,3);
    await expect.poll(()=>a.evaluate(()=>window.units.find(u=>u.owner===1&&u.type==='swordsman')?.c)).toBe(3);
    await a.locator('#endTurnBtn').click();
    await a.locator('#yesBtn').click();
    await expect.poll(()=>b.evaluate(()=>document.querySelector('#endTurnBtn')?.disabled)).toBe(false);
    await clickCell(b,18,27);await clickCell(b,18,26);
    await expect.poll(()=>b.evaluate(()=>window.units.find(u=>u.owner===2&&u.type==='swordsman')?.c)).toBe(26);
    await b.reload({waitUntil:'domcontentloaded'});
    // The second client reauthenticates with a tab-scoped identity and rejoins automatically.
    await expect.poll(()=>b.evaluate(()=>window.units?.find(u=>u.owner===2&&u.type==='swordsman')?.c),{timeout:15000}).toBe(26);
    expect(await b.evaluate(()=>window.units.some(u=>u.owner===1))).toBe(false);
    await b.locator('#endTurnBtn').click();
    await b.locator('#yesBtn').click();
    await expect.poll(()=>a.evaluate(()=>document.querySelector('#endTurnBtn')?.disabled)).toBe(false);
    expect(errors).toEqual([]);
  }finally{await first.close();await second.close();}
});
