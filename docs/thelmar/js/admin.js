/* GRUPO THELMAR · Portal · admin.js
 * Configuración (funciones, jornadas, feriados, computadoras con reloj) y Usuarios.
 * Solo el administrador ve estas secciones. Los usuarios se crean con clave
 * temporal, igual que en Transeo: la persona escoge la suya al entrar.
 */

const CF = { sec: 'funciones' };
const ROLES_THM = ['Administrador', 'Gerencia', 'Planilla', 'Trabajador'];
const QUE_ROL = { Administrador: 'Todo, más configuración y usuarios', Gerencia: 'Consulta horas y planilla', Planilla: 'Trabajadores, marcas, permisos y planilla', Trabajador: 'Tablero y su agenda' };

// ------------------------------------------------------------------ configuración
VISTAS.config = async function (el) {
  cargando(el);
  const r = await Promise.all([
    sb.from('personal_parametros').select('*').eq('empresa_id', EMP).maybeSingle(),
    sb.from('personal_jornadas').select('*').eq('empresa_id', EMP).order('id'),
    sb.from('personal_feriados').select('*').eq('empresa_id', EMP).gte('fecha', addD(hoyPanama(), -60)).order('fecha'),
    sb.from('personal_computadoras').select('id, codigo, trabajador_id, activa, ultima_senal').eq('empresa_id', EMP).order('codigo'),
    sb.from('personal_trabajadores').select('id, nombre').eq('empresa_id', EMP)
  ]);
  for (const x of r) if (fallo(x)) return;
  CF.p = r[0].data || {}; CF.jor = r[1].data || []; CF.fer = r[2].data || []; CF.pcs = r[3].data || [];
  CF.nom = {}; (r[4].data || []).forEach(function (t) { CF.nom[t.id] = t.nombre; });
  S.params = CF.p;
  pintarConfig(el);
};

function interruptor(k, titulo, texto, primero) {
  return '<div class="sw"' + (primero ? ' style="border-top:0"' : '') + '><div><b>' + titulo + '</b><small>' + texto + '</small></div>' +
    '<button type="button" class="tog" role="switch" aria-checked="' + !!CF.p[k] + '" aria-label="' + esc(titulo) + '" data-sw="' + k + '"></button></div>';
}

