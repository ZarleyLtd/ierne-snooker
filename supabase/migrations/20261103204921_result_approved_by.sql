alter table ierne_snooker.fixtures
  add column result_approved_by text,
  add column result_approved_at timestamptz;

comment on column ierne_snooker.fixtures.result_approved_by is
  'Name of the admin who approved a player-entered result. Null when the score was never separately approved.';

comment on column ierne_snooker.fixtures.result_approved_at is
  'When an admin approved a player-entered result.';
