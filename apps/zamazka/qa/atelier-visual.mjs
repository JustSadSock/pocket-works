#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {chromium} from '@playwright/test';
import {cabinetMarkup,settingsMarkup} from '../atelier-collection.js';
import {zamazkaAchievements} from '../../../shared/capabilities/zamazka-achievements.js';
import {BRUSH_CURSOR_NAMES} from '../brush-cursor.js';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const dir=process.env.ZAMAZKA_QA_ARTIFACT_DIR||join(tmpdir(),'zamazka-atelier-qa');
await mkdir(dir,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.json':'application/json'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const pathname=decodeURIComponent(url.pathname);
 const path=resolve(root,'.'+pathname,pathname.endsWith('/')?'index.html':'');
 if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
 try{res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(await readFile(path))}
 catch{res.writeHead(404);res.end('Not found')}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url='http://127.0.0.1:'+server.address().port+'/apps/zamazka/';
const browser=await chromium.launch({headless:true});
const layouts=[
 ['windowed-1366x640',1366,640],['wide-1920x1080',1920,1080],
 ['tablet-1024x768',1024,768],['browser-390x680',390,680],
 ['pwa-390x844',390,844],['small-320x568',320,568],
 ['landscape-844x390',844,390]
];
const owned=[zamazkaAchievements[0].id,zamazkaAchievements[2].id,zamazkaAchievements[5].id];
const opts={name:'Реставратор',member:false,sound:true,volume:65,confirmVote:true,appearance:'new',brushStyle:0,brushNames:BRUSH_CURSOR_NAMES};
let count=0;
try{
 for(const [name,w,h] of layouts){
  const context=await browser.newContext({viewport:{width:w,height:h},isMobile:w<900&&h>w,hasTouch:w<900});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*.js',route=>route.abort());
  await page.goto(url,{waitUntil:'load'});
  const stages=[
   ['guest',cabinetMarkup(zamazkaAchievements,[],{status:'guest',guest:true})],
   ['owned',cabinetMarkup(zamazkaAchievements,owned,{status:'ready',selectedId:zamazkaAchievements[5].id})],
   ['network-error',cabinetMarkup(zamazkaAchievements,[],{status:'error',error:'Нет соединения с наградами.'})]
  ];
  for(const [scene,html] of stages){
   await page.evaluate(markup=>{
    const screen=document.querySelector('#screen');screen.innerHTML=markup;
    const dialog=document.querySelector('#dialog');dialog.classList.add('hidden');
   },html);
   await page.waitForTimeout(390);
   const metrics=await page.evaluate(()=>{
    const root=document.querySelector('#screen'),view=root.querySelector('.cabinet-scene'),
      comp=view.querySelector('.cabinet-composition'),tray=view.querySelector('.cabinet-tray'),detail=view.querySelector('.cabinet-detail');
    const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}};
    const r=box(root),d=box(detail),t=box(tray);
    return {scroll:root.scrollHeight-root.clientHeight,scene:view.scrollHeight-view.clientHeight,
     detail:d,tray:t,close:box(view.querySelector('[data-action="achievements-back"]')),
     tiles:view.querySelectorAll('[data-achievement-select]').length,selected:view.querySelectorAll('.cabinet-medal.is-selected').length,
     buttons:[...view.querySelectorAll('button')].filter(b=>{const s=getComputedStyle(b);return s.visibility!=='hidden'&&s.display!=='none'}).map(box),root:r};
   });
   assert(metrics.scroll<=7&&metrics.scene<=7,name+' '+scene+' document scroll '+JSON.stringify(metrics));
   assert(metrics.detail.w>=100&&metrics.detail.h>=70,name+' '+scene+' tiny detail '+JSON.stringify(metrics));
   assert.equal(metrics.tiles,7);assert.equal(metrics.selected,1);
   const b=metrics.close;assert(b.bottom<=metrics.root.bottom+2&&b.right<=metrics.root.right+2,name+' '+scene+' Back clipped');
   await page.screenshot({path:join(dir,name+'-cabinet-'+scene+'.png'),fullPage:false});
   console.log(name+' cabinet '+scene+' '+Math.round(metrics.detail.w)+'x'+Math.round(metrics.detail.h));
   count++;
  }
  for(const tab of ['brushes','preferences']){
   const markup=settingsMarkup({...opts,brushStyle:tab==='brushes'?4:0});
   await page.evaluate(({markup,tab})=>{
    document.querySelector('#screen').innerHTML='<div style="width:100%;height:100%;background:radial-gradient(ellipse at 50% 20%,#524331,#26211d 80%);"></div>';
    const dialog=document.querySelector('#dialog');
    dialog.classList.remove('hidden');dialog.innerHTML='<div class="dialog-box atelier-settings-dialog"><h2>Мастерская</h2>'+
      markup+'<div class="stack" id="modalActions"><button class="btn primary">Сохранить</button><button class="btn ghost">Отмена</button></div></div>';
    dialog.querySelectorAll('[data-settings-panel]').forEach(p=>{const show=p.dataset.settingsPanel===tab;p.hidden=!show;p.classList.toggle('is-active',show)});
    dialog.querySelectorAll('[data-settings-tab]').forEach(p=>{const show=p.dataset.settingsTab===tab;p.classList.toggle('is-active',show);p.setAttribute('aria-selected',String(show))});
    if(tab==='brushes'){
     const canvas=dialog.querySelector('#settingStrokeCanvas'),ctx=canvas.getContext('2d');
     ctx.strokeStyle='#82554b';ctx.lineWidth=19;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(80,160);ctx.bezierCurveTo(130,30,330,260,510,100);ctx.stroke();
     dialog.querySelector('[data-brush-choice="4"]').classList.add('is-selected');
    }
   },{markup,tab});
   await page.waitForTimeout(120);
   const metrics=await page.evaluate(()=>{
    const dialog=document.querySelector('#dialog'),box=dialog.querySelector('.dialog-box'),root=document.querySelector('#screen');
    const r=box.getBoundingClientRect(),saved=dialog.querySelector('#modalActions .primary').getBoundingClientRect();
    const s=getComputedStyle(box),panel=dialog.querySelector('.atelier-settings-panel.is-active'),p=panel.getBoundingClientRect();
    return {dialogScroll:box.scrollHeight-box.clientHeight,height:r.height,panelH:p.height,
     saveVisible:saved.bottom<=innerHeight&&saved.top>=0,
     modalVisible:r.top>=-2&&r.bottom<=innerHeight+2,overflow:s.overflowY,
     sample:dialog.querySelector('#settingStrokeCanvas')?.getBoundingClientRect().height,
     prefs:dialog.querySelectorAll('#settingName,#settingSound,#settingNewAppearance,#settingConfirmVote').length};
   });
   assert(metrics.modalVisible&&metrics.saveVisible,name+' settings '+tab+' save clipped '+JSON.stringify(metrics));
   assert(metrics.dialogScroll<=6,name+' settings '+tab+' modal scroll '+JSON.stringify(metrics));
   if(tab==='brushes')assert(metrics.sample>=55,name+' brush test too small '+JSON.stringify(metrics));
   else assert.equal(metrics.prefs,4);
   await page.screenshot({path:join(dir,name+'-settings-'+tab+'.png'),fullPage:false});
   console.log(name+' settings '+tab+' '+metrics.height);
   count++;
  }
  assert.deepEqual(errors,[]);
  await context.close();
 }
}finally{await browser.close();await new Promise(ok=>server.close(ok))}
console.log('ZAMAZKA atelier: '+count+' actual CSS Playwright screenshots and primary controls checked');
