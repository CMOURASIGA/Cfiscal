"""Servidor monousuário, limitado ao loopback, sem dependências externas."""
import json
import re
import uuid
import os
import sqlite3
import sys
import webbrowser
from datetime import datetime, timezone
from functools import partial
from contextlib import closing
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
from urllib import request, error
from urllib.parse import urlsplit, parse_qs
from fiscal import parse, cents

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get("CFISCAL_DB", ROOT / "dados" / "cfiscal.db"))
ROUTES = {"regular": (8080, "/api/calculadora/observabilidade/regime-geral"),
          "simples": (8082, "/api/calculadora/observabilidade/simples-nacional"),
          "pdf": (8081, "/api/danfse")}
def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def init():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DB)) as db, db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, xml TEXT, data TEXT, created TEXT);
        CREATE TABLE IF NOT EXISTS events (note TEXT, kind TEXT, data TEXT, created TEXT);
        CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, cnpj TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS note_clients (note_id TEXT PRIMARY KEY REFERENCES notes(id), client_id TEXT NOT NULL REFERENCES clients(id), created TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_note_clients_client ON note_clients(client_id);
        """)

def upstream(kind, body, mime):
    port, path = ROUTES[kind]
    req = request.Request(f"http://127.0.0.1:{port}{path}", data=body, headers={"Content-Type": mime})
    opener = request.build_opener(request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=20) as res:
            return res.read(16 * 1024 * 1024), res.headers
    except error.HTTPError as exc:
        detail = exc.read(2000).decode(errors="replace")
        raise ValueError(f"Serviço {kind} respondeu HTTP {exc.code}. {detail}") from exc
    except (OSError, error.URLError) as exc:
        raise ValueError(f"Serviço {kind} indisponível na porta {port}. Consulte INTEGRACOES.md.") from exc

def evaluate(kind, result, data):
    objects = result.get("objetos") if isinstance(result, dict) else None
    if not isinstance(objects, list) or len(objects) != 1:
        return "Resposta sem um resultado individual comparável."
    item = objects[0]
    state = item.get("estadoItem", "")
    if state not in ("CALCULADO", "CALCULO_SIMULADO"):
        return "Item pendente no motor: " + str(state)
    tax = item.get("tribCalc", {})
    if kind == "simples":
        cbs, ibs = tax.get("vCBSSN"), tax.get("vIBSSN")
    else:
        group = tax.get("IBSCBS", {}).get("gIBSCBS", {})
        cbs, ibs = group.get("gCBS", {}).get("vCBS"), group.get("vIBS")
    values = [cents(x) for x in (data["cbs"], cbs, data["ibs"], ibs)]
    if None in values:
        return f"{state} · Dados insuficientes para comparar CBS e IBS."
    return (f"{state} · Diferença (XML menos motor): CBS R$ {(values[0]-values[1])/100:.2f}; "
            f"IBS R$ {(values[2]-values[3])/100:.2f}.")


def dashboard_for(notes):
    """Indicadores descritivos de XMLs; não atestam conformidade fiscal integral."""
    from decimal import Decimal, InvalidOperation
    counts = {"Valores coincidentes": 0, "Divergência": 0, "Dados insuficientes": 0}
    gross = Decimal("0")
    gross_known = 0
    declared_cbs = Decimal("0")
    declared_ibs = Decimal("0")
    cbs_known = ibs_known = 0
    pending_review = 0
    monthly = {}
    for note in notes:
        status = note.get("status")
        if status in counts:
            counts[status] += 1
        date = str(note.get("date",""))[:7]
        if re.fullmatch(r"\\d{4}-\\d{2}",date):
            month = monthly.setdefault(date,{"competencia":date,"notas":0,"divergencias":0,"dados_insuficientes":0})
            month["notas"] += 1
            month["divergencias"] += int(status=="Divergência")
            month["dados_insuficientes"] += int(status=="Dados insuficientes")
        for field in ("gross","cbs","ibs"):
            try:
                val = Decimal(str(note.get(field,"")))
                if not val.is_finite() or val < 0:
                    continue
                if field == "gross":
                    gross += val
                    gross_known += 1
                elif field == "cbs":
                    declared_cbs += val
                    cbs_known += 1
                else:
                    declared_ibs += val
                    ibs_known += 1
            except (InvalidOperation,TypeError):
                pass
        revisions=[e for e in note.get("events",[]) if e["kind"]=="Revisão"]
        if not revisions or revisions[-1]["data"].get("situacao")!="Concluída":
            pending_review += 1
    return {
        "notas":len(notes),
        "coincidentes_aritmeticos":counts["Valores coincidentes"],
        "divergencias":counts["Divergência"],
        "dados_insuficientes":counts["Dados insuficientes"],
        "revisoes_pendentes":pending_review,
        "valor_servicos_informado":str(gross),
        "valor_servicos_com_valor":gross_known,
        "cbs_declarada":str(declared_cbs) if cbs_known else None,
        "ibs_declarado":str(declared_ibs) if ibs_known else None,
        "cbs_documentos_com_valor":cbs_known,
        "ibs_documentos_com_valor":ibs_known,
        "tributacao_calculada":None,
        "conformidade_fiscal_integral":"Não verificada",
        "evolucao":sorted(monthly.values(),key=lambda x:x["competencia"]),
    }

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send_data(self, value, code=200, mime="application/json"):
        body = json.dumps(value, ensure_ascii=False).encode() if mime == "application/json" else value
        self.send_response(code)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        port = self.server.server_port
        hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        origin = self.headers.get("Origin")
        return self.headers.get("Host") in hosts and (not origin or origin in {"http://"+h for h in hosts})

    def do_GET(self):
        if not self.allowed():
            return self.send_error(403)
        path = urlsplit(self.path).path
        if path == "/api/exemplos":
            return self.send_data([{"name":p.name,"xml":p.read_text(encoding="utf8")} for p in sorted((ROOT/"exemplos").glob("*.xml"))])
        if path == "/api/clientes":
            with closing(sqlite3.connect(DB)) as db:
                clients = [dict(id=i,name=n,cnpj=c,active=bool(a)) for i,n,c,a in db.execute("SELECT id,name,cnpj,active FROM clients ORDER BY name")]
            return self.send_data(clients)
        if path in ("/api/notas","/api/dashboard"):
            query = parse_qs(urlsplit(self.path).query)
            client_id = query.get("cliente", [""])[0]
            competencia = query.get("competencia", [""])[0]
            if competencia and not re.fullmatch(r"\\d{4}-\\d{2}",competencia):
                return self.send_data({"error":"Competência inválida."},422)
            with closing(sqlite3.connect(DB)) as db:
                if path == "/api/dashboard" and query.get("perfil",[""])[0] == "contador":
                    company_rows = db.execute("SELECT id,name,cnpj FROM clients WHERE active=1 ORDER BY name").fetchall()
                    clients_dashboard = []
                    for cid,name,cnpj in company_rows:
                        records = db.execute("SELECT n.id,n.data,n.created FROM notes n JOIN note_clients nc ON nc.note_id=n.id WHERE nc.client_id=? ORDER BY n.rowid DESC",(cid,)).fetchall()
                        items = [dict(json.loads(data),events=[]) for _,data,_ in records]
                        by_id = {i:item for (i,_,_),item in zip(records,items)}
                        if by_id:
                            for note_id,kind,event_data,event_time in db.execute("SELECT e.note,e.kind,e.data,e.created FROM events e JOIN note_clients nc ON nc.note_id=e.note WHERE nc.client_id=? ORDER BY e.rowid",(cid,)):
                                if note_id in by_id:
                                    by_id[note_id]["events"].append(dict(kind=kind,data=json.loads(event_data),date=event_time))
                        if competencia:
                            items=[n for n in items if n.get("date","").startswith(competencia)]
                        clients_dashboard.append(dict(id=cid,nome=name,cnpj=cnpj,**dashboard_for(items)))
                    return self.send_data({"perfil":"contador","competencia":competencia,"clientes":clients_dashboard})
                if client_id == "pendentes" and path == "/api/notas":
                    records = db.execute("SELECT n.id,n.data,n.created FROM notes n LEFT JOIN note_clients nc ON nc.note_id=n.id WHERE nc.note_id IS NULL ORDER BY n.rowid DESC").fetchall()
                elif client_id:
                    records = db.execute("SELECT n.id,n.data,n.created FROM notes n JOIN note_clients nc ON nc.note_id=n.id WHERE nc.client_id=? ORDER BY n.rowid DESC",(client_id,)).fetchall()
                else:
                    records = []
                notes = {i:dict(json.loads(data),created=t,events=[],client_id=client_id if client_id!="pendentes" else None) for i,data,t in records}
                for i,kind,data,t in db.execute("SELECT note,kind,data,created FROM events ORDER BY rowid"):
                    if i in notes:
                        notes[i]["events"].append(dict(kind=kind,data=json.loads(data),date=t))
            items=list(notes.values())
            if competencia:
                items=[n for n in items if n.get("date","").startswith(competencia)]
            if path == "/api/dashboard":
                return self.send_data({"perfil":"empresario","cliente":client_id or None,"competencia":competencia,**dashboard_for(items)})
            return self.send_data(items)
        if path.startswith("/api/"):
            return self.send_data({"error":"Recurso desconhecido."},404)
        super().do_GET()

    def do_POST(self):
        if not self.allowed() or self.headers.get_content_type() != "application/json":
            return self.send_error(403)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 8*1024*1024:
                raise ValueError("Tamanho inválido.")
            body = json.loads(self.rfile.read(size))
            with closing(sqlite3.connect(DB, timeout=15)) as db, db:
                if self.path == "/api/clientes":
                    name = str(body.get("nome","")).strip()
                    cnpj = re.sub(r"\\D","",str(body.get("cnpj","")))
                    if len(name)<3 or len(name)>150 or not re.fullmatch(r"\\d{14}",cnpj):
                        raise ValueError("Informe nome (3 a 150 caracteres) e CNPJ com 14 dígitos.")
                    if db.execute("SELECT 1 FROM clients WHERE cnpj=?",(cnpj,)).fetchone():
                        raise ValueError("Cliente já cadastrado com este CNPJ.")
                    client_id = uuid.uuid4().hex
                    db.execute("INSERT INTO clients(id,name,cnpj,created) VALUES (?,?,?,?)",(client_id,name,cnpj,now()))
                    result = {"id":client_id,"nome":name,"cnpj":cnpj}
                elif self.path == "/api/importar":
                    client_id = str(body.get("cliente_id",""))
                    client = db.execute("SELECT cnpj FROM clients WHERE id=? AND active=1",(client_id,)).fetchone()
                    if not client: raise ValueError("Selecione um cliente cadastrado e ativo antes de importar.")
                    xml = body["xml"]
                    data = parse(xml)
                    if data["cnpj"] != client[0]:
                        raise ValueError("O CNPJ do emitente no XML não corresponde ao cliente selecionado. Importação bloqueada.")
                    # Somente amostras idênticas às distribuídas recebem premissas de exemplo.
                    for sample in (ROOT/"exemplos").glob("*.xml"):
                        if xml.replace("\r\n","\n") == sample.read_text(encoding="utf8"):
                            data["sample"] = sample.stem
                            break
                    cur = db.execute("INSERT OR IGNORE INTO notes VALUES (?,?,?,?)", (data["id"],xml,json.dumps(data),now()))
                    if not cur.rowcount:
                        old = db.execute("SELECT xml FROM notes WHERE id=?", (data["id"],)).fetchone()[0]
                        if old != xml:
                            raise ValueError("Já existe uma nota com este identificador e conteúdo diferente.")
                        association = db.execute("SELECT client_id FROM note_clients WHERE note_id=?",(data["id"],)).fetchone()
                        if association and association[0] != client_id:
                            raise ValueError("Esta nota já está vinculada a outro cliente. Operação bloqueada.")
                    db.execute("INSERT OR IGNORE INTO note_clients(note_id,client_id,created) VALUES (?,?,?)",(data["id"],client_id,now()))
                    result = {"importada": bool(cur.rowcount), "id": data["id"], "numero": data["number"]}
                elif self.path == "/api/vincular":
                    client_id = str(body.get("cliente_id",""))
                    client = db.execute("SELECT cnpj FROM clients WHERE id=? AND active=1",(client_id,)).fetchone()
                    row = db.execute("SELECT data FROM notes WHERE id=?",(body.get("id"),)).fetchone()
                    if not client or not row: raise ValueError("Cliente ou nota não encontrado.")
                    if json.loads(row[0])["cnpj"] != client[0]: raise ValueError("O CNPJ da nota não corresponde ao cliente selecionado.")
                    current = db.execute("SELECT client_id FROM note_clients WHERE note_id=?",(body["id"],)).fetchone()
                    if current and current[0] != client_id: raise ValueError("Nota já vinculada a outro cliente.")
                    db.execute("INSERT OR IGNORE INTO note_clients(note_id,client_id,created) VALUES (?,?,?)",(body["id"],client_id,now()))
                    result = {"ok":True}
                else:
                    client_id=str(body.get("cliente_id",""))
                    row = db.execute("SELECT n.xml,n.data FROM notes n JOIN note_clients nc ON nc.note_id=n.id WHERE n.id=? AND nc.client_id=?", (body["id"],client_id)).fetchone()
                    if not row:
                        raise ValueError("Nota não encontrada.")
                    xml, data = row[0], json.loads(row[1])
                    if self.path == "/api/pdf":
                        pdf, _ = upstream("pdf", xml.encode(), "application/xml")
                        if not pdf.startswith(b"%PDF-"):
                            raise ValueError("O serviço não retornou um PDF.")
                        return self.send_data(pdf, mime="application/pdf")
                    if self.path == "/api/revisar":
                        event = {k:str(body.get(k,"")).strip() for k in ("responsavel","comentario","situacao")}
                        if not event["responsavel"] or not event["comentario"] or event["situacao"] not in ("Em análise","Concluída","Reaberta"):
                            raise ValueError("Informe responsável, comentário e situação.")
                        kind = "Revisão"
                    elif self.path == "/api/calcular":
                        kind = body["motor"]
                        if kind not in ("regular","simples"):
                            raise ValueError("Selecione um motor.")
                        payload = body["entrada"]
                        if not isinstance(payload,dict) or len(payload.get("itens",[])) != 1:
                            raise ValueError("A conferência assistida aceita uma operação com um item.")
                        raw, headers = upstream(kind, json.dumps(payload).encode(), "application/json")
                        response = json.loads(raw)
                        event = {"entrada":payload, "resposta":response, "resultado":evaluate(kind,response,data),
                                 "aviso":headers.get("x-warning-dados-simulados",""), "porta":ROUTES[kind][0]}
                    else:
                        return self.send_data({"error":"Recurso desconhecido."},404)
                    db.execute("INSERT INTO events VALUES (?,?,?,?)", (data["id"],kind,json.dumps(event),now()))
                    result = {"ok":True}
            self.send_data(result)
        except (ValueError, KeyError, TypeError, AttributeError, sqlite3.Error) as exc:
            self.send_data({"error":str(exc)},422)

if __name__ == "__main__":
    init()
    http = ThreadingHTTPServer(("127.0.0.1", int(os.getenv("CFISCAL_PORT","8765"))),partial(Handler,directory=str(ROOT/"web")))
    url = f"http://127.0.0.1:{http.server_port}"
    print("CFiscal disponível em", url, flush=True)
    if "--abrir" in sys.argv:
        Timer(.4,lambda:webbrowser.open(url)).start()
    http.serve_forever()
