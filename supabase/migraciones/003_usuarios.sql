-- =====================================================================
--  TRANSEO PTY · Sistema de gestión de flota
--  003_usuarios.sql  ·  Administración de usuarios
--
--  Como en el sistema de Apps Script: el administrador crea al usuario,
--  el sistema le da una clave temporal, la persona la cambia al entrar.
--  Se corre UNA vez, después de 002_ajustes.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. DATOS NUEVOS DEL PERFIL
-- ---------------------------------------------------------------------

alter table public.perfiles add column if not exists cedula text;
alter table public.perfiles add column if not exists celular text;
alter table public.perfiles add column if not exists clave_temporal boolean not null default false;


-- ---------------------------------------------------------------------
--  2. INTENTOS FALLIDOS, EN EL SERVIDOR
--  Al tercer intento la cuenta queda bloqueada en cualquier equipo,
--  y se abre con el código al correo o con el administrador.
-- ---------------------------------------------------------------------

create table if not exists public.intentos_acceso (
  correo    text primary key,
  intentos  int not null default 0,
  ultimo    timestamptz not null default now(),
  bloqueado boolean not null default false
);
alter table public.intentos_acceso enable row level security;
-- sin políticas: solo se toca con las funciones de abajo

create or replace function public.registrar_intento_fallido(p_correo text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from perfiles where lower(correo) = lower(trim(p_correo))) then
    return 3;
  end if;
  insert into intentos_acceso (correo, intentos, ultimo, bloqueado)
  values (lower(trim(p_correo)), 1, now(), false)
  on conflict (correo) do update
    set intentos = intentos_acceso.intentos + 1, ultimo = now(),
        bloqueado = intentos_acceso.intentos + 1 >= 3
  returning intentos into n;
  return greatest(0, 3 - n);
end $$;

create or replace function public.correo_bloqueado(p_correo text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select bloqueado from intentos_acceso where correo = lower(trim(p_correo))), false)
$$;

-- se llama al entrar bien: limpia los intentos de quien entró
create or replace function public.limpiar_intentos()
returns void language sql security definer set search_path = public as $$
  delete from intentos_acceso
  where correo = (select lower(email) from auth.users where id = auth.uid())
$$;

-- el administrador desbloquea a alguien
create or replace function public.admin_desbloquear(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then raise exception 'Solo el administrador puede desbloquear usuarios' using errcode = 'P0001'; end if;
  delete from intentos_acceso where correo = (select lower(correo) from perfiles where id = p_id);
  insert into bitacora (tabla, registro, accion, usuario) values ('perfiles', p_id::text, 'DESBLOQUEO', auth.uid());
end $$;

-- quien entra con clave temporal y la cambia
create or replace function public.marcar_clave_cambiada()
returns void language sql security definer set search_path = public as $$
  update perfiles set clave_temporal = false where id = auth.uid()
$$;

grant execute on function public.registrar_intento_fallido(text) to anon, authenticated;
grant execute on function public.correo_bloqueado(text) to anon, authenticated;
grant execute on function public.limpiar_intentos() to authenticated;
grant execute on function public.admin_desbloquear(uuid) to authenticated;
grant execute on function public.marcar_clave_cambiada() to authenticated;


-- ---------------------------------------------------------------------
--  3. LISTA DE USUARIOS PARA EL ADMINISTRADOR
--  Con el último acceso y si está bloqueado.
-- ---------------------------------------------------------------------

create or replace function public.admin_usuarios()
returns table (id uuid, correo text, nombre text, rol text, activo boolean, cedula text, celular text,
               clave_temporal boolean, bloqueado boolean, ultimo_acceso timestamptz, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.correo, p.nombre, p.rol, p.activo, p.cedula, p.celular, p.clave_temporal,
         coalesce(ia.bloqueado, false), u.last_sign_in_at, p.creado_en
  from perfiles p
  join auth.users u on u.id = p.id
  left join intentos_acceso ia on ia.correo = lower(p.correo)
  where es_admin()
  order by p.creado_en
$$;
grant execute on function public.admin_usuarios() to authenticated;


-- ---------------------------------------------------------------------
--  4. PROTECCIONES
--  Nadie se quita a sí mismo el perfil de administrador ni se desactiva,
--  y siempre queda al menos un administrador activo.
-- ---------------------------------------------------------------------

create or replace function public.proteger_administradores()
returns trigger language plpgsql security definer set search_path = public as $$
declare otros int;
begin
  if tg_op = 'UPDATE' then
    if old.id = auth.uid() and old.rol = 'Administrador' and (new.rol <> 'Administrador' or not new.activo) then
      raise exception 'No puede quitarse a usted mismo el perfil de Administrador ni desactivarse' using errcode = 'P0001';
    end if;
    if old.rol = 'Administrador' and old.activo and (new.rol <> 'Administrador' or not new.activo) then
      select count(*) into otros from perfiles where rol = 'Administrador' and activo and id <> old.id;
      if otros = 0 then raise exception 'Debe quedar al menos un administrador activo' using errcode = 'P0001'; end if;
    end if;
    return new;
  end if;
  -- borrar
  if old.id = auth.uid() then raise exception 'No puede borrarse a usted mismo' using errcode = 'P0001'; end if;
  if old.rol = 'Administrador' and old.activo then
    select count(*) into otros from perfiles where rol = 'Administrador' and activo and id <> old.id;
    if otros = 0 then raise exception 'No puede borrar al único administrador activo' using errcode = 'P0001'; end if;
  end if;
  return old;
end $$;

drop trigger if exists proteger_admin on public.perfiles;
create trigger proteger_admin
  before update or delete on public.perfiles
  for each row execute function public.proteger_administradores();
