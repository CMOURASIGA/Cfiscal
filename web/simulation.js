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
    const end=new Date(Date.UTC(y,y>=2027?m-3:m-2,1));
    const start=new Date(Date.UTC(y,y>=2027?m-14:m-13,1));
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
  function renderIllustrations(data){
    const box=$("preliminaryExamples");
    const example=window.CFiscalPreliminary?.calculate(data.receita_prevista_2027,data.receita_12m);
    if(!example){
      const empty=make("div",undefined,"preliminary-empty");
      empty.append(make("strong","Informe a previsão anual de faturamento para visualizar os exemplos."),
        make("p","Para a Consult Services, você pode usar R$ 156.000 de projeção anual como hipótese. O RBT12 e o anexo aplicável continuam sujeitos à confirmação."));
      box.replaceChildren(empty);
      return;
    }
    const header=make("div",undefined,"preliminary-head");
    header.append(make("h3","Exemplos financeiros por anexo, não são impostos devidos"),
      make("p","Projeção de receita: "+money(example.annual)+" por ano, equivalente a "+money(example.monthly)+" por mês."));
    const summary=make("p",example.firstBracketConfirmedByInput?
      "O RBT12 informado está dentro da primeira faixa (até R$ 180 mil), mas ainda não foi validado. Os anexos não estão confirmados para esta atividade.":
      "Hipótese explícita: primeira faixa do Simples Nacional (RBT12 de até R$ 180 mil). O RBT12 não foi informado ou não sustenta essa faixa. Os números abaixo não representam a tributação real da empresa.","preliminary-caution");
    const cards=make("div",undefined,"preliminary-grid");
    for(const [annex,label] of [["III","Anexo III"],["V","Anexo V"]]){
      const item=make("section",undefined,"preliminary-card");
      const result=example.scenarios[annex];
      item.append(make("h4",label+" | exemplo"),
        make("strong",money(result.monthly)+"/mês"),
        make("p",money(result.annual)+"/ano"),
        make("small","Alíquota nominal ilustrativa: "+(result.rate*100).toLocaleString("pt-BR")+"%. Fórmula: "+money(example.monthly)+" × "+(result.rate*100).toLocaleString("pt-BR")+"%."),
        make("small","Condição: primeira faixa e enquadramento no "+label+"; sem validação do DAS."));
      cards.append(item);
    }
    const diff=make("p","Diferença matemática dos exemplos: "+money(example.monthlyDifference)+" por mês ou "+money(example.annualDifference)+" por ano. Não é economia comprovada nem recomendação de regime.","preliminary-difference");
    const source=make("a","Ver tabelas legais do Simples Nacional, Anexos III e V");
    source.href=example.source;source.target="_blank";source.rel="noopener noreferrer";
    const limits=make("p","Este exemplo não contempla enquadramento fiscal efetivo, fator R confirmado, IBS/CBS em opção separada, IRPJ/CSLL de outros regimes, custos adicionais, créditos ou mudanças da receita ao longo dos meses.","preliminary-limit");
    box.replaceChildren(header,summary,cards,diff,source,limits);
  }
  function renderInterpretation(data){
    const box=$("scenarioInterpretation");
    const fr=factor(data);
    const projected=number(data.receita_prevista_2027);
    const revenue=number(data.receita_12m);
    const team=data.estrutura_equipe==="so_socios"&&number(data.prolabore_mensal)===0;
    let heading,reason,context,action;
    if(data.regime_confirmado!=="simples"){
      heading="Primeiro, confirme se a comparação pelo Simples Nacional faz sentido";
      reason="O regime informado para o estudo não é Simples Nacional. Os exemplos de Anexos III e V não correspondem a um cálculo do regime selecionado.";
      context="A NFS-e antiga não comprova o regime futuro.";
      action="Revise o regime declarado antes de interpretar os exemplos.";
    }else if(data.atividade_fator_r==="nao"){
      heading="Fator R informado como não aplicável";
      reason="Não é possível escolher entre os Anexos III e V pelo Fator R quando a atividade informada não está sujeita a essa regra.";
      context="O anexo da atividade deve ser determinado por sua classificação fiscal, não pelo valor mais baixo do cartão.";
      action="Confirme o CNAE, a natureza do serviço e o anexo aplicável.";
    }else if(data.atividade_fator_r==="sim"&&fr){
      const label=fr.threshold?"III":"V";
      heading="Cenário condicionado pelo Fator R: Anexo "+label;
      reason="Você indicou que a atividade está sujeita ao Fator R e informou folha elegível e RBT12. A proporção preliminar apurada é "+(fr.regulatory*100).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%, "+(fr.threshold?"igual ou superior":"inferior")+" a 28%.";
      context="Esse resultado sugere o Anexo "+label+" apenas se a atividade, o período-base e os dados informados forem válidos. Não é uma confirmação de enquadramento nem um DAS oficial.";
      action="Confira classificação da atividade, competência, folha elegível e memória do PGDAS-D antes de considerar o cenário aplicável.";
    }else if(data.atividade_fator_r==="sim"){
      heading="Atividade sujeita ao Fator R, mas folha ou RBT12 ausente";
      reason="Como a atividade foi indicada como sujeita ao Fator R, falta a relação entre folha elegível e RBT12 para distinguir os Anexos III e V.";
      context="Não use o pró-labore isoladamente como folha total. Sem esses números não é possível inferir qual anexo é aplicável.";
      action="Informe a folha elegível e o RBT12 quando souber, ou continue comparando os dois exemplos sem escolher um deles.";
    }else{
      heading="Enquadramento ainda não definido: dois exemplos, nenhuma indicação oficial";
      reason="A descrição do serviço da NFS-e pode indicar atividade técnica ou consultiva, mas o documento isolado não define se a operação segue o Fator R.";
      context=team?
        "Você informou que trabalha sozinho e não retira pró-labore. Isso exige atenção ao Fator R caso a atividade esteja sujeita a ele, mas não permite concluir que a folha elegível é zero. O Anexo V é uma hipótese a investigar, não o resultado confirmado.":
        "Os exemplos dos Anexos III e V representam hipóteses alternativas. Não se pode eleger uma delas sem o enquadramento da atividade e os dados apropriados.";
      action="Confirme qual atividade foi efetivamente tributada no PGDAS-D e, quando aplicável, o cálculo do Fator R.";
    }
    const title=make("strong",heading);
    const summary=make("p",reason);
    const caution=make("p",context,"interpretation-caution");
    const next=make("p","Próxima verificação: "+action,"interpretation-action");
    const numericExample=window.CFiscalPreliminary?.calculate(data.receita_prevista_2027,data.receita_12m);
    let selectedExample=null;
    if(data.regime_confirmado==="simples"&&data.atividade_fator_r==="sim"&&fr&&numericExample){
      const annex=fr.threshold?"III":"V";
      const sample=numericExample.scenarios[annex];
      selectedExample=make("p","Exemplo condicionado para Anexo "+annex+": "+money(sample.monthly)+" mensais e "+money(sample.annual)+" anuais, considerando apenas a primeira faixa e a receita projetada. "+(numericExample.bracketAssumed?"A primeira faixa é uma hipótese não comprovada pelo RBT12 informado. ":"")+"Não representa o DAS efetivo, nem considera todos os efeitos da Reforma Tributária.","interpretation-example");
    }
    const flags=make("div",undefined,"interpretation-flags");
    flags.append(make("span","Classificação: "+(data.atividade_fator_r==="nao_confirmado"?"não confirmada":data.atividade_fator_r==="sim"?"Fator R informado como aplicável":"Fator R informado como não aplicável")),
      make("span","Folha elegível: "+(data.folha_12m===""?"não informada":money(Number(data.folha_12m)))),
      make("span","RBT12: "+(revenue===null?"não informado":money(revenue))));
    if(projected===null)flags.append(make("span","Projeção anual: pendente"));
    box.replaceChildren(title,flags,summary,caution,...(selectedExample?[selectedExample]:[]),next);
  }
  function renderTaxMemory(data){
    const box=$("taxMemory");
    if(!box)return;
    const annual=data.receita_prevista_2027!==""?Number(data.receita_prevista_2027):null;
    const results=window.CFiscalTaxEngine?.compare({
      rbt12:data.receita_12m,monthlyRevenue:annual===null?null:annual/12,
      competence:data.competencia_referencia||"2027-01",
      factorRApplicable:data.atividade_fator_r==="sim"?true:data.atividade_fator_r==="nao"?false:null,
      payroll12:data.folha_12m
    });
    const header=make("h3","Memória de cálculo | Simples Nacional 2027–2028");
    const caution=make("p","Estimativas condicionadas. A escolha de anexo depende do serviço, da legislação e do Fator R, quando aplicável. Não é DAS apurado pelo PGDAS-D.","tax-caution");
    const content=make("div",undefined,"tax-memory-grid");
    for(const key of ["III","V"]){
      const r=results?.[key],card=make("section",undefined,"tax-memory-card");
      card.append(make("h4","Anexo "+key));
      if(r?.status==="hypothetical"){
        card.append(make("strong",money(r.monthlyEstimate)+"/mês"),
          make("p","Faixa: "+r.band+" | RBT12: "+money(r.rbt12)),
          make("p","Alíquota nominal: "+r.nominalPct.toLocaleString("pt-BR")+"% | Dedução: "+money(r.deduction)),
          make("p","Alíquota efetiva: "+r.effectivePct.toLocaleString("pt-BR")+"%"),
          make("p","Fórmula: ((RBT12 × nominal) − dedução) ÷ RBT12 × receita do mês."),
          make("p","Receita mensal usada: "+money(r.monthlyRevenue)),
          make("small","Regra: "+r.rule));
        const source=make("a","Consultar tabela legal");source.href=r.source;source.target="_blank";source.rel="noopener noreferrer";card.append(source);
      }else{
        card.append(make("p",r?.message||"Informe RBT12 e previsão anual para gerar um cálculo condicionado."));
      }
      content.append(card);
    }
    box.replaceChildren(header,caution,content);
  }
  function renderResults(){
    const d=values(),fr=factor(d),box=$("simulationResults"),windowPeriod=referenceWindow(d.competencia_referencia);
    renderIllustrations(d);
    renderTaxMemory(d);
    renderInterpretation(d);
    const resultList=[];
    if(d.receita_12m!==""&&Number.isFinite(Number(d.receita_12m)))resultList.push(row("RBT12 informado","Informado",money(Number(d.receita_12m))+" (valor informado, não homologado no PGDAS-D; "+(windowPeriod?windowPeriod.start+" a "+windowPeriod.end:"período não confirmado")+")."));
    if(d.receita_prevista_2027!==""&&Number.isFinite(Number(d.receita_prevista_2027)))resultList.push(row("Projeção de faturamento para 2027","Informado",money(Number(d.receita_prevista_2027))+" anual. Média mensal equivalente: "+money(Number(d.receita_prevista_2027)/12)+"."));
    if(fr)resultList.push(row("Fator R informativo","Calculado",(fr.regulatory*100).toLocaleString("pt-BR",{maximumFractionDigits:2})+"% para análise preliminar, condicionado ao período e à confirmação contábil."));
    if(fr&&fr.revenue>0)resultList.push(row("Referência de folha para 28%","Calculado",money(fr.revenue*0.28)+" em 12 meses. Não representa recomendação de pró-labore ou necessidade de aumentar despesas."));
    resultList.push(row("DAS efetivamente devido em 2027","Pendente","A memória de cálculo condicionada já pode ser consultada acima; apuração oficial e anexo aplicável dependem de dados fiscais validados."));
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
