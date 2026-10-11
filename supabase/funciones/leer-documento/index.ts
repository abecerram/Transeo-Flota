// TRANSEO PTY · Sistema de flota · función leer-documento
//
// Recibe la imagen de un documento de vehículo y devuelve sus datos.
// El lector es Claude Haiku. La llave va como secreto del proyecto:
//   Supabase -> Edge Functions -> Secrets -> ANTHROPIC_API_KEY
// Lo leído solo rellena el formulario; la persona siempre confirma.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const MODELO = 'claude-haiku-4-5-20251001';

function responder(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const INSTRUCCION = `Eres el lector de documentos de vehículos de Transeo Pty, una empresa de transporte en Panamá.
Te llega la foto de UN documento. Puede ser: revisado vehicular, póliza de seguro, tarjeta de pesos y dimensiones de la ATTT,
permiso de operación de la ATTT, registro único de vehículo (propiedad), recibo o tag de Panapass, u otro.

Responde SOLO con un objeto JSON, sin texto antes ni después, sin comillas de código, con estas llaves:
{
  "tipo": "Revisado" | "Póliza de seguro" | "Pesos y dimensiones" | "Permiso de operación" | "Registro de propiedad" | "Panapass" | "Otro",
  "placa": "tal como aparece, sin espacios",
  "numero": "número del documento, póliza, permiso o registro",
  "emisor": "aseguradora, taller de revisado o entidad que lo emite",
  "emision": "AAAA-MM-DD",
  "vence": "AAAA-MM-DD",
  "a_nombre_de": "propietario o asegurado que aparece",
  "uso": "particular, comercial u otro, si aparece",
  "datos_tecnicos": { "marca": "", "modelo": "", "anio": "", "color": "", "chasis": "", "motor": "",
                      "alto_m": "", "ancho_m": "", "largo_m": "", "peso_bruto_t": "", "peso_vacio_t": "", "carga_util_t": "" },
  "confianza": "alta" | "media" | "baja"
}

Reglas:
- Si un dato no se ve claro, déjalo como cadena vacía "". Nunca inventes ni adivines.
- Las fechas de Panamá vienen como DD/MM/AAAA: conviértelas a AAAA-MM-DD.
- Pesos en toneladas y medidas en metros, solo el número.
- "confianza" es baja si la foto está borrosa, cortada o torcida.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const llave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!llave) return responder({ ok: false, sinLector: true, mensaje: 'El lector todavía no está configurado. Llene los datos a mano.' });

  // solo quien puede capturar
  const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const quien = await admin.auth.getUser(token);
  if (quien.error || !quien.data.user) return responder({ ok: false, mensaje: 'Sesión no válida. Entre de nuevo.' }, 401);
  const perfil = await admin.from('perfiles').select('rol, activo').eq('id', quien.data.user.id).single();
  if (!perfil.data || !perfil.data.activo || ['Administrador', 'Asistente', 'Contabilidad'].indexOf(perfil.data.rol) === -1) {
    return responder({ ok: false, mensaje: 'Su perfil no puede usar el lector.' }, 403);
  }

  let d;
  try { d = await req.json(); } catch (_e) { return responder({ ok: false, mensaje: 'Solicitud no válida.' }, 400); }
  const imagen = String(d.imagen || '').replace(/^data:image\/[a-z]+;base64,/, '');
  if (!imagen) return responder({ ok: false, mensaje: 'No llegó la imagen.' }, 400);
  if (imagen.length > 6_500_000) return responder({ ok: false, mensaje: 'La imagen es muy grande.' }, 400);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': llave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 800,
        system: INSTRUCCION,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imagen } },
          { type: 'text', text: d.pista ? 'Pista: se espera un documento tipo "' + d.pista + '".' : 'Lee el documento.' }
        ] }]
      })
    });
    const j = await r.json();
    if (!r.ok) return responder({ ok: false, mensaje: 'El lector no respondió: ' + (j.error && j.error.message || r.status) });
    const texto = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').replace(/```json|```/g, '').trim();
    let datos;
    try { datos = JSON.parse(texto); } catch (_e) { return responder({ ok: false, mensaje: 'El lector devolvió algo que no se pudo leer. Llene a mano.' }); }
    return responder({ ok: true, datos });
  } catch (e) {
    return responder({ ok: false, mensaje: 'No se pudo usar el lector: ' + String(e && e.message || e) });
  }
});
