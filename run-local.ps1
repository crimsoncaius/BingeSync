$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$requirementsFile = Join-Path $backendDir "requirements.txt"

function Assert-PortAvailable([int]$Port) {
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listeners) {
    throw "Port $Port is already in use. Stop the existing process first, then rerun run-local.ps1."
  }
}

if (-not (Test-Path $venvPython)) {
  Write-Host "Creating backend virtual environment..."
  python -m venv (Join-Path $backendDir ".venv")
}

Write-Host "Installing backend requirements..."
& $venvPython -m pip install -r $requirementsFile | Out-Null

Write-Host "Installing frontend dependencies..."
npm install --prefix $frontendDir | Out-Null

Assert-PortAvailable 8000
Assert-PortAvailable 5173

$backendCommand = "Set-Location '$backendDir'; & '$venvPython' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
$frontendCommand = "Set-Location '$frontendDir'; npx vite --host 127.0.0.1 --port 5173"

Write-Host "Starting backend on http://127.0.0.1:8000 ..."
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  $backendCommand
) | Out-Null

Write-Host "Starting frontend on http://127.0.0.1:5173 ..."
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  $frontendCommand
) | Out-Null

Write-Host ""
Write-Host "Local dev servers launched."
Write-Host "Frontend: http://127.0.0.1:5173"
Write-Host "Backend:  http://127.0.0.1:8000"
