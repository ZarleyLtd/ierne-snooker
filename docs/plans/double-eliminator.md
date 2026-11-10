# Double-Eliminator round codes

Canonical `fixtures.round_label` values for `competition_type = 'double-eliminator'`.

## Winners bracket
- `W{r}-{m}` — winners round `r`, match `m` (1-based), e.g. `W1-1`, `W2-2`
- `WF` — winners final
- Display names: rounds before last 8 are **Round 1, 2, …**; last 8 = **Quarter Final**; last 4 = **Semi Final**; then Winners Final

## Losers bracket
- `L{r}-{m}` — losers round `r`, match `m`
- `LF` — losers final (`wo:` of prior LB round vs `lo:WF`)

## Grand final
- `GF` — grand final (`wo:WF` vs `wo:LF`)
- `GF-R` — potential reset (`wo:GF` vs `lo:GF`)

## Placeholders
- `wo:<code>` — winner of that match (display resolved client-side)
- `lo:<code>` — loser of that match

## Stub labels (home bracket UI)
Winners-bracket matches in draw / sort order are labelled **L1**, **L2**, … on short stubs.
A player’s first losers-bracket appearance from a winners loss is shown as `(L2) Name`.

## Stage order (home / lists)
Sort bands must stay: `W1…Wn` → `WF` → `L1…Ln` → `LF` → `GF` → `GF-R`.
Do not hard-code `WF`/`LF` into the middle of the `W{n}` / `L{n}` ranges (large fields add W3/W4/L5…).
`L16` / `L32` are single-elim KO codes; DE generation skips those round numbers, and the client treats them as losers rounds only when the fixture set already looks like DE.

## Custom Playoff (all bracket comps)
- Codes: `CP-1`, `CP-2`, …
- Optional `fixtures.round_name` holds the display name (e.g. “Prelim round”)

## Generate Fixtures
- League: single round-robin per group, week numbers as `round_label`
- Knockout / Double-eliminator: shuffle players, pad to next power of 2 (`Byes = 2^k − N`), place byes on high seed slots via standard bracket seed order (`[1,8,4,5,2,7,3,6]` for 8) so byes are split top/bottom and no player gets consecutive-round byes
- Example `N=5`: bracket 8, 3 byes → one QF match and three players straight into the semis
- Knockout codes: `L32`/`L16`/`QF`/`SF`/`F`; DE: full WB + LB + GF + GF-R
- Bye slots create a real fixture vs player id `bye` (display name **Bye**), left **unscored**; generate advances the real player into the next round
- Bye fixtures appear on Fixtures and the home bracket (real player highlighted as winner) but are omitted from Results and do not affect frame / W–L stats
- **DE losers (full-slot):** L1 pairs only the losers of *played* W1 matches (W1 byes drop nobody). Each later absorb round has **one match per WB dropper** — LB survivors fill the first slots; remaining droppers get LB byes so the bracket keeps the power-of-2 shape. Pure LB consolidation rounds run when survivors still outnumber the next WB drop. Example `N=18` (32 bracket): L1×1 → L2×8 (7 byes) → L3×4 → L4×4 (absorb QF losers) → L5×2 → L6×2 (absorb SF losers) → L7×1 → LF → GF / GF-R
- Home DE: **WF** / **LF** show `--- L… ---` (or a plain line for LF) into an inline **Grand Final** stub, vertically centered with the match; other WB matches keep side **L1…** stubs
- `generateFixtures` accepts `regenerate: true` to delete and rebuild when no non-bye results exist
