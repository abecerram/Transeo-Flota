-- =====================================================================
--  APLICAR EN SUPABASE · 11 de octubre de 2026
--  Migración 004 (fotos de equipos y documentos de Transeo) y
--  migración 005 (Grupo Thelmar: personal, planilla, agenda y usuarios).
--
--  SQL Editor -> New query -> pegar TODO -> Run.
--  Corre todo junto: si algo falla, no queda nada a medias.
--  Se puede volver a correr sin dañar nada.
--  Al final aparece una fila que dice "Listo".
-- =====================================================================

begin;

-- =====================================================================
--  TRANSEO PTY · Sistema de gestión de flota
--  004_fotos_documentos.sql  ·  Foto de cada equipo y carga de documentos
--
--  Se corre UNA vez, después de 003_usuarios.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. FOTO DEL EQUIPO
-- ---------------------------------------------------------------------

alter table public.equipos add column if not exists foto_ref text;

insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false)
on conflict (id) do nothing;

-- los permisos de imágenes ahora cubren también las fotos
drop policy if exists "transeo ver imagenes" on storage.objects;
drop policy if exists "transeo subir imagenes" on storage.objects;
drop policy if exists "transeo cambiar imagenes" on storage.objects;
drop policy if exists "transeo borrar imagenes" on storage.objects;

create policy "transeo ver imagenes" on storage.objects for select
  using (bucket_id in ('documentos','capturas','facturas','fotos') and public.puede_ver());
create policy "transeo subir imagenes" on storage.objects for insert
  with check (bucket_id in ('documentos','capturas','facturas','fotos') and public.puede_capturar());
create policy "transeo cambiar imagenes" on storage.objects for update
  using (bucket_id in ('documentos','capturas','facturas','fotos') and public.puede_capturar());
create policy "transeo borrar imagenes" on storage.objects for delete
  using (bucket_id in ('documentos','capturas','facturas','fotos') and public.es_admin());


-- ---------------------------------------------------------------------
--  2. GUARDAR UN DOCUMENTO
--  En un solo paso: si ya hay uno vigente del mismo tipo, pasa al
--  historial y el nuevo queda vigente. Nada queda a medias.
-- ---------------------------------------------------------------------

create or replace function public.guardar_documento(
  p_equipo_id   bigint,
  p_tipo        text,
  p_numero      text,
  p_emisor      text,
  p_emision     date,
  p_vence       date,
  p_en_tramite  boolean,
  p_archivo_ref text,
  p_datos       jsonb,
  p_notas       text
) returns bigint language plpgsql security invoker set search_path = public as $$
declare
  anterior bigint;
  nuevo    bigint;
begin
  if not public.puede_capturar() then
    raise exception 'Su perfil no puede cargar documentos' using errcode = 'P0001';
  end if;

  if p_tipo <> 'Otro' then
    select id into anterior from documentos
    where equipo_id = p_equipo_id and tipo = p_tipo and estado = 'Vigente'
    limit 1;
    if anterior is not null then
      update documentos set estado = 'Reemplazado' where id = anterior;
    end if;
  end if;

  insert into documentos (equipo_id, tipo, numero, emisor, emision, vence, en_tramite,
                          archivo_ref, archivo_servicio, datos_leidos, notas, subido_por)
  values (p_equipo_id, p_tipo, nullif(trim(p_numero), ''), nullif(trim(p_emisor), ''), p_emision,
          case when p_tipo = 'Registro de propiedad' then null else p_vence end,
          coalesce(p_en_tramite, false), p_archivo_ref, 'supabase', p_datos, nullif(trim(p_notas), ''), auth.uid())
  returning id into nuevo;

  if anterior is not null then
    update documentos set reemplazado_por = nuevo where id = anterior;
  end if;
  return nuevo;
end $$;

grant execute on function public.guardar_documento(bigint, text, text, text, date, date, boolean, text, jsonb, text) to authenticated;


-- ---------------------------------------------------------------------
--  3. VENCIMIENTOS CON LA IMAGEN Y EL TRÁMITE
--  La vista de antes, con lo que necesita la pantalla de documentos.
-- ---------------------------------------------------------------------

drop view if exists public.vencimientos;
create view public.vencimientos with (security_invoker = true) as
select d.id, d.equipo_id, e.nombre as equipo, e.placa, d.tipo, d.numero, d.emisor, d.emision, d.vence,
       d.en_tramite, d.archivo_ref, d.notas, d.subido_en,
       (d.vence - (now() at time zone 'America/Panama')::date) as dias,
       case
         when d.vence is null then 'No vence'
         when d.vence <  (now() at time zone 'America/Panama')::date then 'Vencido'
         when d.vence <= (now() at time zone 'America/Panama')::date + 30 then 'Por vencer'
         else 'Al día'
       end as situacion
from public.documentos d
join public.equipos e on e.id = d.equipo_id
where d.estado = 'Vigente';


