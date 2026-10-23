import assert from 'node:assert/strict';
import test from 'node:test';
import {shouldAnnounceSocketDeparture} from '../disconnect-presence.mjs';

test('server-initiated replacement does not announce a false disconnect',()=>{
 assert.equal(shouldAnnounceSocketDeparture({roomId:'r',serverReplaced:true},false),false);
});
test('a real lost socket announces departure when no replacement exists',()=>{
 assert.equal(shouldAnnounceSocketDeparture({roomId:'r'},false),true);
});
test('late closure is ignored when another socket already occupies the same seat',()=>{
 assert.equal(shouldAnnounceSocketDeparture({roomId:'r'},true),false);
});
test('client close code cannot forge a server replacement',()=>{
 assert.equal(shouldAnnounceSocketDeparture({roomId:'r',code:4000,reason:'reconnected'},false),true);
 assert.equal(shouldAnnounceSocketDeparture({roomId:null},false),false);
});
