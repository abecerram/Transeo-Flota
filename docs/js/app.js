/* TRANSEO PTY · Sistema de flota · app.js
 * El panel: menú por perfil, Inicio, Equipos con su línea de tiempo y Usuarios.
 */

let PERFIL = null;
const PERMISOS = { capturar: false, admin: false };
const ROLES = ['Administrador', 'Gerencia', 'Asistente', 'Contabilidad', 'Sin acceso'];
const TODOS = ['Administrador', 'Gerencia', 'Asistente', 'Contabilidad'];

// ------------------------------------------------------------------ íconos
const ICO = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  equipos: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  conductores: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>',
  documentos: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  inspeccion: '<path d="M14.5 6.5a4 4 0 0 0-5.6 5.3L3.5 17.2a1.7 1.7 0 0 0 2.4 2.4l5.4-5.4a4 4 0 0 0 5.3-5.6l-2.5 2.5-2.2-.4-.4-2.2z"/>',
  gastos: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/>',
  solicitudes: '<path d="M7 3h10v18l-3-2-2 2-2-2-3 2z"/><path d="M10 8h4M10 12h4"/>',
  beneficiarios: '<path d="M4 7h16v12H4z"/><path d="M8 7V5h8v2M4 12h16"/>',
  proyectos: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
  clientes: '<circle cx="9" cy="9" r="3"/><path d="M3 19c.8-3 3.2-5 6-5s5.2 2 6 5"/><circle cx="17" cy="8" r="2.4"/><path d="M16 13.5c2.4 0 4.3 1.6 5 4"/>',
  usuarios: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
};
function ico(k, t) {
  return '<svg width="' + (t || 18) + '" height="' + (t || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICO[k] + '</svg>';
}

// ------------------------------------------------------------------ secciones
// las que tienen "pronto" llegan en los paquetes siguientes
const SECCIONES = [
  { clave: 'inicio',        grupo: 'GENERAL',        titulo: 'Inicio', sub: 'La flota de un vistazo', roles: TODOS, abrir: mostrarInicio },
  { clave: 'equipos',       grupo: 'FLOTA',          titulo: 'Equipos', sub: 'Registro de la flota y hoja de vida de cada unidad', roles: TODOS, abrir: mostrarEquipos },
  { clave: 'conductores',   grupo: 'FLOTA',          catalogo: true, roles: TODOS },
  { clave: 'documentos',    grupo: 'FLOTA',          titulo: 'Documentos', pronto: true, roles: TODOS },
  { clave: 'inspeccion',    grupo: 'FLOTA',          titulo: 'Inspección y mantenimiento', pronto: true, roles: TODOS },
  { clave: 'gastos',        grupo: 'DINERO',         titulo: 'Gastos', pronto: true, roles: TODOS },
  { clave: 'solicitudes',   grupo: 'DINERO',         titulo: 'Solicitudes de pago', pronto: true, roles: TODOS },
  { clave: 'beneficiarios', grupo: 'CATÁLOGOS',      catalogo: true, roles: TODOS },
  { clave: 'proyectos',     grupo: 'CATÁLOGOS',      catalogo: true, roles: TODOS },
  { clave: 'clientes',      grupo: 'CATÁLOGOS',      catalogo: true, roles: TODOS },
  { clave: 'usuarios',      grupo: 'ADMINISTRACIÓN', titulo: 'Usuarios', sub: 'Quién entra y con qué perfil', roles: ['Administrador'], abrir: mostrarUsuarios }
];
const tituloDe = s => s.catalogo ? CATALOGOS[s.clave].titulo : s.titulo;
const subDe = s => s.catalogo ? CATALOGOS[s.clave].sub : s.sub;
const MENU_CORTO = { beneficiarios: 'Proveedores y beneficiarios' };

function pintarMenu(activa) {
  let h = '', grupo = '';
  SECCIONES.filter(s => s.roles.indexOf(PERFIL.rol) > -1).forEach(function (s) {
    if (s.grupo !== grupo) { grupo = s.grupo; h += '<div class="gm">' + esc(grupo) + '</div>'; }
    h += '<button data-s="' + s.clave + '" class="' + (s.clave === activa ? 'sel' : '') + (s.pronto ? ' pronto' : '') + '">' +
      ico(s.clave) + '<span>' + esc(MENU_CORTO[s.clave] || tituloDe(s)) + '</span>' + (s.pronto ? '<i>pronto</i>' : '') + '</button>';
  });
  $('menu').innerHTML = h;
}

function abrirSeccion(clave) {
  const s = SECCIONES.filter(x => x.clave === clave && !x.pronto && x.roles.indexOf(PERFIL.rol) > -1)[0] || SECCIONES[0];
  pintarMenu(s.clave);
  $('top-mod').textContent = tituloDe(s);
  $('titulo').textContent = tituloDe(s);
  $('subtitulo').textContent = subDe(s);
  $('encabezado').classList.toggle('oculto', s.clave === 'inicio');
  history.replaceState(null, '', '#' + s.clave);
  $('lateral').classList.remove('abierto');
  window.scrollTo(0, 0);
  if (s.catalogo) mostrarCatalogo(s.clave, $('contenido'));
  else s.abrir($('contenido'));
}

// ------------------------------------------------------------------ utilidades de datos
function situacionDocs(filas) {
  // la peor situación entre los documentos de un equipo
  if (!filas.length) return { c: '', t: 'sin documentos' };
  if (filas.some(d => d.situacion === 'Vencido')) return { c: 'rojo', t: 'hay vencidos' };
  if (filas.some(d => d.situacion === 'Por vencer')) return { c: 'ambar', t: 'uno vence pronto' };
  return { c: 'verde', t: 'al día' };
}
function cargando(cont, texto) { cont.innerHTML = '<div class="cargando"><div class="giro"></div> ' + esc(texto || 'Cargando...') + '</div>'; }

// ================================================================== INICIO
async function mostrarInicio(cont) {
  cargando(cont);
  const [eq, venc, ben, cond] = await Promise.all([
    sb.from('equipos').select('id, nombre, placa, estado, km_actual'),
    sb.from('vencimientos').select('*').in('situacion', ['Vencido', 'Por vencer']).order('vence'),
    sb.from('beneficiarios').select('id', { count: 'exact', head: true }).eq('estado', 'Activo'),
    sb.from('conductores').select('id, nombre, equipo_id').eq('estado', 'Activo')
  ]);
  if (eq.error) { cont.innerHTML = '<div class="mensaje error">' + esc(textoError(eq.error)) + '</div>'; return; }
  const equipos = eq.data || [], v = venc.data || [];
  const activos = equipos.filter(e => e.estado === 'Activo').length;
  const vencidos = v.filter(x => x.situacion === 'Vencido'), porVencer = v.filter(x => x.situacion === 'Por vencer');
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const fecha = new Date().toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long' });

  // lo que requiere atención
  const aten = [];
  vencidos.slice(0, 4).forEach(x => aten.push(['rojo', x.equipo + ' · ' + x.tipo.toLowerCase() + ' vencido', 'Venció el ' + fechaTexto(x.vence) + ' · hace ' + Math.abs(x.dias) + ' días', 'equipos']));
  porVencer.slice(0, 3).forEach(x => aten.push(['ambar', x.equipo + ' · ' + x.tipo.toLowerCase() + ' vence pronto', 'Vence el ' + fechaTexto(x.vence) + ' · faltan ' + x.dias + ' días', 'equipos']));
  equipos.filter(e => e.estado === 'En taller').forEach(e => aten.push(['ambar', e.nombre + ' en taller', 'Placa ' + e.placa, 'equipos']));
  const conConductor = new Set((cond.data || []).map(c => c.equipo_id));
  const sinConductor = equipos.filter(e => e.estado === 'Activo' && !conConductor.has(e.id));
  const pl = n => n === 1 ? '' : 's';
  if (sinConductor.length) aten.push(['', sinConductor.length + ' equipo' + pl(sinConductor.length) + ' sin conductor asignado', sinConductor.slice(0, 3).map(e => e.nombre).join(', ') + (sinConductor.length > 3 ? '…' : ''), 'conductores']);
  const sinKm = equipos.filter(e => !e.km_actual);
  if (sinKm.length) aten.push(['', sinKm.length + ' equipo' + pl(sinKm.length) + ' sin kilometraje', 'Anótelo en la ficha de cada uno para que avise el mantenimiento', 'equipos']);
  if (!v.length) aten.push(['', 'Todavía no hay documentos cargados', 'Llegan con el paquete de documentos por imagen', 'inicio']);

  const modulos = [
    ['equipos', 'Equipos', 'Registro de la flota y hoja de vida', vencidos.length ? 'Atención' : 'Al día', vencidos.length ? 'ambar' : 'verde'],
    ['conductores', 'Conductores', 'Quién maneja cada equipo', sinConductor.length ? sinConductor.length + ' equipo' + (sinConductor.length === 1 ? '' : 's') + ' sin conductor' : 'Al día', sinConductor.length ? 'ambar' : 'verde'],
    ['beneficiarios', 'Proveedores y beneficiarios', 'Todo a quien se le paga', (ben.count || 0) + ' registrados', 'verde'],
    ['proyectos', 'Proyectos', 'Nombre oficial, cliente y frentes', 'Catálogo', 'verde'],
    ['documentos', 'Documentos', 'Vencimientos, imágenes y renovaciones', 'Próximo paquete', ''],
    ['inspeccion', 'Inspección y mantenimiento', 'Revisión mensual y fallas', 'Próximo paquete', ''],
    ['gastos', 'Gastos', 'Capturas por registrar e historial', 'Próximo paquete', ''],
    ['solicitudes', 'Solicitudes de pago', 'Aprobación y pago', 'Próximo paquete', '']
  ];
  const pronto = new Set(SECCIONES.filter(s => s.pronto).map(s => s.clave));

  cont.innerHTML =
    '<div class="hero"><h2>' + saludo + ', ' + esc((PERFIL.nombre || PERFIL.correo).split(' ')[0]) + '</h2>' +
      '<div class="fecha">' + esc(fecha.charAt(0).toUpperCase() + fecha.slice(1)) + ' · ' + aten.length + ' asunto' + (aten.length === 1 ? '' : 's') + ' de la flota te esperan</div>' +
      '<div class="hero-k">' +
        '<div><b>' + activos + '/' + equipos.length + '</b><span>equipos activos</span></div>' +
        '<div><b>' + vencidos.length + '</b><span>documentos vencidos</span></div>' +
        '<div><b>' + porVencer.length + '</b><span>vencen en 30 días</span></div>' +
        '<div><b>' + (ben.count || 0) + '</b><span>beneficiarios</span></div>' +
      '</div></div>' +
    '<div class="dos-at"><div class="tarjeta"><div class="sec">Módulos</div><div class="modulos">' +
      modulos.map(x => '<button class="modu' + (pronto.has(x[0]) ? ' pronto' : '') + '" data-ir="' + x[0] + '"><span class="modu-i">' + ico(x[0], 20) + '</span><b>' + esc(x[1]) + '</b>' +
        '<div class="gris">' + esc(x[2]) + '</div><div class="estado"><span class="pt ' + x[4] + '"></span>' + esc(x[3]) + '</div></button>').join('') +
    '</div></div>' +
    '<div class="aten"><div class="aten-c"><span>REQUIERE TU ATENCIÓN</span><b>' + aten.length + '</b></div>' +
      aten.map(a => '<div class="aten-i"><span class="pt ' + a[0] + '"></span><div><b>' + esc(a[1]) + '</b><div class="gris">' + esc(a[2]) + '</div>' +
        (a[3] !== 'inicio' ? '<div class="acciones" style="margin-top:8px"><button class="btn suave chico" data-ir="' + a[3] + '">Ver</button></div>' : '') + '</div></div>').join('') +
    '</div></div>';

  cont.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', function () {
    if (!pronto.has(b.dataset.ir)) abrirSeccion(b.dataset.ir);
  }));
}

