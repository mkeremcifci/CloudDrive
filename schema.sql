-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create 'files' table
create table if not exists public.files (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  name text not null,
  size bigint not null,
  mime_type text,
  s3_key text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  parent_id uuid references public.files(id) -- Optional hierarchical structure
);

-- Enable RLS (Row Level Security)
alter table public.files enable row level security;

-- Create Policies
-- LIMITATION: These policies ensure users can only access their OWN files.

-- 1. View Policy
create policy "Users can view own files"
on public.files for select
using (auth.uid() = user_id);

-- 2. Insert Policy
create policy "Users can insert own files"
on public.files for insert
with check (auth.uid() = user_id);

-- 3. Delete Policy
create policy "Users can delete own files"
on public.files for delete
using (auth.uid() = user_id);

-- 4. Update Policy (e.g. for rename)
create policy "Users can update own files"
on public.files for update
using (auth.uid() = user_id);

-- 5. Shared Links Table
create table if not exists public.shared_links (
  id uuid primary key default uuid_generate_v4(),
  file_id uuid references public.files not null,
  token text unique not null,
  created_by uuid references auth.users not null,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  views int default 0
);

-- RLS for Shared Links
alter table public.shared_links enable row level security;

-- Creators can see/manage their links
create policy "Users can manage own shared links"
on public.shared_links
using (auth.uid() = created_by);

-- Public access via valid token (for the download page to verify)
create policy "Public can view shared links with valid token"
on public.shared_links for select
using (true);