-- =====================================================================
--  GRUPO THELMAR · Portal · control de personal, planilla y agenda
--  005_thelmar_personal.sql · 10 de octubre de 2026
--
--  Mismo proyecto de Supabase que Transeo. Todo lo nuevo lleva el
--  prefijo "personal_" o es una tabla del grupo (empresas, accesos):
--  no toca ninguna tabla ni función de Transeo.
--
--  Se corre UNA vez, después de la 004: SQL Editor -> New query -> Run.
--  Se puede volver a correr sin dañar nada.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
--  1. EMPRESAS DEL GRUPO Y QUIÉN ENTRA A CADA UNA
--  Una misma cuenta entra a varias empresas, con un perfil en cada una.
-- ---------------------------------------------------------------------

create table if not exists public.grupo_empresas (
  id        text primary key,
  nombre    text not null,
  razon     text,
  orden     int  not null default 0
);

insert into public.grupo_empresas (id, nombre, razon, orden) values
  ('thelmar',   'Thelmar Panamá',        'THM Panamá, S.A.',                                  1),
  ('transeo',   'Transeo',               'Transportes, Servicios de Aseo Pty, S.A.',           2),
  ('viviendas', 'Viviendas Ecológicas',  null,                                                 3)
on conflict (id) do nothing;

create table if not exists public.grupo_accesos (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null references auth.users (id) on delete cascade,
  empresa_id  text not null references public.grupo_empresas (id),
  rol         text not null check (rol in ('Administrador','Gerencia','Planilla','Trabajador')),
  principal   boolean not null default false,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (usuario_id, empresa_id)
);

-- perfil de la persona que está usando el sistema en una empresa
create or replace function public.grupo_rol_en(p_empresa text)
returns text language sql stable security definer set search_path = public as $$
  select a.rol from public.grupo_accesos a
  where a.usuario_id = auth.uid() and a.empresa_id = p_empresa and a.activo
$$;

create or replace function public.grupo_tiene_rol(p_empresa text, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.grupo_rol_en(p_empresa) = any (p_roles), false)
$$;

-- cuál de las tres trabaja la planilla: Leidy (Planilla) y el administrador
create or replace function public.personal_lleva_planilla(p_empresa text)
returns boolean language sql stable as $$
  select public.grupo_tiene_rol(p_empresa, array['Administrador','Planilla'])
$$;

-- quién consulta las horas: además, gerencia
create or replace function public.personal_ve(p_empresa text)
returns boolean language sql stable as $$
  select public.grupo_tiene_rol(p_empresa, array['Administrador','Planilla','Gerencia'])
$$;


-- ---------------------------------------------------------------------
--  2. PARÁMETROS DE CADA EMPRESA
--  Funciones encendidas o apagadas (administrador) y los datos de ley
--  de la planilla (Leidy). Los de ley arrancan vacíos: sin ellos la
--  planilla no se calcula.
-- ---------------------------------------------------------------------

create table if not exists public.personal_parametros (
  empresa_id          text primary key references public.grupo_empresas (id),
  -- funciones
  aviso_trabajador    boolean not null default false,
  almuerzo_marcado    boolean not null default false,
  marca_celular       boolean not null default false,
  descontar_recesos   boolean not null default true,
  calcular_extra      boolean not null default true,
  tolerancia_min      int     not null default 10 check (tolerancia_min between 0 and 120),
  -- datos de ley que llena Leidy (porcentajes)
  recargo_diurna      numeric(6,2),
  recargo_nocturna    numeric(6,2),
  recargo_mixta       numeric(6,2),
  recargo_descanso    numeric(6,2),
  recargo_feriado     numeric(6,2),
  seguro_social       numeric(6,2),
  seguro_educativo    numeric(6,2),
  isr_exento          numeric(12,2),
  isr_tope            numeric(12,2),
  isr_tasa_1          numeric(6,2),
  isr_tasa_2          numeric(6,2),
  actualizado_por     uuid,
  actualizado_en      timestamptz not null default now()
);

insert into public.personal_parametros (empresa_id) values ('thelmar'), ('viviendas')
on conflict (empresa_id) do nothing;


-- ---------------------------------------------------------------------
--  3. JORNADAS, FERIADOS Y TRABAJADORES
-- ---------------------------------------------------------------------

create table if not exists public.personal_jornadas (
  id           bigint generated always as identity primary key,
  empresa_id   text not null references public.grupo_empresas (id),
  nombre       text not null,
  entrada      time not null,
  salida       time not null,
  almuerzo_min int  not null default 60 check (almuerzo_min between 0 and 180),
  horas        numeric(4,2) not null check (horas > 0 and horas <= 12),
  dias         text not null default 'Lun a vie',
  activa       boolean not null default true,
  unique (empresa_id, nombre),
  check (salida > entrada)
);

insert into public.personal_jornadas (empresa_id, nombre, entrada, salida, almuerzo_min, horas)
values ('thelmar', 'General', '08:00', '17:00', 60, 8)
on conflict (empresa_id, nombre) do nothing;

