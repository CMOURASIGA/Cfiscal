# CFiscal: versão web temporária com localStorage

## Objetivo
Publicar a interface de homologação na Vercel sem Supabase, preservando o CFiscal Python + SQLite de desenvolvimento local. A Vercel entrega **apenas arquivos estáticos** da pasta `web/`; não publica `server.py`, `dados/cfiscal.db`, XML real do usuário ou segredos.

## Armazenamento e limites
- A versão web é identificada automaticamente quando o hostname não é `localhost` nem `127.0.0.1`.
- Guarda clientes, XMLs importados, vínculo por CNPJ, revisões e perfis financeiros em `localStorage` sob a chave `cfiscal:browser:v1`.
- O navegador pode limpar esses dados a qualquer momento. Use **Clientes > Exportar cópia de segurança (JSON)** após cada sessão de homologação importante. A restauração **substitui** o banco atual e exige confirmação explícita.
- O armazenamento é específico para origem (domínio/subdomínio), navegador e dispositivo. Trocar de domínio da Vercel, usar aba anônima ou outro dispositivo não transfere dados. Não há múltiplos usuários ou permissões.
- Há limite nominal de 4 MiB de JSON e 5 MiB por XML. O teto efetivo depende do navegador. Muitos XMLs podem exceder esse limite.
- Os dados ficam no navegador e **não devem ser usados em dispositivo compartilhado**. Não há criptografia de ponta a ponta, autenticação ou sincronização. Código JavaScript de uma origem tem acesso ao localStorage dessa mesma origem. Não use esta versão como repositório definitivo de notas fiscais.
- O cadastro persistido no SQLite de `C:\Projetos\CFiscal-Homologacao\CFiscal-git\dados\cfiscal.db` **não migra automaticamente** para o navegador. Esse banco fica intacto na versão Python.
- Dados do navegador não são migrados automaticamente para um Supabase futuro. Será necessário um processo de migração validado, com controle de acesso e consentimento.

## Rotinas disponíveis no modo web
| Rotina | Funcionamento |
|---|---|
| Clientes | Cadastro local por nome/CNPJ, prevenção de CNPJ duplicado |
| Importação de XML nacional | Processamento no navegador, checagem de CNPJ, duplicidade, totalização do IBS e diagnóstico contextual informativo |
| Fila e detalhe | Filtro e acompanhamento da nota, revisão local, exportação CSV |
| Dashboard Empresário/Contador | Consolidação descritiva dos XMLs guardados naquele navegador |
| Simulação tributária | Campos, diagnóstico guiado, projeções e exemplos com premissas explicadas |
| Backup/restauração | JSON local com confirmação para substituição, sem envio a servidor |
| Motor oficial IBS/CBS | **Indisponível**, pois exige backend e serviço oficial |
| DANFSe PDF oficial | **Indisponível**, pois exige backend e serviço oficial |
| Validação XSD e assinatura | **Não executada**: importação não é atestado fiscal |

## Implantação na Vercel
- Branch em homologação: `develop`. **Não alterar `main` sem autorização.**
- Framework Preset: **Other**.
- Root Directory: **/**, pasta raiz do repositório.
- Build Command: **sem comando**.
- Output Directory: **web**, definida em `vercel.json`.
- Não usar `server.py` como Vercel Function nem apontar outputDirectory para `/`.
- Publicar primeiro uma URL de **preview** da branch `develop`; não promover a produção até homologação visual e funcional.

## Critérios de aceite na URL de preview
1. Abrir a URL e ler “Dados neste navegador” no cabeçalho.
2. Cadastrar empresa com CNPJ fictício de testes. Atualizar a página: cadastro permanece.
3. Importar um XML **sintético**, com CNPJ correspondente, sem expor dados pessoais.
4. Reimportar o mesmo arquivo: “Já estava na fila”.
5. Abrir nota, revisar, atualizar página: revisão preservada.
6. Ver Dashboard Empresário e Contador com dados locais isolados.
7. Preencher Simulação, salvar, atualizar e conferir dados.
8. Exportar e restaurar backup em navegador de testes; verificar clientes, revisões e perfis.
9. Motores e DANFSe devem permanecer explicitamente indisponíveis, sem erro de API.
10. Verificar layout mobile, menu lateral, ajuda, bloqueio de XML incompatível, isolamento entre clientes, quota e avisos.

## Implantação definitiva
Antes de migrar para um SaaS real, planejar Supabase Auth/RLS, autenticação individual, criptografia em trânsito, retenção/backups, consentimento LGPD, migração idempotente com verificação de hash, isolamento por empresa e ambiente, além de APIs protegidas para motores oficiais. **Não considerar localStorage como banco compartilhado ou definitivo.**
