-- =====================================================================
--  TRANSEO PTY · Sistema de gestión de flota
--  002_ajustes.sql  ·  Decisiones del 28 de septiembre
--
--  Se corre UNA vez, después de 001_estructura.sql:
--  SQL Editor -> New query -> pegar -> Run.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. DOCUMENTOS: permiso de operación de la ATTT
-- ---------------------------------------------------------------------

alter table public.documentos drop constraint if exists documentos_tipo_check;
alter table public.documentos add constraint documentos_tipo_check
  check (tipo in ('Revisado','Póliza de seguro','Pesos y dimensiones','Permiso de operación',
                  'Registro de propiedad','Panapass','Otro'));


-- ---------------------------------------------------------------------
--  2. CONDUCTORES: la licencia va en la ficha del conductor
-- ---------------------------------------------------------------------

alter table public.conductores add column if not exists licencia_numero text;
alter table public.conductores add column if not exists licencia_ref text;


-- ---------------------------------------------------------------------
--  3. ÓRDENES: la compra no se envía a aprobar sin su cotización
-- ---------------------------------------------------------------------

alter table public.ordenes add column if not exists cotizacion_ref text;

create or replace function public.exigir_cotizacion()
returns trigger language plpgsql as $$
begin
  if new.tipo = 'Compra' and new.estado = 'Por aprobar' and coalesce(new.cotizacion_ref, '') = '' then
    raise exception 'La orden de compra necesita la cotización adjunta para enviarse a aprobar'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists cotizacion_obligatoria on public.ordenes;
create trigger cotizacion_obligatoria
  before insert or update on public.ordenes
  for each row execute function public.exigir_cotizacion();

-- Aprueban el Sr. Carlos (Gerencia) o Leidy (Contabilidad). Contabilidad ya
-- puede editar órdenes; la bitácora deja anotado quién aprobó y quién pagó.


-- ---------------------------------------------------------------------
--  4. MANTENIMIENTO PREVENTIVO: valores estándar por tipo de equipo
--  Se ajustan después en cada equipo, sin tocar la base.
-- ---------------------------------------------------------------------

create table if not exists public.plan_base (
  id          bigint generated always as identity primary key,
  tipo_equipo text not null,
  servicio    text not null,
  cada_km     int,
  cada_meses  int,
  orden       int not null default 0,
  unique (tipo_equipo, servicio)
);

create table if not exists public.plan_equipo (
  id           bigint generated always as identity primary key,
  equipo_id    bigint not null references public.equipos (id) on delete cascade,
  servicio     text not null,
  cada_km      int,
  cada_meses   int,
  ultimo_km    int,
  ultima_fecha date,
  activo       boolean not null default true,
  orden        int not null default 0,
  unique (equipo_id, servicio)
);

insert into public.plan_base (tipo_equipo, servicio, cada_km, cada_meses, orden)
select t.tipo, s.servicio, s.km, s.meses, s.orden
from (values ('Mula'), ('Camión grúa'), ('Camión')) as t(tipo)
cross join (values
  ('Cambio de aceite y filtro',   10000,  6, 1),
  ('Filtro de combustible',       20000, 12, 2),
  ('Filtro de aire',              20000, 12, 3),
  ('Engrase general',              5000,  3, 4),
  ('Revisión de frenos',          30000,  6, 5),
  ('Rotación y revisión de llantas', 15000, 6, 6),
  ('Refrigerante y mangueras',    40000, 12, 7)
) as s(servicio, km, meses, orden)
on conflict do nothing;

insert into public.plan_base (tipo_equipo, servicio, cada_km, cada_meses, orden) values
  ('Camión grúa', 'Servicio al sistema hidráulico y de izaje', null, 6, 8)
on conflict do nothing;

insert into public.plan_base (tipo_equipo, servicio, cada_km, cada_meses, orden)
select t.tipo, s.servicio, s.km, s.meses, s.orden
from (values ('Pickup'), ('Automóvil'), ('SUV')) as t(tipo)
cross join (values
  ('Cambio de aceite y filtro',    5000,  6, 1),
  ('Filtro de aire',              15000, 12, 2),
  ('Revisión de frenos',          20000, 12, 3),
  ('Rotación y revisión de llantas', 10000, 6, 4),
  ('Alineación y balanceo',       20000, 12, 5)
) as s(servicio, km, meses, orden)
on conflict do nothing;

-- cada equipo arranca con el plan de su tipo
insert into public.plan_equipo (equipo_id, servicio, cada_km, cada_meses, orden)
select e.id, p.servicio, p.cada_km, p.cada_meses, p.orden
from public.equipos e
join public.plan_base p on p.tipo_equipo = e.tipo
on conflict do nothing;

