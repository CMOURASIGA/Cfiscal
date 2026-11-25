"use strict";
const $ = id => document.getElementById(id);
const currency = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const money = v => v === null || v === "" || v === undefined ? "Ausente" : currency.format(v);
const states = ["Valores coincidentes","Divergência","Dados insuficientes"];
let notes = [], current, timer, clients = [], legacyMode = false;
function el(tag, value, cls) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  if (cls) node.className = cls;
  return node;
}
async function api(path, body) {
  const response = await fetch("/api/"+path,body ? {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)} : {});
  if (!response.ok) throw new Error((await response.json()).error || "Falha na solicitação.");
  return response.headers.get("Content-Type").includes("pdf") ? response.blob() : response.json();
}
function message(text) {
  if ($("drawer").open) { $("detailMessage").textContent = text; return; }
  $("toast").textContent = text;
  clearTimeout(timer);
  timer = setTimeout(()=>$("toast").textContent="",6000);
}
const historyOf = n => n.events.filter(e=>e.kind==="Revisão");
const workflow = n => historyOf(n).at(-1)?.data.situacao || "Aberta";
function filtered() {
  return notes.filter(n=>(!$("company").value || n.cnpj===$("company").value) &&
    (!$("month").value || n.date.startsWith($("month").value)) &&
    (!$("status").value || n.status===$("status").value) &&
    (!$("workflow").value || workflow(n)===$("workflow").value));
}
function pill(status) {
  return el("span",status,"pill "+({"Divergência":"warn","Dados insuficientes":"missing"}[status]||""));
}
function render() {
  const visible = filtered();
  $("metrics").replaceChildren(...["Notas no filtro",...states].map((label,i)=>{
    const box = el("div",undefined,"metric");
    box.style.setProperty("--tone",["#003B73","#52856c","#ce9948","#8798b5"][i]);
    box.append(el("span",label==="Dados insuficientes"?"Sem totalização do IBS":label),el("strong",i?visible.filter(n=>n.status===label).length:visible.length));
    return box;
  }));
  $("rows").replaceChildren(...visible.map(n=>{
    const row=el("tr"), doc=el("td"), result=el("td"), action=el("td"), open=el("button","Ver nota");
    doc.append(el("strong","Nº "+n.number),el("small",n.company||n.cnpj));
    result.append(pill(n.diagnostico?.titulo?.startsWith("Ausência de IBS/CBS")?"Ausência contextualizada":n.status));open.onclick=()=>detail(n); action.append(open);
    row.append(doc,el("td",n.date.slice(0,7)||"Ausente"),el("td",money(n.ibs)),result,el("td",workflow(n)),action);
    return row;
  }));
  $("empty").textContent = visible.length ? "" : notes.length ? "Nenhuma nota corresponde aos filtros." : "Carregue os exemplos ou importe os XMLs do seu computador.";
}
async function refresh() {
  const selectedClient=$("clientSelect").value;
  notes=await api("notas?cliente="+encodeURIComponent(legacyMode?"pendentes":selectedClient));
  $("clientInfo").textContent=legacyMode?"Visualizando notas antigas sem cliente. Para vincular, selecione primeiro o cliente correspondente ao CNPJ.": selectedClient?"Notas e importações vinculadas ao cliente selecionado.":"Selecione ou cadastre um cliente para visualizar e importar notas.";
  $("legacySection").hidden=false;
  $("legacy").hidden=legacyMode;
  $("backClient").hidden=!legacyMode;
  const selected=$("company").value;
  const companies=new Map(notes.map(n=>[n.cnpj,n.company||n.cnpj]));
  $("company").replaceChildren(new Option("Todas as empresas",""),...Array.from(companies,([v,t])=>new Option(t+" · "+v,v)));
  $("company").value=selected;
  render();
}
async function batch(files) {
  const clientId=$("clientSelect").value;
  if(!clientId || legacyMode){message("Selecione um cliente cadastrado antes de importar.");return;}
  if(!files.length)return;
  $("import").disabled=$("demo").disabled=true;
  $("batch").replaceChildren();$("receipts").hidden=false;$("receipts").open=true;
  let added=0, repeated=0, rejected=0;
  try {
    for(const file of files) {
      const row=el("li");
      try {
        if(file.size>5*1024*1024) throw new Error("Máximo de 5 MiB por XML.");
        const xml=file.xml ?? await file.text();
        const r=await api("importar",{xml,cliente_id:clientId});
        if(r.importada) added++; else repeated++;
        row.append(el("span",file.name+" · Nota "+r.numero+" · "+(r.importada?"Importada":"Já estava na fila. A revisão anterior foi preservada.")));
        const open=el("button","Abrir nota "+r.numero);
        open.onclick=()=>{const item=notes.find(n=>n.id===r.id);if(item)detail(item);};
        row.append(open);
      } catch(e) {rejected++;row.append(el("span",file.name+" · Recusado: "+e.message));}
      $("batch").append(row);
    }
    await refresh();
    $("batchTitle").textContent="Resultado do lote · Novas: "+added+" · Já na fila: "+repeated+" · Recusadas: "+rejected;
    $("receipts").scrollIntoView({block:"nearest"});
  } finally { $("import").disabled=$("demo").disabled=false; }
}
function serviceSummary(value){
  const text=String(value||"");
  const cleaned=text.split(/\b(?:DADOS\s+BANC[AÁ]RIOS|BANCO\s*:|AG[EÊ]NCIA\s*:|CONTA\s+CORRENTE\s*:|PIX\s*:)/i)[0].trim();
  return cleaned.length>180?cleaned.slice(0,180)+"…":cleaned||"Não informado";
}
function detail(n) {
  current=n;
  $("detailTitle").textContent="NFS-e nº "+n.number;
  $("detailMessage").textContent="";
  const values=el("dl");
  for(const [key,val] of Object.entries({"Empresa":n.company,"CNPJ":n.cnpj,"Competência":n.date,"Serviço (resumo)":serviceSummary(n.service),
    "Valor do serviço":money(n.gross),"CBS declarada":money(n.cbs),"IBS estadual":money(n.state),"IBS municipal":money(n.city),
    "IBS declarado":money(n.ibs),"Soma das parcelas":money(n.expected===null?null:n.expected/100),
    "Diferença":money(n.difference===null?null:n.difference/100)})) values.append(el("dt",key),el("dd",val||"Ausente"));
  const diagnostic=n.diagnostico;
  const diagnosisBox=el("section",undefined,"diagnosis-box");
  if(diagnostic){
    diagnosisBox.append(el("h3","Diagnóstico fiscal contextual"),el("strong",diagnostic.titulo),el("p",diagnostic.explicacao));
    const meta=el("dl");
    for(const [label,value] of Object.entries({
      "Regime no XML":diagnostic.regime_informado,
      "Regra aplicada":diagnostic.versao_regra,
      "Conferência aritmética":diagnostic.verificacao_aritmetica,
      "Validação da assinatura":diagnostic.validacao_assinatura,
      "Validação de XSD":diagnostic.validacao_xsd,
      "Cálculo do tributo devido":diagnostic.calculo_tributario,
      "Conformidade integral":diagnostic.conformidade_integral
    }))meta.append(el("dt",label),el("dd",value));
    diagnosisBox.append(meta,el("h3","O que fazer agora"),el("p",diagnostic.acao));
    const sources=el("div",undefined,"diagnosis-sources");
    sources.append(el("strong","Referências oficiais"));
    for(const source of diagnostic.fontes){
      const anchor=el("a",source.titulo);
      anchor.href=source.url;anchor.target="_blank";anchor.rel="noopener noreferrer";
      sources.append(anchor);
    }
    diagnosisBox.append(sources);
    if(diagnostic.cenario_2027){
      const scenario=el("details",undefined,"scenario-2027");
      scenario.append(el("summary","O que precisaria conferir para uma nota equivalente em 2027?"));
      scenario.append(el("p",diagnostic.cenario_2027.conclusao));
      const checklist=el("ul");
      for(const item of diagnostic.cenario_2027.confirmar_com_contabilidade)checklist.append(el("li",item));
      scenario.append(checklist);
      diagnosisBox.append(scenario);
    }
    diagnosisBox.classList.add("diagnosis-"+diagnostic.nivel);
  }
  const contextual=diagnostic?.titulo?.startsWith("Ausência de IBS/CBS");
  const aritStatus=contextual?"Conferência não executada":n.status;
  const aritReason=contextual?
    "A nota de 2026 não traz valores de IBS para somar. A ausência foi contextualizada para a competência e o regime informados no XML; isso não atesta conformidade fiscal integral.":n.reason;
  $("overview").replaceChildren(...(diagnostic?[diagnosisBox]:[]),el("h3","Conferência aritmética do documento"),pill(aritStatus),el("p",aritReason),values);
  if(n.service && n.service!==serviceSummary(n.service)){
    const original=el("details",undefined,"sensitive-service");
    original.append(el("summary","Mostrar descrição integral original (pode conter dados bancários)"),el("p",n.service));
    $("overview").append(original);
  }
  if(legacyMode){
    const btn=el("button","Vincular ao cliente selecionado");
    btn.onclick=async()=>{
      const selected=$("clientSelect").value;
      if(!selected){message("Selecione primeiro um cliente.");return;}
      try{await api("vincular",{id:n.id,cliente_id:selected});$("drawer").close();legacyMode=false;await refresh();message("Nota vinculada ao cliente.");}catch(e){message(e.message);}
    };
    $("overview").append(el("p","Nota antiga sem vínculo: selecione um cliente com o mesmo CNPJ antes de vincular."),btn);
  }
  const lastReview=historyOf(n).at(-1);
  $("documentStepTitle").textContent=lastReview?"Etapa 3 concluída · Revisão registrada":"Etapa 3 de 8 · Conferência e revisão";
  $("documentStepStatus").textContent=lastReview?
    "Última revisão: "+lastReview.data.situacao+" por "+lastReview.data.responsavel+". Você pode seguir para a Simulação Tributária. A revisão não constitui homologação fiscal oficial.":
    "Ainda não há revisão registrada. Abra a aba Revisão para salvar uma análise, ou avance com a etapa pendente. A simulação não depende de consulta prévia à contabilidade.";
  $("documentReviewTab").textContent=lastReview?"Consultar revisão":"Registrar revisão";
  $("review").reset(); $("review").elements.responsavel.value=historyOf(n).at(-1)?.data.responsavel||"";
  $("history").replaceChildren(...historyOf(n).slice().reverse().map(e=>{
    const box=el("div",undefined,"event");
    box.append(el("strong",e.data.situacao+" · "+e.data.responsavel),el("small"," · "+new Date(e.date).toLocaleString("pt-BR")),el("p",e.data.comentario));return box;
  }));
  if (!historyOf(n).length) $("history").textContent="Nenhuma revisão registrada.";
  $("motor").value=n.regime==="3"?"simples":"regular";engineFields();
  $("evidence").replaceChildren(...n.events.filter(e=>e.kind!=="Revisão").slice().reverse().map(e=>{
    const box=el("details",undefined,"event");
    box.append(el("summary",e.kind+" · "+new Date(e.date).toLocaleString("pt-BR")),el("p",e.data.resultado),el("pre",JSON.stringify(e.data,null,2)));return box;
  }));
  if (!$("drawer").open){$("t1").click();$("drawer").showModal();}
}
function engineFields() {
  const regular=$("motor").value==="regular";
  const suggested=regular && ["101","102"].includes(current.sample)
    ? {moment:"2027-03-10T10:00:00-03:00",uf:"RS",municipio:"4314902",cbs:"8.8",state:"0.05",city:"0.05"}
    : !regular && current.sample==="201" ? {crt:"1",activity:"07",cbs:"2.75",ibs:"1.25",is:"0.00"} : {};
  $("assumptions").textContent=Object.keys(suggested).length?"Amostra sintética. Os campos sugeridos reproduzem as premissas do exemplo técnico.":"Confira as premissas da operação. Campos em branco exigem confirmação.";

  const fields=[["base","Base de cálculo",current.base],["class","Classificação tributária",current.classification],
    ...(regular?[["moment","Data e hora do fato gerador (com fuso)",""],["uf","UF de incidência",""],["municipio","Código IBGE de incidência",""],
      ["nbs","NBS",current.nbs],["cst","CST",current.cst],["cbs","CBS nominal (%) a partir de 2027",""],["state","IBS estadual nominal (%) a partir de 2027",""],["city","IBS municipal nominal (%) a partir de 2027",""]]:
      [["date","Data do fato gerador",current.date],["crt","CRT confirmado",""],["activity","Atividade do Simples",""],["cbs","CBS do Simples (%)",""],["ibs","IBS do Simples (%)",""],["is","Imposto Seletivo informado (R$)",""]])];
  $("fields").replaceChildren(...fields.map(([name,title,value])=>{
    const label=el("label",title),input=el("input");input.name=name;input.value=suggested[name]??value??"";
    input.required=!(regular&&["cbs","state","city"].includes(name));
    if(name==="moment")input.placeholder="2027-03-10T10:00:00-03:00";
    if(name==="date")input.type="date";
    label.append(input);return label;
  }));
}
function numeric(s) {
  if(!/^\d+(?:[.,]\d+)?$/.test(s))throw new Error("Preencha os valores numéricos e as alíquotas aplicáveis.");
  return Number(s.replace(",","."));
}
function payload(f,regular) {
  const base=numeric(f.base), common={numero:1,cClassTrib:f.class,baseCalculo:base};
  if(!regular)return {id:current.id.slice(0,24),versao:"2.0.0",data:f.date,tpDoc:"91",CRT:f.crt,itens:[{...common,cAtivSN:f.activity,pIBSSN:numeric(f.ibs),pCBSSN:numeric(f.cbs),valorImpostoSeletivo:numeric(f.is)}]};
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(f.moment))throw new Error("Informe data, hora e fuso conforme o exemplo.");
  const item={...common,cst:f.cst,nbs:f.nbs};
  if(Number(f.moment.slice(0,4))>=2027)item.aliquotasNominais={cbs:numeric(f.cbs),ibsEstadual:numeric(f.state),ibsMunicipal:numeric(f.city)};
  return {id:current.id.slice(0,32),versao:"1.0.0",dhFatoGerador:f.moment,municipio:numeric(f.municipio),uf:f.uf.toUpperCase(),itens:[item]};
}
async function submit(form,action) {
  const button=form.querySelector("button");button.disabled=true;const id=current.id;
  try {await action();await refresh();if(current.id===id && $("drawer").open){detail(notes.find(n=>n.id===id));message("Registro salvo.");}}
  catch(e){message(e.message);} finally{button.disabled=false;}
}
function download(blob,name) {
  const url=URL.createObjectURL(blob),a=el("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
$("review").onsubmit=e=>{e.preventDefault();submit(e.target,()=>api("revisar",{id:current.id,cliente_id:$("clientSelect").value,...Object.fromEntries(new FormData(e.target))}));};
$("engine").onsubmit=e=>{e.preventDefault();submit(e.target,()=>api("calcular",{id:current.id,cliente_id:$("clientSelect").value,motor:$("motor").value,entrada:payload(Object.fromEntries(new FormData(e.target)),$("motor").value==="regular")}));};
$("motor").onchange=engineFields;
$("pdf").onclick=async()=>{try{download(await api("pdf",{id:current.id,cliente_id:$("clientSelect").value}),"DANFSe-"+current.number+".pdf");}catch(e){message(e.message);}};
$("print").onclick=()=>window.print();
$("close").onclick=()=>$("drawer").close();
$("documentReviewTab").onclick=()=>$("t2").click();
$("documentContinue").onclick=()=>{
  $("drawer").close();
  if(typeof window.CFiscalNavigate==="function")window.CFiscalNavigate("simulacao");
  else location.hash="#simulacao";
};
$("import").onclick=()=>$("files").click();
$("files").onchange=async e=>{await batch(Array.from(e.target.files));e.target.value="";};
$("demo").onclick=async()=>{
  const client=clients.find(c=>c.id===$("clientSelect").value);
  if(!client){message("Cadastre e selecione a empresa emitente antes de carregar exemplos.");return;}
  try{
    const examples=await api("exemplos");
    const matching=examples.filter(f=>{
      const doc=new DOMParser().parseFromString(f.xml,"application/xml");
      const emit=doc.getElementsByTagNameNS("http://www.sped.fazenda.gov.br/nfse","emit")[0];
      const cnpj=emit?.getElementsByTagNameNS("http://www.sped.fazenda.gov.br/nfse","CNPJ")[0]?.textContent;
      return cnpj===client.cnpj;
    });
    if(!matching.length){message("Não existem exemplos para este CNPJ. Use Importar XMLs em lote.");return;}
    await batch(matching);
  }catch(e){message(e.message);}
};
$("export").onclick=()=>{
  const rows=[["Nota","Empresa","CNPJ","Competência","IBS declarado","Resultado","Revisão"],...filtered().map(n=>[n.number,n.company,n.cnpj,n.date,n.ibs,n.status,workflow(n)])];
  const cell=s=>'"'+String(s).replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"';
  download(new Blob(["\uFEFF"+rows.map(r=>r.map(cell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}),"CFiscal-conferencia.csv");
};
for(const id of ["company","month","status","workflow"])$(id).onchange=render;
document.querySelector('a[href="#integracoes"]').onclick=()=>$("integracoes").open=true;
async function refreshClients(selectId=""){
  clients=await api("clientes");
  const existing=selectId || $("clientSelect").value;
  $("clientSelect").replaceChildren(new Option("Selecione um cliente",""),...clients.filter(c=>c.active).map(c=>new Option(c.name+" · "+c.cnpj,c.id)));
  $("clientSelect").value=existing;
  if(!selectId && existing && !$("clientSelect").value)$("clientSelect").value="";
  // Clientes são carregados de forma assíncrona depois dos demais módulos.
  // Avisar Simulação, Dashboard e rotinas dependentes do cliente para sincronizar a tela.
  $("clientSelect").dispatchEvent(new Event("change", {bubbles:true}));
}
$("clientForm").onsubmit=async e=>{
  e.preventDefault();
  const form=e.target, button=form.querySelector("button");
  button.disabled=true;
  try{
    const data=Object.fromEntries(new FormData(form));
    const created=await api("clientes",data);
    form.reset();await refreshClients(created.id);legacyMode=false;await refresh();
    message("Cliente cadastrado. Selecione XMLs cujo emitente tenha o CNPJ informado.");
  }catch(err){message(err.message);}finally{button.disabled=false;}
};
$("clientSelect").onchange=()=>{legacyMode=false;refresh().catch(e=>message(e.message));};
$("legacy").onclick=()=>{legacyMode=true;refresh().catch(e=>message(e.message));};
$("backClient").onclick=()=>{legacyMode=false;refresh().catch(e=>message(e.message));};
refreshClients().then(()=>refresh()).catch(e=>message(e.message));
