-- Allow any number of competitions to be marked is_current at once.
-- "Now showing" on the home page is chosen client-side (carousel / session).

drop index if exists ierne_snooker.competitions_one_current_per_type;
