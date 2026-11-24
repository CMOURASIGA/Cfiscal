"use strict";
/* Fluxos de apoio para empresário e contador.
 * Sem autenticação ou apuração oficial. Nenhum documento é enviado a servidor. */
(() => {
  const $=id=>document.getElementById(id);
  if(!$("auditTable"))return;
  const brl=x=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(x));
  const percent=x=>new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2}).format(Number(x))+"%";
  const create=(tag,text,cls)=>{
    const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;
  };
  const rows=(headers,records)=>{
    const table=create("table"),head=create("tr");
    for(const h of headers)head.append(create("th",h));
    table.append(head);
    for(const values of records){const tr=create("tr");for(const val of values){
      const td=create("td");if(val instanceof Node)td.append(val);else td.textContent=String(val);tr.append(td);
    }table.append(tr);}
    return table;
  };
  async function api(path){
    const r=await fetch("/api/"+path,{cache:"no-store"});
    if(!r.ok)throw Error("Falha ao consultar os dados do CFiscal.");
    return r.json();
  }
  const selected=()=>$("clientSelect")?.value||"";
  const currentClientName=()=>{
    const select=$("clientSelect");
    return select?.selectedOptions?.[0]?.textContent||"Cliente não selecionado";
  };
  const problem=n=>{
    const d=n.diagnostico||{};
    if(n.status==="Divergência")return {label:"Divergência",risk:3,detail:n.reason||"Totalização inconsistente"};
    if(d.nivel==="revisao"||d.nivel==="atencao")return {label:"Revisão",risk:2,detail:d.titulo||"Diagnóstico requer revisão"};
    if(d.titulo?.startsWith("Ausência"))return {label:"Contextualizada",risk:1,detail:"Ausência IBS/CBS contextualizada em 2026"};
    return {label:"Não homologada",risk:1,detail:"Conferência aritmética não determina conformidade integral"};
  };
  async function audit(){
    const host=$("auditTable"),sum=$("auditSummary");host.replaceChildren();sum.replaceChildren();
    if(!selected()){host.textContent="Selecione uma empresa no cabeçalho para analisar as NFS-e.";return;}
    try{
      const notes=await api("notas?cliente="+encodeURIComponent(selected()));
      const groups={divergencias:0,revisoes:0,contextualizadas:0};
      const data=notes.map(n=>{
        const status=problem(n);if(status.risk===3)groups.divergencias++;
        else if(status.risk===2)groups.revisoes++;else groups.contextualizadas++;
        const action=create("button","Ver nota");action.onclick=()=>{
          if(typeof window.CFiscalNavigate==="function")window.CFiscalNavigate("notas");
          const table=$("rows"),button=Array.from(table?.querySelectorAll("tr")||[]).find(tr=>tr.textContent.includes("Nº "+n.number))?.querySelector("button");
          if(button)button.click();
        };
        return ["Nº "+n.number,n.date||"Não informada",status.label,status.detail,action];
      });
      for(const [label,value] of [["Documentos",notes.length],["Divergências",groups.divergencias],["Revisão pendente",groups.revisoes],["Informativos",groups.contextualizadas]]){
        const card=create("div",undefined,"fiscal-stat");card.append(create("small",label),create("strong",value));sum.append(card);
      }
      host.append(rows(["Nota","Competência","Status contextual","Interpretação","Ação"],data));
      if(!data.length)host.append(create("p","Nenhuma NFS-e foi importada para a empresa selecionada."));
    }catch(e){host.textContent=e.message;}
  }
  async function accountant(){
    const host=$("accountingTable"),sum=$("accountingSummary");host.replaceChildren();sum.replaceChildren();
    try{
      const data=await api("dashboard?perfil=contador");
      const companies=data.clientes||[];
      const totals=companies.reduce((r,c)=>({docs:r.docs+(c.notas||0),reviews:r.reviews+(c.revisoes_pendentes||0),div:r.div+(c.divergencias||0)}),{docs:0,reviews:0,div:0});
      for(const [label,value] of [["Empresas",companies.length],["Notas vinculadas",totals.docs],["Revisões pendentes",totals.reviews],["Divergências",totals.div]]){
        const card=create("div",undefined,"fiscal-stat");card.append(create("small",label),create("strong",value));sum.append(card);
      }
      host.append(rows(["Empresa","Notas","Revisões","Divergências","Abrir"],companies.map(c=>{
        const action=create("button","Ver documentos");action.onclick=()=>{
          $("clientSelect").value=c.id;
          $("clientSelect").dispatchEvent(new Event("change"));
          window.CFiscalNavigate?.("notas");
        };
        return [c.nome,c.notas,c.revisoes_pendentes,c.divergencias,action];
      })));
      if(!companies.length)host.append(create("p","Cadastre empresas para iniciar a carteira do contador."));
    }catch(e){host.textContent=e.message;}
  }
  let latestImpact=null,reportMode="empresario",latestReport=null;
  async function profile(){
    if(!selected())return null;
    const payload=await api("simulacoes/perfil?cliente="+encodeURIComponent(selected()));
    return payload.dados||null;
  }
  function scenario(p){
    if(!p)return null;
    const projection=p.receita_prevista_2027;
    if(projection===null||projection===undefined||projection==="")return null;
    const month=Number(projection)/12;
    if(!Number.isFinite(month)||month<0)return null;
    return window.CFiscalTaxEngine?.compare({
      rbt12:p.receita_12m,monthlyRevenue:month,competence:p.competencia_referencia||"2027-01",
      factorRApplicable:p.atividade_fator_r==="sim"?true:p.atividade_fator_r==="nao"?false:null,
      payroll12:p.folha_12m
    });
  }
  function scenarioBlock(p,container){
    const results=scenario(p);
    if(!results){container.append(create("p","Complete RBT12 e projeção anual na Simulação Tributária para gerar memória de cálculo."));return;}
    for(const key of ["III","V"]){
      const r=results[key],box=create("section",undefined,"fiscal-result");
      box.append(create("h3","Anexo "+key+" | cálculo condicionado"));
      if(r.status!=="hypothetical"){
        box.append(create("p","Não calculável: "+(r.message||r.missing?.join(", ")||"dados insuficientes")+"."));container.append(box);continue;
      }
      box.append(create("strong",brl(r.monthlyEstimate)+"/mês"),
        create("p","Faixa "+r.band+" | alíquota nominal "+percent(r.nominalPct)+" | parcela a deduzir "+brl(r.deduction)),
        create("p","Alíquota efetiva "+percent(r.effectivePct)+" | RBT12 "+brl(r.rbt12)),
        create("p","Memória: ((RBT12 × "+percent(r.nominalPct)+") − "+brl(r.deduction)+") ÷ RBT12 × receita mensal "+brl(r.monthlyRevenue)),
        create("p","Fator R informado: "+(r.factorR===null?"não calculado":percent(r.factorR))+". Atividade e folha precisam ser validadas."),
        create("small","Exemplo, não constitui DAS apurado. Regra "+r.rule+"."));
      const anchor=create("a","Tabela oficial, Anexo "+key);anchor.href=r.source;anchor.target="_blank";anchor.rel="noopener noreferrer";box.append(anchor);
      container.append(box);
    }
  }
  async function impact(event){
    if(event)event.preventDefault();
    const host=$("impactResults");host.replaceChildren();
    const p=await profile();const s=scenario(p);
    const costs=$("impactForm").elements.cost.value,margin=$("impactForm").elements.margin.value;
    if(!s||s.III.status!=="hypothetical"||s.V.status!=="hypothetical"){
      host.append(create("p","Preencha a receita projetada e o RBT12 na Simulação Tributária."));return;
    }
    if(costs===""||margin===""){host.append(create("p","Informe custos mensais e margem desejada para calcular preços-alvo."));return;}
    const cost=Number(costs),target=Number(margin)/100;
    if(!Number.isFinite(cost)||cost<0||!Number.isFinite(target)||target<0||target>=.95){host.append(create("p","Informe custos válidos e margem entre 0% e 94,9%."));return;}
    latestImpact={custos:cost,margem:target*100,cenarios:{}};
    for(const key of ["III","V"]){
      const r=s[key],rate=r.effectivePct/100,denom=1-target-rate;
      if(denom<=0){host.append(create("p","Margem + alíquota excedem 100% no Anexo "+key+"."));continue;}
      const price=Math.round(cost/denom*100)/100;
      const card=create("div",undefined,"fiscal-stat");card.append(create("small","Preço-alvo ilustrativo | Anexo "+key),create("strong",brl(price)),create("small","Receita atual simulada "+brl(r.monthlyRevenue)+" | Imposto "+brl(r.monthlyEstimate)));
      host.append(card);latestImpact.cenarios[key]={preco:price,imposto:r.monthlyEstimate};
    }
    host.append(create("p","Esses preços não incluem tributos fora do DAS, elasticidade de demanda ou regras de crédito. É uma análise de sensibilidade, não proposta comercial automática."));
  }
  const DEADLINES=[
    {date:"2026-10-15",name:"Solicitação de ingresso no Simples Nacional para 2027",url:"https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/setembro/simples-nacional-2027-entenda-os-novos-prazos-e-faca-sua-escolha-com-consciencia-e-tranquilidade"},
    {date:"2026-10-30",name:"Opção pelo regime regular IBS/CBS para o 1º semestre/2027",url:"https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/setembro/simples-nacional-2027-entenda-os-novos-prazos-e-faca-sua-escolha-com-consciencia-e-tranquilidade"},
    {date:"2026-12-20",name:"Prazo anunciado para cancelamento das opções de 2027",url:"https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/setembro/simples-nacional-2027-entenda-os-novos-prazos-e-faca-sua-escolha-com-consciencia-e-tranquilidade"},
    {date:"2027-03-31",name:"Entrega da DEFIS do ano-calendário 2026",url:"https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/novembro/comite-gestor-do-simples-nacional-publica-novas-regras-para-o-simples-nacional-e-para-a-transicao-da-reforma-tributaria"}
  ];
  const KEY="cfiscal:agenda:v1";
  function loadTasks(){try{const x=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(x)?x:[]}catch(_){return [];}}
  function saveTasks(tasks){localStorage.setItem(KEY,JSON.stringify(tasks));}
  function agenda(){
    const host=$("fiscalDeadlines");
    host.replaceChildren(rows(["Prazo","Evento","Referência"],DEADLINES.map(t=>{
      const link=create("a","Fonte oficial");link.href=t.url;link.target="_blank";link.rel="noopener noreferrer";
      return [new Date(t.date+"T12:00:00").toLocaleDateString("pt-BR"),t.name,link];
    })));
    const tasksHost=$("agendaTasks");tasksHost.replaceChildren();
    const tasks=loadTasks().filter(t=>t.client===selected());
    if(!selected()){tasksHost.textContent="Selecione uma empresa para visualizar suas tarefas.";return;}
    if(!tasks.length){tasksHost.textContent="Sem tarefas locais para esta empresa.";return;}
    for(const task of tasks.sort((a,b)=>a.due.localeCompare(b.due))){
      const item=create("div",undefined,"fiscal-task"),check=create("input"),label=create("span",task.title+" | "+task.due),remove=create("button","Excluir");
      check.type="checkbox";check.checked=Boolean(task.done);check.setAttribute("aria-label","Concluída: "+task.title);
      check.onchange=()=>{const list=loadTasks();const found=list.find(t=>t.id===task.id);if(found){found.done=check.checked;saveTasks(list);}agenda();};
      remove.onclick=()=>{if(!confirm("Excluir a tarefa?"))return;saveTasks(loadTasks().filter(t=>t.id!==task.id));agenda();};
      item.append(check,label,remove);tasksHost.append(item);
    }
  }
  async function report(mode=reportMode){
    reportMode=mode;const host=$("fiscalReport");host.replaceChildren();
    if(!selected()){host.textContent="Selecione uma empresa para gerar relatório.";return;}
    try{
      const [notes,p]=await Promise.all([api("notas?cliente="+encodeURIComponent(selected())),profile()]);
      const s=scenario(p),risk=notes.map(problem);
      const data={
        tipo:mode,empresa:currentClientName(),gerado_em:new Date().toISOString(),
        documentos:notes.length,divergencias:risk.filter(r=>r.risk===3).length,
        revisoes:risk.filter(r=>r.risk===2).length,
        rbt12_informado:p?.receita_12m??null,projecao_anual_informada:p?.receita_prevista_2027??null,
        calculo_condicionado:s?.III?.status==="hypothetical"&&s?.V?.status==="hypothetical"?{
          III:s.III,V:s.V
        }:null,impacto:latestImpact,
        conformidade:"Não verificada",origem:"Dados locais e hipóteses do CFiscal. Não é documento fiscal oficial."
      };
      latestReport=data;
      host.append(create("h2","Relatório "+(mode==="contador"?"técnico para o contador":"executivo para o empresário")),
        create("p",data.empresa),
        create("p","Emitido em "+new Date().toLocaleString("pt-BR")+". Dados extraídos da instalação atual; não há consulta ao PGDAS-D."),
        create("p","NFS-e importadas: "+notes.length+" | divergências: "+data.divergencias+" | outras revisões: "+data.revisoes),
        create("p","RBT12 informado: "+(p?.receita_12m?brl(p.receita_12m):"não informado")+
          " | projeção anual: "+(p?.receita_prevista_2027?brl(p.receita_prevista_2027):"não informada")));
      scenarioBlock(p,host);
      if(mode==="contador"){
        host.append(create("h3","Rastreabilidade dos documentos"));
        host.append(rows(["Nota","Competência","Conferência","Diagnóstico"],notes.map(n=>[
          n.number,n.date,n.status,n.diagnostico?.titulo||"Revisão necessária"
        ])));
      }else{
        host.append(create("p","Para tomada de decisão: confirmar atividade, RBT12 e folha elegível. Os valores dos anexos são cenários de referência, não economia comprovada."));
      }
      host.append(create("p","Documento não substitui apuração oficial ou parecer profissional. Validações XSD, assinatura, autorização e IBS/CBS regular não realizadas.","fiscal-disclaimer"));
    }catch(e){host.textContent=e.message;}
  }
  function downloadReport(){
    if(!latestReport){$("fiscalReport").textContent="Gere um relatório primeiro.";return;}
    const json=JSON.stringify(latestReport,null,2);
    const uri=URL.createObjectURL(new Blob([json],{type:"application/json"}));
    const a=create("a");a.href=uri;a.download="CFiscal-relatorio-"+reportMode+".json";a.click();
    setTimeout(()=>URL.revokeObjectURL(uri),1000);
  }
  async function loadView(){
    const view=location.hash.slice(1);
    if(view==="auditoria")await audit();
    else if(view==="contador")await accountant();
    else if(view==="agenda")agenda();
    else if(view==="relatorios")await report();
    else if(view==="impacto")await impact();
  }
  $("auditRefresh").onclick=audit;$("accountingRefresh").onclick=accountant;
  $("impactForm").onsubmit=impact;
  $("agendaForm").onsubmit=e=>{
    e.preventDefault();if(!selected()){alert("Selecione um cliente antes de cadastrar tarefas.");return;}
    const form=e.target,title=form.elements.title.value.trim(),due=form.elements.due.value;
    if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(due))return;
    const tasks=loadTasks();tasks.push({id:crypto.randomUUID(),client:selected(),title,due,done:false});
    try{saveTasks(tasks);form.reset();agenda();}catch(e){alert("Não foi possível salvar a tarefa: "+e.message);}
  };
  $("reportBusiness").onclick=()=>report("empresario");
  $("reportAccountant").onclick=()=>report("contador");
  $("reportPrint").onclick=()=>{if(location.hash!=="#relatorios")window.CFiscalNavigate?.("relatorios");window.print();};
  $("reportJson").onclick=downloadReport;
  window.addEventListener("hashchange",()=>loadView().catch(console.error));
  $("clientSelect").addEventListener("change",()=>loadView().catch(console.error));
  if(["auditoria","contador","agenda","relatorios","impacto"].includes(location.hash.slice(1)))
    setTimeout(()=>loadView().catch(console.error),100);
})();
