"use strict";
(() => {
  const byId = id => document.getElementById(id);
  const brl = v => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v));
  let role = "empresario";
  const make=(tag,content,cls)=>{
    const el=document.createElement(tag);
    if(content!==undefined)el.textContent=content;
    if(cls)el.className=cls;
    return el;
  };
  async function json(url){
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok)throw new Error("Falha ao carregar dados fiscais.");
    return response.json();
  }
  function metric(label,value,detail,filter){
    const card=make(filter?"button":"div",undefined,"dash-card");
    card.append(make("span",label),make("strong",String(value)),make("small",detail));
    if(filter){
      card.onclick=()=>{
        byId("status").value=filter==="any"?"":filter;
        byId("status").dispatchEvent(new Event("change"));
        byId("rows").scrollIntoView({behavior:"smooth",block:"start"});
      };
    }
    return card;
  }
  function drawBusiness(data){
    const hasCompany=Boolean(data.cliente);
    const total=data.notas;
    const cards=[
      metric("Notas importadas",total,"Documentos vinculados ao cliente",hasCompany?"any":null),
      metric("Soma dos serviços",data.valor_servicos_com_valor?brl(data.valor_servicos_informado):"Não informado",data.valor_servicos_com_valor+"/"+total+" documentos com valor"),
      metric("Somas de IBS coincidentes",data.coincidentes_aritmeticos,"Não representa aprovação tributária",hasCompany?"Valores coincidentes":null),
      metric("Divergências aritméticas",data.divergencias,"Diferença na soma do IBS",hasCompany?"Divergência":null),
      metric("Dados insuficientes",data.dados_insuficientes,"Ausência pode ser permitida pela competência",hasCompany?"Dados insuficientes":null),
      metric("Revisões não concluídas",data.revisoes_pendentes,"Inclui documentos ainda sem revisão"),
      metric("CBS declarada",data.cbs_declarada===null?"Não informada":brl(data.cbs_declarada),data.cbs_documentos_com_valor+"/"+total+" documentos com CBS"),
      metric("IBS declarado",data.ibs_declarado===null?"Não informado":brl(data.ibs_declarado),data.ibs_documentos_com_valor+"/"+total+" documentos com IBS"),
    ];
    byId("dashboardCards").replaceChildren(...cards);
    const list=byId("dashboardMonthList");
    list.replaceChildren(make("h3","Evolução por competência"));
    if(!data.evolucao.length)list.append(make("p","Nenhuma nota para o cliente e o período selecionados."));
    else{
      const table=make("table");const head=make("tr");
      for(const label of ["Competência","Notas","Divergências","Dados insuficientes"])head.append(make("th",label));
      table.append(head);
      for(const item of data.evolucao){
        const row=make("tr");
        [item.competencia,item.notas,item.divergencias,item.dados_insuficientes].forEach(x=>row.append(make("td",String(x))));
        table.append(row);
      }
      list.append(table);
    }
    byId("dashboardContext").textContent=hasCompany?"Dados obtidos do banco local. Conformidade fiscal integral: não verificada.":"Selecione um cliente cadastrado para visualizar as notas do empresário.";
  }
  function drawAccountant(data){
    const clients=data.clientes||[];
    const totals={notas:0,divergencias:0,dados_insuficientes:0,revisoes_pendentes:0};
    clients.forEach(c=>Object.keys(totals).forEach(k=>totals[k]+=c[k]||0));
    byId("dashboardCards").replaceChildren(
      metric("Clientes cadastrados",clients.length,"Clientes ativos nesta instalação"),
      metric("Notas vinculadas",totals.notas,"Total dos clientes cadastrados"),
      metric("Divergências aritméticas",totals.divergencias,"Requerem análise técnica"),
      metric("Dados insuficientes",totals.dados_insuficientes,"Avaliar aplicabilidade do campo"),
      metric("Revisões não concluídas",totals.revisoes_pendentes,"Fila de acompanhamento")
    );
    byId("dashboardMonthList").replaceChildren();
    const box=byId("accountantClients");box.hidden=false;
    box.replaceChildren(make("h3","Carteira de clientes"));
    if(!clients.length){box.append(make("p","Cadastre um cliente para começar."));return;}
    const table=make("table"),head=make("tr");
    ["Cliente","Notas","Divergências","Pendências","Ação"].forEach(v=>head.append(make("th",v)));
    table.append(head);
    for(const c of clients){
      const tr=make("tr");
      [c.nome,c.notas,c.divergencias,c.dados_insuficientes].forEach(v=>tr.append(make("td",String(v))));
      const cell=make("td"),button=make("button","Abrir notas");
      button.onclick=()=>{
        byId("clientSelect").value=c.id;
        byId("clientSelect").dispatchEvent(new Event("change"));
        byId("clientes").scrollIntoView({behavior:"smooth",block:"start"});
      };
      cell.append(button);tr.append(cell);table.append(tr);
    }
    box.append(table);
    byId("dashboardContext").textContent="Visão gerencial da instalação local. Acesso por profissional ainda não implementado.";
  }
  async function refreshDashboard(){
    const month=byId("dashboardMonth").value;
    const client=byId("clientSelect").value;
    const params=new URLSearchParams();
    if(month)params.set("competencia",month);
    if(role==="contador")params.set("perfil","contador");
    else params.set("cliente",client);
    byId("dashboardContext").textContent="Atualizando indicadores...";
    byId("dashboardRefresh").disabled=true;
    try{
      const data=await json("/api/dashboard?"+params);
      byId("accountantClients").hidden=role!=="contador";
      if(role==="contador")drawAccountant(data);
      else drawBusiness(data);
    }catch(error){
      byId("dashboardContext").textContent="Não foi possível atualizar o dashboard: "+error.message;
      byId("dashboardCards").replaceChildren();
      byId("dashboardMonthList").replaceChildren();
      byId("accountantClients").replaceChildren();
    }finally{byId("dashboardRefresh").disabled=false;}
  }
  function switchRole(value){
    role=value;
    byId("roleBusiness").classList.toggle("active",role==="empresario");
    byId("roleAccountant").classList.toggle("active",role==="contador");
    byId("roleBusiness").setAttribute("aria-pressed",role==="empresario");
    byId("roleAccountant").setAttribute("aria-pressed",role==="contador");
    byId("dashboardTitle").textContent=role==="empresario"?"Dashboard do Empresário":"Dashboard do Contador";
    byId("dashboardDescription").textContent=role==="empresario"?"Acompanhamento de notas e valores declarados por empresa.":"Carteira de clientes e pendências fiscais da instalação local.";
    refreshDashboard();
  }
  byId("roleBusiness").onclick=()=>switchRole("empresario");
  byId("roleAccountant").onclick=()=>switchRole("contador");
  byId("dashboardMonth").onchange=refreshDashboard;
  byId("dashboardRefresh").onclick=refreshDashboard;
  byId("clientSelect").addEventListener("change",()=>{if(role==="empresario")refreshDashboard();});
  const originalRefresh=window.fetch;
  // Após importações e revisões, atualiza os indicadores quando a lista recarrega.
  const observer=new MutationObserver(()=>{if(role==="empresario")refreshDashboard();});
  observer.observe(byId("rows"),{childList:true});
  refreshDashboard();
})();
