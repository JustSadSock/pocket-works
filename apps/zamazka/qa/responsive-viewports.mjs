#!/usr/bin/env node
/* ZAMAZKA viewport smoke test.
   Run from any cwd: node apps/zamazka/qa/responsive-viewports.mjs
   Requires npm dependencies and Playwright Chromium (npx playwright install chromium).
   Exercises real app CSS without running a match or depending on remote artwork. */
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const entry = pathToFileURL(resolve(fileURLToPath(new URL('../index.html', import.meta.url)))).href;
const browser = await chromium.launch({ headless: true });
const cases = [
  { width: 320, height: 568, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 430, height: 932, mobile: true },
  { width: 768, height: 1024, mobile: true },
  { width: 844, height: 390, mobile: false },
  { width: 1366, height: 768, mobile: false },
  { width: 1755, height: 864, mobile: false },
  { width: 2560, height: 1440, mobile: false }
];
const fixture = {
  home: `<section class="museum-home">
    <div class="museum-headline"><h1>Искусство<br><em>подделки.</em></h1></div>
    <div class="museum-display">
      <div class="museum-stage"><div class="museum-slide" data-slot="0"><div class="museum-slide-rim"><img alt="Картина"></div></div></div>
      <div class="museum-stage-caption"><strong>Подлинник</strong><span>Художник · 1887</span></div>
      <div class="museum-wheel"><button>‹</button><button>›</button></div>
      <span class="museum-exhibit-number">23 / 54</span>
    </div>
    <div class="museum-control">
      <button class="museum-persona"><span class="personal-seal"></span><span class="persona-caption"><strong>Реставратор</strong><small>Изменить знак</small></span></button>
      <button class="start-restoration"><span class="start-emblem">✳</span><span><strong>Начать реставрацию</strong><small>Пробный раунд</small></span><span class="start-arrow">↗</span></button>
      <div class="museum-lower"><button>Создать комнату</button><button>Ввести код</button></div>
      <div class="museum-footer"><button>Мой архив</button><button>Синхронизировать</button></div>
    </div>
  </section>`,
  preview: `<section class="phase-page"><div class="phase-head"><div><span class="eyebrow">Раунд 1 / 1</span><h2>Запомни оригиналы</h2></div><span class="timer">0:23</span></div>
    <div class="phase-body"><p class="phase-directive">Запомни детали пяти картин.</p>
      <div class="gallery exhibition-grid">${Array.from({ length:5 },(_,i)=>`<button class="picture"><span class="picture-image"><img alt="Картина ${i}"></span><span class="picture-index">ОБЪЕКТ 0${i+1}</span><span class="caption">Оригинал № ${i+1}</span><span class="style">Художник · 1887</span></button>`).join('')}</div>
      <button class="btn primary wide">Перейти к реставрации</button></div></section>`,
  collection: `<section class="page"><div class="section-label">Личный фонд</div><h2>Мои реставрации</h2><div class="zamazka-cloud-row"><span>На устройстве</span><button>Синхронизировать</button></div>
    <div class="gallery">${Array.from({length:8},(_,i)=>`<button class="picture"><canvas width="600" height="450"></canvas><span class="caption">Реставрация ${i+1}</span><span class="style">12.10.2026</span></button>`).join('')}</div>
    <button class="btn ghost wide">В главное меню</button></section>`,
  reveal: `<section class="phase-page reveal-phase"><div class="phase-head"><div><span class="eyebrow">Реставрация готова</span><h2>Подлинник найден</h2></div></div>
    <div class="phase-body reveal-layout"><div class="reveal-main"><h3>Твоя реставрация</h3><p class="hint">Подлинник</p>
    <div class="unveil-frame"><canvas width="600" height="450"></canvas></div>
    <label class="unveil-control">Сравнить<input type="range"></label></div>
    <div class="reveal-brief"><h3>Личная реставрация</h3><button class="btn primary">Новая реставрация</button></div></div></section>`,
  restore: `<section class="restore"><div class="rest-head"><div class="phase-head"><div><span class="eyebrow">Реставрация</span><h2>Снятие с креста</h2></div><span class="timer">2:38</span></div></div>
    <div class="work-area"><div class="work-stage"><div class="viewport"><canvas width="600" height="450"></canvas></div></div></div>
    <div class="work-tools"><div class="tools">${Array.from({length:5},(_,i)=>`<button class="tool"><span>Инструмент ${i+1}</span></button>`).join('')}</div>
    <div class="colors">${Array.from({length:6},()=>'<button class="swatch"></button>').join('')}</div>
    <div class="adjust"><label>Толщина</label><input type="range"></div><div class="zoom-actions"><button class="tool">+</button></div>
    <div class="work-foot"><div class="work-save-info">Сохранено</div><button class="btn primary">Сдать работу</button></div></div></section>`
};
const rect = async (page, selector) => page.locator(selector).first().evaluate(el => {
  const b=el.getBoundingClientRect();
  return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};
});
try {
  for (const viewport of cases) {
    const context=await browser.newContext({
      viewport:{width:viewport.width,height:viewport.height},
      deviceScaleFactor:1,isMobile:viewport.mobile,hasTouch:viewport.mobile
    });
    const page=await context.newPage();
    await page.goto(entry,{waitUntil:'load'});
    const cssLoaded=await page.evaluate(()=>[...document.styleSheets].some(s=>s.href?.includes('responsive-scale.css')));
    assert(cssLoaded,'responsive-scale.css must load from the production entrypoint');
    for(const [screenName,markup] of Object.entries(fixture)){
      await page.evaluate(html=>{document.querySelector('#screen').innerHTML=html},markup);
      const size=await page.evaluate(()=>{
        const s=document.querySelector('#screen');
        return {sw:s.scrollWidth,cw:s.clientWidth,sh:s.scrollHeight,ch:s.clientHeight};
      });
      assert(size.sw<=size.cw+2,`${viewport.width}x${viewport.height} ${screenName}: horizontal overflow ${JSON.stringify(size)}`);
      if(screenName==='home'){
        const action=await rect(page,'.start-restoration');
        // 700–1049px tablets use a real two-column museum, not the
        // full-width phone CTA. Require a substantial share of its column.
        const minAction=viewport.width>=700&&viewport.width<1050
          ?Math.min(viewport.width*.36,330):Math.min(viewport.width*.63,410);
        assert(action.width>=minAction,
          `${viewport.width}: primary action is too narrow (${action.width.toFixed(1)}px; expected ${minAction.toFixed(1)}px)`);
        assert(action.height>=44,`${viewport.width}: primary action touch target`);
        if(viewport.width>=1200&&viewport.height>=620){
          const display=await rect(page,'.museum-display');
          const heading=await rect(page,'.museum-headline');
          assert(action.width>=Math.min(viewport.width*.28,560),`${viewport.width}: desktop CTA underfilled`);
          assert(heading.right+10<display.x,`${viewport.width}: gallery/title overlap`);
          assert(display.height>=420,`${viewport.width}: too small carousel`);
        }
        if(viewport.mobile&&viewport.width<700&&viewport.height>=750){
          assert(size.sh<=size.ch+8,`${viewport.width}: mobile home must fit the screen`);
        }
      }
      if(screenName==='preview'&&viewport.width>=1200){
        const card=await rect(page,'.gallery.exhibition-grid .picture');
        assert(card.width>=185,`${viewport.width}: preview paintings are miniature`);
      }
      if(screenName==='collection'&&viewport.width>=1200){
        const card=await rect(page,'.page>.gallery .picture');
        assert(card.width>=220,`${viewport.width}: archive does not use the viewport`);
      }
      if(screenName==='reveal'&&viewport.width>=1200){
        const painting=await rect(page,'.reveal-main .unveil-frame');
        assert(painting.width>=580,`${viewport.width}: reveal picture underfilled`);
      }
      if(screenName==='restore'){
        const canvas=await page.locator('.restore .viewport canvas').evaluate(el=>{
          const b=el.getBoundingClientRect(),outer=el.parentElement.getBoundingClientRect();
          return {intrinsic:[el.width,el.height],size:[b.width,b.height],outer:[outer.width,outer.height],transform:getComputedStyle(el).transform};
        });
        assert.deepEqual(canvas.intrinsic,[600,450],`${viewport.width}: canvas intrinsic resolution changed`);
        assert(canvas.size[0]>80&&canvas.size[1]>50,`${viewport.width}: editor canvas vanished`);
        assert(canvas.transform==='none',`${viewport.width}: CSS transform corrupts pointer-to-canvas coordinates`);
      }
    }
    // The saved-art comparison has a dedicated, wider frame on desktops.
    await page.evaluate(()=>{const d=document.querySelector('#dialog');d.classList.remove('hidden');d.innerHTML='<div class="dialog-box"><h2>Реставрация из фонда</h2><div class="compare"><div><img alt="Оригинал"></div><div><canvas id="savedFull" width="600" height="450"></canvas></div></div><button class="btn">Закрыть</button></div>'});
    const modal=await rect(page,'.dialog-box');
    assert(modal.width<=viewport.width,`${viewport.width}: comparison spills off screen`);
    if(viewport.width>=1200)assert(modal.width>=700,`${viewport.width}: comparison stays miniature`);
    await context.close();
    console.log(`OK ${viewport.width}x${viewport.height}: home, preview, archive, reveal, canvas, comparison`);
  }
} finally {
  await browser.close();
}
