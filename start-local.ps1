param([int]$Port = 8000, [switch]$ReadOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$pythonExecutable = Join-Path $projectRoot '.venv\Scripts\python.exe'
Push-Location $projectRoot
try {
    if (-not (Test-Path -LiteralPath $pythonExecutable)) {
        & python -m venv (Join-Path $projectRoot '.venv')
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment' }
        & $pythonExecutable -m pip install -r backend/requirements.txt
        if ($LASTEXITCODE -ne 0) { throw 'Could not install backend dependencies' }
    }
    if ($ReadOnly) { $env:ADMIN_TOKEN = '' }
    elseif (-not $env:ADMIN_TOKEN) {
        $secureToken = Read-Host 'Set the local admin token (not displayed)' -AsSecureString
        $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
        try { $env:ADMIN_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer) }
        if (-not $env:ADMIN_TOKEN) { throw 'Admin token cannot be empty; use -ReadOnly for read-only mode' }
    }
    if (-not $env:STORAGE_DIR) { $env:STORAGE_DIR = Join-Path $projectRoot 'storage' }
    if (-not $env:SITE_URL) { $env:SITE_URL = "http://127.0.0.1:$Port" }
    Write-Host "Blog: http://127.0.0.1:$Port/"
    Write-Host "Admin: http://127.0.0.1:$Port/admin.html"
    & $pythonExecutable -m uvicorn backend.main:app --host 127.0.0.1 --port $Port
}
finally { Pop-Location }
