const PREVIEW=new URLSearchParams(location.search).has('venets-preview');
const DOCS=new Set(['DESIGN.md','RESEARCH.md','TEST_PLAN.md','VISUAL_RESEARCH.md']);
const pane=document.getElementById('document'),error=document.getElementById('error'),buttons=[...document.querySelectorAll('[data-doc]')];
let current='DESIGN.md',token=0;
function inline(parent,value){
 const regex=/https?:\/\/[^\s<>]+|\*\*[^*]+\*\*|`[^`]+`/g;let match,last=0;
 while((match=regex.exec(value))){
  if(match.index>last)parent.append(document.createTextNode(value.slice(last,match.index)));
  const t=match[0];
  if(t.startsWith('http')){const a=document.createElement('a');a.href=t.replace(/[.,;]$/,'');a.target='_blank';a.rel='noopener noreferrer';a.textContent=a.href;parent.append(a)}
  else{const el=document.createElement(t.startsWith('**')?'strong':'code');el.textContent=t.slice(t.startsWith('**')?2:1,t.startsWith('**')?-2:-1);parent.append(el)}
  last=regex.lastIndex;
 }
 if(last<value.length)parent.append(document.createTextNode(value.slice(last)));
}
function render(markdown){
 const fragment=document.createDocumentFragment();let list=null,listType=null,paragraph=[];
 const flush=()=>{if(paragraph.length){const p=document.createElement('p');inline(p,paragraph.join(' '));fragment.append(p);paragraph=[]}};
 for(const raw of markdown.split(/\r?\n/)){
  const line=raw.trim();
  if(!line){flush();list=null;listType=null;continue}
  const heading=/^(#{1,3})\s+(.+)$/.exec(line);
  const item=/^(?:([-*])|(\d+)\.)\s+(.+)$/.exec(line);
  if(heading){flush();list=null;listType=null;const h=document.createElement('h'+heading[1].length);inline(h,heading[2]);fragment.append(h);continue}
  if(item){flush();const wanted=item[2]?'ol':'ul';if(listType!==wanted){list=document.createElement(wanted);fragment.append(list);listType=wanted}const li=document.createElement('li');inline(li,item[3]);list.append(li);continue}
  list=null;listType=null;paragraph.push(line);
 }
 flush();pane.replaceChildren(fragment);
}
async function openDoc(name){
 if(!DOCS.has(name))return;
 current=name;const ticket=++token;
 buttons.forEach(b=>{const active=b.dataset.doc===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 pane.replaceChildren(document.createTextNode('Загрузка…'));error.hidden=true;
 try{const response=await fetch('./dossier.json',{cache:'no-cache'});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();const text=data[name];if(typeof text!=='string'||!text)throw Error('Document missing');if(ticket!==token)return;render(text);if(!PREVIEW)try{localStorage.setItem('pocket-works:venets:doc',name)}catch{}}
 catch(e){if(ticket!==token)return;pane.replaceChildren();error.hidden=false;console.warn('Research dossier unavailable',e)}
}
buttons.forEach(b=>b.addEventListener('click',()=>openDoc(b.dataset.doc)));
document.getElementById('retry').addEventListener('click',()=>openDoc(current));
let saved='DESIGN.md';if(!PREVIEW)try{saved=localStorage.getItem('pocket-works:venets:doc')||saved}catch{}
openDoc(DOCS.has(saved)?saved:'DESIGN.md');
