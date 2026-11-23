"""Prepara e inicia uma cópia local dos projetos oficiais em revisões fixadas."""
import argparse
import os
import shutil
import subprocess
from pathlib import Path

HOME_DIR = Path(__file__).resolve().parent / "motores"
PROJECTS = {
    "regular": ("regime-regular","f1eebd7ce3157423b1a6aaca7dc1d6c3395452c4"),
    "simples": ("simples-nacional","a926d5a76095ac0295a6612a9a54db7ffead2396"),
    "pdf": ("gerador-danfse","8d79e6b2f7fad6375340afcb51c85ed370c64a14"),
}

def checkout(kind):
    suffix, revision = PROJECTS[kind]
    folder = HOME_DIR / suffix
    if not folder.exists():
        HOME_DIR.mkdir(exist_ok=True)
        subprocess.run(["git","clone","https://github.com/ReceitaFederal/calculadora-rtc-"+suffix+".git",str(folder)],check=True)
        subprocess.run(["git","checkout","--detach",revision],cwd=folder,check=True)
    current = subprocess.check_output(["git","rev-parse","HEAD"],cwd=folder,text=True).strip()
    if current != revision:
        raise RuntimeError(f"Revisão inesperada em {folder}. Verifique o checkout antes de continuar.")
    return folder

def run(kind):
    folder = checkout(kind)
    env = dict(os.environ)
    if kind == "pdf":
        env["SERVER_PORT"]="8081"
        subprocess.run(["go","run","./cmd/danfse"],cwd=folder,env=env,check=True)
        return
    if kind == "simples" and not (folder/"flyway").is_dir():
        shutil.copytree(checkout("regular")/"flyway",folder/"flyway")
    db = folder/"calculadora"/"db"
    db.mkdir(parents=True,exist_ok=True)
    mvn = ["cmd.exe","/d","/c","mvnw.cmd"] if os.name=="nt" else ["sh","./mvnw"]
    subprocess.run(mvn+["flyway:migrate","-Dflyway.configFiles=./flyway/flyway-pro.conf","--batch-mode","--errors"],cwd=folder,check=True)
    if not (db/"calculadora-pro.db").is_file():
        raise RuntimeError("O Flyway não gerou a base offline esperada.")
    env["SERVER_PORT"] = "8080" if kind=="regular" else "8082"
    subprocess.run(mvn+["spring-boot:run","-Dspring-boot.run.profiles=offline"],cwd=folder,env=env,check=True)

if __name__=="__main__":
    args=argparse.ArgumentParser(description=__doc__)
    args.add_argument("motor",choices=PROJECTS)
    try:
        run(args.parse_args().motor)
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        raise SystemExit(f"Falha ao iniciar o motor: {exc}")
