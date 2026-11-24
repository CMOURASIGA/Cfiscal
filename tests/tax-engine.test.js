"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {RULES,calculate,compare}=require("../web/tax-engine.js");
test("tabelas de 2027 e 2028, primeira faixa da Consult",()=>{
  const x=compare({competence:"2027-01",rbt12:156000,monthlyRevenue:13000});
  assert.equal(x.III.status,"hypothetical");
  assert.equal(x.V.status,"hypothetical");
  assert.equal(x.III.band,1);assert.equal(x.V.band,1);
  assert.equal(x.III.monthlyEstimate,780);assert.equal(x.V.monthlyEstimate,2015);
  assert.equal(x.difference,1235);assert.equal(x.differenceAnnualized,14820);
  assert.match(RULES.sources.III,/senado/);
});
test("faixa 2 e calculo aliquota efetiva com deducao",()=>{
  const r=calculate({competence:"2027-05",annex:"III",rbt12:300000,monthlyRevenue:18000});
  assert.equal(r.band,2);
  assert.equal(r.deduction,9360);
  assert.equal(r.nominalPct,11.2);
  assert.equal(r.effectivePct,8.08);
  assert.equal(r.monthlyEstimate,1454.4);
  const v=calculate({competence:"2027-05",annex:"V",rbt12:300000,monthlyRevenue:18000});
  assert.equal(v.deduction,4500);assert.equal(v.effectivePct,16.5);assert.equal(v.monthlyEstimate,2970);
});
test("sexto intervalo 2027 diferente do historico",()=>{
  const iii=calculate({competence:"2027-11",annex:"III",rbt12:4000000,monthlyRevenue:100000});
  assert.equal(iii.nominalPct,32.9);
  const v=calculate({competence:"2027-11",annex:"V",rbt12:4000000,monthlyRevenue:100000});
  assert.equal(v.nominalPct,30.4);
});
test("regra nao fornece DAS quando faltam dados ou periodo",()=>{
  assert.equal(calculate({rbt12:"",monthlyRevenue:13000}).status,"missing_inputs");
  assert.equal(calculate({rbt12:5000000,monthlyRevenue:13000}).status,"out_of_range");
  assert.equal(calculate({rbt12:156000,monthlyRevenue:13000,competence:"2033-01"}).status,"unsupported_period");
  assert.equal(calculate({rbt12:-100,monthlyRevenue:13000}).status,"missing_inputs");
});
test("fator R informa anexo apenas quando aplicabilidade e folha foram fornecidas",()=>{
  const r=calculate({rbt12:156000,monthlyRevenue:13000,annex:"V",factorRApplicable:true,payroll12:0});
  assert.equal(r.factorR,1);assert.equal(r.factorRAnnex,"V");assert.equal(r.compatibleWithFactorR,true);
  const u=calculate({rbt12:156000,monthlyRevenue:13000,annex:"III",factorRApplicable:null,payroll12:0});
  assert.equal(u.factorRAnnex,null);
  const f=calculate({rbt12:156000,monthlyRevenue:13000,annex:"III",factorRApplicable:true,payroll12:50000});
  assert.equal(f.factorRAnnex,"III");
});
