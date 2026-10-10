# Instala o retransmissor do VAR no Windows e põe-no a arrancar sempre que o Windows liga.
# Abre-se com dois cliques no instalar-windows.bat (para voltar a entrar nas contas ou mudar a chave, abre outra vez).
$ErrorActionPreference = "Continue"
Write-Host ""
Write-Host "== Retransmissor do VAR: instalação no Windows =="
Write-Host ""
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host "Falta o Node.js. Instala a versão LTS em https://nodejs.org e volta a abrir este instalador."
  exit 1
}
$bin = Split-Path $node
$npm = Join-Path $bin "npm.cmd"
$npx = Join-Path $bin "npx.cmd"
$destino = Join-Path $env:LOCALAPPDATA "var-retransmissor"
$arranque = Join-Path ([Environment]::GetFolderPath("Startup")) "VAR retransmissor.vbs"

# um retransmissor que já esteja a correr pára, para se poder configurar
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*VAR retransmissor.vbs*" -or $_.CommandLine -like "*\var-retransmissor\retransmissor.js*" -or $_.CommandLine -like "*.var-retransmissor\browser*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

New-Item -ItemType Directory -Force -Path $destino | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot "retransmissor.js"), (Join-Path $PSScriptRoot "package.json") $destino
Set-Location $destino

Write-Host "1/3 A instalar o que o retransmissor precisa (pode demorar um minuto)..."
& $npm install --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { Write-Host "A instalação falhou. Confirma a ligação à internet e abre outra vez o instalador."; exit 1 }

# o browser: o Chrome, se houver; senão o Edge, que vem sempre com o Windows
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ }
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ }
if ($chrome) { Write-Host "    Google Chrome encontrado: é esse que o retransmissor vai usar." }
elseif ($edge) { Write-Host "    Microsoft Edge encontrado: é esse que o retransmissor vai usar." }
else {
  Write-Host "    Não encontrei o Chrome nem o Edge: a descarregar um browser só para o retransmissor (cerca de 150 MB)..."
  & $npx playwright install chromium
}

Write-Host "2/3 Configuração e entrada nas contas..."
& $node retransmissor.js --so-configurar
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "3/3 A pôr o retransmissor a arrancar sempre que o Windows liga..."
# um pequeno ficheiro na pasta «Arranque» do Windows: corre o retransmissor sem janela e, se ele cair, volta a
# arrancá-lo passados 30 segundos (se ele sair porque já há outro a correr, fica por aí)
$vbs = @"
Set s = CreateObject("WScript.Shell")
s.CurrentDirectory = "$destino"
Do
  rc = s.Run("""$node"" ""$destino\retransmissor.js""", 0, True)
  If rc = 0 Then Exit Do
  WScript.Sleep 30000
Loop
"@
Set-Content -Path $arranque -Value $vbs -Encoding Unicode
Start-Process wscript.exe -ArgumentList "`"$arranque`""
Start-Sleep -Seconds 8
Write-Host ""
Write-Host "Pronto. O retransmissor está a correr e vai arrancar sozinho sempre que ligares o computador."
Write-Host "Aparece um browser minimizado na barra de tarefas: é o dele, não o feches."
Write-Host "O que ele vai fazendo fica em: $env:USERPROFILE\.var-retransmissor\registo.log"
