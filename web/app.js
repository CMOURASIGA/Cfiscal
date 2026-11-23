"use strict";
const $ = id => document.getElementById(id);
const currency = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const money = v => v === null || v === "" || v === undefined ? "Ausente" : currency.format(v);
const states = ["Valores coincidentes","Divergência","Dados insuficientes"];
let notes = [], current, timer;
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
    box.style.setProperty("--tone",["#446bad","#52856c","#ce9948","#8798b5"][i]);
    box.append(el("span",label),el("strong",i?visible.filter(n=>n.status===label).length:visible.length));
    return box;
  }));
  $("rows").replaceChildren(...visible.map(n=>{
    const row=el("tr"), doc=el("td"), result=el("td"), action=el("td"), open=el("button","Ver nota");
    doc.append(el("strong","Nº "+n.number),el("small",n.company||n.cnpj));
    result.append(pill(n.status));open.onclick=()=>detail(n); action.append(open);
    row.append(doc,el("td",n.date.slice(0,7)||"Ausente"),el("td",money(n.ibs)),result,el("td",workflow(n)),action);
    return row;
  }));
  $("empty").textContent = visible.length ? "" : notes.length ? "Nenhuma nota corresponde aos filtros." : "Carregue os exemplos ou importe os XMLs do seu computador.";
}
async function refresh() {
  notes=await api("notas");
  const selected=$("company").value;
  const companies=new Map(notes.map(n=>[n.cnpj,n.company||n.cnpj]));
  $("company").replaceChildren(new Option("Todas as empresas",""),...Array.from(companies,([v,t])=>new Option(t+" · "+v,v)));
  $("company").value=selected;
  render();
}
async function batch(files) {
  $("import").disabled=$("demo").disabled=true;
  $("batch").replaceChildren();$("receipts").hidden=false;$("receipts").open=true;
  let count=0;
  try {
    for(const file of files) {
      let result;
      try {
        if(file.size>5*1024*1024) throw new Error("Máximo de 5 MiB por XML.");
        const xml=file.xml ?? await file.text();
        const r=await api("importar",{xml});
        result=r.importada?"Importada":"Duplicada, já importada";
        if(r.importada) count++;
      } catch(e) {result=e.message;}
      $("batch").append(el("li",file.name+" · "+result));
    }
    await refresh();message(count+" nota(s) importada(s). Confira o resultado do lote.");
  } finally { $("import").disabled=$("demo").disabled=false; }
}
function detail(n) {
  current=n;
  $("detailTitle").textContent="NFS-e nº "+n.number;
  $("detailMessage").textContent="";
  const values=el("dl");
  for(const [key,val] of Object.entries({"Empresa":n.company,"CNPJ":n.cnpj,"Competência":n.date,"Serviço":n.service,
    "Valor do serviço":money(n.gross),"CBS declarada":money(n.cbs),"IBS estadual":money(n.state),"IBS municipal":money(n.city),
    "IBS declarado":money(n.ibs),"Soma das parcelas":money(n.expected===null?null:n.expected/100),
    "Diferença":money(n.difference===null?null:n.difference/100)})) values.append(el("dt",key),el("dd",val||"Ausente"));
  $("overview").replaceChildren(pill(n.status),el("p",n.reason),values);
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
$("review").onsubmit=e=>{e.preventDefault();submit(e.target,()=>api("revisar",{id:current.id,...Object.fromEntries(new FormData(e.target))}));};
$("engine").onsubmit=e=>{e.preventDefault();submit(e.target,()=>api("calcular",{id:current.id,motor:$("motor").value,entrada:payload(Object.fromEntries(new FormData(e.target)),$("motor").value==="regular")}));};
$("motor").onchange=engineFields;
$("pdf").onclick=async()=>{try{download(await api("pdf",{id:current.id}),"DANFSe-"+current.number+".pdf");}catch(e){message(e.message);}};
$("print").onclick=()=>window.print();
$("close").onclick=()=>$("drawer").close();
$("import").onclick=()=>$("files").click();
$("files").onchange=async e=>{await batch(Array.from(e.target.files));e.target.value="";};
$("demo").onclick=async()=>{try{await batch(await api("exemplos"));}catch(e){message(e.message);}};
$("export").onclick=()=>{
  const rows=[["Nota","Empresa","CNPJ","Competência","IBS declarado","Resultado","Revisão"],...filtered().map(n=>[n.number,n.company,n.cnpj,n.date,n.ibs,n.status,workflow(n)])];
  const cell=s=>'"'+String(s).replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"';
  download(new Blob(["\uFEFF"+rows.map(r=>r.map(cell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}),"CFiscal-conferencia.csv");
};
for(const id of ["company","month","status","workflow"])$(id).onchange=render;
document.querySelector('a[href="#integracoes"]').onclick=()=>$("integracoes").open=true;
refresh().catch(e=>message(e.message));
