// GRUPO THELMAR · función admin-usuarios
//
// Crear, restablecer clave, desactivar, reactivar y borrar usuarios.
// Usa la llave maestra del proyecto, que vive solo aquí, en el servidor.
//
// Transeo (empresa por omisión): igual que siempre, con el perfil de la
// tabla perfiles. Solo responde a un Administrador activo de Transeo.
//
// Thelmar y demás empresas del grupo: el perfil va en grupo_accesos.
// Solo responde al Administrador de esa empresa. Si el correo ya tiene
// cuenta (por ejemplo, alguien de Transeo), no se crea otra: se le da el
// acceso y entra con su misma clave.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const ROLES_TRANSEO = ['Administrador', 'Gerencia', 'Asistente', 'Contabilidad'];
const ROLES_GRUPO = ['Administrador', 'Gerencia', 'Planilla', 'Trabajador'];

function responder(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// clave temporal fácil de dictar: sin letras que se confunden (l, 1, O, 0)
function claveTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyz', numeros = '23456789';
  const r = (s) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  let t = '';
  for (let i = 0; i < 4; i++) t += r(letras);
  t += '-';
  for (let i = 0; i < 4; i++) t += r(numeros);
  return t.charAt(0).toUpperCase() + t.slice(1);   // ej. Kmxt-4827
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = Deno.env.get('SUPABASE_URL');
  const maestra = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(url, maestra, { auth: { persistSession: false } });

  // ¿quién llama?
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const quien = await admin.auth.getUser(token);
  if (quien.error || !quien.data.user) return responder({ ok: false, mensaje: 'Sesión no válida. Entre de nuevo.' }, 401);
  const yo = quien.data.user;

  let d;
  try { d = await req.json(); } catch (_e) { return responder({ ok: false, mensaje: 'Solicitud no válida.' }, 400); }
  const empresa = String(d.empresa || 'transeo');
  const esTranseo = empresa === 'transeo';

  const perfil = await admin.from('perfiles').select('rol, activo, nombre').eq('id', yo.id).single();
  if (!perfil.data || !perfil.data.activo) return responder({ ok: false, mensaje: 'Solo el administrador puede hacer esto.' }, 403);
  if (esTranseo) {
    if (perfil.data.rol !== 'Administrador') return responder({ ok: false, mensaje: 'Solo el administrador puede hacer esto.' }, 403);
  } else {
    const mio = await admin.from('grupo_accesos').select('rol, activo').eq('usuario_id', yo.id).eq('empresa_id', empresa).maybeSingle();
    if (!mio.data || !mio.data.activo || mio.data.rol !== 'Administrador') {
      return responder({ ok: false, mensaje: 'Solo el administrador de la empresa puede hacer esto.' }, 403);
    }
  }
  const ROLES = esTranseo ? ROLES_TRANSEO : ROLES_GRUPO;

  const anotar = (registro, accion, detalle) =>
    admin.from('bitacora').insert({ tabla: esTranseo ? 'perfiles' : 'grupo_accesos', registro, accion,
      despues: { empresa, ...(detalle || {}) }, usuario: yo.id });

  // administradores activos de la empresa, sin contar a uno
  const otrosAdmins = async (sinId) => {
    const r = esTranseo
      ? await admin.from('perfiles').select('id', { count: 'exact', head: true }).eq('rol', 'Administrador').eq('activo', true).neq('id', sinId)
      : await admin.from('grupo_accesos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa).eq('rol', 'Administrador').eq('activo', true).neq('usuario_id', sinId);
    return r.count || 0;
  };

  try {
    // ----------------------------------------------------------- crear
    if (d.accion === 'crear') {
      const correo = String(d.correo || '').trim().toLowerCase();
      const nombre = String(d.nombre || '').trim();
      if (!nombre) return responder({ ok: false, mensaje: 'Falta el nombre.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return responder({ ok: false, mensaje: 'El correo no es válido.' });
      if (ROLES.indexOf(d.rol) === -1) return responder({ ok: false, mensaje: 'Seleccione un perfil válido.' });

      const ya = await admin.from('perfiles').select('id, rol, activo, nombre').eq('correo', correo).maybeSingle();

      // ya tiene cuenta: solo se le da el acceso, con su misma clave
      if (ya.data) {
        if (esTranseo) {
          if (ya.data.rol !== 'Sin acceso') return responder({ ok: false, mensaje: 'Ya existe un usuario con ese correo.' });
          const r = await admin.from('perfiles').update({ rol: d.rol, activo: true }).eq('id', ya.data.id);
          if (r.error) return responder({ ok: false, mensaje: r.error.message });
        } else {
          const r = await admin.from('grupo_accesos').upsert({ usuario_id: ya.data.id, empresa_id: empresa, rol: d.rol, activo: true },
            { onConflict: 'usuario_id,empresa_id' });
          if (r.error) return responder({ ok: false, mensaje: r.error.message });
          if (!ya.data.activo) await admin.from('perfiles').update({ activo: true }).eq('id', ya.data.id);
        }
        await anotar(ya.data.id, 'ACCESO DADO', { nombre: ya.data.nombre, correo, rol: d.rol, por: perfil.data.nombre });
        return responder({ ok: true, clave: null, mensaje: 'Esa persona ya tenía cuenta. Se le dio el acceso y entra con su misma clave.' });
      }

      const clave = claveTemporal();
      const nuevo = await admin.auth.admin.createUser({ email: correo, password: clave, email_confirm: true, user_metadata: { nombre } });
      if (nuevo.error) {
        const repetido = /already|registered|exists/i.test(nuevo.error.message);
        return responder({ ok: false, mensaje: repetido ? 'Ya existe un usuario con ese correo.' : nuevo.error.message });
      }
      const id = nuevo.data.user.id;
      const act = await admin.from('perfiles').update({
        nombre, rol: esTranseo ? d.rol : 'Sin acceso', activo: true, clave_temporal: true,
        cedula: d.cedula || null, celular: d.celular || null
      }).eq('id', id);
      if (act.error) return responder({ ok: false, mensaje: act.error.message });
      if (!esTranseo) {
        const acc = await admin.from('grupo_accesos').insert({ usuario_id: id, empresa_id: empresa, rol: d.rol, activo: true, principal: true });
        if (acc.error) return responder({ ok: false, mensaje: acc.error.message });
      }
      await anotar(id, 'USUARIO CREADO', { nombre, correo, rol: d.rol, por: perfil.data.nombre });
      return responder({ ok: true, clave, mensaje: 'Usuario creado.' });
    }

    const id = String(d.id || '');
    if (!id) return responder({ ok: false, mensaje: 'Falta el usuario.' });
    const obj = await admin.from('perfiles').select('*').eq('id', id).single();
    if (!obj.data) return responder({ ok: false, mensaje: 'No se encontró el usuario.' });
    const u = obj.data;

    // en las empresas del grupo, solo se toca a quien tiene acceso a esa empresa
    let acceso = null;
    if (!esTranseo) {
      const a = await admin.from('grupo_accesos').select('*').eq('usuario_id', id).eq('empresa_id', empresa).maybeSingle();
      if (!a.data) return responder({ ok: false, mensaje: 'Esa persona no tiene acceso a esta empresa.' });
      acceso = a.data;
    }
    const esAdminAqui = esTranseo ? u.rol === 'Administrador' && u.activo : acceso.rol === 'Administrador' && acceso.activo;

    // ----------------------------------------------------------- nueva clave temporal
    if (d.accion === 'restablecer') {
      const clave = claveTemporal();
      const r = await admin.auth.admin.updateUserById(id, { password: clave });
      if (r.error) return responder({ ok: false, mensaje: r.error.message });
      await admin.from('perfiles').update({ clave_temporal: true }).eq('id', id);
      await admin.from('intentos_acceso').delete().eq('correo', String(u.correo).toLowerCase());
      await anotar(id, 'CLAVE RESTABLECIDA', { por: perfil.data.nombre });
      return responder({ ok: true, clave, mensaje: 'Clave temporal generada.' });
    }

    // ----------------------------------------------------------- cambiar el perfil (empresas del grupo)
    if (d.accion === 'rol' && !esTranseo) {
      if (ROLES.indexOf(d.rol) === -1) return responder({ ok: false, mensaje: 'Seleccione un perfil válido.' });
      if (id === yo.id && d.rol !== 'Administrador') return responder({ ok: false, mensaje: 'No puede quitarse a usted mismo el perfil de Administrador.' });
      if (esAdminAqui && d.rol !== 'Administrador' && (await otrosAdmins(id)) === 0) {
        return responder({ ok: false, mensaje: 'Debe quedar al menos un administrador activo.' });
      }
      const r = await admin.from('grupo_accesos').update({ rol: d.rol }).eq('id', acceso.id);
      if (r.error) return responder({ ok: false, mensaje: r.error.message });
      await anotar(id, 'PERFIL CAMBIADO', { antes: acceso.rol, ahora: d.rol, por: perfil.data.nombre });
      return responder({ ok: true, mensaje: 'Perfil actualizado.' });
    }

    // ----------------------------------------------------------- activar o desactivar
    if (d.accion === 'estado') {
      const activo = !!d.activo;
      if (id === yo.id && !activo) return responder({ ok: false, mensaje: 'No puede desactivarse a usted mismo.' });
      if (!activo && esAdminAqui && (await otrosAdmins(id)) === 0) {
        return responder({ ok: false, mensaje: 'Debe quedar al menos un administrador activo.' });
      }
      if (esTranseo) {
        const r = await admin.from('perfiles').update({ activo }).eq('id', id);
        if (r.error) return responder({ ok: false, mensaje: r.error.message });
        // desactivado: además se le cierran las sesiones abiertas
        await admin.auth.admin.updateUserById(id, { ban_duration: activo ? 'none' : '876000h' });
      } else {
        // en el grupo se quita solo el acceso a esta empresa: sus otras empresas siguen igual
        const r = await admin.from('grupo_accesos').update({ activo }).eq('id', acceso.id);
        if (r.error) return responder({ ok: false, mensaje: r.error.message });
      }
      await anotar(id, activo ? 'USUARIO REACTIVADO' : 'USUARIO DESACTIVADO', { por: perfil.data.nombre });
      return responder({ ok: true, mensaje: activo ? 'Usuario reactivado.' : 'Usuario desactivado. Ya no puede entrar a esta empresa.' });
    }

    // ----------------------------------------------------------- borrar
    if (d.accion === 'borrar') {
      if (id === yo.id) return responder({ ok: false, mensaje: 'No puede borrarse a usted mismo.' });
      if (esAdminAqui && (await otrosAdmins(id)) === 0) {
        return responder({ ok: false, mensaje: 'No puede borrar al único administrador activo.' });
      }
      if (!esTranseo) {
        // en el grupo se quita el acceso; la cuenta se borra solo si no le queda nada más
        await admin.from('grupo_accesos').delete().eq('id', acceso.id);
        const otros = await admin.from('grupo_accesos').select('id', { count: 'exact', head: true }).eq('usuario_id', id);
        if ((otros.count || 0) > 0 || u.rol !== 'Sin acceso') {
          await anotar(id, 'ACCESO QUITADO', { nombre: u.nombre, correo: u.correo, por: perfil.data.nombre });
          return responder({ ok: true, mensaje: 'Se le quitó el acceso a esta empresa. Su cuenta sigue para las demás.' });
        }
      }
      await anotar(id, 'USUARIO BORRADO', { nombre: u.nombre, correo: u.correo, rol: u.rol, por: perfil.data.nombre });
      const r = await admin.auth.admin.deleteUser(id);
      if (r.error) return responder({ ok: false, mensaje: r.error.message });
      return responder({ ok: true, mensaje: 'Usuario borrado. Su historial en la bitácora se conserva.' });
    }

    return responder({ ok: false, mensaje: 'Acción desconocida.' }, 400);
  } catch (e) {
    return responder({ ok: false, mensaje: String(e && e.message || e) }, 500);
  }
});
