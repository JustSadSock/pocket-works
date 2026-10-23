import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import * as data from "../shared/game-data.js";
import * as engine from "../shared/game-engine.js";
import * as ai from "../shared/ai.js";
import * as film from "../client/choreography.js";
import * as vision from "../client/counsel-vision.js";
import * as readout from "../client/law-readout.js";
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=f=>readFileSync(path.join(dir,f),"utf8");
const serverFactory=new Function(read("server/module.ts").replace(/export\s*\{\s*entry_default\s+as\s+default\s*\};?\s*$/,"")+"\nreturn entry_default;");
const clientBody=read("client/app.js").replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g,"");
const SERVER_ROOM_CODE="abc012ef";

class Hub {
 constructor(){this.module=serverFactory();this.sockets=[];this.state=null;}
 broadcast(){
  for(const socket of this.sockets.filter(s=>s.joined&&s.readyState===1)){
   const projected=this.module.viewForPlayer({state:this.state,player:socket.player});
   socket.deliver("room:update",{room:{...projected,code:SERVER_ROOM_CODE}});
  }
 }
 handle(socket,p){
  try{
   if(p.type==="room:create"){
    this.state=this.module.createRoom({player:socket.player}).state;
    socket.joined=true;
    socket.deliver("room:created",{code:SERVER_ROOM_CODE,you:"p1"});
    this.broadcast();
   }else if(p.type==="room:join"){
    if(p.code?.toLowerCase()!==SERVER_ROOM_CODE)throw Error("Код не существует");
    this.state=this.module.onJoin({state:this.state,player:socket.player}).state;
    socket.joined=true;
    socket.deliver("room:joined",{code:SERVER_ROOM_CODE,you:"p2"});
    this.broadcast();
   }else if(p.type==="match:choose"||p.type==="match:restart"){
    this.state=this.module.onMessage({state:this.state,player:socket.player,payload:p}).state;
    this.broadcast();
   }else{throw Error("Unknown message");}
  }catch(e){socket.deliver("room:error",{message:String(e.message)});}
 }
}
class BaseSocket extends EventTarget {
 static OPEN=1;static CLOSED=3;
 constructor(hub,player){
  super();this.hub=hub;this.player=player;this.readyState=0;this.joined=false;
  hub.sockets.push(this);
 }
 open(){this.readyState=1;this.dispatchEvent(new Event("open"));this.hub.broadcastIfJoined?.(this);}
 deliver(type,body){
  const evt=new Event("message");evt.data=JSON.stringify({type,...body});this.dispatchEvent(evt);
 }
 send(message){
  if(this.readyState!==1)throw Error("Disconnected");
  const p=JSON.parse(message);
  queueMicrotask(()=>{if(this.readyState===1)this.hub.handle(this,p);});
 }
 drop(){this.readyState=3;this.dispatchEvent(new Event("close"));}
 close(){
  if(this.readyState===3)return;
  this.readyState=3;
  if(this.joined&&this.hub.state){
   this.hub.state=this.hub.module.onLeave({state:this.hub.state,player:this.player}).state;
   this.joined=false;
   this.hub.broadcast();
  }
  this.dispatchEvent(new Event("close"));
 }
}
function client(hub,id){
 const player={id,name:id};
 class Socket extends BaseSocket{constructor(){super(hub,player)}}
 const listeners={},root={innerHTML:"",querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(t,f)=>listeners[t]=f};
 const session={getItem:()=>null,setItem(){},removeItem(){}},local={getItem:()=>null,setItem(){}};
 const window={matchMedia:()=>({matches:false}),addEventListener(){},setTimeout:()=>1,clearTimeout(){},visualViewport:null};
 const document={getElementById:()=>root,activeElement:{tagName:"BODY"}};
 const location={origin:"https://pocket.test",protocol:"https:",host:"pocket.test"};
 const injected={...data,...engine,...ai,...film,...vision,...readout,
   WebSocket:Socket,playCourtSound:()=>false,COURT_SOUNDS:[],
   window,document,localStorage:local,sessionStorage:session,location,
   navigator:{},matchMedia:window.matchMedia,structuredClone};
 const instance=new Function(...Object.keys(injected),clientBody+
  "\nreturn {app,root,render,setupSocket,stopFilm,confirmSelection};")(...Object.values(injected));
 const click=action=>{
  const button={dataset:{action}};
  const target={closest:selector=>selector==="[data-action]"?button:null};
  listeners.click({target});
 };
 return {player,...instance,click,get socket(){return hub.sockets.findLast(s=>s.player.id===id)}};
}
const settle=async()=>{for(let n=0;n<5;n++)await Promise.resolve()};

