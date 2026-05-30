-- Competitions model: rename seasons -> competitions, global leagues -> per-comp groups,
-- stage 'league' -> 'group', optional linked knockout comps.

begin;

-- 1) seasons -> competitions ------------------------------------------------

alter table ierne_snooker.seasons rename to competitions;

alter table ierne_snooker.competitions
  rename column season_id to competition_id;

alter table ierne_snooker.competitions
  add column if not exists competition_type text not null default 'league',
  add column if not exists parent_competition_id text null;

alter table ierne_snooker.competitions
  drop constraint if exists seasons_competition_type_check;

alter table ierne_snooker.competitions
  add constraint competitions_type_check
    check (competition_type in ('league', 'knockout'));

update ierne_snooker.competitions
   set competition_type = 'league'
 where competition_type is null or competition_type = '';

alter table ierne_snooker.competitions
  add constraint competitions_parent_fk
    foreign key (parent_competition_id)
    references ierne_snooker.competitions (competition_id)
    on delete set null;

drop index if exists ierne_snooker.seasons_only_one_current;

create unique index if not exists competitions_one_current_per_type
  on ierne_snooker.competitions (competition_type)
  where is_current;

-- 2) competition_groups (from global leagues + season membership) ------------

create table if not exists ierne_snooker.competition_groups (
  competition_id text not null
    references ierne_snooker.competitions (competition_id) on delete cascade,
  group_id text not null,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (competition_id, group_id)
);

create index if not exists idx_competition_groups_comp
  on ierne_snooker.competition_groups (competition_id, display_order);

insert into ierne_snooker.competition_groups (competition_id, group_id, name, display_order)
select c.competition_id, l.league_id, l.name, l.display_order
  from ierne_snooker.competitions c
 cross join ierne_snooker.leagues l
 where coalesce(c.competition_type, 'league') = 'league'
on conflict (competition_id, group_id) do nothing;

-- 3) season_players -> competition_players -----------------------------------

alter table ierne_snooker.season_players rename to competition_players;

alter table ierne_snooker.competition_players
  rename column season_id to competition_id;

alter table ierne_snooker.competition_players
  rename column league_id to group_id;

alter table ierne_snooker.competition_players
  drop constraint if exists season_players_league_id_fkey;

alter table ierne_snooker.competition_players
  drop constraint if exists season_players_season_id_fkey;

alter table ierne_snooker.competition_players
  add constraint competition_players_comp_fk
    foreign key (competition_id)
    references ierne_snooker.competitions (competition_id)
    on delete cascade;

alter table ierne_snooker.competition_players
  add constraint competition_players_group_fk
    foreign key (competition_id, group_id)
    references ierne_snooker.competition_groups (competition_id, group_id)
    on update cascade;

drop index if exists ierne_snooker.idx_season_players_league;

create index if not exists idx_competition_players_group
  on ierne_snooker.competition_players (competition_id, group_id);

-- 4) fixtures: competition_id, group_id, stage group/knockout ----------------

alter table ierne_snooker.fixtures
  rename column season_id to competition_id;

alter table ierne_snooker.fixtures
  rename column league_id to group_id;

-- Drop old stage/league constraints before renaming stage values (league -> group).
alter table ierne_snooker.fixtures
  drop constraint if exists fixtures_season_fk;

alter table ierne_snooker.fixtures
  drop constraint if exists fixtures_league_fk;

alter table ierne_snooker.fixtures
  drop constraint if exists fixtures_league_required_when_league_stage;

alter table ierne_snooker.fixtures
  drop constraint if exists fixtures_stage_check;

alter table ierne_snooker.fixtures
  drop constraint if exists fixtures_unique_pairing;

update ierne_snooker.fixtures
   set stage = 'group'
 where stage = 'league';

alter table ierne_snooker.fixtures
  add constraint fixtures_comp_fk
    foreign key (competition_id)
    references ierne_snooker.competitions (competition_id)
    on update cascade;

alter table ierne_snooker.fixtures
  alter column stage set default 'group';

alter table ierne_snooker.fixtures
  add constraint fixtures_stage_check
    check (stage in ('group', 'knockout'));

