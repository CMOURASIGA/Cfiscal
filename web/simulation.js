"use strict";
(() => {
  const $=id=>document.getElementById(id);
  const form=$("simulationForm"), info=$("simulationInfo"), cards=$("simulationScenarios");
  const fields=["competencia_referencia","atividade_fator_r","regime_confirmado","receita_12m","receita_prevista_2027","folha_12m","despesas_12m","estrutura_equipe","prolabore_mensal"];
  const defaults={competencia_referencia:"2027-01",atividade_fator_r:"nao_confirmado",regime_confirmado:"nao_confirmado",estrutura_equipe:"nao_informado"};
  const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v);
  const number=v=>v===""||v===null||v===undefined?null:Number(v);
  const scenarios=[
    ["Simples Nacional","Exige confirmação do anexo da atividade, RBT12 e dados do PGDAS-D."],
    ["Simples com IBS/CBS no regime regular","Exige confirmar a opção válida e o período, parâmetros e créditos legalmente admissíveis."],
    ["Lucro Presumido","Exige confirmar elegibilidade e calcular IRPJ, CSLL e demais tributos conforme o período."],
    ["Lucro Real","Exige apurar resultado contábil e fiscal, ajustes, despesas e créditos admissíveis."]
  ];
  let loadedClient=null,dirty=false,step="dados",saving=false;
  function isConsultSelected(){
    const select=$("clientSelect");
    return /CONSULT SERVICES/i.test(select.options[select.selectedIndex]?.textContent||"");
  }
  function updateExampleAvailability(){
    const button=$("simulationExample");
    button.disabled=!selectedClient()||!isConsultSelected();
  }
  function referenceWindow(month){
    const match=/^(202[67])-(0[1-9]|1[0-2])$/.exec(month||"");
    if(!match)return null;
    const y=Number(match[1]),m=Number(match[2]);
    const end=new Date(Date.UTC(y,m-3,1));
    const start=new Date(Date.UTC(y,m-14,1));
    const format=d=>new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"}).format(d);
    return {start:format(start),end:format(end)};
  }
  function warnings(){
    const d=values(),messages=[],revenue=number(d.receita_12m),payroll=number(d.folha_12m);
    if(revenue===null&&payroll!==null&&payroll>=10000)
      messages.push("A folha elegível tem valor elevado, mas o RBT12 está vazio. Confira se o faturamento foi lançado no campo errado.");
    if(payroll!==null&&revenue!==null&&revenue>0&&payroll>=revenue)
      messages.push("A folha elegível é igual ou superior à receita informada. Confira ambas antes de salvar.");
    if(d.estrutura_equipe==="so_socios"&&number(d.prolabore_mensal)===0&&payroll!==null&&payroll>0)
      messages.push("Sem empregados e com pró-labore zero, a folha positiva precisa de origem e natureza confirmadas com a contabilidade.");
    const warning=$("simulationWarnings");
    warning.hidden=messages.length===0;
    warning.replaceChildren(...messages.map(message=>make("p",message)));
    return messages;
  }
  function selectedClient(){return $("clientSelect").value;}
  function make(tag,text,className){
    const el=document.createElement(tag);
    if(text!==undefined)el.textContent=text;
    if(className)el.className=className;
    return el;
  }
  function values(){
    const result={};
    for(const key of fields)result[key]=form.elements[key].value;
    return result;
  }
  function row(label,status,description){
    const div=make("div",undefined,"sim-check");
    div.append(make("strong",label),make("span",status,status==="Informado"||status==="Calculado"?"sim-ok":"sim-pending"),make("p",description));
    return div;
  }
  function progress(data){
    const required=["regime_confirmado","receita_12m","receita_prevista_2027","estrutura_equipe","prolabore_mensal","folha_12m","atividade_fator_r","despesas_12m"];
    const complete=required.filter(k=>data[k]!=="" && !["nao_confirmado","nao_informado"].includes(data[k]));
    const percent=Math.round(complete.length/required.length*100);
    return {complete:complete.length,total:required.length,percent};
  }
  function factor(data){
    const revenue=number(data.receita_12m),payroll=number(data.folha_12m);
    if(revenue===null||payroll===null)return null;
    if(!Number.isFinite(revenue)||revenue<=0||!Number.isFinite(payroll)||payroll<0)return null;
    // Pela Resolução CGSN 140/2018, no PA posterior ao de abertura, FS12=0/RBT12>0
    // pode corresponder a 0,01 (1%) para enquadramento. Não tratar automaticamente como 0%.
    const raw=payroll/revenue;
    const regulatory=payroll===0?0.01:raw;
    return {revenue,payroll,raw,regulatory,threshold:regulatory>=0.28};
  }
  function factorPreview(){
    const data=values(),result=factor(data),area=$("factorPreview");
    if(!result){area.textContent="RBT12 e folha elegível precisam ser informados para calcular o indicador. Pró-labore zero, isoladamente, não comprova folha total zero.";return;}
    const rate=(result.regulatory*100).toLocaleString("pt-BR",{maximumFractionDigits:2});
    area.textContent=result.payroll===0?
      "Folha informada: R$ 0,00. Razão matemática: 0%. Para período de apuração posterior ao início da atividade, a regra de FS12 zero com RBT12 positivo pode resultar em Fator R de 1% para o enquadramento. Confirme o período e a situação com o contador.":
      "Fator R informativo: "+rate+"%. "+(result.threshold?"Atinge":"Não atinge")+" o patamar de 28%. O anexo depende da atividade e da apuração confirmadas.";
  }
  function renderDiagnosis(){
    const d=values(),box=$("simulationDiagnosis");
    const list=[];
    const pr=progress(d),fr=factor(d),windowPeriod=referenceWindow(d.competencia_referencia);
    list.push(row("Receita de referência",d.receita_12m!==""?"Informado":"Pendente",
      d.receita_12m!==""?"RBT12 informado: "+money(Number(d.receita_12m))+". "+(windowPeriod?"Período de referência de 2027: "+windowPeriod.start+" a "+windowPeriod.end+". ":"")+"Confirmar valor no PGDAS-D.":"Informe a receita do período correto. "+(windowPeriod?"De "+windowPeriod.start+" a "+windowPeriod.end+". ":"")));
    list.push(row("Faturamento 2027",d.receita_prevista_2027!==""?"Informado":"Pendente",
      d.receita_prevista_2027!==""?"Projeção anual: "+money(Number(d.receita_prevista_2027))+". Isto é uma hipótese, não receita realizada.":"Informe uma projeção anual para 2027."));
    list.push(row("Equipe e pró-labore",(d.estrutura_equipe!=="nao_informado"&&d.prolabore_mensal!=="")?"Informado":"Pendente",
      d.estrutura_equipe==="so_socios"?"Sem empregados, conforme declarado. Pró-labore mensal: "+(d.prolabore_mensal===""?"não informado":money(Number(d.prolabore_mensal)))+". Confirmar encargos e eventual remuneração contábil.":"Confirme a estrutura da equipe e o pró-labore bruto."));
    list.push(row("Folha e Fator R",fr?"Calculado":"Pendente",
      fr?("Folha: "+money(fr.payroll)+"; RBT12: "+money(fr.revenue)+"; indicador para estudo: "+(fr.regulatory*100).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%. "+(fr.payroll===0?"A regra especial de folha zero foi considerada para período posterior à abertura. ":"")+"A elegibilidade ao Anexo III ou V depende da atividade e da apuração."):
      "Falta confirmar a folha elegível total. Se inexistente, informe zero apenas após confirmação com a contabilidade."));
    list.push(row("Atividade e regime",(d.atividade_fator_r!=="nao_confirmado"&&d.regime_confirmado!=="nao_confirmado")?"Informado":"Pendente",
      "Confirme o enquadramento do serviço, CNAE, anexo e opção de IBS/CBS com a contabilidade. O regime da nota de 2026 não determina a opção em 2027."));
    list.push(row("Despesas e créditos",d.despesas_12m!==""?"Informado":"Pendente",
      d.despesas_12m!==""?"Despesas declaradas: "+money(Number(d.despesas_12m))+". É necessário classificar sua natureza e elegibilidade.":"Informe o total de despesas, se conhecido, e valide quais seriam dedutíveis ou creditáveis."));
    box.replaceChildren(...list);
    const summary=make("p","Você preencheu "+pr.complete+" de "+pr.total+" grupos principais. "+(dirty?"Existem alterações ainda não salvas.":"Verifique os itens pendentes antes de solicitar uma comparação fiscal."),"sim-summary");
    box.prepend(summary);
  }
  function renderResults(){
    const d=values(),fr=factor(d),box=$("simulationResults"),windowPeriod=referenceWindow(d.competencia_referencia);
    const resultList=[];
    if(d.receita_12m!==""&&Number.isFinite(Number(d.receita_12m)))resultList.push(row("RBT12 declarado","Calculado",money(Number(d.receita_12m))+" (valor informado, não homologado no PGDAS-D; "+(windowPeriod?windowPeriod.start+" a "+windowPeriod.end:"período não confirmado")+")."));
    if(d.receita_prevista_2027!==""&&Number.isFinite(Number(d.receita_prevista_2027)))resultList.push(row("Projeção de faturamento para 2027","Calculado",money(Number(d.receita_prevista_2027))+" anual. Média mensal equivalente: "+money(Number(d.receita_prevista_2027)/12)+"."));
    if(fr)resultList.push(row("Fator R informativo","Calculado",(fr.regulatory*100).toLocaleString("pt-BR",{maximumFractionDigits:2})+"% para análise preliminar, condicionado ao período e à confirmação contábil."));
    if(fr&&fr.revenue>0)resultList.push(row("Referência de folha para 28%","Calculado",money(fr.revenue*0.28)+" em 12 meses. Não representa recomendação de pró-labore ou necessidade de aumentar despesas."));
    resultList.push(row("DAS ou impostos de 2027","Pendente","Não calculados. Faltam confirmação de enquadramento, parâmetros oficiais de 2027 e memória de cálculo; não é possível inferir imposto devido apenas pelo RBT12."));
    resultList.push(row("Economia entre regimes","Pendente","Não determinada. As opções de recolhimento e eventuais prazos devem ser verificados com a contabilidade antes de qualquer decisão."));
    box.replaceChildren(...resultList);
    const footer=make("p","Resultado preliminar, exclusivamente informativo. Atualizar as regras oficiais quando a competência de apuração mudar.","sim-summary");
    box.append(footer);
    cards.replaceChildren(...scenarios.map(([name,description])=>{
      const item=make("section",undefined,"scenario-card");
      item.append(make("h3",name),make("p",description),make("small","Tributos estimados: não calculados. Situação: avaliação pendente."));
      return item;
    }));
  }
  function renderProgress(){
    const p=progress(values());
    const windowPeriod=referenceWindow(values().competencia_referencia);
    $("simulationProgress").textContent="Dados principais: "+p.complete+"/"+p.total+" informados ("+p.percent+"%). "+(windowPeriod?"RBT12: "+windowPeriod.start+" a "+windowPeriod.end+". ":"")+(dirty?"Alterações não salvas.":"Preencha os dados pendentes; os resultados existentes são informativos.");
    warnings();
  }
  function showStep(next){
    if(!["dados","diagnostico","resultados"].includes(next))return;
    step=next;
    for(const el of document.querySelectorAll("[data-sim-panel]"))el.hidden=el.dataset.simPanel!==step;
    for(const el of document.querySelectorAll("[data-simstep]"))el.classList.toggle("active",el.dataset.simstep===step);
    renderProgress();renderDiagnosis();renderResults();factorPreview();
    $("simulationRoadmap").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function load(){
    const client=selectedClient();
    if(!client){
      form.reset();form.elements.competencia_referencia.value="2027-01";
      loadedClient=null;dirty=false;
      updateExampleAvailability();
      info.textContent="Selecione um cliente no cabeçalho antes de preencher o estudo.";
      for(const control of form.elements)control.disabled=true;
      renderProgress();renderDiagnosis();renderResults();factorPreview();return;
    }
    for(const control of form.elements)control.disabled=false;
    updateExampleAvailability();
    info.textContent="Carregando informações da empresa...";
    try{
      const response=await fetch("/api/simulacoes/perfil?cliente="+encodeURIComponent(client),{cache:"no-store"});
      if(!response.ok)throw Error("Não foi possível consultar o perfil tributário.");
      const json=await response.json();
      if(client!==selectedClient())return;
      form.reset();
      for(const [key,value] of Object.entries(defaults))form.elements[key].value=value;
      if(json.dados)for(const key of fields)if(json.dados[key]!==null&&json.dados[key]!==undefined)form.elements[key].value=json.dados[key];
      loadedClient=client;dirty=false;
      info.textContent=json.dados?"Dados salvos anteriormente carregados.":"Nenhum dado financeiro salvo para este cliente. Preencha os itens disponíveis e salve.";
      renderProgress();renderDiagnosis();renderResults();factorPreview();
    }catch(e){info.textContent="Falha ao carregar: "+e.message;}
  }
  form.addEventListener("input",()=>{dirty=true;renderProgress();renderDiagnosis();renderResults();factorPreview();});
  form.addEventListener("change",()=>{dirty=true;renderProgress();renderDiagnosis();renderResults();factorPreview();});
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const client=selectedClient();
    if(!client){info.textContent="Selecione um cliente.";return;}
    if(saving)return;
    saving=true;$("simulationSave").disabled=true;
    const data=values();
    if(warnings().length&&!window.confirm("Há campos suspeitos. Deseja salvar mesmo assim como dados não confirmados?")){
      saving=false;$("simulationSave").disabled=false;return;
    }
    try{
      const response=await fetch("/api/simulacoes/perfil",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cliente_id:client,...data})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||"Erro ao salvar");
      if(client!==selectedClient())return;
      dirty=false;
      info.textContent="Dados salvos no banco local deste cliente. "+result.aviso;
      renderProgress();renderDiagnosis();renderResults();
      showStep("diagnostico");
    }catch(e){info.textContent="Falha ao salvar: "+e.message;}
    finally{saving=false;$("simulationSave").disabled=false;}
  });
  for(const button of document.querySelectorAll("[data-simstep]"))button.onclick=()=>showStep(button.dataset.simstep);
  for(const button of document.querySelectorAll("[data-sim-next]"))button.onclick=()=>showStep(button.dataset.simNext);
  $("simulationExample").onclick=()=>{
    if(!isConsultSelected()||!selectedClient())return;
    if(!window.confirm("Aplicar as hipóteses da Consult Services? Receita, equipe e pró-labore atuais serão substituídos. Folha e despesas ficarão vazias."))return;
    form.elements.competencia_referencia.value="2027-01";
    form.elements.regime_confirmado.value="simples";
    form.elements.receita_12m.value="";
    form.elements.receita_prevista_2027.value="156000";
    form.elements.folha_12m.value="";
    form.elements.despesas_12m.value="";
    form.elements.estrutura_equipe.value="so_socios";
    form.elements.prolabore_mensal.value="0";
    form.elements.atividade_fator_r.value="nao_confirmado";
    dirty=true;
    info.textContent="Exemplo aplicado. A receita projetada é R$ 156 mil. O RBT12 segue em branco até confirmação das receitas de dezembro/2025 a novembro/2026.";
    renderProgress();renderDiagnosis();renderResults();factorPreview();
  };
  $("simulationReload").onclick=load;
  $("clientSelect").addEventListener("change",()=>{showStep("dados");load();});
  load();
})();
