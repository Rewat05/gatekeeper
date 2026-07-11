-- ============================================================
-- Gatekeeper — Custom Tables (run in Supabase SQL Editor)
-- Better Auth manages its own tables (user, session, account,
-- verification) separately via its schema push command.
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── Organisations ─────────────────────────────────────────────────────────

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  domain      text unique,                       -- trusted email domain, e.g. "acme.com"
  org_code    text unique not null,              -- e.g. "ACME-4F2K", for manual join
  owner_id    text not null,                     -- references better-auth user.id
  created_at  timestamptz not null default now()
);

-- ── Departments ───────────────────────────────────────────────────────────

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  description text,
  manager_id  text,                              -- better-auth user.id of dept manager
  created_at  timestamptz not null default now()
);

-- Default "General" department is inserted when an org is created (see trigger below)

-- ── Org Members ───────────────────────────────────────────────────────────

create type public.member_role as enum ('Owner', 'Admin', 'Manager', 'Member', 'Viewer');
create type public.member_status as enum ('Active', 'Suspended', 'Pending');

create table public.org_members (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  user_id       text not null,                   -- better-auth user.id
  role          public.member_role not null default 'Viewer',
  department_id uuid references public.departments(id) on delete set null,
  status        public.member_status not null default 'Active',
  joined_at     timestamptz not null default now(),
  unique(org_id, user_id)
);

-- One email/user may only have one *active* organisation membership at a
-- time. Suspended/historical rows are untouched (e.g. someone who left an
-- org and joined a new one keeps their old row for audit purposes), but
-- exactly one 'Active' row per user is enforced at the database level —
-- this can't be bypassed even by a code path that forgets to check.
create unique index org_members_one_active_org_per_user
  on public.org_members (user_id)
  where status = 'Active';

-- ── Join Requests ─────────────────────────────────────────────────────────

create type public.request_type as enum ('Join', 'RoleChange', 'DeptChange');
create type public.request_status as enum ('Pending', 'Approved', 'Denied');

create table public.join_requests (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  requester_id        text not null,             -- better-auth user.id
  request_type        public.request_type not null default 'Join',
  requested_role      public.member_role,        -- for RoleChange requests
  requested_dept_id   uuid references public.departments(id),
  reason              text,
  status              public.request_status not null default 'Pending',
  reviewed_by         text,                      -- better-auth user.id of reviewer
  review_note         text,
  created_at          timestamptz not null default now(),
  reviewed_at         timestamptz
);

-- ── Access Profiles ───────────────────────────────────────────────────────

create table public.access_profiles (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  role          public.member_role not null,
  created_at    timestamptz not null default now(),
  unique(org_id, department_id, role)
);

-- The bundle of (file store, permission) pairs an access profile grants.
-- Assigning a member the profile's department+role auto-grants every store
-- listed here; changing their role/department auto-revokes them.
create table public.access_profile_grants (
  access_profile_id uuid not null references public.access_profiles(id) on delete cascade,
  file_store_id     uuid not null references public.file_stores(id) on delete cascade,
  permission        public.permission not null default 'Read',
  primary key (access_profile_id, file_store_id)
);

-- ── File Stores ───────────────────────────────────────────────────────────

create type public.classification as enum ('Public', 'Internal', 'Confidential', 'Restricted');

create table public.file_stores (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  owner_id        text not null,                 -- better-auth user.id
  name            text not null,
  description     text,
  classification  public.classification not null default 'Internal',
  storage_path    text,                          -- Supabase Storage bucket path
  created_at      timestamptz not null default now()
);

