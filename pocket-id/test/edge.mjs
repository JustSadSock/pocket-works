import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const base=process.env.POCKET_ID_TEST_URL||'http://127.0.0.1:8787';
async function request(path,{method='GET',body,cookie}={}) {
  const response=await fetch(base+'/pocket-id/'+path,{
    method,
    headers:{
      origin:base,
      ...(body?{'content-type':'application/json'}:{}),
      ...(cookie?{cookie}:{}),
    },
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const data=await response.json();
  return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]||''};
}
for(let n=0;n<80;n++){
  try{const ok=await request('config');if(ok.status===200)break;}catch{}
  if(n===79)throw new Error('Pocket ID API did not start');
  await delay(300);
}
const policy=await fetch(base+'/privacy');
assert.equal(policy.status,200,'Public privacy policy must resolve without login');
assert.match(policy.headers.get('content-type')||'',/text\/html/i);
const policyBody=await policy.text();
assert.match(policyBody,/<title>Privacy Policy — Pocket Works<\/title>/);
assert.match(policyBody,/Google subject ID/);
assert.match(policyBody,/Cloudflare/);
const cfg=await request('config');
assert.ok(cfg.data.avatars.includes('clay'));
assert.equal(cfg.data.googleEnabled,false);
const name='PID'+Date.now().toString(36);
const registered=await request('register',{method:'POST',body:{nickname:name,avatar:'clay'}});
assert.equal(registered.status,201,JSON.stringify(registered.data));
assert.equal(registered.data.user.nickname,name);
assert.equal(registered.data.user.linkedGoogle,false);
assert.match(registered.data.recoveryCode,/^PW1-/);
assert.match(registered.cookie,/^__Host-pw-id=/);
const duplicate=await request('register',{method:'POST',body:{nickname:name.toLowerCase(),avatar:'ink'}});
assert.equal(duplicate.status,409);
assert.equal(duplicate.data.error,'nickname_taken');
const mine=await request('me',{cookie:registered.cookie});
assert.equal(mine.data.user.id,registered.data.user.id);
// Pocket Social must query the real indexed nickname directory through authenticated Pocket ID.
const codeGuest=await request('redeem',{method:'POST',body:{code:'PW-NOT-A-VALID-CODE'}});
assert.equal(codeGuest.status,401,'Redeeming requires a Pocket ID session');
const codeUntrustedOrigin=await fetch(base+'/pocket-id/redeem',{
  method:'POST',headers:{cookie:registered.cookie,'content-type':'application/json',origin:'https://example.invalid'},
  body:JSON.stringify({code:'PW-NOT-A-VALID-CODE'})
});
assert.equal(codeUntrustedOrigin.status,403,'Cross-origin redemption must be denied');
const codeInvalid=await request('redeem',{method:'POST',cookie:registered.cookie,body:{code:'PW-NOT-A-VALID-CODE'}});
assert.equal(codeInvalid.status,400,'Unknown codes must not be activated');
const codeAfterInvalid=await request('me',{cookie:registered.cookie});
assert.deepEqual(codeAfterInvalid.data.user.entitlements,[],'Invalid codes must not grant privileges');
const archiveGuest=await request('global-archive');
assert.equal(archiveGuest.status,200);
assert.ok(Array.isArray(archiveGuest.data.archived));
assert.ok(Array.isArray(archiveGuest.data.pinned),'Public global pins must be readable by guests');
assert.equal(archiveGuest.data.canManage,false);
const archiveMember=await request('global-archive',{cookie:registered.cookie});
assert.equal(archiveMember.status,200);
assert.equal(archiveMember.data.canManage,false);
const guestArchiveWrite=await request('global-archive',{method:'POST',body:{slugs:['test-project'],archived:true}});
assert.equal(guestArchiveWrite.status,401);
const unauthorizedArchiveWrite=await request('global-archive',{method:'POST',cookie:registered.cookie,body:{slugs:['test-project'],archived:true}});
assert.equal(unauthorizedArchiveWrite.status,403);
const guestPinWrite=await request('global-pins',{method:'POST',body:{slugs:['test-project'],pinned:true}});
assert.equal(guestPinWrite.status,401);
const unauthorizedPinWrite=await request('global-pins',{method:'POST',cookie:registered.cookie,
  body:{slugs:['test-project'],pinned:true}});
