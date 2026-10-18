import {test,expect} from '@playwright/test';
// Mocked Pocket ID and PocketNet calls must reach Playwright rather than an
// installed PWA worker (notably WebKit after initial navigation).
test.use({serviceWorkers:'block'});
const ID_A='00000000-0000-4000-8000-000000000001';
const ID_B='00000000-0000-4000-8000-000000000002';
const account=(id='00000000-0000-4000-8000-000000000001',nickname='Марта')=>({id,nickname,avatar:'moss',complete:true});
async function fixture(page,{identity=account(),online=true}={}){
 await page.route('**/pocket-id/me',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:identity})}));
 await page.route('**/pocket-social/me',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({profile:{id:identity?.id||'',artwork:'',maskot:null}})}));
 await page.route('**/pocketnet/health',r=>r.fulfill({status:online?200:503,contentType:'application/json',body:JSON.stringify({ok:online,modules:online?['chyepukha']:[]})}));
}

test('Pocket ID is immediately visible and creates a room under the account nickname',async({page})=>{
 await fixture(page);
 await page.route('**/pocketnet/session',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'a'.repeat(64)})}));
 await page.goto('/apps/chyepukha/index.html');
 await expect(page.locator('.home-identity.is-member strong')).toHaveText('Марта');
 await expect(page.locator('#profileBtn')).toContainText('Марта');
 await expect(page.locator('#guestNick')).toHaveCount(0);
 await expect(page.locator('.home-identity .pw-identity-avatar')).toBeVisible();
 await expect(page.locator('#network')).toContainText('ONLINE');
 const request=page.waitForRequest(req=>req.url().endsWith('/pocketnet/session')&&req.method()==='POST',{timeout:16000});
 await page.locator('#createForm button[type=submit]').click();
 const sent=await request;expect(sent.postDataJSON().name).toBe('Марта');
 // The test intentionally does not run a WebSocket server; assert recovery,
 // not a persistent "connecting" screen after a failed socket.
 await expect(page.locator('.home-warning')).toContainText('Не вдалося підключитися');
 await expect(page.locator('#createForm button[type=submit]')).toBeEnabled();
});

test('guest gets one nickname input shared by room creation and invitation',async({page})=>{
 await fixture(page,{identity:null});
 await page.route('**/pocketnet/session',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'a'.repeat(64)})}));
 await page.goto('/apps/chyepukha/index.html');
 await expect(page.locator('.home-identity.is-guest')).toBeVisible();
 await expect(page.locator('#guestNick')).toHaveCount(1);
 await page.locator('#guestNick').fill('Олеся');
 await page.locator('#joinForm [name=room]').fill('a1b2c3d4');
 const request=page.waitForRequest(req=>req.url().endsWith('/pocketnet/session')&&req.method()==='POST',{timeout:16000});
 await page.locator('#joinForm button[type=submit]').click();
 expect((await request).postDataJSON().name).toBe('Олеся');
});

test('a Pocket ID switch revokes stale tab token without writing a different account',async({page})=>{
 let logged=account();
 await page.route('**/pocket-id/me',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:logged})}));
 await page.route('**/pocket-social/me',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({profile:{id:logged.id,artwork:'',maskot:null}})}));
 await page.route('**/pocketnet/health',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,modules:['chyepukha']})}));
 await page.goto('/apps/chyepukha/index.html');
 await expect(page.locator('.home-identity.is-member strong')).toHaveText('Марта');
 await page.evaluate(()=>sessionStorage.setItem('pocket-net:'+location.origin+'/pocketnet',JSON.stringify({identityKey:'pocket-id:'+ '00000000-0000-4000-8000-000000000001',token:'x'.repeat(64),roomId:null})));
 logged=account(ID_B,'Софія');
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect(page.locator('.home-identity.is-member strong')).toHaveText('Софія',{timeout:16000});
 expect(await page.evaluate(()=>sessionStorage.getItem('pocket-net:'+location.origin+'/pocketnet'))).toBeNull();
});

test('offline PocketNet health is visible without suppressing guest actions',async({page})=>{
 await fixture(page,{identity:null,online:false});
 await page.goto('/apps/chyepukha/index.html');
 await expect(page.locator('#network')).toContainText('OFFLINE');
 await page.locator('#guestNick').fill('Назар');
 await page.locator('#createForm button[type=submit]').click();
 await expect(page.locator('.home-warning')).toContainText('Не вдалося підключитися');
 await expect(page.locator('#guestNick')).toHaveValue('Назар');
});

test('the real main screen fits mobile viewport for logged-in players',async({page})=>{
 await fixture(page);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/apps/chyepukha/index.html');
 await expect(page.locator('.home-identity.is-member')).toBeVisible();
 await expect(page.locator('.home-cover h1')).toContainText('ЧЕПУХА');
 await expect(page.locator('#createForm button')).toBeVisible();
 await expect(page.locator('#joinForm button')).toBeVisible();
 const bounds=await page.evaluate(()=>({
   scrollWidth:document.documentElement.scrollWidth,width:innerWidth,
   join:document.querySelector('#joinForm button').getBoundingClientRect().bottom,
   h:innerHeight
 }));
 expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width+2);
 expect(bounds.join).toBeLessThanOrEqual(bounds.h+3);
});
