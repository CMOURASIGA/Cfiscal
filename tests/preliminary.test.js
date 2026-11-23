"use strict";
const assert=require("node:assert/strict");
const {test}=require("node:test");
const {calculate}=require("../web/preliminary.js");

test("projeção Consult 156 mil: exemplos primeira faixa",()=>{
  const x=calculate("156000","");
  assert.equal(x.monthly,13000);
  assert.equal(x.scenarios.III.monthly,780);
  assert.equal(x.scenarios.V.monthly,2015);
  assert.equal(x.scenarios.III.annual,9360);
  assert.equal(x.scenarios.V.annual,24180);
  assert.equal(x.monthlyDifference,1235);
  assert.equal(x.annualDifference,14820);
  assert.equal(x.bracketAssumed,true);
});
test("RBT12 informado primeira faixa não significa anexo confirmado",()=>{
  const x=calculate("156000","156000");
  assert.equal(x.firstBracketConfirmedByInput,true);
  assert.equal(x.bracketAssumed,false);
});
test("RBT12 acima de 180 mil não confirma primeira faixa",()=>{
  const x=calculate("156000","190000");
  assert.equal(x.bracketAssumed,true);
  assert.equal(x.firstBracketConfirmedByInput,false);
});
test("sem projeção, zero e valores inválidos",()=>{
  assert.equal(calculate("",156000),null);
  assert.equal(calculate(-1,156000),null);
  assert.equal(calculate("abc",156000),null);
  assert.equal(calculate(156000,"abc"),null);
  assert.equal(calculate(0,0).monthly,0);
});