// ================================================================== EQUIPOS · lista y línea de tiempo
const EQ = { lista: [], docs: [], cond: [], plan: [], sel: null, pestana: 'Línea de tiempo' };

async function mostrarEquipos(cont) {
  cargando(cont, 'Cargando la flota...');
  const [eq, docs, cond, plan] = await Promise.all([
    sb.from('equipos').select('*').order('codigo'),
    sb.from('vencimientos').select('*'),
    sb.from('conductores').select('id, nombre, equipo_id, celular').eq('estado', 'Activo'),
    sb.from('proximos_servicios').select('*').order('orden')
  ]);
  if (eq.error) { cont.innerHTML = '<div class="mensaje error">' + esc(textoError(eq.error)) + '</div>'; return; }
  EQ.lista = eq.data; EQ.docs = docs.data || []; EQ.cond = cond.data || []; EQ.plan = plan.data || [];
  CAT_ESTADO.equipos = EQ.lista;
  if (!EQ.sel || !EQ.lista.some(e => e.id === EQ.sel)) EQ.sel = EQ.lista.length ? EQ.lista[0].id : null;

  cont.innerHTML =
    '<div id="cat-lista"><div class="barra-herramientas"><input id="eq-buscar" placeholder="Buscar por nombre, placa o marca">' +
      (PERMISOS.capturar ? '<button class="btn" id="eq-nuevo">Agregar equipo</button>' : '') + '</div>' +
    '<div class="md"><div class="tarjeta lista" id="eq-lista"></div><div class="tarjeta" id="eq-ficha"></div></div></div>' +
    '<div class="tarjeta oculto" id="cat-form"></div>';

  RECARGA.equipos = function () { mostrarEquipos($('contenido')); };
  $('eq-buscar').addEventListener('input', pintarListaEq);
  if ($('eq-nuevo')) $('eq-nuevo').addEventListener('click', function () { abrirFormulario('equipos', null); });
  pintarListaEq();
  pintarFichaEq();
}

