"use strict";
(() => {
  const $=id=>document.getElementById(id);
  if(!$("helpSearch"))return;
  const STORAGE_KEY="cfiscal:help:progress:v1";
  const steps=[...document.querySelectorAll("[data-check]")];
  const topics=[...document.querySelectorAll(".help-topic")];
  const roles=[...document.querySelectorAll("[data-role]")];
  const normalize=str=>String(str||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  function readProgress(){
    try{
      const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
      return Array.isArray(data)?data.filter(v=>/^[1-8]$/.test(String(v))).map(String):[];
    }catch(_){return [];}
  }
  function updateProgress(){
    const done=steps.filter(input=>input.checked).length;
    $("helpProgress").textContent=done+" de "+steps.length+" etapas marcadas. "+(done===steps.length?"Roteiro de uso concluído. Confira os resultados antes da homologação fiscal.":"Continue na próxima etapa não marcada.");
    for(const input of steps)input.closest(".help-step")?.classList.toggle("done",input.checked);
  }
  const completed=new Set(readProgress());
  for(const input of steps){
    input.checked=completed.has(input.dataset.check);
    input.addEventListener("change",()=>{
      const selected=steps.filter(x=>x.checked).map(x=>x.dataset.check);
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(selected));}catch(_){}
      updateProgress();
    });
  }
  updateProgress();
  $("helpProgressReset").addEventListener("click",()=>{
    if(!confirm("Reiniciar as marcações do roteiro de aprendizagem neste navegador? Seus dados fiscais não serão alterados."))return;
    for(const input of steps)input.checked=false;
    try{localStorage.removeItem(STORAGE_KEY);}catch(_){}
    updateProgress();
  });
  function search(){
    const term=normalize($("helpSearch").value.trim());
    let count=0;
    for(const topic of topics){
      const haystack=normalize(topic.textContent+" "+(topic.dataset.search||""));
      const matches=!term||haystack.includes(term);
      topic.hidden=!matches;
      if(matches)count++;
    }
    $("helpNoResults").hidden=count>0;
    if(term){
      for(const details of document.querySelectorAll(".help-faq")){
        if(normalize(details.textContent).includes(term))details.open=true;
      }
    }
  }
  $("helpSearch").addEventListener("input",search);
  $("helpReset").addEventListener("click",()=>{
    $("helpSearch").value="";search();$("helpSearch").focus();
  });
  const DEFAULT_ROLE="empresario";
  function setRole(role){
    if(!["empresario","contador"].includes(role))role=DEFAULT_ROLE;
    for(const button of roles){
      button.classList.toggle("active",button.dataset.role===role);
      button.setAttribute("aria-pressed",String(button.dataset.role===role));
    }
    const route=$("roteiro");
    if(route){
      const intro=route.querySelector(".help-section-head p");
      if(intro)intro.textContent=role==="contador"?
        "Siga o roteiro com foco na carteira de empresas, revisão de notas e relatórios técnicos. Marque cada etapa quando o resultado for conferido.":
        "Siga o roteiro com foco no cadastro, na compreensão dos impostos e na análise financeira. Marque cada etapa quando o resultado for conferido.";
    }
    for(const el of document.querySelectorAll("[data-step='6'] h3,[data-step='7'] h3")){
      if(el.closest("[data-step='6']"))el.textContent=role==="contador"?"Confira Auditoria e carteira de clientes":"Confira a Auditoria e o Dashboard";
      if(el.closest("[data-step='7']"))el.textContent=role==="contador"?"Emita relatórios técnicos e acompanhe prazos":"Explore impacto, agenda e relatórios";
    }
    try{localStorage.setItem("cfiscal:help:role:v1",role);}catch(_){}
  }
  let preferred=DEFAULT_ROLE;
  try{preferred=localStorage.getItem("cfiscal:help:role:v1")||DEFAULT_ROLE;}catch(_){}
  setRole(preferred);
  roles.forEach(button=>button.addEventListener("click",()=>setRole(button.dataset.role)));
  $("helpMode").textContent=["localhost","127.0.0.1","::1"].includes(location.hostname)?"Ambiente Python / SQLite":"Versão web / dados no navegador";
})();
