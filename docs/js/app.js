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
// Como en el sistema anterior: se crea la persona, el sistema le da una clave
// temporal, se le entrega, y ella la cambia al entrar por primera vez.
const USU = { lista: [] };

async function llamarAdmin(cuerpo) {
  const r = await sb.functions.invoke('admin-usuarios', { body: cuerpo });
  if (r.error) {
    let m = r.error.message;
    try { const j = await r.error.context.json(); if (j && j.mensaje) m = j.mensaje; } catch (e) {}
    if (/Failed to send a request|not found|404/i.test(m)) m = 'La función del servidor todavía no está instalada en Supabase.';
    return { ok: false, mensaje: m };
  }
  return r.data || { ok: false, mensaje: 'Sin respuesta del servidor.' };
}

async function mostrarUsuarios(cont) {
  cargando(cont, 'Cargando usuarios...');
  const r = await sb.rpc('admin_usuarios');
  if (r.error) { cont.innerHTML = '<div class="mensaje error">' + esc(textoError(r.error)) + '</div>'; return; }
  USU.lista = r.data || [];
  cont.innerHTML =
    '<div id="usu-lista"><div class="barra-herramientas"><input id="usu-buscar" placeholder="Buscar por nombre o correo">' +
      '<button class="btn" id="usu-nuevo">Crear usuario</button></div>' +
    '<div class="tarjeta"><div class="tabla-caja" id="usu-tabla"></div>' +
      '<div class="mensaje" style="margin:16px 0 0">Desactivar impide entrar y conserva la ficha. Borrar elimina la cuenta, pero la bitácora guarda igual todo lo que esa persona hizo.</div></div></div>' +
    '<div class="tarjeta oculto" id="usu-form"></div>';
  $('usu-buscar').addEventListener('input', pintarUsuarios);
  $('usu-nuevo').addEventListener('click', function () { formUsuario(null); });
  pintarUsuarios();
}

function estadoUsuario(u) {
  if (u.bloqueado) return '<span class="etiqueta vencido">BLOQUEADO</span>';
  if (!u.activo) return '<span class="etiqueta">' + (u.rol === 'Sin acceso' ? 'SIN ACCESO' : 'INACTIVO') + '</span>';
  if (u.clave_temporal) return '<span class="etiqueta urgente">CLAVE TEMPORAL</span>';
  return '<span class="etiqueta bien">ACTIVO</span>';
}

function pintarUsuarios() {
  const q = ($('usu-buscar').value || '').toLowerCase().trim();
  const filas = USU.lista.filter(u => !q || [u.nombre, u.correo].join(' ').toLowerCase().indexOf(q) > -1);
  if (!filas.length) { $('usu-tabla').innerHTML = '<div class="vacio">No hay usuarios.</div>'; return; }
  $('usu-tabla').innerHTML = '<table class="datos"><tr><th>Nombre</th><th>Perfil</th><th>Celular</th><th>Último acceso</th><th>Estado</th><th>Acciones</th></tr>' +
    filas.map(function (u) {
      const mio = u.id === PERFIL.id;
      const acceso = u.ultimo_acceso ? fechaTexto(u.ultimo_acceso) + ' · ' + new Date(u.ultimo_acceso).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' }) : 'Nunca';
      let acc = '<button class="btn claro chico" data-u="editar" data-id="' + u.id + '">Editar</button> ' +
        '<button class="btn claro chico" data-u="restablecer" data-id="' + u.id + '">Nueva clave</button>';
      if (u.bloqueado) acc += ' <button class="btn suave chico" data-u="desbloquear" data-id="' + u.id + '">Desbloquear</button>';
      if (!mio) {
        acc += u.activo ? ' <button class="btn claro chico" data-u="desactivar" data-id="' + u.id + '">Desactivar</button>'
                        : ' <button class="btn suave chico" data-u="reactivar" data-id="' + u.id + '">' + (u.rol === 'Sin acceso' ? 'Dar acceso' : 'Reactivar') + '</button>';
        acc += ' <button class="btn peligro chico" data-u="borrar" data-id="' + u.id + '">Borrar</button>';
      }
      return '<tr><td><b>' + esc(u.nombre || '—') + '</b>' + (mio ? ' <span class="gris">(usted)</span>' : '') +
        '<div class="mono gris" style="font-size:11.5px">' + esc(u.correo) + '</div></td>' +
        '<td>' + esc(u.rol) + '</td><td class="mono" style="font-size:12.5px">' + esc(u.celular || '—') + '</td>' +
        '<td class="gris">' + esc(acceso) + '</td><td>' + estadoUsuario(u) + '</td>' +
        '<td style="white-space:nowrap">' + acc + '</td></tr>';
    }).join('') + '</table>';
  $('usu-tabla').querySelectorAll('[data-u]').forEach(b => b.addEventListener('click', function () { accionUsuario(b.dataset.u, b.dataset.id, b); }));
}

