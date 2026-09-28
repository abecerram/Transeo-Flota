/* TRANSEO PTY · Sistema de flota · comun.js
 * Conexión con Supabase, sesión y utilidades que usan todas las páginas.
 *
 * Sesión: dura mientras el navegador esté abierto, y se cierra sola
 * tras 1 hora sin actividad, lo que pase primero.
 */

const MINUTOS_INACTIVIDAD = 60;
const LLAVE_CORREO = 'transeo_correo';
const LLAVE_ACTIVIDAD = 'transeo_actividad';
const LLAVE_INTENTOS = 'transeo_intentos';

if (/PEGA_AQUI/.test(CONFIG.url + CONFIG.clave)) {
  document.addEventListener('DOMContentLoaded', function () {
    document.body.innerHTML = '<div class="mensaje error" style="margin:30px">Falta configurar la conexión: ' +
      'abra js/config.js y pegue la Project URL y la llave publishable de Supabase.</div>';
  });
  throw new Error('Falta configurar js/config.js');
}

// la sesión vive en sessionStorage: al cerrar el navegador, se va
const sb = window.supabase.createClient(CONFIG.url, CONFIG.clave, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.sessionStorage }
});

// ---------------------------------------------------------------- utilidades

function $(id) { return document.getElementById(id); }

