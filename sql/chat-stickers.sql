-- ═══ Chat : stickers (les émojis sont déjà du texte, sans migration) ═══
-- A coller dans l'éditeur SQL Supabase. Sans casse : la colonne type a une
-- valeur par défaut, et l'app sait fonctionner AVANT comme APRÈS cette
-- migration (repli automatique sur « sticker:<nom> » dans content).

-- 1. Colonne type sur messages ------------------------------------------------
alter table public.messages
  add column if not exists type text not null default 'text';

comment on column public.messages.type is
  'text (défaut) | sticker — un sticker stocke « sticker:<nom> » dans content.';

-- 2. RPC get_last_messages : retourne aussi type (aperçu « 🎏 Sticker ») -------
--    Sans ça, la liste afficherait le contenu brut « sticker:joy ».
--    drop obligatoire : create or replace ne peut PAS changer le type de
--    retour d'une fonction existante.
drop function if exists public.get_last_messages(uuid[]);

create function public.get_last_messages(match_ids uuid[])
returns table (match_id uuid, content text, created_at timestamptz, sender_id uuid, type text)
language sql stable as $$
  select distinct on (m.match_id) m.match_id, m.content, m.created_at, m.sender_id, m.type
  from public.messages m
  where m.match_id = any(match_ids)
  order by m.match_id, m.created_at desc;
$$;

-- 3. Notification de message : libellé dédié pour les stickers ----------------
create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_match     record;
  v_recipient uuid;
  v_token     text;
  v_name      text;
begin
  select m.user_id_1, m.user_id_2 into v_match
    from public.matches m where m.id = new.match_id;
  if not found then
    return new;
  end if;

  v_recipient := case when v_match.user_id_1 = new.sender_id
                      then v_match.user_id_2
                      else v_match.user_id_1 end;
  if v_recipient is null or v_recipient = new.sender_id then
    return new;
  end if;

  select push_token, first_name into v_token, v_name
    from public.profiles where user_id = new.sender_id;
  if v_token is null or v_token = '' then
    return new;
  end if;

  -- rafale : une seule notification par conversation toutes les 30 s
  if not public.push_allowed(v_recipient, 'message_burst',
                             new.match_id::text, interval '30 seconds') then
    return new;
  end if;

  perform public.send_push(
    array[v_token], '💬 Nouveau message',
    case when new.type = 'sticker'
         then coalesce(v_name, 'Quelqu''un') || ' vous a envoyé un sticker 🎏'
         else coalesce(v_name, 'Quelqu''un') || ' vous a envoyé un message'
    end,
    jsonb_build_object('type', 'message', 'match_id', new.match_id),
    'messages', 'high');
  return new;
end $$;

-- 4. Contrôle -----------------------------------------------------------------
do $$
begin
  raise notice 'colonne messages.type : %',
    (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'messages' and column_name = 'type');
  raise notice 'RPC get_last_messages : %',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.proname = 'get_last_messages' and n.nspname = 'public');
  raise notice 'trigger on_message_created toujours actif : %',
    (select count(*) from pg_trigger
      where tgrelid = 'public.messages'::regclass and tgname = 'on_message_created'
        and not tgisinternal);
end $$;
