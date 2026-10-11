import { describe, expect, it } from 'vitest';
import { advanceNight, canChoose, canSiegeOrder, choose, createGame, issueSiegeOrder, restoreGame, serializeGame, startGame, stepSiege } from './core';

describe('Last Raven campaign',()=>{
  it('starts at the gate with a deterministic encounter',()=>{
    const a=createGame(42),b=createGame(42);startGame(a);startGame(b);
    expect(a.phase).toBe('visitor');expect(a.current?.id).toBe(b.current?.id);
  });
  it('moves visitor -> letter -> night and consumes supplies',()=>{
    const s=createGame(7);startGame(s);const first=s.current?.choices.find(c=>canChoose(s,c.id));expect(first).toBeTruthy();choose(s,first!.id);
    expect(s.phase).toBe('letter');const second=s.current!.choices.find(c=>canChoose(s,c.id))!;choose(s,second.id);expect(s.phase).toBe('night');
    expect(s.resources.wood).toBeLessThan(18);
  });
  it('rejects decisions that cannot be paid for',()=>{
    const s=createGame(12);startGame(s);s.current={id:'test',kind:'visitor',title:'test',source:'test',visual:'trader',body:'test',choices:[{id:'admit',label:'x',hint:'x',effects:{gold:-99}}]};
    expect(canChoose(s,'admit')).toBe(false);expect(choose(s,'admit')).toBe(false);expect(s.resources.gold).toBe(9);
  });
  it('resolves delayed consequences on later days',()=>{
    const s=createGame(18);startGame(s);const choice=s.current!.choices.find(c=>c.consequence&&canChoose(s,c.id));expect(choice).toBeTruthy();choose(s,choice!.id);choose(s,s.current!.choices.find(c=>canChoose(s,c.id))!.id);
    const target=s.pending[0]?.day??99;while(s.day<target&&s.day<=12){advanceNight(s);choose(s,s.current!.choices.find(c=>canChoose(s,c.id))!.id);choose(s,s.current!.choices.find(c=>canChoose(s,c.id))!.id)}
    expect(s.history.length).toBeGreaterThan(2);
  });
  it('reaches and resolves the siege',()=>{
    const s=createGame(33);startGame(s);
    while(s.day<=12){if(s.phase==='visitor'||s.phase==='letter')choose(s,s.current!.choices.find(c=>canChoose(s,c.id))!.id);else if(s.phase==='night')advanceNight(s);else break}
    expect(s.phase).toBe('siege');for(let i=0;i<1100&&s.phase==='siege';i++){if(s.siege?.awaitingOrder)issueSiegeOrder(s,canSiegeOrder(s,'volley')?'volley':'hold');stepSiege(s,1/30)}expect(['won','lost']).toContain(s.phase);
  });
  it('lets a consistently hostile campaign lose the final siege',()=>{
    const s=createGame(1);startGame(s);
    while(s.phase!=='siege'){
      if(s.phase==='visitor'||s.phase==='letter'){
        const choices=s.current!.choices.filter(c=>canChoose(s,c.id));
        const choice=choices.find(c=>c.id==='refuse'||c.id==='burn')??choices.at(-1)!;
        choose(s,choice.id);
      }else if(s.phase==='night')advanceNight(s);
    }
    for(let i=0;i<1100&&s.phase==='siege';i++){if(s.siege?.awaitingOrder)issueSiegeOrder(s,'hold');stepSiege(s,1/30)}
    expect(s.phase).toBe('lost');
  });
  it('does not repeat encounters while fresh alternatives exist',()=>{
    const s=createGame(123);startGame(s);
    while(s.phase!=='siege'){
      if(s.phase==='visitor'||s.phase==='letter'){const ok=s.current!.choices.find(c=>canChoose(s,c.id));expect(ok).toBeTruthy();choose(s,ok!.id)}
      else if(s.phase==='night')advanceNight(s);
    }
    expect(new Set(s.seen).size).toBe(s.seen.length);
    expect(s.seen.length).toBe(24);
  });
  it('pauses the siege for three meaningful orders',()=>{
    const s=createGame(9);s.phase='siege';s.siege={progress:0,wall:55,enemy:70,breaches:0,resultText:'',awaitingOrder:true,orderStage:0,orders:[]};
    expect(canSiegeOrder(s,'reinforce')).toBe(true);
    const wood=s.resources.wood;expect(issueSiegeOrder(s,'reinforce')).toBe(true);
    expect(s.resources.wood).toBe(wood-3);
    expect(issueSiegeOrder(s,'reinforce')).toBe(false);
    while(s.siege!.progress<.35&&s.phase==='siege')stepSiege(s,1/30);
    expect(s.siege?.awaitingOrder).toBe(true);
    expect(s.siege?.orderStage).toBe(1);
    expect(issueSiegeOrder(s,'volley')).toBe(true);
    while(s.siege!.progress<.69&&s.phase==='siege')stepSiege(s,1/30);
    expect(s.siege?.awaitingOrder).toBe(true);
    expect(s.siege?.orderStage).toBe(2);
    expect(issueSiegeOrder(s,'hold')).toBe(true);
    expect(s.siege?.orders).toEqual(['reinforce','volley','hold']);
  });
  it('round-trips persistence',()=>{const s=createGame(91);startGame(s);const r=restoreGame(serializeGame(s));expect(r?.day).toBe(1);expect(r?.current?.id).toBe(s.current?.id)});
});