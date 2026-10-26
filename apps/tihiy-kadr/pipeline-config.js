// Only genuinely supported browser inference routes. No remote APIs or GPU executors.
// SCNet window step controls how often its 11-second window is computed:
// 0.25 ~4 overlapping passes; 0.5 ~2; 1 ~1.
export const ROUTES=Object.freeze([
 {id:'mrx',label:'MRX',short:'MRX',steps:[{model:'mrx',input:'original'}],detail:'Быстрый исходный ориентир'},
 {id:'scnet-direct',label:'SCNet · оригинал',short:'SCNet',steps:[{model:'scnet',input:'original',step:1}],detail:'Ищет голоса сразу в исходном звуке; может удалять музыку'},
 {id:'mrx-scnet-fast',label:'MRX → SCNet · быстро',short:'Экспресс',steps:[{model:'mrx',input:'original'},{model:'scnet',input:'previous',step:1}],detail:'Один проход SCNet на окно; самая быстрая проверка второго этапа'},
 {id:'mrx-scnet-balanced',label:'MRX → SCNet · баланс',short:'Баланс',steps:[{model:'mrx',input:'original'},{model:'scnet',input:'previous',step:.5}],detail:'Два перекрывающихся окна вместо четырёх'},
 {id:'mrx-scnet',label:'MRX → SCNet · тщательно',short:'Максимум',steps:[{model:'mrx',input:'original'},{model:'scnet',input:'previous',step:.25}],detail:'Прежний качественный вариант: примерно четыре пересечения окон'},
 {id:'umxhq-direct',label:'Open-Unmix · оригинал',short:'UMX-HQ',steps:[{model:'umxhq',input:'original'}],detail:'Отдельная быстрая архитектура Open-Unmix, ищет вокал в оригинале'},
 {id:'mrx-umxhq',label:'MRX → Open-Unmix',short:'MRX + UMX',steps:[{model:'mrx',input:'original'},{model:'umxhq',input:'previous'}],detail:'MRX очищает фон, затем отдельная модель Open-Unmix ищет оставшийся голос'}
]);
export const routeById=id=>ROUTES.find(x=>x.id===id)||null;
export const validScnetStep=v=>[.25,.5,1].includes(v);
export const makeRunKey=(model,inputKey,step=null)=>{
 if(!['mrx','scnet','umxhq'].includes(model)||typeof inputKey!=='string'||!inputKey||model==='scnet'&&!validScnetStep(step))
  throw Error('Неизвестный шаг модели.');
 return model+'|'+inputKey+(model==='scnet'?'|'+step:'');
};
export function planRoute(id){
 const route=routeById(id);
 if(!route)throw Error('Неизвестный маршрут обработки.');
 return route.steps.map(x=>({...x}));
}
export function planCustom(model,input,step=1){
 if(!['mrx','scnet','umxhq'].includes(model)||typeof input!=='string'||!input)return null;
 if(model==='scnet'&&!validScnetStep(step))return null;
 return {model,input,step:model==='scnet'?step:null};
}
export function calculateSpeed(duration,ms){
 if(!(duration>0)||!(ms>=0)||!Number.isFinite(ms))return null;
 return {rtf:ms/1000/duration,at90Seconds:90*ms/1000/duration};
}
