# CFiscal

Aplicação local do CFiscal para conferir notas fiscais de serviços e organizar sua revisão, independentemente da empresa emitente. Esta entrega cobre o posto de trabalho de um analista, com várias empresas e persistência em SQLite.

## Começar no Windows

1. Extraia **toda** a pasta do ZIP em um diretório gravável, como `C:\Projetos\CFiscal`.
2. Com Python 3.10 ou superior instalado, abra **Iniciar-CFiscal.cmd**. Alternativa no PowerShell, a partir da pasta extraída: `py -3 server.py --abrir`.
3. Abra **http://127.0.0.1:8765**. A janela do terminal deve ficar aberta durante o uso.
4. Clique em **Carregar exemplos**. Para simular o recebimento do cliente, use **Importar XMLs** e selecione os arquivos 301, 302 e 303 da pasta **importar**. A aplicação identifica repetições.

No macOS ou Linux, execute `python3 server.py --abrir`. Não há instalação de pacotes Python nem dependência de Docker. A pasta dados é criada na primeira execução. Para usar outra porta no PowerShell, defina `$env:CFISCAL_PORT="8766"` antes de iniciar.

## Roteiro de homologação com resultado esperado

| Passo | O que verificar |
| --- | --- |
| Carregar os três XMLs sintéticos | 3 notas, 2 empresas, 1 resultado em cada categoria |
| Abrir 101 | IBS declarado R$ 0,48, estadual R$ 0,24 e municipal R$ 0,24. Diferença R$ 0,00 |
| Abrir 102 | IBS declarado R$ 1,48. Soma R$ 0,48. Diferença positiva de R$ 1,00 |
| Abrir 201 | Dados insuficientes. A tela identifica a ausência de vIBSMun. O campo ausente não vira zero |
| Após carregar exemplos, importar a pasta importar | Entram mais 3 notas. O recibo permite abrir cada nota. Repetir informa 3 já na fila e preserva o histórico |
| Filtrar pela Escola Horizonte e março de 2027 | Notas 101 e 102. Exportar CSV inclui essas duas linhas |
| Registrar revisão da 102 | Informe responsável, comentário e situação. Feche o programa e abra novamente. O histórico continua disponível e a diferença permanece visível |
| Importar o mesmo lote outra vez | Três duplicadas, quantidade de notas inalterada. Alterar o valor mantendo o identificador gera conflito explícito |
| Imprimir conferência | Ficha interna com empresa, valores e diferença. O navegador permite salvar em PDF |
| Testar calculadoras e DANFSe | Siga INTEGRACOES.md. O DANFSe é solicitado ao serviço da Receita. A ficha de conferência é gerada pelo CFiscal |

Os XMLs usam o namespace nacional e um subconjunto dos campos. São fictícios, reduzidos, sem assinatura e sem validação XSD integral. A importação também aceita XML de NFS-e nacional em UTF-8 com raiz NFSe, grupo infNFSe, CNPJ do emitente e número. Outros modelos como ABRASF, NF-e e lotes envelopados demandam adaptadores. O enquadramento, a alíquota aplicável, a autorização de emissão e a apuração completa ficam fora da conferência aritmética. Ausência de dados fiscais ou erros no motor aparecem como pendências.

## O que fica registrado

O servidor atende somente em loopback. A base local contém XML original, resultado por nota, revisões e entradas e respostas dos motores acionados com sucesso. Acesso ao arquivo e backup são de responsabilidade do operador local. Com o programa fechado, copie dados/cfiscal.db para guardar uma cópia. Use os XMLs sintéticos ao compartilhar o projeto. Os filtros por empresa organizam a fila de um operador. O controle de acesso por empresa pertence à próxima etapa do SaaS.

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| fiscal.py | Leitura do recorte nacional, comparação monetária em centavos |
| server.py | Servidor local, persistência, importação e comunicação com os três serviços |
| web/ | Interface do analista e impressão da ficha |
| web/componentes/ | CSS e JavaScript das abas RT-018 reutilizados do catálogo Consult Services |
| motores.py | Preparação das revisões oficiais fixadas e inicialização opcional |
| exemplos/ | XMLs sintéticos para homologação |
| tests/ | Testes com SQLite temporário e serviços HTTP de teste |
| INTEGRACOES.md | Contratos, versões, instalação e critérios de aceite dos motores |
| PRODUTO.md | Escopo do piloto, catálogo visual e próximos marcos do SaaS |

Execute `py -3 -m unittest discover -s tests -v` no Windows ou `python3 -m unittest discover -s tests -v` no Linux/macOS.

Ajuda fiscal está disponível no menu principal e pode ser consultada offline. Ao atualizar, encerre o CFiscal e copie a pasta dados da instalação anterior para a nova pasta do programa antes de iniciar.