function formUsuario(u) {
  const f = $('usu-form');
  const roles = ROLES.filter(r => r !== 'Sin acceso');
  const v = (k) => esc(u && u[k] ? u[k] : '');
  f.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h2 style="margin:0">' + (u ? esc(u.nombre || u.correo) : 'Nuevo usuario') + '</h2>' +
      '<button class="btn claro chico" id="usu-volver">Volver a la lista</button></div><div id="usu-msj"></div>' +
    '<div class="fila"><div class="campo"><label>Nombre completo *</label><input id="uf-nombre" value="' + v('nombre') + '" placeholder="Cristeen Santos"></div>' +
      '<div class="campo"><label>Correo *</label><input id="uf-correo" type="email" value="' + v('correo') + '" placeholder="nombre@correo.com"' + (u ? ' disabled' : '') + '>' +
        '<div class="ayuda">' + (u ? 'El correo no se cambia: es con el que entra.' : 'Cualquier correo que la persona revise. Es con el que entra.') + '</div></div>' +
      '<div class="campo"><label>Perfil *</label><select id="uf-rol">' + roles.map(r => '<option' + (u && u.rol === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></div></div>' +
    '<div class="fila"><div class="campo"><label>Cédula</label><input id="uf-cedula" value="' + v('cedula') + '" placeholder="8-888-8888"></div>' +
      '<div class="campo"><label>Celular</label><input id="uf-celular" value="' + v('celular') + '" placeholder="6000-0000" inputmode="numeric"></div></div>' +
    (u ? '' : '<div class="mensaje">Al crearlo, el sistema genera una <b>clave temporal</b>. Se la entrega a la persona, y ella la cambia al entrar por primera vez: usted nunca conoce su clave definitiva.</div>') +
    '<div class="acciones"><button class="btn" id="usu-guardar">' + (u ? 'Guardar cambios' : 'Crear usuario') + '</button><button class="btn claro" id="usu-cancelar">Cancelar</button></div>';
  $('usu-lista').classList.add('oculto'); f.classList.remove('oculto'); window.scrollTo(0, 0);
  const cerrar = function () { f.classList.add('oculto'); $('usu-lista').classList.remove('oculto'); };
  $('usu-volver').addEventListener('click', cerrar); $('usu-cancelar').addEventListener('click', cerrar);
  $('usu-guardar').addEventListener('click', async function () {
    const d = { nombre: $('uf-nombre').value.trim(), correo: $('uf-correo').value.trim().toLowerCase(), rol: $('uf-rol').value,
                cedula: $('uf-cedula').value.trim() || null, celular: $('uf-celular').value.trim() || null };
    if (!d.nombre) { pintarMensaje('usu-msj', 'Falta el nombre.', 'error'); return; }
    const btn = $('usu-guardar'); btn.disabled = true; btn.textContent = 'Guardando...';
    if (u) {
      const r = await sb.from('perfiles').update({ nombre: d.nombre, rol: d.rol, cedula: d.cedula, celular: d.celular }).eq('id', u.id);
      btn.disabled = false; btn.textContent = 'Guardar cambios';
      if (r.error) { pintarMensaje('usu-msj', esc(textoError(r.error)), 'error'); return; }
      aviso('Usuario actualizado.', 'ok');
      mostrarUsuarios($('contenido'));
      return;
    }
    if (!d.correo) { btn.disabled = false; btn.textContent = 'Crear usuario'; pintarMensaje('usu-msj', 'Falta el correo.', 'error'); return; }
    const r = await llamarAdmin(Object.assign({ accion: 'crear' }, d));
    btn.disabled = false; btn.textContent = 'Crear usuario';
    if (!r.ok) { pintarMensaje('usu-msj', esc(r.mensaje), 'error'); return; }
    await mostrarUsuarios($('contenido'));
    mostrarClave(d.nombre, d.correo, d.celular, r.clave, true);
  });
}

function mostrarClave(nombre, correo, celular, clave, nuevo) {
  const dir = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  const texto = 'Hola ' + nombre.split(' ')[0] + '. ' + (nuevo ? 'Ya tiene usuario en el sistema de flota de Transeo.' : 'Le generé una clave nueva para el sistema de flota de Transeo.') +
    '\nEntre en: ' + dir + '\nCorreo: ' + correo + '\nClave temporal: ' + clave + '\nAl entrar, el sistema le pide escoger su propia clave.';
  const cel = String(celular || '').replace(/\D/g, '');
  const f = document.createElement('div');
  f.className = 'fondo-ventana';
  f.innerHTML = '<div class="ventana"><h3>' + (nuevo ? 'Usuario creado' : 'Clave temporal nueva') + '</h3>' +
    '<p>Entréguele esta clave a <b>' + esc(nombre) + '</b>. Solo se muestra esta vez; al entrar, el sistema le pide cambiarla.</p>' +
    '<div style="margin:16px 0;background:var(--azc);border-radius:12px;padding:16px;text-align:center">' +
      '<div class="gris">Correo</div><div class="mono" style="font-size:14px;margin-bottom:10px">' + esc(correo) + '</div>' +
      '<div class="gris">Clave temporal</div><div class="mono" style="font-size:28px;font-weight:600;color:var(--azul);letter-spacing:.06em">' + esc(clave) + '</div></div>' +
    '<div class="acciones" style="margin-top:0"><button class="btn" data-a="copiar">Copiar mensaje</button>' +
      '<a class="btn suave" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" href="https://wa.me/' + (cel ? '507' + cel : '') + '?text=' + encodeURIComponent(texto) + '">Enviar por WhatsApp</a>' +
      '<button class="btn claro" data-a="cerrar">Listo</button></div></div>';
  f.addEventListener('click', async function (e) {
    const a = e.target.getAttribute('data-a');
    if (a === 'copiar') { try { await navigator.clipboard.writeText(texto); aviso('Mensaje copiado.', 'ok'); } catch (x) { aviso('No se pudo copiar; anótela.', 'error'); } }
    if (a === 'cerrar') f.remove();
  });
  document.body.appendChild(f);
}

async function accionUsuario(accion, id, btn) {
  const u = USU.lista.filter(x => x.id === id)[0];
  if (!u) return;
  const nombre = u.nombre || u.correo;
  if (accion === 'editar') { formUsuario(u); return; }
  if (accion === 'restablecer') {
    if (!(await confirmar('Nueva clave temporal', 'Se genera una clave temporal para ' + nombre + '. La que tiene deja de servir, y al entrar tendrá que escoger una nueva.', 'Generar clave'))) return;
    btn.disabled = true;
    const r = await llamarAdmin({ accion: 'restablecer', id: id });
    btn.disabled = false;
    if (!r.ok) { aviso(r.mensaje, 'error'); return; }
    await mostrarUsuarios($('contenido'));
    mostrarClave(nombre, u.correo, u.celular, r.clave, false);
    return;
  }
  if (accion === 'desbloquear') {
    const r = await sb.rpc('admin_desbloquear', { p_id: id });
    aviso(r.error ? textoError(r.error) : nombre + ' desbloqueado.', r.error ? 'error' : 'ok');
    if (!r.error) mostrarUsuarios($('contenido'));
    return;
  }
  if (accion === 'desactivar' || accion === 'reactivar') {
    const activar = accion === 'reactivar';
    if (!activar && !(await confirmar('Desactivar usuario', nombre + ' no podrá entrar al sistema. Su ficha y su historial se conservan, y se puede reactivar cuando quiera.', 'Desactivar', true))) return;
    if (activar && u.rol === 'Sin acceso') { formUsuario(u); aviso('Escoja el perfil y guarde; después use Reactivar.', ''); return; }
    btn.disabled = true;
    const r = await llamarAdmin({ accion: 'estado', id: id, activo: activar });
    btn.disabled = false;
    aviso(r.mensaje, r.ok ? 'ok' : 'error');
    if (r.ok) mostrarUsuarios($('contenido'));
    return;
  }
  if (accion === 'borrar') {
    if (!(await confirmar('Borrar usuario', 'Se borra la cuenta de ' + nombre + '. Lo que hizo en el sistema se conserva en la bitácora. Si solo quiere que no entre, mejor desactívelo.', 'Borrar', true))) return;
    btn.disabled = true;
    const r = await llamarAdmin({ accion: 'borrar', id: id });
    btn.disabled = false;
    aviso(r.mensaje, r.ok ? 'ok' : 'error');
    if (r.ok) mostrarUsuarios($('contenido'));
  }
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
