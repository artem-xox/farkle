# Loadout screen redesign

Started from a screenshot complaint: the "Choose your dice" step (`LoadoutStep`
+ `LoadoutPicker`) rendered slots and palette dice as identical tiles, wrapped
the six slots 4-then-2, gave no reason to pick one die over another without
leaving for the Dice tab, and went dead (palette disabled) after the last slot
filled.

## Options considered

1. **Stand + cards** — sticky six-slot rack up top, palette rewritten as cards
   with name, blurb, and at-a-glance stats.
2. **Fitting room** — one die full-screen at a time, swipe through the
   collection, big distribution chart per die.
3. **Loadout presets** — lead with 4-5 named preset loadouts
   (Ordinary/Cautious/Gambler/…), "Custom" opens the picker.

Chose **1**. It's the smallest, lowest-risk change that fixes every concrete
complaint (wrapping, dead-end state, no info to decide on, identical tiles),
and it composes with 3 later if we want presets — didn't build presets now to
keep this pass scoped to the picker itself.

## What shipped

- `apps/web/src/setup/LoadoutPicker.tsx` — six slots as a non-wrapping sticky
  grid row (`.loadout__slots--sticky`) instead of flex-wrap; armed slot now
  wraps back to slot 1 after slot 6 instead of going dead
  (`armed = (armed + 1) % length`); palette rebuilt as cards
  (`.loadout-card`) with the die, its name, its one-line blurb from
  `dice/descriptions.ts`, and two small bars — **Risk** (farkle odds on 3 of
  this die) and **Power** (EV of a full 6-die throw of it) — scaled against
  the roster's own min/max.
- `apps/web/src/dice/stats.ts` — new file, the `farkle3`/`ev6` numbers copied
  from the `docs/DESIGN.md` §5 roster table (verified against
  `node scripts/dice-balance/roster-report.mjs` while building this).
  **Regenerate that report and copy the two columns back in here whenever a
  die's weights change** — nothing enforces the two staying in sync.
- `apps/web/src/dice/descriptions.ts` — added `iconicFace(die)`: shows a
  wildcard die's actual wild face instead of a `1` it doesn't have (Devil's
  head and Imp's die were both rendering pip `1` in the picker and on the
  Dice tab, which is a face neither die can roll).
- Each card also has a **"Fill all 6"** button (fills the whole loadout with
  that one die) — this replaces "fill rest with selected" / "random" from the
  original three-quick-actions pitch; those two were cut as more UI than the
  value justified for a first pass.
- Opponent picker, when not editable (bot mode): no longer renders a full
  disabled `LoadoutPicker`. Shows a compact read-only strip
  (`.loadout--readonly`) plus one line explaining bot loadouts aren't
  customizable yet. Skipped building a real collapse/accordion — the
  non-wrapping slot row was already short enough that a toggle would be
  more UI than it saves.

## The "just let me play" shortcut

Every slot already defaults to the ordinary die (`defaultLoadout()` in
`SetupScreen.tsx`), so "play with ordinary dice" was never really a reset —
it's "start now instead of visiting the loadout step." Implemented as:

- **`SetupScreen.tsx`**: a secondary link under the "Choose dice" submit
  button, "Skip — play with ordinary dice", which calls `handleStart` directly
  with two fresh `defaultLoadout()` arrays (bypasses the loadout step
  entirely, and forces ordinary even if the player had already customized
  and hit Back).
- **`LoadoutPicker.tsx`**: a "Play with ordinary dice" pill among the quick
  actions on the loadout screen itself, for anyone who got this far and
  changed their mind — resets that picker's six slots to ordinary and
  re-arms slot 1.

Two entry points, same intent, no shared code needed since the underlying
action (`defaultLoadout()` for however many dice) is a one-liner either way.

## Deliberately not done

- No preset loadouts (option 3) — noted above as the natural next step.
- No live/analytical stat computation in the browser — the exact enumeration
  (`analyticalMetrics` in `scripts/dice-balance/lib.mjs`) does up to 6⁶
  throws per die; fine offline, not worth doing on every render for nine
  dice, so the numbers are copied static data instead (see `dice/stats.ts`
  above for the sync caveat).
