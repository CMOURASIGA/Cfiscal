# CFiscal | Simulação Tributária 2027 - preparação de dados

## Objetivo
Recolher informações financeiras por cliente no SQLite da instalação local, para posteriormente comparar opções legalmente disponíveis de Simples Nacional, modalidade de recolhimento de IBS/CBS, Lucro Presumido e Lucro Real.

## O que esta versão implementa
- Menu próprio **Simulação tributária** (`/#simulacao`), separado de Cadastro, Notas e Dashboard.
- Campos de receita acumulada em 12 meses, faturamento projetado para 2027, folha dos 12 meses e despesas dos 12 meses.
- Registro manual de regime declarado/confirmado pelo usuário, com opção inicial **Ainda não confirmado**.
- Persistência SQLite em `simulation_profiles`, vinculada ao `client_id`, sem Supabase e sem localStorage para dados fiscais.
- Validação de valores não negativos, até duas casas decimais e vínculo com cliente ativo.
- Comparação de **escopo de cenários**, sem atribuir tributos ou recomendar regime antes de disponibilizar todos os insumos necessários.

## O que ainda não faz
A tela não executa cálculo oficial, não determina RBT12/fator R de maneira tributariamente vinculante, não confirma dados cadastrais junto à Receita, não inclui créditos reais, IRPJ/CSLL nem emite recomendação tributária. Não é aconselhamento fiscal final.

## Motores da aba da nota
- Regime Regular: serviço local porta `8080`, endpoint `/api/calculadora/observabilidade/regime-geral`.
- Simples Nacional: serviço local porta `8082`, endpoint `/api/calculadora/observabilidade/simples-nacional`.
- DANFSe: serviço local porta `8081`, endpoint `/api/danfse`.
- Os serviços devem estar instalados e ativos; consulte `INTEGRACOES.md`.
- O payload da nota é assistido, requer parâmetros fiscais confirmados e pode resultar em cálculo simulado. Não valida assinatura nem aprova documento fiscal integralmente.

## Homologação com nota de referência
1. Escolher cliente no cabeçalho e abrir NFS-e da competência novembro/2026, Simples Nacional, sem IBS/CBS.
2. Confirmar diagnóstico de ausência contextualizada. A seção aritmética deve indicar **Conferência não executada**, não erro.
3. A descrição resumida do serviço não deve expor banco, agência ou conta. A descrição original fica em um bloco fechado com aviso, acessível apenas no ambiente local.
4. Abrir Simulação tributária, preencher dados reais obtidos da contabilidade, salvar e trocar de cliente. Os dados não podem ser transportados de um cliente para outro.
5. Retornar ao cliente inicial e confirmar persistência dos dados.
6. Confirmar que nenhum cálculo ou economia fictícios foram apresentados.
7. Rodar testes: `py -3 -m unittest discover -s tests -v`.

## Planejamento seguinte
- Consultar a versão normativa vigente e a apuração real do Simples para o período;
- Implementar fontes e memória de cálculo por cenário;
- Comparar cenários completos de regime, com prazos de opção e opções de IBS/CBS quando previstas;
- Implantar autenticação e autorização efetiva antes de permitir usuários externos.
