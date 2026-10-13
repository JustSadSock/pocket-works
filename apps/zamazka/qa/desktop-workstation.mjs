#!/usr/bin/env node
/* Desktop exhibition regression: npx tsx is not required.
   Run: node apps/zamazka/qa/desktop-workstation.mjs
   Uses the real app styles and representative DOM from app.js, with
   offline image placeholders so the test does not need Wikimedia or PocketNet. */
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';

const url=pathToFileURL(resolve(fileURLToPath(new URL('../index.html',import.meta.url)))).href;
const browser=await chromium.launch({headless:true});
const frames=Array.from({length:5},(_,i)=>
  '<button class="picture"><span class="picture-image"><img alt="Полотно"></span>'+
  '<span class="picture-index">ОБЪЕКТ 0'+(i+1)+'</span>'+
  '<span class="caption">Средневековая картина '+(i+1)+'</span>'+
  '<span class="style">Художник · 1560</span></button>').join('');
const lobby='<section class="page exhibition-lobby">'+
 '<div class="section-label">ЧАСТНАЯ ЭКСПОЗИЦИЯ / ЗАЛ ОЖИДАНИЯ</div><h2>Ждём гостей.</h2>'+
 '<button class="lobby-self"><span class="personal-seal"></span><span><strong>Куратор</strong></span></button>'+
 '<div class="room-ticket"><div class="ticket-top">КОД КОМНАТЫ</div><div class="room-code">514A8E5E</div>'+
 '<div class="ticket-actions"><button class="btn primary">Скопировать код</button><button class="btn ghost">Отправить ссылку</button></div></div>'+
 '<div class="lobby-list-heading"><span>ИГРОКИ · 2/8</span></div>'+
 '<div class="players"><div class="player">Куратор</div><div class="player">Игрок</div></div>'+
 '<section class="commons-desk"><div class="commons-topline"><div><span class="section-label">ОБЩАЯ МАСТЕРСКАЯ</span><h3>Порисуем вместе?</h3><p>Рисуйте одновременно</p></div></div>'+
 '<div class="commons-frame"><canvas width="960" height="600"></canvas></div>'+
 '<div class="commons-controls"><div class="commons-palette"><button class="commons-swatch"></button></div>'+
 '<label class="commons-width">Толщина <input type="range"></label><button class="commons-wipe">Очистить</button></div></section>'+
 '<div class="stack"><label class="field">Раундов</label><select class="input"><option>3</option></select>'+
 '<label class="field">Время</label><select class="input"><option>2:40</option></select>'+
 '<button class="btn primary">Начать выставку</button></div></section>';
const preview='<section class="phase-page mobile-preview"><div class="phase-head"><h2>Запомни оригиналы</h2></div>'+
 '<div class="phase-body"><p class="phase-directive">Запомни детали пяти картин.</p>'+
 '<div class="gallery exhibition-grid">'+frames+'</div><button class="btn primary">Перейти к реставрации</button></div></section>';
const editor='<section class="restore"><div class="rest-head"><div class="phase-head"><h2>Детские игры</h2></div></div>'+
 '<div class="work-area"><div class="work-stage"><div class="viewport" style="--art-aspect:1.333333">'+
 '<canvas width="600" height="450"></canvas></div></div></div>'+
 '<div class="work-tools"><div class="tools">'+Array.from({length:6},()=>'<button class="tool"><span>Кисть</span></button>').join('')+'</div>'+
 '<div class="colors">'+Array.from({length:6},()=>'<button class="swatch"></button>').join('')+'<input class="color-input" type="color"></div>'+
 '<div class="adjust"><label>Толщина</label><input type="range"></div>'+
 '<div class="zoom-actions"><button class="tool">+</button></div>'+
 '<div class="work-foot"><button class="btn primary">Сдать работу</button></div></div></section>';
const entry='<section class="page lobby-entry"><div class="entry-heading"><h2>Создать комнату</h2></div>'+
 '<div class="entry-identity">Твой знак</div><label class="field">Твой ник</label>'+
 '<input class="input"><div class="subtle-rule"></div><div class="stack">'+
 '<button class="btn primary">Создать комнату</button><button class="btn ghost">В главное меню</button></div></section>';
const geometry=async(page,selector)=>page.locator(selector).first().evaluate(el=>{
 const r=el.getBoundingClientRect();
 return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
});
const screenshots=process.env.ZAMAZKA_QA_ARTIFACT_DIR||await mkdtemp(join(tmpdir(),'zamazka-desktop-'));
try {
 for (const {width,height} of [{width:1755,height:864},{width:1366,height:768},{width:390,height:844}]) {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
   isMobile:width<700,hasTouch:width<700});
  const page=await context.newPage();
  await page.goto(url,{waitUntil:'load'});
  const ready=await page.evaluate(()=>[...document.styleSheets].some(s=>s.href?.includes('adaptive-layout.css')));
  assert(ready,'Desktop CSS is not wired into the production entrypoint');
  const inject=markup=>page.evaluate(html=>{document.querySelector('#screen').innerHTML=html},markup);
  const noOverflow=async name=>{
   const overflow=await page.locator('#screen').evaluate(el=>el.scrollWidth-el.clientWidth);
   assert(overflow<=2,name+' horizontal overflow at '+width+': '+overflow);
  };
  await inject(lobby);
  await noOverflow('Lobby');
  const board=await geometry(page,'.commons-desk');
  const canvas=await geometry(page,'.commons-frame canvas');
  assert(Math.abs(canvas.width/canvas.height-1.6)<.03,'Shared canvas distorted at '+width);
  if(width>=1450){
   const ticket=await geometry(page,'.room-ticket');
   const config=await geometry(page,'.exhibition-lobby>.stack');
   assert(ticket.right+5<=board.left,'Room code must sit left of drawing');
   assert(board.right+5<=config.left,'Settings must sit right of drawing');
   assert(canvas.width>=520,'Shared canvas should dominate the center');
   assert(board.top<height*.45,'Shared drawing should appear above the fold');
  }
  await page.screenshot({path:join(screenshots,'lobby-'+width+'.png')});
  await inject(preview);
  await noOverflow('Preview');
  if(width>=1450){
   const first=await geometry(page,'.gallery .picture:first-child');
   const last=await geometry(page,'.gallery .picture:last-child');
   assert(first.width>=225,'Desktop preview still has small cards');
   assert(Math.abs(first.top-last.top)<6,'Five originals should share a row');
  }
  await page.screenshot({path:join(screenshots,'preview-'+width+'.png')});
  await inject(editor);
  await noOverflow('Editor');
  if(width>=1450){
   const tools=await geometry(page,'.restore>.work-tools');
   const painting=await geometry(page,'.restore .viewport');
   assert(tools.width>=290,'Desktop editor tools are too narrow');
   assert(painting.width>=500,'Desktop painting is too small');
   assert(Math.abs(painting.width/painting.height-4/3)<.04,'Editor aspect ratio changed');
  }
  await inject(entry);
  await noOverflow('Room creation');
  if(width>=1450){
   const panel=await geometry(page,'.lobby-entry');
   assert(panel.width>=540&&panel.width<=720,'Entry desk not centered-sized');
   assert(panel.top>40&&panel.bottom<height-40,'Entry desk should fit height');
  }
  await context.close();
  console.log('ZAMAZKA desktop layout OK: '+width+' × '+height);
 }
 console.log('Visual QA screenshots: '+screenshots);
}finally{await browser.close()}
