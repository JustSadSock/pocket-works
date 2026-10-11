// Pocket ID capability for standalone Pocket Works apps.
// Client values are display hints; authorization is always checked server-side.
const presets={
  clay:['#bc7962','#eec8a2','M17 54 32 13l16 41z'],
  moss:['#537b68','#cee8ae','M32 54C9 39 16 17 32 14c16 3 23 25 0 40z'],
  ink:['#526681','#d0dddf','M32 14a18 18 0 1 0 0 36 18 18 0 1 0 0-36zm0 9a9 9 0 1 1 0 18 9 9 0 1 1 0-18z'],
  sun:['#cd9b56','#fff1bd','M32 7v9m0 32v9M7 32h9m32 0h9M14 14l7 7m22 22 7 7m0-36-7 7M21 43l-7 7M32 21a11 11 0 1 0 0 22 11 11 0 1 0 0-22z'],
  wave:['#497c94','#b5e1d4','M10 23c9-11 17 11 26 0s17 11 18 0M10 38c9-11 17 11 26 0s17 11 18 0M15 51c7-8 15 8 24 0'],
  ember:['#a65c4a','#f6c38d','M33 9c13 19-3 19 7 29 7-2 8-8 8-8 5 17-2 26-16 26-16 0-24-17-11-29 0 13 8 12 12-18z'],
  plum:['#816181','#ebcfdf','M32 7l7 15 17 2-12 13 3 18-15-8-15 8 3-18L8 24l17-2z'],
  stone:['#7b7b6c','#efecde','M32 7 53 21v25L32 57 11 46V21zM11 21l21 14 21-14M32 35v22']
};
export const pocketIdProfileUrl='/?pocket-id=login';
export const escapeIdentityHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function pocketAvatarMarkup(value,{small=false}={}){
  const id=Object.hasOwn(presets,value)?value:'clay';
  const [bg,ink,path]=presets[id];
  return '<span class="pw-identity-avatar'+(small?' pw-identity-avatar--small':'')+'" style="--pw-a-bg:'+bg+';--pw-a-ink:'+ink+'" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"><path d="'+path+'"/></svg></span>';
}
// A badge is only marked verified when PocketNet's trusted room state says so.
// LAN peers cannot claim a verified badge merely by sending metadata.
export function pocketPlayerBadge(player,{showGuest=true}={}){
  return player?.verified===true && player.accountId
    ? '<span class="pw-identity-mark pw-identity-mark--verified" title="Ник подтверждён Pocket ID">'+pocketAvatarMarkup(player.avatar,{small:true})+'<span>Pocket ID</span></span>'
    : showGuest?'<span class="pw-identity-mark pw-identity-mark--guest" title="Гостевое имя без подтверждения аккаунта">Гость</span>':'';
}
let cached=null,received=0,pending=null;
export async function getPocketIdentity({force=false}={}){
  if(!force&&received&&Date.now()-received<4000)return cached;
  if(pending&&!force)return pending;
  pending=(async()=>{
    try{
      const response=await fetch('/pocket-id/me',{credentials:'same-origin',cache:'no-store',
        signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new Error('Pocket ID unavailable');
      const info=await response.json();
      cached=info.user&&typeof info.user.id==='string'?info.user:null;
    }catch{cached=null}
    received=Date.now();
    return cached;
  })();
  try{return await pending}finally{pending=null}
}
export function preferredPocketName(identity,fallback){
  return identity?.complete&&identity.nickname?identity.nickname:fallback;
}
export function pocketIdentitySessionKey(identity){
  return identity?.complete&&identity.id?'pocket-id:'+identity.id:'guest';
}
