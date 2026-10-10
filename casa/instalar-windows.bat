@echo off
chcp 65001 >nul
rem Abre o instalador do retransmissor do VAR (instalar-windows.ps1) sem pedir mais nada.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-windows.ps1"
echo.
pause
