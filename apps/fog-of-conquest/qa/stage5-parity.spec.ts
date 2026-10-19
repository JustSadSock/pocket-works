import {test,expect} from '@playwright/test';

test('all map sizes use identical client turn economy and attrition kernel',async({page})=>{
 for(const [size,rows,cols] of [['tiny',5,8],['small',10,15],['medium',20,30],['large',20,60]] as const){
  await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
  await page.locator('#newGameBtn').click();
  await page.evaluate(size=>{
    const select=document.getElementById('mapSizeSelect') as HTMLSelectElement;
    select.value=size;select.dispatchEvent(new Event('change',{bubbles:true}));
  },size);
  await page.locator('#twoBtn').click();
  const before=await page.evaluate(()=>{
    const state=JSON.parse(JSON.stringify(window.state));
    const units=JSON.parse(JSON.stringify(window.units));
    const buildings=JSON.parse(JSON.stringify(window.buildings));
    const rem=window.FogRuleKernel.reach(window.map,units,buildings,
      units.find((u:any)=>u.owner===1),window.TERR_COST);
    const previous=window.FogRuleKernel.advanceTurn(state,units,buildings,
      window.UNIT_TYPES,window.BUILD_TYPES);
    window.nextTurn();
    return {
      previous,size:[window.ROWS,window.COLS],
      expected:{turn:state.turn,currentPlayer:state.currentPlayer,gold:state.gold,
        units:units.map((u:any)=>({id:u.id,hp:u.hp,mp:u.mp,startR:u.startR,startC:u.startC}))},
      actual:{turn:window.state.turn,currentPlayer:window.state.currentPlayer,gold:window.state.gold,
        units:window.units.map((u:any)=>({id:u.id,hp:u.hp,mp:u.mp,startR:u.startR,startC:u.startC}))},
      remAtStart:rem[1][2],layout:document.body.scrollWidth
    };
  });
  expect(before.size).toEqual([rows,cols]);
  expect(before.previous).toBe(1);
  expect(before.actual).toEqual(before.expected);
  expect(before.remAtStart).toBeGreaterThanOrEqual(0);
  expect(before.layout).toBeLessThanOrEqual((await page.evaluate(()=>window.innerWidth))+3);
 }
});

test('battle kernel is present in the offline cache and available before UI initialization',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
 expect(await page.evaluate(()=>Object.keys(window.FogRuleKernel))).toEqual([
  'reach','unitDamage','buildingDamage','advanceTurn','evaluateVictory',
   'canHeal','canSpawn','capture','lineOfSight','fogForSide'
 ]);
 await page.locator('#newGameBtn').click();
 await page.locator('#twoBtn').click();
 const attack=await page.evaluate(()=>{
  const user=window.units.find((u:any)=>u.owner===1&&u.type==='swordsman');
  const enemy={...user,id:999,owner:2,r:user.r,c:user.c+1};
  return window.FogRuleKernel.unitDamage(user,enemy,window.map,[],
    window.UNIT_TYPES,window.BUILD_TYPES,window.TERR_DEF);
 });
 expect(attack.damage).toBeGreaterThanOrEqual(1);
 expect(errors).toEqual([]);
});
