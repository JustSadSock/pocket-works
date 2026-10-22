import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isFreshOnlineRound,wonStageToken} from './online-flow.js';

const round=(phase,index,revision,steps=0)=>({
  phase,index,revision,steps,kind:'campaign',level:{seed:41717+index*7919}
});
test('guest releases the victory modal when host advances on the same play screen',()=>{
  const previous=round('won',0,12,8), next=round('play',1,13);
  assert.equal(isFreshOnlineRound(previous,next),true);
  const guest={overlay:'won',canMove:false};
  if(isFreshOnlineRound(previous,next)){guest.overlay='';guest.canMove=true}
  assert.deepEqual(guest,{overlay:'',canMove:true});
});
test('a failed route or host restart releases the result on both clients',()=>{
  assert.equal(isFreshOnlineRound(round('lost',2,9,20),round('play',2,10)),true);
  assert.equal(isFreshOnlineRound(round('won',2,9,8),round('play',2,10)),true);
  assert.equal(isFreshOnlineRound(round('play',2,9,0),round('play',2,10,0)),true);
});
test('ordinary moves and duplicate state packets preserve a deliberate pause',()=>{
  assert.equal(isFreshOnlineRound(round('play',1,6,4),round('play',1,7,5)),false);
  assert.equal(isFreshOnlineRound(round('play',1,6,4),round('play',1,6,4)),false);
  assert.equal(isFreshOnlineRound(round('play',0,8,5),round('won',0,9,6)),false);
});
test('auto-advance is scoped to the completed room and not failure or active play',()=>{
  const won=round('won',0,11,7);
  assert.equal(wonStageToken(won),'campaign:0:41717');
  assert.equal(wonStageToken(round('play',0,12)), '');
  assert.equal(wonStageToken(round('lost',0,12)), '');
  assert.notEqual(wonStageToken(won),wonStageToken(round('won',1,13,6)));
});
