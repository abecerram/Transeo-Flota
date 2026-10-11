# =====================================================================
#  GRUPO THELMAR · Reloj de marcación · instalar.ps1
#
#  Se corre UNA vez en cada computadora, como administrador:
#    clic derecho en el archivo > "Ejecutar con PowerShell"
#    (o en una ventana de PowerShell abierta como administrador:
#     powershell -ExecutionPolicy Bypass -File .\instalar.ps1)
#
#  Pide el código de la computadora y su clave (las genera el
#  administrador en el portal: Configuración > Computadoras y claves).
#  Se puede volver a correr para cambiar la clave.
# =====================================================================

$ErrorActionPreference = 'Stop'

# --- debe correr como administrador
$yo = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $yo.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host ''
  Write-Host 'Este instalador necesita permisos de administrador.' -ForegroundColor Yellow
  Write-Host 'Clic derecho en instalar.ps1 > Ejecutar con PowerShell, y acepte el aviso de Windows.'
  Start-Process powershell.exe -Verb RunAs -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"')
  exit
}

# --- conexión del portal (la misma de la página; no es secreta)
$URL   = 'https://jnwayclkqiyhragezqqo.supabase.co'
$LLAVE = 'sb_publishable_6ST57OmXy9e5WbTahELakA_6WxPZGGN'

$Carpeta = Join-Path $env:ProgramData 'RelojTHM'
$Origen  = Split-Path -Parent $PSCommandPath

Write-Host ''
Write-Host '  GRUPO THELMAR · Reloj de marcación' -ForegroundColor Cyan
Write-Host '  -----------------------------------'
Write-Host '  Marca la entrada al encender esta computadora y la salida al apagarla.'
Write-Host ''

$codigo = (Read-Host '  Código de esta computadora (ej. THM-PC-01)').Trim().ToUpper()
if ($codigo -notmatch '^[A-Z0-9-]{3,20}$') { Write-Host '  El código solo lleva letras, números y guiones.' -ForegroundColor Red; Read-Host '  Enter para salir'; exit 1 }
$clave = (Read-Host '  Clave de la computadora (la que dio el portal)').Trim().ToUpper()
if ($clave.Length -lt 12) { Write-Host '  La clave parece incompleta.' -ForegroundColor Red; Read-Host '  Enter para salir'; exit 1 }

# --- archivos
New-Item -ItemType Directory -Path $Carpeta -Force | Out-Null
Copy-Item -Path (Join-Path $Origen 'reloj.ps1') -Destination (Join-Path $Carpeta 'reloj.ps1') -Force
@{ url = $URL; llave = $LLAVE; codigo = $codigo; clave = $clave } | ConvertTo-Json | Set-Content -Path (Join-Path $Carpeta 'config.json') -Encoding UTF8

# la clave solo la leen Windows (SYSTEM) y los administradores: el trabajador no la ve
icacls $Carpeta /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' 2>$null | Out-Null

# --- probar la clave contra el portal antes de dejar todo instalado
Write-Host ''
Write-Host '  Probando la conexión con el portal...'
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $prueba = @{ p_codigo = $codigo; p_clave = $clave; p_tipo = 'encendido'; p_hora = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ'); p_sin_conexion = $false } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri ($URL + '/rest/v1/rpc/personal_recibir_marca') -Headers @{ apikey = $LLAVE } `
    -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($prueba)) -TimeoutSec 20 -UseBasicParsing | Out-Null
  Write-Host '  Conexión correcta. Quedó marcada la entrada de hoy.' -ForegroundColor Green
} catch {
  Write-Host '  El portal rechazó la prueba. Revise el código y la clave (o que la computadora esté asignada a un trabajador).' -ForegroundColor Red
  Write-Host ('  Detalle: ' + $_.Exception.Message)
  Read-Host '  Enter para salir'; exit 1
}

# --- tareas programadas: corren como SYSTEM, aunque nadie inicie sesión
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$script = Join-Path $Carpeta 'reloj.ps1'

function Tarea([string]$nombre, [string]$tipo, [string]$disparadorXml) {
  $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Reloj de marcación del Grupo Thelmar ($tipo)</Description></RegistrationInfo>
  <Triggers>$disparadorXml</Triggers>
  <Principals><Principal id="Author"><UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>Queue</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT10M</ExecutionTimeLimit>
    <Priority>4</Priority>
  </Settings>
  <Actions Context="Author"><Exec><Command>$ps</Command><Arguments>-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$script" -Tipo $tipo</Arguments></Exec></Actions>
</Task>
"@
  Register-ScheduledTask -TaskName $nombre -TaskPath '\RelojTHM\' -Xml $xml -Force | Out-Null
}

$evento = { param($log, $consulta) "<EventTrigger><Enabled>true</Enabled><Subscription>&lt;QueryList&gt;&lt;Query Id='0' Path='$log'&gt;&lt;Select Path='$log'&gt;$consulta&lt;/Select&gt;&lt;/Query&gt;&lt;/QueryList&gt;</Subscription></EventTrigger>" }

Tarea 'Encendido' 'encendido' '<BootTrigger><Enabled>true</Enabled></BootTrigger>'
# 1074: Windows empieza a apagarse o reiniciarse
Tarea 'Apagado'   'apagado'   (& $evento 'System' "*[System[Provider[@Name='User32'] and EventID=1074]]")
# 42: entra en reposo · 1 (Power-Troubleshooter): sale del reposo
Tarea 'Reposo'    'reposo'    (& $evento 'System' "*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and EventID=42]]")
Tarea 'Despertar' 'despertar' (& $evento 'System' "*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]")
# cada 5 minutos manda lo que haya quedado pendiente
$inicio = (Get-Date).AddMinutes(1).ToString('yyyy-MM-ddTHH:mm:ss')
Tarea 'Enviar'    'enviar'    "<TimeTrigger><StartBoundary>$inicio</StartBoundary><Enabled>true</Enabled><Repetition><Interval>PT5M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition></TimeTrigger>"

# --- el "inicio rápido" de Windows apaga a medias y la entrada no se marcaría al encender: se desactiva
powercfg /hibernate off 2>$null | Out-Null
Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' -Name HiberbootEnabled -Value 0 -Type DWord -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '  Listo. El reloj quedó instalado en esta computadora.' -ForegroundColor Green
Write-Host "  Código: $codigo"
Write-Host '  Marca la entrada al encender, la salida al apagar y los recesos al entrar en reposo.'
Write-Host '  Se desactivó el "inicio rápido" de Windows para que el encendido se registre siempre.'
Write-Host ''
Read-Host '  Enter para cerrar'
