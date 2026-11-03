-- Player-reported scores stay unapproved until an admin approves them.
-- Existing results and admin-entered results are approved.

alter table ierne_snooker.fixtures
  add column result_approved boolean not null default true;

comment on column ierne_snooker.fixtures.result_approved is
  'False when a player reported the score and an admin has not approved it yet.';
