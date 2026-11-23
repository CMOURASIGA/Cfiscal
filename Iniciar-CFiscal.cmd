@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 goto python
py -3 server.py --abrir
goto fim
:python
python server.py --abrir
:fim
if errorlevel 1 pause
