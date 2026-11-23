# CFiscal | Piloto de conferência

## Usuários e decisões

O analista fiscal recebe XMLs, seleciona uma empresa e competência e prioriza divergências ou dados ausentes. Registra as providências na aba Revisão. O gestor recebe a ficha interna de conferência e o CSV filtrado. Um cliente externo ainda recebe arquivos exportados pelo operador. A versão local não permite conceder um login externo.

## Padrões Consult Services

O catálogo é uma vitrine de padrões e inclui arquivos reutilizáveis específicos. O CFiscal incorpora os arquivos consult-tabs.css e consult-tabs.js do catálogo na revisão f443f5ab3c2018565678844fe1e6266b1a6be4cd. Eles controlam as abas do detalhe, foco e navegação pelo teclado. Sidebar, indicadores, estados vazios, feedback de importação, drawer com Escape e labels visíveis seguem referências funcionais do catálogo. O ícone CFiscal é uma proposta local sujeita à aprovação visual.

[Catálogo de componentes](https://github.com/CMOURASIGA/componentes_consult_services/tree/f443f5ab3c2018565678844fe1e6266b1a6be4cd)

## Marcos para a validação do SaaS

| Marco | Entrega proposta | Evidência de aceite |
| --- | --- | --- |
| Homologação local | Fila, importação, detalhe, histórico e integrações | Executar os cenários do README e INTEGRACOES; guardar relatório dos três motores |
| Piloto fiscal | Uma competência já revisada, dois CNPJs e um contador responsável | Comparar nota a nota com o fechamento. Medir tempo por lote, alertas relevantes e percentual sem dados suficientes |
| Cobertura de leiautes | Amostras anonimizadas dos ERPs dos pilotos, regras por versão, consulta dos catálogos oficiais | Contador aprova cada caso de referência e cada rejeição esperada |
| Produto multiempresa | Integração ao Access Management Service, papéis por empresa e licença, isolamento de arquivos e histórico | Testes de leitura, edição e exportação entre empresas e perfis; restauração de backup demonstrada |
| Operação comercial | Processamento em fila, controle de versões dos motores, retenção definida com o cliente e medição de uso | Reprocessar um lote com referência conhecida, identificar o motor e a base efetivamente usados; validar cobrança com o escritório |

## Critério do primeiro piloto

Registrar quantidade de notas recebidas, tempo antes/depois, quantas divergências viraram ações e quais campos o analista precisou completar. A decisão de ampliar o produto depende do benefício observado e da validação do responsável fiscal.
