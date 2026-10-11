/* GRUPO THELMAR · Portal · agenda.js
 * Mi agenda: personal, cada quien organiza la suya y nadie ve la de otro.
 * Misma agenda de la maqueta aprobada: semana (por defecto) y mes.
 */

const TIPOS = { reu: ['Reunión', 'tg-reu'], vis: ['Visita de obra', 'tg-vis'], ins: ['Inspección', 'tg-ins'], ent: ['Entrega', 'tg-ent'], seg: ['Seguridad', 'tg-seg'] };
const AGV = { A: 'Semana', B: 'Mes' };
const HSTART = 7, HEND = 18, ROWH = 44;
const DOWS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const AGS = { lista: [], sel: null, mes: null, vista: 'A', panel: null, borrador: null, error: '' };
const monday = x => { const d = pd(x); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const dCorto = x => { const d = pd(x); return DOWS[(d.getDay() + 6) % 7] + ' ' + d.getDate(); };
const toIn = m => pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
const ordenar = a => a.slice().sort(function (x, y) { return (x.fecha + x.desde).localeCompare(y.fecha + y.desde); });

VISTAS.agenda = async function (el) {
  if (!AGS.sel) { AGS.sel = hoyPanama(); const d = pd(AGS.sel); AGS.mes = [d.getFullYear(), d.getMonth()]; }
  cargando(el);
  const r = await sb.from('grupo_agenda').select('*').eq('empresa_id', EMP).order('fecha').order('desde');
  if (fallo(r)) return;
  AGS.lista = r.data || [];
  pintarAgenda(el);
};

function pintarAgenda(el) {
  el = el || $('contenido');
  const v = AGS.vista;
  let titulo, nav;
  if (v === 'A') {
    const mon = monday(AGS.sel);
    titulo = 'Semana del ' + pd(mon).getDate() + ' al ' + pd(addD(mon, 5)).getDate() + ' de ' + pd(addD(mon, 5)).toLocaleDateString('es-PA', { month: 'long' });
    nav = ['wk', 7];
  } else {
    titulo = new Date(AGS.mes[0], AGS.mes[1], 1).toLocaleDateString('es-PA', { month: 'long', year: 'numeric' });
    nav = ['mo', 1];
  }
  el.innerHTML = '<div class="pg">' +
    '<div class="pg-h"><div><h2>Mi agenda</h2><p>Es personal: solo usted la ve y la organiza.</p></div>' +
    '<div class="vseg" role="group" aria-label="Vista de la agenda">' + Object.keys(AGV).map(function (k) {
      return '<button type="button" data-agv="' + k + '" aria-pressed="' + (k === v) + '">' + AGV[k] + '</button>'; }).join('') + '</div></div>' +
    '<div class="agbar"><div class="agnav"><button class="icb" type="button" data-agnav="' + nav[0] + '|-' + nav[1] + '" aria-label="Anterior">‹</button>' +
    '<button class="icb" type="button" data-agact="hoy">Hoy</button><button class="icb" type="button" data-agnav="' + nav[0] + '|' + nav[1] + '" aria-label="Siguiente">›</button>' +
    '<b>' + esc(titulo.charAt(0).toUpperCase() + titulo.slice(1)) + '</b></div>' +
    '<div class="agleg">' + Object.keys(TIPOS).map(function (k) { return '<span class="tag ' + TIPOS[k][1] + '">' + TIPOS[k][0] + '</span>'; }).join('') + '</div>' +
    '<button class="btn lime" type="button" data-agnew="' + AGS.sel + '|08:00">+ Nueva actividad</button></div>' +
    '<div class="agwrap ' + (AGS.panel ? 'open' : '') + '"><div class="card agview">' + (v === 'B' ? agMes() : agSemana()) + '</div>' + agPanel() + '</div></div>';
}

function agPanel() {
  const P = AGS.panel;
  if (!P) return '';
  if (P.mode === 'ver') {
    const a = AGS.lista.filter(function (x) { return x.id === P.id; })[0];
    if (!a) return '';
    const t = TIPOS[a.tipo] || TIPOS.reu;
    return '<aside class="agp"><div class="agp-h"><b>Actividad</b><button class="icb" type="button" data-agact="cerrar">Cerrar</button></div>' +
      '<div class="agp-b"><span class="tag ' + t[1] + '" style="align-self:flex-start">' + t[0] + '</span>' +
      '<h4 class="' + (a.hecha ? 'struck' : '') + '">' + esc(a.titulo) + '</h4>' +
      '<dl><dt>Cuándo</dt><dd>' + esc(dLargo(a.fecha).charAt(0).toUpperCase() + dLargo(a.fecha).slice(1)) + '</dd><dt>Hora</dt><dd>' + am(a.desde) + ' a ' + am(a.hasta) +
      '</dd><dt>Lugar</dt><dd>' + esc(a.lugar || '—') + '</dd><dt>Estado</dt><dd>' + (a.hecha ? 'Hecha' : 'Pendiente') + '</dd></dl>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn lime" type="button" data-aghecha="' + a.id + '">' + (a.hecha ? 'Reabrir' : 'Marcar como hecha') + '</button>' +
      '<button class="btn plain" type="button" data-agborrar="' + a.id + '">Borrar</button></div></div></aside>';
  }
  const dr = AGS.borrador || { titulo: '', fecha: P.d || AGS.sel, desde: P.h || '08:00', hasta: toIn(minDe(P.h || '08:00') + 60), lugar: '', tipo: 'reu' };
  return '<aside class="agp"><div class="agp-h"><b>Nueva actividad</b><button class="icb" type="button" data-agact="cerrar">Cerrar</button></div>' +
    '<form class="nf" id="agForm" novalidate style="border:0">' +
    '<label>Qué se va a hacer<input id="nT" value="' + esc(dr.titulo) + '" placeholder="Ej.: Vaciado de losa nivel 2"></label>' +
    '<label>Fecha<input id="nD" type="date" value="' + dr.fecha + '"></label>' +
    '<div class="f2"><label>Desde<input id="nH" type="time" value="' + dr.desde + '"></label><label>Hasta<input id="nF" type="time" value="' + dr.hasta + '"></label></div>' +
    '<label>Lugar u obra<input id="nO" value="' + esc(dr.lugar) + '" placeholder="Ej.: Oficina central"></label>' +
    '<label>Tipo<select id="nTp">' + Object.keys(TIPOS).map(function (k) { return '<option value="' + k + '"' + (k === dr.tipo ? ' selected' : '') + '>' + TIPOS[k][0] + '</option>'; }).join('') + '</select></label>' +
    (AGS.error ? '<div class="err" role="alert">' + esc(AGS.error) + '</div>' : '') +
    '<button class="btn navy" type="submit">Agendar</button></form></aside>';
}

const chipAg = a => '<button type="button" class="echip ' + (TIPOS[a.tipo] || TIPOS.reu)[1] + ' ' + (a.hecha ? 'done' : '') + '" data-agver="' + a.id + '"><span class="eh">' +
  am(a.desde).replace(' a. m.', 'a').replace(' p. m.', 'p') + '</span> ' + esc(a.titulo) + '</button>';

function agSemana() {
  const mon = monday(AGS.sel), dias = [0, 1, 2, 3, 4, 5].map(function (i) { return addD(mon, i); });
  const horas = []; for (let h = HSTART; h < HEND; h++) horas.push(h);
  const H = (HEND - HSTART) * ROWH, hoy = hoyPanama();
  const col = function (d) {
    const evs = AGS.lista.filter(function (a) { return a.fecha === d; }).map(function (a) {
      const s = Math.max(minDe(a.desde), HSTART * 60), e = Math.min(Math.max(minDe(a.hasta), s + 30), HEND * 60);
      const top = (s - HSTART * 60) / 60 * ROWH, alto = Math.max(26, (e - s) / 60 * ROWH - 3);
      return '<button type="button" class="wev ' + (TIPOS[a.tipo] || TIPOS.reu)[1] + ' ' + (a.hecha ? 'done' : '') + '" data-agver="' + a.id +
        '" style="top:' + top + 'px;height:' + alto + 'px"><b>' + esc(a.titulo) + '</b><small>' + am(a.desde) + (a.lugar ? ' · ' + esc(a.lugar) : '') + '</small></button>';
    }).join('');
    const huecos = horas.map(function (h) { return '<button type="button" class="slot" data-agnew="' + d + '|' + pad2(h) + ':00" aria-label="Agendar el ' + dCorto(d) + ' a las ' + h + '"></button>'; }).join('');
    return '<div class="wcol ' + (d === hoy ? 'today' : '') + '" style="height:' + H + 'px">' + huecos + evs + '</div>';
  };
  return '<div class="wk-scroll"><div class="wgrid"><div class="whead"><span></span>' + dias.map(function (d) {
    return '<button type="button" class="wd ' + (d === hoy ? 'today' : '') + '" data-agdia="' + d + '"><small>' + DOWS[(pd(d).getDay() + 6) % 7] + '</small><b>' + pd(d).getDate() + '</b></button>';
  }).join('') + '</div><div class="wbody"><div class="wtimes" style="height:' + H + 'px">' + horas.map(function (h) {
    return '<span style="top:' + (h - HSTART) * ROWH + 'px">' + ((h + 11) % 12 + 1) + ' ' + (h >= 12 ? 'p. m.' : 'a. m.') + '</span>';
  }).join('') + '</div>' + dias.map(col).join('') + '</div></div></div>';
}

function agMes() {
  const y = AGS.mes[0], mo = AGS.mes[1], primero = new Date(y, mo, 1), dias = new Date(y, mo + 1, 0).getDate(), off = (primero.getDay() + 6) % 7, hoy = hoyPanama();
  let celdas = '';
  for (let i = 0; i < off; i++) celdas += '<div class="mcell blank"></div>';
  for (let d = 1; d <= dias; d++) {
    const f = y + '-' + pad2(mo + 1) + '-' + pad2(d), evs = ordenar(AGS.lista.filter(function (a) { return a.fecha === f; }));
    celdas += '<div class="mcell ' + (f === hoy ? 'today' : '') + ' ' + (f === AGS.sel ? 'sel' : '') + '"><div class="mtop"><button type="button" class="mnum" data-agdia="' + f +
      '" data-agvista="A" title="Ver la semana">' + d + '</button><button type="button" class="madd" data-agnew="' + f + '|08:00" aria-label="Agendar el ' + d + '">+</button></div>' +
      evs.slice(0, 3).map(chipAg).join('') + (evs.length > 3 ? '<button type="button" class="more" data-agdia="' + f + '" data-agvista="A">+' + (evs.length - 3) + ' más</button>' : '') + '</div>';
  }
  const resto = (7 - ((off + dias) % 7)) % 7; for (let i = 0; i < resto; i++) celdas += '<div class="mcell blank"></div>';
  return '<div class="wk-scroll"><div class="mgrid">' + DOWS.map(function (x) { return '<span class="mdw">' + x + '</span>'; }).join('') + celdas + '</div></div>';
}

document.addEventListener('click', async function (ev) {
  const b = ev.target.closest('button');
  if (!b || S.page !== 'agenda') return;
  const d = b.dataset;
  if (d.agv) { AGS.vista = d.agv; AGS.panel = null; pintarAgenda(); return; }
  if (d.agdia) { AGS.sel = d.agdia; const dt = pd(AGS.sel); AGS.mes = [dt.getFullYear(), dt.getMonth()]; if (d.agvista) AGS.vista = d.agvista; pintarAgenda(); return; }
  if (d.agnew) { const p = d.agnew.split('|'); AGS.borrador = null; AGS.error = ''; AGS.panel = { mode: 'nueva', d: p[0], h: p[1] }; pintarAgenda(); const f = $('nT'); if (f) f.focus(); return; }
  if (d.agver) { AGS.panel = { mode: 'ver', id: Number(d.agver) }; pintarAgenda(); return; }
  if (d.agact === 'cerrar') { AGS.panel = null; AGS.borrador = null; AGS.error = ''; pintarAgenda(); return; }
  if (d.agact === 'hoy') { AGS.sel = hoyPanama(); const dt = pd(AGS.sel); AGS.mes = [dt.getFullYear(), dt.getMonth()]; pintarAgenda(); return; }
  if (d.agnav) {
    const p = d.agnav.split('|'), n = Number(p[1]);
    if (p[0] === 'mo') { let y = AGS.mes[0], m = AGS.mes[1] + n; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } AGS.mes = [y, m]; }
    else AGS.sel = addD(AGS.sel, n);
    pintarAgenda(); return;
  }
  if (d.aghecha) {
    const a = AGS.lista.filter(function (x) { return x.id === Number(d.aghecha); })[0];
    const r = await sb.from('grupo_agenda').update({ hecha: !a.hecha }).eq('id', a.id);
    if (fallo(r)) return;
    a.hecha = !a.hecha; toast(a.hecha ? 'Actividad marcada como hecha.' : 'Actividad reabierta.'); pintarAgenda(); return;
  }
  if (d.agborrar) {
    const a = AGS.lista.filter(function (x) { return x.id === Number(d.agborrar); })[0];
    if (!(await confirmar('Borrar actividad', 'Se borra "' + a.titulo + '" de su agenda.', 'Borrar', true))) return;
    const r = await sb.from('grupo_agenda').delete().eq('id', a.id);
    if (fallo(r)) return;
    AGS.lista = AGS.lista.filter(function (x) { return x.id !== a.id; }); AGS.panel = null; toast('Se borró "' + a.titulo + '".'); pintarAgenda();
  }
});