-- los equipos que se agreguen después también reciben su plan
create or replace function public.plan_para_equipo_nuevo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.plan_equipo (equipo_id, servicio, cada_km, cada_meses, orden)
  select new.id, p.servicio, p.cada_km, p.cada_meses, p.orden
  from public.plan_base p where p.tipo_equipo = new.tipo
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists plan_equipo_nuevo on public.equipos;
create trigger plan_equipo_nuevo
  after insert on public.equipos
  for each row execute function public.plan_para_equipo_nuevo();

-- lo que le toca a cada equipo: por km o por fecha, lo que llegue primero
create or replace view public.proximos_servicios with (security_invoker = true) as
select pe.id, pe.equipo_id, e.nombre as equipo, e.placa, pe.servicio, pe.cada_km, pe.cada_meses,
       pe.ultimo_km, pe.ultima_fecha,
       case when pe.ultimo_km is not null and pe.cada_km is not null then pe.ultimo_km + pe.cada_km end as proximo_km,
       case when pe.ultimo_km is not null and pe.cada_km is not null and e.km_actual is not null
            then pe.ultimo_km + pe.cada_km - e.km_actual end as km_restantes,
       case when pe.ultima_fecha is not null and pe.cada_meses is not null
            then (pe.ultima_fecha + make_interval(months => pe.cada_meses))::date end as proxima_fecha,
       pe.orden
from public.plan_equipo pe
join public.equipos e on e.id = pe.equipo_id
where pe.activo;


-- ---------------------------------------------------------------------
--  5. LÍNEA DE TIEMPO DE CADA EQUIPO
--  Todo lo que le pasó, en orden: la hoja de vida contada como historia.
-- ---------------------------------------------------------------------

create or replace view public.linea_tiempo with (security_invoker = true) as
  select equipo_id, fecha as fecha, 'Gasto' as tipo,
         coalesce(descripcion, beneficiario_nombre) || ' · ' || to_char(total, 'FM999,999,990.00') as texto
    from public.gastos where equipo_id is not null
  union all
  select equipo_id, subido_en::date, 'Documento',
         tipo || coalesce(' · vence ' || to_char(vence, 'DD/MM/YYYY'), ' · no vence')
    from public.documentos
  union all
  select equipo_id, creado_en::date, 'Falla', descripcion || ' · ' || estado
    from public.fallas
  union all
  select equipo_id, fecha, 'Inspección', 'Inspección ' || periodo || ' · ' || inspeccionado_por
    from public.inspecciones
  union all
  select equipo_id, fecha, 'Orden', numero || ' · ' || contraparte || ' · ' || to_char(total, 'FM999,999,990.00')
    from public.ordenes where equipo_id is not null and estado <> 'Anulada';


-- ---------------------------------------------------------------------
--  6. AVISOS: Cristi recibe, Leidy en copia
--  Los correos se escriben en Configuración cuando estén las cuentas.
-- ---------------------------------------------------------------------

update public.avisos_config set responsable_nombre = 'Cristeen Santos' where id = 1;


-- ---------------------------------------------------------------------
--  7. PERMISOS DE LAS TABLAS NUEVAS
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['plan_base','plan_equipo']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ver on public.%I', t);
    execute format('drop policy if exists crear on public.%I', t);
    execute format('drop policy if exists editar on public.%I', t);
    execute format('drop policy if exists borrar on public.%I', t);
    execute format('create policy ver on public.%I for select using (public.puede_ver())', t);
    execute format('create policy crear on public.%I for insert with check (public.puede_capturar())', t);
    execute format('create policy editar on public.%I for update using (public.puede_capturar()) with check (public.puede_capturar())', t);
    execute format('create policy borrar on public.%I for delete using (public.es_admin())', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
--  8. ALMACENAMIENTO DE IMÁGENES (Supabase Storage)
--  Privado: nadie las ve sin sesión. Se abren con un enlace temporal.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('documentos', 'documentos', false),
  ('capturas',   'capturas',   false),
  ('facturas',   'facturas',   false)
on conflict (id) do nothing;

drop policy if exists "transeo ver imagenes" on storage.objects;
drop policy if exists "transeo subir imagenes" on storage.objects;
drop policy if exists "transeo cambiar imagenes" on storage.objects;
drop policy if exists "transeo borrar imagenes" on storage.objects;

create policy "transeo ver imagenes" on storage.objects for select
  using (bucket_id in ('documentos','capturas','facturas') and public.puede_ver());
create policy "transeo subir imagenes" on storage.objects for insert
  with check (bucket_id in ('documentos','capturas','facturas') and public.puede_capturar());
create policy "transeo cambiar imagenes" on storage.objects for update
  using (bucket_id in ('documentos','capturas','facturas') and public.puede_capturar());
create policy "transeo borrar imagenes" on storage.objects for delete
  using (bucket_id in ('documentos','capturas','facturas') and public.es_admin());