test("two actual client UIs complete hidden first turn, server ack, guest rematch wait and new round",async()=>{
 const hub=new Hub();
 const north=client(hub,"north"),south=client(hub,"south");
 north.click("open-online");north.click("create-room");
 north.socket.open();await settle();
 assert.equal(north.app.online.roomCode,SERVER_ROOM_CODE);
 assert.equal(north.app.online.you,"p1");
 assert.equal(north.app.online.roomState,null);
 south.click("open-online");south.app.online.codeInput=SERVER_ROOM_CODE;south.click("join-room");
 south.socket.open();await settle();
 assert.equal(hub.state.game.turn,1);
 assert.equal(north.app.online.roomState.turn,1);
 assert.equal(south.app.online.roomState.turn,1);
 assert.equal(south.app.online.you,"p2");
 assert.ok(south.app.online.roomState.players.p1.hand.every(card=>card==="hidden"));
 assert.ok(north.app.online.roomState.players.p2.hand.every(card=>card==="hidden"));
 north.app.selectedCardId=north.app.online.roomState.players.p1.hand[0];
 north.confirmSelection();
 assert.equal(north.app.online.submissionPending,true);
 assert.equal(north.app.online.ready.p1,false);
 await settle();
 assert.equal(north.app.online.submissionPending,false);
 assert.equal(north.app.online.ready.p1,true);
 assert.equal(south.app.online.ready.p1,true);
 assert.match(north.root.innerHTML,/Указ запечатан/);
 south.app.selectedCardId=south.app.online.roomState.players.p2.hand[0];
 south.confirmSelection();await settle();
 assert.equal(hub.state.game.turn,2);
 assert.equal(north.app.online.roomState.turn,2);
 assert.equal(south.app.online.roomState.turn,2);
 assert.deepEqual(north.app.online.ready,{p1:false,p2:false});
 north.stopFilm({renderNow:true});south.stopFilm({renderNow:true});
 assert.ok(north.root.innerHTML.includes("Ваши указы"));
 assert.ok(south.root.innerHTML.includes("Ваши указы"));
 hub.state.game.winner="p1";hub.state.game.players.p1.activeCrowns=3;
 hub.broadcast();
 assert.match(south.root.innerHTML,/Ждём организатора/);
 assert.doesNotMatch(south.root.innerHTML,/data-action="rematch"/);
 north.click("rematch");await settle();
 assert.equal(hub.state.game.turn,1);
 assert.equal(hub.state.game.winner,null);
 assert.equal(north.app.online.roomState.turn,1);
 assert.equal(south.app.online.roomState.turn,1);
 assert.equal(north.app.film,null);
 assert.equal(south.app.film,null);
 assert.equal(north.app.online.rematchPending,false);
 assert.equal(south.app.selectedCardId,null);
 north.click("back-menu");await settle();
 assert.equal(north.app.screen,"menu");
 assert.equal(north.app.online.roomState,null);
 assert.equal(north.app.online.roomCode,"");
 assert.equal(hub.state.slots.p1,null);
 assert.equal(south.app.online.players.length,1);
 assert.match(south.root.innerHTML,/Второй претендент покинул совет/);
});

test("online submit failure keeps a playable card; disconnection never pretends a choice succeeded",async()=>{
 const hub=new Hub();const north=client(hub,"north"),south=client(hub,"south");
 north.click("open-online");north.click("create-room");north.socket.open();await settle();
 south.click("open-online");south.app.online.codeInput=SERVER_ROOM_CODE;south.click("join-room");south.socket.open();await settle();
 const valid=north.app.online.roomState.players.p1.hand[0];
 north.app.selectedCardId=valid;
 north.socket.drop();
 north.confirmSelection();
 assert.equal(north.app.online.ready.p1,false);
 assert.equal(north.app.selectedCardId,valid);
 assert.match(north.app.online.error,/Нет связи/);
 north.socket.open();hub.broadcast();
 assert.equal(north.app.online.status,"connected");
 north.confirmSelection();await settle();
 assert.equal(north.app.online.ready.p1,true);
 assert.equal(north.app.online.submissionPending,false);
 assert.equal(south.app.online.ready.p1,true);
});
