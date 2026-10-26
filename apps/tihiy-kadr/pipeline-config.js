// Only verified independent local ONNX vocal-removal models.
export const ROUTES=Object.freeze([
 {id:'umxhq-direct',label:'Open-Unmix UMX-HQ',short:'Быстро',steps:[{model:'umxhq',input:'original'}],detail:'Быстро: на тестовом ПК около 5 с для 90 секунд'},
 {id:'scnet-direct',label:'SCNet',short:'Качественно',steps:[{model:'scnet',input:'original',step:1}],detail:'Тщательно: на тестовом ПК около 150 с для 90 секунд'}
]);
export const routeById=id=>ROUTES.find(x=>x.id===id)||null;
export function planRoute(id){
 const route=routeById(id);
 if(!route)throw Error('Неизвестный маршрут.');
 return route.steps.map(step=>({...step}));
}
export function makeRunKey(model,inputKey='original',step=1){
 if(!['umxhq','scnet'].includes(model)||inputKey!=='original'||(model==='scnet'&&step!==1))throw Error('Неизвестная модель или цепочка.');
 return model+'|original';
}
export function calculateSpeed(duration,ms){
 if(!(duration>0)||!(ms>=0)||!Number.isFinite(ms))return null;
 return {rtf:ms/1000/duration,at90Seconds:90*ms/1000/duration};
}
