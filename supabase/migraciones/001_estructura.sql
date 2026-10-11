-- =====================================================================
--  TRANSEO PTY · Sistema de gestión de flota
--  001_estructura.sql  ·  Toda la base del sistema
--
--  Se corre UNA vez en Supabase: SQL Editor -> New query -> pegar -> Run.
--  Crea todas las tablas, los permisos por perfil, la bitácora y los
--  datos iniciales (las 13 categorías y los 10 equipos de la flota).
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. PERFILES DE USUARIO
--  Cada persona que entra tiene una fila aquí, amarrada a su cuenta.
--  Nace sin acceso: el administrador le asigna el perfil.
-- ---------------------------------------------------------------------

create table public.perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  correo      text not null,
  nombre      text,
  rol         text not null default 'Sin acceso'
              check (rol in ('Administrador','Gerencia','Asistente','Contabilidad','Sin acceso')),
  activo      boolean not null default false,
  pantalla_inicio text,
  creado_en   timestamptz not null default now()
);

-- al crearse una cuenta, nace su perfil sin acceso
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, correo, nombre)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- el perfil de quien está conectado
create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.puede_ver()
returns boolean language sql stable as $$
  select coalesce(public.mi_rol() in ('Administrador','Gerencia','Asistente','Contabilidad'), false)
$$;

create or replace function public.puede_capturar()
returns boolean language sql stable as $$
  select coalesce(public.mi_rol() in ('Administrador','Asistente','Contabilidad'), false)
$$;

create or replace function public.es_admin()
returns boolean language sql stable as $$
  select coalesce(public.mi_rol() = 'Administrador', false)
$$;


-- ---------------------------------------------------------------------
--  2. CATÁLOGOS
-- ---------------------------------------------------------------------

