-- Remove self-referencing hierarchy policies. Referencing nbgs or zones from
-- their own SELECT policy causes PostgreSQL to recursively evaluate that
-- policy when PostgREST embeds the hierarchy in ticket queries.

drop policy if exists "nbgs_scope_read" on public.nbgs;
create policy "nbgs_scope_read" on public.nbgs
  for select to authenticated
  using (
    (select public.current_user_role()) = 'head_office'
    or (
      (select public.current_user_role()) = 'nbg'
      and id = (
        select p.nbg_id
        from public.profiles as p
        where p.id = (select auth.uid())
      )
    )
  );

drop policy if exists "zones_scope_read" on public.zones;
create policy "zones_scope_read" on public.zones
  for select to authenticated
  using (
    (select public.current_user_role()) = 'head_office'
    or (
      (select public.current_user_role()) = 'nbg'
      and nbg_id = (
        select p.nbg_id
        from public.profiles as p
        where p.id = (select auth.uid())
      )
    )
    or (
      (select public.current_user_role()) = 'zonal'
      and id = (
        select p.zone_id
        from public.profiles as p
        where p.id = (select auth.uid())
      )
    )
  );
