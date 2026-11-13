@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Website und Web-App werden veroeffentlicht ...
call firebase deploy --only hosting --project zyro-78855 --non-interactive
if errorlevel 1 (echo FEHLER - bitte Screenshot an Claude & pause & exit /b 1)
echo.
echo FERTIG - Website ist live
pause