assert.equal(unauthorizedPinWrite.status,403,'A signed-in regular user cannot pin globally');
const directory=await request('directory?q='+encodeURIComponent(name.slice(0,5)),{cookie:registered.cookie});
assert.equal(directory.status,404,'Internal directory is not a public API');
const publicAccount=await request('public?id='+registered.data.user.id,{cookie:registered.cookie});
assert.equal(publicAccount.status,404);
const socialNoAuth=await fetch(base+'/pocket-social/me',{headers:{'x-pw-account-id':registered.data.user.id}});
assert.equal(socialNoAuth.status,401,'Client-supplied account header cannot authenticate');
const socialMe=await fetch(base+'/pocket-social/me',{headers:{cookie:registered.cookie}});
assert.equal(socialMe.status,200);
assert.equal((await socialMe.json()).profile.nickname,name);
const socialSearch=await fetch(base+'/pocket-social/search?q='+encodeURIComponent(name.slice(0,5)),{headers:{cookie:registered.cookie}});
assert.equal(socialSearch.status,200,await socialSearch.text().catch(()=>'')); 
const socialUser=await fetch(base+'/pocket-social/user?id='+registered.data.user.id,{headers:{cookie:registered.cookie}});
assert.equal(socialUser.status,200);
assert.equal((await socialUser.json()).profile.nickname,name);
const available=await request('nickname?value='+encodeURIComponent(name));
assert.equal(available.data.available,false);
const renamed=await request('profile',{method:'POST',cookie:registered.cookie,body:{nickname:name+'X',avatar:'wave'}});
assert.equal(renamed.status,200);
assert.equal(renamed.data.user.avatar,'wave');
const rotated=await request('new-key',{method:'POST',cookie:registered.cookie,body:{}});
assert.equal(rotated.status,200);
assert.notEqual(rotated.data.recoveryCode,registered.data.recoveryCode);
const signedout=await request('logout',{method:'POST',cookie:registered.cookie,body:{}});
assert.equal(signedout.status,200);
const noSession=await request('me',{cookie:registered.cookie});
assert.equal(noSession.data.user,null);
const wrong=await request('recover',{method:'POST',body:{recoveryCode:registered.data.recoveryCode}});
assert.equal(wrong.status,401);
const restored=await request('recover',{method:'POST',body:{recoveryCode:rotated.data.recoveryCode}});
assert.equal(restored.status,200);
assert.equal(restored.data.user.nickname,name+'X');
const editedAfterRecovery=await request('profile',{method:'POST',cookie:restored.cookie,body:{nickname:name+'Z',avatar:'moss'}});
assert.equal(editedAfterRecovery.status,200);
assert.equal(editedAfterRecovery.data.user.avatar,'moss');
// Positive smoke test for an isolated local Wrangler DB. Never hardcode the
// plaintext code or run this against production: redemption is intentionally one-time.
if(process.env.POCKET_ID_TEST_ACTIVATION_CODE){
  if(!base.startsWith('http://127.0.0.1:')&&!base.startsWith('http://localhost:'))
    throw Error('Positive redemption smoke test is restricted to localhost');
  const code=process.env.POCKET_ID_TEST_ACTIVATION_CODE;
  const redeemed=await request('redeem',{method:'POST',cookie:restored.cookie,body:{code}});
  assert.equal(redeemed.status,200,JSON.stringify(redeemed.data));
  assert.equal(redeemed.data.entitlement,'role:administrator');
  assert.ok(redeemed.data.user.entitlements.includes('role:administrator'));
  const again=await request('redeem',{method:'POST',cookie:restored.cookie,body:{code}});
  assert.equal(again.status,409,'Code must be single-use, even for the same account');
  const adminList=await request('global-archive',{cookie:restored.cookie});
  assert.equal(adminList.data.canManage,true);
  const changed=await request('global-archive',{method:'POST',cookie:restored.cookie,
    body:{slugs:['pocket-id-test-archive'],archived:true}});
  assert.equal(changed.status,200,'Redeemed admin must manage global archive');
  assert.ok(changed.data.archived.includes('pocket-id-test-archive'));
  await request('global-archive',{method:'POST',cookie:restored.cookie,
    body:{slugs:['pocket-id-test-archive'],archived:false}});
  const badPin=await request('global-pins',{method:'POST',cookie:restored.cookie,
    body:{slugs:['../invalid'],pinned:true}});
  assert.equal(badPin.status,400,'Invalid pin slugs must be rejected');
  const pinned=await request('global-pins',{method:'POST',cookie:restored.cookie,
    body:{slugs:['pocket-id-test-pin-a','pocket-id-test-pin-b'],pinned:true}});
  assert.equal(pinned.status,200,'Redeemed admin must manage global pins');
  assert.ok(pinned.data.pinned.includes('pocket-id-test-pin-a'));
  assert.ok(pinned.data.pinned.includes('pocket-id-test-pin-b'));
  const pinPublic=await request('global-archive');
  assert.ok(pinPublic.data.pinned.includes('pocket-id-test-pin-a'),'Guests see the same global pin snapshot');
  const unpinned=await request('global-pins',{method:'POST',cookie:restored.cookie,
    body:{slugs:['pocket-id-test-pin-a','pocket-id-test-pin-b'],pinned:false}});
  assert.equal(unpinned.status,200);
  assert.equal(unpinned.data.pinned.includes('pocket-id-test-pin-a'),false);
  assert.equal(unpinned.data.pinned.includes('pocket-id-test-pin-b'),false);
  console.log('PASS: Single-use activation, persisted admin rights, global archive and pin writes');
}
console.log('PASS: Pocket ID registration, unique nickname, profile, key rotation, sign out, recovery and code security');