document.addEventListener('submit', async function (ev) {
  if (ev.target.id !== 'agForm') return;
  ev.preventDefault();
  const dr = { titulo: $('nT').value.trim(), fecha: $('nD').value, desde: $('nH').value, hasta: $('nF').value, lugar: $('nO').value.trim(), tipo: $('nTp').value };
  const mal = function (m) { AGS.error = m; AGS.borrador = dr; pintarAgenda(); };
  if (!dr.titulo) return mal('Escriba qué se va a hacer.');
  if (!dr.fecha) return mal('Escoja la fecha de la actividad.');
  if (!dr.desde) return mal('Escoja la hora de inicio.');
  if (!dr.hasta || minDe(dr.hasta) <= minDe(dr.desde)) return mal('La hora final tiene que ser después de la de inicio.');
  const r = await sb.from('grupo_agenda').insert({ empresa_id: EMP, fecha: dr.fecha, desde: dr.desde, hasta: dr.hasta, titulo: dr.titulo, lugar: dr.lugar || null, tipo: dr.tipo }).select().single();
  if (r.error) return mal(textoError(r.error));
  AGS.lista.push(r.data);
  AGS.error = ''; AGS.borrador = null; AGS.panel = null; AGS.sel = dr.fecha; const dt = pd(dr.fecha); AGS.mes = [dt.getFullYear(), dt.getMonth()];
  toast('Actividad agendada para el ' + dLargo(dr.fecha) + ' a las ' + am(dr.desde) + '.');
  pintarAgenda();
});