create table if not exists public.personal_feriados (
  id          bigint generated always as identity primary key,
  empresa_id  text not null references public.grupo_empresas (id),
  fecha       date not null,
  nombre      text not null,
  unique (empresa_id, fecha)
);

create table if not exists public.personal_trabajadores (
  id             bigint generated always as identity primary key,
  empresa_id     text not null references public.grupo_empresas (id),
  nombre         text not null,
  cedula         text not null,
  fecha_ingreso  date not null default current_date,
  cargo          text not null,
  area           text,
  jornada_id     bigint not null references public.personal_jornadas (id),
  tipo_salario   text not null default 'Mensual' check (tipo_salario in ('Mensual','Por hora')),
  salario        numeric(12,2) not null check (salario > 0),
  forma_pago     text not null default 'ACH' check (forma_pago in ('ACH','Cheque','Efectivo')),
  seguro_social  boolean not null default true,
  seguro_educ    boolean not null default true,
  isr            boolean not null default true,
  otro_desc      numeric(12,2) not null default 0 check (otro_desc >= 0),
  otro_concepto  text,
  correo         text,
  estado         text not null default 'Activo' check (estado in ('Activo','Inactivo')),
  creado_por     uuid default auth.uid(),
  creado_en      timestamptz not null default now(),
  unique (empresa_id, cedula)
);


-- ---------------------------------------------------------------------
--  4. COMPUTADORAS CON RELOJ Y SUS MARCAS
--  Cada computadora tiene su clave; se guarda cifrada y nadie la puede
--  leer. Las marcas no se editan ni se borran nunca.
-- ---------------------------------------------------------------------

create table if not exists public.personal_computadoras (
  id             bigint generated always as identity primary key,
  empresa_id     text not null references public.grupo_empresas (id),
  codigo         text not null unique,
  trabajador_id  bigint references public.personal_trabajadores (id) on delete set null,
  clave_hash     text,
  activa         boolean not null default true,
  ultima_senal   timestamptz,
  creado_en      timestamptz not null default now()
);

alter table public.personal_trabajadores add column if not exists correo text;

create unique index if not exists personal_computadora_por_trabajador
  on public.personal_computadoras (trabajador_id) where trabajador_id is not null;

create table if not exists public.personal_marcas (
  id              bigint generated always as identity primary key,
  empresa_id      text   not null references public.grupo_empresas (id),
  trabajador_id   bigint not null references public.personal_trabajadores (id),
  computadora_id  bigint not null references public.personal_computadoras (id),
  tipo            text   not null check (tipo in ('encendido','apagado','reposo','despertar')),
  hora_equipo     timestamptz not null,
  hora_efectiva   timestamptz not null,
  sin_conexion    boolean not null default false,
  recibida_en     timestamptz not null default now(),
  unique (computadora_id, tipo, hora_equipo)
);

create index if not exists personal_marcas_dia on public.personal_marcas (trabajador_id, hora_efectiva);

