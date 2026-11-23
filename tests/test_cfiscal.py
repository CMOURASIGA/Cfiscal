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
        self.clients={}
        self.selected=None
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
    def register(self,xml):
        parsed=parse(xml)
        if parsed["cnpj"] not in self.clients:
            self.clients[parsed["cnpj"]]=self.call("/api/clientes",{"nome":parsed["company"],"cnpj":parsed["cnpj"]})["id"]
        self.selected=self.clients[parsed["cnpj"]]
        return self.selected
    def import_xml(self,xml):
        return self.call("/api/importar",{"xml":xml,"cliente_id":self.register(xml)})
    def notes(self):
        return self.call("/api/notas?cliente="+self.selected)
    def all_notes(self):
        result=[]
        for client in self.clients.values():result+=self.call("/api/notas?cliente="+client)
        return result
    def load_note(self):
        self.import_xml(self.xml)
        return self.notes()[0]
    def test_lote(self):
        for f in self.call("/api/exemplos"):
            self.assertTrue(self.import_xml(f["xml"])["importada"])
        bynum={n["number"]:n for n in self.all_notes()}
        self.assertEqual([bynum[k]["difference"] for k in ("101","102","201")],[0,100,None])
        self.assertIn("vIBSMun",bynum["201"]["reason"])
        self.assertFalse(self.import_xml(self.xml)["importada"])
        with self.assertRaises(error.HTTPError):
            self.import_xml(self.xml.replace("1.48","2.48"))
    def test_importacao_separada_e_ajuda(self):
        for f in self.call("/api/exemplos"):
            self.call("/api/importar",{"xml":f["xml"]})
        for f in (server.ROOT/"importar").glob("*.xml"):
            body={"xml":f.read_text(encoding="utf8")}
            first=self.import_xml(body["xml"])
            repeat=self.call("/api/importar",body)
            self.assertTrue(first["importada"])
            self.assertFalse(repeat["importada"])
            self.assertEqual(first["id"],repeat["id"])
            self.assertEqual(first["numero"],f.stem)
        self.assertEqual(len(self.call("/api/notas")),7)
        self.assertIn("Recebi um XML de nota de serviço",self.call("/ajuda.html").decode())
    def test_invalid(self):
        for xml in ("<NFSe>","<NFe/>","<!DOCTYPE x><x/>"):
            with self.assertRaises(ValueError):parse(xml)
        self.assertEqual(parse(self.xml.replace(">1.48<",">-1<"))["status"],"Dados insuficientes")
    def test_revisao_persistente(self):
        n=self.load_note()
        self.call("/api/revisar",dict(id=n["id"],cliente_id=self.selected,situacao="Concluída",responsavel="Piloto",comentario="Revisada"))
        server.init()
        n=self.call("/api/notas")[0]
        self.assertEqual(n["status"],"Divergência")
        self.assertEqual(n["events"][0]["data"]["situacao"],"Concluída")
    def test_contratos_http(self):
        n=self.load_note()
        for kind,state in (("regular","CALCULO_SIMULADO"),("simples","CALCULADO")):
            self.call("/api/calcular",dict(id=n["id"],cliente_id=self.selected,motor=kind,entrada={"itens":[{"numero":1}]}))
            event=self.call("/api/notas")[0]["events"][-1]
            self.assertEqual(event["kind"],kind)
            self.assertIn(state,event["data"]["resultado"])
            self.assertIn("IBS R$ 1.00",event["data"]["resultado"])
        self.assertTrue(self.call("/api/pdf",{"id":n["id"],"cliente_id":self.selected}).startswith(b"%PDF-"))
        self.assertEqual(self.motor.received.decode(),self.xml)
    def test_falha_item(self):
        n=parse(self.xml)
        self.assertIn("pendente",server.evaluate("regular",{"objetos":[{"estadoItem":"NAO_IMPLEMENTADO"}]},n))
        self.assertIn("insuficientes",server.evaluate("regular",{"objetos":[{"estadoItem":"CALCULADO","tribCalc":{}}]},n))
    def test_client_isolation(self):
        first=self.register(self.xml)
        self.import_xml(self.xml)
        self.assertEqual(len(self.call("/api/notas?cliente="+first)),1)
        other=(server.ROOT/"exemplos/201.xml").read_text(encoding="utf8")
        other_id=self.register(other)
        self.assertEqual(self.call("/api/notas?cliente="+other_id),[])
        with self.assertRaises(error.HTTPError):
            self.call("/api/importar",{"xml":self.xml,"cliente_id":other_id})
        self.assertEqual(self.call("/api/notas"),[])
        with self.assertRaises(error.HTTPError):
            self.call("/api/revisar",{"id":parse(self.xml)["id"],"cliente_id":other_id,"situacao":"Concluída","responsavel":"A","comentario":"B"})
    def test_legacy_association(self):
        with __import__("sqlite3").connect(server.DB) as db:
            data=parse(self.xml)
            db.execute("INSERT INTO notes VALUES (?,?,?,?)",(data["id"],self.xml,json.dumps(data),server.now()))
        self.assertEqual(len(self.call("/api/notas?cliente=pendentes")),1)
        self.assertEqual(self.call("/api/notas"),[])
        client=self.register(self.xml)
        self.assertTrue(self.call("/api/vincular",{"id":data["id"],"cliente_id":client})["ok"])
        self.assertEqual(len(self.call("/api/notas?cliente="+client)),1)
        self.assertEqual(self.call("/api/notas?cliente=pendentes"),[])
    def test_web(self):
        self.assertIn(b"CFiscal",self.call("/"))
        self.assertEqual(self.call("/api/notas"),[])
        self.assertEqual(self.call("/api/clientes"),[])
        self.assertIn(b"initConsultTabs",self.call("/componentes/consult-tabs.js"))
        with self.assertRaises(error.HTTPError):self.call("/dados/cfiscal.db")
