@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ============================================
echo   ZYRO - alles live schalten
echo ============================================
echo.
echo [1/4] Server-Funktionen werden hochgeladen ...
echo       (Fragt Firebase, ob Funktionen geloescht werden sollen: mit N antworten)
call firebase deploy --only functions --project zyro-78855
if errorlevel 1 goto fehler

echo.
echo [2/4] Web-App wird gebaut ...
call npm run build:web
if errorlevel 1 goto fehler

echo.
echo [3/4] Windows-App wird gebaut ...
call npm run desktop:pack
if errorlevel 1 goto fehler
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set VERSION=%%v
if not exist "public\desktop-updates" mkdir "public\desktop-updates"
copy /y "release\Zyro-Management-Setup-%VERSION%.exe" "public\desktop-updates\" >nul || goto fehler
copy /y "release\Zyro-Management-Setup-%VERSION%.exe.blockmap" "public\desktop-updates\" >nul || goto fehler
copy /y "release\latest.yml" "public\desktop-updates\" >nul || goto fehler
echo       Windows-Update %VERSION% bereitgelegt.

echo.
echo [4/4] Website, Web-App und Update werden veroeffentlicht ...
call firebase deploy --only hosting --project zyro-78855
if errorlevel 1 goto fehler

echo.
echo ============================================
echo   FERTIG - alles ist live (Version %VERSION%)
echo ============================================
pause
exit /b 0

:fehler
echo.
echo ********************************************
echo   FEHLER - bitte die roten Zeilen oben an Claude schicken
echo ********************************************
pause
exit /b 1
