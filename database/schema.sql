-- Minimal private social app schema for Supabase
-- Run this in Supabase SQL Editor

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  bio text,
  avatar_path text,
  created_at timestamptz not null default now()
);
create index if not exists idx_profiles_username on public.profiles using gin (username gin_trgm_ops);

-- Friendships
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  constraint no_self_friend check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);
-- Avoid duplicates regardless of request direction
create unique index if not exists friendships_pair_unique
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- Posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  content text,
  image_path text,
  created_at timestamptz not null default now()
);
create index if not exists idx_posts_author_created on public.posts(author_id, created_at desc);

-- Likes
create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Comments
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_post_created on public.comments(post_id, created_at);

-- Helper: are two users friends (accepted)
create or replace function public.is_friends(u1 uuid, u2 uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = u1 and f.addressee_id = u2)
        or (f.requester_id = u2 and f.addressee_id = u1))
  );
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;

-- Profiles policies
drop policy if exists "profiles_read_auth" on public.profiles;
create policy "profiles_read_auth" on public.profiles
for select to authenticated using (true);
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Friendships policies
drop policy if exists "friendships_read_participant" on public.friendships;
create policy "friendships_read_participant" on public.friendships
for select to authenticated using (
  requester_id = auth.uid() or addressee_id = auth.uid()
);
drop policy if exists "friendships_insert_requester" on public.friendships;
create policy "friendships_insert_requester" on public.friendships
for insert to authenticated with check (
  requester_id = auth.uid() and status = 'pending'
);
drop policy if exists "friendships_update_addressee_accept" on public.friendships;
create policy "friendships_update_addressee_accept" on public.friendships
for update to authenticated using (addressee_id = auth.uid()) with check (status in ('pending','accepted'));
drop policy if exists "friendships_delete_participant" on public.friendships;
create policy "friendships_delete_participant" on public.friendships
for delete to authenticated using (
  requester_id = auth.uid() or addressee_id = auth.uid()
);

-- Posts policies
drop policy if exists "posts_select_friends_or_self" on public.posts;
create policy "posts_select_friends_or_self" on public.posts
for select to authenticated using (
  author_id = auth.uid() or public.is_friends(auth.uid(), author_id)
);
drop policy if exists "posts_insert_self" on public.posts;
create policy "posts_insert_self" on public.posts
for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "posts_update_self" on public.posts;
create policy "posts_update_self" on public.posts
for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "posts_delete_self" on public.posts;
create policy "posts_delete_self" on public.posts
for delete to authenticated using (author_id = auth.uid());

-- Likes policies (simplified for better performance)
drop policy if exists "likes_select_authenticated" on public.likes;
create policy "likes_select_authenticated" on public.likes
for select to authenticated using (true);

drop policy if exists "likes_insert_self" on public.likes;
create policy "likes_insert_self" on public.likes
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "likes_delete_self" on public.likes;
create policy "likes_delete_self" on public.likes
for delete to authenticated using (user_id = auth.uid());

-- Comments policies
drop policy if exists "comments_select_when_can_read_post" on public.comments;
create policy "comments_select_when_can_read_post" on public.comments
for select to authenticated using (
  exists (
    select 1 from public.posts p
    where p.id = comments.post_id and (p.author_id = auth.uid() or public.is_friends(auth.uid(), p.author_id))
  )
);
drop policy if exists "comments_insert_self_when_can_read_post" on public.comments;
create policy "comments_insert_self_when_can_read_post" on public.comments
for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.posts p
    where p.id = comments.post_id and (p.author_id = auth.uid() or public.is_friends(auth.uid(), p.author_id))
  )
);
drop policy if exists "comments_delete_self" on public.comments;
create policy "comments_delete_self" on public.comments
for delete to authenticated using (user_id = auth.uid());

