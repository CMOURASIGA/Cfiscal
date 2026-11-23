import functools
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import request, error

import server
from fiscal import parse

class MotorDeTeste(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass
    def do_POST(self):
        body=self.rfile.read(int(self.headers["Content-Length"]))
        if self.path=="/api/danfse":
            data=b"%PDF-1.4\nfixture"; self.server.received=body
        else:
            self.server.received=json.loads(body)
            regular=self.path.endswith("regime-geral")
            trib={"IBSCBS":{"gIBSCBS":{"vIBS":"0.48","gCBS":{"vCBS":"42.24"}}}} if regular else {"vIBSSN":"0.48","vCBSSN":"42.24"}
            data=json.dumps({"objetos":[{"estadoItem":"CALCULO_SIMULADO" if regular else "CALCULADO","tribCalc":trib}]}).encode()
        self.send_response(200); self.end_headers(); self.wfile.write(data)

class Conferencia(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        old_db,old_routes=server.DB,server.ROUTES
        self.addCleanup(setattr,server,"DB",old_db)
        self.addCleanup(setattr,server,"ROUTES",old_routes)
        server.DB=Path(self.temp.name)/"notas.db"
        server.init()
        self.motor=self.start(MotorDeTeste)
        server.ROUTES={k:(self.motor.server_port,v[1]) for k,v in old_routes.items()}
        self.app=self.start(functools.partial(server.Handler,directory=str(server.ROOT/"web")))
        self.opener=request.build_opener(request.ProxyHandler({}))
        self.xml=(server.ROOT/"exemplos/102.xml").read_text(encoding="utf8")
    def start(self,handler):
        http=ThreadingHTTPServer(("127.0.0.1",0),handler)
        threading.Thread(target=http.serve_forever,kwargs={"poll_interval":0.02},daemon=True).start()
        self.addCleanup(http.server_close);self.addCleanup(http.shutdown)
        return http
    def call(self,path,body=None):
        req=request.Request(f"http://127.0.0.1:{self.app.server_port}"+path,
            data=None if body is None else json.dumps(body).encode(),headers={"Content-Type":"application/json"})
        with self.opener.open(req) as response:
            raw=response.read()
            return json.loads(raw) if response.headers.get_content_type()=="application/json" else raw
    def load_note(self):
        self.call("/api/importar",{"xml":self.xml})
        return self.call("/api/notas")[0]
    def test_lote(self):
        for f in self.call("/api/exemplos"):
            self.assertTrue(self.call("/api/importar",{"xml":f["xml"]})["importada"])
        bynum={n["number"]:n for n in self.call("/api/notas")}
        self.assertEqual([bynum[k]["difference"] for k in ("101","102","201")],[0,100,None])
        self.assertIn("vIBSMun",bynum["201"]["reason"])
        self.assertFalse(self.call("/api/importar",{"xml":self.xml})["importada"])
        with self.assertRaises(error.HTTPError):
            self.call("/api/importar",{"xml":self.xml.replace("1.48","2.48")})
    def test_importacao_separada_e_ajuda(self):
        for f in self.call("/api/exemplos"):
            self.call("/api/importar",{"xml":f["xml"]})
        for f in (server.ROOT/"importar").glob("*.xml"):
            body={"xml":f.read_text(encoding="utf8")}
            first=self.call("/api/importar",body)
            repeat=self.call("/api/importar",body)
            self.assertTrue(first["importada"])
            self.assertFalse(repeat["importada"])
            self.assertEqual(first["id"],repeat["id"])
            self.assertEqual(first["numero"],f.stem)
        self.assertEqual(len(self.call("/api/notas")),6)
        self.assertIn("Recebi um XML de nota de serviço",self.call("/ajuda.html").decode())
    def test_invalid(self):
        for xml in ("<NFSe>","<NFe/>","<!DOCTYPE x><x/>"):
            with self.assertRaises(ValueError):parse(xml)
        self.assertEqual(parse(self.xml.replace(">1.48<",">-1<"))["status"],"Dados insuficientes")
    def test_revisao_persistente(self):
        n=self.load_note()
        self.call("/api/revisar",dict(id=n["id"],situacao="Concluída",responsavel="Piloto",comentario="Revisada"))
        server.init()
        n=self.call("/api/notas")[0]
        self.assertEqual(n["status"],"Divergência")
        self.assertEqual(n["events"][0]["data"]["situacao"],"Concluída")
    def test_contratos_http(self):
        n=self.load_note()
        for kind,state in (("regular","CALCULO_SIMULADO"),("simples","CALCULADO")):
            self.call("/api/calcular",dict(id=n["id"],motor=kind,entrada={"itens":[{"numero":1}]}))
            event=self.call("/api/notas")[0]["events"][-1]
            self.assertEqual(event["kind"],kind)
            self.assertIn(state,event["data"]["resultado"])
            self.assertIn("IBS R$ 1.00",event["data"]["resultado"])
        self.assertTrue(self.call("/api/pdf",{"id":n["id"]}).startswith(b"%PDF-"))
        self.assertEqual(self.motor.received.decode(),self.xml)
    def test_falha_item(self):
        n=parse(self.xml)
        self.assertIn("pendente",server.evaluate("regular",{"objetos":[{"estadoItem":"NAO_IMPLEMENTADO"}]},n))
        self.assertIn("insuficientes",server.evaluate("regular",{"objetos":[{"estadoItem":"CALCULADO","tribCalc":{}}]},n))
    def test_web(self):
        self.assertIn(b"CFiscal",self.call("/"))
        self.assertIn(b"initConsultTabs",self.call("/componentes/consult-tabs.js"))
        with self.assertRaises(error.HTTPError):self.call("/dados/cfiscal.db")