function pintarListaEq() {
  const q = ($('eq-buscar').value || '').toLowerCase().trim();
  const filas = EQ.lista.filter(e => !q || [e.nombre, e.placa, e.marca, e.modelo, e.codigo].join(' ').toLowerCase().indexOf(q) > -1);
  if (!filas.length) { $('eq-lista').innerHTML = '<div class="vacio">' + (EQ.lista.length ? 'Nada coincide.' : 'Todavía no hay equipos.') + '</div>'; return; }
  $('eq-lista').innerHTML = filas.map(function (e) {
    const s = situacionDocs(EQ.docs.filter(d => d.equipo_id === e.id));
    return '<div class="li' + (e.id === EQ.sel ? ' sel' : '') + '" data-eq="' + e.id + '"><div><b>' + esc(e.nombre) + '</b><div class="mono">' + esc(e.placa) + '</div></div>' +
      '<span class="pt ' + s.c + '" title="Documentos: ' + esc(s.t) + '"></span></div>';
  }).join('');
  $('eq-lista').querySelectorAll('[data-eq]').forEach(li => li.addEventListener('click', function () {
    EQ.sel = Number(li.dataset.eq); pintarListaEq(); pintarFichaEq();
    if (window.innerWidth < 860) $('eq-ficha').scrollIntoView({ behavior: 'smooth' });
  }));
}

