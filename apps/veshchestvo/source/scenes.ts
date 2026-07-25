// @ts-nocheck
import { clamp } from './core.ts';

function border(e, material='stone') { e.rectangle(1,1,e.width-2,e.height-2,1,material,false,{anchor:true}); }
function fillRect(e,x0,y0,x1,y1,material,temp=null,options={}) { e.rectangle(Math.round(x0),Math.round(y0),Math.round(x1),Math.round(y1),1,material,true,{...options,temp}); }
function ellipse(e,cx,cy,rx,ry,material,temp=null,options={}) { e.circle(cx,cy,rx,ry,1,material,true,{...options,temp}); }
function pipe(e,x0,y0,x1,y1,material='metal'){e.rectangle(x0,y0,x1,y1,1,material,false,{anchor:true});}
function scatter(e,key,count,x0,y0,x1,y1,temp=null){for(let n=0;n<count;n+=1){const x=Math.floor(x0+e.rand()*(x1-x0+1)),y=Math.floor(y0+e.rand()*(y1-y0+1));e.setCell(x,y,key,temp);}}

export const EXPERIMENTS = [
  {id:'glacier-volcano',name:'Вулкан под ледником',icon:'volcano',build(e){
    e.clear(); border(e,'stone');
    fillRect(e,2,118,e.width-3,e.height-3,'stone');
    ellipse(e,58,152,28,25,'lava',1180); ellipse(e,58,139,10,18,'lava',1100);
    e.rectangle(44,105,72,142,2,'stone',false); fillRect(e,20,68,104,108,'ice',-18);
    fillRect(e,26,61,98,70,'snow',-12); fillRect(e,6,108,114,117,'soil',12);
    e.line(58,140,58,95,3,'empty'); e.line(58,95,76,84,3,'empty');
    e.line(58,140,58,95,2,'lava',{temp:1120,source:true}); e.line(58,95,76,84,2,'lava',{temp:1060,source:true});
    ellipse(e,80,96,9,6,'steam',170); fillRect(e,70,102,91,107,'water',38);
    e.applyPressure(80,96,12,5.5);
    for(let x=8;x<112;x+=8)e.setCell(x,112,'water',4);
  }},
  {id:'glass-furnace',name:'Стекольная печь',icon:'furnace',build(e){e.clear();border(e,'concrete');fillRect(e,12,92,108,158,'ceramic');fillRect(e,18,98,102,151,'empty');fillRect(e,24,130,96,148,'sand',40);fillRect(e,26,151,94,154,'fuel',25);e.line(18,122,4,122,3,'empty');fillRect(e,7,115,17,129,'oxygen',25);scatter(e,'fire',32,28,142,90,150,900);}},
  {id:'steam-boiler',name:'Паровой котёл',icon:'boiler',build(e){e.clear();border(e,'concrete');pipe(e,24,74,96,148,'metal');fillRect(e,29,80,91,131,'water',65);fillRect(e,31,134,89,143,'fuel',35);scatter(e,'fire',24,36,139,84,146,850);pipe(e,92,86,112,94,'copper');e.rectangle(108,82,116,101,1,'metal',false,{anchor:true});}},
  {id:'undersea-volcano',name:'Подводный вулкан',icon:'wave',build(e){e.clear();border(e,'stone');fillRect(e,2,32,117,176,'water',8);fillRect(e,2,146,117,177,'sand',10);ellipse(e,62,155,30,24,'stone',70);ellipse(e,62,159,13,18,'lava',1160);e.line(62,145,62,125,3,'empty');scatter(e,'steam',60,48,102,76,140,140);}},
  {id:'oil-fire',name:'Нефтяной пожар',icon:'flame',build(e){e.clear();border(e,'concrete');fillRect(e,4,122,115,174,'water',16);ellipse(e,58,126,45,12,'oil',25);fillRect(e,20,142,100,149,'metal');scatter(e,'fire',48,42,112,80,127,760);scatter(e,'smoke',100,28,55,90,112,100);}},
  {id:'acid-lab',name:'Кислотная лаборатория',icon:'flask',build(e){e.clear();border(e,'concrete');pipe(e,8,82,50,160,'glass');fillRect(e,14,104,44,154,'acid',24);pipe(e,70,82,112,160,'glass');fillRect(e,76,104,106,154,'alkali',24);e.rectangle(48,130,72,138,1,'glass',false,{anchor:true});fillRect(e,54,132,66,136,'metal-powder');}},
  {id:'mine-collapse',name:'Обрушение шахты',icon:'mine',build(e){e.clear();border(e,'stone');fillRect(e,2,60,117,177,'stone');fillRect(e,12,91,108,160,'empty');for(let x=20;x<=100;x+=20){fillRect(e,x,93,x+3,159,'wood');fillRect(e,x-4,90,x+8,94,'wood');}fillRect(e,48,58,72,88,'sand');e.applyPressure(60,72,22,5);}},
  {id:'sand-dam',name:'Песчаная дамба',icon:'dam',build(e){e.clear();border(e,'stone');fillRect(e,2,135,117,177,'soil');fillRect(e,3,46,44,134,'water',18);for(let y=74;y<=135;y+=1){const width=Math.round((y-65)*.55);fillRect(e,52-width/2,y,52+width/2,y,'sand');}fillRect(e,88,118,116,134,'plant');}},
  {id:'forest-fire',name:'Лесной пожар',icon:'tree',build(e){e.clear();border(e,'stone');fillRect(e,2,146,117,177,'soil',20);for(let x=8;x<116;x+=9){fillRect(e,x,108,x+2,146,'wood');ellipse(e,x+1,103,6,11,'plant');}scatter(e,'fire',18,8,122,22,143,700);fillRect(e,2,32,117,46,'oxygen');}},
  {id:'electrolysis',name:'Электролиз воды',icon:'bolt',build(e){e.clear();border(e,'concrete');pipe(e,18,72,102,160,'glass');fillRect(e,24,92,96,154,'brine',22);fillRect(e,36,82,40,145,'copper');fillRect(e,80,82,84,145,'copper');e.applyCharge(38,84,3,1);e.applyCharge(82,84,3,-1);}},
  {id:'cooled-reactor',name:'Реактор с охлаждением',icon:'reactor',build(e){e.clear();border(e,'concrete');fillRect(e,22,66,98,160,'metal');fillRect(e,28,72,92,154,'water',42);ellipse(e,60,116,18,30,'explosive',125);pipe(e,6,84,28,92,'copper');pipe(e,92,134,114,142,'copper');fillRect(e,6,86,21,90,'cold-gas',-80);e.applyPressure(60,116,24,2);}},
  {id:'toxic-cloud',name:'Токсичный газ',icon:'gas',build(e){e.clear();border(e,'concrete');fillRect(e,2,132,117,177,'soil');fillRect(e,12,96,18,132,'wood');fillRect(e,34,100,40,132,'wood');fillRect(e,56,98,62,132,'wood');fillRect(e,78,96,84,132,'wood');fillRect(e,100,102,106,132,'wood');scatter(e,'plant',260,4,112,115,131);scatter(e,'toxic-gas',500,3,36,50,94);}},
  {id:'crystal-growth',name:'Выращивание кристаллов',icon:'crystal',build(e){e.clear();border(e,'stone');pipe(e,14,62,106,164,'glass');fillRect(e,20,82,100,158,'brine',74);fillRect(e,54,130,66,154,'salt');fillRect(e,18,159,102,162,'cold-gas',-40);}},
  {id:'fungal-ecosystem',name:'Грибная экосистема',icon:'fungus',build(e){e.clear();border(e,'stone');fillRect(e,2,112,117,177,'soil',20);scatter(e,'organic',210,8,90,112,150);scatter(e,'fungus',80,14,88,104,130);scatter(e,'water',250,8,130,112,170);fillRect(e,2,28,117,48,'oxygen');}},
  {id:'unstable-chain',name:'Цепная реакция',icon:'chain',build(e){e.clear();border(e,'concrete');for(let y=72;y<158;y+=12)for(let x=12;x<110;x+=12)ellipse(e,x,y,3,3,'explosive',50);e.line(8,151,20,151,2,'gunpowder');e.setCell(8,151,'fire',800);}}
];

