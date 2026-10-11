/* TRANSEO PTY · Sistema de flota · documentos.js
 * Documentos · opción A, control por equipo.
 * Una imagen por documento. Al renovar, el anterior pasa al historial.
 * El lector solo rellena: la persona siempre confirma lo que se guarda.
 */

const DOC = { equipos: [], docs: [], hist: [], urls: {}, sel: null };

const PESADOS = ['Mula', 'Camión grúa', 'Camión'];
const TIPOS_PESADOS = ['Revisado', 'Póliza de seguro', 'Pesos y dimensiones', 'Permiso de operación', 'Registro de propiedad', 'Panapass'];
const TIPOS_LIVIANOS = ['Revisado', 'Póliza de seguro', 'Registro de propiedad', 'Panapass'];
const TIPOS_TODOS = ['Revisado', 'Póliza de seguro', 'Pesos y dimensiones', 'Permiso de operación', 'Registro de propiedad', 'Panapass', 'Otro'];
const NO_VENCE = ['Registro de propiedad'];

function tiposDe(e) { return PESADOS.indexOf(e.tipo) > -1 ? TIPOS_PESADOS : TIPOS_LIVIANOS; }

function etiquetaDoc(d) {
  if (!d) return '<span class="etiqueta">FALTA</span>';
  if (d.situacion === 'No vence') return '<span class="etiqueta">NO VENCE</span>';
  if (d.situacion === 'Vencido') return '<span class="etiqueta vencido">VENCIDO ' + Math.abs(d.dias) + ' D</span>';
  if (d.situacion === 'Por vencer') return '<span class="etiqueta urgente">VENCE EN ' + d.dias + ' D</span>';
  return '<span class="etiqueta bien">AL DÍA</span>';
}

function peorDe(equipoId) {
  const e = DOC.equipos.filter(x => x.id === equipoId)[0];
  const docs = DOC.docs.filter(d => d.equipo_id === equipoId);
  if (docs.some(d => d.situacion === 'Vencido')) return 'rojo';
  if (docs.some(d => d.situacion === 'Por vencer')) return 'ambar';
  if (e && tiposDe(e).some(t => !docs.some(d => d.tipo === t))) return '';
  return 'verde';
}

async function mostrarDocumentos(cont) {
  cargando(cont, 'Cargando documentos...');
  const [eq, docs, hist] = await Promise.all([
    sb.from('equipos').select('id, codigo, nombre, placa, tipo, estado, propietario').order('codigo'),
    sb.from('vencimientos').select('*'),
    sb.from('documentos').select('id, equipo_id, tipo, numero, vence, archivo_ref, subido_en, estado').eq('estado', 'Reemplazado').order('subido_en', { ascending: false })
  ]);
  if (eq.error) { cont.innerHTML = '<div class="mensaje error">' + esc(textoError(eq.error)) + '</div>'; return; }
  DOC.equipos = eq.data; DOC.docs = docs.data || []; DOC.hist = hist.data || [];
  if (!DOC.sel || !DOC.equipos.some(e => e.id === DOC.sel)) DOC.sel = DOC.equipos.length ? DOC.equipos[0].id : null;

  const vencidos = DOC.docs.filter(d => d.situacion === 'Vencido').length;
  const porVencer = DOC.docs.filter(d => d.situacion === 'Por vencer');
  const alDia = DOC.docs.filter(d => d.situacion === 'Al día' || d.situacion === 'No vence').length;
  let faltan = 0;
  DOC.equipos.forEach(e => tiposDe(e).forEach(t => { if (!DOC.docs.some(d => d.equipo_id === e.id && d.tipo === t)) faltan++; }));
  const primero = porVencer.sort((a, b) => a.dias - b.dias)[0];

  cont.innerHTML =
    '<div class="kpis">' +
      '<div class="kpi r"><div class="et">VENCIDOS</div><div class="cifra">' + vencidos + '</div><div class="pie">Avisan cada 3 días</div></div>' +
      '<div class="kpi a"><div class="et">VENCEN EN 30 DÍAS</div><div class="cifra">' + porVencer.length + '</div><div class="pie">' +
        (primero ? esc(primero.tipo + ' de ' + primero.equipo) + ', el primero' : 'Nada por ahora') + '</div></div>' +
      '<div class="kpi"><div class="et">AL DÍA</div><div class="cifra">' + alDia + '</div><div class="pie">Con imagen de respaldo</div></div>' +
      '<div class="kpi"><div class="et">SIN CARGAR</div><div class="cifra">' + faltan + '</div><div class="pie">Documentos que faltan</div></div>' +
    '</div>' +
    '<div class="vigila"><b>Qué vigila el sistema</b>Avisa por correo a Cristi, con copia a Leidy, a los 30, 15 y 7 días, el día que vence y, ya vencido, cada 3 días hasta que se suba el nuevo. ' +
      'Si la placa del documento no es la del equipo, o la póliza dice uso particular, lo marca en ámbar antes de guardar.</div>' +
    (PERMISOS.capturar ? '<div class="barra-herramientas"><button class="btn" id="doc-subir">Subir documento</button></div>' : '') +
    '<div class="md"><div class="tarjeta lista" id="doc-lista"></div><div class="tarjeta" id="doc-panel"></div></div>';

  if ($('doc-subir')) $('doc-subir').addEventListener('click', function () { abrirSubida(DOC.sel, null); });
  pintarListaDoc();
  pintarPanelDoc();
}

