/* GRUPO THELMAR · Portal · grupo.js
 * Lo que comparten las páginas del portal: a qué empresas entra cada quien,
 * la empresa principal y la sesión. Usa js/comun.js de Transeo (conexión,
 * mensajes y utilidades), así una misma cuenta sirve para las dos.
 */

const LOGO_THM = 'logo.png';
const NOMBRE_EMPRESA = { thelmar: 'Thelmar Panamá', transeo: 'Transeo', viviendas: 'Viviendas Ecológicas' };
const QUE_HACE = { thelmar: 'Ingeniería y construcción', transeo: 'Transporte y equipo pesado', viviendas: 'Proyectos de vivienda' };
// páginas listas de cada empresa (las demás aún no tienen sistema)
const DESTINO = { thelmar: 'app.html', transeo: '../app.html' };

/** Perfil, empresas a las que entra y su principal. */
async function misEmpresas() {
  const ses = (await sb.auth.getSession()).data.session;
  if (!ses) return null;
  const [p, a, pref] = await Promise.all([
    sb.from('perfiles').select('*').eq('id', ses.user.id).single(),
    sb.from('grupo_accesos').select('empresa_id, rol, activo').eq('usuario_id', ses.user.id).eq('activo', true),
    sb.from('grupo_preferencias').select('empresa_principal').eq('usuario_id', ses.user.id).maybeSingle()
  ]);
  if (p.error || !p.data) return { perfil: null, empresas: [] };
  const empresas = [];
  if (p.data.activo) {
    (a.data || []).forEach(function (x) { if (DESTINO[x.empresa_id]) empresas.push({ id: x.empresa_id, rol: x.rol }); });
    if (p.data.rol && p.data.rol !== 'Sin acceso') empresas.push({ id: 'transeo', rol: p.data.rol });
  }
  empresas.sort(function (x, y) { return x.id === 'thelmar' ? -1 : y.id === 'thelmar' ? 1 : 0; });
  return { sesion: ses, perfil: p.data, empresas: empresas, principal: pref.data ? pref.data.empresa_principal : null };
}

async function guardarPrincipal(id) {
  const ses = (await sb.auth.getSession()).data.session;
  if (!ses) return;
  await sb.from('grupo_preferencias').upsert({ usuario_id: ses.user.id, empresa_principal: id, actualizado_en: new Date().toISOString() });
}

function irA(id) { location.href = DESTINO[id] || 'index.html'; }

function iniciales(nombre) {
  return String(nombre || '').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join('');
}

function pantallaCarga(texto) {
  const c = document.createElement('div');
  c.className = 'cargando-acceso';
  c.innerHTML = '<img src="' + LOGO_THM + '" alt="" style="height:54px;filter:brightness(0) invert(1)"><div class="barra"><i></i></div><div>' + esc(texto || 'Entrando...') + '</div>';
  document.body.appendChild(c);
  return c;
}

/** Fecha de hoy en Panamá, AAAA-MM-DD. */
function hoyPanama() {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}
