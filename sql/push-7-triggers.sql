-- =============================================================
-- NOTIFICATIONS - BLOC 7 : TRIGGERS (1/3)
-- A coller APRES le bloc 6, et APRES avoir supprime les 3
-- Database Webhooks "notify-*" (Dashboard > Database > Webhooks),
-- sinon chaque evenement partirait deux fois.
-- =============================================================

-- 7.1 MATCH : les deux utilisateurs sont prevenus
create or replace function public.notify_new_match()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_t1 text; v_n1 text; v_t2 text; v_n2 text;
begin
  select push_token, first_name into v_t1, v_n1
    from public.profiles where user_id = new.user_id_1;
  select push_token, first_name into v_t2, v_n2
    from public.profiles where user_id = new.user_id_2;

  perform public.send_push(
    array[v_t1], '🎉 Nouveau Match !',
    'Vous avez un nouveau match avec ' || coalesce(v_n2, 'quelqu''un') || ' !',
    jsonb_build_object('type', 'match'), 'matches', 'high');

  perform public.send_push(
    array[v_t2], '🎉 Nouveau Match !',
    'Vous avez un nouveau match avec ' || coalesce(v_n1, 'quelqu''un') || ' !',
    jsonb_build_object('type', 'match'), 'matches', 'high');
  return new;
end $$;

-- 7.2 MESSAGE : seul le destinataire est prevenu (jamais l'emetteur).
-- Le contenu n'est PAS mis dans la notification (verrouille l'ecran) :
-- meme comportement que l'ancienne Edge Function notify-message.
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
    coalesce(v_name, 'Quelqu''un') || ' vous a envoyé un message',
    jsonb_build_object('type', 'message', 'match_id', new.match_id),
    'messages', 'high');
  return new;
end $$;

-- SUITE : bloc 7 (2/3) coaching + verification
-- -------------------------------------------------------------
-- 7.3 POST COACHING : broadcast a tous les tokens (decoupe auto par
--     100 dans send_push). Seuls admin/manager publient -> pas de spam.
create or replace function public.notify_new_coaching_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tokens text[];
begin
  select public.tokens_for(array_agg(p.user_id)) into v_tokens
    from public.profiles p;

  perform public.send_push(
    v_tokens,
    '✨ Nouveau conseil de coaching',
    coalesce(nullif(new.title, ''), 'Un nouveau conseil vient d''être publié'),
    jsonb_build_object('type', 'coaching', 'id', new.id),
    'coaching', 'default');
  return new;
end $$;

-- 7.4 DECISION DE VERIFICATION : migration du bloc 5 vers send_push
--     (meme libelles, meme canal, mais journalise + priorite geree).
create or replace function public.notify_verification_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_token text; v_label text; v_status text;
begin
  if new.status = old.status or new.status not in ('approved', 'rejected') then
    return new;
  end if;

  select push_token into v_token from public.profiles where user_id = new.user_id;
  if v_token is null or v_token = '' then
    return new;                       -- pas de token : on saute
  end if;

  v_label  := case new.type when 'identity' then 'Pièce d''identité' else 'Génotype' end;
  v_status := case when new.status = 'approved' then 'validée' else 'refusée' end;

  perform public.send_push(
    array[v_token],
    v_label || ' ' || v_status,
    case when new.status = 'approved'
         then 'Votre vérification a été validée. Merci !'
         else coalesce(new.rejection_reason, 'Votre document n''a pas pu être validé.') end,
    jsonb_build_object('type', 'verification', 'status', new.status),
    'verifications', 'default');
  return new;
end $$;

-- 7.5 COMMENTAIRE : prevenir l'auteur du post (pas d'auto-notif).
--     user_id null = ancien post cree avant le bloc 6 : rien n'est envoye.
create or replace function public.notify_coaching_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_token text; v_name text;
begin
  select user_id into v_author from public.coaching_posts where id = new.post_id;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;

  select push_token into v_token from public.profiles where user_id = v_author;
  if v_token is null or v_token = '' then
    return new;
  end if;

  -- 1 notification par post et par heure : 50 commentaires != 50 pushes
  if not public.push_allowed(v_author, 'coaching_comment',
                             new.post_id::text, interval '1 hour') then
    return new;
  end if;

  select first_name into v_name from public.profiles where user_id = new.user_id;

  perform public.send_push(
    array[v_token], '💬 Nouveau commentaire',
    coalesce(v_name, 'Quelqu''un') || ' a commenté votre conseil',
    jsonb_build_object('type', 'coaching', 'id', new.post_id),
    'coaching', 'default');
  return new;
