// TRANSEO PTY · Sistema de flota · función admin-usuarios
//
// Crear, restablecer clave, desactivar, reactivar y borrar usuarios.
// Usa la llave maestra del proyecto, que vive solo aquí, en el servidor.
// Solo responde si quien llama es un Administrador activo.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const ROLES = ['Administrador', 'Gerencia', 'Asistente', 'Contabilidad'];

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
  const perfil = await admin.from('perfiles').select('rol, activo, nombre').eq('id', yo.id).single();
  if (!perfil.data || perfil.data.rol !== 'Administrador' || !perfil.data.activo) {
    return responder({ ok: false, mensaje: 'Solo el administrador puede hacer esto.' }, 403);
  }

  let d;
  try { d = await req.json(); } catch (_e) { return responder({ ok: false, mensaje: 'Solicitud no válida.' }, 400); }
  const anotar = (registro, accion, detalle) =>
    admin.from('bitacora').insert({ tabla: 'perfiles', registro, accion, despues: detalle || null, usuario: yo.id });

  try {
    // ----------------------------------------------------------- crear
    if (d.accion === 'crear') {
      const correo = String(d.correo || '').trim().toLowerCase();
      const nombre = String(d.nombre || '').trim();
      if (!nombre) return responder({ ok: false, mensaje: 'Falta el nombre.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return responder({ ok: false, mensaje: 'El correo no es válido.' });
      if (ROLES.indexOf(d.rol) === -1) return responder({ ok: false, mensaje: 'Seleccione un perfil válido.' });

      const clave = claveTemporal();
      const nuevo = await admin.auth.admin.createUser({ email: correo, password: clave, email_confirm: true, user_metadata: { nombre } });
      if (nuevo.error) {
        const ya = /already|registered|exists/i.test(nuevo.error.message);
        return responder({ ok: false, mensaje: ya ? 'Ya existe un usuario con ese correo.' : nuevo.error.message });
      }
      const id = nuevo.data.user.id;
      const act = await admin.from('perfiles').update({
        nombre, rol: d.rol, activo: true, clave_temporal: true,
        cedula: d.cedula || null, celular: d.celular || null
      }).eq('id', id);
      if (act.error) return responder({ ok: false, mensaje: act.error.message });
      await anotar(id, 'USUARIO CREADO', { nombre, correo, rol: d.rol, por: perfil.data.nombre });
      return responder({ ok: true, clave, mensaje: 'Usuario creado.' });
    }

    const id = String(d.id || '');
    if (!id) return responder({ ok: false, mensaje: 'Falta el usuario.' });
    const obj = await admin.from('perfiles').select('*').eq('id', id).single();
    if (!obj.data) return responder({ ok: false, mensaje: 'No se encontró el usuario.' });
    const u = obj.data;
    const otrosAdmins = async () => {
      const r = await admin.from('perfiles').select('id', { count: 'exact', head: true })
        .eq('rol', 'Administrador').eq('activo', true).neq('id', id);
      return r.count || 0;
    };

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

    // ----------------------------------------------------------- activar o desactivar
    if (d.accion === 'estado') {
      const activo = !!d.activo;
      if (id === yo.id && !activo) return responder({ ok: false, mensaje: 'No puede desactivarse a usted mismo.' });
      if (!activo && u.rol === 'Administrador' && u.activo && (await otrosAdmins()) === 0) {
        return responder({ ok: false, mensaje: 'Debe quedar al menos un administrador activo.' });
      }
      const r = await admin.from('perfiles').update({ activo }).eq('id', id);
      if (r.error) return responder({ ok: false, mensaje: r.error.message });
      // desactivado: además se le cierran las sesiones abiertas
      await admin.auth.admin.updateUserById(id, { ban_duration: activo ? 'none' : '876000h' });
      await anotar(id, activo ? 'USUARIO REACTIVADO' : 'USUARIO DESACTIVADO', { por: perfil.data.nombre });
      return responder({ ok: true, mensaje: activo ? 'Usuario reactivado.' : 'Usuario desactivado. Ya no puede entrar.' });
    }

    // ----------------------------------------------------------- borrar
    if (d.accion === 'borrar') {
      if (id === yo.id) return responder({ ok: false, mensaje: 'No puede borrarse a usted mismo.' });
      if (u.rol === 'Administrador' && u.activo && (await otrosAdmins()) === 0) {
        return responder({ ok: false, mensaje: 'No puede borrar al único administrador activo.' });
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
