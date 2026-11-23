"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const form = $("simulationForm");
  const info = $("simulationInfo");
  const cards = $("simulationScenarios");
  const fields = ["receita_12m","receita_prevista_2027","folha_12m","despesas_12m","regime_confirmado"];
  const scenarios = [
    ["Simples Nacional","Manter a tributação pelo Simples, com IBS/CBS dentro do regime quando aplicável."],
    ["Simples com IBS/CBS no regime regular","Avaliar opção legal, período e possíveis créditos antes de comparar."],
    ["Lucro Presumido","Considerar IRPJ, CSLL, PIS/Cofins/CBS, IBS, folha e demais obrigações."],
    ["Lucro Real","Considerar resultado tributável, créditos elegíveis, folha e obrigações adicionais."]
  ];
  function showScenarios(){
    cards.replaceChildren(...scenarios.map(([name,description])=>{
      const item = document.createElement("section");
      item.className = "scenario-card";
      const heading = document.createElement("h3");
      heading.textContent = name;
      const paragraph = document.createElement("p");
      paragraph.textContent = description;
      const status = document.createElement("small");
      status.textContent = "Sem cálculo: aguardando dados fiscais e motor compatível.";
      item.append(heading,paragraph,status);
      return item;
    }));
  }
  function selectedClient(){return $("clientSelect").value;}
  async function load(){
    if(!selectedClient()){
      form.reset();
      info.textContent = "Selecione um cliente ativo no cabeçalho antes de preencher a simulação.";
      for(const control of form.elements)control.disabled=true;
      return;
    }
    for(const control of form.elements)control.disabled=false;
    info.textContent="Carregando informações deste cliente...";
    try{
      const response=await fetch("/api/simulacoes/perfil?cliente="+encodeURIComponent(selectedClient()),{cache:"no-store"});
      if(!response.ok)throw Error("Erro ao consultar os dados da empresa.");
      const result=await response.json();
      // Impede que uma resposta atrasada de outra empresa sobrescreva os campos.
      if(result.cliente!==selectedClient())return;
      form.reset();
      if(result.dados){
        for(const key of fields)form.elements[key].value=result.dados[key]??(key==="regime_confirmado"?"nao_confirmado":"");
      }
      info.textContent=result.dados?"Dados locais carregados. Nenhum imposto foi calculado.":"Nenhuma informação financeira cadastrada para este cliente.";
    }catch(e){info.textContent="Não foi possível consultar os dados: "+e.message;}
  }
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const clientId=selectedClient();
    if(!clientId){info.textContent="Selecione um cliente.";return;}
    const payload={cliente_id:clientId};
    for(const key of fields)payload[key]=form.elements[key].value;
    $("simulationSave").disabled=true;
    try{
      const response=await fetch("/api/simulacoes/perfil",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
      });
      const data=await response.json();
      if(!response.ok)throw Error(data.error||"Falha ao salvar.");
      info.textContent=data.aviso;
    }catch(error){info.textContent="Não foi possível salvar: "+error.message;}
    finally{$("simulationSave").disabled=false;}
  });
  $("simulationReload").onclick=load;
  $("clientSelect").addEventListener("change",load);
  showScenarios();
  load();
})();