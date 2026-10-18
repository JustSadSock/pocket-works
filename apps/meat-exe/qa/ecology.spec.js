import {test,expect} from '@playwright/test';

// Use an actual saved run with a navigable sightline. No live engine mutation.
test('a spitter warns before shooting and its telegraph survives gameplay',async ({page})=>{
 test.setTimeout(80000);
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto('/apps/meat-exe/');
 const fixture=await page.evaluate(async()=>{
   const {setSeed,generateOrgan,getTissueNodes}=await import('/apps/meat-exe/organGen.js');
   for(let seed=413;seed<470;seed++){
     setSeed(seed);
     const cells=generateOrgan(0,0),open=new Set(cells.map(c=>c.x+','+c.y));
     const gates=new Set(getTissueNodes(0,0).map(t=>t.x+','+t.z));
     for(const player of cells.filter(p=>p.x>=2&&p.x<=5&&p.y>=2&&p.y<=5)){
       if(gates.has(player.x+','+player.y))continue;
       for(const enemy of cells){
         const dx=enemy.x-player.x,dz=enemy.y-player.y;
         const dist=Math.hypot(dx,dz);
         if(dist<4.1||dist>6.9||!(dx===0||dz===0)||gates.has(enemy.x+','+enemy.y))continue;
         const walk=Math.max(Math.abs(dx),Math.abs(dz));let clear=true;
         for(let j=0;j<=walk;j++){
           const x=player.x+Math.sign(dx)*j,z=player.y+Math.sign(dz)*j;
           if(!open.has(x+','+z)||gates.has(x+','+z)){clear=false;break;}
         }
         if(clear)return {v:4,seed,x:player.x,z:player.y,
           yaw:Math.atan2(player.x-enemy.x,player.y-enemy.y),pitch:0,
           hp:100,maxHp:100,wave:1,toSpawn:1,spawnClock:30,
           enemies:[{type:'spitter',x:enemy.x,z:enemy.y,hp:49}],pickups:[],ruptured:[]};
       }
     }
   }
   return null;
 });
 expect(fixture).not.toBeNull();
 await page.evaluate(s=>localStorage.setItem('pocket-works:meat-exe:session',JSON.stringify(s)),fixture);
 await page.reload();await page.locator('#resumeSaved').click();
 await expect(page.locator('#hud')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__()?.ecology.telegraphsSeen),{timeout:24000}).toBeGreaterThan(0);
 const data=await page.evaluate(()=>window.__MEAT_QA__());
 expect(data.ecology.enemies[0]?.type).toBe('spitter');
 expect(data.ecology.telegraphsSeen).toBeGreaterThan(0);
 expect(errors).toEqual([]);
 await page.locator('#pauseBtn').click();
 await page.locator('#menuPause').click();
 await page.reload();await page.locator('#resumeSaved').click();
 const resumed=await page.evaluate(()=>window.__MEAT_QA__());
 expect(resumed.mode).toBe('playing');expect(resumed.ecology.enemies[0]?.type).toBe('spitter');
});
