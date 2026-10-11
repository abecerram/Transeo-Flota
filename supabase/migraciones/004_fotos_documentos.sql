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
