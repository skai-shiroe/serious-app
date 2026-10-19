-- Let mobile clients receive dashboard configuration changes immediately.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admin_app_settings'
  ) then
    alter publication supabase_realtime add table public.admin_app_settings;
  end if;
end
$$;
