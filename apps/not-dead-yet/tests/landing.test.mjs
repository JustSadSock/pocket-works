import test from 'node:test';
import assert from 'node:assert/strict';
import {Apartment,ITEMS,HOME} from '../apartment.mjs';
import {readLanding,knockAtDoor,inspectPeephole,landingHint} from '../landing.mjs';
import {chapterJournal,chapterEnding} from '../story.mjs';

test('knock arrives naturally after exploration and cannot be farmed',()=>{
 const s=readLanding();
 assert.deepEqual(s,{knocked:false,seen:false,recognized:false,knockedAt:0});
 assert.equal(knockAtDoor(s,24,4),false);
 assert.equal(knockAtDoor(s,28,2),true);
 assert.equal(knockAtDoor(s,50,4),false);
 assert.equal(s.knockedAt,28);
 const slow=readLanding();
 assert.equal(knockAtDoor(slow,38,0),false);
 assert.equal(knockAtDoor(slow,39,0),true);
});
test('the first look reveals landing geometry, photograph permits recognition once',()=>{
 const s=readLanding();
 assert.equal(inspectPeephole(s,{hasPhoto:true}).ok,false,'cannot inspect before knock');
 knockAtDoor(s,41,0);
 assert.match(landingHint(s,false),/глазок/);
 const first=inspectPeephole(s,{hasPhoto:false});
 assert.equal(first.ok,true);assert.equal(first.first,true);assert.equal(first.recognized,false);
 assert.match(landingHint(s,true),/фотография/);
 const recalled=inspectPeephole(s,{hasPhoto:true});
 assert.equal(recalled.ok,true);assert.equal(recalled.recognized,true);
 assert.equal(inspectPeephole(s,{hasPhoto:true}).recognized,false,'reward must be one time');
 assert.equal(s.recognized,true);
});
test('new world saves and legacy saves keep all items reachable for 400 apartment seeds',()=>{
 for(let seed=1;seed<=400;seed++){
  const w=new Apartment(seed);
  assert.equal(w.landing.knocked,false);
  assert.ok(w.canStand(HOME.x,HOME.z));
  for(const item of ITEMS)assert.ok(w.reachablePosition(w.itemPosition(item.id)),seed+':'+item.id);
  w.knock(50,0);w.inspectLanding(false);
  const restored=new Apartment(seed,w.save());
  assert.equal(restored.landing.knocked,true);
  assert.equal(restored.landing.seen,true);
  assert.equal(restored.landing.recognized,false);
  restored.inspectLanding(true);
  const known=new Apartment(seed,restored.save());
  assert.equal(known.landing.recognized,true);
  assert.equal(known.knock(99,4),false);
  const legacy=new Apartment(seed,{layoutVersion:1,phases:[0,0,0,0]});
  assert.equal(legacy.landing.seen,false);
 }
});
test('peephole encounter has journal entry and distinctive grounded finale',()=>{
 const entry=chapterJournal(['photo'],0,false,{knocked:true,seen:true,recognized:true});
 assert.equal(entry.entries.length,2);
 assert.ok(entry.entries.some(e=>e.id==='landing'));
 const exit=chapterEnding({won:true,inventory:['album','pills','photo','keys'],landing:{recognized:true},heard:false,recognized:0});
 assert.match(exit.tag,/ЗНАКОМАЯ ЛЕСТНИЦА/);
 const other=chapterEnding({won:true,inventory:['album','pills','photo','keys'],recognized:2,heard:true,landing:{recognized:true}});
 assert.match(other.tag,/ТЁПЛОЕ УТРО/,'established best ending should retain precedence');
 const old=chapterEnding({won:true,inventory:['album','pills','photo','keys']});
 assert.match(old.tag,/УТРО/,'older saves must preserve ordinary ending');
});
