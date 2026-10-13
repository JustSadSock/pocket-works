import { describe, expect, it } from 'vitest';
import game, { MIN_PLAYERS, MAX_PLAYERS } from '../server/module.ts';
const host={id:'host',name:'Соня'},guest={id:'guest',name:'Миша'};
function room(){
 const state=game.createRoom({player:host}).state;
 game.onJoin({state,player:guest,players:[host,guest]});
 return state;
}
function act(state:any,player:any,payload:any){
 return game.onMessage({state,player,players:[host,guest],payload}) as any;
}
describe('КOMHATKA two genuine online modes',()=>{
 it('requires a real co-player and only the host can start',()=>{
  expect(MIN_PLAYERS).toBe(2);expect(MAX_PLAYERS).toBe(5);
  const lonely=game.createRoom({player:host}).state;
  expect(act(lonely,host,{type:'start',mode:'tenants'}).events?.[0]?.type).toBe('notice');
  const s=room();
  expect(act(s,guest,{type:'start',mode:'tenants'}).events?.[0]?.type).toBe('notice');
  act(s,host,{type:'start',mode:'tenants'});
  expect(s.phase).toBe('build');
  expect(s.items).toEqual([]);
  expect(s.deadline).toBeGreaterThan(Date.now());
 });
 it('server validates placement, supports furniture and broadcasts friend selection',()=>{
  const s=room();act(s,host,{type:'start',mode:'tenants'});
  act(s,guest,{type:'add',item:{type:'coffee',x:0,z:0,rot:0,color:'#d6bd80'}});
  expect(s.items).toHaveLength(1);
  const table=s.items[0];
  act(s,host,{type:'add',item:{type:'mug',x:.25,z:.25,support:table.id,rot:0}});
  expect(s.items).toHaveLength(2);
  expect(s.items[1].y).toBeCloseTo(.72);
  const deny=act(s,guest,{type:'add',item:{type:'bed',x:0,z:0,rot:0}});
  expect(deny.events[0].type).toBe('notice');
  expect(s.items).toHaveLength(2);
  act(s,guest,{type:'select',id:table.id,action:'move'});
  expect(s.selections.guest.id).toBe(table.id);
  const deniedEdit=act(s,host,{type:'edit',id:table.id,patch:{x:1}});
  expect(deniedEdit.events[0].type).toBe('notice');
  act(s,guest,{type:'edit',id:table.id,patch:{x:1}});
  expect(s.items[0].x).toBe(1);
  expect(s.items[1].x).toBe(1.25);
 });
 it('memory solution is broadcast only in preview/result, never during building',()=>{
  const s=room();act(s,host,{type:'start',mode:'memory'});
  expect(s.phase).toBe('preview');
  const preview=act(s,guest,{type:'sync'}).events[0].payload;
  expect(preview.target?.length).toBeGreaterThan(5);
  act(s,host,{type:'skip_preview'});
  const building=act(s,guest,{type:'sync'}).events[0].payload;
  expect(building.phase).toBe('build');
  expect('target' in building).toBe(false);
  expect(building.items).toEqual([]);
  expect(act(s,guest,{type:'finish'}).events[0].type).toBe('notice');
  act(s,host,{type:'finish'});
  const result=act(s,guest,{type:'sync'}).events[0].payload;
  expect(result.phase).toBe('result');
  expect(result.target.length).toBeGreaterThan(5);
  expect(result.score).toBeGreaterThanOrEqual(0);
  expect(result.score).toBeLessThanOrEqual(100);
 });
 it('cooperative finish, decoration and next round survive host replacement',()=>{
  const s=room();act(s,host,{type:'start',mode:'tenants'});
  act(s,guest,{type:'decorate',patch:{floor:'tile',wallColor:2,evening:true}});
  expect(s.finishes.floor).toBe('tile');
  expect(s.finishes.evening).toBe(true);
  act(s,host,{type:'finish'});
  expect(s.phase).toBe('result');
  expect(s.score).toBe(0);
  game.onLeave({state:s,player:host,players:[guest]});
  expect(s.host).toBe('guest');
  game.onJoin({state:s,player:host,players:[guest,host]});
  act(s,guest,{type:'start',mode:'memory'});
  expect(s.phase).toBe('preview');
 });
});
