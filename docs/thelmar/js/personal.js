/* GRUPO THELMAR · Portal · personal.js
 * Asistencia y planilla (Leidy y el administrador) y Horas del personal (gerencia).
 * Las marcas las pone el reloj de cada computadora; aquí se revisan, se corrigen
 * con motivo (la marca original no se borra) y se cierra la quincena con su Excel.
 */

const PQ = { ini: null, fin: null, d: null, tab: 'quincena', gtab: 'horas' };
const CAMPOS_LEY = [
  ['recargo_diurna', 'Recargo de hora extra diurna'], ['recargo_nocturna', 'Recargo de hora extra nocturna'], ['recargo_mixta', 'Recargo de hora extra mixta'],
  ['recargo_descanso', 'Recargo por trabajar en día de descanso'], ['recargo_feriado', 'Recargo por trabajar en feriado'],
  ['seguro_social', 'Seguro Social'], ['seguro_educativo', 'Seguro Educativo'],
  ['isr_exento', 'ISR: límite exento'], ['isr_tope', 'ISR: límite del segundo tramo'], ['isr_tasa_1', 'ISR: porcentaje del segundo tramo'], ['isr_tasa_2', 'ISR: porcentaje del tercer tramo']
];

function quincenaDe(f) {
  const d = pd(f), y = d.getFullYear(), m = d.getMonth();
  if (d.getDate() <= 15) return [iso(new Date(y, m, 1)), iso(new Date(y, m, 15))];
  return [iso(new Date(y, m, 16)), iso(new Date(y, m + 1, 0))];
}
function fechasDe(ini, fin) { const r = []; for (let f = ini; f <= fin; f = addD(f, 1)) r.push(f); return r; }
function diasSemana(j) { return /s[aá]b/i.test(j && j.dias || '') ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]; }
function nombreQuincena(ini) {
  const d = pd(ini), mes = d.toLocaleDateString('es-PA', { month: 'long', year: 'numeric' });
  return (d.getDate() === 1 ? 'Primera' : 'Segunda') + ' quincena de ' + mes;
}

// ------------------------------------------------------------------ datos
async function cargarQuincena() {
  if (!PQ.ini) { const q = quincenaDe(hoyPanama()); PQ.ini = q[0]; PQ.fin = q[1]; }
  const rango = function (t) { return sb.from(t).select('*').eq('empresa_id', EMP).gte('fecha', PQ.ini).lte('fecha', PQ.fin); };
  const r = await Promise.all([
    sb.from('personal_trabajadores').select('*').eq('empresa_id', EMP).order('nombre'),
    sb.from('personal_jornadas').select('*').eq('empresa_id', EMP).order('id'),
    sb.from('personal_parametros').select('*').eq('empresa_id', EMP).maybeSingle(),
    rango('personal_feriados'),
    rango('personal_dias'),
    rango('personal_ausencias'),
    rango('personal_correcciones').order('creado_en'),
    sb.from('personal_quincenas').select('*').eq('empresa_id', EMP).eq('inicio', PQ.ini).maybeSingle(),
    puedePlanilla() ? sb.from('personal_computadoras').select('id, codigo, trabajador_id, activa, ultima_senal').eq('empresa_id', EMP).order('codigo') : Promise.resolve({ data: [] })
  ]);
  for (const x of r) if (fallo(x)) return null;
  const D = {
    trab: r[0].data || [], jornadas: r[1].data || [], params: r[2].data || {}, feriados: r[3].data || [],
    dias: {}, ausencias: r[5].data || [], correcciones: r[6].data || [], quincena: r[7].data, pcs: r[8].data || []
  };
  (r[4].data || []).forEach(function (x) { D.dias[x.trabajador_id + '|' + x.fecha] = x; });
  D.jor = {}; D.jornadas.forEach(function (j) { D.jor[j.id] = j; });
  D.fer = {}; D.feriados.forEach(function (f) { D.fer[f.fecha] = f.nombre; });
  D.cerrada = !!(D.quincena && D.quincena.estado === 'Cerrada');
  S.params = D.params;
  PQ.d = D;
  return D;
}

/** Resumen de un trabajador en la quincena: horas, faltas, ausencias, pendientes. */
function resumen(t) {
  const D = PQ.d, j = D.jor[t.jornada_id] || { horas: 8, entrada: '08:00' }, sem = diasSemana(j), hoy = hoyPanama();
  const R = { dias: 0, normal: 0, extra: 0, ferMin: 0, descMin: 0, tarde: 0, sinSal: 0, senal: 0, corr: 0, ausG: 0, ausS: 0, aus: [],
              faltas: 0, ferNoTrab: 0, labTotal: 0, labDesde: 0, esperado: 0 };
  fechasDe(PQ.ini, PQ.fin).forEach(function (f) {
    const lab = sem.indexOf(pd(f).getDay()) > -1, fer = !!D.fer[f];
    if (lab) R.labTotal++;
    if (f < t.fecha_ingreso) return;
    if (lab) R.labDesde++;
    if (lab && !fer && f <= hoy) R.esperado += Number(j.horas) * 60;
    const d = D.dias[t.id + '|' + f];
    if (d && d.estado === 'Ausencia') {
      R.aus.push(d.ausencia);
      if (lab && !fer) { if (d.con_goce) R.ausG++; else R.ausS++; }
      return;
    }
    if (d && d.entrada) {
      R.dias++;
      if (d.llego_tarde) R.tarde++;
      if (d.corregida) R.corr++;
      if (d.estado === 'Sin salida') { R.sinSal++; return; }
      if (d.estado === 'Sin conexión') R.senal++;
      const min = d.trabajados_min || 0;
      if (fer) R.ferMin += min;
      else if (!lab) R.descMin += min;
      else { R.extra += d.extra_min || 0; R.normal += min - (d.extra_min || 0); }
      return;
    }
    if (lab && fer) { R.ferNoTrab++; return; }
    if (lab && f < hoy) R.faltas++;
  });
  return R;
}

function faltanParam(p) {
  p = p || (PQ.d && PQ.d.params) || {};
  return CAMPOS_LEY.filter(function (c) { return p[c[0]] === null || p[c[0]] === undefined || p[c[0]] === ''; }).map(function (c) { return c[1]; });
}

function isrQuincena(brutoQ, p) {
  const anual = brutoQ * 24, ex = Number(p.isr_exento), tope = Number(p.isr_tope), t1 = Number(p.isr_tasa_1) / 100, t2 = Number(p.isr_tasa_2) / 100;
  let imp = 0;
  if (anual > tope) imp = (tope - ex) * t1 + (anual - tope) * t2;
  else if (anual > ex) imp = (anual - ex) * t1;
  return imp / 24;
}

function tarifaDe(t) {
  const j = PQ.d.jor[t.jornada_id] || { horas: 8 };
  return t.tipo_salario === 'Por hora' ? Number(t.salario) : Number(t.salario) / (Number(j.horas) * diasSemana(j).length * 4.333);
}

function nomina(t) {
  const p = PQ.d.params, R = resumen(t), j = PQ.d.jor[t.jornada_id] || { horas: 8 }, tf = tarifaDe(t), h = Number(j.horas);
  let base;
  if (t.tipo_salario === 'Por hora') base = tf * (R.normal / 60 + (R.ausG + R.ferNoTrab) * h);
  else base = Number(t.salario) / 2 * (R.labTotal ? R.labDesde / R.labTotal : 1) - (R.faltas + R.ausS) * h * tf;
  base = Math.max(0, base);
  const extra = tf * (R.extra / 60) * (1 + Number(p.recargo_diurna) / 100)
              + tf * (R.ferMin / 60) * (1 + Number(p.recargo_feriado) / 100)
              + tf * (R.descMin / 60) * (1 + Number(p.recargo_descanso) / 100);
  const c = function (x) { return Math.round(x * 100) / 100; };
  base = c(base);
  const ext = c(extra), bruto = c(base + ext);
  const css = t.seguro_social ? c(bruto * Number(p.seguro_social) / 100) : 0;
  const se = t.seguro_educ ? c(bruto * Number(p.seguro_educativo) / 100) : 0;
  const isr = t.isr ? c(isrQuincena(bruto, p)) : 0;
  const otros = c(Number(t.otro_desc) || 0);
  return { R: R, tf: tf, base: base, extra: ext, bruto: bruto, css: css, se: se, isr: isr, otros: otros, neto: c(bruto - css - se - isr - otros) };
}

