@echo off
rem Ponte de casa do VAR (Windows): duplo clique para arrancar. Tem de estar na mesma pasta que o ponte-casa.js.
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta instalar o Node.js: vai a nodejs.org, descarrega a versao LTS e instala. & pause & exit /b 1)
node ponte-casa.js
pause
