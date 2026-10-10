@echo off
chcp 65001 >nul
rem Desliga o retransmissor do VAR (deixa de arrancar sozinho) e apaga-o.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*VAR retransmissor.vbs*' -or $_.CommandLine -like '*\var-retransmissor\retransmissor.js*' -or $_.CommandLine -like '*.var-retransmissor\browser*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Remove-Item -Force (Join-Path ([Environment]::GetFolderPath('Startup')) 'VAR retransmissor.vbs') -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force (Join-Path $env:LOCALAPPDATA 'var-retransmissor') -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force (Join-Path $env:USERPROFILE '.var-retransmissor') -ErrorAction SilentlyContinue; Write-Host 'O retransmissor foi desligado e apagado.'"
pause