function porRevisar() {
  const out = [];
  Object.keys(PQ.d.dias).forEach(function (k) {
    const d = PQ.d.dias[k];
    if (d.estado === 'Sin salida' || d.estado === 'Sin conexión') {
      const t = PQ.d.trab.filter(function (x) { return x.id === d.trabajador_id; })[0];
      if (t) out.push({ t: t, d: d });
    }
  });
  return out.sort(function (a, b) { return a.d.fecha.localeCompare(b.d.fecha) || a.t.nombre.localeCompare(b.t.nombre); });
}

function pillDia(d) {
  if (!d) return '<span class="pill off">Sin marca</span>';
  if (d.estado === 'Ausencia') return '<span class="pill off">' + esc(d.ausencia) + '</span>';
  if (d.estado === 'Sin salida') return '<span class="pill bad">Sin salida</span>';
  if (d.estado === 'Sin conexión') return '<span class="pill info">Enviada sin conexión</span>';
  if (d.estado === 'Sin marca') return '<span class="pill off">Sin marca</span>';
  return (d.llego_tarde ? '<span class="pill late">Llegó tarde</span>' : '<span class="pill ok">Completo</span>') + (d.corregida ? ' <span class="pill lime">Corregida</span>' : '');
}

function barraQuincena(extra) {
  return '<div class="qnav"><button class="icb" type="button" data-q="-1" aria-label="Quincena anterior">‹</button>' +
    '<button class="icb" type="button" data-q="0">Actual</button><button class="icb" type="button" data-q="1" aria-label="Quincena siguiente">›</button>' +
    '<b>' + esc(nombreQuincena(PQ.ini)) + '</b> ' + (PQ.d.cerrada ? '<span class="pill off">Cerrada</span>' : '<span class="pill ok">Abierta</span>') + (extra || '') + '</div>';
}

// ------------------------------------------------------------------ Leidy y administrador
VISTAS.asistencia = async function (el) {
  cargando(el);
  if (!(await cargarQuincena())) return;
  pintarAsistencia(el);
};

function pintarAsistencia(el) {
  el = el || $('contenido');
  const pend = porRevisar().length, falta = faltanParam().length;
  const tabs = [['quincena', 'Quincena'], ['revisar', 'Por revisar', pend, 1], ['trabajadores', 'Trabajadores', PQ.d.trab.filter(function (t) { return t.estado === 'Activo'; }).length],
    ['ausencias', 'Permisos y ausencias'], ['correcciones', 'Correcciones', PQ.d.correcciones.length], ['param', 'Parámetros de planilla', falta || null, 1], ['planilla', 'Planilla y cierre']];
  const vistas = { quincena: tQuincena, revisar: tRevisar, trabajadores: tTrabajadores, ausencias: tAusencias, correcciones: tCorrecciones, param: tParam, planilla: tPlanilla };
  el.innerHTML = '<div class="pg"><div class="pg-h"><div><h2>Asistencia y planilla</h2><p>Del ' + fdia(PQ.ini) + ' al ' + fdia(PQ.fin) + '</p></div>' + barraQuincena() + '</div>' +
    '<div class="tabs">' + tabs.map(function (x) {
      return '<button type="button" data-ptab="' + x[0] + '"' + (PQ.tab === x[0] ? ' aria-current="page"' : '') + '>' + x[1] +
        (x[2] !== undefined && x[2] !== null ? ' <span class="cnt ' + (x[3] && x[2] ? '' : 'z') + '">' + x[2] + '</span>' : '') + '</button>';
    }).join('') + '</div>' + vistas[PQ.tab]() + '</div>';
}

function tQuincena() {
  const D = PQ.d, fechas = fechasDe(PQ.ini, PQ.fin), hoy = hoyPanama();
  const activos = D.trab.filter(function (t) { return t.estado === 'Activo'; });
  if (!activos.length) return '<div class="card"><div class="vacio">Todavía no hay trabajadores. Regístrelos en la pestaña Trabajadores.</div></div>';
  const cols = fechas.map(function (f) { return '<th>' + WD[pd(f).getDay()] + '<br>' + pd(f).getDate() + '</th>'; }).join('');
  let sumH = 0, sumE = 0, sumT = 0;
  const filas = activos.map(function (t) {
    const j = D.jor[t.jornada_id] || {}, sem = diasSemana(j), R = resumen(t);
    sumH += R.normal + R.extra + R.ferMin + R.descMin; sumE += R.extra; sumT += R.tarde;
    const celdas = fechas.map(function (f) {
      const d = D.dias[t.id + '|' + f], lab = sem.indexOf(pd(f).getDay()) > -1;
      if (f < t.fecha_ingreso) return '<td><span class="cell we">·</span></td>';
      if (!d && D.fer[f]) return '<td><span class="cell off" title="' + esc(D.fer[f]) + '">feriado</span></td>';
      if (!d && !lab) return '<td><span class="cell we">·</span></td>';
      if (!d && f >= hoy) return '<td><span class="cell fut">—</span></td>';
      let cls = 'ok', txt = '';
      if (!d) { cls = 'bad'; txt = 'falta'; }
      else if (d.estado === 'Ausencia') { cls = 'off'; txt = String(d.ausencia).slice(0, 5) + '.'; }
      else if (d.estado === 'Sin salida') { cls = 'bad'; txt = 'sin sal.'; }
      else if (d.estado === 'Sin conexión') { cls = 'info'; txt = hdur(d.trabajados_min); }
      else if (d.estado === 'Sin marca') { cls = 'off'; txt = '—'; }
      else { cls = d.llego_tarde ? 'late' : 'ok'; txt = hdur(d.trabajados_min); }
      return '<td><button type="button" class="cell ' + cls + '" data-dia="' + t.id + '|' + f + '" aria-label="' + esc(t.nombre) + ', ' + fdia(f) + '">' + txt + '</button></td>';
    }).join('');
    return '<tr><td class="emp"><b>' + esc(t.nombre) + '</b><small>' + esc(t.cargo) + ' · ' + esc(j.nombre || '') + '</small></td>' + celdas +
      '<td class="tot">' + hdur(R.normal + R.extra + R.ferMin + R.descMin) + '</td></tr>';
  }).join('');
  return '<div class="kpis"><div class="kpi"><span>Horas trabajadas</span><b>' + hdur(sumH) + '</b></div><div class="kpi"><span>Horas extra</span><b>' + hdur(sumE) +
    '</b></div><div class="kpi ' + (sumT ? 'warn' : '') + '"><span>Llegadas tarde</span><b>' + sumT + '</b></div><div class="kpi ' + (porRevisar().length ? 'warn' : '') +
    '"><span>Por revisar</span><b>' + porRevisar().length + '</b></div></div>' +
    '<div class="card"><div class="cap"><b>' + esc(nombreQuincena(PQ.ini)) + '</b><small>Toque un día para ver lo que registró la computadora o corregir</small></div>' +
    '<div class="tw"><table class="g"><thead><tr><th>Trabajador</th>' + cols + '<th>Total</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
    '<div class="legend"><span class="pill ok">Completo</span><span class="pill late">Llegó tarde</span><span class="pill bad">Sin salida o falta</span>' +
    '<span class="pill info">Enviada sin conexión</span><span class="pill off">Permiso, ausencia o feriado</span></div></div>';
}

