"""Leitura do recorte nacional e conferência aritmética em centavos."""
import hashlib
import re
from decimal import Decimal
from xml.etree import ElementTree as ET

NS = "http://www.sped.fazenda.gov.br/nfse"
TOTAL = "IBSCBS/totCIBS/"
DPS = "DPS/infDPS/"
PATHS = {
    "number": "nNFSe", "company": "emit/xNome", "cnpj": "emit/CNPJ",
    "date": DPS + "dCompet", "service": DPS + "serv/cServ/xDescServ",
    "nbs": DPS + "serv/cServ/cNBS", "regime": DPS + "prest/regTrib/opSimpNac",
    "gross": DPS + "valores/vServPrest/vServ",
    "base": "IBSCBS/valores/vBC", "cbs": TOTAL + "gCBS/vCBS",
    "ibs": TOTAL + "gIBS/vIBSTot", "state": TOTAL + "gIBS/gIBSUFTot/vIBSUF",
    "city": TOTAL + "gIBS/gIBSMunTot/vIBSMun",
    "regime_apuracao_simples": DPS + "prest/regTrib/regApTribSN",
    "codigo_servico": DPS + "serv/cServ/cTribNac",
    "percentual_tributos_simples": DPS + "valores/trib/totTrib/pTotTribSN",
    "classification": DPS + "IBSCBS/valores/trib/gIBSCBS/cClassTrib",
    "cst": DPS + "IBSCBS/valores/trib/gIBSCBS/CST",
}

def cents(value):
    if not re.fullmatch(r"[0-9]{1,15}(?:\.[0-9]{1,2})?", str(value or "")):
        return None
    return int(Decimal(str(value)) * 100)


# Regras conservadoras e versionadas para orientar a análise, não homologar a NFS-e.
RULE_VERSION = "RTC-SN-2026-11-v1"
SOURCE_NFSE = "https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026/"
SOURCE_GUIDE = "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/documentacao-atual"
SOURCE_PGDAS = "https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/novembro/pgdas-d-e-atualizado-para-atender-a-reforma-tributaria-a-partir-de-novembro-de-2026/"

def contextual_diagnosis(data):
    """Interpretação delimitada por competência e regime presentes no XML."""
    date = str(data.get("date") or "")
    regime = str(data.get("regime") or "")
    missing = [key for key in ("cbs", "ibs", "state", "city") if cents(data.get(key)) is None]
    details = []
    sources = [{"titulo":"RFB: NFS-e e Simples Nacional em novembro/2026","url":SOURCE_NFSE},
               {"titulo":"Portal NFS-e: documentação técnica de produção","url":SOURCE_GUIDE}]
    if regime == "3":
        regime_label = "Simples Nacional - ME/EPP, conforme XML"
    elif regime == "2":
        regime_label = "Simples Nacional - MEI, conforme XML"
    elif regime == "1":
        regime_label = "Não optante pelo Simples Nacional, conforme XML"
    else:
        regime_label = "Regime não determinado pelo XML"
    if date.startswith("2026-") and regime in ("2","3") and len(missing) == 4:
        level="informativo"
        title="Ausência de IBS/CBS compatível com a transição de 2026"
        explanation=("Para o optante do Simples Nacional, o preenchimento dos grupos de IBS/CBS "
                     "na NFS-e segue cronograma próprio, com efeitos a partir de 2027. "
                     "O XML não traz esses valores; isso, isoladamente, não é erro em 2026.")
        action="Confirmar enquadramento e autenticidade com a contabilidade; não acrescentar IBS/CBS à nota de 2026 apenas por estarem ausentes."
        details.append("A conferência aritmética do IBS não foi executada por ausência de valores.")
    elif data.get("status") == "Divergência":
        level="atencao"
        title="Divergência na totalização do IBS declarado"
        explanation="O total do IBS difere da soma das parcelas estadual e municipal no XML."
        action="Conferir campos originais e classificação da operação com o responsável fiscal; não alterar a NFS-e assinada."
    elif data.get("status") == "Valores coincidentes":
        level="informativo"
        title="Totalização do IBS coincidente"
        explanation="A soma aritmética das parcelas coincide com o IBS declarado. Alíquotas, classificação, vigência e tributo devido não foram validados."
        action="Verificar a regra fiscal e, quando aplicável, executar cálculo no motor oficial."
    elif date >= "2027-01-01" and regime in ("2","3") and missing:
        level="revisao"
        title="IBS/CBS ausentes em documento de 2027 ou posterior"
        explanation="O preenchimento para optantes do Simples passa a observar exigências de 2027. O XML isolado não permite determinar todas as exceções e modalidades de recolhimento."
        action="Confirmar opção de IBS/CBS, classificação e período com o contador, consultar PGDAS-D e leiaute vigente antes de preparar nova emissão."
        sources.append({"titulo":"RFB: PGDAS-D e reforma tributária","url":SOURCE_PGDAS})
    else:
        level="revisao"
        title="Análise tributária contextual ainda não conclusiva"
        explanation="Não foi possível concluir a aplicabilidade de todos os campos com as informações atualmente disponíveis."
        action="Confirmar competência, enquadramento, operação e normas aplicáveis com o contador."
    return {
        "versao_regra":RULE_VERSION, "nivel":level, "titulo":title,
        "explicacao":explanation, "acao":action, "regime_informado":regime_label,
        "competencia":date, "campos_ibs_cbs_ausentes":missing,
        "verificacao_aritmetica":data.get("status") or "Não executada",
        "validacao_assinatura":"Não executada",
        "validacao_xsd":"Não executada",
        "calculo_tributario":"Não executado",
        "conformidade_integral":"Não determinada",
        "observacoes":details, "fontes":sources,
    }

def parse(xml):
    if len(xml.encode()) > 5 * 1024 * 1024 or "<!DOCTYPE" in xml or "<!ENTITY" in xml:
        raise ValueError("Arquivo excede 5 MiB ou contém declaração XML não aceita.")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise ValueError("XML malformado. Confira o arquivo de origem.") from exc
    if root.tag != "{%s}NFSe" % NS:
        raise ValueError("Leiaute não atendido. Importe uma NFSe do padrão nacional.")
    for node in root.iter():
        if node.tag.startswith("{" + NS + "}"):
            node.tag = node.tag.split("}", 1)[1]
    notes = root.findall("infNFSe")
    if len(notes) != 1:
        raise ValueError("Esperado um único grupo infNFSe.")
    note = notes[0]
    data = {k: (note.findtext(p) or "").strip() for k,p in PATHS.items()}
    if not data["number"] or not re.fullmatch(r"\d{14}", data["cnpj"]):
        raise ValueError("Número da nota ou CNPJ do emitente ausente ou inválido.")
    data["id"] = hashlib.sha256((note.get("Id") or (data["cnpj"] + "/" + data["number"])).encode()).hexdigest()
    parts = [cents(data[key]) for key in ("state", "city", "ibs")]
    data["expected"] = data["difference"] = None
    missing = [name for name, v in zip(("vIBSUF", "vIBSMun", "vIBSTot"), parts) if v is None]
    if missing:
        data.update(status="Dados insuficientes", reason="Ausente ou inválido no XML: " + ", ".join(missing))
    else:
        expected = parts[0] + parts[1]
        difference = parts[2] - expected
        data.update(expected=expected, difference=difference,
                    status="Divergência" if difference else "Valores coincidentes",
                    reason="IBS declarado menos a soma do IBS estadual e municipal. Escopo: totalização do IBS.")
    data["diagnostico"] = contextual_diagnosis(data)
    return data
