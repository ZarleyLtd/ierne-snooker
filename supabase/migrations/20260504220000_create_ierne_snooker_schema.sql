-- Ierne Snooker League: initial schema
-- Creates the `ierne_snooker` schema with players, fixtures, handicaps and
-- league_standings tables. Frontend never talks to these tables directly;
-- access goes through the `ierne-api` Edge Function (service role).

create schema if not exists ierne_snooker;

-- Players: one row per league member. League is nullable so we can hold
-- historical players whose league assignment is unknown.
create table if not exists ierne_snooker.players (
  player_id text primary key,
  player_name text not null unique,
  league text null check (league in ('A', 'B')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fixtures: covers regular game-week matches (game_week = '1'..'7') and
-- knockout rounds (game_week in 'CS','CF','PQ','PS','PF'). `result_text`
-- preserves the raw '5-3' string from the source sheet for display, while
-- `score_a`/`score_b` are parsed integers for any sorting/aggregation.
create table if not exists ierne_snooker.fixtures (
  fixture_id uuid primary key default gen_random_uuid(),
  game_week text not null,
  league text null check (league in ('A', 'B')),
  player_a_id text not null,
  player_b_id text not null,
  match_date date null,
  score_a integer null,
  score_b integer null,
  result_text text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixtures_player_a_fk foreign key (player_a_id)
    references ierne_snooker.players (player_id) on update cascade,
  constraint fixtures_player_b_fk foreign key (player_b_id)
    references ierne_snooker.players (player_id) on update cascade,
  constraint fixtures_unique_pairing unique (game_week, player_a_id, player_b_id)
);

-- Handicaps: full historical record. Latest handicap per player is derived
-- in the Edge Function via DISTINCT ON (player_id) ORDER BY effective_date DESC.
create table if not exists ierne_snooker.handicaps (
  handicap_id uuid primary key default gen_random_uuid(),
  player_id text not null,
  handicap integer not null,
  effective_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint handicaps_player_fk foreign key (player_id)
    references ierne_snooker.players (player_id) on update cascade on delete cascade,
  constraint handicaps_unique_player_date unique (player_id, effective_date)
);

-- League standings: stored (writable) table per the "hybrid" data-model
-- choice. Could be replaced by a view computed from fixtures later without
-- changing the Edge Function contract.
create table if not exists ierne_snooker.league_standings (
  standing_id uuid primary key default gen_random_uuid(),
  league text not null check (league in ('A', 'B')),
  player_id text not null,
  played integer not null default 0,
  won integer not null default 0,
  lost integer not null default 0,
  frame_diff integer not null default 0,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_standings_player_fk foreign key (player_id)
    references ierne_snooker.players (player_id) on update cascade on delete cascade,
  constraint league_standings_unique_player unique (league, player_id)
);

create index if not exists idx_players_league on ierne_snooker.players (league);
create index if not exists idx_fixtures_game_week on ierne_snooker.fixtures (game_week);
create index if not exists idx_fixtures_players on ierne_snooker.fixtures (player_a_id, player_b_id);
create index if not exists idx_fixtures_sort on ierne_snooker.fixtures (sort_order);
create index if not exists idx_handicaps_player_date on ierne_snooker.handicaps (player_id, effective_date desc);
create index if not exists idx_league_standings_league on ierne_snooker.league_standings (league);

-- RLS on. No policies = anon/authenticated denied; service role bypasses RLS,
-- so only the Edge Function (and direct admin tooling) can read/write.
alter table ierne_snooker.players enable row level security;
alter table ierne_snooker.fixtures enable row level security;
alter table ierne_snooker.handicaps enable row level security;
alter table ierne_snooker.league_standings enable row level security;