function tRevisar() {
  const l = porRevisar();
  if (!l.length) return '<div class="box ok">No queda nada por revisar en esta quincena.</div>';
  return '<div class="box warn">Estas marcas necesitan su revisión antes de cerrar la quincena.</div>' +
    '<div class="card"><div class="tw"><table class="t"><thead><tr><th>Trabajador</th><th>Día</th><th>Entrada</th><th>Salida</th><th>Qué pasó</th><th></th></tr></thead><tbody>' +
    l.map(function (x) {
      return '<tr><td class="emp"><b>' + esc(x.t.nombre) + '</b><small>' + esc(x.t.cargo) + '</small></td><td>' + fdia(x.d.fecha) + '</td><td class="tm">' + hm(x.d.entrada) +
        '</td><td class="tm">' + hm(x.d.salida) + '</td><td style="min-width:240px">' + (x.d.estado === 'Sin salida'
          ? 'No se registró el apagado: la computadora quedó encendida o se fue la luz.'
          : 'La marca llegó después porque la computadora estuvo sin internet; trae la hora de la computadora.') +
        '</td><td><button type="button" class="btn plain sm" data-dia="' + x.t.id + '|' + x.d.fecha + '">Revisar</button></td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

function tTrabajadores() {
  const D = PQ.d;
  const filas = D.trab.map(function (t) {
    const j = D.jor[t.jornada_id] || {}, pc = D.pcs.filter(function (c) { return c.trabajador_id === t.id; })[0];
    return '<tr class="click" data-trab="' + t.id + '"><td class="emp"><b>' + esc(t.nombre) + '</b><small>Cédula ' + esc(t.cedula) + '</small></td><td class="emp">' + esc(t.cargo) +
      '<small>' + esc(t.area || '') + '</small></td><td>' + esc(j.nombre || '') + '</td><td class="tm">' + esc(pc ? pc.codigo : '—') + '</td><td>' + esc(t.tipo_salario) +
      '</td><td class="n">' + plata(t.salario) + (t.tipo_salario === 'Por hora' ? ' / h' : ' / mes') + '</td><td class="n">' + plata(tarifaDe(t)) + '</td><td>' +
      (t.estado === 'Activo' ? '<span class="pill ok">Activo</span>' : '<span class="pill off">Inactivo</span>') + '</td></tr>';
  }).join('');
  return '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><p style="margin:0;color:var(--ink-2);font-size:13.5px">' +
    'Con estos datos la planilla se calcula sola. Toque un trabajador para editarlo.</p><button class="btn navy" type="button" data-trab="nuevo">Agregar trabajador</button></div>' +
    '<div class="card"><div class="tw"><table class="t" style="min-width:900px"><thead><tr><th>Trabajador</th><th>Cargo</th><th>Jornada</th><th>Computadora</th><th>Salario</th>' +
    '<th class="n">Monto</th><th class="n">Tarifa por hora</th><th>Estado</th></tr></thead><tbody>' +
    (filas || '<tr><td colspan="8"><div class="vacio">Todavía no hay trabajadores registrados.</div></td></tr>') + '</tbody></table></div></div>';
}

function tAusencias() {
  const D = PQ.d, nom = {}; D.trab.forEach(function (t) { nom[t.id] = t.nombre; });
  const l = D.ausencias.slice().sort(function (a, b) { return a.fecha.localeCompare(b.fecha); });
  const activos = D.trab.filter(function (t) { return t.estado === 'Activo'; });
  return '<div class="card"><div class="cap"><b>Permisos, incapacidades y vacaciones</b><small>Con goce se paga el día; sin goce se descuenta</small></div>' +
    '<div class="tw"><table class="t"><thead><tr><th>Trabajador</th><th>Día</th><th>Tipo</th><th>Pago</th><th>Nota</th><th></th></tr></thead><tbody>' +
    (l.length ? l.map(function (a) {
      return '<tr><td class="emp"><b>' + esc(nom[a.trabajador_id] || '') + '</b></td><td>' + fdia(a.fecha) + '</td><td><span class="pill off">' + esc(a.tipo) + '</span></td><td>' +
        (a.con_goce ? 'Con goce' : 'Sin goce') + '</td><td>' + esc(a.nota || '') + '</td><td>' + (D.cerrada ? '' : '<button class="btn plain sm" type="button" data-quitaraus="' + a.id + '">Quitar</button>') + '</td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="vacio">No hay permisos ni ausencias en esta quincena.</div></td></tr>') + '</tbody></table></div>' +
    (D.cerrada ? '<div class="box off" style="margin:14px">La quincena está cerrada. Para registrar algo hay que reabrirla desde Planilla y cierre.</div>' :
    '<div style="padding:14px;border-top:1px solid var(--rule)"><form class="frm" id="ausForm" novalidate>' +
    '<div class="fld"><label for="ausP">Trabajador</label><select id="ausP">' + activos.map(function (t) { return '<option value="' + t.id + '">' + esc(t.nombre) + '</option>'; }).join('') + '</select></div>' +
    '<div class="fld"><label for="ausT">Tipo</label><select id="ausT"><option>Permiso</option><option>Incapacidad</option><option>Vacaciones</option></select></div>' +
    '<div class="fld"><label for="ausD">Desde</label><input id="ausD" type="date" value="' + PQ.ini + '" min="' + PQ.ini + '" max="' + PQ.fin + '"></div>' +
    '<div class="fld"><label for="ausH">Hasta</label><input id="ausH" type="date" value="' + PQ.ini + '" min="' + PQ.ini + '" max="' + PQ.fin + '"></div>' +
    '<div class="fld"><label for="ausG">Pago</label><select id="ausG"><option value="1">Con goce de salario</option><option value="0">Sin goce de salario</option></select></div>' +
    '<div class="fld"><label for="ausN">Nota</label><input id="ausN" placeholder="Ej. certificado entregado"></div>' +
    '<span class="err fld full oculto" id="ausErr"></span>' +
    '<div class="fld full"><div><button class="btn navy" type="submit">Registrar</button> <span class="lock">Se registra en cada día de trabajo del rango; los días libres y feriados se saltan.</span></div></div>' +
    '</form></div>') + '</div>';
}

function tCorrecciones() {
  const D = PQ.d, nom = {}; D.trab.forEach(function (t) { nom[t.id] = t.nombre; });
  if (!D.correcciones.length) return '<div class="box off">Todavía no hay correcciones en esta quincena.</div>';
  return '<div class="card"><div class="cap"><b>Historial de correcciones</b><small>La marca original nunca se borra</small></div><div class="tw"><table class="t"><thead><tr>' +
    '<th>Trabajador</th><th>Día</th><th>Campo</th><th>Original</th><th>Corregida</th><th>Motivo</th><th>Quién y cuándo</th></tr></thead><tbody>' +
    D.correcciones.map(function (c) {
      return '<tr><td class="emp"><b>' + esc(nom[c.trabajador_id] || '') + '</b></td><td>' + fdia(c.fecha) + '</td><td>' + esc(c.campo) +
        '</td><td class="tm" style="text-decoration:line-through;color:var(--ink-2)">' + (c.antes ? hm(c.antes) : 'sin marca') + '</td><td class="tm"><b>' + hm(c.despues) +
        '</b></td><td style="min-width:220px">' + esc(c.motivo) + '</td><td><small>' + esc(c.por_nombre || '') + '<br>' +
        new Date(c.creado_en).toLocaleString('es-PA', { timeZone: 'America/Panama', dateStyle: 'short', timeStyle: 'short' }) + '</small></td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

function tParam() {
  const p = PQ.d.params || {};
  const v = function (k) { return p[k] === null || p[k] === undefined ? '' : p[k]; };
  const fila = function (k, t, sufijo, paso) {
    return '<tr><td>' + t + '</td><td><input class="inl" id="p_' + k + '" data-param="' + k + '" type="number" step="' + (paso || '0.01') + '" min="0" value="' + v(k) +
      '" placeholder="—" aria-label="' + esc(t) + '"> ' + (sufijo || '%') + '</td></tr>';
  };
  return '<div class="box info">Llene estos datos una vez y actualícelos cuando cambie la ley. Con ellos la planilla se calcula completa, de las horas al neto a pagar. Cada cambio se guarda solo.</div>' +
    '<div class="card"><div class="cap"><b>Recargos</b><small>Porcentaje sobre la tarifa por hora</small></div><div class="tw"><table class="t" style="min-width:420px"><tbody>' +
    fila('recargo_diurna', 'Hora extra diurna') + fila('recargo_nocturna', 'Hora extra nocturna') + fila('recargo_mixta', 'Hora extra mixta') +
    fila('recargo_descanso', 'Trabajo en día de descanso') + fila('recargo_feriado', 'Trabajo en feriado nacional') + '</tbody></table></div></div>' +
    '<div class="card"><div class="cap"><b>Descuentos de ley</b><small>Porcentaje sobre el salario bruto</small></div><div class="tw"><table class="t" style="min-width:420px"><tbody>' +
    fila('seguro_social', 'Seguro Social') + fila('seguro_educativo', 'Seguro Educativo') + '</tbody></table></div></div>' +
    '<div class="card"><div class="cap"><b>Impuesto sobre la renta</b><small>Tabla anual; el sistema proyecta el salario de la quincena a un año</small></div><div class="tw"><table class="t" style="min-width:420px"><tbody>' +
    fila('isr_exento', 'Exento hasta', 'B/. al año', '1') + fila('isr_tope', 'Segundo tramo hasta', 'B/. al año', '1') + fila('isr_tasa_1', 'Porcentaje del segundo tramo') +
    fila('isr_tasa_2', 'Porcentaje sobre el excedente') + '</tbody></table></div></div>' +
    '<div class="box off">Hoy la hora extra se paga con el recargo diurno. Los recargos nocturno y mixto quedan guardados para cuando se marque el tipo de cada hora extra.</div>';
}

function tPlanilla() {
  const pend = porRevisar().length, falta = faltanParam(), hoy = hoyPanama(), fut = PQ.fin >= hoy;
  const pasos = [
    [pend === 0, pend ? 'Quedan ' + pend + ' marca' + (pend === 1 ? '' : 's') + ' por revisar' : 'No quedan marcas por revisar'],
    [!falta.length, falta.length ? 'Faltan parámetros de planilla: ' + falta.join(', ') : 'Parámetros de planilla completos'],
    [!fut, fut ? 'La quincena termina el ' + fdia(PQ.fin) + '; todavía faltan días por trabajar' : 'Todos los días de la quincena ya pasaron'],
    [PQ.d.trab.some(function (t) { return t.estado === 'Activo'; }), 'Trabajadores registrados con su salario']
  ];
  let acc;
  if (PQ.d.cerrada) {
    acc = '<div class="box ok">Quincena cerrada' + (PQ.d.quincena.cerrada_en ? ' el ' + new Date(PQ.d.quincena.cerrada_en).toLocaleString('es-PA', { timeZone: 'America/Panama', dateStyle: 'short', timeStyle: 'short' }) : '') +
      '. Las marcas quedaron bloqueadas y coinciden con la planilla.</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn lime" type="button" data-excel="1">Descargar Excel</button>' +
      '<button class="btn plain" type="button" data-reabrir="1">Reabrir</button></div><div id="caja-reabrir"></div>';
  } else {
    acc = '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn navy" type="button" data-cerrar="1"' + (pend || falta.length ? ' disabled' : '') + '>Cerrar quincena</button>' +
      '<button class="btn plain" type="button" data-excel="1"' + (falta.length ? ' disabled' : '') + '>Descargar borrador</button></div>' +
      '<span class="lock">' + (pend ? 'Primero revise las marcas pendientes.' : falta.length ? 'Primero llene los parámetros de planilla.' : fut ? 'Puede cerrarla antes si ya no habrá más cambios.' : 'Lista para cerrar.') + '</span>';
  }
  return '<div class="grid2"><div class="card"><div class="cap"><b>Antes de cerrar</b></div><ul class="steps">' + pasos.map(function (s) {
    return '<li><i class="' + (s[0] ? 'y' : 'n') + '">' + (s[0] ? '✓' : '!') + '</i><span>' + esc(s[1]) + '</span></li>';
  }).join('') + '</ul><div style="padding:14px;border-top:1px solid var(--rule);display:flex;flex-direction:column;gap:10px">' + acc + '</div></div>' +
    '<div class="card"><div class="cap"><b>Vista previa de la planilla</b><small>Calculada con las horas y los datos de cada trabajador</small></div>' + tablaPlanilla() + '</div></div>';
}

function filasPlanilla() {
  return PQ.d.trab.filter(function (t) { return t.estado === 'Activo'; }).map(function (t) {
    const n = nomina(t), R = n.R, obs = [];
    if (R.aus.length) obs.push(R.aus.length + ' d. ' + R.aus[0].toLowerCase());
    if (R.faltas) obs.push(R.faltas + ' falta' + (R.faltas === 1 ? '' : 's'));
    if (R.sinSal) obs.push(R.sinSal + ' sin salida');
    if (R.corr) obs.push(R.corr + ' corregida' + (R.corr === 1 ? '' : 's'));
    if (R.tarde) obs.push(R.tarde + ' tarde');
    if (R.ferMin) obs.push(hdur(R.ferMin) + ' h en feriado');
    if (R.descMin) obs.push(hdur(R.descMin) + ' h en descanso');
    if (n.otros) obs.push(t.otro_concepto || 'Otro descuento');
    return { t: t, n: n, obs: obs.join('; ') };
  });
}

function tablaPlanilla() {
  if (faltanParam().length) return '<div style="padding:14px"><div class="box warn">La planilla no se puede calcular todavía. Faltan: ' + esc(faltanParam().join(', ')) +
    '.' + (puedePlanilla() ? ' Llénelos en la pestaña Parámetros de planilla.' : '') + '</div></div>';
  const F = filasPlanilla();
  if (!F.length) return '<div class="vacio">No hay trabajadores activos.</div>';
  const T = { normal: 0, extraM: 0, base: 0, extra: 0, bruto: 0, css: 0, se: 0, isr: 0, otros: 0, neto: 0 };
  const filas = F.map(function (x, i) {
    const n = x.n; T.normal += n.R.normal; T.extraM += n.R.extra + n.R.ferMin + n.R.descMin;
    ['base', 'extra', 'bruto', 'css', 'se', 'isr', 'otros', 'neto'].forEach(function (k) { T[k] += n[k]; });
    return '<tr><td class="n">' + (i + 1) + '</td><td>' + esc(x.t.nombre) + '</td><td>' + esc(x.t.cedula) + '</td><td>' + esc(x.t.cargo) + '</td><td class="n">' + n.R.dias +
      '</td><td class="n">' + hdur(n.R.normal) + '</td><td class="n">' + hdur(n.R.extra + n.R.ferMin + n.R.descMin) + '</td><td class="n">' + plata(n.base) + '</td><td class="n">' + plata(n.extra) +
      '</td><td class="n"><b>' + plata(n.bruto) + '</b></td><td class="n">' + plata(n.css) + '</td><td class="n">' + plata(n.se) + '</td><td class="n">' + plata(n.isr) +
      '</td><td class="n">' + plata(n.otros) + '</td><td class="n"><b>' + plata(n.neto) + '</b></td><td>' + esc(x.t.forma_pago) + '</td><td>' + esc(x.obs) + '</td></tr>';
  }).join('');
  return '<div class="xl"><div class="xls"><div class="xh"><img src="logo.png" alt="THM Ingeniería Integral"><div class="tt"><b>THM PANAMÁ, S.A.</b><span>Planilla quincenal · ' +
    esc(nombreQuincena(PQ.ini)) + '</span></div></div><div class="meta"><span>Período: ' + fechaTexto(PQ.ini) + ' al ' + fechaTexto(PQ.fin) + '</span><span>Trabajadores: ' + F.length +
    '</span><span>Estado: ' + (PQ.d.cerrada ? 'Cerrada' : 'Abierta (borrador)') + '</span></div><table><thead>' +
    '<tr><th class="grp" colspan="4">TRABAJADOR</th><th class="grp" colspan="3">TIEMPO</th><th class="grp" colspan="3">DEVENGADO</th><th class="grp" colspan="4">DESCUENTOS</th><th class="grp" colspan="3">PAGO</th></tr>' +
    '<tr><th>N.º</th><th>Nombre</th><th>Cédula</th><th>Cargo</th><th>Días</th><th>Horas norm.</th><th>Horas extra</th><th>Salario</th><th>Extras con recargo</th><th>Bruto</th>' +
    '<th>Seguro Social</th><th>Seg. Educativo</th><th>ISR</th><th>Otros</th><th>Neto a pagar</th><th>Forma</th><th>Observaciones</th></tr></thead><tbody>' + filas +
    '</tbody><tfoot><tr><td></td><td colspan="3">Totales</td><td></td><td class="n">' + hdur(T.normal) + '</td><td class="n">' + hdur(T.extraM) + '</td><td class="n">' + plata(T.base) +
    '</td><td class="n">' + plata(T.extra) + '</td><td class="n">' + plata(T.bruto) + '</td><td class="n">' + plata(T.css) + '</td><td class="n">' + plata(T.se) + '</td><td class="n">' +
    plata(T.isr) + '</td><td class="n">' + plata(T.otros) + '</td><td class="n">' + plata(T.neto) + '</td><td colspan="2"></td></tr></tfoot></table>' +
    '<div class="obs">Horas en horas:minutos. Salario mensual: se paga la mitad por quincena y se descuentan las faltas y los permisos sin goce. Por hora: horas normales por la tarifa. ' +
    'Recargos, descuentos y tabla del ISR según los parámetros de planilla.</div><div class="sign"><div><b>Elaboró</b>&nbsp;</div><div><b>Autorizó</b>Gerencia</div></div></div></div>';
}

// ------------------------------------------------------------------ detalle de un día
async function abrirDia(tid, f) {
  const D = PQ.d, t = D.trab.filter(function (x) { return x.id === tid; })[0], j = D.jor[t.jornada_id] || {}, d = D.dias[tid + '|' + f];
  const cuerpo = abrirPanel(t.nombre, fdia(f) + ' · Jornada ' + esc(j.nombre || '') + ' ' + hm(j.entrada) + ' a ' + hm(j.salida), '<div class="cargando">Cargando las marcas...</div>');
  const r = await sb.from('personal_marcas').select('tipo, hora_efectiva, hora_equipo, sin_conexion').eq('trabajador_id', tid)
    .gte('hora_efectiva', f + 'T00:00:00-05:00').lt('hora_efectiva', addD(f, 1) + 'T00:00:00-05:00').order('hora_efectiva');
  if (fallo(r)) return;
  const nombres = { encendido: ['Encendió la computadora', 'on'], apagado: ['Apagó la computadora', 'offd'], reposo: ['Entró en reposo', 'zz'], despertar: ['Despertó', 'on'] };
  const hora = function (x) { return new Date(x).toLocaleTimeString('es-PA', { timeZone: 'America/Panama', hour: '2-digit', minute: '2-digit', hour12: false }); };
  const marcas = r.data || [];
  const corr = D.correcciones.filter(function (c) { return c.trabajador_id === tid && c.fecha === f; });
  let html = '';
  if (d && d.estado === 'Ausencia') html += '<div class="box off"><b>' + esc(d.ausencia) + '</b> · ' + (d.con_goce ? 'con goce' : 'sin goce') + '</div>';
  html += '<div class="sum3"><div><span>Entrada</span><b>' + hm(d && d.entrada) + '</b></div><div><span>Salida</span><b>' + hm(d && d.salida) +
    '</b></div><div><span>Horas</span><b>' + hdur(d ? d.trabajados_min : null) + '</b></div></div><div>' + pillDia(d) + '</div>';
  if (d && d.estado === 'Sin conexión') html += '<div class="box info">Esta marca llegó cuando volvió el internet; trae la hora de la computadora, no la del servidor.' +
    (D.cerrada ? '' : '<div style="margin-top:8px"><button class="btn plain sm" type="button" data-aceptar="' + tid + '|' + f + '">Aceptar la marca</button></div>') + '</div>';
  if (d && d.estado === 'Sin salida') html += '<div class="box warn">No hay apagado registrado. Escriba la hora de salida y el motivo.</div>';
  if (!d) html += '<div class="box off">La computadora no registró nada este día. Si fue un permiso, regístrelo en Permisos y ausencias; si trabajó, corrija la entrada y la salida.</div>';
  html += '<div class="sec"><h4>Lo que registró la computadora</h4>' + (marcas.length ? '<ul class="tl">' + marcas.map(function (m) {
    const n = nombres[m.tipo] || [m.tipo, ''];
    return '<li><time>' + hora(m.hora_efectiva) + '</time><i class="' + n[1] + '"></i><span>' + n[0] + '<small>' + (m.sin_conexion ? 'Guardada sin internet' : 'Hora del servidor') + '</small></span></li>';
  }).join('') + '</ul>' : '<div class="lock">Sin marcas.</div>') + '</div>';
  if (corr.length) html += '<div class="sec"><h4>Correcciones</h4><div class="hist">' + corr.map(function (c) {
    return '<div><b>' + esc(c.campo) + ': <s>' + (c.antes ? hm(c.antes) : 'sin marca') + '</s> → ' + hm(c.despues) + '</b><small>' + esc(c.motivo) + '</small><small>' + esc(c.por_nombre || '') + '</small></div>';
  }).join('') + '</div></div>';
  html += '<div class="sec"><h4>Corregir</h4>' + (D.cerrada ? '<div class="box off">La quincena está cerrada. Para corregir hay que reabrirla desde Planilla y cierre.</div>' :
    '<form id="corrForm" class="frm" data-corr="' + tid + '|' + f + '" novalidate>' +
    '<div class="fld"><label for="corrCampo">Qué corrige</label><select id="corrCampo"><option' + (d && d.estado === 'Sin salida' ? '' : ' selected') + '>Entrada</option><option' +
    (d && d.estado === 'Sin salida' ? ' selected' : '') + '>Salida</option></select></div>' +
    '<div class="fld"><label for="corrHora">Hora correcta</label><input id="corrHora" type="time"></div>' +
    '<div class="fld full"><label for="corrMot">Motivo</label><textarea id="corrMot" placeholder="Ej. la computadora quedó encendida; confirmó con su jefe que salió a las 5:00 p. m."></textarea></div>' +
    '<span class="err fld full oculto" id="corrErr"></span><div class="fld full"><button class="btn navy" type="submit">Guardar corrección</button></div></form>') + '</div>';
  cuerpo.innerHTML = html;
}

// ------------------------------------------------------------------ ficha del trabajador
function abrirTrabajador(id) {
  const D = PQ.d, nuevo = id === 'nuevo';
  const t = nuevo ? { nombre: '', cedula: '', correo: '', cargo: '', area: '', jornada_id: (D.jornadas[0] || {}).id, fecha_ingreso: hoyPanama(), tipo_salario: 'Mensual', salario: '',
    forma_pago: 'ACH', seguro_social: true, seguro_educ: true, isr: true, otro_desc: 0, otro_concepto: '', estado: 'Activo' } : D.trab.filter(function (x) { return x.id === Number(id); })[0];
  const pcActual = nuevo ? null : D.pcs.filter(function (c) { return c.trabajador_id === t.id; })[0];
  const libres = D.pcs.filter(function (c) { return c.activa && (!c.trabajador_id || (pcActual && c.id === pcActual.id)); });
  const op = function (v, cur) { return '<option' + (v === cur ? ' selected' : '') + '>' + v + '</option>'; };
  if (!D.jornadas.length) { abrirPanel('Falta la jornada', '', '<div class="box warn">Antes de registrar trabajadores, el administrador debe crear al menos una jornada en Configuración.</div>'); return; }
  abrirPanel(nuevo ? 'Nuevo trabajador' : t.nombre, nuevo ? 'Con estos datos su planilla se calcula sola' : 'Cédula ' + esc(t.cedula) + ' · desde ' + fechaTexto(t.fecha_ingreso),
    '<form id="trabForm" class="frm" data-id="' + (nuevo ? 'nuevo' : t.id) + '" novalidate>' +
    '<div class="fsec">Datos personales</div>' +
    '<div class="fld full"><label for="wN">Nombre completo</label><input id="wN" value="' + esc(t.nombre) + '" placeholder="Nombre y apellidos"></div>' +
    '<div class="fld"><label for="wC">Cédula</label><input id="wC" value="' + esc(t.cedula) + '" placeholder="8-000-0000"></div>' +
    '<div class="fld"><label for="wI">Fecha de ingreso</label><input id="wI" type="date" value="' + t.fecha_ingreso + '"></div>' +
    '<div class="fld full"><label for="wM">Correo de su cuenta en el portal</label><input id="wM" type="email" value="' + esc(t.correo || '') + '" placeholder="Opcional"><small>Sirve para mostrarle el aviso de entrada, si el administrador lo enciende.</small></div>' +
    '<div class="fsec">Puesto</div>' +
    '<div class="fld"><label for="wCa">Cargo</label><input id="wCa" value="' + esc(t.cargo) + '" placeholder="Ej. Dibujante técnico"></div>' +
    '<div class="fld"><label for="wA">Área u obra</label><input id="wA" value="' + esc(t.area || '') + '" placeholder="Ej. Oficina técnica"></div>' +
    '<div class="fld"><label for="wJ">Jornada</label><select id="wJ">' + D.jornadas.filter(function (j) { return j.activa || j.id === t.jornada_id; }).map(function (j) {
      return '<option value="' + j.id + '"' + (j.id === t.jornada_id ? ' selected' : '') + '>' + esc(j.nombre) + ' · ' + hm(j.entrada) + ' a ' + hm(j.salida) + '</option>'; }).join('') + '</select></div>' +
    '<div class="fld"><label for="wP">Computadora con reloj</label><select id="wP"><option value="">Sin asignar</option>' + libres.map(function (c) {
      return '<option value="' + c.id + '"' + (pcActual && c.id === pcActual.id ? ' selected' : '') + '>' + esc(c.codigo) + '</option>'; }).join('') + '</select><small>Las computadoras y sus claves las registra el administrador.</small></div>' +
    '<div class="fsec">Salario</div>' +
    '<div class="fld"><label for="wT">Tipo de salario</label><select id="wT">' + op('Mensual', t.tipo_salario) + op('Por hora', t.tipo_salario) + '</select></div>' +
    '<div class="fld"><label for="wS" id="wSl">' + (t.tipo_salario === 'Por hora' ? 'Pago por hora (B/.)' : 'Salario mensual (B/.)') + '</label><input id="wS" type="number" min="0" step="0.01" value="' + esc(t.salario) + '" placeholder="0.00"></div>' +
    '<div class="fld full"><div class="calc" id="wCalc"></div></div>' +
    '<div class="fld"><label for="wF">Forma de pago</label><select id="wF">' + op('ACH', t.forma_pago) + op('Cheque', t.forma_pago) + op('Efectivo', t.forma_pago) + '</select></div>' +
    '<div class="fld"><label for="wE">Estado</label><select id="wE">' + op('Activo', t.estado) + op('Inactivo', t.estado) + '</select></div>' +
    '<div class="fsec">Descuentos</div>' +
    '<label class="chk fld full"><input type="checkbox" id="wCss"' + (t.seguro_social ? ' checked' : '') + '> Seguro Social</label>' +
    '<label class="chk fld full"><input type="checkbox" id="wSe"' + (t.seguro_educ ? ' checked' : '') + '> Seguro Educativo</label>' +
    '<label class="chk fld full"><input type="checkbox" id="wIsr"' + (t.isr ? ' checked' : '') + '> Impuesto sobre la renta (según tabla)</label>' +
    '<div class="fld"><label for="wO">Otro descuento por quincena (B/.)</label><input id="wO" type="number" min="0" step="0.01" value="' + (t.otro_desc || 0) + '"></div>' +
    '<div class="fld"><label for="wOn">Concepto</label><input id="wOn" value="' + esc(t.otro_concepto || '') + '" placeholder="Ej. préstamo, adelanto"></div>' +
    '<span class="err fld full oculto" id="wErr"></span>' +
    '<div class="fld full"><div style="display:flex;gap:8px"><button class="btn navy" type="submit">' + (nuevo ? 'Agregar trabajador' : 'Guardar cambios') + '</button></div></div></form>');
  calcSalario();
}

function calcSalario() {
  const box = $('wCalc'); if (!box) return;
  const tipo = $('wT').value, s = Number($('wS').value) || 0, j = PQ.d.jor[Number($('wJ').value)] || { horas: 8 }, dias = diasSemana(j).length, h = Number(j.horas);
  $('wSl').textContent = tipo === 'Por hora' ? 'Pago por hora (B/.)' : 'Salario mensual (B/.)';
  const tf = tipo === 'Por hora' ? s : s / (h * dias * 4.333);
  const q = tipo === 'Por hora' ? s * h * dias * 2.1665 : s / 2;
  box.innerHTML = '<span>Tarifa por hora <b>' + plata(tf) + '</b></span><span>Quincena aproximada <b>' + plata(q) + '</b></span>' +
    '<span style="font-size:12px;color:var(--ink-2);flex-basis:100%">' + (tipo === 'Por hora' ? h + ' h × ' + dias + ' días por semana × 2.17 semanas' :
    'Salario ÷ (' + h * dias + ' h por semana × 4.333 semanas)') + '</span>';
}

// ------------------------------------------------------------------ gerencia
VISTAS.horas = async function (el) {
  cargando(el);
  if (!(await cargarQuincena())) return;
  pintarHoras(el);
};

function pintarHoras(el) {
  el = el || $('contenido');
  const activos = PQ.d.trab.filter(function (t) { return t.estado === 'Activo'; });
  let tH = 0, tE = 0;
  const filas = activos.map(function (t) {
    const R = resumen(t), j = PQ.d.jor[t.jornada_id] || {}, horas = R.normal + R.extra + R.ferMin + R.descMin;
    tH += horas; tE += R.extra + R.ferMin + R.descMin;
    const pct = R.esperado ? Math.min(100, Math.round(R.normal / R.esperado * 100)) : 0;
    return '<tr><td class="emp"><b>' + esc(t.nombre) + '</b><small>' + esc(t.cargo) + '</small></td><td>' + esc(j.nombre || '') + '</td><td class="n">' + R.dias + '</td><td class="n">' +
      hdur(horas) + '</td><td class="n">' + hdur(R.esperado) + '</td><td class="n">' + (R.extra + R.ferMin + R.descMin ? hdur(R.extra + R.ferMin + R.descMin) : '—') +
      '</td><td><div class="av2" style="min-width:110px" title="' + pct + '% de la jornada"><i style="width:' + pct + '%"></i></div></td></tr>';
  }).join('');
  const bruto = faltanParam().length ? null : filasPlanilla().reduce(function (a, x) { return a + x.n.bruto; }, 0);
  el.innerHTML = '<div class="pg"><div class="pg-h"><div><h2>Horas del personal</h2><p>Del ' + fdia(PQ.ini) + ' al ' + fdia(PQ.fin) + '</p></div>' + barraQuincena() + '</div>' +
    '<div class="kpis"><div class="kpi"><span>Trabajadores</span><b>' + activos.length + '</b></div><div class="kpi"><span>Horas trabajadas</span><b>' + hdur(tH) +
    '</b></div><div class="kpi"><span>Horas extra</span><b>' + hdur(tE) + '</b></div><div class="kpi"><span>Planilla bruta</span><b>' + (bruto === null ? '—' : plata(bruto)) + '</b></div></div>' +
    '<div class="tabs"><button type="button" data-gtab="horas"' + (PQ.gtab === 'horas' ? ' aria-current="page"' : '') + '>Horas por trabajador</button>' +
    '<button type="button" data-gtab="planilla"' + (PQ.gtab === 'planilla' ? ' aria-current="page"' : '') + '>Planilla</button></div>' +
    (PQ.gtab === 'horas' ? '<div class="card"><div class="cap"><b>Resumen por trabajador</b><small>La barra es la jornada cumplida hasta hoy</small></div><div class="tw"><table class="t"><thead><tr>' +
      '<th>Trabajador</th><th>Jornada</th><th class="n">Días</th><th class="n">Horas</th><th class="n">Jornada esperada</th><th class="n">Extra</th><th>Cumplimiento</th></tr></thead><tbody>' +
      (filas || '<tr><td colspan="7"><div class="vacio">Todavía no hay trabajadores registrados.</div></td></tr>') + '</tbody></table></div></div>'
      : '<div class="card"><div class="cap"><b>Planilla de la quincena</b><div style="display:flex;gap:8px;align-items:center"><small>La prepara Planilla; usted la autoriza firmando</small>' +
        (faltanParam().length ? '' : '<button class="btn lime sm" type="button" data-excel="1">Descargar Excel</button>') + '</div></div>' + tablaPlanilla() + '</div>') +
    '<div class="box off">Gerencia solo consulta: no registra entrada ni salida y no corrige marcas.</div></div>';
}

// ------------------------------------------------------------------ Excel de la planilla
async function cargarExcelJS() {
  if (window.ExcelJS) return;
  await new Promise(function (ok, mal) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    s.onload = ok; s.onerror = function () { mal(new Error('No se pudo cargar el generador de Excel. Revise el internet.')); };
    document.head.appendChild(s);
  });
}

async function descargarExcel() {
  try { await cargarExcelJS(); } catch (e) { toast(e.message, 'error'); return; }
  const F = filasPlanilla(), wb = new ExcelJS.Workbook();
  wb.creator = S.perfil.nombre || S.perfil.correo;
  const ws = wb.addWorksheet('Planilla', { pageSetup: { paperSize: 1, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
  const borde = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  try {
    const b = await (await fetch('logo.png')).arrayBuffer();
    const img = wb.addImage({ buffer: b, extension: 'png' });
    ws.addImage(img, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 70 } });
  } catch (e) {}
  ws.mergeCells('E1:Q1'); ws.getCell('E1').value = 'THM PANAMÁ, S.A.';
  ws.getCell('E1').font = { bold: true, size: 16 }; ws.getCell('E1').alignment = { horizontal: 'right' };
  ws.mergeCells('E2:Q2'); ws.getCell('E2').value = 'Planilla quincenal · ' + nombreQuincena(PQ.ini); ws.getCell('E2').alignment = { horizontal: 'right' };
  ws.mergeCells('E3:Q3'); ws.getCell('E3').value = 'Período: ' + fechaTexto(PQ.ini) + ' al ' + fechaTexto(PQ.fin) + ' · Estado: ' + (PQ.d.cerrada ? 'Cerrada' : 'Borrador (quincena abierta)');
  ws.getCell('E3').alignment = { horizontal: 'right' }; ws.getCell('E3').font = { size: 10 };
  ws.getRow(1).height = 26; ws.getRow(2).height = 18; ws.getRow(3).height = 18; ws.addRow([]);

  const grupos = ws.addRow(['TRABAJADOR', '', '', '', 'TIEMPO', '', '', 'DEVENGADO', '', '', 'DESCUENTOS', '', '', '', 'PAGO', '', '']);
  ws.mergeCells('A5:D5'); ws.mergeCells('E5:G5'); ws.mergeCells('H5:J5'); ws.mergeCells('K5:N5'); ws.mergeCells('O5:Q5');
  const enc = ws.addRow(['N.º', 'Nombre', 'Cédula', 'Cargo', 'Días', 'Horas norm.', 'Horas extra', 'Salario', 'Extras con recargo', 'Bruto',
    'Seguro Social', 'Seg. Educativo', 'ISR', 'Otros', 'Neto a pagar', 'Forma', 'Observaciones']);
  [grupos, enc].forEach(function (r) {
    r.eachCell(function (c) { c.font = { bold: true, size: 9 }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r === grupos ? 'FFE2E2E2' : 'FFF0F0F0' } }; c.border = borde; });
  });
  enc.height = 30;
  const horas = function (m) { return Math.round(m) / 1440; };
  const T = { normal: 0, extraM: 0, base: 0, extra: 0, bruto: 0, css: 0, se: 0, isr: 0, otros: 0, neto: 0 };
  F.forEach(function (x, i) {
    const n = x.n; T.normal += n.R.normal; T.extraM += n.R.extra + n.R.ferMin + n.R.descMin;
    ['base', 'extra', 'bruto', 'css', 'se', 'isr', 'otros', 'neto'].forEach(function (k) { T[k] += n[k]; });
    const r = ws.addRow([i + 1, x.t.nombre, x.t.cedula, x.t.cargo, n.R.dias, horas(n.R.normal), horas(n.R.extra + n.R.ferMin + n.R.descMin),
      n.base, n.extra, n.bruto, n.css, n.se, n.isr, n.otros, n.neto, x.t.forma_pago, x.obs]);
    r.eachCell({ includeEmpty: true }, function (c) { c.border = borde; c.font = { size: 9 }; c.alignment = { vertical: 'middle', wrapText: c.col === 17 }; });
  });
  const tot = ws.addRow(['', 'Totales', '', '', '', horas(T.normal), horas(T.extraM), T.base, T.extra, T.bruto, T.css, T.se, T.isr, T.otros, T.neto, '', '']);
  tot.eachCell({ includeEmpty: true }, function (c) { c.border = borde; c.font = { bold: true, size: 9 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } }; });
  for (let r = 7; r <= tot.number; r++) {
    ['F', 'G'].forEach(function (c) { ws.getCell(c + r).numFmt = '[h]:mm'; });
    ['H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'].forEach(function (c) { ws.getCell(c + r).numFmt = '"B/." #,##0.00'; });
  }
  ws.columns.forEach(function (c, i) { c.width = [5, 28, 13, 22, 6, 9, 9, 12, 12, 12, 11, 11, 10, 10, 13, 9, 34][i]; });
  ws.addRow([]);
  const nota = ws.addRow(['Horas en horas:minutos. Salario mensual: se paga la mitad por quincena y se descuentan las faltas y los permisos sin goce. ' +
    'Por hora: horas normales por la tarifa. Recargos, descuentos y tabla del ISR según los parámetros de planilla.']);
  ws.mergeCells('A' + nota.number + ':Q' + nota.number); nota.getCell(1).font = { size: 8, italic: true }; nota.getCell(1).alignment = { wrapText: true }; nota.height = 24;
  ws.addRow([]); ws.addRow([]); ws.addRow([]);
  const f1 = ws.addRow(['', '______________________________', '', '', '', '', '', '', '', '', '', '', '______________________________']);
  const f2 = ws.addRow(['', 'Elaboró', '', '', '', '', '', '', '', '', '', '', 'Autorizó']);
  const f3 = ws.addRow(['', '', '', '', '', '', '', '', '', '', '', '', 'Gerencia']);
  [f1, f2, f3].forEach(function (r) { r.eachCell(function (c) { c.alignment = { horizontal: 'center' }; c.font = { size: 10, bold: r === f2 }; }); });
  ws.mergeCells('B' + f1.number + ':D' + f1.number); ws.mergeCells('M' + f1.number + ':P' + f1.number);
  ws.mergeCells('B' + f2.number + ':D' + f2.number); ws.mergeCells('M' + f2.number + ':P' + f2.number);
  ws.mergeCells('M' + f3.number + ':P' + f3.number);
  ws.pageSetup.printArea = 'A1:Q' + f3.number;

  // detalle por día, para verificar
  const det = wb.addWorksheet('Detalle por día', { pageSetup: { paperSize: 1, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const he = det.addRow(['Trabajador', 'Día', 'Entrada', 'Salida', 'Recesos', 'Horas', 'Extra', 'Estado', 'Corregida']);
  he.eachCell(function (c) { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }; c.border = borde; });
  F.forEach(function (x) {
    fechasDe(PQ.ini, PQ.fin).forEach(function (f) {
      const d = PQ.d.dias[x.t.id + '|' + f];
      if (!d) return;
      const r = det.addRow([x.t.nombre, fdia(f), hm(d.entrada), hm(d.salida), d.recesos_min ? horas(d.recesos_min) : '', d.trabajados_min !== null ? horas(d.trabajados_min) : '',
        d.extra_min ? horas(d.extra_min) : '', d.estado === 'Ausencia' ? d.ausencia : d.estado, d.corregida ? 'Sí' : '']);
      r.eachCell({ includeEmpty: true }, function (c) { c.border = borde; });
      ['E', 'F', 'G'].forEach(function (c) { det.getCell(c + r.number).numFmt = '[h]:mm'; });
    });
  });
  det.columns.forEach(function (c, i) { c.width = [30, 12, 9, 9, 9, 9, 9, 18, 10][i]; });

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = 'Planilla THM ' + PQ.ini + ' al ' + PQ.fin + (PQ.d.cerrada ? '' : ' (borrador)') + '.xlsx';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  toast('Excel descargado.');
}

// ------------------------------------------------------------------ eventos
function repintar() { if (S.page === 'horas') pintarHoras(); else pintarAsistencia(); }

document.addEventListener('click', async function (ev) {
  if (S.page !== 'asistencia' && S.page !== 'horas') return;
  const b = ev.target.closest('[data-ptab],[data-gtab],[data-q],[data-dia],[data-trab],[data-quitaraus],[data-aceptar],[data-cerrar],[data-reabrir],[data-excel]');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.ptab) { PQ.tab = d.ptab; pintarAsistencia(); return; }
  if (d.gtab) { PQ.gtab = d.gtab; pintarHoras(); return; }
  if (d.q !== undefined) {
    if (d.q === '0') { const q = quincenaDe(hoyPanama()); PQ.ini = q[0]; PQ.fin = q[1]; }
    else if (d.q === '-1') { const q = quincenaDe(addD(PQ.ini, -1)); PQ.ini = q[0]; PQ.fin = q[1]; }
    else { const q = quincenaDe(addD(PQ.fin, 1)); PQ.ini = q[0]; PQ.fin = q[1]; }
    cargando($('contenido')); if (await cargarQuincena()) repintar(); return;
  }
  if (d.dia && S.page === 'asistencia') { const p = d.dia.split('|'); abrirDia(Number(p[0]), p[1]); return; }
  if (d.trab) { abrirTrabajador(d.trab); return; }
  if (d.excel) { if (faltanParam().length) { toast('Faltan parámetros de planilla.', 'error'); return; } descargarExcel(); return; }
  if (d.quitaraus) {
    const r = await sb.from('personal_ausencias').delete().eq('id', Number(d.quitaraus));
    if (fallo(r)) return;
    toast('Ausencia quitada.'); await cargarQuincena(); pintarAsistencia(); return;
  }
  if (d.aceptar) {
    const p = d.aceptar.split('|');
    const r = await sb.from('personal_aceptadas').insert({ empresa_id: EMP, trabajador_id: Number(p[0]), fecha: p[1] });
    if (fallo(r)) return;
    toast('Marca aceptada.'); cerrarPanel(); await cargarQuincena(); pintarAsistencia(); return;
  }
  if (d.cerrar) {
    if (!(await confirmar('Cerrar la quincena', 'Al cerrar, nadie puede corregir marcas de la ' + nombreQuincena(PQ.ini).toLowerCase() + ' sin reabrirla. ¿Cerrarla?', 'Sí, cerrar'))) return;
    const r = await sb.rpc('personal_cerrar_quincena', { p_empresa: EMP, p_inicio: PQ.ini, p_fin: PQ.fin });
    if (fallo(r)) return;
    toast('Quincena cerrada. Las marcas quedaron bloqueadas.'); await cargarQuincena(); pintarAsistencia(); return;
  }
  if (d.reabrir) {
    $('caja-reabrir').innerHTML = '<form id="reabrirForm" class="fld" novalidate><label for="motR">Motivo para reabrir</label><textarea id="motR" placeholder="Ej. faltó registrar una incapacidad"></textarea>' +
      '<span class="err oculto" id="errR">Escriba el motivo para reabrir.</span><div style="display:flex;gap:8px;margin-top:6px"><button class="btn red" type="submit">Reabrir quincena</button></div></form>';
    $('motR').focus();
  }
});

document.addEventListener('input', function (e) { if (['wT', 'wS', 'wJ'].indexOf(e.target.id) > -1) calcSalario(); });

document.addEventListener('change', async function (e) {
  const k = e.target.dataset && e.target.dataset.param;
  if (!k || S.page !== 'asistencia') return;
  const v = e.target.value === '' ? null : Number(e.target.value);
  const cambio = {}; cambio[k] = v; cambio.actualizado_en = new Date().toISOString();
  const r = await sb.from('personal_parametros').update(cambio).eq('empresa_id', EMP);
  if (fallo(r)) return;
  PQ.d.params[k] = v; S.params[k] = v;
  toast('Guardado.');
  const cnt = document.querySelector('[data-ptab="param"] .cnt');
  const f = faltanParam().length;
  if (cnt) { cnt.textContent = f; cnt.className = 'cnt ' + (f ? '' : 'z'); if (!f) cnt.remove(); }
});

document.addEventListener('submit', async function (ev) {
  const id = ev.target.id;
  if (['corrForm', 'ausForm', 'trabForm', 'reabrirForm'].indexOf(id) === -1) return;
  ev.preventDefault();
  if (id === 'corrForm') {
    const p = ev.target.dataset.corr.split('|'), tid = Number(p[0]), f = p[1], dia = PQ.d.dias[tid + '|' + f];
    const campo = $('corrCampo').value, hora = $('corrHora').value, mot = $('corrMot').value.trim(), err = $('corrErr');
    const mal = function (m) { err.textContent = m; err.classList.remove('oculto'); };
    if (!hora) return mal('Escriba la hora correcta.');
    if (mot.length < 5) return mal('El motivo es obligatorio: queda guardado junto a la marca original.');
    const antes = dia ? (campo === 'Entrada' ? dia.entrada : dia.salida) : null;
    const r = await sb.from('personal_correcciones').insert({ empresa_id: EMP, trabajador_id: tid, fecha: f, campo: campo, antes: antes, despues: hora, motivo: mot });
    if (r.error) return mal(textoError(r.error));
    toast('Corrección guardada. La marca original quedó en el historial.');
    await cargarQuincena(); pintarAsistencia(); abrirDia(tid, f); return;
  }
  if (id === 'ausForm') {
    const tid = Number($('ausP').value), desde = $('ausD').value, hasta = $('ausH').value, err = $('ausErr');
    const mal = function (m) { err.textContent = m; err.classList.remove('oculto'); };
    if (!tid) return mal('Escoja al trabajador.');
    if (!desde || !hasta || hasta < desde) return mal('Revise las fechas: "hasta" no puede ser antes de "desde".');
    const t = PQ.d.trab.filter(function (x) { return x.id === tid; })[0], sem = diasSemana(PQ.d.jor[t.jornada_id]);
    const filas = fechasDe(desde, hasta).filter(function (f) { return sem.indexOf(pd(f).getDay()) > -1 && !PQ.d.fer[f]; }).map(function (f) {
      return { empresa_id: EMP, trabajador_id: tid, fecha: f, tipo: $('ausT').value, con_goce: $('ausG').value === '1', nota: $('ausN').value.trim() || null };
    });
    if (!filas.length) return mal('En ese rango no hay días de trabajo.');
    const r = await sb.from('personal_ausencias').upsert(filas, { onConflict: 'trabajador_id,fecha' });
    if (r.error) return mal(textoError(r.error));
    toast($('ausT').value + ' registrado' + ($('ausT').value === 'Vacaciones' ? 's' : '') + ': ' + filas.length + ' día' + (filas.length === 1 ? '' : 's') + '.');
    await cargarQuincena(); pintarAsistencia(); return;
  }
  if (id === 'reabrirForm') {
    const mot = $('motR').value.trim();
    if (mot.length < 5) { $('errR').classList.remove('oculto'); return; }
    const r = await sb.rpc('personal_reabrir_quincena', { p_quincena: PQ.d.quincena.id, p_motivo: mot });
    if (fallo(r)) return;
    toast('Quincena reabierta. Quedó registrado el motivo.'); await cargarQuincena(); pintarAsistencia(); return;
  }
  if (id === 'trabForm') {
    const err = $('wErr'), mal = function (m) { err.textContent = m; err.classList.remove('oculto'); };
    const v = { nombre: $('wN').value.trim(), cedula: $('wC').value.trim(), correo: $('wM').value.trim().toLowerCase() || null, fecha_ingreso: $('wI').value,
      cargo: $('wCa').value.trim(), area: $('wA').value.trim() || null, jornada_id: Number($('wJ').value), tipo_salario: $('wT').value, salario: Number($('wS').value),
      forma_pago: $('wF').value, estado: $('wE').value, seguro_social: $('wCss').checked, seguro_educ: $('wSe').checked, isr: $('wIsr').checked,
      otro_desc: Number($('wO').value) || 0, otro_concepto: $('wOn').value.trim() || null };
    const falta = [];
    if (!v.nombre) falta.push('nombre'); if (!v.cedula) falta.push('cédula'); if (!v.cargo) falta.push('cargo'); if (!v.fecha_ingreso) falta.push('fecha de ingreso');
    if (!(v.salario > 0)) falta.push('salario');
    if (falta.length) return mal('Falta: ' + falta.join(', ') + '. Sin estos datos la planilla no se puede calcular.');
    if (v.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.correo)) return mal('El correo no es válido.');
    const nuevo = ev.target.dataset.id === 'nuevo';
    let r;
    if (nuevo) { v.empresa_id = EMP; r = await sb.from('personal_trabajadores').insert(v).select().single(); }
    else r = await sb.from('personal_trabajadores').update(v).eq('id', Number(ev.target.dataset.id)).select().single();
    if (r.error) return mal(textoError(r.error));
    const tid = r.data.id, pcNueva = Number($('wP').value) || null;
    const pcVieja = PQ.d.pcs.filter(function (c) { return c.trabajador_id === tid; })[0];
    if ((pcVieja ? pcVieja.id : null) !== pcNueva) {
      if (pcVieja) { const q = await sb.from('personal_computadoras').update({ trabajador_id: null }).eq('id', pcVieja.id); if (q.error) return mal(textoError(q.error)); }
      if (pcNueva) { const q = await sb.from('personal_computadoras').update({ trabajador_id: tid }).eq('id', pcNueva); if (q.error) return mal(textoError(q.error)); }
    }
    cerrarPanel();
    toast(nuevo ? v.nombre + ' quedó registrado.' : 'Datos de ' + v.nombre.split(' ')[0] + ' guardados.');
    await cargarQuincena(); pintarAsistencia();
  }
});
