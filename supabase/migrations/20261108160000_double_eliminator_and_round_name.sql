-- Double-Eliminator competition type + optional fixture round display name.

begin;

alter table ierne_snooker.competitions
  drop constraint if exists competitions_type_check;

alter table ierne_snooker.competitions
  add constraint competitions_type_check
    check (competition_type in ('league', 'knockout', 'double-eliminator'));

alter table ierne_snooker.fixtures
  add column if not exists round_name text null;

commit;
