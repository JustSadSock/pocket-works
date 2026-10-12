// Pocket ID launcher surface. Local app data remains untouched; cloud identity is optional.
const $ = selector => document.querySelector(selector);
const dialog = $('#pocket-id-dialog');
const trigger = $('#pocket-id-trigger');
const content = $('#pocket-id-content');
const headline = $('#pocket-id-heading');
const subtitle = $('#pocket-id-subtitle');
const status = $('#pocket-id-status');
const googleAction = $('#pocket-id-google');
const guestIntro = $('#pocket-id-guest');
const edit = $('#pocket-id-edit');
const nicknameInput = $('#pocket-id-nickname');
const nameHint = $('#pocket-id-nickname-hint');
const primary = $('#pocket-id-save');
const recoveryBox = $('#pocket-id-recovery');
const recoveryValue = $('#pocket-id-recovery-value');
const recoveryCopy = $('#pocket-id-recovery-copy');
const recoverSection = $('#pocket-id-recover');
const recoverInput = $('#pocket-id-recover-code');
const recoverButton = $('#pocket-id-recover-submit');
const recoverToggle = $('#pocket-id-recover-toggle');
const newAccount = $('#pocket-id-new-account');
const activeSection = $('#pocket-id-active');
const activeName = $('#pocket-id-active-name');
const activeCaption = $('#pocket-id-active-caption');
const activeAvatar = $('#pocket-id-active-avatar');
const resetKey = $('#pocket-id-reset-key');
const signout = $('#pocket-id-signout');
let user=null;
let config={googleEnabled:false,avatars:['clay','moss','ink','sun','wave','ember','plum','stone']};
let mode='create',busy=false,validationClock=0,validationGeneration=0;
const artwork={
  clay:'<path d="M17 54 32 13l16 41z"/><circle cx="32" cy="38" r="6"/>',
  moss:'<path d="M32 54C9 39 16 17 32 14c16 3 23 25 0 40Z"/><path d="M32 53V18M32 36l11-10M32 44l-10-9"/>',
  ink:'<circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="9"/><circle cx="32" cy="32" r="2.5"/>',
  sun:'<circle cx="32" cy="32" r="11"/><path d="M32 7v9m0 32v9M7 32h9m32 0h9M14 14l7 7m22 22 7 7m0-36-7 7M21 43l-7 7"/>',
  wave:'<path d="M10 23c9-11 17 11 26 0s17 11 18 0M10 38c9-11 17 11 26 0s17 11 18 0M15 51c7-8 15 8 24 0"/>',
  ember:'<path d="M33 9c13 19-3 19 7 29 7-2 8-8 8-8 5 17-2 26-16 26-16 0-24-17-11-29 0 13 8 12 12-18Z"/><path d="M33 34c8 10 5 18-2 18s-10-8 2-18Z"/>',
  plum:'<path d="M32 7l7 15 17 2-12 13 3 18-15-8-15 8 3-18L8 24l17-2z"/>',
  stone:'<path d="M32 7 53 21v25L32 57 11 46V21z"/><path d="M11 21l21 14 21-14M32 35v22"/>'
};
const colors={
  clay:['#bc7962','#eec8a2'],moss:['#537b68','#cee8ae'],ink:['#526681','#d0dddf'],
  sun:['#cd9b56','#fff1bd'],wave:['#497c94','#b5e1d4'],ember:['#a65c4a','#f6c38d'],
  plum:['#816181','#ebcfdf'],stone:['#7b7b6c','#efecde']
};
function avatar(id,className='pw-id-avatar') {
  const [bg,fg]=colors[id]||colors.clay;
  return `<span class="${className}" style="--id-bg:${bg};--id-fg:${fg}" aria-hidden="true">
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${artwork[id]||artwork.clay}</svg></span>`;
}
function message(text,kind='info') {
  status.textContent=text;status.dataset.kind=kind;
}
function setBusy(value) {
  busy=value;
  for(const control of dialog.querySelectorAll('button,input')) {
    if(control.id==='pocket-id-close') continue;
    control.disabled=value;
  }
  content.dataset.busy=String(value);
}
async function api(path,options={}) {
  let response;
  try {
    response=await fetch('/pocket-id/'+path,{
      credentials:'same-origin',cache:'no-store',
      ...options,headers:options.body?{'content-type':'application/json'}:undefined
    });
  } catch { throw new Error('Network unavailable. Try again online.'); }
  const data=await response.json().catch(()=>({error:'bad_response'}));
  if(!response.ok) {
    const messages={
      nickname_taken:'This nickname is already taken.',invalid_profile:'Use 3–20 letters, numbers, _ or - and choose an avatar.',
      already_signed_in:'Already signed in. Sign out before creating another account.',
      too_many_attempts:'Too many attempts. Try again in 15 minutes.',
      invalid_recovery_code:'Recovery key is invalid.',sign_in_required:'Session expired. Sign in again.',
      google_not_configured:'Google sign-in has not been configured by the site owner.',
      internal_error:'Server error. Try again.',origin_or_content_type_denied:'Request not accepted.'
    };
    throw new Error(messages[data.error]||data.error||'Unable to complete request.');
  }
  return data;
}
function publish(userValue) {
  user=userValue;
  trigger.innerHTML=user?.complete?avatar(user.avatar,'pw-id-nav-avatar'):'<span class="pw-id-nav-glyph" aria-hidden="true">◎</span>';
  trigger.setAttribute('aria-label',user?.complete?'Pocket ID: '+user.nickname:'Open Pocket ID');
  trigger.title=user?.complete?user.nickname:'Pocket ID';
  document.dispatchEvent(new CustomEvent('pocket-id:changed',{detail:{user}}));
}
window.PocketID=Object.freeze({
  getUser:()=>user?Object.freeze({...user}):null,
  refresh:async()=>{const data=await api('me');publish(data.user);return data.user;},
  openAccount:()=>{mode=user?(user.complete?'view':'onboarding'):'create';openDialog()},
  openSignIn:()=>{mode='create';openDialog()}
});
function display() {
  guestIntro.hidden=Boolean(user?.linkedGoogle)||!config.googleEnabled;
  activeSection.hidden=!user;
  edit.hidden=!user?.complete&&(mode==='create'||mode==='onboarding');
  recoverSection.hidden=mode!=='recover';
  recoveryBox.hidden=mode!=='key';
  recoverToggle.hidden=Boolean(user)||mode==='recover';
  newAccount.hidden=Boolean(user)||mode!=='recover';
  googleAction.hidden=!config.googleEnabled||Boolean(user?.linkedGoogle);
  googleAction.textContent=user?'Link Google account':'Continue with Google';
  headline.textContent=user?'Безопасность Pocket ID':mode==='recover'?'Восстановление доступа':'Твой Pocket ID';
  subtitle.textContent=user?'Внешний вид, рисунок и никнейм настраиваются в общей карточке пользователя.':'Войди или создай учётную запись. Играть можно и без неё.';
  if(user) {
    activeName.textContent=user.nickname||'Choose your nickname';
    activeAvatar.innerHTML=avatar(user.avatar);
    activeCaption.textContent=user.linkedGoogle?'Google connected':'Recovery-key account';
  }
  if(mode==='create'||mode==='onboarding') {
    nicknameInput.value=user?.nickname||nicknameInput.value||'';
    primary.textContent=user?'Завершить создание профиля':'Создать Pocket ID';
    nameHint.textContent='3–20 characters · letters, numbers, _ and -';
  }
  $('#pocket-id-edit-action').hidden=!user?.complete;
  $('#pocket-id-recovery-action').hidden=!user||mode==='key';
  signout.hidden=!user;
}
function openDialog() {
  if(!dialog.open) dialog.showModal();
  if(mode!=='key') {
    mode=user?(user.complete?'view':'onboarding'):'create';
  }
  display();
  if(user?.complete) message('Your identity is saved securely.','success');
  else message('Guest mode remains available without an account.');
}
function showRecovery(key) {
  mode='key';
  recoveryValue.textContent=key;
  display();
  message('Save this recovery key outside Pocket Works. It grants account access.','warning');
}
async function refresh() {
  const [state,settings]=await Promise.all([api('me'),api('config')]);
  config=settings;
  publish(state.user);
  if(user&&!user.complete) mode='onboarding';
  else if(mode!=='key') mode=user?'view':'create';
  display();
}
trigger.addEventListener('click',()=>{
  if(user?.complete&&window.PocketSocial?.open)window.PocketSocial.open();
  else {mode=user?(user.complete?'view':'onboarding'):'create';openDialog()}
});
$('#pocket-id-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog) dialog.close();});
googleAction.addEventListener('click',()=>{location.assign('/pocket-id/login/google');});
$('#pocket-id-edit-action').addEventListener('click',()=>{
  dialog.close();
  if(window.PocketSocial?.open)window.PocketSocial.open();
});
$('#pocket-id-recovery-action').addEventListener('click',async()=>{
  if(!confirm('Replace your current recovery key? Your old key will stop working.')) return;
  setBusy(true);
  try { const result=await api('new-key',{method:'POST',body:'{}'});showRecovery(result.recoveryCode); }
  catch(error){message(error.message,'error');}
  finally{setBusy(false);}
});
recoverToggle.addEventListener('click',()=>{mode='recover';display();message('Enter the recovery key saved when you created your account.');});
newAccount.addEventListener('click',()=>{mode='create';display();message('Choose a nickname and avatar.');});
recoveryCopy.addEventListener('click',async()=>{
  try {
    await navigator.clipboard.writeText(recoveryValue.textContent);
    message('Recovery key copied. Store it somewhere private.','success');
  } catch {message('Copy unavailable. Select and copy the key manually.','warning');}
});
$('#pocket-id-recovery-done').addEventListener('click',()=>{
  mode='view';display();message('Профиль создан.','success');
  if(user?.complete){dialog.close();window.PocketSocial?.open?.()}
});
signout.addEventListener('click',async()=>{
  setBusy(true);
  try {await api('logout',{method:'POST',body:'{}'});publish(null);mode='create';display();message('Signed out. Local game data was not removed.','success');}
  catch(error){message(error.message,'error');}finally{setBusy(false);}
});
recoverButton.addEventListener('click',async()=>{
  setBusy(true);
  try { const result=await api('recover',{method:'POST',body:JSON.stringify({recoveryCode:recoverInput.value.trim()})});
    publish(result.user);mode='view';recoverInput.value='';display();message('Вход выполнен.','success');if(result.user?.complete){dialog.close();window.PocketSocial?.open?.()}
  }catch(error){message(error.message,'error');}finally{setBusy(false);}
});
primary.addEventListener('click',async()=>{
  setBusy(true);
  try {
    const result=await api(user?'profile':'register',{method:'POST',body:JSON.stringify({nickname:nicknameInput.value.trim(),avatar:user?.avatar||'clay'})});
    publish(result.user);
    if(result.recoveryCode) showRecovery(result.recoveryCode);
    else {mode='view';display();message('Профиль сохранён.','success');dialog.close();window.PocketSocial?.open?.()}
  }catch(error){message(error.message,'error');}finally{setBusy(false);}
});
nicknameInput.addEventListener('input',()=>{
  const input=nicknameInput.value.trim();
  nameHint.textContent='Checking nickname…';
  const generation=++validationGeneration;
  clearTimeout(validationClock);
  validationClock=setTimeout(async()=>{
    try {
      const result=await api('nickname?value='+encodeURIComponent(input));
      if(generation!==validationGeneration) return;
      const own=user?.nickname?.normalize('NFKC').toLowerCase()===input.normalize('NFKC').toLowerCase();
      nameHint.textContent=result.available||own?'Nickname available.':'Nickname already taken.';
      nameHint.dataset.kind=result.available||own?'success':'error';
    } catch(error) {
      if(generation!==validationGeneration)return;
      nameHint.textContent=error.message.includes('invalid_nickname')?'3–20 characters · letters, numbers, _ and -':'Name availability will be checked when saving.';
      nameHint.dataset.kind='info';
    }
  },340);
});
(async()=>{
  try {
    await refresh();
  }catch(error) {
    message(error.message,'error');
    config={...config,googleEnabled:false};
    publish(null);mode='create';display();
  }
  const query=new URLSearchParams(location.search),result=query.get('pocket-id');
  if(result==='welcome'||result==='error'||result==='login') {
    query.delete('pocket-id');const reason=query.get('reason');query.delete('reason');
    history.replaceState(history.state,'',location.pathname+(query.toString()?'?'+query:'')+location.hash);
    openDialog();
    if(result==='error') message('Google sign-in was unsuccessful: '+(reason||'unknown error').replaceAll('_',' '),'error');
    else if(result==='welcome') message('Google account connected. Set your nickname and avatar to finish.','success');
  }
})();
