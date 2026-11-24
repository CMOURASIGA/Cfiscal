"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const source=fs.readFileSync(path.join(__dirname,"../web/browser-store.js"),"utf8");
function environment(existing=new Map()){
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
    URL,URLSearchParams,Response,TextEncoder,crypto:webcrypto,setTimeout,console
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
