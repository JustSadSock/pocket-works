import {test,expect} from '@playwright/test';

test('semantic zoom from war map opens the phase battlefield and returns with preserved time',async({page},info)=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/apps/palimpsest-atlas/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-story="war"]').click();
  await page.locator('#list-toggle').click();
  await page.locator('.outline-item').filter({hasText:'Победа при Брейтенфельде'}).click();
  await expect(page.locator('#date-value')).toHaveText('1631');
  await expect(page.locator('#scene-portal')).toBeVisible();
  await page.locator('#scene-portal').click();
  await expect(page.locator('#story-title')).toHaveText('Брейтенфельд · 1631');
  await expect(page.locator('#date-value')).toHaveText('1');
  await expect(page.locator('#timeline-caption')).toHaveText('ПОСЛЕДОВАТЕЛЬНОСТЬ ФАЗ');
  await expect(page.locator('#detail-back')).toBeVisible();
  await page.locator('#next').click();
  await expect(page.locator('#date-value')).toHaveText('2');
  await page.locator('#compare-toggle').click();
  await page.locator('#next').click();
  await expect(page.locator('#date-value')).toHaveText('3');
  await expect(page.locator('#compare-details')).toContainText('переместилось');
  await page.screenshot({path:info.outputPath('battle-phase-3.png')});
  await page.locator('#detail-back').click();
  await expect(page.locator('#story-title')).toHaveText('Тридцатилетняя война');
  await expect(page.locator('#date-value')).toHaveText('1631');
  await expect(page.locator('#scene-portal')).toBeVisible();
  expect(errors).toEqual([]);
});

test('draft keyframes are placed on map, reversed, saved and replayed',async({page},info)=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/apps/palimpsest-atlas/',{waitUntil:'domcontentloaded'});
  await page.locator('#studio-new').click();
  await page.locator('#studio-title').fill('Странствие торгового каравана');
  await page.locator('#studio-title').press('Tab');
  await page.locator('[data-studio-tab="entities"]').click();
  await page.locator('#studio-add').click();
  await page.locator('.motion-actions button').first().click();
  await expect(page.locator('.motion-keyframe')).toHaveCount(1);
  await page.locator('#studio-cursor').evaluate((input:HTMLInputElement)=>{
    input.value='1260';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.locator('.motion-actions button').first().click();
  await expect(page.locator('.motion-keyframe')).toHaveCount(2);
  const mapBox=await page.locator('#studio-map').boundingBox();
  if(!mapBox)throw new Error('Canvas редактора недоступен');
  await page.locator('#studio-map').click({position:{x:mapBox.width*.35,y:mapBox.height*.45}});
  await page.locator('.editor-form [aria-label="Как показывать переход"]').selectOption('illustrative');
  await page.screenshot({path:info.outputPath('story-keyframe-editor.png')});
  await page.locator('#studio-save').click();
  await expect(page.locator('#studio-dirty')).toHaveText('СОХРАНЕНО');
  const positions=await page.evaluate(()=>{
    const data=JSON.parse(localStorage.getItem('pocket-works:palimpsest-atlas:stories:v1')||'{}');
    return data.stories[0].entities[0].motion;
  });
  expect(positions.frames).toHaveLength(2);
  expect(positions.frames[0].time).toBe(1200);
  expect(positions.frames[1].time).toBe(1260);
  expect(positions.mode).toBe('illustrative');
  expect(positions.frames[0].x).not.toBe(positions.frames[1].x);
  await page.locator('#studio-preview').click();
  await page.locator('#compare-toggle').click();
  const bounds=await page.locator('#time-surface').boundingBox();
  if(!bounds)throw Error('Time control unavailable');
  await page.mouse.click(bounds.x+bounds.width*.64,bounds.y+bounds.height*.45);
  await expect(page.locator('#compare-details')).toContainText('переместилось: 1');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#story-title')).toHaveText('Странствие торгового каравана');
  await page.locator('#edit-story').click();
  await expect(page.locator('.motion-keyframe')).toHaveCount(0); // event tab
  await page.locator('[data-studio-tab="entities"]').click();
  await expect(page.locator('.motion-keyframe')).toHaveCount(2);
  expect(errors).toEqual([]);
});
