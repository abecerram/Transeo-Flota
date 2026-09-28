/* TRANSEO PTY · Sistema de flota · catalogos.js
 *
 * Un solo motor para todos los catálogos. Cada catálogo se describe
 * abajo: qué tabla usa, qué columnas se ven en la lista y qué campos
 * lleva el formulario. Agregar un campo es agregar una línea.
 */

const OPC = {
  tipoEquipo: ['Mula', 'Camión grúa', 'Camión', 'Pickup', 'Automóvil', 'SUV', 'Otro'],
  estadoEquipo: ['Activo', 'En taller', 'Fuera de servicio', 'Vendido'],
  combustible: ['Diésel', 'Gasolina', 'Híbrido', 'Eléctrico'],
  activo: ['Activo', 'Inactivo'],
  clase: ['Proveedor', 'Conductor', 'Mano de obra', 'Otro'],
  rubro: ['Combustible', 'Repuestos', 'Mantenimiento', 'Llantas', 'Lubricantes', 'Documentación', 'Peajes', 'Servicios', 'Otro'],
  formaPago: ['Yappy', 'ACH', 'Efectivo', 'Crédito'],
  tipoCuenta: ['Ahorros', 'Corriente'],
  evaluacion: ['Bueno', 'Regular', 'Deficiente'],
  estadoProyecto: ['Activo', 'Cerrado'],
  formaCobro: ['Crédito', 'Contado', 'Crédito 30 días', 'Crédito 60 días']
};

