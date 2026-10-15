import { describe,it,expect,beforeEach,vi } from 'vitest';
import { CATALOG } from './models.js';
import { containsPoint,fitsLayout,LAYOUTS,leftWallX } from './layout.js';
import { sanitize,starter,emptyRoom,valid,findSupport } from './state.js';
import { roomList,addRoom,saveRoom,loadRoom,deleteRoom,renameRoom,selectRoom,activeRoomId } from './rooms.js';
describe('КОМНАТКА 1.0 catalogue',()=>{
 it('retains all original miniature identities and adds new independent pieces',()=>{
  expect(CATALOG).toHaveLength(46);
  expect(new Set(CATALOG.map(x=>x.type)).size).toBe(46);
  for(const item of CATALOG){
   expect(item.name.length).toBeGreaterThan(2);
   expect(item.size[0]).toBeGreaterThan(0);
   expect(item.size[1]).toBeGreaterThan(0);
  }
 });
 it('fits the same object differently in each of the three layouts',()=>{
  expect(LAYOUTS.map(x=>x.id)).toEqual(['classic','narrow','nook']);
  const item={type:'chair',x:3,z:2.5,rot:0,wall:'back'};
  expect(fitsLayout('classic',item,1,1)).toBe(true);
  expect(fitsLayout('narrow',item,1,1)).toBe(false);
  expect(fitsLayout('nook',item,1,1)).toBe(false);
  expect(containsPoint('nook',-2.5,2.5)).toBe(true);
  expect(leftWallX('narrow')).toBeGreaterThan(leftWallX('classic'));
 });
 it('new room finishes migrate old saves and have two independent walls',()=>{
  const original=starter();
  const migrated=sanitize({wallColor:2,pattern:'flower',floor:'tile',items:original.items});
  expect(migrated.wallColorLeft).toBe(2);
  expect(migrated.patternLeft).toBe('flower');
  expect(migrated.layout).toBe('classic');
  const personalized=sanitize({...migrated,layout:'nook',wallColorLeft:4,patternLeft:'berries',floor:'cherry'});
  expect(personalized.wallColorLeft).toBe(4);
  expect(personalized.patternLeft).toBe('berries');
  expect(personalized.floor).toBe('cherry');
  expect(emptyRoom('narrow').items).toEqual([]);
 });
 it('miniature items can be supported and cannot overlap',()=>{
  const state=emptyRoom('classic');
  state.items=[{id:'desk',type:'desk',x:0,z:0,rot:0}];
  const bear={id:'bear',type:'teddy',x:.25,z:0,support:'desk',rot:0};
  expect(findSupport(state,bear,bear.x,bear.z)?.type).toBe('desk');
  expect(valid(state,bear)).toBe(true);
  state.items.push(bear);
  expect(valid(state,{...bear,id:'second-bear'})).toBe(false);
 });
});
describe('private saved dollhouses',()=>{
 let kv;
 beforeEach(()=>{
  kv=new Map();
  vi.stubGlobal('localStorage',{
   getItem:k=>kv.get(k)??null,setItem:(k,v)=>kv.set(k,String(v)),
   removeItem:k=>kv.delete(k)
  });
 });
 it('migrates the existing personal room without destroying its items',()=>{
  kv.set('pocket-works:komnatka:scene-v1',JSON.stringify(starter()));
  const records=roomList();
  expect(records).toHaveLength(1);
  expect(loadRoom(records[0].id).items.length).toBeGreaterThan(6);
 });
 it('creates 5 genuine named isolated saves, renames, and rejects a sixth',()=>{
  roomList();
  for(let i=1;i<=4;i++)expect(addRoom({name:'Игрушечный домик '+i,layout:'narrow'})).toBeTruthy();
  expect(addRoom({name:'Шестой'})).toBeNull();
  const record=roomList()[0];
  const testScene=emptyRoom('narrow');testScene.items.push({id:'bear',type:'teddy',x:0,z:0,rot:0});
  expect(saveRoom(record.id,testScene)).toBe(true);
  expect(renameRoom(record.id,'Солнечная')).toBe(true);
  expect(loadRoom(record.id).items[0].type).toBe('teddy');
  expect(roomList()[0].name).toBe('Солнечная');
  expect(deleteRoom(record.id)).toBe(true);
  expect(roomList()).toHaveLength(4);
 });
});
