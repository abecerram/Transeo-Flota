/* TRANSEO PTY · Sistema de flota · app.js
 * El panel: menú por perfil, inicio y administración de usuarios.
 */

let PERFIL = null;
const PERMISOS = { capturar: false, admin: false };

const ROLES = ['Administrador', 'Gerencia', 'Asistente', 'Contabilidad', 'Sin acceso'];
const TODOS = ['Administrador', 'Gerencia', 'Asistente', 'Contabilidad'];

// Las secciones del menú. Las de etapas siguientes se agregan aquí.
const SECCIONES = [
  { clave: 'inicio',        grupo: 'GENERAL',        titulo: 'Inicio', sub: 'La flota de un vistazo', roles: TODOS, abrir: mostrarInicio },
  { clave: 'equipos',       grupo: 'CATÁLOGOS',      catalogo: true, roles: TODOS },
  { clave: 'conductores',   grupo: 'CATÁLOGOS',      catalogo: true, roles: TODOS },
  { clave: 'beneficiarios', grupo: 'CATÁLOGOS',      catalogo: true, roles: TODOS },
  { clave: 'proyectos',     grupo: 'CATÁLOGOS',      catalogo: true, roles: TODOS },
  { clave: 'clientes',      grupo: 'CATÁLOGOS',      catalogo: true, roles: TODOS },
  { clave: 'usuarios',      grupo: 'ADMINISTRACIÓN', titulo: 'Usuarios', sub: 'Quién entra y con qué perfil', roles: ['Administrador'], abrir: mostrarUsuarios }
];

function tituloDe(s) { return s.catalogo ? CATALOGOS[s.clave].titulo : s.titulo; }
function subDe(s) { return s.catalogo ? CATALOGOS[s.clave].sub : s.sub; }

function pintarMenu(activa) {
  const visibles = SECCIONES.filter(function (s) { return s.roles.indexOf(PERFIL.rol) > -1; });
  let h = '', grupo = '';
  visibles.forEach(function (s) {
    if (s.grupo !== grupo) { grupo = s.grupo; h += '<div class="titulo-grupo">' + esc(grupo) + '</div>'; }
    h += '<button data-s="' + s.clave + '" class="' + (s.clave === activa ? 'sel' : '') + '">' + esc(tituloDe(s)) + '</button>';
  });
  $('menu').innerHTML = h;
  $('menu').querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () { abrirSeccion(b.getAttribute('data-s')); $('lateral').classList.remove('abierto'); });
  });
}

function abrirSeccion(clave) {
  const s = SECCIONES.filter(function (x) { return x.clave === clave && x.roles.indexOf(PERFIL.rol) > -1; })[0] || SECCIONES[0];
  pintarMenu(s.clave);
  $('titulo').textContent = tituloDe(s);
  $('subtitulo').textContent = subDe(s);
  history.replaceState(null, '', '#' + s.clave);
  if (s.catalogo) mostrarCatalogo(s.clave, $('contenido'));
  else s.abrir($('contenido'));
}

// ---------------------------------------------------------------- inicio

async function mostrarInicio(cont) {
  cont.innerHTML = '<div class="cargando"><div class="giro"></div> Cargando...</div>';
  const cuenta = function (tabla, filtro) {
    let q = sb.from(tabla).select('id', { count: 'exact', head: true });
    if (filtro) q = filtro(q);
    return q;
  };
  const r = await Promise.all([
    cuenta('equipos', function (q) { return q.eq('estado', 'Activo'); }),
    cuenta('vencimientos', function (q) { return q.eq('situacion', 'Vencido'); }),
    cuenta('vencimientos', function (q) { return q.eq('situacion', 'Por vencer'); }),
    cuenta('beneficiarios', function (q) { return q.eq('estado', 'Activo'); })
  ]);
  const n = function (x) { return x.error ? '-' : (x.count || 0); };
  cont.innerHTML =
    '<div class="kpis">' +
      '<div class="kpi"><div class="et">EQUIPOS ACTIVOS</div><div class="cifra">' + n(r[0]) + '</div><div class="pie">En la flota</div></div>' +
      '<div class="kpi"><div class="et">DOCUMENTOS VENCIDOS</div><div class="cifra" style="color:var(--rojo)">' + n(r[1]) + '</div><div class="pie">Se cargan en la etapa de documentos</div></div>' +
      '<div class="kpi"><div class="et">VENCEN EN 30 DÍAS</div><div class="cifra" style="color:var(--ambar)">' + n(r[2]) + '</div><div class="pie">Revisados, pólizas, pesos</div></div>' +
      '<div class="kpi oscuro"><div class="et">BENEFICIARIOS</div><div class="cifra">' + n(r[3]) + '</div><div class="pie">A quién se le paga</div></div>' +
    '</div>' +
    '<div class="tarjeta"><h2>Bienvenido, ' + esc(PERFIL.nombre || PERFIL.correo) + '</h2>' +
      '<div style="font-size:13.5px; line-height:1.7; color:var(--gris)">Esta es la primera etapa del sistema nuevo: los catálogos. ' +
      'Empiece por revisar los <strong style="color:var(--texto)">equipos</strong>, que ya vienen cargados, y registre los ' +
      '<strong style="color:var(--texto)">beneficiarios</strong>, los <strong style="color:var(--texto)">clientes</strong> y los ' +
      '<strong style="color:var(--texto)">proyectos</strong>. Documentos, gastos y órdenes llegan en las etapas siguientes.</div></div>';
}

