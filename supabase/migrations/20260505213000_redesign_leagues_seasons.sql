-- Ierne Snooker League: redesign around explicit leagues + seasons,
-- replace stored standings with a view, and add a breaks table.
--
-- Reshape summary:
--   + leagues          (one row per league group: A, B, ...)
--   + seasons          (one row per season; exactly one is_current = true)
--   + season_players   (per-season league membership; replaces players.league)
--   + breaks           (big breaks per fixture per player)
--   ~ players          (drop league, add active)
--   ~ fixtures         (add season_id, stage, round_label; drop game_week, result_text)
--   - league_standings (replaced by league_standings_v view computed from fixtures)
--
-- New views:
--   fixture_results_v   -- one row per (fixture, player) for completed league play
--   league_standings_v  -- aggregated P/W/L/+-/Pts per (season, league, player)
--   head_to_head_v      -- record between every ordered pair (used for tiebreaks)

begin;

-- 1) Reference tables -------------------------------------------------------

create table if not exists ierne_snooker.leagues (
  league_id text primary key,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ierne_snooker.seasons (
  season_id text primary key,
  name text not null,
  starts_on date null,
  ends_on date null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one season can be the current one.
create unique index if not exists seasons_only_one_current
  on ierne_snooker.seasons (is_current) where is_current;

create table if not exists ierne_snooker.season_players (
  season_id text not null references ierne_snooker.seasons (season_id) on delete cascade,
  league_id text not null references ierne_snooker.leagues (league_id) on update cascade,
  player_id text not null references ierne_snooker.players (player_id) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_id, player_id),
  unique (season_id, league_id, player_id)
);

create index if not exists idx_season_players_league
  on ierne_snooker.season_players (season_id, league_id);

-- 2) Seed data --------------------------------------------------------------

insert into ierne_snooker.leagues (league_id, name, display_order) values
  ('A', 'League A', 1),
  ('B', 'League B', 2)
on conflict (league_id) do nothing;

insert into ierne_snooker.seasons (season_id, name, starts_on, ends_on, is_current) values
  ('2025-26', '2025/26 Season', '2025-09-01', '2026-05-31', true)
on conflict (season_id) do nothing;

-- 3) Backfill season_players from existing players.league -------------------

insert into ierne_snooker.season_players (season_id, league_id, player_id)
  select '2025-26', p.league, p.player_id
  from ierne_snooker.players p
  where p.league in ('A', 'B')
on conflict (season_id, player_id) do nothing;

-- 4) Reshape players: drop the old league column, add active ----------------

alter table ierne_snooker.players
  drop constraint if exists players_league_check;

alter table ierne_snooker.players
  drop column if exists league;

alter table ierne_snooker.players
  add column if not exists active boolean not null default true;

-- 5) Reshape fixtures -------------------------------------------------------

-- Rename `league` to `league_id` (it will become an FK to leagues.league_id).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'ierne_snooker'
       and table_name = 'fixtures'
       and column_name = 'league'
  ) then
    alter table ierne_snooker.fixtures rename column league to league_id;
  end if;
end $$;

-- Add new columns nullable, backfill, then tighten.
alter table ierne_snooker.fixtures
  add column if not exists season_id text,
  add column if not exists stage text,
  add column if not exists round_label text;

update ierne_snooker.fixtures
   set season_id = coalesce(season_id, '2025-26'),
       round_label = coalesce(round_label, game_week),
       stage = coalesce(stage, case
         when game_week in ('CS','CF','PQ','PS','PF') then 'knockout'
         else 'league'
       end);

-- Drop the old league check constraint (replaced by the FK below).
alter table ierne_snooker.fixtures
  drop constraint if exists fixtures_league_check;

-- Drop the old unique pairing (game_week is going away).
alter table ierne_snooker.fixtures
  drop constraint if exists fixtures_unique_pairing;

-- Drop the columns we're replacing.
alter table ierne_snooker.fixtures
  drop column if exists game_week,
  drop column if exists result_text;

-- Tighten: NOT NULL + FKs + checks.
alter table ierne_snooker.fixtures
  alter column season_id set not null,
  alter column stage set not null,
  alter column round_label set not null,
  alter column stage set default 'league';

alter table ierne_snooker.fixtures
  add constraint fixtures_stage_check
    check (stage in ('league','knockout'));

