-- Keep every open Coaching feed synchronized with dashboard edits and deletes.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'coaching_posts'
  ) then
    alter publication supabase_realtime add table public.coaching_posts;
  end if;
end;
$$;
