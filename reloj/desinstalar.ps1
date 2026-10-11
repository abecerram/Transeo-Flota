# =====================================================================
#  GRUPO THELMAR · Reloj de marcación · desinstalar.ps1
#  Quita el reloj de esta computadora. Correr como administrador.
#  Antes de quitarlo, intenta enviar las marcas que queden pendientes.
# =====================================================================

$yo = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $yo.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"')
  exit
}
$Carpeta = Join-Path $env:ProgramData 'RelojTHM'
if (Test-Path (Join-Path $Carpeta 'reloj.ps1')) {
  & (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Carpeta 'reloj.ps1') -Tipo enviar
}
Get-ScheduledTask -TaskPath '\RelojTHM\' -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
Remove-Item -Path $Carpeta -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ''
Write-Host '  El reloj se quitó de esta computadora.' -ForegroundColor Green
Read-Host '  Enter para cerrar'
