@echo off
setlocal
echo Starting Space Defender Ultimate...
set FLASK_APP=run.py
set FLASK_ENV=development
.\venv\Scripts\python run.py
pause