function pintarConfig(el) {
  el = el || $('contenido');
  const secs = [['funciones', 'Funciones'], ['jornadas', 'Jornadas'], ['calculo', 'Recesos y horas extra'], ['feriados', 'Feriados'], ['pcs', 'Computadoras y claves']];
  const I = {
    funciones: function () {
      return '<div class="card"><div class="cap"><b>Funciones que puede encender o apagar</b></div>' +
        interruptor('aviso_trabajador', 'Aviso de entrada al trabajador', 'El trabajador ve, junto a su nombre, la hora en que el reloj marcó su entrada. Apagado: no ve nada de marcación.', true) +
        interruptor('almuerzo_marcado', 'Marcar salida y regreso del almuerzo', 'Agrega dos marcas al día. Apagado: se descuenta el almuerzo fijo de la jornada. Queda para una próxima versión del reloj.') +
        interruptor('marca_celular', 'Marcación desde el celular', 'Para personal de obra sin computadora: marca con su usuario y clave. Pensado para proyectos futuros; aún no tiene pantalla.') + '</div>';
    },
    jornadas: function () {
      return '<div class="card"><div class="cap"><b>Jornadas</b><small>Planilla asigna la jornada a cada trabajador al registrarlo</small></div><div class="tw"><table class="t" style="min-width:600px"><thead><tr>' +
        '<th>Jornada</th><th>Días</th><th>Entrada</th><th>Salida</th><th class="n">Almuerzo</th><th class="n">Horas</th><th>Estado</th><th></th></tr></thead><tbody>' +
        (CF.jor.length ? CF.jor.map(function (j) {
          return '<tr><td><b>' + esc(j.nombre) + '</b></td><td>' + esc(j.dias) + '</td><td class="tm">' + hm(j.entrada) + '</td><td class="tm">' + hm(j.salida) + '</td><td class="n">' +
            j.almuerzo_min + ' min</td><td class="n">' + Number(j.horas) + ' h</td><td>' + (j.activa ? '<span class="pill ok">Activa</span>' : '<span class="pill off">Inactiva</span>') +
            '</td><td><button class="btn plain sm" type="button" data-jor="' + j.id + '">Editar</button></td></tr>';
        }).join('') : '<tr><td colspan="8"><div class="vacio">No hay jornadas.</div></td></tr>') +
        '</tbody></table></div><div style="padding:14px;border-top:1px solid var(--rule);display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">' +
        '<div class="fld"><label for="tol">Tolerancia de llegada (minutos)</label><input id="tol" class="inl" type="number" min="0" max="120" value="' + (CF.p.tolerancia_min || 0) + '"></div>' +
        '<button class="btn navy" type="button" data-jor="nueva">Agregar jornada</button></div></div>';
    },
    calculo: function () {
      return '<div class="card"><div class="cap"><b>Recesos y horas extra</b></div>' +
        interruptor('descontar_recesos', 'Descontar los recesos de las horas trabajadas', 'El tiempo que la computadora pasó en reposo se resta de las horas del día.', true) +
        interruptor('calcular_extra', 'Calcular horas extra aparte', 'Lo que pase de la jornada sale como horas extra y se paga con recargo.') + '</div>' +
        '<div class="box off">Los porcentajes de recargo, los descuentos de ley y la tabla del ISR los llena Planilla en Asistencia y planilla.</div>';
    },
    feriados: function () {
      return '<div class="card"><div class="cap"><b>Feriados</b><small>Ese día no cuenta como falta; si se trabaja, va con recargo de feriado</small></div><div class="tw"><table class="t" style="min-width:420px">' +
        '<thead><tr><th>Fecha</th><th>Feriado</th><th></th></tr></thead><tbody>' + (CF.fer.length ? CF.fer.map(function (f) {
          return '<tr><td class="tm">' + fechaTexto(f.fecha) + '</td><td>' + esc(f.nombre) + '</td><td><button class="btn plain sm" type="button" data-quitarfer="' + f.id + '">Quitar</button></td></tr>';
        }).join('') : '<tr><td colspan="3"><div class="vacio">No hay feriados registrados de aquí en adelante.</div></td></tr>') + '</tbody></table></div>' +
        '<div style="padding:14px;border-top:1px solid var(--rule)"><form id="ferForm" class="frm" novalidate><div class="fld"><label for="ferF">Fecha</label><input id="ferF" type="date"></div>' +
        '<div class="fld"><label for="ferN">Nombre</label><input id="ferN" placeholder="Ej. Día de la Bandera"></div><span class="err fld full oculto" id="ferErr"></span>' +
        '<div class="fld full"><div><button class="btn navy" type="submit">Agregar feriado</button></div></div></form></div></div>';
    },
    pcs: function () {
      return '<div class="card"><div class="cap"><b>Computadoras con reloj</b><small>Sin clave válida, el sistema rechaza la marca</small></div><div class="tw"><table class="t"><thead><tr>' +
        '<th>Computadora</th><th>Asignada a</th><th>Última señal</th><th>Estado</th><th></th></tr></thead><tbody>' + (CF.pcs.length ? CF.pcs.map(function (c) {
          return '<tr><td class="tm"><b>' + esc(c.codigo) + '</b></td><td>' + (c.trabajador_id ? esc(CF.nom[c.trabajador_id] || '') : '<span style="color:var(--ink-2)">Sin asignar</span>') +
            '</td><td>' + (c.ultima_senal ? new Date(c.ultima_senal).toLocaleString('es-PA', { timeZone: 'America/Panama', dateStyle: 'short', timeStyle: 'short' }) : 'Nunca') +
            '</td><td>' + (c.activa ? '<span class="pill ok">Activa</span>' : '<span class="pill off">Desactivada</span>') + '</td><td style="white-space:nowrap">' +
            '<button class="btn plain sm" type="button" data-clave="' + c.id + '">Nueva clave</button> <button class="btn plain sm" type="button" data-pcact="' + c.id + '">' +
            (c.activa ? 'Desactivar' : 'Activar') + '</button></td></tr>';
        }).join('') : '<tr><td colspan="5"><div class="vacio">Todavía no hay computadoras registradas.</div></td></tr>') + '</tbody></table></div>' +
        '<div style="padding:14px;border-top:1px solid var(--rule)"><form id="pcForm" class="frm" novalidate><div class="fld"><label for="pcC">Código de la computadora</label>' +
        '<input id="pcC" placeholder="Ej. THM-PC-01" style="text-transform:uppercase"></div><span class="err fld full oculto" id="pcErr"></span>' +
        '<div class="fld full"><div><button class="btn navy" type="submit">Agregar computadora</button> <span class="lock">Después genere su clave y póngala en el reloj de esa computadora. La asignación a un trabajador la hace Planilla.</span></div></div></form></div></div>';
    }
  };
  el.innerHTML = '<div class="pg"><div class="pg-h"><div><h2>Configuración</h2><p>Control de personal · solo el administrador ve esta sección</p></div></div>' +
    '<div class="cfg"><div class="cfgnav">' + secs.map(function (s) { return '<button type="button" data-cfg="' + s[0] + '"' + (CF.sec === s[0] ? ' aria-current="page"' : '') + '>' + s[1] + '</button>'; }).join('') +
    '</div><div style="display:flex;flex-direction:column;gap:14px;min-width:0">' + I[CF.sec]() + '</div></div></div>';
}

