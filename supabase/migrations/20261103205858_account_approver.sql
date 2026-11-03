alter table ierne_snooker.accounts
  add column is_approver boolean not null default false;

comment on column ierne_snooker.accounts.is_approver is
  'True when the account may approve any match score and cannot use other admin tools.';