-- El reloj llama esta función sin sesión, con el código y la clave de
-- su computadora. Con internet vale la hora del servidor; si la marca
-- se guardó sin conexión, vale la hora de la computadora y queda señalada.
create or replace function public.personal_recibir_marca(
  p_codigo text, p_clave text, p_tipo text, p_hora timestamptz, p_sin_conexion boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  c public.personal_computadoras%rowtype;
  v_hora timestamptz;
  v_id bigint;
begin
  select * into c from public.personal_computadoras where codigo = p_codigo;
  if not found or not c.activa or c.clave_hash is null or c.clave_hash <> crypt(coalesce(p_clave,''), c.clave_hash) then
    raise exception 'Computadora o clave no válida' using errcode = 'P0001';
  end if;
  if c.trabajador_id is null then
    raise exception 'La computadora % no está asignada a ningún trabajador', p_codigo using errcode = 'P0001';
  end if;
  if p_tipo not in ('encendido','apagado','reposo','despertar') then
    raise exception 'Tipo de marca no válido' using errcode = 'P0001';
  end if;
  if p_hora > now() + interval '10 minutes' or p_hora < now() - interval '45 days' then
    raise exception 'La hora de la marca no es válida' using errcode = 'P0001';
  end if;

  v_hora := case when p_sin_conexion then p_hora else now() end;

  insert into public.personal_marcas (empresa_id, trabajador_id, computadora_id, tipo, hora_equipo, hora_efectiva, sin_conexion)
  values (c.empresa_id, c.trabajador_id, c.id, p_tipo, p_hora, v_hora, p_sin_conexion)
  on conflict (computadora_id, tipo, hora_equipo) do nothing
  returning id into v_id;

  update public.personal_computadoras set ultima_senal = now() where id = c.id;
  return jsonb_build_object('ok', true, 'repetida', v_id is null, 'hora', v_hora);
end $$;

-- El administrador genera la clave de una computadora. Se muestra una
-- sola vez; si se pierde, se genera otra y la anterior deja de servir.
create or replace function public.personal_nueva_clave(p_computadora bigint)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_emp text;
  v_clave text;
begin
  select empresa_id into v_emp from public.personal_computadoras where id = p_computadora;
  if v_emp is null or not public.grupo_tiene_rol(v_emp, array['Administrador']) then
    raise exception 'Su perfil no tiene permiso para hacer esto' using errcode = 'P0001';
  end if;
  v_clave := upper(encode(gen_random_bytes(12), 'hex'));
  update public.personal_computadoras set clave_hash = crypt(v_clave, gen_salt('bf')) where id = p_computadora;
  return v_clave;
end $$;


-- ---------------------------------------------------------------------
--  5. QUINCENAS, CORRECCIONES, MARCAS ACEPTADAS Y AUSENCIAS
--  Con la quincena cerrada nadie corrige; para corregir hay que
--  reabrirla con motivo, y queda anotado.
-- ---------------------------------------------------------------------

create table if not exists public.personal_quincenas (
  id           bigint generated always as identity primary key,
  empresa_id   text not null references public.grupo_empresas (id),
  inicio       date not null,
  fin          date not null,
  estado       text not null default 'Abierta' check (estado in ('Abierta','Cerrada')),
  cerrada_por  uuid,
  cerrada_en   timestamptz,
  unique (empresa_id, inicio),
  check (fin >= inicio)
);

create table if not exists public.personal_bitacora (
  id           bigint generated always as identity primary key,
  empresa_id   text not null references public.grupo_empresas (id),
  quincena_id  bigint references public.personal_quincenas (id),
  accion       text not null,
  motivo       text,
  por          uuid default auth.uid(),
  por_nombre   text,
  cuando       timestamptz not null default now()
);

alter table public.personal_bitacora add column if not exists por_nombre text;

create or replace function public.personal_dia_abierto(p_empresa text, p_fecha date)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.personal_quincenas q
                     where q.empresa_id = p_empresa and q.estado = 'Cerrada' and p_fecha between q.inicio and q.fin)
$$;

create table if not exists public.personal_correcciones (
  id             bigint generated always as identity primary key,
  empresa_id     text   not null references public.grupo_empresas (id),
  trabajador_id  bigint not null references public.personal_trabajadores (id),
  fecha          date   not null,
  campo          text   not null check (campo in ('Entrada','Salida')),
  antes          time,
  despues        time   not null,
  motivo         text   not null check (length(trim(motivo)) >= 5),
  por            uuid   not null default auth.uid(),
  por_nombre     text,
  creado_en      timestamptz not null default now()
);

create table if not exists public.personal_aceptadas (
  id             bigint generated always as identity primary key,
  empresa_id     text   not null references public.grupo_empresas (id),
  trabajador_id  bigint not null references public.personal_trabajadores (id),
  fecha          date   not null,
  por            uuid   not null default auth.uid(),
  creado_en      timestamptz not null default now(),
  unique (trabajador_id, fecha)
);

create table if not exists public.personal_ausencias (
  id             bigint generated always as identity primary key,
  empresa_id     text   not null references public.grupo_empresas (id),
  trabajador_id  bigint not null references public.personal_trabajadores (id),
  fecha          date   not null,
  tipo           text   not null check (tipo in ('Permiso','Incapacidad','Vacaciones')),
  con_goce       boolean not null default true,
  nota           text,
  por            uuid   not null default auth.uid(),
  creado_en      timestamptz not null default now(),
  unique (trabajador_id, fecha)
);

-- nada se cambia en un día de una quincena cerrada
create or replace function public.personal_exigir_dia_abierto()
returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') and not public.personal_dia_abierto(old.empresa_id, old.fecha) then
    raise exception 'La quincena de ese día está cerrada. Para corregir hay que reabrirla.' using errcode = 'P0001';
  end if;
  if tg_op in ('INSERT','UPDATE') and not public.personal_dia_abierto(new.empresa_id, new.fecha) then
    raise exception 'La quincena de ese día está cerrada. Para corregir hay que reabrirla.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists dia_abierto on public.personal_correcciones;
create trigger dia_abierto before insert or update or delete on public.personal_correcciones
  for each row execute function public.personal_exigir_dia_abierto();
drop trigger if exists dia_abierto on public.personal_ausencias;
create trigger dia_abierto before insert or update or delete on public.personal_ausencias
  for each row execute function public.personal_exigir_dia_abierto();
drop trigger if exists dia_abierto on public.personal_aceptadas;
create trigger dia_abierto before insert or update or delete on public.personal_aceptadas
  for each row execute function public.personal_exigir_dia_abierto();

-- la corrección anota sola quién la hizo, aunque alguien mande otro nombre
create or replace function public.personal_firmar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.por := auth.uid();
  if tg_table_name in ('personal_correcciones', 'personal_bitacora') then
    new.por_nombre := (select coalesce(nombre, correo) from public.perfiles where id = auth.uid());
  end if;
  return new;