create table public.equipos (
  id             bigint generated always as identity primary key,
  codigo         text unique,
  nombre         text not null,
  placa          text not null unique,
  tipo           text not null check (tipo in ('Mula','Camión grúa','Camión','Pickup','Automóvil','SUV','Otro')),
  marca          text,
  modelo         text,
  anio           int check (anio between 1950 and 2100),
  color          text,
  combustible    text check (combustible in ('Diésel','Gasolina','Híbrido','Eléctrico')),
  chasis         text,
  motor          text,
  transmision    text,
  cilindros      int,
  ejes           int,
  alto_m         numeric(5,2),
  ancho_m        numeric(5,2),
  largo_m        numeric(5,2),
  peso_bruto_t   numeric(6,2),
  peso_vacio_t   numeric(6,2),
  carga_util_t   numeric(6,2),
  propietario    text,
  km_actual      int,
  estado         text not null default 'Activo' check (estado in ('Activo','En taller','Fuera de servicio','Vendido')),
  notas          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.conductores (
  id              bigint generated always as identity primary key,
  nombre          text not null,
  cedula          text unique,
  celular         text,
  licencia_tipo   text,
  licencia_vence  date,
  equipo_id       bigint references public.equipos (id),
  enlace_clave    text unique,
  estado          text not null default 'Activo' check (estado in ('Activo','Inactivo')),
  notas           text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table public.beneficiarios (
  id                  bigint generated always as identity primary key,
  nombre              text not null unique,
  clase               text not null check (clase in ('Proveedor','Conductor','Mano de obra','Otro')),
  rubro               text,
  ruc_cedula          text unique,
  contribuyente       boolean not null default false,
  contacto            text,
  telefono            text,
  correo              text,
  direccion           text,
  forma_pago_habitual text check (forma_pago_habitual in ('Yappy','ACH','Efectivo','Crédito')),
  banco               text,
  tipo_cuenta         text check (tipo_cuenta in ('Ahorros','Corriente')),
  cuenta              text,
  titular_cuenta      text,
  yappy               text check (yappy is null or yappy ~ '^[0-9]{4}-[0-9]{4}$'),
  dias_credito        int,
  evaluacion          text check (evaluacion in ('Bueno','Regular','Deficiente')),
  estado              text not null default 'Activo' check (estado in ('Activo','Inactivo')),
  notas               text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

create table public.clientes (
  id             bigint generated always as identity primary key,
  nombre         text not null unique,
  ruc_cedula     text,
  contacto       text,
  telefono       text,
  correo         text,
  direccion      text,
  forma_cobro    text,
  estado         text not null default 'Activo' check (estado in ('Activo','Inactivo')),
  notas          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.proyectos (
  id             bigint generated always as identity primary key,
  nombre_corto   text not null unique,
  nombre_oficial text not null,
  cliente_id     bigint references public.clientes (id),
  contacto       text,
  correo         text,
  telefono       text,
  forma_pago     text,
  fecha_inicio   date,
  fecha_cierre   date,
  estado         text not null default 'Activo' check (estado in ('Activo','Cerrado')),
  notas          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.proyecto_frentes (
  id          bigint generated always as identity primary key,
  proyecto_id bigint not null references public.proyectos (id) on delete cascade,
  nombre      text not null,
  unique (proyecto_id, nombre)
);

create table public.categorias (
  id              bigint generated always as identity primary key,
  nombre          text not null unique,
  genera_orden    text not null check (genera_orden in ('Orden de compra','Orden de pago')),
  cuenta_contable text,
  orden           int not null default 0,
  activa          boolean not null default true
);


-- ---------------------------------------------------------------------
--  3. DOCUMENTOS DE LOS EQUIPOS
--  Una fila por documento. Al renovar, el anterior queda "Reemplazado":
--  ese es el historial. Los que no vencen tienen vence vacío.
-- ---------------------------------------------------------------------

create table public.documentos (
  id                bigint generated always as identity primary key,
  equipo_id         bigint not null references public.equipos (id),
  tipo              text not null check (tipo in ('Revisado','Póliza de seguro','Pesos y dimensiones',
                                                 'Registro de propiedad','Panapass','Otro')),
  numero            text,
  emisor            text,
  emision           date,
  vence             date,
  en_tramite        boolean not null default false,
  estado            text not null default 'Vigente' check (estado in ('Vigente','Reemplazado')),
  reemplazado_por   bigint references public.documentos (id),
  archivo_ref       text,
  archivo_servicio  text,
  datos_leidos      jsonb,
  notas             text,
  subido_por        uuid references public.perfiles (id),
  subido_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

-- un solo documento vigente de cada tipo por equipo (salvo "Otro")
create unique index documentos_vigente_unico
  on public.documentos (equipo_id, tipo)
  where estado = 'Vigente' and tipo <> 'Otro';


-- ---------------------------------------------------------------------
--  4. DINERO: capturas, gastos y órdenes
-- ---------------------------------------------------------------------

-- la bandeja: capturas de Yappy y ACH leídas que esperan confirmación
create table public.capturas (
  id                bigint generated always as identity primary key,
  numero            text unique,
  estado            text not null default 'Por registrar'
                    check (estado in ('Por registrar','Sin factura','Justificado','Descartado')),
  tipo              text not null check (tipo in ('Yappy','ACH')),
  fecha             date,
  hora              time,
  monto             numeric(12,2),
  beneficiario_leido text,
  telefono          text,
  mensaje           text,
  confirmacion      text,
  imagen_ref        text,
  datos_leidos      jsonb,
  justificacion     text,
  factura_ref       text,
  numero_factura    text,
  motivo            text,
  subido_por        uuid references public.perfiles (id),
  subido_en         timestamptz not null default now(),
  registrado_por    uuid references public.perfiles (id),
  registrado_en     timestamptz
);

create table public.ordenes (
  id               bigint generated always as identity primary key,
  numero           text not null unique,
  tipo             text not null check (tipo in ('Servicio','Pago','Compra')),
  fecha            date not null,
  proyecto_id      bigint references public.proyectos (id),
  proyecto_oficial text,
  frente           text,
  equipo_id        bigint references public.equipos (id),
  contraparte      text not null,
  cedula_ruc       text,
  contacto         text,
  correo           text,
  telefono         text,
  forma_pago       text,
  banco            text,
  tipo_cuenta      text,
  cuenta           text,
  titular_cuenta   text,
  yappy            text,
  categoria_id     bigint references public.categorias (id),
  observacion      text,
  lleva_itbms      boolean not null default false,
  subtotal         numeric(12,2) not null default 0,
  itbms            numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  valor_letras     text,
  estado           text not null default 'Borrador'
                   check (estado in ('Borrador','Por aprobar','Devuelta','Aprobada','Cerrada','Anulada')),
  origen           text not null default 'Normal' check (origen in ('Normal','Pago directo','Histórico')),
  creada_por       uuid references public.perfiles (id),
  creada_en        timestamptz not null default now(),
  enviada_en       timestamptz,
  aprobada_por     uuid references public.perfiles (id),
  aprobada_en      timestamptz,
  nota_gerencia    text,
  ejecutada_por    uuid references public.perfiles (id),
  ejecutada_en     timestamptz,
  numero_factura   text,
  metodo_pago      text check (metodo_pago in ('Yappy','ACH','Efectivo')),
  referencia       text,
  fecha_pago       date,
  factura_ref      text,
  captura_id       bigint references public.capturas (id),
  reemplaza_id     bigint references public.ordenes (id),
  motivo_anulacion text,
  formato_version  text not null default '1.0'
);

create table public.orden_lineas (
  id              bigint generated always as identity primary key,
  orden_id        bigint not null references public.ordenes (id) on delete cascade,
  linea           int not null,
  cantidad        numeric(10,2) not null check (cantidad > 0),
  unidad          text,
  descripcion     text not null,
  n_parte         text,
  precio_unitario numeric(12,2) not null check (precio_unitario > 0),
  total           numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored
);

create table public.gastos (
  id                  bigint generated always as identity primary key,
  numero              text unique,
  fecha               date not null,
  equipo_id           bigint references public.equipos (id),
  proyecto_id         bigint references public.proyectos (id),
  beneficiario_id     bigint references public.beneficiarios (id),
  beneficiario_nombre text not null,
  cuenta_origen       text not null check (cuenta_origen in ('Yappy','ACH','Efectivo')),
  referencia          text,
  referencia_repetida boolean not null default false,
  tipo_documento      text,
  numero_documento    text,
  descripcion         text,
  lleva_itbms         boolean not null default false,
  subtotal            numeric(12,2) not null default 0,
  itbms               numeric(12,2) not null default 0,
  total               numeric(12,2) not null default 0,
  comprobante_ref     text,
  km                  int,
  orden_id            bigint references public.ordenes (id),
  captura_id          bigint references public.capturas (id),
  origen              text not null default 'Manual' check (origen in ('Manual','Captura','Orden','Histórico')),
  capturado_por       uuid references public.perfiles (id),
  creado_en           timestamptz not null default now(),
  editado_por         uuid references public.perfiles (id),
  editado_en          timestamptz,
  constraint gasto_con_destino check (equipo_id is not null or proyecto_id is not null),
  constraint referencia_obligatoria check (cuenta_origen = 'Efectivo' or coalesce(referencia, '') <> '')
);

-- una referencia no se registra dos veces, salvo que se acepte a propósito
create unique index gastos_referencia_unica
  on public.gastos (cuenta_origen, referencia)
  where referencia is not null and not referencia_repetida;

create table public.gasto_lineas (
  id           bigint generated always as identity primary key,
  gasto_id     bigint not null references public.gastos (id) on delete cascade,
  categoria_id bigint not null references public.categorias (id),
  detalle      text,
  subtotal     numeric(12,2) not null,
  itbms        numeric(12,2) not null default 0,
  total        numeric(12,2) not null
);

alter table public.capturas add column gasto_id bigint references public.gastos (id);
alter table public.capturas add column orden_id bigint references public.ordenes (id);
alter table public.ordenes  add column gasto_id bigint references public.gastos (id);


-- ---------------------------------------------------------------------
--  5. OPERACIÓN: inspecciones, fallas y viajes
-- ---------------------------------------------------------------------

create table public.inspecciones (
  id                bigint generated always as identity primary key,
  periodo           text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  equipo_id         bigint not null references public.equipos (id),
  fecha             date not null default current_date,
  inspeccionado_por text not null,
  por_conductor     boolean not null default false,
  km                int,
  observaciones     text,
  formato_version   text not null default '1.0',
  creado_en         timestamptz not null default now(),
  unique (periodo, equipo_id)
);

create table public.inspeccion_resultados (
  id             bigint generated always as identity primary key,
  inspeccion_id  bigint not null references public.inspecciones (id) on delete cascade,
  grupo          text not null,
  punto          text not null,
  estado         text not null check (estado in ('Bien','Mal','No aplica')),
  nota           text
);

create table public.fallas (
  id             bigint generated always as identity primary key,
  equipo_id      bigint not null references public.equipos (id),
  origen         text not null default 'Reporte' check (origen in ('Reporte','Inspección')),
  inspeccion_id  bigint references public.inspecciones (id),
  descripcion    text not null,
  reportado_por  text,
  km             int,
  estado         text not null default 'Abierta' check (estado in ('Abierta','En reparación','Cerrada')),
  creado_en      timestamptz not null default now(),
  cerrado_en     timestamptz,
  notas          text
);

create table public.viajes (
  id           bigint generated always as identity primary key,
  numero       text unique,
  fecha        date not null,
  equipo_id    bigint references public.equipos (id),
  conductor_id bigint references public.conductores (id),
  cliente_id   bigint references public.clientes (id),
  proyecto_id  bigint references public.proyectos (id),
  origen       text,
  destino      text,
  km_salida    int,
  km_llegada   int,
  estado       text not null default 'Programado' check (estado in ('Programado','En curso','Terminado','Cancelado')),
  notas        text,
  creado_en    timestamptz not null default now()
);


-- ---------------------------------------------------------------------
--  6. AVISOS Y BITÁCORA
-- ---------------------------------------------------------------------

create table public.avisos_config (
  id                  int primary key default 1 check (id = 1),
  responsable_nombre  text,
  correo              text,
  copias              text,
  activo              boolean not null default false,
  vencido_cada_dias   int not null default 3,
  tramite_cada_dias   int not null default 7
);
insert into public.avisos_config (id) values (1);

create table public.avisos_enviados (
  id           bigint generated always as identity primary key,
  enviado_en   timestamptz not null default now(),
  destinatarios text,
  detalle      jsonb
);

create table public.bitacora (
  id        bigint generated always as identity primary key,
  tabla     text not null,
  registro  text,
  accion    text not null,
  antes     jsonb,
  despues   jsonb,
  usuario   uuid,
  fecha     timestamptz not null default now()
);

-- queda anotado quién cambió qué, en todas las tablas importantes
create or replace function public.anotar_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.bitacora (tabla, registro, accion, antes, despues, usuario)
  values (tg_table_name,
          coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, ''),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
          auth.uid());
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function public.marcar_actualizado()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['equipos','conductores','beneficiarios','clientes','proyectos','documentos',
                           'capturas','ordenes','gastos','inspecciones','fallas','viajes','categorias','perfiles']
  loop
    execute format('create trigger bitacora_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.anotar_bitacora()', t);
  end loop;
  foreach t in array array['equipos','conductores','beneficiarios','clientes','proyectos','documentos']
  loop
    execute format('create trigger actualizado_%1$s before update on public.%1$s
                    for each row execute function public.marcar_actualizado()', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
--  7. NÚMEROS CONSECUTIVOS
--  G-000001, PD-000001, COPD-077-2026, OP-0001-2026, OC-0001-2026
-- ---------------------------------------------------------------------

create or replace function public.siguiente_numero(p_tipo text)
returns text language plpgsql security definer set search_path = public as $$
declare
  anio text := to_char(now() at time zone 'America/Panama', 'YYYY');
  n    int;
begin
  if p_tipo = 'Gasto' then
    select coalesce(max(substring(numero from 3)::int), 0) + 1 into n from gastos where numero ~ '^G-[0-9]+$';
    return 'G-' || lpad(n::text, 6, '0');
  elsif p_tipo = 'Captura' then
    select coalesce(max(substring(numero from 4)::int), 0) + 1 into n from capturas where numero ~ '^PD-[0-9]+$';
    return 'PD-' || lpad(n::text, 6, '0');
  elsif p_tipo = 'Servicio' then
    -- sigue desde la 077; no reinicia por año
    select greatest(coalesce(max(split_part(numero, '-', 2)::int), 0), 76) + 1 into n
      from ordenes where numero ~ '^COPD-[0-9]+-[0-9]{4}$';
    return 'COPD-' || lpad(n::text, 3, '0') || '-' || anio;
  elsif p_tipo in ('Pago','Compra') then
    select coalesce(max(split_part(numero, '-', 2)::int), 0) + 1 into n
      from ordenes where numero like (case p_tipo when 'Pago' then 'OP-' else 'OC-' end) || '%-' || anio;
    return (case p_tipo when 'Pago' then 'OP-' else 'OC-' end) || lpad(n::text, 4, '0') || '-' || anio;
  end if;
  raise exception 'Tipo de número desconocido: %', p_tipo;
end $$;


-- el número se pone solo al crear el registro
create or replace function public.asignar_numero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null or new.numero = '' then
    new.numero := public.siguiente_numero(case tg_table_name
                    when 'gastos'   then 'Gasto'
                    when 'capturas' then 'Captura'
                    else to_jsonb(new)->>'tipo' end);
  end if;
  return new;
end $$;

create trigger numero_gastos   before insert on public.gastos   for each row execute function public.asignar_numero();
create trigger numero_capturas before insert on public.capturas for each row execute function public.asignar_numero();
create trigger numero_ordenes  before insert on public.ordenes  for each row execute function public.asignar_numero();


-- ---------------------------------------------------------------------
--  8. PERMISOS POR PERFIL (seguridad a nivel de fila)
--  Ver: Administrador, Gerencia, Asistente, Contabilidad.
--  Crear y editar: Administrador, Asistente, Contabilidad.
--  Borrar: solo Administrador.
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['equipos','conductores','beneficiarios','clientes','proyectos','proyecto_frentes',
                           'categorias','documentos','capturas','ordenes','orden_lineas','gastos','gasto_lineas',
                           'inspecciones','inspeccion_resultados','fallas','viajes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy ver on public.%I for select using (public.puede_ver())', t);
    execute format('create policy crear on public.%I for insert with check (public.puede_capturar())', t);
    execute format('create policy editar on public.%I for update using (public.puede_capturar()) with check (public.puede_capturar())', t);
    execute format('create policy borrar on public.%I for delete using (public.es_admin())', t);
  end loop;
end $$;

-- la Gerencia aprueba o devuelve órdenes: puede editarlas también
create policy gerencia_decide on public.ordenes for update
  using (public.mi_rol() = 'Gerencia') with check (public.mi_rol() = 'Gerencia');

-- perfiles: cada quien ve el suyo; el administrador ve y edita todos
alter table public.perfiles enable row level security;
create policy ver_mio on public.perfiles for select using (id = auth.uid() or public.es_admin());
create policy admin_edita on public.perfiles for update using (public.es_admin()) with check (public.es_admin());

-- avisos y bitácora: solo el administrador
alter table public.avisos_config   enable row level security;
alter table public.avisos_enviados enable row level security;
alter table public.bitacora        enable row level security;
create policy admin_ve on public.avisos_config   for select using (public.es_admin());
create policy admin_ed on public.avisos_config   for update using (public.es_admin()) with check (public.es_admin());
create policy admin_ve on public.avisos_enviados for select using (public.es_admin());
create policy admin_ve on public.bitacora        for select using (public.es_admin());


-- ---------------------------------------------------------------------
--  9. VISTA DE VENCIMIENTOS
--  Lo que alimenta la pantalla de documentos y, después, los avisos.
-- ---------------------------------------------------------------------

create or replace view public.vencimientos with (security_invoker = true) as
select d.id, d.equipo_id, e.nombre as equipo, e.placa, d.tipo, d.numero, d.vence, d.en_tramite,
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


-- ---------------------------------------------------------------------
--  10. DATOS INICIALES
-- ---------------------------------------------------------------------

insert into public.categorias (nombre, genera_orden, orden) values
  ('Combustible y lubricantes', 'Orden de compra', 1),
  ('Dotación',                  'Orden de compra', 2),
  ('M.O. mantenimiento',        'Orden de pago',   3),
  ('Salario',                   'Orden de pago',   4),
  ('Electromecánica',           'Orden de pago',   5),
  ('Repuestos',                 'Orden de compra', 6),
  ('Llantas, flat y mangueras', 'Orden de compra', 7),
  ('Seguro, revisado y placa',  'Orden de pago',   8),
  ('Recarga de extintores',     'Orden de pago',   9),
  ('Transporte',                'Orden de pago',  10),
  ('Viáticos',                  'Orden de pago',  11),
  ('Servicio de aduanas',       'Orden de pago',  12),
  ('Recarga Panapass',          'Orden de pago',  13);

insert into public.equipos (codigo, nombre, placa, tipo, marca, modelo, anio, color, combustible, chasis, motor,
                            transmision, cilindros, ejes, alto_m, ancho_m, largo_m, peso_bruto_t, peso_vacio_t,
                            carga_util_t, propietario) values
  ('EQ-01', 'Mula Freightliner',   '377051', 'Mula',        'Freightliner', null, null, null, 'Diésel', null, null, null, null, null, null, null, null, null, null, null, 'Transeo Pty'),
  ('EQ-02', 'Mula International',  'ES3848', 'Mula',        'International', null, null, null, 'Diésel', null, null, null, null, null, null, null, null, null, null, null, 'Transeo Pty'),
  ('EQ-03', 'Grúa roja',           'EO2142', 'Camión grúa', 'Peterbilt', '567', 2015, 'Blanco', 'Diésel', '1XPALA0X8MN802710', '1XPALA0X8MN802710',
            'Manual 10 velocidades', 6, 3, 3.70, 2.50, 11.30, 21.90, 12.34, 9.56, 'Transeo Pty'),
  ('EQ-04', 'Grúa blanca',         '689664', 'Camión grúa', 'Peterbilt', '320', null, null, 'Diésel', null, null, null, null, null, null, null, null, null, null, null, 'Transeo Pty'),
  ('EQ-05', 'Kia K2700 BD4520',    'BD4520', 'Camión',      'Kia', 'K2700', null, null, 'Diésel', null, null, null, null, null, null, null, null, null, null, null, 'Laura Veronika Pedroza Otalora'),
  ('EQ-06', 'Kia K2700 AF7004',    'AF7004', 'Camión',      'Kia', 'K2700', null, null, 'Diésel', null, null, null, null, null, null, null, null, null, null, null, 'Carlos Enrique Otalora Barbosa'),
  ('EQ-07', 'Pickup Rich6',        'ET1741', 'Pickup',      'Rich', '6', null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Transeo Pty'),
  ('EQ-08', 'Kia Picanto CS3527',  'CS3527', 'Automóvil',   'Kia', 'Picanto', null, null, 'Gasolina', null, null, null, null, null, null, null, null, null, null, null, 'Transeo Pty'),
  ('EQ-09', 'Kia Picanto CS3528',  'CS3528', 'Automóvil',   'Kia', 'Picanto', null, null, 'Gasolina', null, null, null, null, null, null, null, null, null, null, null, 'Transeo Pty'),
  ('EQ-10', 'Jetour',              'EW1546', 'SUV',         'Jetour', null, null, null, 'Gasolina', null, null, null, null, null, null, null, null, null, null, null, 'Transeo Pty');
