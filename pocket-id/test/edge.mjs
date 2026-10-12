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
const directory=await request('directory?q='+encodeURIComponent(name.slice(0,5)),{cookie:registered.cookie});
assert.equal(directory.status,200,JSON.stringify(directory.data));
assert.ok(directory.data.users.some(u=>u.id===registered.data.user.id));
const noDirectory=await request('directory?q='+encodeURIComponent(name.slice(0,5)));
assert.equal(noDirectory.status,401);
const publicAccount=await request('public?id='+registered.data.user.id,{cookie:registered.cookie});
assert.equal(publicAccount.status,200);
assert.equal(publicAccount.data.user.nickname,name);
const socialNoAuth=await fetch(base+'/pocket-social/me',{headers:{'x-pw-account-id':registered.data.user.id}});
assert.equal(socialNoAuth.status,401,'Client-supplied account header cannot authenticate');
const socialMe=await fetch(base+'/pocket-social/me',{headers:{cookie:registered.cookie}});
assert.equal(socialMe.status,200);
assert.equal((await socialMe.json()).profile.nickname,name);
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
console.log('PASS: Pocket ID registration, unique nickname, profile, key rotation, sign out, recovery');