function pintarListaDoc() {
  $('doc-lista').innerHTML = DOC.equipos.map(e => '<div class="li' + (e.id === DOC.sel ? ' sel' : '') + '" data-eq="' + e.id + '"><div><b>' + esc(e.nombre) +
    '</b><div class="mono">' + esc(e.placa) + '</div></div><span class="pt ' + peorDe(e.id) + '"></span></div>').join('');
  $('doc-lista').querySelectorAll('[data-eq]').forEach(li => li.addEventListener('click', function () {
    DOC.sel = Number(li.dataset.eq); pintarListaDoc(); pintarPanelDoc();
    if (window.innerWidth < 860) $('doc-panel').scrollIntoView({ behavior: 'smooth' });
  }));
}

async function pintarPanelDoc() {
  const p = $('doc-panel');
  const e = DOC.equipos.filter(x => x.id === DOC.sel)[0];
  if (!e) { p.innerHTML = '<div class="vacio">Escoja un equipo.</div>'; return; }
  const docs = DOC.docs.filter(d => d.equipo_id === e.id);
  const esperados = tiposDe(e);
  const otros = docs.filter(d => esperados.indexOf(d.tipo) === -1);
  const rutas = docs.map(d => d.archivo_ref).concat(DOC.hist.filter(h => h.equipo_id === e.id).map(h => h.archivo_ref)).filter(Boolean);
  try { Object.assign(DOC.urls, await urlsFirmadas('documentos', rutas)); } catch (x) {}
  if (DOC.sel !== e.id) return;

  const tarjeta = function (tipo, d) {
    const hist = DOC.hist.filter(h => h.equipo_id === e.id && h.tipo === tipo);
    if (!d) {
      return '<div class="docf falta"><button class="img vacia" data-subir="' + esc(tipo) + '">+</button><div class="cuerpo"><div class="cab"><b>' + esc(tipo) + '</b>' + etiquetaDoc(null) + '</div>' +
        '<div class="gris">No se ha cargado</div>' + (PERMISOS.capturar ? '<div class="acciones"><button class="btn suave chico" data-subir="' + esc(tipo) + '">Subir imagen</button></div>' : '') + '</div></div>';
    }
    const url = d.archivo_ref && DOC.urls[d.archivo_ref];
    return '<div class="docf"><button class="img" ' + (url ? 'data-ver="' + d.id + '"' : '') + '>' + (url ? '<img src="' + esc(url) + '" alt="">' : 'sin<br>imagen') + '</button>' +
      '<div class="cuerpo"><div class="cab"><b>' + esc(d.tipo) + '</b>' + etiquetaDoc(d) + '</div>' +
      '<div class="mono" style="font-size:12.5px">' + esc(d.numero || 'sin número') + '</div>' +
      '<div class="gris">' + (d.vence ? 'Vence ' + fechaTexto(d.vence) : 'No vence · respaldo') + (d.emisor ? ' · ' + esc(d.emisor) : '') + '</div>' +
      (d.en_tramite ? '<div><span class="etiqueta urgente">EN TRÁMITE · AVISA CADA 7 DÍAS</span></div>' : '') +
      '<div class="acciones">' + (url ? '<button class="btn claro chico" data-ver="' + d.id + '">Ver</button>' : '') +
        (PERMISOS.capturar ? '<button class="btn chico" data-subir="' + esc(d.tipo) + '">Renovar</button>' +
          (d.vence ? '<button class="btn claro chico" data-tramite="' + d.id + '">' + (d.en_tramite ? 'Quitar trámite' : 'En trámite') + '</button>' : '') : '') +
        (hist.length ? '<button class="btn claro chico" data-hist="' + esc(tipo) + '">Historial · ' + hist.length + '</button>' : '') + '</div>' +
      '<div class="historial oculto" id="hist-' + slug(tipo) + '">' + hist.map(h => '<div><span>' + esc(h.numero || 'sin número') + ' · ' +
        (h.vence ? 'vencía ' + fechaTexto(h.vence) : 'no vencía') + '</span>' + (h.archivo_ref && DOC.urls[h.archivo_ref] ? '<button class="enlace" data-verh="' + h.id + '">ver</button>' : '') + '</div>').join('') + '</div>' +
      '</div></div>';
  };

  p.innerHTML = '<div class="ficha-cab"><div class="t"><div class="tit2">' + esc(e.nombre) + ' <span class="mono gris" style="font-size:14px">· ' + esc(e.placa) + '</span></div>' +
      '<div class="gris">' + esc(e.tipo) + ' · ' + esperados.length + ' documentos que le corresponden</div></div></div>' +
    '<div class="docs-g">' + esperados.map(t => tarjeta(t, docs.filter(d => d.tipo === t)[0])).join('') + otros.map(d => tarjeta(d.tipo, d)).join('') + '</div>';

  p.querySelectorAll('[data-subir]').forEach(b => b.addEventListener('click', function () { if (PERMISOS.capturar) abrirSubida(e.id, b.dataset.subir); }));
  p.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', function () {
    const d = docs.filter(x => String(x.id) === b.dataset.ver)[0];
    if (d && DOC.urls[d.archivo_ref]) verImagen(DOC.urls[d.archivo_ref], d.tipo + ' · ' + e.nombre + ' · ' + e.placa);
  }));
  p.querySelectorAll('[data-verh]').forEach(b => b.addEventListener('click', function () {
    const h = DOC.hist.filter(x => String(x.id) === b.dataset.verh)[0];
    if (h) verImagen(DOC.urls[h.archivo_ref], h.tipo + ' anterior · ' + e.nombre);
  }));
  p.querySelectorAll('[data-hist]').forEach(b => b.addEventListener('click', function () { $('hist-' + slug(b.dataset.hist)).classList.toggle('oculto'); }));
  p.querySelectorAll('[data-tramite]').forEach(b => b.addEventListener('click', async function () {
    const d = docs.filter(x => String(x.id) === b.dataset.tramite)[0];
    const r = await sb.from('documentos').update({ en_tramite: !d.en_tramite }).eq('id', d.id);
    if (r.error) { aviso(textoError(r.error), 'error'); return; }
    d.en_tramite = !d.en_tramite;
    aviso(d.en_tramite ? 'Marcado en trámite: el aviso baja a cada 7 días.' : 'Quitado de trámite.', 'ok');
    pintarPanelDoc();
  }));
}

