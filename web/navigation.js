"use strict";
(() => {
  const sections=[...document.querySelectorAll(".app-view")];
  const items=[...document.querySelectorAll("[data-nav]")];
  const allowed=new Set(["painel","clientes","notas","integracoes"]);
  const sidebar=document.getElementById("sidebar");
  const toggle=document.getElementById("sidebarToggle");
  function activate(){
    const page=location.hash.slice(1);
    const view=document.body.dataset.page==="ajuda"?"ajuda":allowed.has(page)?page:"painel";
    for(const section of sections)section.hidden=section.dataset.view!==view;
    for(const item of items){
      const active=item.dataset.nav===view;
      if(active)item.setAttribute("aria-current","page");
      else item.removeAttribute("aria-current");
    }
    const labels={painel:"Dashboard",clientes:"Clientes",notas:"Notas fiscais",integracoes:"Integrações",ajuda:"Ajuda fiscal"};
    document.title="CFiscal | "+labels[view];
    document.querySelector("#appMain").dataset.currentView=view;
    if(sections.length)window.scrollTo({top:0,behavior:"instant"});
  }
  window.CFiscalNavigate=(view)=>{
    if(!allowed.has(view))return;
    if(location.hash==="#"+view)activate();
    else location.hash="#"+view;
  };
  function compact(value){
    sidebar.classList.toggle("collapsed",value);
    document.body.classList.toggle("sidebar-collapsed",value);
    toggle.setAttribute("aria-expanded",String(!value));
    toggle.setAttribute("aria-label",value?"Expandir menu lateral":"Recolher menu lateral");
    try{localStorage.setItem("cfiscal_sidebar_collapsed",value?"1":"0");}catch(_){}
  }
  let saved=false;
  try{saved=localStorage.getItem("cfiscal_sidebar_collapsed")==="1";}catch(_){}
  compact(saved);
  toggle.onclick=()=>compact(!sidebar.classList.contains("collapsed"));
  window.addEventListener("hashchange",activate);
  activate();
})();
