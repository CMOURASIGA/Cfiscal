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
    "classification": DPS + "IBSCBS/valores/trib/gIBSCBS/cClassTrib",
    "cst": DPS + "IBSCBS/valores/trib/gIBSCBS/CST",
}

def cents(value):
    if not re.fullmatch(r"[0-9]{1,15}(?:\.[0-9]{1,2})?", str(value or "")):
        return None
    return int(Decimal(str(value)) * 100)

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
    return data
