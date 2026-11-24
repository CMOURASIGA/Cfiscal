"use strict";
/* Simulador determinístico de referência, NÃO apurador PGDAS-D.
 * LC 123/2006 anexos III/V para 2027–2028 conforme LC 214/2025, LC 227/2026.
 * Percentuais de repartição IBS/CBS são informativos, não calculadora da opção regular.
 */
(function(global){
  const RULES=Object.freeze({
    id:"SN-2027-2028-ANEXOS-III-V-v1",
    start:"2027-01",end:"2028-12",verified:"2026-11-24",
    sources:{
      III:"https://legis.senado.gov.br/norma/40180341/publicacao/40181117",
      V:"https://legis.senado.gov.br/norma/40180341/publicacao/40181129",
      guidance:"https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/novembro/comite-gestor-do-simples-nacional-publica-novas-regras-para-o-simples-nacional-e-para-a-transicao-da-reforma-tributaria"
    },
    bands:{
      III:[[180000,.06,0],[360000,.112,9360],[720000,.135,17640],[1800000,.16,35640],[3600000,.21,125640],[4800000,.329,648000]],
      V:[[180000,.155,0],[360000,.18,4500],[720000,.195,9900],[1800000,.205,17100],[3600000,.23,62100],[4800000,.304,540000]]
    },
    shareFirst:{
      III:{IRPJ:4,CSLL:3.5,CBS:15.43,CPP:43.4,ISS:33.5,IBS:.17},
      V:{IRPJ:25,CSLL:15,CBS:16.96,CPP:28.85,ISS:14,IBS:.19}
    }
  });
  const round=v=>Math.round((v+Number.EPSILON)*100)/100;
  const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
  function calculate({rbt12,monthlyRevenue,annex="III",competence="2027-01",factorRApplicable=null,payroll12=null}={}){
    const r=finite(rbt12),m=finite(monthlyRevenue);
    if(!/^(2027|2028)-(0[1-9]|1[0-2])$/.test(competence))
      return {status:"unsupported_period",message:"Motor versionado apenas para 2027 e 2028.",rule:RULES.id};
    if(!RULES.bands[annex])return {status:"unsupported_annex",message:"Anexo fora do escopo do motor.",rule:RULES.id};
    if(r===null||r===0||m===null)return {status:"missing_inputs",missing:[...(r===null||r===0?["RBT12 válido"]:[]),...(m===null?["Receita mensal"]:[])],rule:RULES.id};
    const idx=RULES.bands[annex].findIndex(b=>r<=b[0]);
    if(idx<0)return {status:"out_of_range",message:"RBT12 superior ao limite de R$ 4,8 milhões; verificar elegibilidade ao Simples.",rule:RULES.id};
    const [upper,nominal,deduction]=RULES.bands[annex][idx];
    const rate=round(((r*nominal-deduction)/r)*100)/100; // effective rate in decimal, derived from pct rounded to two digits
    const exactRate=(r*nominal-deduction)/r;
    const monthTotal=round(m*exactRate);
    const factor=finite(payroll12),ratio=factor===null?null:(factor===0?.01:factor/r);
    const eligibility=factorRApplicable===true&&ratio!==null?(ratio>=.28?"III":"V"):null;
    const compatible=eligibility===null?null:eligibility===annex;
    return {
      status:"hypothetical",rule:RULES.id,competence,annex,band:idx+1,upper,
      rbt12:r,monthlyRevenue:m,nominalPct:round(nominal*100),deduction,
      effectivePct:round(exactRate*100),monthlyEstimate:monthTotal,annualizedEstimate:round(monthTotal*12),
      formula:"((RBT12 × alíquota nominal) - parcela a deduzir) ÷ RBT12 × receita do período",
      factorR:ratio===null?null:round(ratio*100),
      factorRAnnex:eligibility,compatibleWithFactorR:compatible,
      allocationFirstBand:idx===0?RULES.shareFirst[annex]:null,
      source:RULES.sources[annex],
      notes:[
        "Valor demonstrativo. Não é DAS oficial e não representa recolhimento real de IBS/CBS pelo regime regular.",
        "Receita do período assumida como uniforme; anexos, folha, atividade, competência, benefícios e segregações podem alterar a apuração.",
        "Parcelas de repartição do DAS não são créditos nem alíquotas adicionais."
      ]
    };
  }
  function compare(input){
    const result={III:calculate({...input,annex:"III"}),V:calculate({...input,annex:"V"})};
    if(result.III.status==="hypothetical"&&result.V.status==="hypothetical"){
      result.difference=round(result.V.monthlyEstimate-result.III.monthlyEstimate);
      result.differenceAnnualized=round(result.difference*12);
    }
    return result;
  }
  global.CFiscalTaxEngine=Object.freeze({RULES,calculate,compare});
  if(typeof module!=="undefined"&&module.exports)module.exports={RULES,calculate,compare};
})(typeof window!=="undefined"?window:globalThis);