function abrirJornada(id) {
  const j = id === 'nueva' ? { nombre: '', dias: 'Lun a vie', entrada: '08:00', salida: '17:00', almuerzo_min: 60, horas: 8, activa: true } : CF.jor.filter(function (x) { return x.id === Number(id); })[0];
  abrirPanel(id === 'nueva' ? 'Nueva jornada' : j.nombre, 'Horario que se asigna a cada trabajador',
    '<form id="jorForm" class="frm" data-id="' + id + '" novalidate>' +
    '<div class="fld full"><label for="jN">Nombre</label><input id="jN" value="' + esc(j.nombre) + '" placeholder="Ej. General"></div>' +
    '<div class="fld"><label for="jE">Entrada</label><input id="jE" type="time" value="' + hm(j.entrada) + '"></div>' +
    '<div class="fld"><label for="jS">Salida</label><input id="jS" type="time" value="' + hm(j.salida) + '"></div>' +
    '<div class="fld"><label for="jA">Almuerzo (minutos)</label><input id="jA" type="number" min="0" max="180" value="' + j.almuerzo_min + '"></div>' +
    '<div class="fld"><label for="jH">Horas de la jornada</label><input id="jH" type="number" min="1" max="12" step="0.5" value="' + Number(j.horas) + '"></div>' +
    '<div class="fld"><label for="jD">Días</label><select id="jD"><option' + (j.dias === 'Lun a vie' ? ' selected' : '') + '>Lun a vie</option><option' + (j.dias === 'Lun a sáb' ? ' selected' : '') + '>Lun a sáb</option></select></div>' +
    '<div class="fld"><label for="jAc">Estado</label><select id="jAc"><option value="1"' + (j.activa ? ' selected' : '') + '>Activa</option><option value="0"' + (j.activa ? '' : ' selected') + '>Inactiva</option></select></div>' +
    '<span class="err fld full oculto" id="jErr"></span><div class="fld full"><div><button class="btn navy" type="submit">Guardar</button></div></div></form>');
}

// ------------------------------------------------------------------ usuarios
VISTAS.usuarios = async function (el) {
  cargando(el);
  const r = await sb.rpc('grupo_usuarios', { p_empresa: EMP });
  if (fallo(r)) return;
  CF.usu = r.data || [];
  pintarUsuarios(el);
};

