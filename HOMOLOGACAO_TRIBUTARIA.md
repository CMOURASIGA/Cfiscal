# CFiscal | Homologação de NFS-e real sem publicar dados pessoais

## Como testar uma nota já importada
1. Atualize `develop` na instalação local. Não apague a pasta `dados`.
2. Abra `Clientes` e selecione o emitente previamente cadastrado. Se a nota foi importada antes do cadastro, use `Ver notas sem vínculo` e vincule apenas quando o CNPJ coincidir.
3. Abra a nota na fila. Em `Conferência`, veja o novo **Diagnóstico fiscal contextual** antes da conferência aritmética.
4. Confira regime, competência, versão da regra, justificativa, ação recomendada e fontes oficiais.
5. Expanda **O que precisaria conferir para uma nota equivalente em 2027?**. O checklist é informativo e não cria novo documento.
6. Registre uma revisão e confirme que o histórico foi preservado.
7. Volte ao dashboard. Em notas de 2026 no Simples sem IBS/CBS, deve aparecer a contagem de **Ausência contextualizada**.

## Cenário de referência sem dados identificáveis
- Documento: NFS-e nacional, competência em novembro de 2026
- Regime: `opSimpNac=3` (ME/EPP do Simples Nacional)
- Totalização IBS/CBS: sem grupos no XML
- Resultado: **Ausência de IBS/CBS compatível com a transição de 2026**
- Verificações não realizadas: autenticidade, assinatura digital, XSD completo, apuração tributária devida, regime efetivo fora do XML
- Não equivale a documento fiscal integralmente validado

## Comportamento para 2027
Para competência em 2027 ou posterior, ausência de IBS/CBS no Simples deve sinalizar **Revisão necessária**, sem afirmar automaticamente uma infração. É obrigatório confirmar opção tributária, evento fiscal e regras de leiaute específicas do período. O CFiscal não inventa alíquotas e não modifica um XML autorizado/assinado.

## Limitações de segurança
A aplicação ainda é um piloto **local e monousuário**, sem autenticação individual de empresário/contador. A separação por cliente na UI **não é** uma barreira de acesso para terceiros. Não publique XMLs reais neste repositório. A documentação e testes contêm apenas cenários artificiais.

## Fonte normativa inicial
- https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026/
- https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/documentacao-atual
- https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/novembro/pgdas-d-e-atualizado-para-atender-a-reforma-tributaria-a-partir-de-novembro-de-2026/

Regras adicionais só podem entrar em vigor depois da revisão fiscal, testes e registro de fonte e versão.
