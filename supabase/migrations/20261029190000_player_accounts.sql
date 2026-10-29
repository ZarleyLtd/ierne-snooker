-- Player accounts, one-time invite codes, and the 24-hour result edit window.
-- Existing scored fixtures are marked as posted 25 hours ago so they are already locked
-- for players. Admins can still change them.

create table if not exists ierne_snooker.accounts (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  password_hash text not null,
  player_id text not null,
  invite_id uuid null,
  disabled_at timestamptz null,
  last_seen_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_handle_unique unique (handle),
  constraint accounts_player_unique unique (player_id),
  constraint accounts_handle_format check (handle ~ '^[a-z0-9]{3,20}$'),
  constraint accounts_player_fk foreign key (player_id)
    references ierne_snooker.players (player_id) on update cascade on delete cascade
);

create table if not exists ierne_snooker.invites (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('register', 'reset')),
  code_hash text not null unique,
  label text null,
  account_id uuid null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint invites_account_fk foreign key (account_id)
    references ierne_snooker.accounts (id) on delete cascade
);

alter table ierne_snooker.accounts
  drop constraint if exists accounts_invite_fk;

alter table ierne_snooker.accounts
  add constraint accounts_invite_fk
  foreign key (invite_id)
  references ierne_snooker.invites (id)
  on delete set null;

create table if not exists ierne_snooker.sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz null,
  constraint sessions_account_fk foreign key (account_id)
    references ierne_snooker.accounts (id) on delete cascade
);

create index if not exists idx_invites_pending
  on ierne_snooker.invites (expires_at)
  where used_at is null;

create index if not exists idx_sessions_account
  on ierne_snooker.sessions (account_id);

alter table ierne_snooker.fixtures
  add column if not exists result_posted_at timestamptz null;

update ierne_snooker.fixtures
set result_posted_at = now() - interval '25 hours'
where score_a is not null
  and score_b is not null
  and result_posted_at is null;

alter table ierne_snooker.accounts enable row level security;
alter table ierne_snooker.invites enable row level security;
alter table ierne_snooker.sessions enable row level security;
