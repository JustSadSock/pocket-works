import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState, forecastTurn, resolveTurn } from "../shared/game-engine.js";
import { LAW_CARDS } from "../shared/game-data.js";

test("forecast with existing laws resolves without mutating any live object", () => {
  const state=createInitialState({seed:"forecast-core"});
  const before=JSON.stringify(state);
  const result=forecastTurn(state);
  assert.equal(JSON.stringify(state),before);
  assert.equal(result.state.turn,state.turn);
  assert.equal(result.assumedNoOpponentLaw,true);
  assert.equal(result.state.players.p1.hand.length,state.players.p1.hand.length);
  assert.equal(result.state.players.p2.deck.length,state.players.p2.deck.length);
  assert.ok(result.logs.length>0);
});

test("a selected law changes only the counterfactual rules and leaves the hand untouched",()=>{
  const state=createInitialState({seed:"forecast-selection"});
  for(const card of LAW_CARDS){
    const original=JSON.stringify(state);
    const result=forecastTurn(state,"p1",card.id);
    assert.equal(result.state.slots[card.slot].activeCardId,card.id);
    assert.equal(result.state.slots[card.slot].activeOwner,"p1");
    assert.deepEqual(result.state.players.p1.hand,state.players.p1.hand);
    assert.deepEqual(result.state.players.p2.hand,state.players.p2.hand);
    assert.equal(JSON.stringify(state),original);
  }
});

test("the preview never silently assumes the enemy has played a hidden card",()=>{
  const state=createInitialState({seed:"forecast-secrecy"});
  const selected=state.players.p1.hand[0];
  const result=forecastTurn(state,"p1",selected);
  assert.equal(result.assumedNoOpponentLaw,true);
  assert.ok(result.logs[0].text.includes("Другой игрок ничего не меняет"));
  assert.deepEqual(result.state.players.p2.hand,state.players.p2.hand);
});

test("counterfactual simulation does not affect later real resolution",()=>{
  const state=createInitialState({seed:"forecast-stability"});
  const choices={p1:{cardId:state.players.p1.hand[0]},p2:{cardId:state.players.p2.hand[0]}};
  const expected=resolveTurn(state,choices).state;
  forecastTurn(state,"p1",choices.p1.cardId);
  forecastTurn(state);
  const actual=resolveTurn(state,choices).state;
  assert.deepEqual(actual,expected);
});

test("invalid preview ownership or card id is rejected",()=>{
  const state=createInitialState({seed:"forecast-validation"});
  assert.throws(()=>forecastTurn(state,"not-player",LAW_CARDS[0].id));
  assert.throws(()=>forecastTurn(state,"p1","made-up-law"));
});
