import functools
from contextlib import closing
import json
import re
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import request, error

import server
from fiscal import parse, contextual_diagnosis

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
            self.import_xml(f["xml"])
        for f in (server.ROOT/"importar").glob("*.xml"):
            body={"xml":f.read_text(encoding="utf8")}
            first=self.import_xml(body["xml"])
            repeat=self.import_xml(body["xml"])
            self.assertTrue(first["importada"])
            self.assertFalse(repeat["importada"])
            self.assertEqual(first["id"],repeat["id"])
            self.assertEqual(first["numero"],f.stem)
        self.assertEqual(len(self.all_notes()),7)
        self.assertIn("Seu roteiro de utilização",self.call("/ajuda.html").decode())
    def test_invalid(self):
        for xml in ("<NFSe>","<NFe/>","<!DOCTYPE x><x/>"):
            with self.assertRaises(ValueError):parse(xml)
        self.assertEqual(parse(self.xml.replace(">1.48<",">-1<"))["status"],"Dados insuficientes")
    def test_revisao_persistente(self):
        n=self.load_note()
        self.call("/api/revisar",dict(id=n["id"],cliente_id=self.selected,situacao="Concluída",responsavel="Piloto",comentario="Revisada"))
        server.init()
        n=self.notes()[0]
        self.assertEqual(n["status"],"Divergência")
        self.assertEqual(n["events"][0]["data"]["situacao"],"Concluída")
    def test_contratos_http(self):
        n=self.load_note()
        for kind,state in (("regular","CALCULO_SIMULADO"),("simples","CALCULADO")):
            self.call("/api/calcular",dict(id=n["id"],cliente_id=self.selected,motor=kind,entrada={"itens":[{"numero":1}]}))
            event=self.notes()[0]["events"][-1]
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
        with closing(__import__("sqlite3").connect(server.DB)) as db, db:
            data=parse(self.xml)
            db.execute("INSERT INTO notes VALUES (?,?,?,?)",(data["id"],self.xml,json.dumps(data),server.now()))
        self.assertEqual(len(self.call("/api/notas?cliente=pendentes")),1)
        self.assertEqual(self.call("/api/notas"),[])
        client=self.register(self.xml)
        self.assertTrue(self.call("/api/vincular",{"id":data["id"],"cliente_id":client})["ok"])
        self.assertEqual(len(self.call("/api/notas?cliente="+client)),1)
        self.assertEqual(self.call("/api/notas?cliente=pendentes"),[])
    def test_dashboard_profiles(self):
        self.import_xml(self.xml)
        client=self.selected
        business=self.call("/api/dashboard?cliente="+client)
        self.assertEqual(business["notas"],1)
        self.assertEqual(business["divergencias"],1)
        self.assertEqual(business["coincidentes_aritmeticos"],0)
        self.assertEqual(business["valor_servicos_informado"],"1200.00")
        self.assertEqual(business["tributacao_calculada"],None)
        self.assertEqual(business["conformidade_fiscal_integral"],"Não verificada")
        self.assertEqual(self.call("/api/dashboard?cliente="+client+"&competencia=2026-11")["notas"],0)
        accountant=self.call("/api/dashboard?perfil=contador")
        self.assertEqual(len(accountant["clientes"]),1)
        self.assertEqual(accountant["clientes"][0]["notas"],1)
        self.assertEqual(self.call("/api/dashboard")["notas"],0)
        with self.assertRaises(error.HTTPError): self.call("/api/dashboard?competencia=invalida")
    def test_diagnostico_simples_2026_sem_ibscbs(self):
        # XML 100% sintético: sem dados reais do usuário.
        xml=(server.ROOT/"exemplos/201.xml").read_text(encoding="utf8")
        xml=xml.replace("2027-03-15","2026-11-09")
        xml=re.sub(r"<IBSCBS><valores><vBC>.*?</IBSCBS>","",xml,count=1,flags=re.DOTALL)
        data=parse(xml)
        self.assertEqual(data["regime"],"3")
        self.assertEqual(data["date"],"2026-11-09")
        self.assertEqual(data["diagnostico"]["nivel"],"informativo")
        self.assertEqual(data["diagnostico"]["verificacao_aritmetica"],"Não executada")
        self.assertIn("compatível",data["diagnostico"]["titulo"])
        self.assertEqual(data["diagnostico"]["conformidade_integral"],"Não determinada")
        client=self.register(xml)
        self.import_xml(xml)
        self.assertEqual(self.call("/api/notas?cliente="+client)[0]["diagnostico"]["nivel"],"informativo")
        dash=self.call("/api/dashboard?cliente="+client)
        self.assertEqual(dash["ausencias_compativeis_2026"],1)
        self.assertIsNone(dash["cbs_declarada"])
        self.assertIsNone(dash["ibs_declarado"])
    def test_diagnostico_2027_nao_inventa_calculo(self):
        xml=(server.ROOT/"exemplos/201.xml").read_text(encoding="utf8")
        xml=re.sub(r"<IBSCBS><valores><vBC>.*?</IBSCBS>","",xml,count=1,flags=re.DOTALL)
        diagnosis=parse(xml)["diagnostico"]
        self.assertEqual(diagnosis["nivel"],"revisao")
        self.assertEqual(diagnosis["calculo_tributario"],"Não executado")
        self.assertIn("PGDAS-D",diagnosis["acao"])
    def test_navegacao_telas_separadas(self):
        html=self.call("/").decode()
        for view in ("painel","clientes","notas","simulacao","integracoes"):
            self.assertIn('data-view="'+view+'"',html)
            self.assertIn('data-nav="'+view+'"',html)
        self.assertIn('id="sidebarToggle"',html)
        self.assertIn('src="navigation.js"',html)
        self.assertIn('id="view-painel" hidden',html)
        ajuda=self.call("/ajuda.html").decode()
        self.assertIn('data-nav="ajuda"',ajuda)
        self.assertIn('id="sidebarToggle"',ajuda)
        self.assertIn(b"CFiscalNavigate",self.call("/navigation.js"))
    def test_simulacao_preparatoria_isolada_por_cliente(self):
        xml=self.xml
        first=self.register(xml)
        second=self.register((server.ROOT/"exemplos/201.xml").read_text(encoding="utf8"))
        self.assertIsNone(self.call("/api/simulacoes/perfil?cliente="+first)["dados"])
        payload={"cliente_id":first,"regime_confirmado":"simples","receita_12m":"156000.00",
                 "receita_prevista_2027":"170000.00","folha_12m":"0","despesas_12m":"30000.00",
                 "prolabore_mensal":"0","estrutura_equipe":"so_socios",
                 "atividade_fator_r":"nao_confirmado","competencia_referencia":"2027-01"}
        result=self.call("/api/simulacoes/perfil",payload)
        self.assertTrue(result["ok"])
        self.assertIn("Nenhum imposto",result["aviso"])
        self.assertIsNone(self.call("/api/simulacoes/perfil?cliente="+second)["dados"])
        self.assertEqual(self.call("/api/simulacoes/perfil?cliente="+first)["dados"]["receita_12m"],"156000.00")
        self.assertEqual(self.call("/api/simulacoes/perfil?cliente="+first)["dados"]["prolabore_mensal"],"0")
        self.assertEqual(self.call("/api/simulacoes/perfil?cliente="+first)["dados"]["estrutura_equipe"],"so_socios")
        self.assertEqual(self.call("/api/simulacoes/perfil?cliente="+first)["dados"]["competencia_referencia"],"2027-01")
        server.init()
        self.assertEqual(self.call("/api/simulacoes/perfil?cliente="+first)["dados"]["regime_confirmado"],"simples")
        with self.assertRaises(error.HTTPError):
            self.call("/api/simulacoes/perfil",dict(payload,receita_12m="-1"))
        with self.assertRaises(error.HTTPError):
            self.call("/api/simulacoes/perfil",dict(payload,receita_12m="abc"))
        with self.assertRaises(error.HTTPError):
            self.call("/api/simulacoes/perfil",dict(payload,cliente_id="inexistente"))
        with self.assertRaises(error.HTTPError):
            self.call("/api/simulacoes/perfil",dict(payload,prolabore_mensal="-1"))
        with self.assertRaises(error.HTTPError):
            self.call("/api/simulacoes/perfil",dict(payload,competencia_referencia="2027-13"))
        with self.assertRaises(error.HTTPError):
            self.call("/api/simulacoes/perfil",dict(payload,atividade_fator_r="outro"))
    def test_simulador_fluxo_guiado(self):
        html=self.call("/").decode()
        for name in ("competencia_referencia","atividade_fator_r","prolabore_mensal","folha_12m"):
            self.assertIn('name="'+name+'"',html)
        for step in ("dados","diagnostico","resultados"):
            self.assertIn('data-simstep="'+step+'"',html)
            self.assertIn('data-sim-panel="'+step+'"',html)
        js=self.call("/simulation.js").decode()
        self.assertIn("renderDiagnosis",js)
        self.assertIn("renderResults",js)
        self.assertIn("scenarioInterpretation",html)
        self.assertIn("renderInterpretation",js)
        self.assertIn("Enquadramento ainda não definido",js)
        self.assertIn('data.atividade_fator_r==="sim"&&fr',js)
        self.assertIn("Exemplo condicionado para Anexo",js)
        self.assertIn("Não representa o DAS efetivo",js)
        self.assertIn("referenceWindow",js)
        self.assertIn("simulationWarnings",html)
        self.assertIn("simulationExample",html)
        self.assertIn("warnings()",js)
        self.assertIn("m-14",js)
        self.assertIn('payroll===0?0.01:raw',js)

    def test_cliente_ativo_inicializa_simulacao_no_navegador(self):
        app=self.call("/app.js").decode()
        simulation=self.call("/simulation.js").decode()
        self.assertIn('ACTIVE_CLIENT_KEY="cfiscal:active-client:v1"',app)
        self.assertIn('select.dispatchEvent(new Event("change",{bubbles:true}))',app)
        self.assertIn('active.length===1?active[0].id',app)
        self.assertIn('saveActiveClient($("clientSelect").value)',app)
        self.assertIn('for(const control of form.elements)control.disabled=false',simulation)
        self.assertIn('$("clientSelect").addEventListener("change"',simulation)
        self.assertIn('button.disabled=!selectedClient()||!isConsultSelected()',simulation)

    def test_continuar_da_nota_para_simulacao(self):
        html=self.call("/").decode()
        js=self.call("/app.js").decode()
        help_html=self.call("/ajuda.html").decode()
        for item in ("documentNextStep","documentStepStatus","documentReviewTab","documentContinue"):
            self.assertIn('id="'+item+'"',html)
        self.assertIn('window.CFiscalNavigate("simulacao")',js)
        self.assertIn('lastReview.data.situacao',js)
        self.assertIn('$("drawer").close()',js)
        self.assertIn("Próximo passo: Simulação tributária",help_html)
        self.assertIn("A aba Motores não é obrigatória",help_html)

    def test_ajuda_fiscal_autossuficiente(self):
        ajuda=self.call("/ajuda.html").decode()
        for text in (
            "Aprenda a utilizar o CFiscal",
            "Seu roteiro de utilização",
            "Como preencher a Simulação Tributária",
            "Como interpretar os resultados",
            "Central do Contador",
            "Impacto Financeiro",
            "Agenda Tributária",
            "Relatórios",
            "Resolução de problemas comuns",
            "Backup, privacidade e migração futura",
        ):
            self.assertIn(text,ajuda)
        for step in range(1,9):
            self.assertIn(f'data-check="{step}"',ajuda)
        for path in ("clientes","notas","simulacao","auditoria","contador","impacto","agenda","relatorios"):
            self.assertIn('href="/#'+path+'"',ajuda)
        self.assertIn('src="help.js"',ajuda)
        self.assertIn('href="help.css"',ajuda)
        self.assertIn('id="helpSearch"',ajuda)
        self.assertIn('data-role="contador"',ajuda)
        self.assertIn("localStorage",ajuda)
        self.assertIn("DAS oficialmente apurado",ajuda)
        self.assertGreater(len(self.call("/help.js")),500)
        self.assertGreater(len(self.call("/help.css")),500)
        main=self.call("/").decode()
        self.assertIn('href="ajuda.html#roteiro"',main)
        self.assertIn('href="ajuda.html#simulacao"',main)

    def test_modulos_cfiscal_produto_e_motor_versionado(self):
        html=self.call("/").decode()
        for view in ("auditoria","contador","impacto","agenda","relatorios"):
            self.assertIn('data-view="'+view+'"',html)
            self.assertIn('data-nav="'+view+'"',html)
        for name in ("tax-engine.js","fiscal-workspace.js"):
            self.assertIn('src="'+name+'"',html)
            js=self.call("/"+name).decode()
            self.assertGreater(len(js),1000)
        self.assertIn("taxMemory",html)
        self.assertIn("reportPrint",html)
        self.assertIn("agendaTasks",html)
        self.assertIn("auditTable",html)

    def test_web(self):
        self.assertIn(b"CFiscal",self.call("/"))
        self.assertEqual(self.call("/api/notas"),[])
        self.assertEqual(self.call("/api/clientes"),[])
        self.assertIn(b"initConsultTabs",self.call("/componentes/consult-tabs.js"))
        self.assertIn(b'browser-store.js',self.call("/"))
        self.assertIn(b'CFiscalBrowserStore',self.call("/browser-store.js"))
        config=json.loads((server.ROOT/"vercel.json").read_text(encoding="utf8"))
        self.assertEqual(config["outputDirectory"],"web")
        self.assertIsNone(config["framework"])
        with self.assertRaises(error.HTTPError):self.call("/dados/cfiscal.db")