function esc(t) {
  return String(t === undefined || t === null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 2026-09-24 -> 24/09/2026 */
function fechaTexto(iso) {
  if (!iso) return '';
  const p = String(iso).substring(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}

function monto(n) {
  const v = Number(n);
  if (n === null || n === undefined || n === '' || isNaN(v)) return '-';
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function km(n) { return n === null || n === undefined || n === '' ? '-' : Number(n).toLocaleString('en-US'); }

function hoyISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function diasHasta(iso) {
  if (!iso) return null;
  const p = String(iso).substring(0, 10).split('-');
  const f = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((f - h) / 86400000);
}

/** Escudo o logo completo, del archivo marca.svg. Toma el color del texto. */
function marca(cual, ancho, color) {
  const esLogo = cual === 'logo';
  const alto = Math.round(ancho * (esLogo ? 196.5 : 188.1) / 240);
  return '<svg class="marca" width="' + ancho + '" height="' + alto + '" viewBox="0 0 240 ' + (esLogo ? '196.5' : '188.1') +
    '" style="color:' + (color || 'currentColor') + '" aria-hidden="true"><use href="marca.svg#' + (esLogo ? 'logo' : 'escudo') + '"/></svg>';
}

/** Logo en dos partes, para la animación del acceso. */
function logoAnimado() {
  const use = '<use href="marca.svg#logo"/>';
  return '<div class="logo-anim"><svg class="parte-escudo" viewBox="0 0 240 196.5" aria-hidden="true">' + use +
    '</svg><svg class="parte-palabra" viewBox="0 0 240 196.5" aria-label="Transeo">' + use + '</svg></div>';
}

// ---------------------------------------------------------------- mensajes

function aviso(texto, tipo) {
  let caja = $('aviso-flotante');
  if (!caja) {
    caja = document.createElement('div');
    caja.id = 'aviso-flotante';
    document.body.appendChild(caja);
  }
  caja.className = 'mensaje flotante ' + (tipo || '');
  caja.textContent = texto;
  caja.classList.remove('oculto');
  clearTimeout(caja._t);
  caja._t = setTimeout(function () { caja.classList.add('oculto'); }, tipo === 'error' ? 8000 : 4500);
}

function pintarMensaje(idCaja, html, tipo) {
  const c = $(idCaja);
  if (!c) return;
  c.innerHTML = html ? '<div class="mensaje ' + (tipo || '') + '">' + html + '</div>' : '';
}

/** Ventana de confirmación. Devuelve una promesa con true o false. */
function confirmar(titulo, texto, textoSi, peligro) {
  return new Promise(function (resolver) {
    const f = document.createElement('div');
    f.className = 'fondo-ventana';
    f.innerHTML = '<div class="ventana"><h3>' + esc(titulo) + '</h3><p>' + esc(texto) + '</p>' +
      '<div class="acciones"><button class="btn ' + (peligro ? 'peligro' : '') + '" data-r="1">' + esc(textoSi || 'Sí') + '</button>' +
      '<button class="btn claro" data-r="0">Cancelar</button></div></div>';
    f.addEventListener('click', function (e) {
      const r = e.target.getAttribute('data-r');
      if (r === null && e.target !== f) return;
      f.remove();
      resolver(r === '1');
    });
    document.body.appendChild(f);
  });
}

/** Convierte los errores de Supabase en algo que se entienda. */
function textoError(e) {
  if (!e) return 'Ocurrió un error.';
  const m = String(e.message || e);
  const d = String(e.details || '');
  if (e.code === 'P0001') return m;
  if (e.code === '23505') {
    const campo = (d.match(/\(([^)]+)\)=/) || [])[1] || '';
    const nombres = { placa: 'la placa', nombre: 'el nombre', ruc_cedula: 'el RUC o la cédula', nombre_corto: 'el nombre corto',
                      codigo: 'el código', cedula: 'la cédula', 'cuenta_origen, referencia': 'la referencia de pago', 'equipo_id, tipo': 'ese documento vigente' };
    return 'Ya existe un registro con ' + (nombres[campo] || 'ese dato') + '.';
  }
  if (e.code === '42501' || /row-level security/i.test(m)) return 'Su perfil no tiene permiso para hacer esto.';
  if (e.code === '23514') {
    if (/yappy/.test(m)) return 'El Yappy debe escribirse con 8 dígitos, así: 6489-9870.';
    if (/gasto_con_destino/.test(m)) return 'El gasto debe llevar un equipo o un proyecto.';
    if (/referencia_obligatoria/.test(m)) return 'Falta la referencia del pago.';
    return 'Uno de los datos no es válido.';
  }
  if (e.code === '23503') return 'Este registro está en uso por otros datos y no se puede borrar.';
  if (/Invalid login credentials/i.test(m)) return 'Correo o clave incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Esta cuenta todavía no confirmó su correo.';
  if (/Password should be at least/i.test(m)) return 'La clave debe tener al menos 8 caracteres.';
  if (/Token has expired|invalid/i.test(m) && /otp|token/i.test(m)) return 'El código no es válido o ya caducó. Pida uno nuevo.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Demasiados intentos seguidos. Espere un minuto e intente de nuevo.';
  if (/Signups not allowed|User not found/i.test(m)) return 'Ese correo no tiene cuenta en el sistema.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revise el internet e intente de nuevo.';
  return m;
}

// ---------------------------------------------------------------- correo recordado e intentos

function correoRecordado() { try { return localStorage.getItem(LLAVE_CORREO) || ''; } catch (e) { return ''; } }
function recordarCorreo(c) { try { c ? localStorage.setItem(LLAVE_CORREO, c) : localStorage.removeItem(LLAVE_CORREO); } catch (e) {} }

// ---------------------------------------------------------------- sesión

function marcarActividad() { try { sessionStorage.setItem(LLAVE_ACTIVIDAD, String(Date.now())); } catch (e) {} }

function sesionVencida() {
  try {
    const u = Number(sessionStorage.getItem(LLAVE_ACTIVIDAD) || 0);
    return !!u && (Date.now() - u) > MINUTOS_INACTIVIDAD * 60 * 1000;
  } catch (e) { return false; }
}

async function salir(motivo) {
  await sb.auth.signOut();
  try { sessionStorage.removeItem(LLAVE_ACTIVIDAD); } catch (e) {}
  location.href = 'index.html' + (motivo ? '?' + motivo + '=1' : '');
}

/** Para las páginas internas: exige sesión y perfil activo. Devuelve el perfil. */
async function exigirSesion() {
  const r = await sb.auth.getSession();
  const sesion = r.data.session;
  if (!sesion) { location.href = 'index.html'; return null; }
  if (sesionVencida()) { await salir('inactivo'); return null; }

  const p = await sb.from('perfiles').select('*').eq('id', sesion.user.id).single();
  if (p.error || !p.data || !p.data.activo || p.data.rol === 'Sin acceso') {
    await sb.auth.signOut();
    location.href = 'index.html?sinacceso=1';
    return null;
  }

  if (p.data.clave_temporal && !/restablecer\.html/.test(location.pathname)) {
    location.href = 'restablecer.html?temporal=1';
    return null;
  }

  marcarActividad();
  let ultimo = 0;
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      const ahora = Date.now();
      if (ahora - ultimo > 15000) { ultimo = ahora; marcarActividad(); }
    }, { passive: true });
  });
  setInterval(function () { if (sesionVencida()) salir('inactivo'); }, 30000);
  return p.data;
}