// ------------------------------------------------------------------ subir o renovar
function abrirSubida(equipoId, tipo) {
  const f = document.createElement('div');
  f.className = 'fondo-ventana';
  const eqOps = DOC.equipos.map(e => '<option value="' + e.id + '"' + (e.id === equipoId ? ' selected' : '') + '>' + esc(e.nombre + ' · ' + e.placa) + '</option>').join('');
  const tpOps = TIPOS_TODOS.map(t => '<option' + (t === tipo ? ' selected' : '') + '>' + t + '</option>').join('');
  f.innerHTML = '<div class="ventana grande"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px">' +
    '<h3 style="margin:0">' + (tipo ? 'Renovar o cargar · ' + esc(tipo) : 'Subir documento') + '</h3><button class="btn claro chico" data-cerrar="1">Cerrar</button></div>' +
    '<div class="subir"><div><label class="vista" id="sb-vista"><span>Toque aquí para tomar la foto<br>o escoger la imagen del documento<br><small>Una imagen por documento</small></span>' +
      '<input type="file" id="sb-archivo" accept="image/*" class="oculto"></label></div>' +
    '<div><div id="sb-msj"></div><div id="sb-leido"></div>' +
      '<div class="fila"><div class="campo"><label>Equipo *</label><select id="sb-equipo">' + eqOps + '</select></div>' +
        '<div class="campo"><label>Tipo de documento *</label><select id="sb-tipo">' + tpOps + '</select></div></div>' +
      '<div class="fila"><div class="campo"><label>Número</label><input id="sb-numero" class="mono"></div><div class="campo"><label>Emisor · aseguradora o taller</label><input id="sb-emisor"></div></div>' +
      '<div class="fila"><div class="campo"><label>Emisión</label><input id="sb-emision" type="date"></div><div class="campo" id="sb-campo-vence"><label>Vence *</label><input id="sb-vence" type="date"></div></div>' +
      '<label class="recordar" style="margin:0 0 10px"><input type="checkbox" id="sb-tramite"> Ya se está renovando · el aviso baja a cada 7 días</label>' +
      '<div class="campo"><label>Notas</label><textarea id="sb-notas" style="min-height:60px"></textarea></div>' +
      '<div id="sb-reemplaza"></div>' +
      '<div class="acciones"><button class="btn" id="sb-guardar">Guardar documento</button><button class="btn claro" id="sb-leer" disabled>Leer la imagen</button></div>' +
    '</div></div></div>';
  document.body.appendChild(f);

  let img = null, leidos = null;
  const cerrar = function () { f.remove(); };
  f.addEventListener('click', function (ev) { if (ev.target === f || ev.target.getAttribute('data-cerrar')) cerrar(); });

  const revisarTipo = function () {
    const t = $('sb-tipo').value;
    $('sb-campo-vence').classList.toggle('oculto', NO_VENCE.indexOf(t) > -1);
    const eqId = Number($('sb-equipo').value);
    const vig = DOC.docs.filter(d => d.equipo_id === eqId && d.tipo === t)[0];
    $('sb-reemplaza').innerHTML = vig && t !== 'Otro' ? '<div class="mensaje aviso">Reemplaza el vigente' + (vig.numero ? ' ' + esc(vig.numero) : '') +
      (vig.vence ? ', que vence el ' + fechaTexto(vig.vence) : '') + '. El anterior pasa al historial con su imagen.</div>' : '';
  };
  $('sb-tipo').addEventListener('change', revisarTipo);
  $('sb-equipo').addEventListener('change', function () { revisarTipo(); revisarAlertas(); });
  revisarTipo();

  const revisarAlertas = function () {
    if (!leidos) return;
    const e = DOC.equipos.filter(x => x.id === Number($('sb-equipo').value))[0];
    const al = [];
    const placa = String(leidos.placa || '').replace(/[\s-]/g, '').toUpperCase();
    if (placa && e && placa !== String(e.placa).replace(/[\s-]/g, '').toUpperCase()) al.push('La placa leída (' + esc(leidos.placa) + ') no es la de ' + esc(e.nombre) + ' (' + esc(e.placa) + ').');
    if (/particular/i.test(leidos.uso || '') && e && PESADOS.indexOf(e.tipo) > -1) al.push('El documento dice uso <b>particular</b> y el equipo es comercial.');
    if (leidos.a_nombre_de && e && e.propietario && String(leidos.a_nombre_de).toLowerCase().indexOf(String(e.propietario).split(' ')[0].toLowerCase()) === -1) {
      al.push('Sale a nombre de <b>' + esc(leidos.a_nombre_de) + '</b>, y el propietario registrado es ' + esc(e.propietario) + '.');
    }
    if (leidos.confianza === 'baja') al.push('La imagen se leyó con dificultad: revise cada dato.');
    $('sb-msj').innerHTML = al.length ? '<div class="mensaje aviso">' + al.join('<br>') + '</div>' : '';
  };

  $('sb-archivo').addEventListener('change', async function () {
    const a = this.files && this.files[0];
    if (!a) return;
    try {
      img = await reducirImagen(a, 1600, 0.82);
      $('sb-vista').classList.add('llena');
      $('sb-vista').querySelector('span').outerHTML = '<img src="' + img.base64 + '" alt="">';
      $('sb-leer').disabled = false;
      leer();
    } catch (x) { pintarMensaje('sb-msj', esc(textoError(x)), 'error'); }
  });

  const poner = function (id, v) { if (v) $(id).value = v; };
  async function leer() {
    if (!img) return;
    const b = $('sb-leer'); b.disabled = true; b.textContent = 'Leyendo...';
    $('sb-leido').innerHTML = '<div class="mensaje">Leyendo la imagen...</div>';
    const r = await sb.functions.invoke('leer-documento', { body: { imagen: img.base64, pista: $('sb-tipo').value } });
    b.disabled = false; b.textContent = 'Volver a leer';
    let j = r.data;
    if (r.error) { try { j = await r.error.context.json(); } catch (x) { j = null; } }
    if (!j || !j.ok) {
      $('sb-leido').innerHTML = '<div class="mensaje">' + esc((j && j.mensaje) || 'El lector no está disponible ahora. Llene los datos a mano.') + '</div>';
      return;
    }
    leidos = j.datos || {};
    if (leidos.tipo && TIPOS_TODOS.indexOf(leidos.tipo) > -1) $('sb-tipo').value = leidos.tipo;
    const placa = String(leidos.placa || '').replace(/[\s-]/g, '').toUpperCase();
    const eq = DOC.equipos.filter(x => String(x.placa).replace(/[\s-]/g, '').toUpperCase() === placa)[0];
    if (eq) $('sb-equipo').value = eq.id;
    poner('sb-numero', leidos.numero); poner('sb-emisor', leidos.emisor);
    if (/^\d{4}-\d{2}-\d{2}$/.test(leidos.emision || '')) $('sb-emision').value = leidos.emision;
    if (/^\d{4}-\d{2}-\d{2}$/.test(leidos.vence || '')) $('sb-vence').value = leidos.vence;
    const tec = leidos.datos_tecnicos || {};
    const chips = Object.keys(tec).filter(k => tec[k]).map(k => '<span class="chip">' + esc(k.replace(/_t$/, ' (t)').replace(/_m$/, ' (m)').replace(/_/g, ' ')) + ': ' + esc(tec[k]) + '</span>');
    $('sb-leido').innerHTML = '<div class="leido">Reconocido como <b>' + esc(leidos.tipo || 'documento') + '</b>' + (eq ? ' de <b>' + esc(eq.nombre) + '</b>' : '') +
      '. Revise los datos antes de guardar.</div>' + (chips.length ? '<div class="gris" style="margin-bottom:6px">También se leyó · se puede pasar a la hoja de vida</div><div class="chips">' + chips.join('') + '</div>' +
      '<label class="recordar" style="margin:0 0 10px"><input type="checkbox" id="sb-tecnicos" checked> Pasar estos datos a la hoja de vida del equipo</label>' : '');
    revisarTipo(); revisarAlertas();
  }
  $('sb-leer').addEventListener('click', leer);

  $('sb-guardar').addEventListener('click', async function () {
    const eqId = Number($('sb-equipo').value), t = $('sb-tipo').value;
    const vence = $('sb-vence').value || null;
    if (!img) { pintarMensaje('sb-msj', 'Falta la imagen del documento.', 'error'); return; }
    if (NO_VENCE.indexOf(t) === -1 && t !== 'Otro' && !vence) { pintarMensaje('sb-msj', 'Falta la fecha de vencimiento.', 'error'); return; }
    const b = $('sb-guardar'); b.disabled = true; b.textContent = 'Guardando...';
    try {
      const ruta = await subirImagen('documentos', eqId + '/' + slug(t) + '/' + Date.now() + '.jpg', img.blob);
      const r = await sb.rpc('guardar_documento', {
        p_equipo_id: eqId, p_tipo: t, p_numero: $('sb-numero').value, p_emisor: $('sb-emisor').value,
        p_emision: $('sb-emision').value || null, p_vence: vence, p_en_tramite: $('sb-tramite').checked,
        p_archivo_ref: ruta, p_datos: leidos, p_notas: $('sb-notas').value
      });
      if (r.error) throw r.error;
      // lo técnico, a la hoja de vida
      if (leidos && $('sb-tecnicos') && $('sb-tecnicos').checked) {
        const tec = leidos.datos_tecnicos || {}, cambios = {};
        ['marca', 'modelo', 'color', 'chasis', 'motor'].forEach(k => { if (tec[k]) cambios[k] = String(tec[k]).trim(); });
        if (tec.anio && /^\d{4}$/.test(String(tec.anio))) cambios.anio = Number(tec.anio);
        ['alto_m', 'ancho_m', 'largo_m', 'peso_bruto_t', 'peso_vacio_t', 'carga_util_t'].forEach(k => { const n = parseFloat(String(tec[k] || '').replace(',', '.')); if (!isNaN(n)) cambios[k] = n; });
        if (Object.keys(cambios).length) await sb.from('equipos').update(cambios).eq('id', eqId);
      }
      aviso('Documento guardado.', 'ok');
      cerrar();
      DOC.sel = eqId;
      mostrarDocumentos($('contenido'));
    } catch (x) {
      b.disabled = false; b.textContent = 'Guardar documento';
      pintarMensaje('sb-msj', esc(textoError(x)), 'error');
    }
  });
}
