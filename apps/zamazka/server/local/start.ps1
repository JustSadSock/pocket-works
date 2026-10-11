param([switch]$LocalOnly)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
$tools=Join-Path $here '.tools'
$logs=Join-Path $here 'local-logs'
New-Item -ItemType Directory -Force -Path $tools,$logs | Out-Null
$serverProcess=$null
$tunnelProcess=$null
$port=8788

function Get-Node {
 $node=Get-Command node.exe -ErrorAction SilentlyContinue
 if($node){
  try {
   $v=& $node.Source --version
   if([int]($v -replace '^v(\d+).*','$1') -ge 22){return $node.Source}
  }catch {}
 }
 $name='node-v22.16.0-win-x64'
 $exe=Join-Path $tools "$name\node.exe"
 if(-not (Test-Path $exe)){
  Write-Host '[1/4] Downloading portable Node.js 22...' -ForegroundColor Cyan
  $url="https://nodejs.org/dist/v22.16.0/$name.zip"
  $archive=Join-Path $tools 'node-portable.zip'
  Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
  Expand-Archive -Path $archive -DestinationPath $tools -Force
  Remove-Item $archive -Force
 }
 $env:Path=(Split-Path -Parent $exe)+';'+$env:Path
 return $exe
}
function Get-Tunnel {
 $exe=Join-Path $tools 'cloudflared.exe'
 if(-not (Test-Path $exe)){
  Write-Host '[2/4] Downloading official Cloudflare Tunnel...' -ForegroundColor Cyan
  Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $exe -UseBasicParsing
 }
 return $exe
}
function Stop-Child($p) {
 if($null -ne $p){
  try{Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue}catch{}
 }
}
try {
 Write-Host ''
 Write-Host '  ZAMAZKA  /  ONE-CLICK ONLINE HOST' -ForegroundColor Yellow
 Write-Host '  No DNS, port forwarding, admin rights or cloud account.'
 Write-Host ''
 $node=Get-Node
 $tunnel=if($LocalOnly){$null}else{Get-Tunnel}
 Set-Location $here
 Write-Host '[3/4] Installing server packages...' -ForegroundColor Cyan
 $npm=Join-Path (Split-Path -Parent $node) 'npm.cmd'
 if(-not (Test-Path $npm)){
  $found=Get-Command npm.cmd -ErrorAction SilentlyContinue
  if(-not $found){throw 'npm.cmd not found'}
  $npm=$found.Source
 }
 & $npm install --no-audit --no-fund --loglevel=error
 if($LASTEXITCODE -ne 0){throw 'npm install failed'}
 $serverLog=Join-Path $logs 'server.log'
 $serverErr=Join-Path $logs 'server-errors.log'
 $tunnelLog=Join-Path $logs 'tunnel.log'
 $tunnelErr=Join-Path $logs 'tunnel-errors.log'
 Set-Content -Path $serverLog,$serverErr,$tunnelLog,$tunnelErr -Value ''
 $env:ZAMAZKA_PORT=[string]$port
 Write-Host '[4/4] Starting game backend...' -ForegroundColor Cyan
 $serverProcess=Start-Process -FilePath $node -ArgumentList ('"'+$here+'\server.mjs"') -WorkingDirectory $here -PassThru -NoNewWindow -RedirectStandardOutput $serverLog -RedirectStandardError $serverErr
 $healthy=$false
 for($i=0;$i -lt 45;$i++){
  if($serverProcess.HasExited){break}
  try{
   $health=Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 2
   if($health.ok -and $health.gameId -eq 'zamazka'){$healthy=$true;break}
  }catch{}
  Start-Sleep -Milliseconds 600
 }
 if(-not $healthy){
  if(Test-Path $serverErr){Get-Content $serverErr -Tail 22}
  throw 'Game backend could not start. Read local-logs/server-errors.log'
 }
 Write-Host '  Game server running on 127.0.0.1:8788.' -ForegroundColor Green
 if($LocalOnly){
  Write-Host '  Health: http://127.0.0.1:8788/health'
  Write-Host '  HTTPS Pocket Works needs START-ONLINE.bat to connect.'
 }else{
  Write-Host '  Creating free HTTPS tunnel...'
  $tunnelProcess=Start-Process -FilePath $tunnel -ArgumentList "tunnel --url http://127.0.0.1:$port" -WorkingDirectory $here -PassThru -NoNewWindow -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErr
  $online=$null
  for($i=0;$i -lt 75;$i++){
   if($tunnelProcess.HasExited){break}
   $combined=''
   try{$combined=(Get-Content $tunnelLog,$tunnelErr -Raw -ErrorAction SilentlyContinue) -join [Environment]::NewLine}catch{}
   $found=[regex]::Matches($combined,'https://[a-z0-9-]+\.trycloudflare\.com')
   if($found.Count -gt 0){$online=$found[0].Value;break}
   Start-Sleep -Seconds 1
  }
  if(-not $online){
   if(Test-Path $tunnelErr){Get-Content $tunnelErr -Tail 20}
   throw 'Cloudflare tunnel did not start. Read local-logs/tunnel-errors.log'
  }
  try { Set-Clipboard -Value $online } catch { Write-Host '  Clipboard unavailable: copy the link from the line below.' -ForegroundColor Yellow }
  Write-Host ''
  Write-Host '  ================================================' -ForegroundColor Green
  Write-Host '  ONLINE SERVER READY!' -ForegroundColor Green
  Write-Host "  $online" -ForegroundColor White
  Write-Host '  ================================================'
  Write-Host '  HTTPS address displayed above (and copied if clipboard is available).' -ForegroundColor Yellow
  Write-Host ''
  Write-Host '  1. Open ZAMAZKA in Pocket Works.'
  Write-Host '  2. Choose Create room.'
  Write-Host '  3. Paste this HTTPS address into PocketNet server.'
  Write-Host '  4. Create your room and copy its invitation link.'
  Write-Host '  5. Send the invitation to your friends.'
  Write-Host ''
  Write-Host '  The tunnel address changes after each restart.' -ForegroundColor DarkYellow
 }
 Write-Host ''
 Write-Host '  KEEP THIS WINDOW OPEN WHILE PLAYING.' -ForegroundColor Cyan
 [void](Read-Host '  Press ENTER to stop the server')
}catch{
 Write-Host ''
 Write-Host ('  ERROR: '+$_.Exception.Message) -ForegroundColor Red
 Write-Host '  The local-logs folder may contain more details.'
 [void](Read-Host '  Press ENTER to close')
 exit 1
}finally{
 Stop-Child $tunnelProcess
 Stop-Child $serverProcess
}
