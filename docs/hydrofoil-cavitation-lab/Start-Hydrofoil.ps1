param([int]$Port=8781)
$ErrorActionPreference='Stop'
$cavRuntime=Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
if(Test-Path -LiteralPath $cavRuntime){$cavPython=$cavRuntime}
elseif(Get-Command python -ErrorAction SilentlyContinue){$cavPython=(Get-Command python).Source}
else{throw 'Python 3 is required to serve this local application.'}
Write-Host "Open http://127.0.0.1:$Port/ in a browser. Press Ctrl+C here to stop."
& $cavPython -m http.server $Port --bind 127.0.0.1 --directory $PSScriptRoot
