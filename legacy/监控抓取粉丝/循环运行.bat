@echo off
:start
node code.js
timeout /t 600 /nobreak > nul
goto start