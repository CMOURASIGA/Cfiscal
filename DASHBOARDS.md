# Navegação separada do CFiscal

A interface foi reorganizada em telas independentes, com rotas locais por hash (sem novo backend):
- `/#painel`: Dashboard do empresário/contador
- `/#clientes`: cadastro de empresas e seleção do cliente ativo no cabeçalho
- `/#notas`: importação múltipla, fila, filtros, diagnósticos, revisões e motores por nota em abas
- `/#integracoes`: documentação dos motores locais
- `/ajuda.html`: ajuda fiscal com o mesmo menu

O menu é retrátil e guarda somente a preferência visual no localStorage. O cabeçalho apresenta o cliente selecionado para reutilização entre as telas. Dados fiscais e vínculos permanecem no SQLite local. Não há Supabase nem autenticação multiusuário nessa fase.

## Aceite UX
1. Cada item da navegação abre somente uma tela de rotina (sem rolagem por todos os módulos).
2. Menu recolhe/expande e permanece funcional no celular.
3. Indicadores do dashboard abrem Notas fiscais com o filtro correspondente.
4. Carteira do contador abre a lista de notas do cliente selecionado.
5. Importações e cadastro permanecem funcionais, e a nota mantém abas Conferência, Revisão e Motores.
6. Nenhuma tabela, XML ou cadastro é apagado na atualização.

---

# CFiscal - Dashboards locais por perfil (Sprint 01)

Implementação na branch `develop`, sem dados fictícios no painel.

## Empresário
Selecione um cliente cadastrado para consultar métricas obtidas de `notes`, `note_clients` e `events` no SQLite local. A tela mostra notas importadas, soma dos valores de serviço informados, divergências aritméticas do IBS, campos insuficientes, revisões não concluídas, CBS e IBS declarados. Use o filtro por competência. Clique em uma categoria para abrir a fila correspondente.

A soma de valores de serviços não representa faturamento contábil. CBS/IBS declarados são valores do XML, não cálculo oficial de tributos devidos. A classificação "Valores coincidentes" corresponde exclusivamente à soma aritmética de IBS.

## Contador
Alterne para `Contador`. Consulte a carteira de clientes ativos, notas por cliente, divergências e pendências. Clique em "Abrir notas" para escolher o cadastro correspondente. O perfil altera a apresentação, **não** autentica ou autoriza usuários.

## API
- `GET /api/dashboard?cliente=<id>&competencia=AAAA-MM`: métricas por cliente, sem acesso aos documentos de outros clientes nessa consulta.
- `GET /api/dashboard?perfil=contador&competencia=AAAA-MM`: consolidação da carteira local.
- `GET /api/notas?cliente=<id>&competencia=AAAA-MM`: documentos filtrados, com histórico.

## Restrições e segurança
A aplicação continua monousuária, em loopback. Ainda não existe autenticação/isolamento de usuários. Não compartilhe este servidor com clientes externos. XML original permanece no SQLite local e não é copiado para localStorage ou Supabase. As notas anteriores não vinculadas ficam na fila separada. Regime, vigência legal e cálculos oficiais exigem evolução do motor de conformidade.

## Critérios para homologação
1. Com dois clientes cadastrados e XMLs próprios, o painel do empresário exibe somente as notas do cliente selecionado.
2. O painel do contador consolida ambos e permite abrir o detalhe da carteira.
3. O filtro por competência retorna apenas as notas da competência.
4. Uma nota sem CBS/IBS apresenta valores "Não informado", não R$ 0,00.
5. Após importação em lote, os números são atualizados.
6. As notas antigas sem vínculo não aparecem automaticamente no dashboard de cliente.
7. O sistema não afirma conformidade fiscal integral ou imposto calculado sem motor fiscal aplicado.
8. Antes de iniciar o servidor, executar `py -3 -m unittest discover -s tests -v`; sucesso esperado em todos os testes.

## Próxima entrega
Motor de conformidade contextual por competência, regime, NFS-e nacional e versões normativas; relatórios técnicos; permissões autenticadas antes de disponibilizar a clientes externos.