async function pintarFichaEq() {
  const f = $('eq-ficha');
  const e = EQ.lista.filter(x => x.id === EQ.sel)[0];
  if (!e) { f.innerHTML = '<div class="vacio">Escoja un equipo de la lista.</div>'; return; }
  const cond = EQ.cond.filter(c => c.equipo_id === e.id)[0];
  const docs = EQ.docs.filter(d => d.equipo_id === e.id);
  const plan = EQ.plan.filter(p => p.equipo_id === e.id);
  const conKm = plan.filter(p => p.km_restantes !== null).sort((a, b) => a.km_restantes - b.km_restantes);
  const s = situacionDocs(docs);
  const pestanas = ['Línea de tiempo', 'Datos', 'Mantenimiento', 'Documentos'];

  f.innerHTML =
    '<div class="ficha-cab"><div class="icono">' + marca('escudo', 30) + '</div><div class="t"><div class="tit2">' + esc(e.nombre) +
      ' <span class="mono gris" style="font-size:14px">· ' + esc(e.placa) + '</span></div><div class="gris">' +
      esc([e.marca, e.modelo, e.anio].filter(Boolean).join(' · ') || e.tipo) + ' · ' + esc(cond ? cond.nombre : 'sin conductor asignado') + '</div></div>' +
      '<span class="etiqueta ' + (e.estado === 'Activo' ? 'bien' : 'urgente') + '">' + esc(e.estado.toUpperCase()) + '</span>' +
      (PERMISOS.capturar ? '<button class="btn claro chico" id="eq-editar">Editar</button>' : '') + '</div>' +
    '<div class="cifras">' +
      '<div><b>' + km(e.km_actual) + '</b><span>kilómetros</span></div>' +
      '<div><b>' + (conKm.length ? km(conKm[0].km_restantes) : '-') + '</b><span>' + (conKm.length ? 'km para ' + esc(conKm[0].servicio.toLowerCase()) : 'próximo servicio: falta el último') + '</span></div>' +
      '<div><b>' + docs.length + '</b><span>documentos · ' + esc(s.t) + '</span></div>' +
      '<div><b>' + esc(e.tipo) + '</b><span>' + esc(e.combustible || 'tipo de equipo') + '</span></div>' +
    '</div>' +
    '<div class="tabs">' + pestanas.map(p => '<button class="' + (p === EQ.pestana ? 'sel' : '') + '" data-p="' + p + '">' + p + '</button>').join('') + '</div>' +
    '<div id="eq-pestana"></div>';

  f.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', function () { EQ.pestana = b.dataset.p; pintarFichaEq(); }));
  if ($('eq-editar')) $('eq-editar').addEventListener('click', function () { abrirFormulario('equipos', e); });
  const c = $('eq-pestana');

  if (EQ.pestana === 'Datos') {
    const d = [['Código', e.codigo], ['Placa', e.placa], ['Tipo', e.tipo], ['Marca', e.marca], ['Modelo', e.modelo], ['Año', e.anio],
      ['Color', e.color], ['Combustible', e.combustible], ['Transmisión', e.transmision], ['Cilindros', e.cilindros], ['Ejes', e.ejes],
      ['Chasis', e.chasis], ['Motor', e.motor], ['Alto', e.alto_m && e.alto_m + ' m'], ['Ancho', e.ancho_m && e.ancho_m + ' m'], ['Largo', e.largo_m && e.largo_m + ' m'],
      ['Peso bruto', e.peso_bruto_t && e.peso_bruto_t + ' t'], ['Peso vacío', e.peso_vacio_t && e.peso_vacio_t + ' t'], ['Carga útil', e.carga_util_t && e.carga_util_t + ' t'],
      ['Propietario', e.propietario], ['Conductor', cond && cond.nombre]];
    c.innerHTML = '<div class="datos-g">' + d.map(x => '<div class="dato"><span>' + x[0] + '</span><b' + (/Chasis|Motor|Placa/.test(x[0]) ? ' class="mono"' : '') + '>' +
      esc(x[1] === null || x[1] === undefined || x[1] === '' ? '—' : x[1]) + '</b></div>').join('') + '</div>' +
      (e.notas ? '<div class="mensaje" style="margin-top:14px">' + esc(e.notas) + '</div>' : '');
    return;
  }

  if (EQ.pestana === 'Mantenimiento') {
    if (!plan.length) { c.innerHTML = '<div class="vacio">Este tipo de equipo todavía no tiene plan preventivo.</div>'; return; }
    c.innerHTML = '<div class="gris" style="margin-bottom:10px">Por kilómetros o por fecha, lo que llegue primero. Anote el último servicio y el sistema calcula el próximo.</div>' +
      '<div class="tabla-caja"><table class="datos"><tr><th>Servicio</th><th>Cada</th><th>Último · km</th><th>Último · fecha</th><th>Próximo</th><th></th></tr>' +
      plan.map(function (p) {
        const d = diasHasta(p.proxima_fecha);
        let est = '<span class="etiqueta">falta el último</span>';
        const rojo = (p.km_restantes !== null && p.km_restantes < 0) || (d !== null && d < 0);
        const ambar = (p.km_restantes !== null && p.km_restantes <= 500) || (d !== null && d <= 30);
        if (p.proximo_km !== null || p.proxima_fecha) est = '<span class="etiqueta ' + (rojo ? 'vencido' : ambar ? 'urgente' : 'bien') + '">' +
          (p.km_restantes !== null ? (p.km_restantes < 0 ? 'pasado ' + km(-p.km_restantes) + ' km' : 'faltan ' + km(p.km_restantes) + ' km') : '') +
          (p.km_restantes !== null && d !== null ? ' · ' : '') + (d !== null ? (d < 0 ? 'vencido' : fechaTexto(p.proxima_fecha)) : '') + '</span>';
        const dis = PERMISOS.capturar ? '' : ' disabled';
        return '<tr data-plan="' + p.id + '"><td><b>' + esc(p.servicio) + '</b></td>' +
          '<td class="gris">' + [p.cada_km ? km(p.cada_km) + ' km' : '', p.cada_meses ? p.cada_meses + ' meses' : ''].filter(Boolean).join(' o ') + '</td>' +
          '<td><input class="p-km" type="number" value="' + (p.ultimo_km || '') + '" style="width:110px;height:34px;border:1.5px solid var(--bf);border-radius:8px;padding:0 8px"' + dis + '></td>' +
          '<td><input class="p-fecha" type="date" value="' + (p.ultima_fecha || '') + '" style="height:34px;border:1.5px solid var(--bf);border-radius:8px;padding:0 8px"' + dis + '></td>' +
          '<td>' + est + '</td><td>' + (PERMISOS.capturar ? '<button class="btn suave chico p-guardar">Guardar</button>' : '') + '</td></tr>';
      }).join('') + '</table></div>';
    c.querySelectorAll('.p-guardar').forEach(b => b.addEventListener('click', async function () {
      const tr = b.closest('tr');
      const kmv = tr.querySelector('.p-km').value, fv = tr.querySelector('.p-fecha').value;
      b.disabled = true;
      const r = await sb.from('plan_equipo').update({ ultimo_km: kmv ? Number(kmv) : null, ultima_fecha: fv || null }).eq('id', Number(tr.dataset.plan));
      b.disabled = false;
      if (r.error) { aviso(textoError(r.error), 'error'); return; }
      aviso('Servicio anotado.', 'ok');
      const p2 = await sb.from('proximos_servicios').select('*').order('orden');
      if (!p2.error) EQ.plan = p2.data;
      pintarFichaEq();
    }));
    return;
  }

  if (EQ.pestana === 'Documentos') {
    c.innerHTML = (docs.length ? '<div class="tabla-caja"><table class="datos"><tr><th>Documento</th><th>Número</th><th>Vence</th><th>Situación</th></tr>' +
      docs.map(d => '<tr><td><b>' + esc(d.tipo) + '</b></td><td class="mono">' + esc(d.numero || '—') + '</td><td>' + (d.vence ? fechaTexto(d.vence) : 'no vence') + '</td>' +
        '<td><span class="etiqueta ' + (d.situacion === 'Vencido' ? 'vencido' : d.situacion === 'Por vencer' ? 'urgente' : 'bien') + '">' + esc(d.situacion.toUpperCase()) + '</span></td></tr>').join('') +
      '</table></div>' : '<div class="vacio">Todavía no hay documentos cargados para este equipo.</div>') +
      '<div class="mensaje" style="margin-top:14px">La carga de documentos por imagen, con su lectura automática y los avisos por correo, llega en el próximo paquete.</div>';
    return;
  }

  // línea de tiempo
  c.innerHTML = '<div class="cargando"><div class="giro"></div> Armando la historia...</div>';
  const r = await sb.from('linea_tiempo').select('*').eq('equipo_id', e.id).order('fecha', { ascending: false }).limit(60);
  if (EQ.sel !== e.id || EQ.pestana !== 'Línea de tiempo') return;
  if (r.error) { c.innerHTML = '<div class="mensaje error">' + esc(textoError(r.error)) + '</div>'; return; }
  if (!r.data.length) {
    c.innerHTML = '<div class="vacio">Todavía no hay movimientos. Aquí irán apareciendo, en orden, los gastos, documentos, fallas, inspecciones y órdenes de este equipo.</div>';
    return;
  }
  c.innerHTML = '<div class="linea">' + r.data.map(x => '<div class="lt"><span class="lt-p ' + esc(x.tipo) + '"></span><span class="mono gris">' + fechaTexto(x.fecha) +
    '</span><span><b style="color:var(--azul)">' + esc(x.tipo) + '</b> · ' + esc(x.texto) + '</span></div>').join('') + '</div>';
}

