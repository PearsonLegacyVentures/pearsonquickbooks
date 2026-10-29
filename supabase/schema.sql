-- Pearson QuickBooks / Invoice Studio — isolated workspaces and authenticated members.
-- Apply to a NEW dedicated Supabase project. Never apply to another venture's DB.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique check (username is null or username ~ '^[a-z0-9_]{3,24}$'),
 display_name text not null default '',
 created_at timestamptz not null default now()
);
create table if not exists public.workspaces (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 name text not null check (length(trim(name)) between 1 and 120),
 data jsonb not null default '{}'::jsonb,
 revision bigint not null default 0 check (revision >= 0),
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create table if not exists public.workspace_members (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('owner','admin','editor','viewer')),
 joined_at timestamptz not null default now(),
 primary key (workspace_id, user_id)
);
create table if not exists public.workspace_invites (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 email text not null,
 role text not null check (role in ('admin','editor','viewer')),
 token_hash text unique not null,
 expires_at timestamptz not null default now() + interval '7 days',
 accepted_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists private.login_rate_limits (
 bucket text primary key,
 attempt_count integer not null default 0,
 window_started timestamptz not null default now()
);
create index if not exists idx_members_user on public.workspace_members(user_id);
create index if not exists idx_workspaces_owner_id on public.workspaces(owner_id);
create index if not exists idx_workspace_invites_created_by on public.workspace_invites(created_by);
create index if not exists idx_invites_workspace on public.workspace_invites(workspace_id, expires_at);

create or replace function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles (id, display_name) values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name',''),120)) on conflict(id) do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created_invoice_studio on auth.users;
create trigger on_auth_user_created_invoice_studio after insert on auth.users for each row execute function private.create_profile();

create or replace function private.add_owner_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.workspace_members (workspace_id,user_id,role) values (new.id,new.owner_id,'owner');
 return new;
end $$;
drop trigger if exists workspace_owner_membership on public.workspaces;
create trigger workspace_owner_membership after insert on public.workspaces for each row execute function private.add_owner_membership();

create or replace function private.is_member(p_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=(select auth.uid()));
$$;
create or replace function private.can_edit(p_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=(select auth.uid()) and role in ('owner','admin','editor'));
$$;
create or replace function private.can_manage(p_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=(select auth.uid()) and role in ('owner','admin'));
$$;
create or replace function private.shared_workspace(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user=(select auth.uid()) or exists (
   select 1 from public.workspace_members a join public.workspace_members b using (workspace_id)
   where a.user_id=(select auth.uid()) and b.user_id=p_user
 );
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

revoke all on public.profiles,public.workspaces,public.workspace_members,public.workspace_invites from anon,authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles,public.workspaces,public.workspace_members,public.workspace_invites to authenticated;
grant insert(id,owner_id,name,data) on public.workspaces to authenticated;
-- only names/profile fields, never authorization claims, are editable from frontend.
grant update(username,display_name) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated using (private.shared_workspace(id));
create policy profiles_update on public.profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy workspaces_select on public.workspaces for select to authenticated using (private.is_member(id));
create policy workspaces_insert on public.workspaces for insert to authenticated with check (owner_id=(select auth.uid()) and data ? 'business');
create policy members_select on public.workspace_members for select to authenticated using (private.is_member(workspace_id));
create policy invites_select on public.workspace_invites for select to authenticated using (private.can_manage(workspace_id));

create or replace function public.commit_workspace(p_workspace_id uuid, p_expected_revision bigint, p_payload jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare n bigint; label text;
begin
 if (select auth.uid()) is null or not private.can_edit(p_workspace_id) then raise exception 'Not permitted'; end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' or
    jsonb_typeof(p_payload->'business') <> 'object' or
    jsonb_typeof(p_payload->'customers') <> 'array' or
    jsonb_typeof(p_payload->'items') <> 'array' or
    jsonb_typeof(p_payload->'documents') <> 'array' or
    jsonb_typeof(p_payload->'expenses') <> 'array' or
    octet_length(p_payload::text)>4000000 then
    raise exception 'Invalid or oversized workspace payload';
 end if;
 label := left(trim(coalesce(p_payload->'business'->>'name','')),120);
 if length(label)<1 then raise exception 'Business name required'; end if;
 update public.workspaces set data=p_payload, revision=revision+1, updated_at=now(), name=label
 where id=p_workspace_id and revision=p_expected_revision returning revision into n;
 if n is null then raise exception 'STALE_WRITE'; end if;
 return n;
end $$;

create or replace function public.create_workspace_invite(p_workspace_id uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path='' as $$
declare token text;
begin
 if (select auth.uid()) is null or not private.can_manage(p_workspace_id) then raise exception 'Not permitted'; end if;
 if p_role not in ('admin','editor','viewer') then raise exception 'Invalid role'; end if;
 if length(trim(p_email))>254 or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
 token := encode(extensions.gen_random_bytes(32),'hex');
 insert into public.workspace_invites (workspace_id,email,role,token_hash,created_by)
 values (p_workspace_id,lower(trim(p_email)),p_role,encode(extensions.digest(token,'sha256'),'hex'),(select auth.uid()));
 return token;
end $$;

create or replace function public.accept_workspace_invite(p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare invite public.workspace_invites%rowtype; target_email text;
begin
 if (select auth.uid()) is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation'; end if;
 select lower(email) into target_email from auth.users where id=(select auth.uid()) and email_confirmed_at is not null;
 if target_email is null then raise exception 'Verify your email before accepting an invitation'; end if;
 select * into invite from public.workspace_invites
 where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and accepted_at is null and expires_at>now() for update;
 if not found or invite.email<>target_email then raise exception 'Invitation invalid, expired or belongs to another email'; end if;
 insert into public.workspace_members (workspace_id,user_id,role) values(invite.workspace_id,(select auth.uid()),invite.role)
 on conflict(workspace_id,user_id) do nothing;
 update public.workspace_invites set accepted_at=now() where id=invite.id;
 return invite.workspace_id;
end $$;

create or replace function public.remove_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not private.can_manage(p_workspace_id) then raise exception 'Not permitted'; end if;
 if exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then raise exception 'Cannot remove owner'; end if;
 delete from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id;
end $$;

create or replace function public.lookup_username_email(p_username text)
returns text language sql security definer set search_path='' as $$
 select u.email from public.profiles p join auth.users u on u.id=p.id
 where p.username=lower(p_username) and u.email_confirmed_at is not null limit 1;
$$;
create or replace function public.record_login_attempt(p_bucket text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n int;
begin
 if length(p_bucket)>160 or length(p_bucket)<16 then return false; end if;
 insert into private.login_rate_limits (bucket,attempt_count,window_started) values(p_bucket,1,now())
 on conflict(bucket) do update set attempt_count=case when private.login_rate_limits.window_started<now()-interval '15 minutes' then 1 else private.login_rate_limits.attempt_count+1 end,
 window_started=case when private.login_rate_limits.window_started<now()-interval '15 minutes' then now() else private.login_rate_limits.window_started end
 returning attempt_count into n;
 return n<=5;
end $$;

revoke all on function public.commit_workspace(uuid,bigint,jsonb),public.create_workspace_invite(uuid,text,text),public.accept_workspace_invite(text),public.remove_workspace_member(uuid,uuid) from public,anon;
grant execute on function public.commit_workspace(uuid,bigint,jsonb),public.create_workspace_invite(uuid,text,text),public.accept_workspace_invite(text),public.remove_workspace_member(uuid,uuid) to authenticated;
revoke all on function public.lookup_username_email(text),public.record_login_attempt(text) from public,anon,authenticated;
grant execute on function public.lookup_username_email(text),public.record_login_attempt(text) to service_role;
revoke all on function private.is_member(uuid),private.can_edit(uuid),private.can_manage(uuid),private.shared_workspace(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid),private.can_edit(uuid),private.can_manage(uuid),private.shared_workspace(uuid) to authenticated;
-- Explicitly prevent user-accessible changes to membership and invites except through vetted RPCs.