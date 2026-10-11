import assert from 'node:assert/strict';
import {
  getPocketIdentity, preferredPocketName, pocketIdentitySessionKey,
  pocketPlayerBadge, pocketAvatarMarkup, pocketIdProfileUrl
} from './identity.js';

const originalFetch=globalThis.fetch;
try{
 let response={user:null};
 globalThis.fetch=async (url,options)=>{
  assert.equal(url,'/pocket-id/me');
  assert.equal(options.credentials,'same-origin');
  return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});
 };
 assert.equal(await getPocketIdentity({force:true}),null);
 assert.equal(preferredPocketName(null,'Музыкант'),'Музыкант');
 assert.equal(pocketIdentitySessionKey(null),'guest');
 const account={id:'11111111-1111-4111-8111-111111111111',nickname:'Restorer',avatar:'plum',complete:true,updatedAt:42};
 response={user:account};
 assert.deepEqual(await getPocketIdentity({force:true}),account);
 assert.equal(preferredPocketName(account,'Guest'),'Restorer');
 assert.equal(pocketIdentitySessionKey(account),'pocket-id:'+account.id);
 assert.equal(pocketIdentitySessionKey({...account,updatedAt:43}),pocketIdentitySessionKey(account));
 assert.match(pocketAvatarMarkup('plum'),/pw-identity-avatar/);
 assert.equal(pocketAvatarMarkup('evil" onmouseover="bad').includes('onmouseover'),false);
 const badge=pocketPlayerBadge({accountId:account.id,avatar:'plum',verified:true});
 assert.match(badge,/Pocket ID/);
 assert.match(badge,/pw-identity-avatar/);
 assert.doesNotMatch(pocketPlayerBadge({name:'Restorer',verified:false,avatar:'plum'}),/Pocket ID/);
 assert.match(pocketPlayerBadge({name:'Restorer',verified:false}),/Гость/);
 assert.equal(pocketIdProfileUrl,'/?pocket-id=login');
 globalThis.fetch=async()=>{throw Error('network down')};
 assert.equal(await getPocketIdentity({force:true}),null);
 console.log('PASS: app identity capability, safe avatars, guest fallback, shared profile deep-link');
}finally{globalThis.fetch=originalFetch}
