# CFiscal | Evolução fiscal 2027 | Plano de implementação

Versão do plano: 2026-11-24. Branch de homologação: `develop`. Não alterar `main` sem autorização.

## Visão de produto

O CFiscal atende duas personas:
- **Empresário:** valor estimado, motivo, riscos fiscais, impactos em preço e margem, tarefas e relatório executivo.
- **Contador:** carteira, triagem de XMLs, rastreabilidade, memória de cálculo, pendências e relatório técnico.

O motor tributário deve operar **separado da apresentação** e do armazenamento. Cálculo exploratório, cálculo parametrizado e apuração oficial são status distintos. Nenhum resultado poderá ser rotulado "imposto devido" quando não houver dados e fonte suficientes.

## Entrega atual: primeira versão funcional da arquitetura de produto

| Trilha | Feito | Limitação / próximo avanço |
|---|---|---|
| Motor de regras | `web/tax-engine.js`, versões para 2027–2028, Anexos III/V e fórmula de alíquota efetiva | Precisa ampliar para exceções, atividades, receitas segregadas, repartição e integração com a apuração oficial |
| Simulação | Memória de cálculo com RBT12, receita, faixa, nominal, parcela dedutível e referência legal | Hipótese, não DAS oficial. Não calcula IBS/CBS em regime regular |
| Auditoria XML | Tela por cliente com diagnóstico contextual e priorização | Não executa validação criptográfica, XSD ou consulta de autorização NFS-e |
| Central do contador | Consolidado por empresa, pendências e navegação por cliente | Sem acesso multiusuário/autorização, pois dados estão no navegador |
| Impacto financeiro | Sensibilidade de preço necessário com custo, margem e hipóteses do Simples | Não incorpora tributos externos ao DAS, volume, caixa real ou crédito fiscal |
| Agenda tributária | Prazos oficiais de referência e tarefas manuais por empresa | Não há notificações programadas nem verificação automática de mudanças normativas |
| Relatórios | Modos Empresário/Contador, impressão e exportação JSON | Não é laudo nem documento oficial; PDF depende da função imprimir do navegador |
| Banco | LocalStorage na Vercel; SQLite preservado no ambiente Python | Não há sincronização, backup central ou RLS |

## Critérios de homologação da versão Vercel

1. Selecionar o domínio fixo `cfiscal-preview.vercel.app`; não alternar domínio durante a validação.
2. Verificar `Clientes`, cadastrar um CNPJ sintético, importar XML sintético correspondente; reimportação não deve duplicar.
3. Validar diagnósticos em `Auditoria fiscal`, abrir a NFS-e correspondente; classificar falhas sem afirmar conformidade integral.
4. Em `Simulação tributária`, informar competência, RBT12, projeção e premissas. A memória de cálculo para 2027–2028 deve indicar versão, faixa, dedução e alíquota efetiva.
5. Em `Central do contador`, conferir totais e abrir documentos de clientes diferentes sem misturar notas.
6. Em `Impacto financeiro`, preencher custos/margem; verificar aviso quando algum dado estiver ausente, e a fórmula exibida.
7. Em `Agenda tributária`, criar e concluir tarefa; recarregar e confirmar persistência.
8. Em `Relatórios`, gerar ambos os formatos, imprimir e exportar JSON. Validar fontes, documentos e ressalvas.
9. Em `Clientes`, exportar backup JSON; restaurar em ambiente de teste; confirmar que tarefas da agenda são preservadas.
10. Confirmar comportamento mobile, acessibilidade, menus e ausência de dados sintéticos indevidamente rotulados como reais.

## Sprints técnicas posteriores (não incluídas como concluídas)

### Sprint A: Apuração integral do Simples Nacional
- Tratar abertura de atividade, segregação de receitas, retenções, atividades simultâneas, ISS fixo ou retido, sublimites, Fator R completo e repartição 2027.
- Conciliar com PGDAS-D de referência.
- Suite de casos oficiais por competência, com cálculo centavo a centavo.
- Aceite: memória de cálculo reproduz casos oficiais aplicáveis, com margem de arredondamento documentada.

### Sprint B: Validação oficial e consultoria fiscal
- Validar XSD conforme esquema oficial versionado; assinatura XMLDSig e situação autorizada/cancelada.
- CST, cClassTrib, NBS, município, regime e códigos de serviço segundo regras por competência.
- Fluxo de correção assistida sem editar XML assinado.
- Aceite: identificar e explicar erros reproduzíveis, com evidências e fontes legais.

### Sprint C: Comparação tributária abrangente
- Implementar Lucro Presumido e Real com bases próprias, IRPJ/CSLL, créditos, folha, ISS, CBS/IBS e todos os encargos aplicáveis.
- Definir efeitos da opção de IBS/CBS dentro/fora do Simples e respectivos prazos.
- Aceite: relatórios só exibem diferenças financeiras quando modelos completos e comparáveis estão validados.

### Sprint D: Produto SaaS com Supabase
- Auth e autorização por empresa e perfil, RLS, Storage privado para XML, logs de acesso e trilha de auditoria.
- Migração idempotente do navegador/SQLite, com hash, CNPJ e deduplicação; reconciliação, rollback, backup.
- Aceite: nenhum usuário lê dados de outra empresa; revogação de acesso efetiva nas APIs e interface.

### Sprint E: Integração e observabilidade
- Conectar serviços fiscais oficiais por backend autenticado, gerenciar credenciais e quotas, rastrear versão de regra.
- Alertas de prazo, revisão, alterações normativas e execução agendada.
- Aceite: logs sem dados sigilosos, reprocessamento seguro e testes de indisponibilidade.

### Sprint F: Comercialização e governança
- Onboarding Empresário/Contador, termos de uso e privacidade, exportação, SLA e gestão de planos.
- LGPD, consentimento, retenção, exclusão, auditoria, documentação operacional e treinamento.
- Aceite: checklist de segurança e privacidade concluído antes de receber dados de terceiros em produção.

## Matriz de dependências e diretrizes

- O `localStorage` é um mecanismo temporário, limitado ao navegador. **Não utilizar como banco compartilhado**.
- O backend Python local e SQLite permanecem intocados.
- Vercel estática serve para homologação individual, não plataforma multiusuário pronta.
- Não publicar XMLs reais, chaves, banco SQLite, arquivos de backup ou logs contendo informações pessoais no GitHub.
- Os relatórios devem diferenciar `informado`, `calculado hipotético`, `revisão necessária` e `validado oficialmente`.

## Referências oficiais de base
- RFB Resolução CGSN 196/2026: https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/novembro/comite-gestor-do-simples-nacional-publica-novas-regras-para-o-simples-nacional-e-para-a-transicao-da-reforma-tributaria
- Anexo III 2027–2028 Senado: https://legis.senado.gov.br/norma/40180341/publicacao/40181117
- Anexo V 2027–2028 Senado: https://legis.senado.gov.br/norma/40180341/publicacao/40181129
- Opções para 2027 RFB: https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/setembro/simples-nacional-2027-entenda-os-novos-prazos-e-faca-sua-escolha-com-consciencia-e-tranquilidade
