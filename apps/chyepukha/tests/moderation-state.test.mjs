import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hostRecovery,recoveryCountdown,seatOptions,recoveryLabel} from '../moderation-state.js';
import {controlsDialog,seatDecisionDialog,transferHostDialog} from '../moderation-view.js';

const now=Date.now();
const players=[
 {id:'host',name:'Марта',departed:true,submitted:false},
 {id:'other',name:'Назар',departed:false,submitted:false},
 {id:'me',name:'Софія',departed:false,submitted:false}
];
const view=(overrides={})=>({
 phase:'writing',host:'host',players,hostOfflineSince:now-1000,hostVotes:{},paused:false,...overrides
});
const escape=s=>String(s??'').replaceAll('<','&lt;');

test('offline host election stays disabled for five full minutes, then opens',()=>{
 const pending=hostRecovery(view(),'me',now);
 assert.equal(pending.active,true);
 assert.equal(pending.ready,false);
 assert.equal(pending.remainingMs,299000);
 assert.match(recoveryLabel(pending),/04:59/);
 const html=controlsDialog(view(),'me',escape);
 assert.match(html,/data-recovery-countdown/);
 assert.match(html,/data-recovery-candidate/);
 assert.match(html,/disabled/);
 const lastSecond=hostRecovery(view({hostOfflineSince:now-299999}),'me',now);
 assert.equal(lastSecond.canVote,false);
 const ready=hostRecovery(view({hostOfflineSince:now-300000}),'me',now);
 assert.equal(ready.canVote,true);
 assert.equal(ready.threshold,2);
 assert.equal(ready.remainingMs,0);
 assert.equal(recoveryCountdown(0),'00:00');
});

test('one remaining online player can elect themselves, but not the departed host',()=>{
 const state=view({players:[players[0],players[2]],hostOfflineSince:now-330000});
 const recovery=hostRecovery(state,'me',now);
 assert.equal(recovery.canVote,true);
 assert.equal(recovery.threshold,1);
 assert.deepEqual(recovery.eligible.map(p=>p.id),['me']);
 const html=controlsDialog(state,'me',escape);
 assert.match(html,/data-act="vote-host" data-recovery-candidate data-id="me"/);
 assert.doesNotMatch(html,/data-act="vote-host" data-recovery-candidate data-id="host"/);
});

test('host reconnect, excluded voter and finished rooms stop elections',()=>{
 assert.equal(hostRecovery(view({players:[{...players[0],departed:false},players[1],players[2]]}),'me',now).active,false);
 assert.equal(hostRecovery(view({hostOfflineSince:0}),'me',now).active,false);
 assert.equal(hostRecovery(view({phase:'finished'}),'me',now).active,false);
 const state=view({players:[players[0],{...players[1],excluded:true},players[2]],hostOfflineSince:now-400000});
 const recovery=hostRecovery(state,'me',now);
 assert.equal(recovery.threshold,1);
 assert.equal(recovery.counts.other,undefined);
 assert.equal(hostRecovery(state,'other',now).canVote,false);
});

test('votes are counted for eligible members only and require majority',()=>{
 const state=view({hostOfflineSince:now-500000,hostVotes:{host:'other',other:'me',me:'me'}});
 const recovery=hostRecovery(state,'me',now);
 assert.equal(recovery.counts.me,2);
 assert.equal(recovery.threshold,2);
 assert.equal(recovery.ownVote,'me');
});

test('kicked seat can be replaced or skipped without discarding written text',()=>{
 const p={...players[1],departed:true,excluded:true};
 const current=view({host:'me',players:[players[0],p,players[2]]});
 assert.deepEqual(seatOptions(current,'me','other'),{seat:p,canReplace:true,canSkip:true});
 assert.match(seatDecisionDialog(current,p,'me',escape),/choice-replace/);
 assert.match(seatDecisionDialog(current,p,'me',escape),/choice-skip/);
 assert.equal(seatOptions({...current,paused:true},'me','other').canSkip,false);
 assert.equal(seatOptions(current,'other','other').canReplace,false);
 assert.equal(seatOptions(current,'me','me').canReplace,false);
 assert.equal(seatOptions({...current,players:[players[0],{...p,submitted:true},players[2]]},'me','other').canSkip,false);
});

test('host transfer has a dedicated confirmation rather than a one-tap command',()=>{
 const html=controlsDialog(view({host:'me',players:[{...players[0],departed:false},players[1],players[2]]}),'me',escape);
 assert.match(html,/data-act="ask-transfer-host"/);
 assert.doesNotMatch(html,/data-act="transfer-host"/);
 assert.match(transferHostDialog(players[1],escape),/data-act="confirm-transfer-host"/);
});

test('reconnection never sends game commands before room_joined',()=>{
 const client=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(client,/view&&!roomJoinedOnSocket/);
 assert.match(client,/reconnect-banner/);
 assert.match(client,/button\.disabled=true/);
});
