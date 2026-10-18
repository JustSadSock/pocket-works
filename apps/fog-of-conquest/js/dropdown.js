(function(){
  function initDropdown(select){
    const wrapper=document.createElement('div');
    wrapper.className='dropdown';
    wrapper.tabIndex=0;
    wrapper.setAttribute('role','combobox');
    wrapper.setAttribute('aria-haspopup','listbox');
    wrapper.setAttribute('aria-expanded','false');

    const toggle=document.createElement('div');
    toggle.className='dropdown-toggle';
    toggle.textContent=select.options[select.selectedIndex].textContent;
    wrapper.appendChild(toggle);

    const menu=document.createElement('ul');
    menu.className='dropdown-menu';
    menu.setAttribute('role','listbox');
    menu.tabIndex=-1;
    Array.from(select.options).forEach(opt=>{
      const li=document.createElement('li');
      li.setAttribute('role','option');
      li.dataset.value=opt.value;
      li.textContent=opt.textContent;
      if(opt.value===select.value) li.classList.add('selected');
      menu.appendChild(li);
    });
    menu.hidden=true;
    wrapper.appendChild(menu);

    function update(){
      const opt=select.options[select.selectedIndex];
      toggle.textContent=opt.textContent;
      menu.querySelectorAll('li').forEach(li=>{
        li.classList.toggle('selected', li.dataset.value===opt.value);
      });
    }
    function focusItem(li){
      menu.querySelectorAll('.focused').forEach(el=>el.classList.remove('focused'));
      if(li){ li.classList.add('focused'); li.scrollIntoView({block:'nearest'}); }
    }
    function open(){
      if(wrapper.classList.contains('open')) return;
      wrapper.classList.add('open');
      menu.hidden=false;
      wrapper.setAttribute('aria-expanded','true');
      const sel=menu.querySelector('.selected');
      if(sel) focusItem(sel);
    }
    function close(){
      if(!wrapper.classList.contains('open')) return;
      wrapper.classList.remove('open');
      menu.hidden=true;
      wrapper.setAttribute('aria-expanded','false');
      menu.querySelectorAll('.focused').forEach(el=>el.classList.remove('focused'));
    }
    function choose(li){
      select.value=li.dataset.value;
      select.dispatchEvent(new Event('input',{bubbles:true}));
      select.dispatchEvent(new Event('change',{bubbles:true}));
      update();
      close();
      wrapper.focus();
    }

    toggle.addEventListener('click', ()=>{
      if(wrapper.classList.contains('open')) close(); else open();
    });

    menu.addEventListener('click', e=>{
      if(e.target.tagName==='LI') choose(e.target);
    });

    wrapper.addEventListener('keydown', e=>{
      const items=[...menu.children];
      const focused=menu.querySelector('.focused')||menu.querySelector('.selected');
      let index=items.indexOf(focused);
      if(e.key==='ArrowDown'){
        e.preventDefault();
        if(!wrapper.classList.contains('open')){ open(); }
        else{
          index=(index+1)%items.length;
          focusItem(items[index]);
        }
      }else if(e.key==='ArrowUp'){
        if(wrapper.classList.contains('open')){
          e.preventDefault();
          index=(index>0?index:items.length)-1;
          focusItem(items[index]);
        }
      }else if(e.key==='Enter' || e.key===' '){
        e.preventDefault();
        if(!wrapper.classList.contains('open')){ open(); }
        else if(index>=0){ choose(items[index]); }
      }else if(e.key==='Escape'){
        if(wrapper.classList.contains('open')){ e.preventDefault(); close(); }
      }
    });

    wrapper.addEventListener('blur', e=>{
      if(!wrapper.contains(e.relatedTarget)) close();
    }, true);

    select.addEventListener('change', update);
    select.style.display='none';
    select.parentNode.insertBefore(wrapper, select.nextSibling);
  }

  window.initDropdowns=function(){
    document.querySelectorAll('select').forEach(initDropdown);
  };

  document.addEventListener('DOMContentLoaded', ()=>{
    if(window.initDropdowns) window.initDropdowns();
  });
})();
