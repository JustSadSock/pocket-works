export const BRUSH_CURSOR_NAMES=["Соболь","Реставратор","Флейц","Белка","Щетина"];
export const BRUSH_CURSOR_KEY="pocket-works:zamazka:cursor-style";
export function getBrushCursorStyle(){
  try{const value=Number(localStorage.getItem(BRUSH_CURSOR_KEY));return Number.isInteger(value)&&value>=0&&value<BRUSH_CURSOR_NAMES.length?value:0}catch{return 0}
}
export function setBrushCursorStyle(index){
  const selected=Number(index);
  const safe=Number.isInteger(selected)&&selected>=0&&selected<BRUSH_CURSOR_NAMES.length?selected:0;
  try{localStorage.setItem(BRUSH_CURSOR_KEY,String(safe))}catch{}
  return safe;
}
export function brushCursorSVG(index=0,ink="#304a43"){
  const specs=[
    {handle:"#9e6236",metal:"silver",a:34,b:54,w:6,h:4,stem:133,sw:4.6,tip:2.6},
    {handle:"#683533",metal:"brass",a:37,b:55,w:5.3,h:3.7,stem:135,sw:3.8,tip:2.2},
    {handle:"#496177",metal:"steel",a:32,b:51,w:9.3,h:4.6,stem:131,sw:5.4,tip:3},
    {handle:"#bd9058",metal:"copper",a:43,b:60,w:6.5,h:3.7,stem:137,sw:4.1,tip:2.6},
    {handle:"#62714b",metal:"steel",a:32,b:53,w:9,h:7.2,stem:117,sw:7.5,tip:5.2}
  ];
  const hair=[
    `<path d="M0 0Q-3 10-5 21Q-7 28-6 36H6Q7 28 5 21Q3 10 0 0Z" fill="url(#zc-hair)" stroke="#453329" stroke-width=".6"/><path d="M0 3Q-4 20-3 35M-1 9Q2 20 3 35M-2 15Q0 24 0 35" fill="none" stroke="#c3a078" stroke-width=".8" opacity=".8"/>`,
    `<path d="M0 0Q-2 12-4 23L-4.5 39H4.5L4 23Q2 12 0 0Z" fill="url(#zc-hair)" stroke="#3b2e2b" stroke-width=".6"/><path d="M0 3Q-2.8 24-2.4 38M0 9Q2.3 22 2.1 38" fill="none" stroke="#b9a58b" stroke-width=".7" opacity=".7"/>`,
    `<path d="M-9 2Q-7 1-5 2L-3 1 0 2 3 1 6 2 9 1L9 34H-9Z" fill="url(#zc-hair)" stroke="#54402b" stroke-width=".7"/><path d="M-8 4v27M-5 3v30M-2 3v30M1 3v30M4 3v30M7 3v29" stroke="#ddbe91" stroke-width=".9" opacity=".75"/>`,
    `<path d="M0 0Q-2 10-6 19Q-13 29-9 40Q-7 45-6 46H6Q7 45 9 40Q13 29 6 19Q2 10 0 0Z" fill="url(#zc-hair)" stroke="#48382d" stroke-width=".6"/><path d="M0 5Q-9 23-6 42M0 8Q7 27 4 43M-2 12Q1 27 0 43" stroke="#cdb395" opacity=".66" stroke-width="1" fill="none"/>`,
    `<path d="M-12 4-9 1-5 4-2 1 2 4 5 1 9 3 12 2Q11 15 9 33H-9Q-11 15-12 4Z" fill="url(#zc-hair)" stroke="#503b28" stroke-width=".8"/><path d="M-10 5Q-10 20-7 32M-6 6V32M-2 5V31M2 5V31M6 4V32M10 4Q10 18 7 32" fill="none" stroke="#e0ba80" stroke-width="1.3" opacity=".72"/>`
  ];
  const i=Number.isInteger(Number(index))&&Number(index)>=0&&Number(index)<specs.length?Number(index):0;
  const d=specs[i],color=/^#[0-9a-f]{6}$/i.test(ink)?ink:"#304a43";
  const metal=d.metal==="brass"?["#75582d","#f5d58d","#b58d43"]:d.metal==="copper"?["#84543b","#f3c89b","#b27650"]:["#586269","#eef0e3","#99a19c"];
  const handle=`<path d="M${-d.h} ${d.b-1}Q${-d.sw} ${d.b+17} ${-d.tip} ${d.stem-4}Q${-d.tip} ${d.stem+1} 0 ${d.stem+1}Q${d.tip} ${d.stem+1} ${d.tip} ${d.stem-4}Q${d.sw} ${d.b+17} ${d.h} ${d.b-1}Z" fill="url(#zc-wood)" stroke="#473629" stroke-width=".95"/><path d="M${-d.h+1.4} ${d.b+10}Q${-d.sw+.6} ${d.b+33} ${-d.tip+.65} ${d.stem-8}" fill="none" stroke="#ffefc4" stroke-width="1.2" opacity=".48"/><path d="M${d.h-1.2} ${d.b+11}Q${d.sw-.5} ${d.b+44} ${d.tip-.4} ${d.stem-7}" fill="none" stroke="#251d17" stroke-width="1" opacity=".4"/>`;
  const ferrule=`<path d="M${-d.w} ${d.a}Q0 ${d.a-1.3} ${d.w} ${d.a}L${d.h+.7} ${d.b+2}Q0 ${d.b+3} ${-d.h-.7} ${d.b+2}Z" fill="url(#zc-metal)" stroke="#493d32" stroke-width=".8"/><path d="M${-d.w+.4} ${d.a+3}H${d.w-.4}M${-d.h-.2} ${d.b-.9}H${d.h+.2}" stroke="#3e352b" opacity=".65" stroke-width=".8"/><path d="M${-d.w+2} ${d.a+3}L${-d.h+1.2} ${d.b-1}" stroke="#fff9d8" stroke-width="1.3" opacity=".7"/><circle cx="0" cy="${d.b-5}" r="1.05" fill="#5d5242" stroke="#f8e4b7" stroke-width=".45"/>`;
  const woodgrain=i===1?`<path d="M-2 ${d.b+28}V${d.stem-12}M1 ${d.b+27}V${d.stem-15}" stroke="#eaa791" stroke-width=".7" opacity=".4"/>`:`<path d="M-2.1 ${d.b+17}Q-1 ${d.b+32}-2 ${d.b+44}M1 ${d.b+22}Q2 ${d.b+40}1 ${d.stem-9}" stroke="#edc692" stroke-width=".75" opacity=".36" fill="none"/>`;
  return `<svg viewBox="0 0 138 138" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="zc-metal" x1="0%" y1="0%" x2="100%" y2="0%"><stop stop-color="${metal[0]}"/><stop offset=".23" stop-color="${metal[1]}"/><stop offset=".52" stop-color="${metal[2]}"/><stop offset=".82" stop-color="${metal[1]}"/><stop offset="1" stop-color="${metal[0]}"/></linearGradient><linearGradient id="zc-wood" x1="0%" y1="0%" x2="100%" y2="0%"><stop stop-color="#35251c"/><stop offset=".18" stop-color="${d.handle}"/><stop offset=".48" stop-color="${d.handle}"/><stop offset=".8" stop-color="#523b29"/><stop offset="1" stop-color="#241b18"/></linearGradient><linearGradient id="zc-hair" x1="0%" y1="0%" x2="100%" y2="0%"><stop stop-color="#352b24"/><stop offset=".45" stop-color="${i===4?"#b28b5b":"#77614c"}"/><stop offset="1" stop-color="#352b23"/></linearGradient></defs><g transform="translate(16 16) rotate(-45)"><g class="fibers">${hair[i]}<path d="M-1.5 1Q0 0 1.5 1L2.4 8Q0 6-2.4 8Z" fill="${color}" opacity=".95"/></g><g class="shaft">${handle}${woodgrain}${ferrule}</g></g></svg>`;
}