const CATALOGOS = {

  equipos: {
    tabla: 'equipos', titulo: 'Equipos', sub: 'La flota y su hoja de vida', orden: 'codigo', singular: 'equipo',
    buscar: ['codigo', 'nombre', 'placa', 'marca', 'modelo'],
    lista: [
      { c: 'codigo', t: 'Código', mono: true },
      { c: 'nombre', t: 'Equipo', fuerte: true },
      { c: 'placa', t: 'Placa', mono: true },
      { c: 'tipo', t: 'Tipo' },
      { c: 'marca', t: 'Marca y modelo', junto: ['marca', 'modelo'] },
      { c: 'anio', t: 'Año' },
      { c: 'estado', t: 'Estado', etiqueta: { 'Activo': 'bien', 'En taller': 'urgente', 'Fuera de servicio': 'vencido' } }
    ],
    form: [
      { grupo: 'Identificación' },
      [{ c: 'codigo', t: 'Código', ph: 'EQ-11' }, { c: 'nombre', t: 'Nombre *', req: true, ph: 'Grúa roja' },
       { c: 'placa', t: 'Placa *', req: true, mayus: true, ph: 'EO2142' }],
      [{ c: 'tipo', t: 'Tipo *', tipo: 'select', ops: OPC.tipoEquipo, req: true },
       { c: 'estado', t: 'Estado', tipo: 'select', ops: OPC.estadoEquipo, def: 'Activo' },
       { c: 'propietario', t: 'Propietario', ph: 'Transeo Pty' }],
      { grupo: 'Datos del vehículo · del registro de propiedad' },
      [{ c: 'marca', t: 'Marca' }, { c: 'modelo', t: 'Modelo' }, { c: 'anio', t: 'Año', tipo: 'number' }, { c: 'color', t: 'Color' }],
      [{ c: 'combustible', t: 'Combustible', tipo: 'select', ops: OPC.combustible },
       { c: 'transmision', t: 'Transmisión' }, { c: 'cilindros', t: 'Cilindros', tipo: 'number' }, { c: 'ejes', t: 'Ejes', tipo: 'number' }],
      [{ c: 'chasis', t: 'Chasis', mayus: true, mono: true }, { c: 'motor', t: 'Número de motor', mayus: true, mono: true }],
      { grupo: 'Pesos y dimensiones · de la tarjeta de la ATTT' },
      [{ c: 'alto_m', t: 'Alto (m)', tipo: 'number', paso: '0.01' }, { c: 'ancho_m', t: 'Ancho (m)', tipo: 'number', paso: '0.01' },
       { c: 'largo_m', t: 'Largo (m)', tipo: 'number', paso: '0.01' }],
      [{ c: 'peso_bruto_t', t: 'Peso bruto (t)', tipo: 'number', paso: '0.01' }, { c: 'peso_vacio_t', t: 'Peso vacío (t)', tipo: 'number', paso: '0.01' },
       { c: 'carga_util_t', t: 'Carga útil (t)', tipo: 'number', paso: '0.01' }],
      { grupo: 'Uso' },
      [{ c: 'km_actual', t: 'Kilometraje actual', tipo: 'number' }],
      [{ c: 'notas', t: 'Notas', tipo: 'textarea' }]
    ]
  },

  conductores: {
    tabla: 'conductores', titulo: 'Conductores', sub: 'Quién maneja cada equipo', orden: 'nombre', singular: 'conductor',
    buscar: ['nombre', 'cedula', 'celular'],
    lista: [
      { c: 'nombre', t: 'Nombre', fuerte: true },
      { c: 'cedula', t: 'Cédula', mono: true },
      { c: 'celular', t: 'Celular', mono: true },
      { c: 'equipo_id', t: 'Equipo habitual', fuente: 'equipos' },
      { c: 'licencia_vence', t: 'Licencia vence', fecha: true },
      { c: 'estado', t: 'Estado', etiqueta: { 'Activo': 'bien' } }
    ],
    form: [
      [{ c: 'nombre', t: 'Nombre completo *', req: true }, { c: 'cedula', t: 'Cédula', ph: '8-490-974' },
       { c: 'celular', t: 'Celular', ph: '6489-9870' }],
      { grupo: 'Licencia de conducir · con su propio aviso de vencimiento' },
      [{ c: 'licencia_tipo', t: 'Tipo de licencia' }, { c: 'licencia_numero', t: 'Número de licencia', mono: true },
       { c: 'licencia_vence', t: 'Licencia vence', tipo: 'date' }],
      [{ c: 'equipo_id', t: 'Equipo habitual', tipo: 'select', fuente: 'equipos' }],
      [{ c: 'estado', t: 'Estado', tipo: 'select', ops: OPC.activo, def: 'Activo' }],
      [{ c: 'notas', t: 'Notas', tipo: 'textarea' }]
    ]
  },

  beneficiarios: {
    tabla: 'beneficiarios', titulo: 'Proveedores y beneficiarios', sub: 'Todo a quien se le paga', orden: 'nombre',
    singular: 'beneficiario', buscar: ['nombre', 'ruc_cedula', 'yappy', 'contacto'],
    filtro: { c: 'clase', ops: OPC.clase, t: 'Todos' },
    lista: [
      { c: 'nombre', t: 'Nombre', fuerte: true, debajo: 'rubro' },
      { c: 'clase', t: 'Es' },
      { c: 'ruc_cedula', t: 'RUC o cédula', mono: true, falta: true },
      { c: 'yappy', t: 'Yappy', mono: true },
      { c: 'cuenta', t: 'Cuenta', junto: ['banco', 'cuenta'] },
      { c: 'forma_pago_habitual', t: 'Pago habitual' },
      { c: 'estado', t: 'Estado', etiqueta: { 'Activo': 'bien' } }
    ],
    form: [
      { grupo: 'Quién es' },
      [{ c: 'nombre', t: 'Nombre *', req: true, ph: 'Prosellos, S.A. o Tomás Marciaga' },
       { c: 'clase', t: 'Es *', tipo: 'select', ops: OPC.clase, req: true },
       { c: 'estado', t: 'Estado', tipo: 'select', ops: OPC.activo, def: 'Activo' }],
      [{ c: 'ruc_cedula', t: 'RUC o cédula', ph: '155123456-2-2020 DV45' },
       { c: 'rubro', t: 'Rubro · solo proveedores', tipo: 'select', ops: OPC.rubro },
       { c: 'contribuyente', t: 'Factura con ITBMS', tipo: 'check' }],
      { grupo: 'Contacto' },
      [{ c: 'contacto', t: 'Persona de contacto' }, { c: 'telefono', t: 'Teléfono' }, { c: 'correo', t: 'Correo' }],
      [{ c: 'direccion', t: 'Dirección' }],
      { grupo: 'Datos para pagarle · los usa Contabilidad' },
      [{ c: 'forma_pago_habitual', t: 'Forma de pago habitual', tipo: 'select', ops: OPC.formaPago },
       { c: 'yappy', t: 'Yappy', ph: '6489-9870', mono: true },
       { c: 'dias_credito', t: 'Días de crédito', tipo: 'number' }],
      [{ c: 'banco', t: 'Banco' }, { c: 'tipo_cuenta', t: 'Tipo de cuenta', tipo: 'select', ops: OPC.tipoCuenta },
       { c: 'cuenta', t: 'Número de cuenta', mono: true }, { c: 'titular_cuenta', t: 'A nombre de' }],
      { grupo: 'Otros' },
      [{ c: 'evaluacion', t: 'Evaluación · ISO 9001', tipo: 'select', ops: OPC.evaluacion }],
      [{ c: 'notas', t: 'Notas', tipo: 'textarea' }]
    ],
    antesDeGuardar: function (d) {
      if (d.yappy) {
        const n = String(d.yappy).replace(/[^0-9]/g, '');
        if (n.length !== 8) return 'El Yappy debe tener 8 dígitos, así: 6489-9870.';
        d.yappy = n.substring(0, 4) + '-' + n.substring(4);
      }
      if (d.clase !== 'Proveedor') d.rubro = null;
      return null;
    }
  },

  clientes: {
    tabla: 'clientes', titulo: 'Clientes', sub: 'A quién se le factura', orden: 'nombre', singular: 'cliente',
    buscar: ['nombre', 'ruc_cedula', 'contacto'],
    lista: [
      { c: 'nombre', t: 'Cliente', fuerte: true },
      { c: 'ruc_cedula', t: 'RUC o cédula', mono: true, falta: true },
      { c: 'contacto', t: 'Contacto' },
      { c: 'telefono', t: 'Teléfono', mono: true },
      { c: 'forma_cobro', t: 'Cobro' },
      { c: 'estado', t: 'Estado', etiqueta: { 'Activo': 'bien' } }
    ],
    form: [
      [{ c: 'nombre', t: 'Nombre o razón social *', req: true, ph: 'Clemente Poveda' },
       { c: 'ruc_cedula', t: 'RUC o cédula' }, { c: 'estado', t: 'Estado', tipo: 'select', ops: OPC.activo, def: 'Activo' }],
      [{ c: 'contacto', t: 'Contacto' }, { c: 'telefono', t: 'Teléfono' }, { c: 'correo', t: 'Correo' }],
      [{ c: 'direccion', t: 'Dirección' }, { c: 'forma_cobro', t: 'Forma de cobro', tipo: 'select', ops: OPC.formaCobro }],
      [{ c: 'notas', t: 'Notas', tipo: 'textarea' }]
    ]
  },

  proyectos: {
    tabla: 'proyectos', titulo: 'Proyectos', sub: 'Nombre oficial, cliente y frentes de obra', orden: 'nombre_corto',
    singular: 'proyecto', buscar: ['nombre_corto', 'nombre_oficial'],
    consulta: '*, proyecto_frentes(nombre)',
    lista: [
      { c: 'nombre_corto', t: 'Proyecto', fuerte: true, debajo: 'nombre_oficial', corto: 110 },
      { c: 'cliente_id', t: 'Cliente', fuente: 'clientes' },
      { c: 'proyecto_frentes', t: 'Frentes', cuenta: true },
      { c: 'forma_pago', t: 'Pago' },
      { c: 'estado', t: 'Estado', etiqueta: { 'Activo': 'bien' } }
    ],
    form: [
      [{ c: 'nombre_corto', t: 'Nombre corto *', req: true, ph: 'CCO3' },
       { c: 'cliente_id', t: 'Cliente', tipo: 'select', fuente: 'clientes' },
       { c: 'estado', t: 'Estado', tipo: 'select', ops: OPC.estadoProyecto, def: 'Activo' }],
      [{ c: 'nombre_oficial', t: 'Nombre oficial completo * · tal como va en las órdenes', tipo: 'textarea', req: true }],
      [{ c: '_frentes', t: 'Frentes de obra · uno por línea', tipo: 'textarea', virtual: true,
         ph: 'Campamento CCO3\nNave 2\nEdificio Principal\nEdificio Auxiliar' }],
      { grupo: 'Contacto del cliente en el proyecto' },
      [{ c: 'contacto', t: 'Nombre' }, { c: 'correo', t: 'Correo' }, { c: 'telefono', t: 'Teléfono' }],
      [{ c: 'forma_pago', t: 'Forma de pago pactada', tipo: 'select', ops: OPC.formaCobro },
       { c: 'fecha_inicio', t: 'Inicio', tipo: 'date' }, { c: 'fecha_cierre', t: 'Cierre estimado', tipo: 'date' }],
      [{ c: 'notas', t: 'Notas', tipo: 'textarea' }]
    ],
    alCargar: function (fila) {
      fila._frentes = (fila.proyecto_frentes || []).map(function (f) { return f.nombre; }).join('\n');
    },
    despuesDeGuardar: async function (id, d) {
      const frentes = String(d._frentes || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      const borrar = await sb.from('proyecto_frentes').delete().eq('proyecto_id', id);
      if (borrar.error) throw borrar.error;
      if (frentes.length) {
        const r = await sb.from('proyecto_frentes').insert(frentes.map(function (n) { return { proyecto_id: id, nombre: n }; }));
        if (r.error) throw r.error;
      }
    }
  }
};

// =====================================================================
//  MOTOR
// =====================================================================

const CAT_ESTADO = {};           // datos cargados por catálogo
const RECARGA = {};              // pantallas propias que usan el formulario del catálogo (Equipos)

function recargarCatalogo(clave) {
  if (RECARGA[clave]) RECARGA[clave]();
  else mostrarCatalogo(clave, $('contenido'));
}
const FUENTES = {};              // listas para los selectores: equipos, clientes...

async function cargarFuente(nombre) {
  const def = { equipos: ['id, nombre, placa', 'nombre'], clientes: ['id, nombre', 'nombre'] }[nombre];
  const r = await sb.from(nombre).select(def[0]).order(def[1]);
  if (r.error) throw r.error;
  FUENTES[nombre] = r.data.map(function (x) {
    return { v: x.id, t: x.placa ? x.nombre + ' · ' + x.placa : x.nombre };
  });
}

function textoFuente(nombre, id) {
  const f = (FUENTES[nombre] || []).filter(function (x) { return x.v === id; })[0];
  return f ? f.t : '';
}

async function mostrarCatalogo(clave, cont) {
  const cat = CATALOGOS[clave];
  cont.innerHTML = '<div class="cargando"><div class="giro"></div> Cargando ' + esc(cat.titulo.toLowerCase()) + '...</div>';

  const fuentes = {};
  cat.lista.concat(cat.form.flat ? cat.form.flat() : []).forEach(function (x) { if (x && x.fuente) fuentes[x.fuente] = 1; });
  try {
    await Promise.all(Object.keys(fuentes).map(cargarFuente));
    const r = await sb.from(cat.tabla).select(cat.consulta || '*').order(cat.orden);
    if (r.error) throw r.error;
    CAT_ESTADO[clave] = r.data;
    if (cat.alCargar) r.data.forEach(cat.alCargar);
  } catch (e) {
    cont.innerHTML = '<div class="mensaje error">' + esc(textoError(e)) + '</div>';
    return;
  }

  const puede = PERMISOS.capturar;
  cont.innerHTML =
    '<div class="tarjeta" id="cat-lista">' +
      '<div class="barra-herramientas">' +
        (cat.filtro ? '<select id="cat-filtro"><option value="">' + cat.filtro.t + '</option>' +
          cat.filtro.ops.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>' : '') +
        '<input id="cat-buscar" placeholder="Buscar">' +
        (puede ? '<button class="btn" id="cat-nuevo">Agregar ' + esc(cat.singular) + '</button>' : '') +
      '</div>' +
      '<div class="tabla-caja" id="cat-tabla"></div>' +
    '</div>' +
    '<div class="tarjeta oculto" id="cat-form"></div>';

  $('cat-buscar').addEventListener('input', function () { pintarTabla(clave); });
  if (cat.filtro) $('cat-filtro').addEventListener('change', function () { pintarTabla(clave); });
  if (puede) $('cat-nuevo').addEventListener('click', function () { abrirFormulario(clave, null); });
  pintarTabla(clave);
}

function valorCelda(col, fila) {
  let v = fila[col.c];
  if (col.junto) v = col.junto.map(function (k) { return fila[k]; }).filter(Boolean).join(' · ');
  if (col.fuente) v = textoFuente(col.fuente, v);
  if (col.fecha) v = fechaTexto(v);
  if (col.cuenta) v = (v || []).length;
  let h = esc(v === null || v === undefined ? '' : v);
  if (col.etiqueta && v) h = '<span class="etiqueta ' + (col.etiqueta[v] || '') + '">' + esc(String(v).toUpperCase()) + '</span>';
  if (col.falta && !v) h = '<span style="color:var(--ambar)">falta</span>';
  if (!h && !col.falta) h = '<span style="color:var(--borde-fuerte)">-</span>';
  if (col.mono) h = '<span class="mono" style="font-size:12.5px">' + h + '</span>';
  if (col.fuerte) h = '<strong>' + h + '</strong>';
  if (col.debajo && fila[col.debajo]) {
    let d = String(fila[col.debajo]);
    if (col.corto && d.length > col.corto) d = d.substring(0, col.corto) + '…';
    h += '<div style="font-size:11.5px; color:var(--gris); max-width:460px">' + esc(d) + '</div>';
  }
  return h;
}

function pintarTabla(clave) {
  const cat = CATALOGOS[clave];
  const q = ($('cat-buscar').value || '').toLowerCase().trim();
  const f = cat.filtro ? $('cat-filtro').value : '';
  const filas = CAT_ESTADO[clave].filter(function (x) {
    if (f && x[cat.filtro.c] !== f) return false;
    if (!q) return true;
    return cat.buscar.map(function (k) { return x[k] || ''; }).join(' ').toLowerCase().indexOf(q) > -1;
  });

  if (!filas.length) {
    $('cat-tabla').innerHTML = '<div class="vacio">' + (CAT_ESTADO[clave].length ? 'Nada coincide con la búsqueda.' : 'Todavía no hay registros.') + '</div>';
    return;
  }
  $('cat-tabla').innerHTML = '<table class="datos"><tr>' +
    cat.lista.map(function (c) { return '<th>' + esc(c.t) + '</th>'; }).join('') + '<th></th></tr>' +
    filas.map(function (x) {
      return '<tr>' + cat.lista.map(function (c) { return '<td>' + valorCelda(c, x) + '</td>'; }).join('') +
        '<td style="text-align:right"><button class="btn claro chico" data-id="' + x.id + '">Abrir</button></td></tr>';
    }).join('') + '</table>' +
    '<div style="font-size:12px; color:var(--gris); margin-top:10px">' + filas.length + ' de ' + CAT_ESTADO[clave].length + '</div>';

  $('cat-tabla').querySelectorAll('button[data-id]').forEach(function (b) {
    b.addEventListener('click', function () {
      const fila = CAT_ESTADO[clave].filter(function (x) { return String(x.id) === b.getAttribute('data-id'); })[0];
      abrirFormulario(clave, fila);
    });
  });
}

function htmlCampo(f, fila) {
  const v = fila ? fila[f.c] : (f.def !== undefined ? f.def : '');
  const id = 'f-' + f.c;
  const dis = PERMISOS.capturar ? '' : ' disabled';
  if (f.tipo === 'check') {
    return '<label class="campo check"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + dis + '> ' + esc(f.t) + '</label>';
  }
  let control;
  if (f.tipo === 'select') {
    const ops = f.fuente ? FUENTES[f.fuente] : f.ops.map(function (o) { return { v: o, t: o }; });
    control = '<select id="' + id + '"' + dis + '><option value="">Seleccione</option>' +
      ops.map(function (o) { return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(v) ? ' selected' : '') + '>' + esc(o.t) + '</option>'; }).join('') +
      '</select>';
  } else if (f.tipo === 'textarea') {
    control = '<textarea id="' + id + '" placeholder="' + esc(f.ph || '') + '"' + dis + '>' + esc(v || '') + '</textarea>';
  } else {
    control = '<input id="' + id + '" type="' + (f.tipo || 'text') + '"' + (f.paso ? ' step="' + f.paso + '"' : '') +
      ' value="' + esc(v === null || v === undefined ? '' : v) + '" placeholder="' + esc(f.ph || '') + '"' +
      (f.mono ? ' class="mono"' : '') + dis + '>';
  }
  return '<div class="campo"><label for="' + id + '">' + esc(f.t) + '</label>' + control + '</div>';
}

function abrirFormulario(clave, fila) {
  const cat = CATALOGOS[clave];
  const form = $('cat-form');
  let h = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px">' +
    '<h2 style="margin:0">' + esc(fila ? (fila.nombre || fila.nombre_corto || cat.singular) : 'Nuevo ' + cat.singular) + '</h2>' +
    '<button class="btn claro chico" id="cat-volver">Volver a la lista</button></div><div id="cat-msj"></div>';
  cat.form.forEach(function (bloque) {
    if (!Array.isArray(bloque)) { h += '<div class="grupo">' + esc(bloque.grupo) + '</div>'; return; }
    h += '<div class="fila">' + bloque.map(function (f) { return htmlCampo(f, fila); }).join('') + '</div>';
  });
  if (PERMISOS.capturar) {
    h += '<div class="acciones"><button class="btn" id="cat-guardar">Guardar</button>' +
      '<button class="btn claro" id="cat-cancelar">Cancelar</button>' +
      (fila && PERMISOS.admin ? '<button class="btn claro" id="cat-borrar" style="margin-left:auto; color:var(--rojo); border-color:var(--rojo)">Eliminar</button>' : '') +
      '</div>';
  }
  form.innerHTML = h;
  if ($('cat-lista')) $('cat-lista').classList.add('oculto');
  form.classList.remove('oculto');
  window.scrollTo(0, 0);

  const cerrar = function () { form.classList.add('oculto'); if ($('cat-lista')) $('cat-lista').classList.remove('oculto'); };
  $('cat-volver').addEventListener('click', cerrar);
  if (!PERMISOS.capturar) return;
  $('cat-cancelar').addEventListener('click', cerrar);
  $('cat-guardar').addEventListener('click', function () { guardarFormulario(clave, fila); });
  if ($('cat-borrar')) $('cat-borrar').addEventListener('click', function () { borrarRegistro(clave, fila); });
}

async function guardarFormulario(clave, fila) {
  const cat = CATALOGOS[clave];
  const d = {}, faltan = [];
  cat.form.forEach(function (b) {
    if (!Array.isArray(b)) return;
    b.forEach(function (f) {
      const el = $('f-' + f.c);
      let v;
      if (f.tipo === 'check') v = el.checked;
      else {
        v = el.value.trim();
        if (f.mayus) v = v.toUpperCase();
        if (v === '') v = null;
        else if (f.tipo === 'number' || f.fuente) v = Number(v);
      }
      if (f.req && (v === null || v === '')) faltan.push(f.t.split(/ \*| ·/)[0].toLowerCase());
      d[f.c] = v;
    });
  });
  if (faltan.length) { pintarMensaje('cat-msj', 'Falta: ' + faltan.join(', ') + '.', 'error'); return; }
  if (cat.antesDeGuardar) {
    const e = cat.antesDeGuardar(d);
    if (e) { pintarMensaje('cat-msj', e, 'error'); return; }
  }

  const registro = {};
  Object.keys(d).forEach(function (k) {
    const f = cat.form.flat().filter(function (x) { return x && x.c === k; })[0];
    if (!f || !f.virtual) registro[k] = d[k];
  });

  const btn = $('cat-guardar');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const r = fila
      ? await sb.from(cat.tabla).update(registro).eq('id', fila.id).select('id').single()
      : await sb.from(cat.tabla).insert(registro).select('id').single();
    if (r.error) throw r.error;
    if (cat.despuesDeGuardar) await cat.despuesDeGuardar(r.data.id, d);
    aviso((fila ? 'Cambios guardados' : 'Registrado') + ': ' + (d.nombre || d.nombre_corto || ''), 'ok');
    recargarCatalogo(clave);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Guardar';
    pintarMensaje('cat-msj', esc(textoError(e)), 'error');
  }
}

async function borrarRegistro(clave, fila) {
  const cat = CATALOGOS[clave];
  const ok = await confirmar('Eliminar ' + cat.singular, 'Se borra ' + (fila.nombre || fila.nombre_corto) +
    '. Queda anotado en la bitácora. Si está en uso en otros registros, no se podrá borrar: en ese caso márquelo como inactivo.',
    'Eliminar', true);
  if (!ok) return;
  const r = await sb.from(cat.tabla).delete().eq('id', fila.id);
  if (r.error) { pintarMensaje('cat-msj', esc(textoError(r.error)), 'error'); return; }
  aviso('Eliminado.', 'ok');
  recargarCatalogo(clave);
}