end $$;

alter table public.personal_correcciones add column if not exists por_nombre text;

drop trigger if exists firmar on public.personal_correcciones;
create trigger firmar before insert on public.personal_correcciones for each row execute function public.personal_firmar();
drop trigger if exists firmar on public.personal_ausencias;
create trigger firmar before insert or update on public.personal_ausencias for each row execute function public.personal_firmar();
drop trigger if exists firmar on public.personal_aceptadas;
create trigger firmar before insert on public.personal_aceptadas for each row execute function public.personal_firmar();
drop trigger if exists firmar on public.personal_bitacora;
create trigger firmar before insert on public.personal_bitacora for each row execute function public.personal_firmar();

-- cerrar y reabrir pasan por aquí, para que quede la bitácora
create or replace function public.personal_cerrar_quincena(p_empresa text, p_inicio date, p_fin date)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not public.personal_lleva_planilla(p_empresa) then
    raise exception 'Su perfil no tiene permiso para hacer esto' using errcode = 'P0001';
  end if;
  insert into public.personal_quincenas (empresa_id, inicio, fin) values (p_empresa, p_inicio, p_fin)
  on conflict (empresa_id, inicio) do update set fin = excluded.fin
  returning id into v_id;
  update public.personal_quincenas set estado = 'Cerrada', cerrada_por = auth.uid(), cerrada_en = now() where id = v_id;
  insert into public.personal_bitacora (empresa_id, quincena_id, accion) values (p_empresa, v_id, 'Cerró la quincena');
  return v_id;
end $$;

create or replace function public.personal_reabrir_quincena(p_quincena bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp text;
begin
  select empresa_id into v_emp from public.personal_quincenas where id = p_quincena;
  if v_emp is null or not public.personal_lleva_planilla(v_emp) then
    raise exception 'Su perfil no tiene permiso para hacer esto' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo,''))) < 5 then
    raise exception 'Escriba el motivo para reabrir la quincena' using errcode = 'P0001';
  end if;
  update public.personal_quincenas set estado = 'Abierta', cerrada_por = null, cerrada_en = null where id = p_quincena;
  insert into public.personal_bitacora (empresa_id, quincena_id, accion, motivo) values (v_emp, p_quincena, 'Reabrió la quincena', trim(p_motivo));
end $$;


-- ---------------------------------------------------------------------
--  6. EL DÍA DE CADA TRABAJADOR
--  Primer encendido = entrada; si lo último del día fue un apagado,
--  esa es la salida; si no, queda sin salida. El reposo es receso.
--  Las correcciones mandan sobre lo registrado, sin borrarlo.
-- ---------------------------------------------------------------------

create or replace view public.personal_dias with (security_invoker = true) as
with ev as (
  select m.trabajador_id,
         (m.hora_efectiva at time zone 'America/Panama') as t,
         m.tipo, m.sin_conexion,
         lead(m.tipo) over w as sig_tipo,
         lead(m.hora_efectiva at time zone 'America/Panama') over w as sig_t,
         row_number() over (partition by m.trabajador_id, (m.hora_efectiva at time zone 'America/Panama')::date
                            order by m.hora_efectiva desc) as desde_el_final
  from public.personal_marcas m
  window w as (partition by m.trabajador_id, (m.hora_efectiva at time zone 'America/Panama')::date order by m.hora_efectiva)
), reg as (
  select trabajador_id, t::date as fecha,
         min(t) filter (where tipo = 'encendido') as entrada,
         max(t) filter (where desde_el_final = 1 and tipo = 'apagado') as salida,
         coalesce(sum(extract(epoch from (sig_t - t)) / 60) filter (where tipo = 'reposo' and sig_t is not null), 0)::int as recesos_min,
         bool_or(sin_conexion) as sin_conexion,
         count(*) as marcas
  from ev group by trabajador_id, t::date
), corr as (
  select distinct on (trabajador_id, fecha, campo) trabajador_id, fecha, campo, despues
  from public.personal_correcciones
  order by trabajador_id, fecha, campo, creado_en desc
), base as (
  select trabajador_id, fecha from reg
  union select trabajador_id, fecha from public.personal_correcciones
  union select trabajador_id, fecha from public.personal_ausencias
), dia as (
  select t.empresa_id, b.trabajador_id, b.fecha,
         coalesce(ce.despues, date_trunc('second', r.entrada)::time) as entrada,
         coalesce(cs.despues, date_trunc('second', r.salida)::time)  as salida,
         date_trunc('second', r.entrada)::time as entrada_registrada,
         date_trunc('second', r.salida)::time  as salida_registrada,
         coalesce(r.recesos_min, 0) as recesos_min,
         coalesce(r.marcas, 0) as marcas,
         coalesce(r.sin_conexion, false) and not exists (
           select 1 from public.personal_aceptadas a where a.trabajador_id = b.trabajador_id and a.fecha = b.fecha) as sin_conexion,
         (ce.trabajador_id is not null or cs.trabajador_id is not null) as corregida,
         au.tipo as ausencia, au.con_goce,
         j.entrada as jornada_entrada, j.horas as jornada_horas, j.almuerzo_min,
         p.tolerancia_min, p.descontar_recesos, p.calcular_extra
  from base b
  join public.personal_trabajadores t on t.id = b.trabajador_id
  join public.personal_jornadas j on j.id = t.jornada_id
  join public.personal_parametros p on p.empresa_id = t.empresa_id
  left join reg r on r.trabajador_id = b.trabajador_id and r.fecha = b.fecha
  left join corr ce on ce.trabajador_id = b.trabajador_id and ce.fecha = b.fecha and ce.campo = 'Entrada'
  left join corr cs on cs.trabajador_id = b.trabajador_id and cs.fecha = b.fecha and cs.campo = 'Salida'
  left join public.personal_ausencias au on au.trabajador_id = b.trabajador_id and au.fecha = b.fecha
)
select d.empresa_id, d.trabajador_id, d.fecha, d.entrada, d.salida,
       d.entrada_registrada, d.salida_registrada, d.recesos_min, d.marcas,
       d.sin_conexion, d.corregida, d.ausencia, d.con_goce,
       (d.entrada is not null and d.entrada > d.jornada_entrada + make_interval(mins => d.tolerancia_min)) as llego_tarde,
       case
         when d.ausencia is not null then 'Ausencia'
         when d.entrada is null then 'Sin marca'
         when d.salida is null then 'Sin salida'
         when d.sin_conexion then 'Sin conexión'
         else 'Completo'
       end as estado,
       h.trabajados_min,
       case when d.calcular_extra and h.trabajados_min is not null
            then greatest(0, h.trabajados_min - (d.jornada_horas * 60)::int) else 0 end as extra_min