// ---------------------------------------------------------------- usuarios

async function mostrarUsuarios(cont) {
  cont.innerHTML = '<div class="cargando"><div class="giro"></div> Cargando usuarios...</div>';
  const r = await sb.from('perfiles').select('*').order('creado_en');
  if (r.error) { cont.innerHTML = '<div class="mensaje error">' + esc(textoError(r.error)) + '</div>'; return; }

  const filas = r.data.map(function (u) {
    const mio = u.id === PERFIL.id;
    return '<tr data-id="' + u.id + '">' +
      '<td><input class="u-nombre" value="' + esc(u.nombre || '') + '" style="height:36px; border:1px solid var(--borde-fuerte); padding:0 9px; width:100%"></td>' +
      '<td class="mono" style="font-size:12.5px">' + esc(u.correo) + '</td>' +
      '<td><select class="u-rol" style="height:36px; border:1px solid var(--borde-fuerte); padding:0 8px"' + (mio ? ' disabled' : '') + '>' +
        ROLES.map(function (x) { return '<option' + (x === u.rol ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></td>' +
      '<td><label style="display:flex; gap:6px; align-items:center"><input type="checkbox" class="u-activo"' + (u.activo ? ' checked' : '') + (mio ? ' disabled' : '') + '> Puede entrar</label></td>' +
      '<td style="text-align:right"><button class="btn chico u-guardar">Guardar</button></td></tr>';
  }).join('');

  cont.innerHTML =
    '<div class="mensaje">Para agregar a alguien: en Supabase, <strong>Authentication → Users → Invite user</strong>, con su correo. ' +
    'Le llega la invitación, crea su clave, y aparece aquí como <strong>Sin acceso</strong>. Ahí le asigna su perfil y marca ' +
    '<strong>Puede entrar</strong>.</div>' +
    '<div class="tarjeta"><div class="tabla-caja"><table class="datos"><tr><th>Nombre</th><th>Correo</th><th>Perfil</th><th>Acceso</th><th></th></tr>' +
    filas + '</table></div></div>';

  cont.querySelectorAll('.u-guardar').forEach(function (b) {
    b.addEventListener('click', async function () {
      const tr = b.closest('tr');
      const cambios = { nombre: tr.querySelector('.u-nombre').value.trim() || null };
      if (tr.getAttribute('data-id') !== PERFIL.id) {
        cambios.rol = tr.querySelector('.u-rol').value;
        cambios.activo = tr.querySelector('.u-activo').checked;
      }
      b.disabled = true;
      const u = await sb.from('perfiles').update(cambios).eq('id', tr.getAttribute('data-id'));
      b.disabled = false;
      aviso(u.error ? textoError(u.error) : 'Usuario actualizado.', u.error ? 'error' : 'ok');
    });
  });
}

// ---------------------------------------------------------------- arranque

(async function () {
  PERFIL = await exigirSesion();
  if (!PERFIL) return;
  PERMISOS.capturar = ['Administrador', 'Asistente', 'Contabilidad'].indexOf(PERFIL.rol) > -1;
  PERMISOS.admin = PERFIL.rol === 'Administrador';

  $('quien').textContent = (PERFIL.nombre || PERFIL.correo) + ' · ' + PERFIL.rol;
  $('btn-salir').addEventListener('click', salir);
  $('boton-menu').addEventListener('click', function () { $('lateral').classList.toggle('abierto'); });

  const pedida = location.hash.replace('#', '') || PERFIL.pantalla_inicio || 'inicio';
  abrirSeccion(pedida);
  $('app').classList.remove('oculto');
  $('arranque').classList.add('oculto');
})();
