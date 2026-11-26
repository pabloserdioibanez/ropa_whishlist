-- Un solo armario sin autenticación. Todo el contenido y las operaciones son públicos.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default '00000000-0000-0000-0000-000000000001',
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9_]{2,30}$'),
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  avatar_path text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_id_owner_key unique (id, owner_id)
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default '00000000-0000-0000-0000-000000000001',
  profile_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  cover_path text,
  sort_order integer not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint sections_id_profile_owner_key unique (id, profile_id, owner_id),
  constraint sections_profile_owner_fk
    foreign key (profile_id, owner_id)
    references public.profiles (id, owner_id) on delete cascade
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default '00000000-0000-0000-0000-000000000001',
  profile_id uuid not null,
  section_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  garment_type text not null default 'Sin especificar' check (char_length(trim(garment_type)) between 1 and 80),
  color text check (color is null or char_length(trim(color)) <= 80),
  size text check (size is null or char_length(trim(size)) <= 40),
  purchase_url text check (purchase_url is null or purchase_url ~* '^https?://'),
  price numeric(10,2) check (price is null or price >= 0),
  description text check (description is null or char_length(description) <= 4000),
  is_favorite boolean not null default false,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  constraint items_id_owner_key unique (id, owner_id),
  constraint items_section_profile_owner_fk
    foreign key (section_id, profile_id, owner_id)
    references public.sections (id, profile_id, owner_id) on delete cascade
);

create table if not exists public.item_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default '00000000-0000-0000-0000-000000000001',
  item_id uuid not null,
  storage_path text not null unique,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint item_images_item_owner_fk
    foreign key (item_id, owner_id)
    references public.items (id, owner_id) on delete cascade
);

create table if not exists public.app_settings (
  owner_id uuid not null default '00000000-0000-0000-0000-000000000001',
  setting_key text not null check (char_length(setting_key) <= 80),
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_id, setting_key)
);

alter table public.profiles add column if not exists avatar_path text;
alter table public.items add column if not exists garment_type text not null default 'Sin especificar';
alter table public.items add column if not exists color text;
alter table public.items add column if not exists size text;

do $$
declare
  fk record;
  policy record;
begin
  for fk in
    select conrelid::regclass as relation_name, conname
    from pg_constraint
    where contype = 'f'
      and confrelid = 'auth.users'::regclass
      and conrelid in ('public.profiles'::regclass, 'public.app_settings'::regclass)
  loop
    execute format('alter table %s drop constraint %I', fk.relation_name, fk.conname);
  end loop;

  for policy in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'sections', 'items', 'item_images', 'app_settings')
  loop
    execute format('drop policy %I on public.%I', policy.policyname, policy.tablename);
  end loop;
end;
$$;

alter table public.profiles alter column owner_id set default '00000000-0000-0000-0000-000000000001';
alter table public.sections alter column owner_id set default '00000000-0000-0000-0000-000000000001';
alter table public.items alter column owner_id set default '00000000-0000-0000-0000-000000000001';
alter table public.item_images alter column owner_id set default '00000000-0000-0000-0000-000000000001';
alter table public.app_settings alter column owner_id set default '00000000-0000-0000-0000-000000000001';
create unique index if not exists profiles_owner_id_unique on public.profiles(owner_id);

alter table public.profiles enable row level security;
alter table public.sections enable row level security;
alter table public.items enable row level security;
alter table public.item_images enable row level security;
alter table public.app_settings enable row level security;

grant select, insert, update, delete on public.profiles, public.sections, public.items, public.item_images, public.app_settings to anon, authenticated;

create policy "Anyone manages profiles" on public.profiles
  for all to anon, authenticated using (true) with check (true);
create policy "Anyone manages sections" on public.sections
  for all to anon, authenticated using (true) with check (true);
create policy "Anyone manages items" on public.items
  for all to anon, authenticated using (true) with check (true);
create policy "Anyone manages item images" on public.item_images
  for all to anon, authenticated using (true) with check (true);
create policy "Anyone manages settings" on public.app_settings
  for all to anon, authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wardrobe-images', 'wardrobe-images', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

grant select, insert, update, delete on storage.objects to anon, authenticated;

do $$
declare
  policy record;
begin
  for policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') like '%wardrobe-images%'
        or coalesce(with_check, '') like '%wardrobe-images%'
      )
  loop
    execute format('drop policy %I on storage.objects', policy.policyname);
  end loop;
end;
$$;

create policy "Anyone reads wardrobe images" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'wardrobe-images');
create policy "Anyone uploads wardrobe images" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'wardrobe-images');
create policy "Anyone updates wardrobe images" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'wardrobe-images')
  with check (bucket_id = 'wardrobe-images');
create policy "Anyone deletes wardrobe images" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'wardrobe-images');
