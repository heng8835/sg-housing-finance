@echo off
rem One-click launcher: serves app/ on http://localhost:8766 (ES modules need http, not file://)
cd /d "%~dp0"
start "" http://localhost:8766/
python tools\serve.py 8766
