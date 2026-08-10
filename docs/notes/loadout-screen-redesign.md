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
  `dice/descriptions.ts`, and two small bars — **Risk** and **Power** —
  scaled against the roster's own min/max (see below for what they measure).
- `apps/web/src/dice/stats.ts` — new file, numbers copied from
  `docs/researches/2026-08-10-mixed-loadout-strategy.md` §1–2 (verified
  against `node scripts/dice-balance/tier-report.mjs` while building this).
  **Regenerate that report and copy the columns back in here whenever a
  die's weights change** — nothing enforces the two staying in sync.
  - **Risk** = `1 − farkle6` (chance a full six-die throw of this die scores
    *something*, i.e. doesn't farkle) — changed from an earlier cut that used
    farkle-on-3. Note this makes a *longer* Risk bar mean *safer*, not
    "riskier" in the everyday sense of the label — worth a look if it reads
    backwards in practice.
  - **Power** = `win6` (win rate for six of this die against six ordinary
    dice) — changed from an earlier cut that used EV of a full throw. This is
    the project's own headline balance number, and it's what the tiers below
    are cut from too, so a card's Power bar and its tier badge now agree with
    each other by construction.
  - **Tiers** — Bronze/Silver/Gold, straight from the research's §2 cut
    (gaps kept only where 95% CIs on either side don't overlap): Gold =
    `cheat`/`worn`/`weighted`/`devil`/`trader`, Silver = `imp`/`trinity`,
    Bronze = `odd`. `balanced` has no tier in the research (it's the
    baseline everything else is measured against), so it's placed in Bronze
    by decision, not by a measured gap — it's the roster's floor either way.
    The catalog is grouped into tier sections (`.loadout__tier-group`),
    Bronze first, sorted ascending by `win6` inside each tier, so scrolling
    down reads as a difficulty curve.
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
The loadout-screen pill (`.loadout__quick-action`) is now centered and sized
up a step (gold border, bigger padding) — it was a small left-aligned chip
easy to miss among the other quick actions.

## Cut after the first pass

- **The "avg. farkle risk at 3 dice left" line** above the slots (comparing
  the current loadout's average to an ordinary loadout) — liked as an idea,
  pulled for now rather than left in half-tuned. Worth revisiting once Risk
  and Power have settled, since it would want the same underlying numbers.
- No preset loadouts (option 3) — noted above as the natural next step.
  **Built since**, see below.

## Follow-up: option 3 shipped

Presets landed on the setup screen (`setup/LoadoutChoice.tsx`,
`setup/loadoutPresets.ts`) as this note predicted they would compose: three
named loadouts plus a "Custom" card that opens *this* screen unchanged. The
picker is seeded with whatever preset was showing, so Custom continues from the
player's current dice rather than resetting to ordinary.

Two things worth carrying forward from building it:

- **All three presets are pure**, because research §6 measured every hand-built
  mix as worse than the pure loadouts, with `kitchen-sink` the weakest build
  tested. A mixed preset would have been offering something we have measured to
  be bad.
- **`farkle6` alone is a misleading number to show a player.** The first cut of
  the cards showed only it, which made `devil` look ten times deadlier than
  `worn` (6.3% vs 0.6%). Measured per *turn*, the ranking inverts: `devil` loses
  12% of turns, `worn` 19%, ordinary 29% — the wildcard rescues throws with one
  or two dice left, which is where turns actually die. Both numbers ship on each
  card, since either alone tells a different lie. Same caveat as the Risk bar
  above: this is a bar/number whose label has to be read carefully.
- No live/analytical stat computation in the browser — the exact enumeration
  (`analyticalMetrics` in `scripts/dice-balance/lib.mjs`) does up to 6⁶
  throws per die; fine offline, not worth doing on every render for nine
  dice, so the numbers are copied static data instead (see `dice/stats.ts`
  above for the sync caveat).
