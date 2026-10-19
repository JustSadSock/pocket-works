import test from 'node:test';
import assert from 'node:assert/strict';
import {packReplayFrame,unpackReplayFrame,parseReplay,ReplayArchive,MAX_REPLAY_FRAMES} from '../replay-core-v1.js';

function makeFrame(){
 return {
  board:Array.from({length:20},()=>Array(14).fill(0)),
  players:[{id:0,color:'#FF1493',position:{x:4,y:2},currentPiece:[[1,1,1,1]],nextPiece:[[1,1],[1,1]],heldPiece:null,gameOver:false},
   {id:1,color:'#00D9FF',position:{x:9,y:8},currentPiece:[[1,1],[1,1]],nextPiece:[[1,1,1]],heldPiece:null,gameOver:false}],
  score:{score:200,lines:2,level:1}
 };
}
test('the packed frame exactly preserves the shared board and players',()=>{
 const original=makeFrame();
 original.board[19][2]=1;original.board[19][7]=2;
 const packed=packReplayFrame(original,1200);
 const after=unpackReplayFrame(packed);
 assert.deepEqual(after.board,original.board);
 assert.deepEqual(after.players[0].currentPiece,original.players[0].currentPiece);
 assert.deepEqual(after.players[1].position,original.players[1].position);
 assert.deepEqual(after.score,original.score);
 assert.equal(after.t,1200);
});
test('completed local replay survives storage, import and restart',()=>{
 const data=new Map();
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const recorder=new ReplayArchive({storage});
 recorder.start({seed:42,mode:'local-coop'});
 assert.equal(recorder.record(makeFrame(),1000),true);
 assert.equal(recorder.record(makeFrame(),1200),false,'identical frame is deduplicated');
 const changed=makeFrame();changed.board[19][3]=1;
 assert.equal(recorder.record(changed,1900),true);
 const saved=recorder.finish();
 assert.equal(saved.frames.length,2);
 assert.equal(saved.frames.at(-1).t,900);
 assert.equal(recorder.active,null);
 const latest=recorder.last();
 assert.deepEqual(latest.frames,saved.frames);
 assert.equal(parseReplay(JSON.stringify(latest)).seed,42);
});
test('invalid or oversized replays cannot overwrite the archive',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const recorder=new ReplayArchive({storage});
 recorder.start({seed:12});
 recorder.record(makeFrame(),1000);
 recorder.finish();
 const good=recorder.last();
 assert.ok(good);
 const corrupted=JSON.parse(JSON.stringify(good));
 corrupted.frames[0].rows[0]='<script>alert(1)</script>';
 assert.throws(()=>parseReplay(JSON.stringify(corrupted)),/invalid_replay_frame/);
 assert.throws(()=>parseReplay('x'.repeat(2_000_001)),/replay_too_large/);
 assert.deepEqual(recorder.last(),good);
});
test('long matches remain bounded by frame count and trim oldest frames',()=>{
 const archive=new ReplayArchive({storage:null,maxFrames:20});
 archive.start({seed:1122});
 for(let i=0;i<60;i++){
  const frame=makeFrame();
  frame.board[19][i%14]=i%2+1;
  archive.record(frame,1000+i*1000,true);
 }
 const replay=archive.finish();
 assert.equal(replay.frames.length,20);
 assert.equal(replay.truncated,true);
 assert.ok(replay.frames[0].t>0);
 assert.ok(replay.frames.at(-1).t>replay.frames[0].t);
});
test('snapshot bounds support all legal widths 10 to 22 and reject invalid ownership',()=>{
 for(let seats=1;seats<=4;seats++){
  const frame=makeFrame();
  frame.board=Array.from({length:20},()=>Array(10+(seats-1)*4).fill(0));
  frame.players=frame.players.slice(0,Math.min(seats,2));
  const packed=packReplayFrame(frame,0);
  assert.equal(unpackReplayFrame(packed).board[0].length,10+(seats-1)*4);
 }
 const invalid=makeFrame();invalid.board[19][0]=999;
 assert.throws(()=>packReplayFrame(invalid),/invalid_replay_frame/);
 assert.ok(MAX_REPLAY_FRAMES<=900);
});