-- A Public store has no department rows (visible org-wide). An Internal
-- store is visible to members of ANY department listed here. Confidential
-- and Restricted stores may still be tagged with departments for context,
-- but access is always grant-based regardless of what's tagged.
create table public.file_store_departments (
  file_store_id uuid not null references public.file_stores(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  primary key (file_store_id, department_id)
);

-- ── Files ─────────────────────────────────────────────────────────────────

create table public.files (
  id            uuid primary key default gen_random_uuid(),
  file_store_id uuid not null references public.file_stores(id) on delete cascade,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null,
  storage_path  text not null,
  uploaded_by   text not null,
  size_bytes    bigint,
  mime_type     text,
  created_at    timestamptz not null default now()
);

-- ── Access Grants ─────────────────────────────────────────────────────────

create type public.permission as enum ('Read', 'Write');
create type public.grant_status as enum ('Active', 'Expired', 'Revoked');

create table public.access_grants (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  user_id           text not null,
  file_store_id     uuid not null references public.file_stores(id) on delete cascade,
  permission        public.permission not null default 'Read',
  granted_by        text not null,
  expires_at        timestamptz,
  status            public.grant_status not null default 'Active',
  source_profile_id uuid references public.access_profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique(org_id, user_id, file_store_id)
);

-- ── Access Requests ───────────────────────────────────────────────────────

create table public.access_requests (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  requester_id          text not null,
  file_store_id         uuid not null references public.file_stores(id) on delete cascade,
  permission_requested  public.permission not null default 'Read',
  justification         text,
  status                public.request_status not null default 'Pending',
  reviewed_by           text,
  review_note           text,
  created_at            timestamptz not null default now(),
  reviewed_at           timestamptz
);

-- ── Review Campaigns ─────────────────────────────────────────────────────

create type public.campaign_status as enum ('Active', 'Closed');

create table public.review_campaigns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  triggered_by  text not null,
  status        public.campaign_status not null default 'Active',
  started_at    timestamptz not null default now(),
  closes_at     timestamptz not null
);

-- ── Access Reviews ────────────────────────────────────────────────────────

create type public.review_decision as enum ('Certified', 'Revoked');