from dia d
cross join lateral (
  select case when d.entrada is null or d.salida is null or d.ausencia is not null then null
              else greatest(0, (extract(epoch from (d.salida - d.entrada)) / 60)::int
                               - d.almuerzo_min
                               - case when d.descontar_recesos then d.recesos_min else 0 end)
         end as trabajados_min
) h;


-- El trabajador no ve las marcas. Si el administrador encendió el aviso,
-- esta consulta le devuelve solo la hora de su entrada de hoy.
create or replace function public.personal_mi_entrada_hoy(p_empresa text)
returns time language sql stable security definer set search_path = public as $$
  select date_trunc('minute', min(m.hora_efectiva at time zone 'America/Panama'))::time
  from public.personal_marcas m
  join public.personal_trabajadores t on t.id = m.trabajador_id
  join public.personal_parametros p on p.empresa_id = t.empresa_id
  where lower(t.correo) = (select lower(email) from auth.users where id = auth.uid())
    and t.empresa_id = p_empresa and p.aviso_trabajador
    and m.tipo = 'encendido'
    and (m.hora_efectiva at time zone 'America/Panama')::date = (now() at time zone 'America/Panama')::date
$$;


-- ---------------------------------------------------------------------
--  7. AGENDA PERSONAL
--  Cada quien organiza la suya; nadie ve la de otro.
-- ---------------------------------------------------------------------

create table if not exists public.grupo_agenda (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  empresa_id  text not null references public.grupo_empresas (id),
  fecha       date not null,
  desde       time not null,
  hasta       time not null,
  titulo      text not null check (length(trim(titulo)) > 0),
  lugar       text,
  tipo        text not null default 'reu' check (tipo in ('reu','vis','ins','ent','seg')),
  hecha       boolean not null default false,
  creado_en   timestamptz not null default now(),
  check (hasta > desde)
);

create index if not exists grupo_agenda_por_usuario on public.grupo_agenda (usuario_id, fecha);


-- ---------------------------------------------------------------------
--  7b. USUARIOS DEL GRUPO
--  El administrador de cada empresa ve y maneja a su gente. Las cuentas
--  las crea la función admin-usuarios con clave temporal, como en Transeo.
-- ---------------------------------------------------------------------

-- la empresa que cada quien escogió la primera vez
create table if not exists public.grupo_preferencias (
  usuario_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  empresa_principal  text not null references public.grupo_empresas (id),
  actualizado_en     timestamptz not null default now()
);

