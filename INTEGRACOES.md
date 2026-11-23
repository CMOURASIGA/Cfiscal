# Serviços da Receita

O fluxo de lote, impressão da ficha e revisão funciona offline. Para calcular CBS e IBS com os motores ou baixar o DANFSe, execute os serviços oficiais na mesma máquina. O CFiscal envia as informações às portas locais indicadas abaixo.

| Serviço e origem | Revisão fixada | Porta e rota POST |
| --- | --- | --- |
| [Regime Regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular) | f1eebd7ce3157423b1a6aaca7dc1d6c3395452c4 | 8080 /api/calculadora/observabilidade/regime-geral |
| [Simples Nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional) | a926d5a76095ac0295a6612a9a54db7ffead2396 | 8082 /api/calculadora/observabilidade/simples-nacional |
| [Gerador DANFSe](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse) | 8d79e6b2f7fad6375340afcb51c85ed370c64a14 | 8081 /api/danfse |

## Preparar e executar no Windows

Instale Git e Python. Para as calculadoras, instale JDK 25 e configure JAVA_HOME e PATH. Para o DANFSe, instale Go 1.27 ou superior. A primeira execução baixa fontes e dependências. Verifique as versões com git --version, java -version e go version. Mantenha livres as portas da tabela.

Na pasta do CFiscal, execute cada comando em uma janela separada. Na primeira instalação aguarde o Regular terminar a preparação antes de iniciar o Simples, pois o segundo usa os scripts Flyway do primeiro.

~~~powershell
py -3 motores.py regular
~~~

~~~powershell
py -3 motores.py simples
~~~

~~~powershell
py -3 motores.py pdf
~~~

O auxiliar usa as revisões indicadas acima, o Maven Wrapper oficial e o perfil offline. Inicializa o SQLite de cada calculadora com Flyway. A pasta motores é local e fica fora do versionamento. No Linux/macOS troque py -3 por python3. Para encerrar um serviço, use Ctrl+C em sua janela.

## Validar de ponta a ponta

1. Na nota 101, abra **Motores** e selecione **Regime Regular**. As sugestões para esse XML reproduzem o exemplo de educação do repositório oficial, com base de R$ 1.200. Confirme os dados e execute. O vetor publicado prevê **CALCULO_SIMULADO**, CBS R$ 42,24 e IBS R$ 0,48. As alíquotas são premissas da amostra. O valor de 2027 depende dos parâmetros fornecidos.
2. Repita com a nota 102. A comparação com o mesmo vetor deve apontar diferença de R$ 1,00 no IBS e zero na CBS.
3. Na nota 201, use **Simples Nacional**. O caso de referência do teste oficial usa NFS-e (tpDoc 91), CRT 1, atividade 07, classificação 000001, base R$ 1.000, IS zero, IBS 1,25% e CBS 2,75%. Os totais esperados do motor são R$ 12,50 e R$ 27,50. A soma das parcelas do XML continua pendente porque falta a parcela municipal. São verificações independentes.
4. Após cada consulta, expanda o registro no rodapé da aba para ver parâmetros, resposta, estado do item e aviso de simulação. O CFiscal conserva o retorno por item, inclusive quando a API responde HTTP 200 com estado de erro.
5. Para o DANFSe, importe um XML nacional completo de homologação e clique em **Baixar DANFSe em PDF**. O servidor envia o XML ao gerador. O aceite exige um PDF legível com os dados correspondentes à nota. Os XMLs reduzidos do ZIP servem à conferência e podem ser recusados pelo gerador ou produzir campos vazios.
6. Desligue o motor e repita. A tela deve apresentar a falha da integração e preservar a revisão da nota.

Para XMLs de terceiros, confirme o regime e os dados da operação. Somente arquivos idênticos aos exemplos do pacote recebem sugestões de alíquotas. Na interface inicial o cálculo assistido contempla uma operação de serviço com um item, os campos exibidos e os dois tributos comparados. Compras governamentais, tratamentos especiais, classificação automática, consulta de tabelas, base recalculada a partir de todas as deduções e assinatura/XSD integral são escopos futuros.

## Referências de contrato

- [Exemplos e retornos de Regime Regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/blob/f1eebd7ce3157423b1a6aaca7dc1d6c3395452c4/docs/exemplos.md)
- [Teste de referência NFS-e do Simples Nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/blob/a926d5a76095ac0295a6612a9a54db7ffead2396/src/test/java/br/gov/serpro/rtc/testesintegracao/simplesnacional/SimplesNacionalControllerTest.java)
- [Contrato HTTP do gerador DANFSe](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse/blob/8d79e6b2f7fad6375340afcb51c85ed370c64a14/README.md)
- [Leiaute de grupos e totalizadores da NFS-e nacional](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-005-se-cgnfse-novo-layout-rtc.pdf)
