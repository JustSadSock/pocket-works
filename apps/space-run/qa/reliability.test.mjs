import test from 'node:test';
import assert from 'node:assert/strict';
import simulation from '../simulation.js';
import {PRACTICE_KEY, isPracticeState, loadPractice, savePractice} from '../practice-state.js';

function storage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: key => entries.has(key) ? entries.get(key) : null,
    setItem: (key,value) => entries.set(key,String(value)),
    removeItem: key => entries.delete(key)
  };
}
const member = {id:'local',name:'Pilot'};
const newState = () => simulation.createRoom({player:member,payload:{name:member.name}}).state;

test('fresh engine state survives practice save, restore and command', () => {
  const raw = newState();
  assert.equal(isPracticeState(raw),true);
  const store = storage();
  assert.equal(savePractice(store,raw),true);
  assert.ok(store.getItem(PRACTICE_KEY));
  const restored = loadPractice(store);
  assert.deepEqual(restored.room.ship.cells,raw.room.ship.cells);
  const processed = simulation.onMessage({
    state:restored,player:member,payload:{event:'playerInput',payload:{up:true,aim:0}}
  });
  assert.ok(processed.state.snapshot);
  assert.equal(isPracticeState(processed.state),true);
});

test('corrupted saves are rejected without throwing', () => {
  const valid = newState();
  const store = storage({[PRACTICE_KEY]:'{broken'});
  assert.equal(loadPractice(store),null);
  store.setItem(PRACTICE_KEY,JSON.stringify({...valid,room:{...valid.room,players:{}}}));
  assert.equal(loadPractice(store),null);
  store.setItem(PRACTICE_KEY,JSON.stringify({...valid,room:{...valid.room,ship:{...valid.room.ship,cells:['Infinity,NaN']}}}));
  assert.equal(loadPractice(store),null);
});

test('storage quota failures never crash the simulation', () => {
  const fullStorage = {getItem(){throw Error('denied')},setItem(){throw Error('quota')}};
  assert.equal(loadPractice(fullStorage),null);
  assert.equal(savePractice(fullStorage,newState()),false);
});

test('restored snapshot rejects bad geometry and numerical values', () => {
  const valid = newState();
  const broken = structuredClone(valid);
  broken.room.physics.x = Infinity;
  assert.equal(isPracticeState(broken),false);
  const broken2 = structuredClone(valid);
  broken2.room.ship.hull = 'infinite';
  assert.equal(isPracticeState(broken2),false);
  const broken3 = structuredClone(valid);
  broken3.snapshot.ship.modules = null;
  assert.equal(isPracticeState(broken3),false);
});