end $$;

-- 7.6 LIKE DE POST : idem, mais fenetre de 30 min (les likes arrivent
--     en rafale ; on ne veut pas inonder l'auteur).
create or replace function public.notify_coaching_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_token text; v_name text;
begin
  select user_id into v_author from public.coaching_posts where id = new.post_id;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;

  select push_token into v_token from public.profiles where user_id = v_author;
  if v_token is null or v_token = '' then
    return new;
  end if;

  if not public.push_allowed(v_author, 'coaching_like',
                             new.post_id::text, interval '30 minutes') then
    return new;
  end if;

  select first_name into v_name from public.profiles where user_id = new.user_id;

  perform public.send_push(
    array[v_token], '👍 Nouveau like',
    coalesce(v_name, 'Quelqu''un') || ' a aimé votre conseil',
    jsonb_build_object('type', 'coaching', 'id', new.post_id),
    'coaching', 'default');
  return new;
end $$;

-- SUITE : bloc 7 (3/3) swipe + admin + DDL des triggers
-- -------------------------------------------------------------
-- 7.7 LIKE DE SWIPE : notification ANONYME (pas de prénom avant le
--     match : evite le harcement). Tous les likes recus sont regroupes
--     (1 push par heure maximum) via la cle fixe 'any'.
create or replace function public.notify_swipe_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if new.direction is distinct from 'like' then
    return new;
  end if;

  select push_token into v_token from public.profiles where user_id = new.swiped_id;
  if v_token is null or v_token = '' then
    return new;
  end if;

  if not public.push_allowed(new.swiped_id, 'swipe_like', 'any', interval '1 hour') then
    return new;
  end if;

  perform public.send_push(
    array[v_token],
    '💖 Quelqu''un vous a liké',
    'Retournez dans « Découvrir » pour voir qui s''intéresse à vous',
    jsonb_build_object('type', 'swipe_like'),
    'matches', 'high');
  return new;
end $$;

-- 7.8 NOUVELLE DEMANDE DE VERIFICATION : prevenir les admins/managers
--     (la file d'attente etait invisible tant qu'on n'ouvrait pas l'ecran).
create or replace function public.notify_verification_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tokens text[];
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  select public.tokens_for(array_agg(p.user_id)) into v_tokens
    from public.profiles p
   where p.role in ('admin', 'manager')
     and p.user_id <> new.user_id;          -- jamais l'auteur de la demande

  perform public.send_push(
    v_tokens,
    '🛡️ Nouvelle vérification à traiter',
    'Une demande de vérification attend votre revue.',
    jsonb_build_object('type', 'admin_verification'),
    'verifications', 'high');
  return new;
end $$;

-- -------------------------------------------------------------
-- POSE DES TRIGGERS (idempotent : drop puis create)
-- -------------------------------------------------------------
drop trigger if exists on_match_created on public.matches;
create trigger on_match_created after insert on public.matches
for each row execute function public.notify_new_match();

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created after insert on public.messages
for each row execute function public.notify_new_message();

drop trigger if exists on_coaching_post_created on public.coaching_posts;
create trigger on_coaching_post_created after insert on public.coaching_posts
for each row execute function public.notify_new_coaching_post();

drop trigger if exists on_verification_reviewed on public.verifications;
create trigger on_verification_reviewed after update on public.verifications
for each row execute function public.notify_verification_status();

drop trigger if exists on_verification_submitted on public.verifications;
create trigger on_verification_submitted after insert on public.verifications
for each row execute function public.notify_verification_submitted();

drop trigger if exists on_comment_created on public.coaching_comments;
create trigger on_comment_created after insert on public.coaching_comments
for each row execute function public.notify_coaching_comment();

drop trigger if exists on_post_like_created on public.coaching_likes;
create trigger on_post_like_created after insert on public.coaching_likes
for each row execute function public.notify_coaching_like();

drop trigger if exists on_swipe_created on public.swipes;
create trigger on_swipe_created after insert on public.swipes
for each row execute function public.notify_swipe_like();

-- -------------------------------------------------------------
-- Verification : 8 triggers attendus
-- -------------------------------------------------------------
do $$
declare v_count integer;
begin
  select count(*) into v_count
    from pg_trigger
   where not tgisinternal
     and tgname in ('on_match_created', 'on_message_created',
                    'on_coaching_post_created', 'on_verification_reviewed',
                    'on_verification_submitted', 'on_comment_created',
                    'on_post_like_created', 'on_swipe_created');
  raise notice 'triggers de notification poses : % / 8', v_count;
end $$;