function pintarUsuarios(el) {
  el = el || $('contenido');
  const estado = function (u) {
    if (!u.acceso_activo) return '<span class="pill off">Desactivado</span>';
    if (u.bloqueado) return '<span class="pill bad">Bloqueado</span>';
    if (u.clave_temporal) return '<span class="pill late">Clave temporal</span>';
    return '<span class="pill ok">Activo</span>';
  };
  el.innerHTML = '<div class="pg"><div class="pg-h"><div><h2>Usuarios</h2><p>Quién entra al portal de Thelmar y con qué perfil</p></div>' +
    '<button class="btn navy" type="button" data-usu="nuevo">Agregar usuario</button></div>' +
    '<div class="box info">Al crear a alguien, el sistema genera una <b>clave temporal</b>. Se la entrega a la persona y ella escoge la suya al entrar por primera vez: usted nunca conoce su clave. ' +
    'Si el correo ya tiene cuenta (por ejemplo, de Transeo), solo se le da el acceso y entra con su misma clave.</div>' +
    '<div class="card"><div class="tw"><table class="t" style="min-width:820px"><thead><tr><th>Nombre</th><th>Perfil</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead><tbody>' +
    CF.usu.map(function (u) {
      return '<tr><td class="emp"><b>' + esc(u.nombre || '') + '</b><small>' + esc(u.correo) + '</small></td><td>' + esc(u.rol) + '<small style="display:block;color:var(--ink-2);font-size:12px">' +
        esc(QUE_ROL[u.rol] || '') + '</small></td><td>' + estado(u) + '</td><td>' + (u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-PA', { timeZone: 'America/Panama', dateStyle: 'short', timeStyle: 'short' }) : 'Nunca') +
        '</td><td><button class="btn plain sm" type="button" data-usu="' + u.id + '">Administrar</button></td></tr>';
    }).join('') + '</tbody></table></div></div></div>';
}

async function llamarAdmin(cuerpo) {
  cuerpo.empresa = EMP;
  const r = await sb.functions.invoke('admin-usuarios', { body: cuerpo });
  if (r.data) return r.data;
  let msj = 'No se pudo completar. Intente de nuevo.';
  try { const j = await r.error.context.json(); if (j && j.mensaje) msj = j.mensaje; } catch (e) {}
  return { ok: false, mensaje: msj };
}

function mostrarClave(nombre, clave) {
  abrirPanel('Clave temporal', esc(nombre),
    '<div class="box ok">Entréguele esta clave a ' + esc(nombre.split(' ')[0]) + '. Se muestra <b>una sola vez</b>; al entrar, el sistema le pide escoger la suya.</div>' +
    '<div class="clave-grande">' + esc(clave) + '</div><button class="btn plain" type="button" id="copiar-clave">Copiar</button>' +
    '<div class="lock">Si se pierde, use "Nueva clave temporal" en la ficha del usuario.</div>');
  $('copiar-clave').addEventListener('click', function () {
    navigator.clipboard.writeText(clave).then(function () { toast('Clave copiada.'); }, function () { toast('Seleccione la clave y cópiela a mano.', 'error'); });
  });
}

function abrirUsuario(id) {
  if (id === 'nuevo') {
    abrirPanel('Nuevo usuario', 'Entra con su correo y una clave temporal',
      '<form id="usuForm" class="frm" novalidate>' +
      '<div class="fld full"><label for="uN">Nombre completo</label><input id="uN" placeholder="Nombre y apellidos"></div>' +
      '<div class="fld full"><label for="uC">Correo</label><input id="uC" type="email" placeholder="nombre@correo.com"></div>' +
      '<div class="fld full"><label for="uR">Perfil</label><select id="uR">' + ROLES_THM.map(function (r) { return '<option' + (r === 'Trabajador' ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select>' +
      '<small id="uRq">' + QUE_ROL.Trabajador + '</small></div>' +
      '<div class="fld"><label for="uCe">Cédula</label><input id="uCe" placeholder="Opcional"></div>' +
      '<div class="fld"><label for="uT">Celular</label><input id="uT" placeholder="Opcional"></div>' +
      '<span class="err fld full oculto" id="uErr"></span><div class="fld full"><div><button class="btn navy" type="submit">Crear usuario</button></div></div></form>');
    $('uR').addEventListener('change', function () { $('uRq').textContent = QUE_ROL[$('uR').value]; });
    return;
  }
  const u = CF.usu.filter(function (x) { return x.id === id; })[0];
  const yo = u.id === S.perfil.id;
  abrirPanel(u.nombre || u.correo, esc(u.correo),
    '<div class="frm"><div class="fld full"><label for="uRol">Perfil en Thelmar</label><select id="uRol"' + (yo ? ' disabled' : '') + '>' + ROLES_THM.map(function (r) {
      return '<option' + (r === u.rol ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select><small>' + (yo ? 'No puede cambiar su propio perfil.' : esc(QUE_ROL[u.rol] || '')) + '</small></div></div>' +
    '<div style="display:flex;flex-direction:column;gap:8px">' +
    (yo ? '' : '<button class="btn navy" type="button" data-uacc="rol" data-id="' + u.id + '">Guardar perfil</button>') +
    '<button class="btn plain" type="button" data-uacc="clave" data-id="' + u.id + '">Nueva clave temporal</button>' +
    (u.bloqueado ? '<button class="btn plain" type="button" data-uacc="desbloquear" data-id="' + u.id + '">Desbloquear</button>' : '') +
    (yo ? '' : '<button class="btn plain" type="button" data-uacc="estado" data-id="' + u.id + '">' + (u.acceso_activo ? 'Desactivar' : 'Reactivar') + '</button>' +
      '<button class="btn red" type="button" data-uacc="quitar" data-id="' + u.id + '">Quitar el acceso a Thelmar</button>') + '</div>' +
    '<div class="lock">Desactivar o quitar el acceso solo afecta a Thelmar: si la persona también trabaja en Transeo, allá sigue igual.</div>');
}

// ------------------------------------------------------------------ eventos
document.addEventListener('click', async function (ev) {
  if (S.page !== 'config' && S.page !== 'usuarios') return;
  const b = ev.target.closest('[data-cfg],[data-sw],[data-jor],[data-quitarfer],[data-clave],[data-pcact],[data-usu],[data-uacc]');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.cfg) { CF.sec = d.cfg; pintarConfig(); return; }
  if (d.sw) {
    const nuevo = !CF.p[d.sw], cambio = {}; cambio[d.sw] = nuevo;
    const r = await sb.from('personal_parametros').update(cambio).eq('empresa_id', EMP);
    if (fallo(r)) return;
    CF.p[d.sw] = nuevo; S.params[d.sw] = nuevo;
    toast((nuevo ? 'Encendido: ' : 'Apagado: ') + b.getAttribute('aria-label')); pintarConfig(); return;
  }
  if (d.jor) { abrirJornada(d.jor); return; }
  if (d.quitarfer) {
    const r = await sb.from('personal_feriados').delete().eq('id', Number(d.quitarfer));
    if (fallo(r)) return;
    toast('Feriado quitado.'); VISTAS.config($('contenido')); return;
  }
  if (d.clave) {
    const c = CF.pcs.filter(function (x) { return x.id === Number(d.clave); })[0];
    if (!(await confirmar('Nueva clave', 'Se genera una clave nueva para ' + c.codigo + '. La anterior deja de servir: hay que poner la nueva en el reloj de esa computadora.', 'Generar clave'))) return;
    const r = await sb.rpc('personal_nueva_clave', { p_computadora: c.id });
    if (fallo(r)) return;
    abrirPanel('Clave de ' + c.codigo, 'Póngala en el reloj de esa computadora',
      '<div class="box ok">Esta clave se muestra <b>una sola vez</b>. Escríbala al instalar el reloj en ' + esc(c.codigo) + '.</div><div class="clave-grande">' + esc(r.data) + '</div>' +
      '<button class="btn plain" type="button" id="copiar-clave">Copiar</button>');
    $('copiar-clave').addEventListener('click', function () {
      navigator.clipboard.writeText(r.data).then(function () { toast('Clave copiada.'); }, function () { toast('Seleccione la clave y cópiela a mano.', 'error'); });
    });
    return;
  }
  if (d.pcact) {
    const c = CF.pcs.filter(function (x) { return x.id === Number(d.pcact); })[0];
    const r = await sb.from('personal_computadoras').update({ activa: !c.activa }).eq('id', c.id);
    if (fallo(r)) return;
    toast(c.codigo + (c.activa ? ' desactivada: sus marcas se rechazan.' : ' activada.')); VISTAS.config($('contenido')); return;
  }
  if (d.usu) { abrirUsuario(d.usu); return; }
  if (d.uacc) {
    const u = CF.usu.filter(function (x) { return x.id === d.id; })[0], nombre = u.nombre || u.correo;
    let r;
    if (d.uacc === 'rol') r = await llamarAdmin({ accion: 'rol', id: u.id, rol: $('uRol').value });
    if (d.uacc === 'clave') {
      if (!(await confirmar('Nueva clave temporal', 'Se genera una clave temporal para ' + nombre + '. La que tiene deja de servir, y al entrar tendrá que escoger una nueva.', 'Generar clave'))) return;
      r = await llamarAdmin({ accion: 'restablecer', id: u.id });
      if (r.ok) { mostrarClave(nombre, r.clave); VISTAS.usuarios($('contenido')); return; }
    }
    if (d.uacc === 'desbloquear') { const q = await sb.rpc('grupo_desbloquear', { p_empresa: EMP, p_id: u.id }); r = q.error ? { ok: false, mensaje: textoError(q.error) } : { ok: true, mensaje: 'Usuario desbloqueado.' }; }
    if (d.uacc === 'estado') r = await llamarAdmin({ accion: 'estado', id: u.id, activo: !u.acceso_activo });
    if (d.uacc === 'quitar') {
      if (!(await confirmar('Quitar el acceso', 'Se le quita a ' + nombre + ' el acceso a Thelmar. Si no tiene otra empresa, su cuenta se borra; lo que hizo queda en la bitácora.', 'Quitar', true))) return;
      r = await llamarAdmin({ accion: 'borrar', id: u.id });
    }
    toast(r.mensaje, r.ok ? 'ok' : 'error');
    if (r.ok) { cerrarPanel(); VISTAS.usuarios($('contenido')); }
  }
});

document.addEventListener('change', async function (e) {
  if (e.target.id !== 'tol' || S.page !== 'config') return;
  const v = Math.max(0, Math.min(120, Number(e.target.value) || 0));
  const r = await sb.from('personal_parametros').update({ tolerancia_min: v }).eq('empresa_id', EMP);
  if (fallo(r)) return;
  CF.p.tolerancia_min = v; toast('Tolerancia de llegada: ' + v + ' minutos.');
});

document.addEventListener('submit', async function (ev) {
  const id = ev.target.id;
  if (['jorForm', 'ferForm', 'pcForm', 'usuForm'].indexOf(id) === -1) return;
  ev.preventDefault();
  if (id === 'jorForm') {
    const err = $('jErr'), mal = function (m) { err.textContent = m; err.classList.remove('oculto'); };
    const v = { nombre: $('jN').value.trim(), entrada: $('jE').value, salida: $('jS').value, almuerzo_min: Number($('jA').value) || 0, horas: Number($('jH').value),
      dias: $('jD').value, activa: $('jAc').value === '1' };
    if (!v.nombre) return mal('Escriba el nombre de la jornada.');
    if (!v.entrada || !v.salida || minDe(v.salida) <= minDe(v.entrada)) return mal('La salida tiene que ser después de la entrada.');
    if (!(v.horas > 0)) return mal('Escriba las horas de la jornada.');
    const nueva = ev.target.dataset.id === 'nueva';
    const r = nueva ? await sb.from('personal_jornadas').insert(Object.assign({ empresa_id: EMP }, v)) : await sb.from('personal_jornadas').update(v).eq('id', Number(ev.target.dataset.id));
    if (r.error) return mal(textoError(r.error));
    cerrarPanel(); toast('Jornada guardada.'); VISTAS.config($('contenido')); return;
  }
  if (id === 'ferForm') {
    const err = $('ferErr'), f = $('ferF').value, n = $('ferN').value.trim();
    if (!f || !n) { err.textContent = 'Escriba la fecha y el nombre del feriado.'; err.classList.remove('oculto'); return; }
    const r = await sb.from('personal_feriados').insert({ empresa_id: EMP, fecha: f, nombre: n });
    if (r.error) { err.textContent = textoError(r.error); err.classList.remove('oculto'); return; }
    toast('Feriado agregado.'); VISTAS.config($('contenido')); return;
  }
  if (id === 'pcForm') {
    const err = $('pcErr'), c = $('pcC').value.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(c)) { err.textContent = 'Use solo letras, números y guiones, como THM-PC-01.'; err.classList.remove('oculto'); return; }
    const r = await sb.from('personal_computadoras').insert({ empresa_id: EMP, codigo: c });
    if (r.error) { err.textContent = textoError(r.error); err.classList.remove('oculto'); return; }
    toast(c + ' agregada. Ahora genere su clave.'); VISTAS.config($('contenido')); return;
  }
  if (id === 'usuForm') {
    const err = $('uErr'), mal = function (m) { err.textContent = m; err.classList.remove('oculto'); };
    const v = { accion: 'crear', nombre: $('uN').value.trim(), correo: $('uC').value.trim().toLowerCase(), rol: $('uR').value, cedula: $('uCe').value.trim() || null, celular: $('uT').value.trim() || null };
    if (!v.nombre) return mal('Escriba el nombre.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.correo)) return mal('El correo no es válido.');
    const btn = ev.target.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Creando...';
    const r = await llamarAdmin(v);
    btn.disabled = false; btn.textContent = 'Crear usuario';
    if (!r.ok) return mal(r.mensaje);
    VISTAS.usuarios($('contenido'));
    if (r.clave) mostrarClave(v.nombre, r.clave); else { cerrarPanel(); toast(r.mensaje); }
  }
});
