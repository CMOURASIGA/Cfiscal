"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const source=fs.readFileSync(path.join(__dirname,"../web/browser-store.js"),"utf8");
function environment(existing=new Map(),DOMParserClass){
  const localStorage={
    getItem:key=>existing.has(key)?existing.get(key):null,
    setItem:(key,value)=>existing.set(key,String(value)),
    removeItem:key=>existing.delete(key)
  };
  const callbacks={};
  const window={
    fetch:async()=>{throw Error("Unexpected network request");},
    CFiscalStoreError:null
  };
  const context=vm.createContext({
    location:{hostname:"cfiscal.vercel.app",origin:"https://cfiscal.vercel.app",href:"https://cfiscal.vercel.app/"},
    window,localStorage,document:{addEventListener:(name,fn)=>{callbacks[name]=fn;}},
    URL,URLSearchParams,Response,TextEncoder,crypto:webcrypto,setTimeout,console,DOMParser:DOMParserClass
  });
  vm.runInContext(source,context);
  async function call(endpoint,body){
    const response=await window.fetch(endpoint,body===undefined?{}:{method:"POST",body:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  }
  return {call,window,existing,callbacks};
}
test("cadastro de cliente e simulacao exclusivamente local com persistencia",async()=>{
  const store=new Map(),one=environment(store);
  const created=await one.call("/api/clientes",{nome:"Empresa teste",cnpj:"12345678000199"});
  assert.equal(created.status,200);
  const id=created.data.id;
  assert.equal((await one.call("/api/clientes")).data.length,1);
  assert.equal((await one.call("/api/dashboard?cliente="+id)).data.notas,0);
  const saved=await one.call("/api/simulacoes/perfil",{cliente_id:id,regime_confirmado:"simples",
    competencia_referencia:"2027-01",estrutura_equipe:"so_socios",atividade_fator_r:"nao_confirmado",
    receita_12m:"156000",receita_prevista_2027:"156000",prolabore_mensal:"0",folha_12m:"",despesas_12m:""});
  assert.equal(saved.status,200);
  assert.equal(saved.data.dados.prolabore_mensal,"0");
  assert.equal(saved.data.dados.folha_12m,null);
  const another=environment(store);
  assert.equal((await another.call("/api/clientes")).data.length,1);
  assert.equal((await another.call("/api/simulacoes/perfil?cliente="+id)).data.dados.receita_12m,"156000");
});
test("separacao dos clientes e validacao de dados no navegador",async()=>{
  const env=environment();
  const first=(await env.call("/api/clientes",{nome:"Cliente A",cnpj:"12345678000199"})).data.id;
  const second=(await env.call("/api/clientes",{nome:"Cliente B",cnpj:"98765432000120"})).data.id;
  const saved=await env.call("/api/simulacoes/perfil",{cliente_id:first,regime_confirmado:"simples",
    competencia_referencia:"2027-01",estrutura_equipe:"so_socios",atividade_fator_r:"nao_confirmado",
    receita_12m:"156000",receita_prevista_2027:"156000",prolabore_mensal:"0",folha_12m:"",despesas_12m:""});
  assert.equal(saved.status,200);
  assert.equal((await env.call("/api/simulacoes/perfil?cliente="+second)).data.dados,null);
  assert.equal((await env.call("/api/simulacoes/perfil",{cliente_id:first,receita_12m:"-1"})).status,422);
  assert.equal((await env.call("/api/clientes",{nome:"Duplicado",cnpj:"12345678000199"})).status,422);
  assert.equal((await env.call("/api/calcular",{motor:"simples"})).status,422);
  assert.equal((await env.call("/api/pdf",{id:"dummy"})).status,422);
  assert.equal((await env.call("/api/exemplos")).data.length,0);
});
test("adapter nao interfere na API original no Python localhost",()=>{
  const window={fetch:()=>42};
  const context=vm.createContext({window,location:{hostname:"127.0.0.1"}});
  vm.runInContext(source,context);
  assert.equal(window.fetch(),42);
});

function node(localName,text="",children=[]){
  return {localName,namespaceURI:"http://www.sped.fazenda.gov.br/nfse",
    children,textContent:text,getAttribute:(key)=>key==="Id"?"NFSeTest":null};
}
function xmlParser(){
  const leaf=(name,value)=>node(name,value);
  const group=node("infNFSe","",[
    leaf("nNFSe","11"),
    node("emit","",[leaf("xNome","Empresa teste"),leaf("CNPJ","12345678000199")]),
    node("DPS","",[node("infDPS","",[
      leaf("dCompet","2026-11-09"),
      node("prest","",[node("regTrib","",[leaf("opSimpNac","3")])]),
      node("serv","",[node("cServ","",[leaf("xDescServ","Consultoria de software"),leaf("cNBS","115011000")])]),
      node("valores","",[node("vServPrest","",[leaf("vServ","13000.00")])])
    ])])
  ]);
  return class DOMParserFake {
    parseFromString(){return {documentElement:node("NFSe","",[group]),
      getElementsByTagName:()=>[]};}
  };
}
test("importacao XML nacional com CNPJ, duplicidade, diagnostico e dashboard web",async()=>{
  const env=environment(new Map(),xmlParser());
  const id=(await env.call("/api/clientes",{nome:"Empresa teste",cnpj:"12345678000199"})).data.id;
  const xml='<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFSeTest"></infNFSe></NFSe>';
  const imported=await env.call("/api/importar",{cliente_id:id,xml});
  assert.equal(imported.status,200);
  assert.equal(imported.data.importada,true);
  const repeated=await env.call("/api/importar",{cliente_id:id,xml});
  assert.equal(repeated.data.importada,false);
  const notes=(await env.call("/api/notas?cliente="+id)).data;
  assert.equal(notes.length,1);
  assert.equal(notes[0].gross,"13000.00");
  assert.match(notes[0].diagnostico.titulo,/Ausência de IBS\/CBS/);
  const business=(await env.call("/api/dashboard?cliente="+id)).data;
  assert.equal(business.notas,1);
  assert.equal(business.valor_servicos_informado,"13000.00");
  assert.equal(business.ausencias_compativeis_2026,1);
  const review=await env.call("/api/revisar",{id:imported.data.id,cliente_id:id,
    responsavel:"Revisor local",situacao:"Concluída",comentario:"Conferida a nota de teste"});
  assert.equal(review.status,200);
  assert.equal((await env.call("/api/notas?cliente="+id)).data[0].events.length,1);
  const other=(await env.call("/api/clientes",{nome:"Outro cliente",cnpj:"98765432000120"})).data.id;
  assert.equal((await env.call("/api/importar",{cliente_id:other,xml})).status,422);
  assert.equal((await env.call("/api/dashboard?perfil=contador")).data.clientes.length,2);
});