create table public.access_reviews (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  campaign_id   uuid not null references public.review_campaigns(id) on delete cascade,
  reviewer_id   text not null,
  grant_id      uuid not null references public.access_grants(id) on delete cascade,
  decision      public.review_decision,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- Only one recertification cycle may be open per org at a time — avoids
-- confusing overlapping campaigns fanning out duplicate reviews for the
-- same grants.
create unique index review_campaigns_one_active_per_org
  on public.review_campaigns (org_id)
  where status = 'Active';

-- Starts a campaign and fans out one review per currently-active grant in
-- one atomic call. Each grant's reviewer is its grantee's department
-- manager, or the org owner if the grantee has no department/manager.
create or replace function public.start_review_campaign(
  p_org_id uuid,
  p_triggered_by text,
  p_days_open int
) returns uuid
language plpgsql as $$
declare
  v_campaign_id uuid;
  v_owner_id text;
begin
  select owner_id into v_owner_id from public.organizations where id = p_org_id;

  insert into public.review_campaigns (org_id, triggered_by, status, closes_at)
  values (p_org_id, p_triggered_by, 'Active', now() + (p_days_open || ' days')::interval)
  returning id into v_campaign_id;

  insert into public.access_reviews (org_id, campaign_id, reviewer_id, grant_id)
  select
    p_org_id,
    v_campaign_id,
    coalesce(d.manager_id, v_owner_id),
    ag.id
  from public.access_grants ag
  join public.org_members om
    on om.org_id = ag.org_id and om.user_id = ag.user_id and om.status = 'Active'
  left join public.departments d on d.id = om.department_id
  where ag.org_id = p_org_id and ag.status = 'Active';

  return v_campaign_id;
end;
$$;

-- Records a reviewer's decision and, if revoked, revokes the underlying
-- grant in the same atomic call — a revoke decision can never succeed
-- while failing to actually revoke access.
create or replace function public.decide_access_review(
  p_review_id uuid,
  p_reviewer_id text,
  p_decision public.review_decision
) returns void
language plpgsql as $$
declare
  v_grant_id uuid;
  v_updated int;
begin
  update public.access_reviews
  set decision = p_decision, reviewed_at = now()
  where id = p_review_id and reviewer_id = p_reviewer_id and decision is null
  returning grant_id into v_grant_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'NOT_FOUND_OR_ALREADY_REVIEWED';
  end if;

  if p_decision = 'Revoked' then
    update public.access_grants set status = 'Revoked' where id = v_grant_id;
  end if;
end;
$$;

-- ── Audit Log (append-only) ───────────────────────────────────────────────

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  actor_id    text not null,
  action      text not null,                     -- e.g. 'REQUEST_SUBMITTED'
  target_type text,                              -- e.g. 'file_store'
  target_id   text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

-- ── Trigger: create General department on org creation ───────────────────

create or replace function public.create_default_department()
returns trigger language plpgsql as $$
begin
  insert into public.departments (org_id, name, description)
  values (new.id, 'General', 'Default department for new members');
  return new;
end;
$$;

create trigger on_org_created
  after insert on public.organizations
  for each row execute procedure public.create_default_department();

-- ── Atomic multi-step writes ──────────────────────────────────────────────
-- The app talks to Postgres via the Supabase REST client, where each
-- .from(table).insert()/.update() call is its own independent HTTP request —
-- there's no way to wrap two of them in one client-side transaction. These
-- functions push the multi-step logic into Postgres itself: a function body
-- runs as one implicit transaction, so if any step throws, everything
-- before it in the same call is rolled back automatically, no manual
-- compensating-delete code required.

create or replace function public.create_org_with_owner(
  p_name text,
  p_domain text,
  p_org_code text,
  p_owner_id text
) returns uuid
language plpgsql as $$
declare
  v_org_id uuid;
begin
  begin
    insert into public.organizations (name, domain, org_code, owner_id)
    values (p_name, p_domain, p_org_code, p_owner_id)
    returning id into v_org_id;
  exception when unique_violation then
    raise exception 'DOMAIN_TAKEN';
  end;

  begin
    insert into public.org_members (org_id, user_id, role, status)
    values (v_org_id, p_owner_id, 'Owner', 'Active');
  exception when unique_violation then
    raise exception 'ALREADY_MEMBER';
  end;

  return v_org_id;
end;
$$;

create or replace function public.create_department_with_manager(
  p_org_id uuid,
  p_name text,
  p_description text,
  p_manager_user_id text,   -- departments.manager_id (better-auth user id), or null
  p_manager_member_id uuid  -- org_members.id to move into the new department, or null
) returns uuid
language plpgsql as $$
declare
  v_dept_id uuid;
begin
  insert into public.departments (org_id, name, description, manager_id)
  values (p_org_id, p_name, p_description, p_manager_user_id)
  returning id into v_dept_id;

  if p_manager_member_id is not null then
    update public.org_members set department_id = v_dept_id where id = p_manager_member_id;
  end if;

  return v_dept_id;
end;
$$;

-- Each p_update_* flag distinguishes "field omitted from the PATCH body"
-- from "field explicitly provided" (manager_id can legitimately be set to
-- null to clear it), mirroring the partial-update semantics the route
-- already validates with zod before calling this.
create or replace function public.update_department_with_manager(
  p_dept_id uuid,
  p_update_name boolean, p_name text,
  p_update_description boolean, p_description text,
  p_update_manager_id boolean, p_manager_user_id text,
  p_manager_member_id uuid  -- org_members.id to move into this department, or null if no move needed
) returns void
language plpgsql as $$
begin
  if p_update_name then
    update public.departments set name = p_name where id = p_dept_id;
  end if;
  if p_update_description then
    update public.departments set description = p_description where id = p_dept_id;
  end if;
  if p_update_manager_id then
    update public.departments set manager_id = p_manager_user_id where id = p_dept_id;
  end if;

  if p_manager_member_id is not null then
    update public.org_members set department_id = p_dept_id where id = p_manager_member_id;
  end if;
end;
$$;

-- ============================================================
-- RLS Policies
-- ============================================================

alter table public.organizations    enable row level security;
alter table public.departments      enable row level security;
alter table public.org_members      enable row level security;
alter table public.join_requests    enable row level security;
alter table public.access_profiles  enable row level security;
alter table public.access_profile_grants enable row level security;
alter table public.file_stores      enable row level security;
alter table public.file_store_departments enable row level security;
alter table public.files            enable row level security;
alter table public.access_grants    enable row level security;
alter table public.access_requests  enable row level security;
alter table public.review_campaigns enable row level security;
alter table public.access_reviews   enable row level security;
alter table public.audit_log        enable row level security;

-- Helper: get current user's org_id and role from org_members
-- (Better Auth user ID comes from the app via service role; we
--  match on user_id stored as text from the Better Auth session.)

create or replace function public.current_org_id(uid text)
returns uuid language sql stable as $$
  select org_id from public.org_members
  where user_id = uid and status = 'Active'
  limit 1;
$$;

create or replace function public.current_role(uid text)
returns public.member_role language sql stable as $$
  select role from public.org_members
  where user_id = uid and status = 'Active'
  limit 1;
$$;

create or replace function public.current_dept_id(uid text)
returns uuid language sql stable as $$
  select department_id from public.org_members
  where user_id = uid and status = 'Active'
  limit 1;
$$;

-- ── Ring 1 + 2: organizations ─────────────────────────────────────────────

create policy "members can view their own org"
  on public.organizations for select
  using (id = public.current_org_id(auth.uid()::text));

-- ── Ring 1 + 2: departments ───────────────────────────────────────────────

create policy "members can view departments in their org"
  on public.departments for select
  using (org_id = public.current_org_id(auth.uid()::text));

create policy "admins can manage departments"
  on public.departments for all
  using (
    org_id = public.current_org_id(auth.uid()::text) and
    public.current_role(auth.uid()::text) in ('Owner', 'Admin')
  );

-- ── Ring 1 + 2: org_members ───────────────────────────────────────────────

create policy "admins see all members"
  on public.org_members for select
  using (
    org_id = public.current_org_id(auth.uid()::text) and
    public.current_role(auth.uid()::text) in ('Owner', 'Admin', 'Manager')
  );

create policy "members see themselves"
  on public.org_members for select
  using (user_id = auth.uid()::text);

-- ── join_requests ─────────────────────────────────────────────────────────

create policy "requester sees own requests"
  on public.join_requests for select
  using (requester_id = auth.uid()::text);

create policy "admins see all join requests for their org"
  on public.join_requests for select
  using (
    org_id = public.current_org_id(auth.uid()::text) and
    public.current_role(auth.uid()::text) in ('Owner', 'Admin')
  );

-- ── Ring 1 + 2 + 3: file_stores ──────────────────────────────────────────

create policy "public stores visible to all org members"
  on public.file_stores for select
  using (
    org_id = public.current_org_id(auth.uid()::text) and
    classification = 'Public'
  );

create policy "internal stores visible to dept members"
  on public.file_stores for select
  using (
    org_id = public.current_org_id(auth.uid()::text) and
    classification = 'Internal' and
    exists (
      select 1 from public.file_store_departments fsd
      where fsd.file_store_id = file_stores.id
        and fsd.department_id = public.current_dept_id(auth.uid()::text)
    )
  );

create policy "members can view file store department tags in their org"
  on public.file_store_departments for select
  using (
    exists (
      select 1 from public.file_stores fs
      where fs.id = file_store_departments.file_store_id
        and fs.org_id = public.current_org_id(auth.uid()::text)
    )
  );

create policy "confidential and restricted require explicit grant"
  on public.file_stores for select
  using (
    org_id = public.current_org_id(auth.uid()::text) and
    classification in ('Confidential', 'Restricted') and
    exists (
      select 1 from public.access_grants ag
      where ag.file_store_id = file_stores.id
        and ag.user_id = auth.uid()::text
        and ag.status = 'Active'
        and (ag.expires_at is null or ag.expires_at > now())
    )
  );

create policy "admins can view all file stores in org"
  on public.file_stores for select
  using (
    org_id = public.current_org_id(auth.uid()::text) and
    public.current_role(auth.uid()::text) in ('Owner', 'Admin')
  );

-- ── audit_log: no DELETE policy = append-only ─────────────────────────────

create policy "admins can view audit log"
  on public.audit_log for select
  using (
    org_id = public.current_org_id(auth.uid()::text) and
    public.current_role(auth.uid()::text) in ('Owner', 'Admin')
  );

create policy "system can insert audit log"
  on public.audit_log for insert
  with check (org_id = public.current_org_id(auth.uid()::text));

-- ── access_grants ─────────────────────────────────────────────────────────

create policy "grantee sees own grants"
  on public.access_grants for select
  using (user_id = auth.uid()::text);

create policy "admins and managers see all grants in org"
  on public.access_grants for select
  using (
    org_id = public.current_org_id(auth.uid()::text) and
    public.current_role(auth.uid()::text) in ('Owner', 'Admin', 'Manager')
  );

-- ── access_requests ───────────────────────────────────────────────────────

create policy "requester sees own access requests"
  on public.access_requests for select
  using (requester_id = auth.uid()::text);

create policy "admins and managers see all access requests"
  on public.access_requests for select
  using (
    org_id = public.current_org_id(auth.uid()::text) and
    public.current_role(auth.uid()::text) in ('Owner', 'Admin', 'Manager')
  );

-- ── review_campaigns ─────────────────────────────────────────────────────

create policy "admins see campaigns in their org"
  on public.review_campaigns for select
  using (
    org_id = public.current_org_id(auth.uid()::text) and
    public.current_role(auth.uid()::text) in ('Owner', 'Admin')
  );

-- ── access_reviews ───────────────────────────────────────────────────────

create policy "reviewer sees own assigned reviews"
  on public.access_reviews for select
  using (reviewer_id = auth.uid()::text);

create policy "admins see all reviews in their org"
  on public.access_reviews for select
  using (
    org_id = public.current_org_id(auth.uid()::text) and
    public.current_role(auth.uid()::text) in ('Owner', 'Admin')
  );

-- ============================================================
-- MIGRATION — run this instead of the file_stores/RLS blocks
-- above if you already applied a previous version of this file
-- (i.e. your live file_stores table still has a department_id
-- column). Safe to run once; re-running errors harmlessly on
-- the "column does not exist" step.
-- ============================================================

-- create table public.file_store_departments (
--   file_store_id uuid not null references public.file_stores(id) on delete cascade,
--   department_id uuid not null references public.departments(id) on delete cascade,
--   primary key (file_store_id, department_id)
-- );
--
-- alter table public.file_store_departments enable row level security;
--
-- insert into public.file_store_departments (file_store_id, department_id)
-- select id, department_id from public.file_stores where department_id is not null;
--
-- alter table public.file_stores drop column department_id;
--
-- drop policy if exists "internal stores visible to dept members" on public.file_stores;
-- create policy "internal stores visible to dept members"
--   on public.file_stores for select
--   using (
--     org_id = public.current_org_id(auth.uid()::text) and
--     classification = 'Internal' and
--     exists (
--       select 1 from public.file_store_departments fsd
--       where fsd.file_store_id = file_stores.id
--         and fsd.department_id = public.current_dept_id(auth.uid()::text)
--     )
--   );
--
-- create policy "members can view file store department tags in their org"
--   on public.file_store_departments for select
--   using (
--     exists (
--       select 1 from public.file_stores fs
--       where fs.id = file_store_departments.file_store_id
--         and fs.org_id = public.current_org_id(auth.uid()::text)
--     )
--   );

-- ============================================================
-- MIGRATION — access profiles (auto-provisioning) + grant
-- provenance. Run this if your live DB predates these tables.
-- Safe to run once.
-- ============================================================

-- create table public.access_profile_grants (
--   access_profile_id uuid not null references public.access_profiles(id) on delete cascade,
--   file_store_id     uuid not null references public.file_stores(id) on delete cascade,
--   permission        public.permission not null default 'Read',
--   primary key (access_profile_id, file_store_id)
-- );
--
-- alter table public.access_profile_grants enable row level security;
--
-- alter table public.access_grants
--   add column source_profile_id uuid references public.access_profiles(id) on delete set null;
--
-- alter table public.access_profiles alter column department_id set not null;
