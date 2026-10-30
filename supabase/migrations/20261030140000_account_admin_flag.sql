-- Player accounts can be marked as league admins. An admin session for that
-- account is accepted by the API in place of the shared admin PIN.

alter table ierne_snooker.accounts
  add column if not exists is_admin boolean not null default false;
