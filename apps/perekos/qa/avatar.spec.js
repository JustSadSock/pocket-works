import {test,expect} from '@playwright/test';
// Route-mocked profile requests must not be intercepted by the app service worker.
// Offline/PWA operation stays covered by the real (unmocked) journey suite.
test.use({serviceWorkers:'block'});
const ID='11111111-1111-4111-8111-111111111111';
const user={user:{id:ID,complete:true,nickname:'Свой маг',avatar:'moss'}};
const routeProfiles=async(page,readProfile)=>{
 await page.route('**/pocket-id/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)}));
 await page.route('**/pocket-social/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({profile:{id:ID,...readProfile()}})}));
};
test('registered MASKOT becomes a rabbit-crowned wizard visible in menu and combat',async({page})=>{
 await routeProfiles(page,()=>({maskot:{animal:'rabbit',hat:'crown',clothes:'mantle',face:'glasses'},artwork:''}));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await expect.poll(()=>page.evaluate(()=>window.__perekosTest?.appearance?.source),{timeout:12000}).toBe('maskot');
 const look=await page.evaluate(()=>window.__perekosTest.appearance);
 expect(look.mascot).toMatchObject({animal:'rabbit',hat:'crown',clothes:'mantle',face:'glasses'});
 await expect(page.locator('#identity')).toHaveText('Свой маг');
 await expect(page.locator('#identity-kind')).toHaveText('Маскот из PocketWorks');
 await expect.poll(()=>page.evaluate(()=>{const c=document.querySelector('#hero-preview');return [...c.getContext('2d').getImageData(0,0,c.width,c.height).data].filter((v,i)=>i%4===3&&v>0).length}),{timeout:10000}).toBeGreaterThan(500);
 await page.locator('#mode-duel').click();
 await page.locator('#primary-action').click();
 await expect(page.locator('#hud')).toBeVisible();
 await expect(page.locator('#my-name')).toContainText('СВОЙ МАГ');
 await expect(page.locator('#my-portrait')).toBeVisible();
 expect(await page.evaluate(()=>window.__perekosTest.appearance.source)).toBe('maskot');
});
test('current match remains cosmetically stable until between-round transition',async({page})=>{
 let maskot={animal:'cat',hat:'beret',clothes:'tunic',face:'none'};
 await routeProfiles(page,()=>({maskot,artwork:''}));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await expect.poll(()=>page.evaluate(()=>window.__perekosTest?.appearance?.mascot?.animal),{timeout:12000}).toBe('cat');
 await page.locator('#mode-duel').click();
 await page.locator('#primary-action').click();
 maskot={animal:'frog',hat:'flower',clothes:'vest',face:'stars'};
 await page.evaluate(()=>window.__perekosTest.refreshAvatar());
 await expect.poll(()=>page.evaluate(()=>window.__perekosTest.hasPendingAppearance)).toBe(true);
 expect(await page.evaluate(()=>window.__perekosTest.appearance.mascot.animal)).toBe('cat');
 await page.evaluate(()=>{for(let i=0;i<2000&&window.__perekosTest.state.phase==='fight';i++)window.__perekosTest.step()});
 await expect(page.locator('#draft')).toBeVisible();
 await page.locator('.rune-choice').first().click();
 await expect(page.locator('#build')).toBeVisible();
 await page.locator('#bench-fight').click();
 await expect.poll(()=>page.evaluate(()=>window.__perekosTest.appearance.mascot.animal)).toBe('frog');
});
test('malicious mismatched social ID cannot impersonate an avatar; user can still play',async({page})=>{
 await page.route('**/pocket-id/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)}));
 await page.route('**/pocket-social/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({profile:{id:'22222222-2222-4222-8222-222222222222',maskot:{animal:'frog'},artwork:'data:image/svg+xml;base64,AAAA'}})}));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await expect.poll(()=>page.evaluate(()=>window.__perekosTest?.appearance?.source),{timeout:12000}).toBe('preset');
 expect(await page.evaluate(()=>window.__perekosTest.appearance.mascot)).toBe(null);
 await page.locator('#mode-duel').click();
 await page.locator('#primary-action').click();await expect(page.locator('#hud')).toBeVisible();
});
test('a real drawn PNG survives as pixel badge and account portrait',async({page})=>{
 // A deterministic 1x1 compressed PNG within the platform's safe size budget.
 const art='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOblmB4AAAAASUVORK5CYII=';
 await routeProfiles(page,()=>({artwork:art,maskot:null}));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await expect.poll(()=>page.evaluate(()=>window.__perekosTest?.appearance?.source),{timeout:12000}).toBe('drawing');
 await expect.poll(()=>page.evaluate(()=>window.__perekosTest?.appearance?.hasArt),{timeout:12000}).toBe(true);
 await expect(page.locator('#identity-kind')).toHaveText('Рисунок из PocketWorks');
 await page.locator('#mode-duel').click();
 await page.locator('#primary-action').click();
 await expect(page.locator('#my-portrait')).toBeVisible();
});
test('offline Pocket ID does not prevent a complete guest duel',async({page})=>{
 await page.route('**/pocket-id/me',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await expect.poll(()=>page.evaluate(()=>window.__perekosTest?.appearance?.source),{timeout:12000}).toBe('guest');
 await expect(page.locator('#identity')).toHaveText('Гостевой маг');
 await page.locator('#mode-duel').click();
 await page.locator('#primary-action').click();await expect(page.locator('#hud')).toBeVisible();
 await page.locator('#pause-btn').click();await expect(page.locator('#pause')).toBeVisible();
});
