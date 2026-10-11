/* GRUPO THELMAR · Portal · portal.js
 * Sesión, menú lateral, barra superior, tablero y piezas comunes.
 * Perfiles de Thelmar: Administrador, Gerencia, Planilla (Leidy) y Trabajador.
 */

const EMP = 'thelmar';
const MINUTOS_SIN_ACTIVIDAD = 60;
const S = { perfil: null, rol: null, empresas: [], page: 'tablero', params: null };
const LOCK = '<svg class="lk" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.5" width="8" height="5.5" rx="1.2" fill="currentColor"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

const puedePlanilla = () => S.rol === 'Administrador' || S.rol === 'Planilla';
const vePersonal = () => puedePlanilla() || S.rol === 'Gerencia';
const esAdmin = () => S.rol === 'Administrador';

// ------------------------------------------------------------------ utilidades
const WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const pad2 = n => String(n).padStart(2, '0');
const pd = x => { const [y, m, d] = String(x).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const iso = dt => dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
const addD = (x, n) => { const d = pd(x); d.setDate(d.getDate() + n); return iso(d); };
const fdia = f => { const d = pd(f); return WD[d.getDay()] + ' ' + d.getDate() + '/' + pad2(d.getMonth() + 1); };
const dLargo = f => pd(f).toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long' });
const hm = t => t ? String(t).slice(0, 5) : '—';
const minDe = t => { if (!t) return null; const p = String(t).split(':'); return Number(p[0]) * 60 + Number(p[1]); };
const hdur = m => { if (m === null || m === undefined) return '—'; m = Math.max(0, Math.round(m)); return Math.floor(m / 60) + ':' + pad2(m % 60); };
const plata = v => 'B/. ' + (Math.round((v || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const am = t => { const m = minDe(t); if (m === null) return '—'; const h = Math.floor(m / 60); return ((h + 11) % 12 + 1) + ':' + pad2(m % 60) + (h >= 12 ? ' p. m.' : ' a. m.'); };

function toast(texto, tipo) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = texto;
  t.style.borderLeftColor = tipo === 'error' ? 'var(--bad)' : 'var(--lime)';
  t.classList.remove('oculto');
  clearTimeout(t._h);
  t._h = setTimeout(function () { t.classList.add('oculto'); }, tipo === 'error' ? 7000 : 3600);
}

/** Avisa el error de Supabase con palabras claras. Devuelve true si hubo error. */
function fallo(r) {
  if (r && r.error) { toast(textoError(r.error), 'error'); return true; }
  return false;
}

/** Panel lateral derecho (detalle o formulario). */
function abrirPanel(titulo, sub, cuerpo) {
  $('capa').innerHTML = '<div class="drawer" id="fondo-panel"><div class="pane" role="dialog" aria-label="' + esc(titulo) + '">' +
    '<div class="ph"><div><h3>' + esc(titulo) + '</h3><small>' + (sub || '') + '</small></div><button type="button" id="cerrar-panel">Cerrar</button></div>' +
    '<div class="pb" id="panel-cuerpo">' + cuerpo + '</div></div></div>';
  $('cerrar-panel').addEventListener('click', cerrarPanel);
  $('fondo-panel').addEventListener('click', function (e) { if (e.target.id === 'fondo-panel') cerrarPanel(); });
  return $('panel-cuerpo');
}
function cerrarPanel() { $('capa').innerHTML = ''; }

function cargando(el, texto) { el.innerHTML = '<div class="pg"><div class="cargando">' + esc(texto || 'Cargando...') + '</div></div>'; }

// ------------------------------------------------------------------ sesión
function marcarUso() { try { sessionStorage.setItem('transeo_actividad', String(Date.now())); } catch (e) {} }
function sinUso() {
  try { const u = Number(sessionStorage.getItem('transeo_actividad') || 0); return !!u && Date.now() - u > MINUTOS_SIN_ACTIVIDAD * 60000; }
  catch (e) { return false; }
}

async function exigirSesionThelmar() {
  const m = await misEmpresas();
  if (!m) { location.href = 'index.html'; return null; }
  if (sinUso()) { await salir('inactivo'); return null; }
  if (!m.perfil || !m.perfil.activo) { await sb.auth.signOut(); location.href = 'index.html?sinacceso=1'; return null; }
  if (m.perfil.clave_temporal) { location.href = 'restablecer.html?temporal=1'; return null; }
  const aqui = m.empresas.filter(function (e) { return e.id === EMP; })[0];
  if (!aqui) { await sb.auth.signOut(); location.href = 'index.html?sinacceso=1'; return null; }
  marcarUso();
  let ultimo = 0;
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) {
    document.addEventListener(ev, function () { const a = Date.now(); if (a - ultimo > 15000) { ultimo = a; marcarUso(); } }, { passive: true });
  });
  setInterval(function () { if (sinUso()) salir('inactivo'); }, 30000);
  return { perfil: m.perfil, rol: aqui.rol, empresas: m.empresas };
}

// ------------------------------------------------------------------ menú
function menu() {
  const prin = [['tablero', 'Tablero'], ['agenda', 'Mi agenda']];
  if (puedePlanilla()) prin.push(['asistencia', 'Asistencia y planilla']);
  else if (S.rol === 'Gerencia') prin.push(['horas', 'Horas del personal']);
  const M = [['Principal', prin],
    ['Obras', [['obras', 'Proyectos y obras', 1], ['presu', 'Presupuestos', 1], ['avance', 'Avance de obra', 1], ['planos', 'Planos y documentos', 1]]],
    ['Operación', [['solic', 'Solicitudes de pago', 1], ['compras', 'Compras', 1], ['almacen', 'Almacén', 1], ['maq', 'Maquinaria y equipo', 1], ['sub', 'Subcontratistas', 1]]],
    ['Gestión', [['sso', 'Seguridad y salud', 1], ['calidad', 'Calidad', 1], ['rrhh', 'Recursos humanos', 1], ['rep', 'Reportes', 1]]]];
  if (esAdmin()) M.push(['Administración', [['config', 'Configuración'], ['usuarios', 'Usuarios']]]);
  return M;
}
function nombrePagina(k) { for (const g of menu()) for (const i of g[1]) if (i[0] === k) return i[1]; return k; }

function pintarMenu() {
  $('menu').innerHTML = menu().map(function (g) {
    return '<div class="grp"><span class="gt">' + g[0] + '</span>' + g[1].map(function (i) {
      return '<button type="button" data-page="' + i[0] + '" class="' + (i[2] ? 'locked' : '') + '"' + (S.page === i[0] ? ' aria-current="page"' : '') +
        '><span class="dt"></span>' + esc(i[1]) + (i[2] ? LOCK : '') + '</button>';
    }).join('') + '</div>';
  }).join('') + '<div class="soon">Los módulos con candado están en construcción.</div>';
}

const VISTAS = {};
async function abrir(page) {
  const valida = menu().some(function (g) { return g[1].some(function (i) { return i[0] === page; }); });
  S.page = valida ? page : 'tablero';
  try { history.replaceState(null, '', '#' + S.page); } catch (e) {}
  pintarMenu();
  cerrarPanel();
  const el = $('contenido');
  const v = VISTAS[S.page];
  if (v) await v(el); else vistaEnConstruccion(el, S.page);
  window.scrollTo(0, 0);
}

function vistaEnConstruccion(el, k) {
  el.innerHTML = '<div class="pg"><div class="wip"><div class="stripes" aria-hidden="true"></div><span class="badge">En construcción</span><h3>' +
    esc(nombrePagina(k)) + '</h3><p>Este módulo forma parte del sistema de Thelmar Panamá y se está construyendo.</p>' +
    '<div><button class="btn lime" type="button" data-page="tablero">Volver al tablero</button></div></div></div>';
}

// ------------------------------------------------------------------ tablero
VISTAS.tablero = async function (el) {
  cargando(el);
  const hoy = hoyPanama();
  const nombre = (S.perfil.nombre || S.perfil.correo).split(' ')[0];
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Panama', hour: 'numeric', hour12: false }));
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';

  const pedidos = [sb.from('grupo_agenda').select('*').eq('empresa_id', EMP).gte('fecha', hoy).eq('hecha', false).order('fecha').order('desde').limit(5)];
  if (vePersonal()) {
    pedidos.push(sb.from('personal_trabajadores').select('id', { count: 'exact', head: true }).eq('empresa_id', EMP).eq('estado', 'Activo'));
    pedidos.push(sb.from('personal_dias').select('estado, llego_tarde').eq('empresa_id', EMP).eq('fecha', hoy));
    pedidos.push(sb.from('personal_dias').select('trabajador_id', { count: 'exact', head: true }).eq('empresa_id', EMP)
      .gte('fecha', addD(hoy, -31)).in('estado', ['Sin salida', 'Sin conexión']));
  }
  const r = await Promise.all(pedidos);
  const ag = r[0].data || [];

  let equipo = '';
  if (vePersonal()) {
    const total = r[1].count || 0, dias = r[2].data || [], pend = r[3].count || 0;
    const pres = dias.filter(function (d) { return d.estado !== 'Ausencia' && d.estado !== 'Sin marca'; }).length;
    const tarde = dias.filter(function (d) { return d.llego_tarde; }).length;
    equipo = '<div class="hello"><div><b>El equipo hoy</b><span>' + pres + ' de ' + total + ' han encendido su computadora · ' + tarde +
      ' llegada' + (tarde === 1 ? '' : 's') + ' tarde' + (puedePlanilla() ? ' · ' + pend + ' marca' + (pend === 1 ? '' : 's') + ' por revisar en el último mes' : '') +
      '</span></div><button class="btn lime sm" type="button" data-page="' + (puedePlanilla() ? 'asistencia' : 'horas') + '">' +
      (puedePlanilla() ? 'Ir a asistencia y planilla' : 'Ver horas del personal') + '</button></div>';
  }

  el.innerHTML = '<div class="pg"><div class="pg-h"><div><h2>' + saludo + ', ' + esc(nombre) + '</h2><p>' +
    esc(dLargo(hoy).charAt(0).toUpperCase() + dLargo(hoy).slice(1)) + ' · ' + esc(S.rol) + '</p></div></div>' + equipo +
    '<div class="g2"><div class="card"><div class="cap"><b>Mis próximas actividades</b><button class="icb" type="button" data-page="agenda">Ver mi agenda</button></div><div>' +
    (ag.length ? ag.map(function (a) {
      return '<button type="button" class="ev" data-page="agenda" style="border:0;border-top:1px solid var(--rule);background:transparent;width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit">' +
        '<time>' + pd(a.fecha).getDate() + '/' + pad2(pd(a.fecha).getMonth() + 1) + '</time><span>' + esc(a.titulo) + '<small>' + am(a.desde) + (a.lugar ? ' · ' + esc(a.lugar) : '') + '</small></span></button>';
    }).join('') : '<div class="vacio">No tiene actividades pendientes. Agéndelas en Mi agenda.</div>') +
    '</div></div><div class="card"><div class="cap"><b>Módulos de la constructora</b><small>En construcción</small></div><div class="vacio">' +
    'Proyectos y obras, presupuestos, avance de obra, compras, almacén y los demás módulos se irán abriendo en el menú de la izquierda.</div></div></div></div>';
};

// ------------------------------------------------------------------ cambiar empresa y aviso de entrada
function pintarEmpresas() {
  if (S.empresas.length < 2) return;
  $('btn-empresa').classList.remove('oculto');
  $('menu-empresas').innerHTML = '<div class="cap">Sus empresas</div>' + S.empresas.map(function (e) {
    return '<button type="button" data-emp="' + e.id + '"><span>' + esc(NOMBRE_EMPRESA[e.id]) + '<br><small style="font:400 12px var(--font-body);color:var(--ink-2)">' +
      esc(QUE_HACE[e.id]) + '</small></span>' + (e.id === EMP ? '<span class="here">Aquí</span>' : '') + '</button>';
  }).join('');
}

async function pintarAvisoEntrada() {
  if (S.rol !== 'Trabajador' || !S.params || !S.params.aviso_trabajador) return;
  const r = await sb.rpc('personal_mi_entrada_hoy', { p_empresa: EMP });
  if (r.data) $('aviso-entrada').innerHTML = '<div class="stamp"><i>✓</i><span>Tu entrada quedó registrada hoy a las <b>' + am(r.data) + '</b></span></div>';
}

// ------------------------------------------------------------------ arranque
async function arrancar() {
  const s = await exigirSesionThelmar();
  if (!s) return;
  S.perfil = s.perfil; S.rol = s.rol; S.empresas = s.empresas;
  const p = await sb.from('personal_parametros').select('*').eq('empresa_id', EMP).maybeSingle();
  S.params = p.data || {};

  const nombre = S.perfil.nombre || S.perfil.correo;
  $('iniciales').textContent = iniciales(nombre);
  $('iniciales').title = nombre + ' · ' + S.rol;
  $('btn-salir').addEventListener('click', function () { salir(); });
  pintarEmpresas();
  pintarAvisoEntrada();

  document.addEventListener('click', async function (ev) {
    const pg = ev.target.closest('[data-page]');
    if (pg && !pg.classList.contains('locked')) { ev.preventDefault(); abrir(pg.dataset.page); return; }
    if (pg && pg.classList.contains('locked')) { abrir(pg.dataset.page); return; }
    const be = ev.target.closest('#btn-empresa');
    if (be) { $('menu-empresas').classList.toggle('oculto'); be.setAttribute('aria-expanded', String(!$('menu-empresas').classList.contains('oculto'))); return; }
    const em = ev.target.closest('[data-emp]');
    if (em) { if (em.dataset.emp !== EMP) { await guardarPrincipal(em.dataset.emp); irA(em.dataset.emp); } else $('menu-empresas').classList.add('oculto'); return; }
    if (!ev.target.closest('#menu-empresas')) $('menu-empresas').classList.add('oculto');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarPanel(); });

  await abrir(location.hash.replace('#', '') || 'tablero');
  $('arranque').classList.add('oculto');
  $('portal').classList.remove('oculto');
}
