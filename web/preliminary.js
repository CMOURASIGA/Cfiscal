"use strict";
/* Referência demonstrativa: LC 123/2006, Anexos III e V, primeira faixa,
   inclusive tabelas vigentes para 2027. Não substitui apuração PGDAS-D. */
(function(root){
  const FIRST_BRACKET_LIMIT=180000;
  const RATES=Object.freeze({III:0.06,V:0.155});
  function calculate(annualProjection, rbt12){
    if(annualProjection===null || annualProjection===undefined || annualProjection==="")return null;
    const annual=Number(annualProjection),twelve=rbt12===null||rbt12===undefined||rbt12===""?null:Number(rbt12);
    if(!Number.isFinite(annual)||annual<0||(twelve!==null&&(!Number.isFinite(twelve)||twelve<0)))return null;
    const monthly=annual/12;
    const scenarios=Object.fromEntries(Object.entries(RATES).map(([name,rate])=>[name,{rate,monthly:Math.round(monthly*rate*100)/100,annual:Math.round(annual*rate*100)/100}]));
    const withinBracket=twelve!==null&&twelve>0&&twelve<=FIRST_BRACKET_LIMIT;
    return {
      annual,monthly,scenarios,
      monthlyDifference:scenarios.V.monthly-scenarios.III.monthly,
      annualDifference:scenarios.V.annual-scenarios.III.annual,
      firstBracketConfirmedByInput:withinBracket,
      bracketAssumed:!withinBracket,
      source:"https://www2.camara.leg.br/legin/fed/leicom/2006/leicomplementar-123-14-dezembro-2006-548099-normaatualizada-pl.pdf"
    };
  }
  root.CFiscalPreliminary=Object.freeze({calculate});
  if(typeof module!=="undefined"&&module.exports)module.exports={calculate};
})(typeof window!=="undefined"?window:globalThis);
