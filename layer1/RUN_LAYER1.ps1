$ErrorActionPreference = 'Stop'
$Layer1 = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $Layer1
Write-Host "Serving PRAMAN project root: $ProjectRoot" -ForegroundColor Cyan
Write-Host "Open: http://localhost:8000/layer1/" -ForegroundColor Yellow
python -m http.server 8000 --directory "$ProjectRoot"