export const TASKS = [
  {id:'stop-fire',name:'Остановить пожар',scene:'forest-fire',hint:'Изолируй фронт и снизь температуру.',check:e=>({done:e.countMaterial('fire')<3,progress:1-clamp(e.countMaterial('fire')/90,0,1)})},
  {id:'safe-engine',name:'Безопасный паровой двигатель',scene:'steam-boiler',hint:'Доведи пар до выхода, не разрушив котёл.',check:e=>({done:e.countMaterial('steam')>180&&maxPressure(e)<7,progress:clamp(e.countMaterial('steam')/180,0,1)})},
  {id:'melt-metal',name:'Расплавить металл',scene:'glass-furnace',hint:'Металл должен расплавиться, контейнер — выжить.',setup:e=>fillRect(e,48,112,72,124,'metal'),check:e=>({done:e.countMaterial('liquid-metal')>120&&e.countMaterial('ceramic')>1000,progress:clamp(e.countMaterial('liquid-metal')/120,0,1)})},
  {id:'clean-water',name:'Очистить загрязнённую воду',scene:'acid-lab',hint:'Нейтрализуй раствор и отдели осадок.',check:e=>({done:e.countMaterial('acid')<8&&e.countMaterial('alkali')<8&&e.countMaterial('neutral-solution')>120,progress:1-clamp((e.countMaterial('acid')+e.countMaterial('alkali'))/800,0,1)})},
  {id:'make-crystals',name:'Получить кристаллы',scene:'crystal-growth',hint:'Испари часть воды и охлади насыщенный раствор.',check:e=>({done:e.countMaterial('salt')>220&&e.countMaterial('brine')<2500,progress:clamp(e.countMaterial('salt')/220,0,1)})},
  {id:'power-sensor',name:'Провести электричество',scene:'electrolysis',hint:'Соедини электроды проводником.',check:e=>({done:chargedFarRight(e),progress:chargedProgress(e)})},
  {id:'sterilize',name:'Уничтожить инфекцию',scene:'fungal-ecosystem',hint:'Убей паразитическую массу, сохрани органику.',setup:e=>scatter(e,'parasite',120,44,108,74,145),check:e=>({done:e.countMaterial('parasite')<5&&e.countMaterial('organic')>40,progress:1-clamp(e.countMaterial('parasite')/120,0,1)})},
  {id:'save-plant',name:'Сохранить растение',scene:'toxic-cloud',hint:'Защити растения от газа и перепада температуры.',check:e=>({done:e.tick>750&&e.countMaterial('plant')>150,progress:clamp(e.tick/750,0,1)})},
  {id:'minimal-blast',name:'Разрушить стену',scene:'mine-collapse',hint:'Пробей проход, потратив не больше трёх зарядов.',setup:e=>{fillRect(e,54,90,66,160,'concrete');fillRect(e,10,150,20,158,'explosive');},check:e=>({done:wallGap(e)&&e.countMaterial('explosive')>10,progress:wallGapProgress(e)})},
  {id:'stabilize-reactor',name:'Стабилизировать реактор',scene:'cooled-reactor',hint:'Снизь температуру ядра и давление.',check:e=>{const s=e.regionStats(40,86,80,145);return{done:e.tick>450&&s.temperature<120&&s.pressure<2,progress:clamp((500-s.temperature)/500*.6+(5-s.pressure)/5*.4,0,1)}}},
  {id:'separate-mixture',name:'Разделить смесь',scene:'sand-dam',hint:'Раздели песок, соль и воду по областям.',setup:e=>{scatter(e,'salt',260,8,44,42,80);scatter(e,'sand',260,8,44,42,80);},check:e=>{const left=e.regionStats(2,40,50,135),right=e.regionStats(70,40,117,135);const lc=new Map(left.composition),rc=new Map(right.composition);const p=((lc.get('water')||0)+(rc.get('sand')||0)+(rc.get('salt')||0))/1800;return{done:p>.8,progress:clamp(p,0,1)}}},
  {id:'water-cycle',name:'Самоподдерживающийся цикл воды',scene:'undersea-volcano',hint:'Сделай контур испарения и конденсации.',check:e=>({done:e.tick>600&&e.countMaterial('steam')>50&&e.countMaterial('water')>2500,progress:clamp(e.tick/600*.5+e.countMaterial('steam')/100*.5,0,1)})},
  {id:'gas-filter',name:'Фильтр для газа',scene:'toxic-cloud',hint:'Пропусти поток через воду и активный уголь.',check:e=>{let toxic=0;for(let y=100;y<e.height-2;y++)for(let x=90;x<e.width-2;x++)if(e.materialAt(e.idx(x,y)).key==='toxic-gas')toxic++;return{done:e.tick>350&&toxic<12,progress:1-clamp(toxic/200,0,1)}}},
  {id:'controlled-chain',name:'Контролируемая цепная реакция',scene:'unstable-chain',hint:'Запусти цепь, но сохрани внешнюю оболочку.',check:e=>({done:e.tick>350&&e.countMaterial('explosive')<12&&e.countMaterial('concrete')>450,progress:1-clamp(e.countMaterial('explosive')/500,0,1)})},
  {id:'synthesize-material',name:'Синтезировать материал',scene:'glacier-volcano',hint:'Создай материал: твёрдый, проводящий и жаростойкий.',check:(e,ctx)=>{const ok=(ctx.customMaterials||[]).some(m=>m.state==='solid'&&m.electrical>.7&&(m.meltingPoint??0)>900&&m.strength>.7);return{done:ok,progress:ok?1:0}}}
];