alter table ierne_snooker.fixtures
  add constraint fixtures_season_fk
    foreign key (season_id) references ierne_snooker.seasons (season_id) on update cascade;

alter table ierne_snooker.fixtures
  add constraint fixtures_league_fk
    foreign key (league_id) references ierne_snooker.leagues (league_id) on update cascade;

alter table ierne_snooker.fixtures
  add constraint fixtures_league_required_when_league_stage
    check (stage = 'knockout' or league_id is not null);

alter table ierne_snooker.fixtures
  add constraint fixtures_unique_pairing
    unique (season_id, stage, round_label, player_a_id, player_b_id);

create index if not exists idx_fixtures_season
  on ierne_snooker.fixtures (season_id);
create index if not exists idx_fixtures_season_league
  on ierne_snooker.fixtures (season_id, league_id);
create index if not exists idx_fixtures_round
  on ierne_snooker.fixtures (season_id, round_label);

-- The pre-existing idx_fixtures_game_week pointed at a column we just dropped;
-- Postgres dropped it automatically as part of the DROP COLUMN above.

-- 6) Drop the stored standings table ---------------------------------------

drop table if exists ierne_snooker.league_standings;

-- 7) Big breaks per fixture per player -------------------------------------

create table if not exists ierne_snooker.breaks (
  break_id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references ierne_snooker.fixtures (fixture_id) on delete cascade,
  player_id text not null references ierne_snooker.players (player_id) on update cascade,
  value integer not null check (value > 0 and value <= 155),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_breaks_fixture on ierne_snooker.breaks (fixture_id);
create index if not exists idx_breaks_value on ierne_snooker.breaks (value desc);
create index if not exists idx_breaks_player on ierne_snooker.breaks (player_id);

alter table ierne_snooker.breaks enable row level security;
alter table ierne_snooker.leagues enable row level security;
alter table ierne_snooker.seasons enable row level security;
alter table ierne_snooker.season_players enable row level security;

-- 8) Views ------------------------------------------------------------------

-- One row per (fixture, player) for league fixtures with a recorded score.
-- Walkovers are recorded as 2-0; double-walkovers as 0-0 (zero points to both).
create or replace view ierne_snooker.fixture_results_v as
  select f.season_id,
         f.league_id,
         f.fixture_id,
         f.player_a_id as player_id,
         f.player_b_id as opponent_id,
         f.score_a as frames_for,
         f.score_b as frames_against
    from ierne_snooker.fixtures f
   where f.stage = 'league'
     and f.score_a is not null
     and f.score_b is not null
  union all
  select f.season_id,
         f.league_id,
         f.fixture_id,
         f.player_b_id,
         f.player_a_id,
         f.score_b,
         f.score_a
    from ierne_snooker.fixtures f
   where f.stage = 'league'
     and f.score_a is not null
     and f.score_b is not null;

-- Standings derived from fixture_results_v.
-- Win = 2 pts, draw = 0 pts (per the league's rules: 0-0 double-walkover
-- yields zero to both), loss = 0 pts.
create or replace view ierne_snooker.league_standings_v as
  select r.season_id,
         r.league_id,
         r.player_id,
         count(*) as played,
         count(*) filter (where r.frames_for > r.frames_against) as won,
         count(*) filter (where r.frames_for < r.frames_against) as lost,
         count(*) filter (where r.frames_for = r.frames_against) as drawn,
         coalesce(sum(r.frames_for), 0) - coalesce(sum(r.frames_against), 0) as frame_diff,
         count(*) filter (where r.frames_for > r.frames_against) * 2 as points
    from ierne_snooker.fixture_results_v r
   group by r.season_id, r.league_id, r.player_id;

-- Per-pair head-to-head record (used for the tiebreaker in the Edge Function).
create or replace view ierne_snooker.head_to_head_v as
  select r.season_id,
         r.league_id,
         r.player_id,
         r.opponent_id,
         count(*) as played,
         count(*) filter (where r.frames_for > r.frames_against) as h2h_wins,
         count(*) filter (where r.frames_for < r.frames_against) as h2h_losses,
         coalesce(sum(r.frames_for), 0) - coalesce(sum(r.frames_against), 0) as h2h_frame_diff,
         count(*) filter (where r.frames_for > r.frames_against) * 2 as h2h_points
    from ierne_snooker.fixture_results_v r
   group by r.season_id, r.league_id, r.player_id, r.opponent_id;

commit;
