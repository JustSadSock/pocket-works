import assert from 'node:assert/strict';
import {
  getPocketIdentity, preferredPocketName, pocketIdentitySessionKey,
  pocketPlayerBadge, pocketAvatarMarkup, pocketIdProfileUrl
} from './identity.js';

const originalFetch=globalThis.fetch;
try{
 let response={user:null};
 const artwork='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
 globalThis.fetch=async (url,options)=>{
  assert.equal(options.credentials,'same-origin');
  if(url==='/pocket-social/me')return new Response(JSON.stringify({profile:{id:response.user.id,artwork}}),{status:200});
  assert.equal(url,'/pocket-id/me');
  return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});
 };
 assert.equal(await getPocketIdentity({force:true}),null);
 assert.equal(preferredPocketName(null,'Музыкант'),'Музыкант');
 assert.equal(pocketIdentitySessionKey(null),'guest');
 const account={id:'11111111-1111-4111-8111-111111111111',nickname:'Restorer',avatar:'plum',complete:true,updatedAt:42};
 response={user:account};
 const decorated=await getPocketIdentity({force:true});
 assert.equal(decorated.id,account.id);
 assert.equal(decorated.nickname,account.nickname);
 assert.equal(decorated.artwork,artwork);
 assert.equal(preferredPocketName(account,'Guest'),'Restorer');
 assert.equal(pocketIdentitySessionKey(account),'pocket-id:'+account.id);
 assert.equal(pocketIdentitySessionKey({...account,updatedAt:43}),pocketIdentitySessionKey(account));
 assert.match(pocketAvatarMarkup('plum'),/pw-identity-avatar/);
 assert.match(pocketAvatarMarkup(decorated.artwork),/<img/);
 assert.doesNotMatch(pocketAvatarMarkup('data:image/svg+xml;base64,PHN2Zz4='),/<img/);
 assert.match(pocketAvatarMarkup('plum',{accountId:account.id}),/data-pw-account/);
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