create or replace function public.grupo_usuarios(p_empresa text)
returns table (id uuid, correo text, nombre text, rol text, activo boolean, acceso_activo boolean,
               cedula text, celular text, clave_temporal boolean, bloqueado boolean, ultimo_acceso timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.correo, p.nombre, a.rol, p.activo, a.activo, p.cedula, p.celular, p.clave_temporal,
         coalesce(ia.bloqueado, false), u.last_sign_in_at
  from public.grupo_accesos a
  join public.perfiles p on p.id = a.usuario_id
  join auth.users u on u.id = p.id
  left join public.intentos_acceso ia on ia.correo = lower(p.correo)
  where a.empresa_id = p_empresa and public.grupo_tiene_rol(p_empresa, array['Administrador'])
  order by p.nombre
$$;

create or replace function public.grupo_desbloquear(p_empresa text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.grupo_tiene_rol(p_empresa, array['Administrador'])
     or not exists (select 1 from public.grupo_accesos where empresa_id = p_empresa and usuario_id = p_id) then
    raise exception 'Su perfil no tiene permiso para hacer esto' using errcode = 'P0001';
  end if;
  delete from public.intentos_acceso where correo = (select lower(correo) from public.perfiles where id = p_id);
end $$;


-- ---------------------------------------------------------------------
--  8. PERMISOS
--  Gerencia solo consulta. Leidy (Planilla) registra, corrige y cierra.
--  El administrador además maneja jornadas, feriados y computadoras.
--  Las marcas solo entran por la función del reloj.
-- ---------------------------------------------------------------------

alter table public.grupo_empresas               enable row level security;
alter table public.grupo_accesos                enable row level security;
alter table public.personal_parametros    enable row level security;
alter table public.personal_jornadas      enable row level security;
alter table public.personal_feriados      enable row level security;
alter table public.personal_trabajadores  enable row level security;
alter table public.personal_computadoras  enable row level security;
alter table public.personal_marcas        enable row level security;
alter table public.personal_quincenas     enable row level security;
alter table public.personal_bitacora      enable row level security;
alter table public.personal_correcciones  enable row level security;
alter table public.personal_aceptadas     enable row level security;
alter table public.personal_ausencias     enable row level security;
alter table public.grupo_agenda                 enable row level security;
alter table public.grupo_preferencias     enable row level security;

do $$
declare t text; p text;
begin
  foreach t in array array['grupo_empresas','grupo_accesos','personal_parametros','personal_jornadas','personal_feriados',
    'personal_trabajadores','personal_computadoras','personal_marcas','personal_quincenas','personal_bitacora',
    'personal_correcciones','personal_aceptadas','personal_ausencias','grupo_agenda','grupo_preferencias']
  loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p, t);
    end loop;
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- empresas: cada quien ve las suyas
create policy ver on public.grupo_empresas for select using (public.grupo_rol_en(id) is not null);

-- accesos: cada quien ve los suyos; el administrador de la empresa, todos
create policy ver on public.grupo_accesos for select using (usuario_id = auth.uid() or public.grupo_tiene_rol(empresa_id, array['Administrador']));
create policy crear on public.grupo_accesos for insert with check (public.grupo_tiene_rol(empresa_id, array['Administrador']));
create policy editar on public.grupo_accesos for update using (public.grupo_tiene_rol(empresa_id, array['Administrador'])) with check (public.grupo_tiene_rol(empresa_id, array['Administrador']));
create policy borrar on public.grupo_accesos for delete using (public.grupo_tiene_rol(empresa_id, array['Administrador']));

-- parámetros: todos los de la empresa los leen (el aviso al trabajador depende de ellos)
create policy ver on public.personal_parametros for select using (public.grupo_rol_en(empresa_id) is not null);
create policy editar on public.personal_parametros for update using (public.personal_lleva_planilla(empresa_id)) with check (public.personal_lleva_planilla(empresa_id));

-- jornadas y feriados: los ve quien entra; los cambia el administrador
create policy ver on public.personal_jornadas for select using (public.grupo_rol_en(empresa_id) is not null);
create policy crear on public.personal_jornadas for insert with check (public.grupo_tiene_rol(empresa_id, array['Administrador']));
create policy editar on public.personal_jornadas for update using (public.grupo_tiene_rol(empresa_id, array['Administrador'])) with check (public.grupo_tiene_rol(empresa_id, array['Administrador']));
create policy ver on public.personal_feriados for select using (public.grupo_rol_en(empresa_id) is not null);
create policy crear on public.personal_feriados for insert with check (public.grupo_tiene_rol(empresa_id, array['Administrador']));
create policy editar on public.personal_feriados for update using (public.grupo_tiene_rol(empresa_id, array['Administrador'])) with check (public.grupo_tiene_rol(empresa_id, array['Administrador']));
create policy borrar on public.personal_feriados for delete using (public.grupo_tiene_rol(empresa_id, array['Administrador']));

-- trabajadores: los registra Leidy; gerencia los consulta; el trabajador no ve la lista
create policy ver on public.personal_trabajadores for select using (public.personal_ve(empresa_id));
create policy crear on public.personal_trabajadores for insert with check (public.personal_lleva_planilla(empresa_id));
create policy editar on public.personal_trabajadores for update using (public.personal_lleva_planilla(empresa_id)) with check (public.personal_lleva_planilla(empresa_id));

-- computadoras: el administrador; Leidy las ve para asignarlas
create policy ver on public.personal_computadoras for select using (public.personal_lleva_planilla(empresa_id));
create policy crear on public.personal_computadoras for insert with check (public.grupo_tiene_rol(empresa_id, array['Administrador']));
create policy editar on public.personal_computadoras for update using (public.personal_lleva_planilla(empresa_id)) with check (public.personal_lleva_planilla(empresa_id));
-- la clave cifrada no sale nunca hacia las pantallas
revoke select on public.personal_computadoras from authenticated;
grant select (id, empresa_id, codigo, trabajador_id, activa, ultima_senal, creado_en) on public.personal_computadoras to authenticated;
revoke update on public.personal_computadoras from authenticated;
grant update (trabajador_id, activa) on public.personal_computadoras to authenticated;

-- marcas: solo se consultan; entran por la función del reloj y no se tocan
create policy ver on public.personal_marcas for select using (public.personal_ve(empresa_id));

-- quincenas y bitácora: se consultan; cerrar y reabrir van por sus funciones
create policy ver on public.personal_quincenas for select using (public.personal_ve(empresa_id));
create policy ver on public.personal_bitacora for select using (public.personal_ve(empresa_id));

-- correcciones y aceptadas: Leidy; nunca se editan ni se borran
create policy ver on public.personal_correcciones for select using (public.personal_ve(empresa_id));
create policy crear on public.personal_correcciones for insert with check (public.personal_lleva_planilla(empresa_id));
create policy ver on public.personal_aceptadas for select using (public.personal_ve(empresa_id));
create policy crear on public.personal_aceptadas for insert with check (public.personal_lleva_planilla(empresa_id));

-- ausencias: Leidy registra y puede quitar mientras la quincena esté abierta
create policy ver on public.personal_ausencias for select using (public.personal_ve(empresa_id));
create policy crear on public.personal_ausencias for insert with check (public.personal_lleva_planilla(empresa_id));
create policy editar on public.personal_ausencias for update using (public.personal_lleva_planilla(empresa_id)) with check (public.personal_lleva_planilla(empresa_id));
create policy borrar on public.personal_ausencias for delete using (public.personal_lleva_planilla(empresa_id));

-- agenda: solo la dueña o el dueño
create policy ver on public.grupo_agenda for select using (usuario_id = auth.uid());
create policy crear on public.grupo_agenda for insert with check (usuario_id = auth.uid() and public.grupo_rol_en(empresa_id) is not null);
create policy editar on public.grupo_agenda for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy borrar on public.grupo_agenda for delete using (usuario_id = auth.uid());

-- preferencia: solo la propia
create policy ver on public.grupo_preferencias for select using (usuario_id = auth.uid());
create policy crear on public.grupo_preferencias for insert with check (usuario_id = auth.uid());
create policy editar on public.grupo_preferencias for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- funciones: el reloj entra sin sesión solo a la suya
revoke execute on function public.personal_recibir_marca(text, text, text, timestamptz, boolean) from public;
grant  execute on function public.personal_recibir_marca(text, text, text, timestamptz, boolean) to anon, authenticated;
revoke execute on function public.personal_nueva_clave(bigint) from public, anon;
grant  execute on function public.personal_nueva_clave(bigint) to authenticated;
revoke execute on function public.personal_cerrar_quincena(text, date, date) from public, anon;
grant  execute on function public.personal_cerrar_quincena(text, date, date) to authenticated;
revoke execute on function public.personal_reabrir_quincena(bigint, text) from public, anon;
grant  execute on function public.personal_reabrir_quincena(bigint, text) to authenticated;
revoke all on public.personal_dias from anon;
revoke execute on function public.grupo_usuarios(text) from public, anon;
grant  execute on function public.grupo_usuarios(text) to authenticated;
revoke execute on function public.grupo_desbloquear(text, uuid) from public, anon;
grant  execute on function public.grupo_desbloquear(text, uuid) to authenticated;
revoke execute on function public.personal_mi_entrada_hoy(text) from public, anon;
grant  execute on function public.personal_mi_entrada_hoy(text) to authenticated;


-- ---------------------------------------------------------------------
--  9. ARRANQUE: Álvaro como administrador de Thelmar
--  Los demás accesos se dan desde la pantalla de usuarios.
-- ---------------------------------------------------------------------

insert into public.grupo_accesos (usuario_id, empresa_id, rol, principal)
select id, 'thelmar', 'Administrador', true from auth.users where lower(email) = 'abecerra@orbidat.com'
on conflict (usuario_id, empresa_id) do nothing;


commit;

select 'Listo' as resultado,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'equipos' and column_name = 'foto_ref') as fotos_y_documentos,
       (select count(*) from public.grupo_empresas) as empresas_del_grupo,
       (select string_agg(p.nombre || ' (' || a.rol || ')', ', ') from public.grupo_accesos a join public.perfiles p on p.id = a.usuario_id) as acceso_a_thelmar;
