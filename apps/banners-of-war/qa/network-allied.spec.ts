import {test,expect,devices,type Page,type BrowserContext} from '@playwright/test';
import {makeProject,flatTerrain,validateScenarioProject} from '../laboratory.js';

async function request(p:Page,path:string,body?:any){
 return p.evaluate(async({path,body})=>{let r=await fetch('/pocketnet/banners/'+path,{credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});return {status:r.status,data:await r.json()}},{path,body});
}
async function view(p:Page,id:string){let r=await request(p,id+'/view');expect(r.status).toBe(200);return r.data}
async function action(p:Page,id:string,type:string,extra:any={}){
 let v=await view(p,id);return request(p,id+'/action',{type,seq:v.nextSeq,revision:v.allied.revision,...extra});
}
async function waitPhase(p:Page,id:string,phase:string){await expect.poll(async()=>(await view(p,id)).phase,{timeout:45000}).toBe(phase);return view(p,id)}
async function code(p:Page){await expect(p.locator('#net-status')).toContainText(/Комната [0-9A-F]{16}/);return (await p.locator('#net-status').textContent())!.match(/[0-9A-F]{16}/)![0].toLowerCase()}
function fixture(historical:boolean){
 const p=makeProject({seed:'Allied QA',width:1400,height:900});p.title='Allied QA';p.terrain=flatTerrain(p.width,p.height);p.seconds=60;p.fog=true;p.historical=historical;
 const t={...p.armies[0].units[0],type:'spear',profile:null,n:120,cols:16,form:'line',ammo:0,customSpec:null};
 for(const side of [0,1]){
  p.armies[side].units=Array.from({length:6},(_,j)=>({...t,name:'Regiment '+(j+1),group:['Left','Center','Reserve'][Math.floor(j/2)],x:side?710:690,y:450+(j-2.5)*46*(side?-1:1),a:side?Math.PI:0}));
  p.armies[side].guard={x:side?790:610,y:450};
 }
 expect(validateScenarioProject(p).errors).toEqual([]);return p;
}
async function mapTap(p:Page,s:any,x:number,y:number){const map=p.locator('#net-map');let {w,h}=await map.evaluate(el=>({w:el.clientWidth,h:el.clientHeight}));let k=Math.min(w/s.scenario.width,h/s.scenario.height);await map.tap({position:{x:(w-s.scenario.width*k)/2+x*k,y:(h-s.scenario.height*k)/2+y*k}})}
async function seal(p:Page){await expect(p.locator('#net-ready')).toBeEnabled({timeout:30000});p.once('dialog',d=>d.accept());await p.locator('#net-ready').click()}
async function register(ctx:BrowserContext,name:string){let p=await ctx.newPage();await p.goto('/');let response=await p.evaluate(async nickname=>{let r=await fetch('/pocket-id/register',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({nickname,avatar:'moss'})});let j=await r.json();return {status:r.status,id:j.user?.id,recoveryCode:j.recoveryCode}},name);expect(response.status).toBe(201);expect(response.id).toBeTruthy();await p.close();return response}
for(const [format,counts,historical] of [['2vAI',[2,0],false],['2v1',[2,1],true],['2v2',[2,2],true],['3vAI',[3,0],false]] as const){
 test('Allied '+format+' independent mobile clients finish and recover',async({browser},info)=>{
  test.setTimeout(150000);
  const origin=info.project.use.baseURL!,{defaultBrowserType,...device}=devices[info.project.name.includes('webkit')?'iPhone 13':'Pixel 7'];
  const count=counts[0]+counts[1],contexts:BrowserContext[]=[],pages:Page[]=[],ids:string[]=[],errors:string[]=[];
  try{
   const tag=Date.now().toString(36).slice(-7)+info.project.name.slice(-2);
   for(let i=0;i<count;i++){let c=await browser.newContext({...device,baseURL:origin,ignoreHTTPSErrors:true});contexts.push(c);const account=await register(c,'Ally'+i+tag);ids.push(account.id);let p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));pages.push(p)}
   expect(new Set(ids).size).toBe(count);
   const host=pages[0];await host.goto('/apps/banners-of-war/');await host.locator('#network').click();await expect(host.locator('#net-status')).toContainText('Pocket ID');
   await host.locator('#net-format').selectOption(format);await host.locator('#net-file').setInputFiles({name:'allied.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture(historical)))});
   await expect(host.locator('#net-scenario')).toHaveValue('file');await host.locator('#net-time').selectOption(format==='2vAI'?'30':'0');
   await host.locator('#net-historical').selectOption(historical?'1':'0');await host.locator('#net-create').click();const room=await code(host);
   for(let i=1;i<count;i++){await pages[i].goto('/apps/banners-of-war/?battle='+room);await expect(pages[i].locator('#net-accept')).toBeVisible({timeout:20000})}
   for(let side=0;side<2;side++){
    let first=side?counts[0]:0;if(!counts[side])continue;let cap=pages[first],v=await view(cap,room);
    const team=v.allied.members.filter((m:any)=>!m.self),groups=v.nodes.filter((n:any)=>n.level===1);
    if(!team.length)continue;
    await expect(cap.locator('#net-allied-seat')).toBeAttached({timeout:20000});
    for(let j=0;j<team.length;j++){
     const details=cap.locator('#net-allied-seat').locator('xpath=ancestor::details');
     if(!await cap.locator('#net-allied-seat').isVisible())await details.locator('summary').click();
     await cap.locator('#net-allied-seat').selectOption(String(team[j].seat));await cap.locator('#net-allied-groups').selectOption(groups[j].id);
     await cap.locator('#net-allied-assign').click();
     await expect(cap.locator('#net-status')).toContainText('Сервер принял действие');
     await expect.poll(async()=>((await view(cap,room)).allied.members.find((m:any)=>m.seat===team[j].seat).groups),{timeout:10000}).toEqual([groups[j].id]);
    }
   }
   await host.screenshot({path:info.outputPath(format+'-lobby.png')});
   for(const p of pages)await expect(p.locator('#net-accept')).toBeEnabled({timeout:20000});
   await Promise.all(pages.map(p=>p.locator('#net-accept').click()));
   await waitPhase(host,room,'planning');
   const own=await view(host,room),sub=await view(pages[1],room);
   expect(own.allied.scope.filter((id:number)=>sub.allied.scope.includes(id))).toEqual([]);
   const forbidden=historical?{commands:[{group:sub.nodes.find((n:any)=>n.permitted&&n.level===1).id,task:'hold',anchor:{x:690,y:450}}]}:{[sub.allied.scope[0]]:{kind:'hold',path:[]}};
   expect((await action(host,room,'draft',{round:1,orders:forbidden})).status).toBe(400);
   if(format==='2v2'){
    // An unrelated client cannot read state or replays.
    const outsider=await browser.newContext({...device,baseURL:origin,ignoreHTTPSErrors:true});contexts.push(outsider);
    const o=await outsider.newPage();await o.goto('/');expect((await request(o,room+'/view')).status).toBe(401);
    // Handoff before any accepted draft; old captain loses allocation authority.
    expect((await action(host,room,'handoff',{seat:sub.allied.seat})).status).toBe(200);
    expect((await view(pages[1],room)).allied.role).toBe('captain');
    expect((await action(host,room,'delegate',{seat:sub.allied.seat,on:true})).status).toBe(400);
    // Keep a disconnected former captain's authority while delegating explicitly.
    expect((await action(pages[1],room,'delegate',{seat:own.allied.seat,on:true})).status).toBe(200);
    await host.goto('/apps/banners-of-war/?battle='+room);await expect(host.locator('#net-ready')).toBeVisible({timeout:20000});
   }
   for(let i=0;i<count;i++){
    const p=pages[i],s=await view(p,room);
    if(s.allied.members.find((m:any)=>m.self).ai)continue;
    await expect(p.locator('#net-ready')).toBeEnabled({timeout:20000});
    if(historical){const n=s.nodes.find((n:any)=>n.permitted&&n.level===1)||s.nodes.find((n:any)=>n.permitted&&n.level>0);expect(n).toBeTruthy();await expect(p.locator('#net-group option[value="'+n.id+'"]').first()).toBeAttached({timeout:20000});await p.locator('#net-group').selectOption(n.id)}
    else await p.locator('#net-all').click();
    await p.locator('#net-kind').selectOption('advance');await p.locator('#net-fit').click();
    await mapTap(p,s,s.side?550:850,s.scenario.height/2);
    await p.locator('#net-save').click();
    await expect.poll(async()=>Object.keys((await view(p,room)).draft).length,{timeout:10000}).toBeGreaterThan(0);
   }
   if(format==='2vAI'){
    await contexts[1].setOffline(true);await seal(host); // subordinate's saved draft is retained at server deadline
    await waitPhase(host,room,'replay');
    await contexts[1].setOffline(false);await pages[1].goto('/apps/banners-of-war/?battle='+room);
   }else await Promise.all(pages.filter((_,i)=>!(format==='2v2'&&i===0)).map(seal));
   await waitPhase(host,room,'replay');
   for(let i=0;i<count;i++){
    const r=await request(pages[i],room+'/round?n=1');expect(r.status).toBe(200);expect(Object.keys(r.data).sort()).toEqual(['frames','number']);
   }
   await host.screenshot({path:info.outputPath(format+'-replay.png')});
   for(let i=0;i<count;i++){const p=pages[i],v=await view(p,room);if(v.allied.members.find((m:any)=>m.self).ai)continue;await expect(p.locator('#net-replay-done')).toBeVisible({timeout:20000})}
   await Promise.all(pages.filter((_,i)=>!(format==='2v2'&&i===0)).map(p=>p.locator('#net-replay-done').click()));
   await waitPhase(host,room,'planning');
   if(format==='2v2')expect((await action(pages[1],room,'delegate',{seat:own.allied.seat,on:false})).status).toBe(200);
   for(let i=0;i<count;i++){await expect(pages[i].locator('#net-ready')).toBeEnabled({timeout:20000});}
   await Promise.all(pages.map(seal));
   const result=await waitPhase(host,room,'finished');expect(result.resultReason).toMatch(/time-limit|combat-readiness/);
   const archive=await request(host,room+'/round?n='+result.completed);expect(archive.status).toBe(200);expect(archive.data.alliedOrders).toHaveLength(count);
   expect(archive.data.after.units.some((u:any)=>u.combatSeconds>0)).toBe(true);
   await expect(host.locator('#net-round-select')).toBeVisible({timeout:20000});await host.locator('#net-round-select').selectOption('1');await expect(host.locator('#net-export')).toBeVisible({timeout:20000});
   await host.screenshot({path:info.outputPath(format+'-finished.png')});
   if(format==='2v2'){
    await host.locator('#net-rematch').click();let next=await code(host);expect(next).not.toBe(room);expect((await view(host,next)).allied.format).toBe(format);
   }
   expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()))}
 });
}