function maxPressure(e){let m=0;for(const v of e.pressure)if(v>m)m=v;return m;}
function chargedFarRight(e){for(let y=70;y<160;y++)for(let x=92;x<116;x++)if(Math.abs(e.charge[e.idx(x,y)])>.55)return true;return false;}
function chargedProgress(e){let m=0;for(let y=70;y<160;y++)for(let x=60;x<116;x++)m=Math.max(m,Math.abs(e.charge[e.idx(x,y)]));return clamp(m,0,1);}
function wallGap(e){for(let y=112;y<145;y++){let gap=0;for(let x=54;x<=66;x++)if(e.mat[e.idx(x,y)]===0)gap++;if(gap>8)return true;}return false;}
function wallGapProgress(e){let empty=0,total=0;for(let y=100;y<155;y++)for(let x=54;x<=66;x++){total++;if(e.mat[e.idx(x,y)]===0)empty++;}return empty/total;}

export function loadExperiment(engine,id){const exp=EXPERIMENTS.find(x=>x.id===id)||EXPERIMENTS[0];exp.build(engine);return exp;}
export function loadTask(engine,id){const task=TASKS.find(x=>x.id===id)||TASKS[0];const exp=loadExperiment(engine,task.scene);task.setup?.(engine);return{task,experiment:exp};}
