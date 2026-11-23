"""Servidor monousuário, limitado ao loopback, sem dependências externas."""
import json
import os
import sqlite3
import sys
import webbrowser
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
from urllib import request, error
from urllib.parse import urlsplit
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
    with sqlite3.connect(DB) as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, xml TEXT, data TEXT, created TEXT);
        CREATE TABLE IF NOT EXISTS events (note TEXT, kind TEXT, data TEXT, created TEXT);
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
        if path == "/api/notas":
            with sqlite3.connect(DB) as db:
                notes = {i:dict(json.loads(data), created=t, events=[]) for i,data,t in db.execute("SELECT id,data,created FROM notes ORDER BY rowid DESC")}
                for i,kind,data,t in db.execute("SELECT note,kind,data,created FROM events ORDER BY rowid"):
                    notes[i]["events"].append(dict(kind=kind, data=json.loads(data), date=t))
            return self.send_data(list(notes.values()))
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
            with sqlite3.connect(DB, timeout=15) as db:
                if self.path == "/api/importar":
                    xml = body["xml"]
                    data = parse(xml)
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
                    result = {"importada": bool(cur.rowcount), "id": data["id"], "numero": data["number"]}
                else:
                    row = db.execute("SELECT xml,data FROM notes WHERE id=?", (body["id"],)).fetchone()
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
