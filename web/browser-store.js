"use strict";
/* Adaptador de armazenamento no navegador para Vercel, sem backend.
 * Em localhost o backend Python/SQLite mantém seu funcionamento original. */
(() => {
  const isLocal=["localhost","127.0.0.1","::1"].includes(location.hostname);
  if(isLocal) return;
  const KEY="cfiscal:browser:v1",NS="http://www.sped.fazenda.gov.br/nfse";
  const VERSION=1;
  const nativeFetch=window.fetch.bind(window);
  const now=()=>new Date().toISOString();
  const empty=()=>({version:VERSION,clients:[],notes:[],profiles:{}});
  const clone=x=>JSON.parse(JSON.stringify(x));
  let db;
  function validateState(s){
    if(!s||s.version!==VERSION||!Array.isArray(s.clients)||!Array.isArray(s.notes)||!s.profiles||typeof s.profiles!=="object"||Array.isArray(s.profiles))throw Error("Formato de banco local inválido.");
    if(s.clients.length>200||s.notes.length>600)throw Error("Limite de registros excedido para o armazenamento do navegador.");
    return s;
  }
  function read(){
    try{return validateState(JSON.parse(localStorage.getItem(KEY)||JSON.stringify(empty())));}
    catch(e){
      if(localStorage.getItem(KEY))throw Error("Banco local ilegível. Exporte o armazenamento antes de restaurar ou apagar dados.");
      return empty();
    }
  }
  try{db=read();}catch(e){db=empty();window.CFiscalStoreError=e.message;}
  function save(next){
    const encoded=JSON.stringify(next);
    if(encoded.length>4*1024*1024)throw Error("Limite de espaço do navegador atingido. Exporte uma cópia e reduza a quantidade de XMLs.");
    try{localStorage.setItem(KEY,encoded);}catch(e){throw Error("Não foi possível gravar no armazenamento deste navegador. Verifique o espaço livre e as permissões.");}
    db=next;
  }
  function fail(message,status=422){return new Response(JSON.stringify({error:message}),{status,headers:{"Content-Type":"application/json"}});}
  function ok(value){return new Response(JSON.stringify(value),{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
  function digit(v){return String(v||"").replace(/\D/g,"");}
  const qty=v=>/^[0-9]{1,15}(?:\.[0-9]{1,2})?$/.test(String(v||""))?Math.round(Number(v)*100):null;
  function getChild(node,path){
    let el=node;
    for(const name of path.split("/")){
      el=Array.from(el?.children||[]).find(c=>c.localName===name);
      if(!el)return "";
    }
    return (el.textContent||"").trim();
  }
  function findChild(node,name){return Array.from(node?.children||[]).find(c=>c.localName===name);}
  const FIELDS={
    number:"nNFSe",company:"emit/xNome",cnpj:"emit/CNPJ",
    date:"DPS/infDPS/dCompet",service:"DPS/infDPS/serv/cServ/xDescServ",
    nbs:"DPS/infDPS/serv/cServ/cNBS",regime:"DPS/infDPS/prest/regTrib/opSimpNac",
    gross:"DPS/infDPS/valores/vServPrest/vServ",
    base:"IBSCBS/valores/vBC",cbs:"IBSCBS/totCIBS/gCBS/vCBS",
    ibs:"IBSCBS/totCIBS/gIBS/vIBSTot",state:"IBSCBS/totCIBS/gIBS/gIBSUFTot/vIBSUF",
    city:"IBSCBS/totCIBS/gIBS/gIBSMunTot/vIBSMun",
    classification:"DPS/infDPS/IBSCBS/valores/trib/gIBSCBS/cClassTrib",
    cst:"DPS/infDPS/IBSCBS/valores/trib/gIBSCBS/CST",
    codigo_servico:"DPS/infDPS/serv/cServ/cTribNac",
    regime_apuracao_simples:"DPS/infDPS/prest/regTrib/regApTribSN",
    percentual_tributos_simples:"DPS/infDPS/valores/trib/totTrib/pTotTribSN"
  };
  const SOURCES=[
    {titulo:"Receita Federal: NFS-e e Simples Nacional",url:"https://www.gov.br/receitafederal/pt-br"},
    {titulo:"Portal NFS-e: documentação técnica",url:"https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/documentacao-atual"}
  ];
  function diagnosis(n){
    const missing=["cbs","ibs","state","city"].filter(k=>qty(n[k])===null);
    const simples=["2","3"].includes(n.regime);
    let nivel="revisao",titulo="Análise tributária contextual não conclusiva",explicacao="O XML isolado não permite atestar a conformidade tributária da operação.",acao="Confirme competência, classificação, operação e regras fiscais aplicáveis.";
    if(n.date.startsWith("2026-")&&simples&&missing.length===4){
      nivel="informativo";titulo="Ausência de IBS/CBS compatível com a transição de 2026";
      explicacao="O documento informa Simples Nacional e não contém valores de IBS/CBS. A ausência, isoladamente, não indica erro na competência de 2026.";
      acao="Não altere o XML original por falta desses campos. Confira autenticidade e enquadramento antes de concluir.";
    }else if(n.status==="Divergência"){
      nivel="atencao";titulo="Divergência na totalização do IBS declarado";
      explicacao="O total do IBS é diferente da soma das parcelas estadual e municipal.";
      acao="Conferir os valores originais com o responsável fiscal. Não modificar documento assinado.";
    }else if(n.status==="Valores coincidentes"){
      nivel="informativo";titulo="Totalização aritmética do IBS coincidente";
      explicacao="A soma aritmética coincide, mas isso não equivale a uma validação tributária completa.";
      acao="Validar classificação, lei aplicável e, se disponível, motor oficial.";
    }else if(n.date>="2027-01-01"&&simples&&missing.length){
      titulo="IBS/CBS ausentes em documento de 2027 ou posterior";
      explicacao="A ausência exige verificação do leiaute e do regime de recolhimento aplicáveis.";
      acao="Revisar regra de competência e opção de recolhimento antes da emissão.";
    }
    const regimeLabel=n.regime==="3"?"Simples Nacional - ME/EPP, conforme XML":n.regime==="2"?"Simples Nacional - MEI, conforme XML":n.regime==="1"?"Não optante pelo Simples, conforme XML":"Regime não determinado pelo XML";
    return {
      versao_regra:"RTC-BROWSER-2026-v1",nivel,titulo,explicacao,acao,regime_informado:regimeLabel,
      competencia:n.date,campos_ibs_cbs_ausentes:missing,
      verificacao_aritmetica:titulo.startsWith("Ausência")?"Não executada":n.status,
      validacao_assinatura:"Não executada",validacao_xsd:"Não executada",
      calculo_tributario:"Não executado",conformidade_integral:"Não determinada",
      fontes:SOURCES,
      cenario_2027:{conclusao:"A nota de 2026 não contém todos os parâmetros necessários para calcular IBS/CBS em 2027.",
        confirmar_com_contabilidade:[
          "Regime efetivo e eventual opção de recolhimento de IBS/CBS.",
          "Apuração do Simples Nacional, alíquota e dados do PGDAS-D.",
          "CST, classificação tributária e atividade prestada.",
          "Município de incidência e regras do local da prestação.",
          "Versão do leiaute e regras de emissão vigentes em 2027."
        ]}
    };
  }
  async function digest(text){
    const bytes=new TextEncoder().encode(text);
    const hash=await crypto.subtle.digest("SHA-256",bytes);
    return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,"0")).join("");
  }
  async function parse(xml){
    if(typeof xml!=="string"||new TextEncoder().encode(xml).length>5*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error("XML inválido, maior que 5 MiB ou com declaração proibida.");
    const dom=new DOMParser().parseFromString(xml,"application/xml");
    if(dom.getElementsByTagName("parsererror").length)throw Error("XML malformado.");
    const root=dom.documentElement;
    if(root.localName!=="NFSe"||root.namespaceURI!==NS)throw Error("Use uma NFS-e do padrão nacional.");
    const group=findChild(root,"infNFSe");
    if(!group||Array.from(root.children).filter(c=>c.localName==="infNFSe").length!==1)throw Error("É necessário um único infNFSe.");
    const data=Object.fromEntries(Object.entries(FIELDS).map(([k,p])=>[k,getChild(group,p)]));
    if(!data.number||!/^[0-9]{14}$/.test(data.cnpj))throw Error("Número ou CNPJ do emitente inválido.");
    data.id=await digest(group.getAttribute("Id")||data.cnpj+"/"+data.number);
    const fields=["state","city","ibs"].map(k=>qty(data[k]));
    data.expected=data.difference=null;
    const absent=["vIBSUF","vIBSMun","vIBSTot"].filter((_,i)=>fields[i]===null);
    if(absent.length){
      data.status="Dados insuficientes";
      data.reason="Ausente ou inválido no XML: "+absent.join(", ");
    }else{
      data.expected=fields[0]+fields[1];data.difference=fields[2]-data.expected;
      data.status=data.difference?"Divergência":"Valores coincidentes";
      data.reason="IBS declarado menos soma das parcelas estadual e municipal. Escopo: totalização.";
    }
    data.diagnostico=diagnosis(data);
    return data;
  }
  const clientExists=id=>db.clients.some(c=>c.id===id&&c.active);
  const clientNotes=id=>db.notes.filter(n=>id==="pendentes"?!n.client_id:n.client_id===id);
  function notesList(id,period=""){
    return clientNotes(id).filter(n=>!period||n.date.startsWith(period))
      .map(n=>({...clone(n),diagnostico:diagnosis(n)})).reverse();
  }
  function dashboard(items){
    const status={"Valores coincidentes":0,"Divergência":0,"Dados insuficientes":0};
    let gross=0,grossN=0,cbs=0,cbsN=0,ibs=0,ibsN=0,pending=0,compatible=0,review=0;
    const months={};
    for(const n of items){
      if(status[n.status]!==undefined)status[n.status]++;
      const date=String(n.date||"").slice(0,7);
      if(/^\d{4}-\d{2}$/.test(date)){
        const x=months[date]||(months[date]={competencia:date,notas:0,divergencias:0,dados_insuficientes:0});
        x.notas++;x.divergencias+=Number(n.status==="Divergência");x.dados_insuficientes+=Number(n.status==="Dados insuficientes");
      }
      for(const [k,fn] of [["gross",v=>{gross+=v;grossN++;}],["cbs",v=>{cbs+=v;cbsN++;}],["ibs",v=>{ibs+=v;ibsN++;}]]){
        const value=qty(n[k]);if(value!==null)fn(value);
      }
      if(!n.events?.some(e=>e.kind==="Revisão"&&e.data.situacao==="Concluída"))pending++;
      const d=diagnosis(n);compatible+=Number(d.nivel==="informativo"&&d.titulo.startsWith("Ausência"));review+=Number(d.nivel==="revisao");
    }
    return {
      notas:items.length,coincidentes_aritmeticos:status["Valores coincidentes"],
      divergencias:status["Divergência"],dados_insuficientes:status["Dados insuficientes"],revisoes_pendentes:pending,
      ausencias_compativeis_2026:compatible,diagnosticos_a_revisar:review,
      valor_servicos_informado:(gross/100).toFixed(2),valor_servicos_com_valor:grossN,
      cbs_declarada:cbsN?(cbs/100).toFixed(2):null,ibs_declarado:ibsN?(ibs/100).toFixed(2):null,
      cbs_documentos_com_valor:cbsN,ibs_documentos_com_valor:ibsN,
      tributacao_calculada:null,conformidade_fiscal_integral:"Não verificada",
      evolucao:Object.values(months).sort((a,b)=>a.competencia.localeCompare(b.competencia))
    };
  }
  function profile(body){
    const id=String(body.cliente_id||"");
    if(!clientExists(id))throw Error("Selecione um cliente ativo.");
    const values={};
    for(const key of ["receita_12m","receita_prevista_2027","folha_12m","despesas_12m","prolabore_mensal"]){
      const v=body[key];
      if(v===null||v===undefined||v===""){values[key]=null;continue;}
      if(!/^\d+(?:\.\d{1,2})?$/.test(String(v))||Number(v)>999999999999.99)throw Error("Informe valores monetários válidos e não negativos.");
      values[key]=String(v);
    }
    const allowed={regime_confirmado:["nao_confirmado","simples","presumido","real"],
      estrutura_equipe:["nao_informado","so_socios","com_funcionarios"],
      atividade_fator_r:["nao_confirmado","sim","nao"]};
    for(const [key,choices] of Object.entries(allowed)){
      values[key]=String(body[key]||choices[0]);
      if(!choices.includes(values[key]))throw Error("Valor inválido: "+key);
    }
    values.competencia_referencia=String(body.competencia_referencia||"2027-01");
    if(!/^202[67]-(0[1-9]|1[0-2])$/.test(values.competencia_referencia))throw Error("Competência inválida.");
    values.exercicio=2027;
    const next=clone(db);next.profiles[id]={data:values,updated:now()};save(next);
    return {ok:true,dados:values,aviso:"Dados salvos neste navegador. Nenhum imposto foi calculado oficialmente."};
  }
  async function api(path,method,body){
    const url=new URL(path,location.origin);
    const endpoint=url.pathname;
    if(method==="GET"){
      if(endpoint==="/api/clientes")return clone(db.clients).sort((a,b)=>a.name.localeCompare(b.name));
      if(endpoint==="/api/simulacoes/perfil"){
        const id=url.searchParams.get("cliente")||"";
        const record=db.profiles[id];
        return {cliente:id||null,dados:record?.data||null,atualizado:record?.updated||null,
          situacao:"Estimativas informativas. Dados gravados exclusivamente no navegador."};
      }
      if(endpoint==="/api/exemplos")return [];
      if(endpoint==="/api/notas")return notesList(url.searchParams.get("cliente")||"");
      if(endpoint==="/api/dashboard"){
        const period=url.searchParams.get("competencia")||"",perfil=url.searchParams.get("perfil")||"";
        if(period&&!/^\d{4}-\d{2}$/.test(period))throw Error("Competência inválida.");
        if(perfil==="contador"){
          return {perfil:"contador",competencia:period,clientes:db.clients.filter(c=>c.active).map(c=>({
            id:c.id,nome:c.name,cnpj:c.cnpj,...dashboard(notesList(c.id,period))}))};
        }
        const id=url.searchParams.get("cliente")||"";
        return {perfil:"empresario",cliente:id||null,competencia:period,...dashboard(notesList(id,period))};
      }
      throw Error("Recurso não disponível no modo web.");
    }
    if(endpoint==="/api/clientes"){
      const name=String(body.nome||"").trim(),cnpj=digit(body.cnpj);
      if(name.length<3||name.length>150||!/^[0-9]{14}$/.test(cnpj))throw Error("Informe nome e CNPJ válido.");
      if(db.clients.some(c=>c.cnpj===cnpj))throw Error("Já existe cliente com este CNPJ.");
      const entry={id:crypto.randomUUID().replaceAll("-",""),name,cnpj,active:true};
      const next=clone(db);next.clients.push(entry);save(next);
      return {id:entry.id,nome:name,cnpj};
    }
    if(endpoint==="/api/simulacoes/perfil")return profile(body);
    if(endpoint==="/api/importar"){
      const id=String(body.cliente_id||"");
      if(!clientExists(id))throw Error("Selecione o cliente antes de importar.");
      const item=await parse(body.xml);
      if(db.clients.find(c=>c.id===id).cnpj!==item.cnpj)throw Error("CNPJ da nota diferente do cliente selecionado.");
      const existing=db.notes.find(n=>n.id===item.id);
      if(existing){
        if(existing.xml!==body.xml)throw Error("Documento com identificador já existente e conteúdo diferente.");
        if(existing.client_id&&existing.client_id!==id)throw Error("Nota vinculada a outro cliente.");
        if(!existing.client_id){const next=clone(db);next.notes.find(n=>n.id===item.id).client_id=id;save(next);}
        return {importada:false,id:item.id,numero:item.number};
      }
      const next=clone(db);next.notes.push({...item,xml:body.xml,client_id:id,created:now(),events:[]});save(next);
      return {importada:true,id:item.id,numero:item.number};
    }
    if(endpoint==="/api/vincular"){
      const note=db.notes.find(n=>n.id===body.id),c=db.clients.find(c=>c.id===body.cliente_id);
      if(!note||!c||note.cnpj!==c.cnpj||note.client_id&&note.client_id!==c.id)throw Error("Associação não permitida.");
      const next=clone(db);next.notes.find(n=>n.id===body.id).client_id=c.id;save(next);
      return {ok:true};
    }
    if(endpoint==="/api/revisar"){
      const note=db.notes.find(n=>n.id===body.id&&n.client_id===body.cliente_id);
      if(!note)throw Error("Nota não encontrada para o cliente.");
      const event={responsavel:String(body.responsavel||"").trim(),comentario:String(body.comentario||"").trim(),
        situacao:String(body.situacao||"")};
      if(!event.responsavel||!event.comentario||!["Em análise","Concluída","Reaberta"].includes(event.situacao))throw Error("Informe responsável, situação e comentário.");
      const next=clone(db);next.notes.find(n=>n.id===body.id).events.push({kind:"Revisão",data:event,date:now()});save(next);
      return {ok:true};
    }
    if(endpoint==="/api/calcular")throw Error("Motores oficiais exigem backend e não estão disponíveis nesta versão web. Use o CFiscal Python local.");
    if(endpoint==="/api/pdf")throw Error("DANFSe oficial exige backend, não disponível na versão web. O XML original pode ser preservado em backup.");
    throw Error("Recurso não disponível no modo web.");
  }
  window.fetch=async function(input,options={}){
    const method=(options.method||"GET").toUpperCase();
    const target=typeof input==="string"?input:input?.url;
    const url=target?new URL(target,location.href):null;
    if(!url||url.origin!==location.origin||!url.pathname.startsWith("/api/"))return nativeFetch(input,options);
    try{
      return ok(await api(url.pathname+url.search,method,method==="POST"?JSON.parse(options.body||"{}"):null));
    }catch(error){
      return fail(error.message||"Falha ao processar solicitação.");
    }
  };
  function triggerDownload(data,name){
    const blob=new Blob([data],{type:"application/json;charset=utf-8"});
    const uri=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=uri;a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(uri),1000);
  }
  function notice(message){const box=document.getElementById("browserStorageStatus");if(box)box.textContent=message;}
  document.addEventListener("DOMContentLoaded",()=>{
    const section=document.getElementById("browserStorageSettings");
    if(!section)return;
    section.hidden=false;
    const label=document.getElementById("storageModeLabel");
    if(label)label.textContent="Dados neste navegador";
    document.getElementById("browserBackup").onclick=()=>{
      let tasks=[];
      try{const parsed=JSON.parse(localStorage.getItem("cfiscal:agenda:v1")||"[]");if(Array.isArray(parsed))tasks=parsed;}catch(_){}
      triggerDownload(JSON.stringify({exportado_em:now(),...db,agenda_tasks:tasks},null,2),"CFiscal-backup-navegador.json");
    };
    const chooser=document.getElementById("browserRestoreFile");
    document.getElementById("browserRestore").onclick=()=>chooser.click();
    chooser.onchange=async()=>{
      const file=chooser.files?.[0];chooser.value="";
      if(!file)return;
      if(file.size>4*1024*1024){notice("Backup maior que o limite de 4 MiB.");return;}
      try{
        const imported=validateState(JSON.parse(await file.text()));
        if(!window.confirm("Restaurar o backup SUBSTITUI os dados deste navegador. Continue somente se tiver outra cópia dos dados atuais."))return;
        save(imported);
        if(Array.isArray(imported.agenda_tasks)){
          if(imported.agenda_tasks.length>1000)throw Error("Backup contém tarefas em excesso.");
          localStorage.setItem("cfiscal:agenda:v1",JSON.stringify(imported.agenda_tasks));
        }
        location.reload();
      }catch(e){notice("Não foi possível restaurar: "+e.message);}
    };
    document.getElementById("browserClear").onclick=()=>{
      if(!window.confirm("Apagar TODOS os clientes, XMLs, revisões e simulações deste navegador? Exporte antes uma cópia."))return;
      if(!window.confirm("Confirma a exclusão DEFINITIVA dos dados locais?"))return;
      try{localStorage.removeItem(KEY);localStorage.removeItem("cfiscal:agenda:v1");db=empty();location.reload();}catch(e){notice(e.message);}
    };
    const motor=document.getElementById("engine");
    if(motor){
      const btn=motor.querySelector('button[type="submit"],button.primary');
      if(btn){btn.disabled=true;btn.title="Exige backend Python e serviço oficial; indisponível no navegador.";btn.textContent="Motor indisponível na versão web";}
      const msg=document.createElement("p");msg.textContent="Versão web: a consulta ao motor oficial exige backend local. Não há cálculo conectado à Receita Federal.";
      motor.prepend(msg);
    }
    const pdf=document.getElementById("pdf");
    if(pdf){pdf.disabled=true;pdf.title="Disponível somente no CFiscal Python local.";pdf.textContent="DANFSe indisponível no navegador";}
    const demo=document.getElementById("demo");
    if(demo){demo.disabled=true;demo.title="Use XMLs reais no computador ou instale a versão local para acessar exemplos.";demo.textContent="Exemplos disponíveis no Python local";}
    if(window.CFiscalStoreError)notice(window.CFiscalStoreError);
    else notice("Armazenamento exclusivamente local. Faça backup antes de limpar o navegador ou mudar de dispositivo.");
  });
  window.CFiscalBrowserStore={mode:"browser",export:()=>clone(db),parse};
})();