alter table ierne_snooker.fixtures
  add constraint fixtures_group_required_when_group_stage
    check (stage = 'knockout' or group_id is not null);

alter table ierne_snooker.fixtures
  add constraint fixtures_unique_pairing
    unique (competition_id, stage, round_label, player_a_id, player_b_id);

drop index if exists ierne_snooker.idx_fixtures_season;
drop index if exists ierne_snooker.idx_fixtures_season_league;
drop index if exists ierne_snooker.idx_fixtures_round;

create index if not exists idx_fixtures_comp
  on ierne_snooker.fixtures (competition_id);

create index if not exists idx_fixtures_comp_group
  on ierne_snooker.fixtures (competition_id, group_id);

create index if not exists idx_fixtures_round
  on ierne_snooker.fixtures (competition_id, round_label);

-- 5) Linked knockout comp for existing KO fixtures ---------------------------

insert into ierne_snooker.competitions (
  competition_id, name, starts_on, ends_on, is_current, competition_type, parent_competition_id
)
select '2025-26-ko', '2025/26 Knockout', starts_on, ends_on, true, 'knockout', '2025-26'
  from ierne_snooker.competitions
 where competition_id = '2025-26'
on conflict (competition_id) do update set
  name = excluded.name,
  competition_type = excluded.competition_type,
  parent_competition_id = excluded.parent_competition_id,
  is_current = excluded.is_current,
  updated_at = now();

insert into ierne_snooker.competition_groups (competition_id, group_id, name, display_order)
values ('2025-26-ko', 'ko', 'Knockout pool', 0)
on conflict (competition_id, group_id) do nothing;

update ierne_snooker.fixtures
   set competition_id = '2025-26-ko',
       updated_at = now()
 where competition_id = '2025-26'
   and stage = 'knockout';

-- 6) Drop global leagues table -----------------------------------------------

drop table if exists ierne_snooker.leagues cascade;

alter table ierne_snooker.competition_groups enable row level security;
alter table ierne_snooker.competitions enable row level security;

-- 7) Views (drop + recreate — CREATE OR REPLACE cannot rename columns) --------

drop view if exists ierne_snooker.head_to_head_v;
drop view if exists ierne_snooker.league_standings_v;
drop view if exists ierne_snooker.fixture_results_v;

create view ierne_snooker.fixture_results_v as
  select f.competition_id,
         f.group_id,
         f.fixture_id,
         f.player_a_id as player_id,
         f.player_b_id as opponent_id,
         f.score_a as frames_for,
         f.score_b as frames_against
    from ierne_snooker.fixtures f
   where f.stage = 'group'
     and f.score_a is not null
     and f.score_b is not null
  union all
  select f.competition_id,
         f.group_id,
         f.fixture_id,
         f.player_b_id,
         f.player_a_id,
         f.score_b,
         f.score_a
    from ierne_snooker.fixtures f
   where f.stage = 'group'
     and f.score_a is not null
     and f.score_b is not null;

create view ierne_snooker.league_standings_v as
  select r.competition_id,
         r.group_id,
         r.player_id,
         count(*) as played,
         count(*) filter (where r.frames_for > r.frames_against) as won,
         count(*) filter (where r.frames_for < r.frames_against) as lost,
         count(*) filter (where r.frames_for = r.frames_against) as drawn,
         coalesce(sum(r.frames_for), 0) - coalesce(sum(r.frames_against), 0) as frame_diff,
         count(*) filter (where r.frames_for > r.frames_against) * 2 as points
    from ierne_snooker.fixture_results_v r
   group by r.competition_id, r.group_id, r.player_id;

create view ierne_snooker.head_to_head_v as
  select r.competition_id,
         r.group_id,
         r.player_id,
         r.opponent_id,
         count(*) as played,
         count(*) filter (where r.frames_for > r.frames_against) as h2h_wins,
         count(*) filter (where r.frames_for < r.frames_against) as h2h_losses,
         coalesce(sum(r.frames_for), 0) - coalesce(sum(r.frames_against), 0) as h2h_frame_diff,
         count(*) filter (where r.frames_for > r.frames_against) * 2 as h2h_points
    from ierne_snooker.fixture_results_v r
   group by r.competition_id, r.group_id, r.player_id, r.opponent_id;

commit;
