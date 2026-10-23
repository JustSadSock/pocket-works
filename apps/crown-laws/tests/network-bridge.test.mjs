import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(dir,"client/network.js"),"utf8")
 .replace(/^import[^\n]*\n/m,"")
 .replace("export class PocketSocket","class PocketSocket");
class FakeMessageEvent extends Event {
 constructor(type,init){super(type);this.data=init.data;}
}
class FakeNet{
 constructor(){this.handlers={};this.actions=[];this.closed=false;this.roomId=null;FakeNet.last=this;}
 on(type,cb){(this.handlers[type] ||= []).push(cb);}
 emit(type,data={}){for(const fn of this.handlers[type]||[])fn(data);}
 async connect(){await Promise.resolve();this.emit("connected");return this;}
 createRoom(id,config){this.actions.push(["create",id,config]);}
 joinRoom(code){this.actions.push(["join",code]);}
 leaveRoom(){this.actions.push(["leave"]);this.roomId=null;}
 sendGame(packet){this.actions.push(["game",packet]);}
 close(){this.closed=true;}
}
const sessionStorage={getItem(){return null},setItem(){},removeItem(){}};
const Socket=new Function("PocketNet","EventTarget","Event","MessageEvent","sessionStorage","location",
 source+"\nreturn PocketSocket;")(FakeNet,EventTarget,Event,FakeMessageEvent,sessionStorage,{origin:"https://pocket.test"});
const flush=async()=>{for(let i=0;i<4;i++)await Promise.resolve()};

test("authenticated PocketNet fires exactly one open; reconnection fires once more and retains room",async()=>{
 const socket=new Socket();
 let opens=0,closes=0;socket.addEventListener("open",()=>opens++);
 socket.addEventListener("close",()=>closes++);
 await flush();
 assert.equal(opens,1);
 assert.equal(socket.readyState,Socket.OPEN);
 FakeNet.last.emit("connected");
 assert.equal(opens,1);
 FakeNet.last.emit("disconnected");
 assert.equal(closes,1);
 assert.equal(socket.readyState,Socket.CLOSED);
 FakeNet.last.emit("connected");
 assert.equal(opens,2);
 assert.equal(socket.readyState,Socket.OPEN);
 socket.close();
 FakeNet.last.emit("connected");
 assert.equal(opens,2);
 assert.equal(socket.readyState,Socket.CLOSED);
});

test("PocketNet emits per-player full views, short invitation and no stale events after close",async()=>{
 const socket=new Socket();await flush();
 let created=[],updates=[],errors=[];
 socket.addEventListener("message",event=>{
  const p=JSON.parse(event.data);
  if(p.type==="room:created")created.push(p);
  if(p.type==="room:update")updates.push(p);
  if(p.type==="room:error")errors.push(p);
 });
 socket.send(JSON.stringify({type:"room:create"}));
 assert.equal(FakeNet.last.actions.at(-1)[0],"create");
 const view={you:"p1",players:["p1"],ready:{p1:false,p2:false},state:null};
 FakeNet.last.emit("room_joined",{roomId:"abcdefab-1234-1234-1234-1234567890ab",state:view});
 assert.equal(created.length,1);
 assert.equal(created[0].code,"ABCDEFAB");
 assert.equal(updates.at(-1).room.you,"p1");
 assert.equal(updates.at(-1).room.code,"ABCDEFAB");
 FakeNet.last.emit("game_event",{event:{type:"state",payload:{...view,players:["p1","p2"]}}});
 assert.deepEqual(updates.at(-1).room.players,["p1","p2"]);
 FakeNet.last.emit("error",{code:"room_not_found"});
 assert.equal(errors[0].message,"room_not_found");
 socket.close();
 assert.equal(FakeNet.last.closed,true);
 const count=updates.length;
 FakeNet.last.emit("game_event",{event:{type:"state",payload:view}});
 assert.equal(updates.length,count);
 assert.throws(()=>socket.send(JSON.stringify({type:"sync"})),/PocketNet/);
});

test("join and match selections are transported, not locally interpreted",async()=>{
 const socket=new Socket();await flush();
 socket.send(JSON.stringify({type:"room:join",code:"abc012ef"}));
 socket.send(JSON.stringify({type:"match:choose",cardId:"champion-test"}));
 assert.deepEqual(FakeNet.last.actions.slice(-2),[
  ["join","abc012ef"],["game",{type:"match:choose",cardId:"champion-test"}]
 ]);
 socket.close();
});