-- Storage buckets (private)
insert into storage.buckets (id, name, public)
values ('post-images','post-images', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
values ('avatars','avatars', false)
on conflict (id) do nothing;

-- Storage policies
-- Avatars: anyone authenticated can read; only owner can write files under their own prefix `${auth.uid()}/...`
drop policy if exists "avatars_read_auth" on storage.objects;
create policy "avatars_read_auth" on storage.objects
for select to authenticated using (bucket_id = 'avatars');
drop policy if exists "avatars_insert_own_prefix" on storage.objects;
create policy "avatars_insert_own_prefix" on storage.objects
for insert to authenticated with check (
  bucket_id = 'avatars' and name like auth.uid()::text || '/%'
);
drop policy if exists "avatars_update_own_prefix" on storage.objects;
create policy "avatars_update_own_prefix" on storage.objects
for update to authenticated using (
  bucket_id = 'avatars' and name like auth.uid()::text || '/%'
) with check (
  bucket_id = 'avatars' and name like auth.uid()::text || '/%'
);
drop policy if exists "avatars_delete_own_prefix" on storage.objects;
create policy "avatars_delete_own_prefix" on storage.objects
for delete to authenticated using (
  bucket_id = 'avatars' and name like auth.uid()::text || '/%'
);

-- Post images: read only if you can read the related post; owner writes under their own prefix
drop policy if exists "post_images_read_when_can_read_post" on storage.objects;
create policy "post_images_read_when_can_read_post" on storage.objects
for select to authenticated using (
  bucket_id = 'post-images' and exists (
    select 1 from public.posts p
    where p.image_path = storage.objects.name
      and (p.author_id = auth.uid() or public.is_friends(auth.uid(), p.author_id))
  )
);
drop policy if exists "post_images_insert_own_prefix" on storage.objects;
create policy "post_images_insert_own_prefix" on storage.objects
for insert to authenticated with check (
  bucket_id = 'post-images' and name like auth.uid()::text || '/%'
);
drop policy if exists "post_images_update_own_prefix" on storage.objects;
create policy "post_images_update_own_prefix" on storage.objects
for update to authenticated using (
  bucket_id = 'post-images' and name like auth.uid()::text || '/%'
) with check (
  bucket_id = 'post-images' and name like auth.uid()::text || '/%'
);
drop policy if exists "post_images_delete_own_prefix" on storage.objects;
create policy "post_images_delete_own_prefix" on storage.objects
for delete to authenticated using (
  bucket_id = 'post-images' and name like auth.uid()::text || '/%'
);

-- Realtime: add tables to publication (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'likes'
  ) then
    alter publication supabase_realtime add table public.likes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end $$;

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'username',''), 'user-' || left(new.id::text, 8)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Direct Messages Tables
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1 UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_2 UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(participant_1, participant_2),
  CHECK (participant_1 != participant_2)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- RLS Policies for DMs
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can only see conversations they're part of
CREATE POLICY "Users can view their conversations" ON conversations
  FOR SELECT USING (
    auth.uid() = participant_1 OR auth.uid() = participant_2
  );

-- Users can create conversations with friends only
CREATE POLICY "Users can create conversations with friends" ON conversations
  FOR INSERT WITH CHECK (
    auth.uid() = participant_1 AND
    EXISTS (
      SELECT 1 FROM friendships 
      WHERE status = 'accepted' 
      AND ((requester_id = auth.uid() AND addressee_id = participant_2) 
           OR (requester_id = participant_2 AND addressee_id = auth.uid()))
    )
  );

-- Users can view messages in their conversations
CREATE POLICY "Users can view messages in their conversations" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = conversation_id 
      AND (participant_1 = auth.uid() OR participant_2 = auth.uid())
    )
  );

-- Users can send messages in their conversations
CREATE POLICY "Users can send messages in their conversations" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = conversation_id 
      AND (participant_1 = auth.uid() OR participant_2 = auth.uid())
    )
  );

-- Users can update read status of messages sent to them
CREATE POLICY "Users can mark messages as read" ON messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = conversation_id 
      AND (participant_1 = auth.uid() OR participant_2 = auth.uid())
      AND sender_id != auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX idx_conversations_participants ON conversations(participant_1, participant_2);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_unread ON messages(conversation_id, read_at) WHERE read_at IS NULL;

-- Add DM tables to realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
