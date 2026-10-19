-- =============================================================
-- REFERENTIELS DYNAMIQUES (bloc 11)
-- A coller dans Supabase -> SQL Editor. Idempotent : re-executable
-- sans risque. Alimente l app (pays / villes / interets) et le
-- panneau admin (admin-web -> /referentiels).
--
-- Regles :
--  - lecture pour tout compte connecte (authenticated) ;
--  - ecriture UNIQUEMENT admin via is_admin() ;
--  - suppression DOUCE recommandee : passer is_active = false
--    (un intere/ville retire des listes mais conserve sur les
--    profils qui le referencent deja en text[]).
--  - Le telephone est saisi lors de la CREATION DU PROFIL
--    (drapeau + indicatif a gauche du champ), pas dans le
--    formulaire d inscription : d ou profiles.country_code /
--    profiles.phone_e164 ci-dessous.
-- =============================================================

-- 1) Colonnes profil : pays + telephone (E.164)
alter table public.profiles
  add column if not exists country_code text not null default 'TG',
  add column if not exists phone_e164 text;

comment on column public.profiles.country_code is
  'Pays du profil (meme code que countries.code). Decide la liste des villes proposees.';
comment on column public.profiles.phone_e164 is
  'Telephone au format E.164 (+228...), saisi en creation de profil.';

-- 2) Pays : drapeau, indicatif, longueur attendue du numero
create table if not exists public.countries (
  code text primary key,
  name text not null,
  dial_code text not null,
  flag text not null default '🏳️',
  min_digits int not null default 8,
  max_digits int not null default 10,
  is_active boolean not null default true,
  sort_order int not null default 100
);

insert into public.countries (code, name, dial_code, flag, min_digits, max_digits, sort_order)
values
  ('TG', 'Togo',           '+228', '🇹🇬', 8, 8,  10),
  ('BJ', 'Bénin',          '+229', '🇧🇯', 8, 10, 20),
  ('CI', 'Côte d''Ivoire', '+225', '🇨🇮', 8, 10, 30),
  ('CM', 'Cameroun',       '+237', '🇨🇲', 9, 9,  40)
on conflict (code) do nothing;

-- 3) Villes par pays (une seule graphie par ville et par pays)
create table if not exists public.cities (
  id bigint generated always as identity primary key,
  country_code text not null references public.countries (code) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (country_code, name)
);

insert into public.cities (country_code, name) values
  ('TG','Lomé'),('TG','Sokodé'),('TG','Kara'),('TG','Atakpamé'),('TG','Dapaong'),
  ('TG','Tsévié'),('TG','Aného'),('TG','Kpalimé'),('TG','Notsé'),('TG','Bassar'),
  ('TG','Amlamé'),('TG','Badou'),('TG','Bafilo'),('TG','Baguida'),('TG','Bohou'),
  ('TG','Cinkassé'),('TG','Danyi'),('TG','Kévé'),('TG','Kandé'),('TG','Kpagouda'),
  ('TG','Mango'),('TG','Niamtougou'),('TG','Pagouda'),('TG','Tchamba'),('TG','Vogan'),
  ('TG','Tabligbo'),('TG','Guérin-Kouka'),('TG','Kanté'),('TG','Mô'),('TG','Tandjouaré'),
  ('BJ','Cotonou'),('BJ','Porto-Novo'),('BJ','Parakou'),('BJ','Abomey'),('BJ','Bohicon'),
  ('BJ','Djougou'),('BJ','Natitingou'),('BJ','Lokossa'),('BJ','Ouidah'),('BJ','Kandi'),
  ('BJ','Comè'),('BJ','Allada'),('BJ','Savalou'),('BJ','Glazoué'),('BJ','Dogbo'),
  ('BJ','Kétou'),('BJ','Pobè'),('BJ','Sakété'),('BJ','Bassila'),('BJ','Banikoara'),
  ('BJ','Bopa'),('BJ','Sèmè-Kpodji'),('BJ','Toviklin'),('BJ','Segbana'),('BJ','Kouandé'),
  ('CI','Abidjan'),('CI','Yamoussoukro'),('CI','Bouaké'),('CI','San-Pédro'),('CI','Korhogo'),
  ('CI','Daloa'),('CI','Man'),('CI','Gagnoa'),('CI','Katiola'),('CI','Abengourou'),
  ('CI','Anyama'),('CI','Divo'),('CI','Grand-Bassam'),('CI','Touba'),('CI','Odienné'),
  ('CI','Ferkessédougou'),('CI','Biankouma'),('CI','Guiglo'),('CI','Duékoué'),('CI','Soubré'),
  ('CI','Aboisso'),('CI','Adzopé'),('CI','Akoupé'),('CI','Tingrela'),('CI','Boundiali')
  ,('CM','Yaoundé'),('CM','Douala'),('CM','Garoua'),('CM','Bamenda'),('CM','Maroua')
  ,('CM','Bafoussam'),('CM','Ngaoundéré'),('CM','Bertoua'),('CM','Buea'),('CM','Limbe')
  ,('CM','Ebolowa'),('CM','Kribi'),('CM','Dschang'),('CM','Foumban'),('CM','Kumba')
  ,('CM','Edéa'),('CM','Nkongsamba'),('CM','Sangmélima')
on conflict do nothing;


-- 4) Interets (le profil stocke le LABEL dans profiles.interests text[])
create table if not exists public.interests (
  id bigint generated always as identity primary key,
  label text not null,
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

-- Unicite insensible a la casse : « Sport » et « sport » sont le meme interet.
create unique index if not exists interests_label_uniq
  on public.interests (lower(label));

insert into public.interests (label, sort_order)
values
  ('Sport',10),('Voyage',20),('Musique',30),('Cinéma',40),('Lecture',50),
  ('Cuisine',60),('Art',70),('Jeux vidéo',80),('Technologie',90),('Nature',100),
  ('Photographie',110),('Mode',120),('Animaux',130),('Fitness',140),('Danse',150)
on conflict do nothing;

-- 5) RLS : lecture pour tout compte connecte, ecriture admin uniquement.
alter table public.countries enable row level security;
alter table public.cities enable row level security;
alter table public.interests enable row level security;

drop policy if exists countries_select on public.countries;
create policy countries_select on public.countries
  for select to authenticated using (true);
drop policy if exists countries_admin on public.countries;
create policy countries_admin on public.countries
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists cities_select on public.cities;
create policy cities_select on public.cities
  for select to authenticated using (true);
drop policy if exists cities_admin on public.cities;
create policy cities_admin on public.cities
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists interests_select on public.interests;
create policy interests_select on public.interests
  for select to authenticated using (true);
drop policy if exists interests_admin on public.interests;
create policy interests_admin on public.interests
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 6) Droits : select ouvert (les libs ont un repli offline de toute facon) ;
--    insert/update/delete filtre par les policies admin ci-dessus.
grant select on public.countries, public.cities, public.interests to anon;
grant insert, update, delete on public.countries, public.cities, public.interests to authenticated;