// ================================================================== USUARIOS
async function mostrarUsuarios(cont) {
  cargando(cont, 'Cargando usuarios...');
  const r = await sb.from('perfiles').select('*').order('creado_en');
  if (r.error) { cont.innerHTML = '<div class="mensaje error">' + esc(textoError(r.error)) + '</div>'; return; }
  const est = 'height:38px;border:1.5px solid var(--bf);border-radius:10px;padding:0 10px;font:13.5px var(--f)';
  const filas = r.data.map(function (u) {
    const mio = u.id === PERFIL.id;
    return '<tr data-id="' + u.id + '">' +
      '<td><input class="u-nombre" value="' + esc(u.nombre || '') + '" style="' + est + ';width:100%"></td>' +
      '<td class="mono" style="font-size:12.5px">' + esc(u.correo) + '</td>' +
      '<td><select class="u-rol" style="' + est + '"' + (mio ? ' disabled' : '') + '>' +
        ROLES.map(x => '<option' + (x === u.rol ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></td>' +
      '<td><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" class="u-activo"' + (u.activo ? ' checked' : '') + (mio ? ' disabled' : '') +
        ' style="width:18px;height:18px;accent-color:var(--azul)"> Puede entrar</label></td>' +
      '<td style="text-align:right"><button class="btn chico u-guardar">Guardar</button></td></tr>';
  }).join('');
  cont.innerHTML =
    '<div class="mensaje">Para agregar a alguien: en Supabase, <b>Authentication → Users → Invite user</b>, con su correo. Le llega la invitación, ' +
    'crea su clave y aparece aquí como <b>Sin acceso</b>. Ahí le asigna su perfil y marca <b>Puede entrar</b>.</div>' +
    '<div class="tarjeta"><div class="tabla-caja"><table class="datos"><tr><th>Nombre</th><th>Correo</th><th>Perfil</th><th>Acceso</th><th></th></tr>' +
    filas + '</table></div></div>';
  cont.querySelectorAll('.u-guardar').forEach(b => b.addEventListener('click', async function () {
    const tr = b.closest('tr');
    const cambios = { nombre: tr.querySelector('.u-nombre').value.trim() || null };
    if (tr.dataset.id !== PERFIL.id) { cambios.rol = tr.querySelector('.u-rol').value; cambios.activo = tr.querySelector('.u-activo').checked; }
    b.disabled = true;
    const u = await sb.from('perfiles').update(cambios).eq('id', tr.dataset.id);
    b.disabled = false;
    aviso(u.error ? textoError(u.error) : 'Usuario actualizado.', u.error ? 'error' : 'ok');
  }));
}

// ================================================================== ARRANQUE
(async function () {
  $('logo-arranque').outerHTML = logoAnimado();
  PERFIL = await exigirSesion();
  if (!PERFIL) return;
  PERMISOS.capturar = ['Administrador', 'Asistente', 'Contabilidad'].indexOf(PERFIL.rol) > -1;
  PERMISOS.admin = PERFIL.rol === 'Administrador';

  const nombre = PERFIL.nombre || PERFIL.correo;
  $('quien').textContent = nombre + ' · ' + PERFIL.rol;
  $('iniciales').textContent = nombre.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  $('logo-top').innerHTML = marca('escudo', 30);
  $('btn-salir').addEventListener('click', function () { salir(); });
  $('boton-menu').addEventListener('click', function () { $('lateral').classList.toggle('abierto'); });
  $('menu').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-s]');
    if (b && !b.classList.contains('pronto')) abrirSeccion(b.dataset.s);
  });

  abrirSeccion(location.hash.replace('#', '') || PERFIL.pantalla_inicio || 'inicio');
  $('arranque').classList.add('oculto');
  $('panel').classList.remove('oculto');
})();
