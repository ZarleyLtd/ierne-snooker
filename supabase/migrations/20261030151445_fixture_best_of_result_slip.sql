-- Per-fixture match length, who posted the score, and a private scorecard photo.

alter table ierne_snooker.fixtures
  add column if not exists best_of smallint not null default 3;

alter table ierne_snooker.fixtures
  drop constraint if exists fixtures_best_of_odd_range;

alter table ierne_snooker.fixtures
  add constraint fixtures_best_of_odd_range
    check (best_of >= 1 and best_of <= 9 and best_of % 2 = 1);

alter table ierne_snooker.fixtures
  add column if not exists result_entered_by text;

comment on column ierne_snooker.fixtures.result_entered_by is
  'Admin, or the player name — who last saved the score from the result dialog.';

alter table ierne_snooker.fixtures
  add column if not exists result_slip_path text,
  add column if not exists result_slip_mime text;

comment on column ierne_snooker.fixtures.result_slip_path is
  'Storage object path in bucket ierne-result-slips (committed slip only).';
comment on column ierne_snooker.fixtures.result_slip_mime is
  'MIME type of the committed result slip image (typically image/jpeg).';

insert into storage.buckets (id, name, public)
values ('ierne-result-slips', 'ierne-result-slips', false)
on conflict (id) do update set public = excluded.public;
