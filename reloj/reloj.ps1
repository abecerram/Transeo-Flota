# =====================================================================
#  GRUPO THELMAR · Reloj de marcación · reloj.ps1
#
#  Lo ejecutan las tareas programadas de Windows (no se abre a mano):
#    -Tipo encendido   al encender la computadora
#    -Tipo apagado     cuando Windows empieza a apagarse o reiniciarse
#    -Tipo reposo      cuando la computadora entra en reposo
#    -Tipo despertar   cuando sale del reposo
#    -Tipo enviar      cada 5 minutos: manda lo que quedó pendiente
#
#  Cada marca se guarda primero en la cola de la computadora y después
#  se envía. Si no hay internet, queda en la cola y se manda cuando
#  vuelva, con la hora real en que ocurrió (y queda señalada para Planilla).
#  Con internet, vale la hora del servidor, no la de la computadora.
#
#  Compatible con Windows PowerShell 5.1 (el que trae Windows 10 y 11).
# =====================================================================

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('encendido', 'apagado', 'reposo', 'despertar', 'enviar')]
  [string]$Tipo
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Carpeta = if ($env:RELOJ_CARPETA) { $env:RELOJ_CARPETA } else { Join-Path $env:ProgramData 'RelojTHM' }
$Config  = Join-Path $Carpeta 'config.json'
$Cola    = Join-Path $Carpeta 'cola.jsonl'
$Bitacora = Join-Path $Carpeta 'reloj.log'
$Candado = Join-Path $Carpeta 'cola.lock'

function Anotar([string]$texto) {
  try {
    $linea = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $texto
    Add-Content -Path $Bitacora -Value $linea -Encoding UTF8
    # la bitácora no crece sin fin: se quedan las últimas 2000 líneas
    $todo = Get-Content -Path $Bitacora -Encoding UTF8
    if ($todo.Count -gt 2500) { $todo | Select-Object -Last 2000 | Set-Content -Path $Bitacora -Encoding UTF8 }
  } catch {}
}

if (-not (Test-Path $Config)) { Anotar "Falta config.json: corra instalar.ps1."; exit 1 }
$cfg = Get-Content -Path $Config -Raw -Encoding UTF8 | ConvertFrom-Json

# ---------------------------------------------------------------- un solo proceso a la vez sobre la cola
$candadoAbierto = $null
for ($i = 0; $i -lt 40 -and -not $candadoAbierto; $i++) {
  try { $candadoAbierto = [IO.File]::Open($Candado, 'OpenOrCreate', 'ReadWrite', 'None') }
  catch { Start-Sleep -Milliseconds 250 }
}

try {
  # ---------------------------------------------------------------- 1. guardar la marca nueva en la cola
  if ($Tipo -ne 'enviar') {
    # la hora va en milisegundos: así se lee igual en cualquier versión de PowerShell
    $marca = [ordered]@{ tipo = $Tipo; ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
    Add-Content -Path $Cola -Value ($marca | ConvertTo-Json -Compress) -Encoding UTF8
    Anotar "Marca guardada: $Tipo"
  }

  # ---------------------------------------------------------------- 2. enviar lo que esté en la cola
  if (-not (Test-Path $Cola)) { exit 0 }
  $pendientes = @(Get-Content -Path $Cola -Encoding UTF8 | Where-Object { $_.Trim() -ne '' } | ForEach-Object { $_ | ConvertFrom-Json })
  if ($pendientes.Count -eq 0) { exit 0 }

  # al encender, la red tarda un poco: se reintenta hasta 3 minutos
  $intentos = if ($Tipo -eq 'encendido') { 12 } elseif ($Tipo -eq 'apagado') { 1 } else { 2 }
  $espera = if ($Tipo -eq 'encendido') { 15 } else { 3 }
  $timeout = if ($Tipo -eq 'apagado') { 4 } else { 15 }

  $quedan = New-Object System.Collections.ArrayList
  $hayRed = $true
  foreach ($m in $pendientes) {
    if (-not $hayRed) { [void]$quedan.Add($m); continue }
    $hora = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$m.ms).UtcDateTime
    $texto = $hora.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $edad = ([DateTime]::UtcNow - $hora).TotalMinutes
    # si la marca lleva más de 5 minutos esperando, vale la hora de la computadora y queda señalada
    $cuerpo = @{ p_codigo = $cfg.codigo; p_clave = $cfg.clave; p_tipo = $m.tipo; p_hora = $texto; p_sin_conexion = ($edad -gt 5) } | ConvertTo-Json -Compress
    $enviada = $false
    for ($n = 1; $n -le $intentos -and -not $enviada; $n++) {
      try {
        $r = Invoke-RestMethod -Method Post -Uri ($cfg.url.TrimEnd('/') + '/rest/v1/rpc/personal_recibir_marca') `
          -Headers @{ apikey = $cfg.llave } -ContentType 'application/json; charset=utf-8' `
          -Body ([Text.Encoding]::UTF8.GetBytes($cuerpo)) -TimeoutSec $timeout -UseBasicParsing
        $enviada = $true
        Anotar ("Enviada: " + $m.tipo + " " + $texto + $(if ($r.repetida) { ' (ya estaba)' } else { '' }))
      } catch {
        $resp = $_.Exception.Response
        if ($resp -ne $null -and [int]$resp.StatusCode -ge 400 -and [int]$resp.StatusCode -lt 500) {
          # el servidor la rechazó (clave, computadora o fecha no válidas): no se reintenta
          $detalle = ''
          try { $detalle = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } catch {}
          Anotar ("Rechazada por el servidor: " + $m.tipo + " " + $texto + " · " + $detalle)
          $enviada = $true
        } elseif ($n -lt $intentos) {
          Start-Sleep -Seconds $espera
        } else {
          Anotar ("Sin conexión; queda en la cola: " + $m.tipo + " " + $texto)
        }
      }
    }
    if (-not $enviada) { [void]$quedan.Add($m); $hayRed = $false }
  }

  if ($quedan.Count -eq 0) { Remove-Item -Path $Cola -Force }
  else { $quedan | ForEach-Object { $_ | ConvertTo-Json -Compress } | Set-Content -Path $Cola -Encoding UTF8 }
}
finally {
  if ($candadoAbierto) { $candadoAbierto.Close() }
}
