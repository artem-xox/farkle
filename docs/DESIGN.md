# Design

Architecture and technology decisions. Rules live in [RULES.md](RULES.md);
milestones live in [PLAN.md](PLAN.md).

## 1. Goals

A playable Farkle game using the KCD2 rule set, with weighted dice and
configurable AI opponents. Single-player against bots is the primary experience.
Online multiplayer is a later goal, and the architecture must not make it
expensive — but nothing is built for it up front.

Two properties drive most decisions below:

- **The engine is pure.** Given a state, an action and a seed, the next state is
  fully determined. No I/O, no clock, no global randomness.
- **Randomness is authoritative in the engine, never in the presentation.** The
  engine decides what the dice show; the UI animates a result it was given. With
  weighted dice there is no alternative — physics cannot produce a 66% bias
  toward `1` — and it keeps replay and networking trivially correct.

## 2. Technology

**TypeScript monorepo.** The rules engine and the bots are plain TypeScript
libraries with no dependencies; the UI is React + Vite; tests run under Vitest;
a CLI app hosts the terminal game and the simulation harness.

```
packages/
  engine/      rules, state machine, RNG, dice — zero dependencies
  bots/        policies and personalities, depends only on engine
apps/
  cli/         terminal play + bot tournaments
  web/         React + Vite UI
docs/
```

Rationale: the engine and the UI want the same language so there is one source of
truth for the rules, one test runner, and no serialization layer between them.
The engine is small and allocation-light, so bot tuning runs of many thousands of
games are practical in Node.

### Alternatives considered

**Rust or Go core compiled to WebAssembly.** One implementation usable from both
the browser and a native server, and dramatically faster for large simulation
sweeps. Rejected for now: the build complexity and the JS/WASM boundary cost more
than they buy while the engine is still changing shape daily. Kept as an escape
hatch — if simulation throughput becomes the bottleneck, only `packages/engine`
gets rewritten, and its API is the contract.

**Python for the engine.** Excellent for analysis and probability work, unusable
in the browser without heavy tooling. Better used as a separate analysis
notebook reading match logs the CLI produces.

**Godot or Unity.** Better feel for 3D dice, much slower iteration on the parts
that actually carry this project — rules, partitioning, bot behaviour — none of
which are graphical. If a 3D table becomes a priority, three.js over the same
engine is the cheaper path.

## 3. Front end and back end

There is no server in v1. Everything runs client-side: the browser holds the
engine, the bots and the state.

This is deliberate, and it is not the same thing as being unable to split later.
The split is expressed as an **interface**, not as a network hop:

```ts
interface GameHost {
  view(playerId: PlayerId): ClientView;
  dispatch(playerId: PlayerId, action: GameAction): Promise<void>;
  subscribe(listener: (events: GameEvent[]) => void): Unsubscribe;
}
```

`LocalHost` runs the engine in-process. A future `RemoteHost` speaks WebSocket to
a server running the identical engine package. The UI is written against
`GameHost` and does not know which it has.

Two rules keep that door open:

- The UI never mutates game state directly, and never computes a score for
  display by any path other than asking the engine.
- Bots consume the same `ClientView` a human player gets. A bot that peeks at
  hidden state is a bot that cannot be moved to a server later — and is also
  cheating.

`ClientView` is a per-player projection of the state rather than the state
itself. Farkle has little hidden information, but opponent dice loadouts are a
plausible thing to hide, and retrofitting a projection layer is unpleasant.

For how the split is usually done in this genre, and why the shared-core shape
was chosen over a conventional REST back end, see
[Appendix A](#appendix-a-splitting-front-end-and-back-end).

## 4. Engine

### State and actions

```ts
type Phase = 'AwaitingThrow' | 'AwaitingKeep' | 'AwaitingBankOrThrow' | 'MatchOver';

type GameAction =
  | { type: 'Throw' }
  | { type: 'Keep'; dice: DieIndex[] }
  | { type: 'Bank' };

type GameEvent =
  | { type: 'Thrown'; faces: Face[] }
  | { type: 'Kept'; dice: DieIndex[]; points: number; combos: Combo[] }
  | { type: 'HotDice' }
  | { type: 'Farkled' }
  | { type: 'Banked'; points: number; total: number }
  | { type: 'TurnPassed'; to: PlayerId }
  | { type: 'MatchWon'; winner: PlayerId };

function reduce(state: GameState, action: GameAction): { state: GameState; events: GameEvent[] };
```

Events, not diffs, are the interface to the presentation layer: the UI animates
`Thrown` then `Kept`, and the CLI prints them. They are also the replay format.

### Randomness

A seeded PRNG (PCG32 or mulberry32) whose state lives inside `GameState`, so
that a state plus an action sequence reproduces a match exactly. The seed is
recorded with every match. Debugging a "that can't be right" scoring report
should never require reproducing a roll by hand.

### Scoring and partitioning

The hard part of this project. Four functions:

```ts
hasScoringDice(faces: Face[]): boolean;                 // farkle detection
isLegalKeep(faces: Face[]): boolean;                    // full-cover partition exists
scoreKeep(faces: Face[]): { points: number; combos: Combo[]; resolved: Pip[] } | null;
legalKeeps(throw_: Face[], dice?: DieSpec[]): KeepOption[]; // every legal subset, for UI and bots
```

`scoreKeep` maximises over partitions, which rules out greedy evaluation
(RULES.md §5 has the counterexamples). The implementation is a recursive search —
take one combination, recurse on the remainder, keep the best — memoised on the
sorted multiset. With at most six dice the state space is a few hundred entries,
so the optimal answer is effectively free and no heuristic is warranted.

`legalKeeps` returns each option with its point value and the number of dice it
leaves in play. Both numbers matter: the UI needs them to show consequences, and
bots choose between "more points now" and "more dice next throw" on exactly this
trade-off. Given the throw's dice specs (`viewOf` always supplies them), it also
dedupes by *die identity* rather than just face value: two keeps that take the
same points from the same face values are still different choices if they leave
different dice behind, so `legalKeeps` reports both and attaches each one's
`diceLeftSpecs`.

**Wildcards** (`Face` = `Pip | Wild`, RULES.md §4a) extend the search rather
than replacing it: `scoreKeep` splits a keep into its physical pips and its
wildcard count, then tries every distinct multiset the wildcards could resolve
to (at most `C(11,5)` = 462 for six) and keeps the highest-scoring reading. The
partitioner itself tracks *real* and *wildcard-sourced* counts per face
separately rather than merging them, because a wildcard is barred from
completing a `Single` on its own — see `bestPartition` in
`packages/engine/src/scoring.ts`.

### Testing

The throw space is tiny — 6⁶ = 46 656 distinct six-dice throws — so the scorer is
tested by **exhaustive enumeration**, not sampling. Properties to assert across
all throws: a keep is legal iff it has a covering partition; the score of a keep
never decreases when a scoring die is added; `hasScoringDice` agrees with
`legalKeeps` being non-empty; no legal keep is ever valued below any specific
partition of it.

On top of that: the RULES.md §9 vectors as golden tests, a determinism test
(same seed and actions produce byte-identical event logs), and a chi-square check
that the weighted dice sampler matches its declared weights.

## 5. Dice

```ts
type DieSpec = {
  id: string;
  name: string;
  weights: [number, number, number, number, number, number];
  /** The physical pip painted as a Devil's Head — see docs/RULES.md §4a. */
  wild?: 1 | 2 | 3 | 4 | 5 | 6;
};
```

`wild` names which weight slot rolls as a wildcard instead of its printed
pip. It is still just one more weight — a die's distribution stays one
honest set of six numbers whether or not one of them is painted differently.

The integer-weight model comes from the source game's own numbers: its published
probabilities are exact fractions over denominators like 13 and 15, which is what
a weighted bag produces and a float table does not.

### The balance band

Every special die is a **sidegrade, not a rung on a ladder**. They differ in
shape, not in strength, and none of them is the die you simply switch to.

The measure is not face probability but **win rate**: six of one die against six
ordinary dice, both sides played by the same `balanced` bot, 40 000 matches
(95% CI ≈ ±0.5pp). M1–M5's roster targeted a single **57–63%** band — a die
outside it was a bug, not a feature. M6 opened that up into four **leagues**,
each its own win6 band a player can read as a difficulty rung rather than a
single flat plateau:

| league | win6 band | shape |
|---|---|---|
| 🥉 Bronze | ~48–57% | flavour and jokes — a couple of dice are deliberately *worse* than ordinary |
| 🥈 Silver | ~59–60% | the old band's floor — set bets and mild noise |
| 🥇 Gold | ~61–62% | the old band's ceiling — plain upgrades and safety plays |
| 💎 Diamond | ~65–70% (M6, `balanced` bot) | genuinely stronger, reserved for a small number of showcase dice |

**Diamond has since moved past this table three times, and now uses a
different bot preset.** M7 added `king`/`queen` and their Crown Bonus
(RULES.md §12) and pushed Diamond to 70–75% win6; M8
([docs/researches/2026-08-13-diamond-rebalance-and-king-wild-move](researches/2026-08-13-diamond-rebalance-and-king-wild-move.md))
switched Diamond's own measurements from the `balanced` bot every league
below still uses to `smart` instead, retuned all three Diamond dice
(`devil`, `king`, `queen`) to 80–90% win6 against it, and deliberately gave
`king` a different risk/reward shape from `queen`'s; M9
([docs/researches/2026-08-13-king-queen-crown-twins](researches/2026-08-13-king-queen-crown-twins.md))
found that differentiation was quietly killing the Crown Bonus's synergy —
a mixed King/Queen loadout lost to *both* pure ends — tried making `king` an
exact copy of `queen` to get the synergy back, then landed on a third option:
`king` keeps `queen`'s exact six weights but with the crown on the other
equal-weight slot (`2` instead of `6`), which turns out to make it a
meaningfully stronger die (highest ev6 in the roster) while still keeping
most of the synergy, since the two are no longer identical. Bronze/Silver/
Gold below are still exactly what M1–M6 measured them as; only Diamond's row
and the `king`/`devil` lines in the roster table just below are stale —
current Diamond weights and numbers live in `packages/engine/src/dice.ts`'s
own comments and the two dated research files above, not here.

Within a league, dice are still sidegrades to each other — the league is what
stops being flat. `sweep-candidates.mjs` is the template used to tune a new or
rebalanced die into whichever band its league targets; `roster-report.mjs`
regenerates the table below from whatever is currently in `DICE`;
`wildcard-audit.mjs` checks a wild face's safety claims against the whole
roster rather than a few hand-picked companies. All three live in
[`scripts/dice-balance`](../scripts/dice-balance/README.md).

Shape is then read off two further numbers, which is what actually
distinguishes the dice from one another:

- **farkle % on three dice** — how far a turn can be pushed once most of the
  loadout is set aside;
- **EV of a full six-die throw** — what the die is worth when it does connect.

M1–M5 shipped five dice tuned by eye, and the spread was 57% to 98%. The pre-calibration
`weighted` die (`[10,1,1,1,1,1]`) farkled on three dice 1.8% of the time against
an ordinary die's 27.8% and won 97.7% of matches; the pre-calibration `devil`
(`[1,1,1,1,1,1]`, `wild: 1`) won 80.6%. Both were retuned rather than removed.

### The roster

As of M6, fourteen dice ship across the four leagues above. Measured columns
are the numbers from the balance band section; `win6` is the balance metric,
so the roster is sorted by it, and the blank rows mark the league boundaries.

| id | name | league | weights | distribution | farkle 6 / 3 | EV 6 | win6 |
|---|---|---|---|---|---|---|---|
| `unlucky` | Unlucky die | 🥉 Bronze | `[12,13,13,13,12,13]` | 15.8% each on `1/5`, 17.1% each on `2/3/4/6` | 3.6 / 30.0 | 389 | 48.1 |
| `balanced` | Ordinary die | 🥉 Bronze | `[1,1,1,1,1,1]` | 16.7% per face | 3.1 / 27.8 | 399 | 49.8 |
| `even` | Even die | 🥉 Bronze | `[29,30,29,30,29,30]` | 16.4% each on `1/3/5`, 16.9% each on `2/4/6` | 3.3 / 28.5 | 396 | 49.9 |
| `odd` | Odd die | 🥉 Bronze | `[4,3,4,3,4,3]` | 19.0% each on `1/3/5`, 14.3% each on `2/4/6` | 1.9 / 22.2 | 431 | 56.7 |
| `trinity` | Holy Trinity die | 🥈 Silver | `[1,1,4,1,1,1]` | 44.4% on `3`, 11.1% each on the rest | 2.9 / 37.9 | 470 | 58.8 |
| `twins` | Twins die | 🥈 Silver | `[3,19,3,3,3,3]` | 55.9% on `2`, 8.8% each on the rest | 1.7 / 38.2 | 461 | 59.3 |
| `unbalanced` | Unbalanced die | 🥈 Silver | `[5,4,5,3,2,2]` | 23.8% each on `1/3`, 19.0% on `2`, 14.3% on `4`, 9.5% each on `5/6` | 2.5 / 27.2 | 466 | 59.6 |
| `imp` | Imp's die | 🥈 Silver | `[2,7,7,7,2,2]`, `wild: 6` | 25.9% each on `2/3/4`, 7.4% each on `1`, `5` and wild | 2.7 / 50.8 | 505 | 59.9 |
| `trader` | Trader's die | 🥇 Gold | `[1,1,1,1,2,1]` | 28.6% on `5`, 14.3% each on the rest | 1.2 / 17.5 | 448 | 60.6 |
| `weighted` | Weighted die | 🥇 Gold | `[3,2,2,2,2,2]` | 23.1% on `1`, 15.4% each on `2-6` | 1.9 / 21.9 | 473 | 61.3 |
| `worn` | Worn die | 🥇 Gold | `[1,0,1,1,1,1]` | 20% each on `1/3/4/5/6`, never a `2` | 0.6 / 19.2 | 467 | 61.8 |
| `cheat` | Cheat's die | 🥇 Gold | `[2,2,2,2,2,5]` | 13.3% each on `1-5`, 33.3% on `6` | 3.7 / 35.0 | 514 | 62.4 |
| `king` | King's die | 💎 Diamond | `[1,1,1,1,2,3]` | 11.1% each on `1-4`, 22.2% on `5`, 33.3% on `6` | 1.7 / 25.5 | 543 | 66.9 |
| `devil` | Devil's Head die | 💎 Diamond | `[1,2,2,2,2,2]`, `wild: 1` | 9.1% wild, 18.2% each on `2-6`, no `1` at all | 5.2 / 46.9 | 584 | 68.2 |

Read down the farkle and EV columns rather than the win column within a
league: win rates are deliberately close together *inside* a league, and
everything interesting is in how each die gets there. `odd`, at 56.7% (CI
[56.2, 57.2]), is Bronze's outlier on the high side for the same reason it was
already the M5 band's outlier on the low side — the shape it occupies,
"mildly safer, mildly better", is already `weighted`'s, so it is left at
Bronze's ceiling rather than nudged up into a Silver-shaped duplicate.

- **`unlucky` and `even` buy nothing, on purpose.** They exist to be a
  slightly worse `balanced` and a slightly worse `odd` — the two dice a
  player picks to make a match harder for themselves, or to hand to a bot
  they want to look beatable.
- **`worn` and `trader` buy safety.** `worn` deletes a dead face outright and
  is the safest die in the game on a full throw (0.6%); `trader` is the
  safest one to still have in play when two or three dice are left (17.5% on
  three), which is the moment that actually decides turns. Neither has much
  of a ceiling.
- **`king` and `devil` buy a ceiling, and Diamond is where that trade finally
  pays out in full.** `devil` farkles on a full throw *nine times* what
  `worn` does (5.2% against 0.6%, the roster's widest safety gap) and turns
  that risk into the highest EV shipped (584); `king` gets there without any
  risk at all — no wildcard, no missing face, just the roster's two best
  faces (`5` and `6`) stacked into one die.
- **`cheat`, `trinity` and `twins` bet on one face.** A `6`, a `3` and a `2`
  are all worthless alone, so these are pure three-of-a-kind (or better)
  plays. The cheaper the triple, the higher the bias has to run to compensate
  in the same league: `trinity`'s `300`-point triple affords 4-in-9 on its
  face, `twins`'s cheaper `200`-point one needs 19-in-34.
- **`weighted` and `odd` are the plain upgrades**, and are deliberately the
  least interesting: more of the faces that already scored, nothing given up.
- **`unbalanced` is noise with a direction.** Every face carries a different
  weight rather than a clean two-block split, but `1`/`2`/`3` average heavier
  than `4`/`5`/`6` — the `1` bias buys real points, the `5`/`6` losses give
  some safety back, and the two roughly net out into Silver.

Two properties are worth knowing because they are not visible in the table:

**`trinity` and `twins` are set dice.** Six of them beat six ordinary dice
(58.8% and 59.3%), but one among five ordinary dice is a *downgrade* (47.0%
and 44.5%) — a lone heavy `3` or `2` mostly produces a dead face, and only a
loadout full of them produces triples often enough to pay. They are the only
dice in the roster where the mixed loadout is worse than the pure one.

**`imp` is safer in its own company.** A single imp farkles more often than an
ordinary die in any company; five of them farkle *less*, because wildcards start
completing three-of-a-kinds among themselves (RULES.md §4a). `devil` never
crosses that line in any company — both facts are asserted over the whole
roster in `packages/bots/test/odds.test.ts` rather than left as claims.

A player's *loadout* is six dice drawn from their collection, assigned one slot
at a time on its own screen after match setup. Both players default to six
balanced dice; an opponent's loadout is always visible before the match starts
(read-only for a bot opponent in v1 — bots do not yet own a persistent
collection of their own, which is M7 territory).

Whatever dice an opponent uses must be inspectable by the player. Hiding the
distributions in a game whose entire subject is probability would be a bad
trade for atmosphere — the full odds table for every die lives on its own
"Dice" screen rather than folded into Rules.

**Where `devil`'s wild face sits is a design choice, not a balance result.** It
is on the `1` slot specifically: pairing that slot with the ordinary reading
"a wildcard scores unconditionally" would make the die mechanically identical
to `balanced` (a real `1` and an unconditional wildcard are interchangeable to
`hasScoringDice`), so RULES.md §4a instead rules that a wildcard can never
complete a single `1` or `5` on its own — only a bigger combination. That
ruling is what makes a wildcard a trade rather than a gift, and it is what the
`imp` die then exploits from the other side by sitting on the worthless `6`.

Only the *weights* came out of the M5 calibration pass; every die's identity —
which face, which rule it leans on — was chosen first and tuned afterwards.
Dice that could not be brought into the M5 band without losing their identity
were dropped rather than shipped weak: an "even die" (`[1,2,1,2,1,2]`) measured
42% and a die biased toward the middle faces measured 43%, because in this rule
set the even faces and the middle faces are simply where points aren't. Once
Bronze existed as a league with room for a die *below* `balanced`, that
objection stopped applying — M6's `even` ships the same idea at a much fainter
bias (`[29,30,29,30,29,30]`, each even face 0.57pp likelier), landing at 49.9%
by design rather than being nudged toward the old band.

### Directions for later dice

Recorded so the shape of the design space is not rediscovered each time. A die
can reach the game through exactly three levers, and the current roster uses
only the first two:

1. **What comes up** — the weights. Cheap, fully supported, and nearly
   exhausted: it can only nudge the throw-or-bank decision, never change it.
2. **What a face means** — `wild` is the only inhabitant so far. Still pure and
   local to one throw, and the richest unexplored ground.
3. **How the die behaves over time** — anything that changes between throws, or
   that hands the player a decision. Nothing here exists yet.

**Lever 1, unclaimed slots.** A polarised die (heavy on both `1` and `6`);
per-face bets other than `3` and `6`. Filler for a collection, not new play.

**Lever 2 — wildcard tiers.** The Devil's Head is currently binary. Between
"ordinary face" and "full wildcard" there is room for a whole family at
different prices: a wildcard that *can* close a single (stronger); one that may
only take a value already present in the throw, so it extends a combination but
never starts one (weaker); one that works only inside straights. Also: more than
one wild face on a die (`DieSpec.wild` would become a set — a small change),
and the same wildcard on each of the six slots as six differently-priced dice,
since what a wildcard costs is exactly what it paints over.

**Lever 2 — faces that aren't pips.** A **blank** face that never scores and
can never be kept: pure downside, and therefore the currency that pays for
something strong elsewhere. A **multiplier** face, worth nothing alone but
doubling the keep it joins — the first die that would change how a keep is
*assembled* rather than how often it appears, since it rewards keeping dice
together instead of slicing them. A **flat-value** face worth a fixed 25,
outside every combination, as farkle insurance.

**Lever 3 — dice that change between throws.** A **cooling** die whose weights
decay with each throw within a turn (its first throw is excellent, so it argues
for banking early) and a **warming** one that improves (it argues for pushing,
and for farkling more). These are the first dice that would disagree with a
bot's strategy rather than merely improve its odds. Also: a die that only wakes
up after hot dice; a **pity counter** that gains weight on the `1` face with
every farkle and resets when it pays, smoothing variance without changing
average strength; a die whose weights depend on the score gap, as a comeback
mechanic carried by an item rather than by a rule.

**Lever 3 — dice that grant an action.** A die that may be **re-thrown** once
per turn after seeing the throw — statistics turned into a decision. A die that
converts one farkle per match into "keep one die and carry on". A **wager** die
that scores at 1.5× but puts banked points at risk on a farkle, the only idea
here whose risk outlives the turn. A die that takes points from an opponent —
Farkle has no player interaction at all, and this is the only way to add it,
which also makes it the furthest from the current game.

Cost rises sharply with the lever. Levers 1 and 2 are `DieSpec` and the
partitioner. Lever 3 breaks the assumption that a die *is* six numbers: it
needs per-die state inside `GameState`, new events, new actions for the
action-granting cases, and bots that know what to do with all of it. Nothing in
levers 1 and 2 requires touching the `GameHost` seam; everything in lever 3
does.

### Brainstormed candidates (not yet built)

A design session following an ad hoc round-robin tournament (every roster die
plus three hand-picked King/Queen mixes, played all-vs-all by the `smart` bot —
not yet written up as a dated research doc) produced ten concrete die
candidates and four synergy candidates, grouped below by how much of the
engine each would touch.
None of these are scheduled or balanced; weights and point values below are
starting guesses for a future tuning pass, not shipped numbers. Recorded here so
the ground isn't re-covered next time — see "Directions for later dice" above for
the lever framework these sit inside.

#### Low-complexity dice (lever 1/2 — weights and a single `wild` pip only)

No engine change beyond a new `DieSpec` entry; all five fit the exact shape the
roster already uses.

- **Trickster's die.** `devil`'s twin with the wild pip moved from `1` to `5` —
  it gives up the cheap 50-point single instead of the expensive 100-point one.
  Every wild pip currently sits on a face that either scores big (`devil`'s `1`)
  or nothing at all (`king`, `queen`, `imp`); nobody trades away the *cheap*
  single yet, which should land as a lower-cost, possibly stronger cousin of
  `devil`.
- **Ledger die.** `worn` with a second zeroed face instead of one (two dead
  slots, four live ones). Nobody has explored "how safe can a die get" past
  `worn`'s single dead face — this is the next point on that curve, and it's an
  open question whether cutting the outcome space further helps (fewer distinct
  farkle-prone throws) or hurts (fewer faces to complete an of-a-kind with).
- **Merchant's die.** `weighted` biases only `1`; `trader` biases only `5`.
  Nobody biases both scoring singles in the same die. A plain middle ground
  that closes the obvious gap between the two.
- **Loudmouth's die.** Every wild die shipped so far (`devil`, `king`, `queen`,
  `imp`) keeps the wild pip's own weight equal to or lighter than its
  neighbours. This one inverts that: the wild pip carries the heaviest weight
  on the die, so the wildcard shows up on a large minority of throws instead of
  a small one — flexibility as the norm rather than the exception, paid for by
  a poorer spread across the other five faces.
- **Coin die.** A bimodal bet: `1` (the cheap single) and `6` (the most
  expensive triple) both raised, with `2`–`5` left thin. Every biased-single die
  so far commits to one payoff shape (a cheap single *or* a triple bet); this
  straddles both in one die instead of choosing.

#### Low-complexity synergies (extend the Crown Bonus's own mechanism)

`scoreKeep` already checks which wildcard sentinels (`WILD`, `WILD_KING`,
`WILD_QUEEN`) are present in a keep to award the Crown Bonus
(`packages/engine/src/scoring.ts`, `CROWN_MULTIPLIER`). Both of these reuse that
exact check with a different sentinel condition and a flat bonus instead of a
multiplier, which keeps them a small, local addition next to the existing one.

- **Devil's Pact.** RULES.md §12 currently rules a Devil's Head paired with
  either crown *out* of the Crown Bonus on purpose (`scoring.ts`'s comment: "two
  Devil's Heads, or a Devil's Head paired with either crown, never qualify").
  This flips that exclusion into its own smaller reward — a keep containing a
  Devil's Head and a King or Queen together pays a flat bonus (not a
  multiplier) instead of nothing, giving `devil` a reason to sit in a royal
  loadout beyond its own raw stats.
- **Paired Devils.** A keep containing two or more Devil's Heads pays a flat
  bonus per wildcard past the first. Purely a count over the existing `WILD`
  sentinel — no new identity needed — and it gives devil-heavy loadouts (pure
  `devil` × 6, or mixes) the same kind of built-in payoff King/Queen loadouts
  already get from the Crown Bonus.

#### Bold dice (lever 3 — react to match state, not just their own weights)

Every one of these needs the same new plumbing: threading some piece of
`GameState` (throw count this turn, both players' totals, per-match flags) down
into `rollDie`, plus a bot policy that knows to react to it. All five are first
drafts of an idea, not tuned designs.

- **Moon die.** Its weights alternate by throw parity within a turn: "bright"
  (heavy `1`/`5`) on odd throws, "dark" (heavy `2`–`4`, favouring triples) on
  even ones. The first die in the roster whose distribution isn't fixed — a
  player has to think about *when* in the turn they throw it, not just whether
  to keep it in the loadout. Needs the current throw's index passed into
  `rollDie`.
- **Underdog die.** While its owner is behind on total score, its `1` weight
  is boosted; level or ahead, it rolls as an ordinary die. Rubber-banding does
  not exist anywhere in the game today — both players' `totals` are already in
  `GameState`, so the missing piece is only getting that comparison down to the
  roll.
- **Phoenix die.** A one-time-per-match insurance: the first farkle in a match
  where this die was on the table doesn't end the turn empty-handed — the
  turn's points bank instead of vanishing, and the die is spent for the rest of
  the match. The die's own weights can afford to be mediocre or worse. The
  first *consumable* in the roster (a `phoenixSpent` flag in `GameState` and one
  branch in the farkle handler), and a genuinely new kind of decision: when to
  spend a one-shot safety net rather than how to read a distribution.
- **Thief's die.** Its `6` is painted with a new sentinel, the way King and
  Queen's crowns are. A banked keep that resolves the sentinel into a triple or
  straight takes a fraction of its value from the *opponent's* total instead of
  purely adding to the owner's. Farkle has no player interaction at all right
  now; this is the only lever-3 idea that would add any, which is also what
  makes it the furthest departure from the current game and the one most worth
  play-testing before committing to.
- **Echo die.** A cheap, constrained wildcard: its wild pip can only resolve to
  a pip value some *real* die in the same keep already shows — it can extend a
  combination but never originate one on its own (unlike every wild face
  shipped today, which resolves freely). Strictly weaker than `devil` face for
  face, which is exactly what should let it ship at a much higher wild
  frequency (a third of throws or more) without breaking the balance band.

#### Bold synergies (also lever 3 — need die identity, not just sentinel presence)

- **Kinship Bonus.** A three-of-a-kind or better made entirely of dice that are
  *the same die id* pays a flat percentage bonus on top of its normal value.
  Every dice-balance research doc so far (loadout-lab, the M9 round robin) has
  found the same thing: mixed loadouts are almost always worse than pure ones.
  This turns that finding into a deliberate rule-level trade-off — a pure
  loadout gets a scoring bonus a mixed one gives up for flexibility — rather
  than leaving it as an incidental fact about the roster. Needs each rolled
  face to carry which `DieSpec` produced it through to `scoreKeep`, which
  ordinary pips don't do today (only the wildcard sentinels carry identity).
- **Full Court.** A keep that resolves a King, a Queen, *and* a Devil's Head
  all at once — currently the one three-sentinel combination the Crown Bonus
  explicitly locks out — pays a large flat jackpot (straight-sized, roughly
  2000) instead of the ordinary Crown multiplier. Reuses the Crown Bonus's own
  sentinel-presence check with a third condition and one more constant; the
  design payoff is turning today's "excluded" combination into a rare, telegraphed
  event worth deliberately drafting `king` + `queen` + `devil` into one loadout
  for, which right now is a strictly worse choice than a pure 3:3 King/Queen
  split.

## 6. Bots

A bot is a policy over the same information a human sees:

```ts
interface BotPolicy {
  chooseKeep(view: ClientView, options: KeepOption[]): KeepOption;
  decideAfterKeep(view: ClientView): 'Throw' | 'Bank';
}
```

Both decisions are genuinely separate. Choosing the maximum-scoring keep is often
wrong: taking 1200 and leaving one die in play is usually worse than taking 600
and leaving three, because the farkle probability on a single die is roughly
two-thirds.

### Parameterised policy

One implementation, `ThresholdBot`, covers the whole personality range:

```ts
type BotParams = {
  bankAt: number;            // bank once turn score reaches this
  minDiceToThrow: number;    // refuse to throw with fewer dice in play than this
  diceValue: number;         // points a bot will forgo to leave one more die in play
  hotDiceAlwaysThrow: boolean;
  desperationMargin: number; // ignore bankAt when an opponent is this close to the target
  catchUpBonus: number;      // extra bankAt per point of deficit
  mistakeRate: number;       // chance of picking a deliberately worse option
};
```

`chooseKeep` ranks options by `points + diceValue × diceLeft × safetyRatio` —
`safetyRatio` (`packages/bots/src/odds.ts`) is how much safer or riskier the
specific dice a keep leaves behind are, versus the same count of ordinary
dice; it is exactly 1 on an all-balanced loadout, so this is a strict
extension of the original `points + diceValue × diceLeft` formula rather
than a behaviour change for any bot that never sees a die outside
`DICE.balanced`. `minDiceToThrow` in `decideAfterKeep` is read the same
way — a farkle-risk ceiling rather than a bare count — with the same
balanced-loadout fallback. Both fall back to the plain, pre-M5 formula
whenever a `KeepOption`/`ClientView` doesn't carry die identities (any view
not built by `viewOf`, e.g. a hand-built test fixture), since there is then
nothing to price the risk from.

`decideAfterKeep` banks when the turn score clears an effective threshold
derived from `bankAt`, the deficit and the opponent's distance to the
target.

### Personalities

Presets over those parameters, tuned by simulation rather than by taste:

| Name | Character | Shape |
|---|---|---|
| `cautious` | risk-averse | low `bankAt`, high `minDiceToThrow`, positive `diceValue` |
| `balanced` | reasonable | middling everything |
| `aggressive` | risk-seeking | high `bankAt`, throws on two dice, greedy keeps |
| `reckless` | gambler | very high `bankAt`, always takes hot dice |
| `novice` | beatable | `balanced` with a meaningful `mistakeRate` |

### Simulation harness

The CLI runs headless matches between any two personalities:

```
farkle sim --a cautious --b aggressive -n 100000 --seed 42
```

It reports win rate with a confidence interval, plus average turn score, farkle
rate and turns per match. This is what makes personalities more than flavour
text: it shows whether a parameter actually changes outcomes, catches presets
that are strictly dominated, and gives a difficulty ladder grounded in measured
win rates instead of guesses.

An optimal-play solver would let us state how far each personality sits from
perfect play. That is deliberately deferred — see PLAN.md M6.

The harness does not yet accept a loadout argument, so `devil`/`odd`/`cheat`
have not been run through it the way the five presets above were — see
PLAN.md M5.

## 7. Requirements

**Functional.** Matches of two to four players in any mix of human and bot;
configurable target score; the full KCD2 scoring table; hot dice; farkle; manual
die selection with a live score readout and clear indication of which
combinations were read; selectable bot personalities; weighted dice with visible
distributions; a per-match event log that can be replayed from its seed.

**Non-functional.** The engine is deterministic, dependency-free and
exhaustively tested. Bot moves feel immediate — any search runs in a worker
rather than blocking input. The game runs offline as static files. Match state
survives a page reload. The UI is usable on a phone. All repository content,
including code, comments, commit messages and docs, is written in English.

## 8. Direction after v1

Roughly in order of expected value:

**Stronger opponents and hints.** Optimal play in Farkle is computable rather
than heuristic, which gives both a genuinely hard bot and a "what would perfect
play do here" overlay for the player. PLAN.md M6.

**A collection and opponents with character.** Dice as rewards, opponents with
their own loadouts and personalities, wagers, progression. This is the meta-game
that replaces the badge system deliberately left out of scope.

**Optional rule sets.** The KCD1 combinations (three pairs, two triples, four
plus a pair) and tabletop conventions like a minimum opening score, as toggles.
The engine's combination table should be data, not code, so this stays cheap.

**Online multiplayer.** The `GameHost` seam already anticipates it; what it
actually needs is a server owning the engine and treating client input as
untrusted, plus matchmaking and reconnection. Explicitly after bots are good.

**Presentation.** 3D dice, a real table, sound.

---

## Appendix A: Splitting front end and back end

The options, and what each is actually for.

**No back end.** Engine and bots ship inside the client; the whole game is static
files. Standard for single-player and hot-seat browser games. Free to host, works
offline, no latency, nothing to operate. No cross-device saves and no
authoritative validation — neither of which matters until other people are
involved. *This is v1.*

**Shared core, thin server added later.** The same engine package is imported by
both the client and, eventually, a Node or Bun server. The server owns the match
and validates every action; the client keeps its copy to render legal keeps and
scores instantly without a round trip. Rules exist once, in one language, so the
two can never disagree. This is the dominant pattern for turn-based web games —
`boardgame.io` is essentially this shape as a framework — and it is the target
here.

**Conventional REST or RPC back end** in Python, Go, or Java, with the browser as
a thin renderer. The usual arrangement for CRUD products, and the wrong shape for
this: every throw becomes a network round trip, single-player stops working
offline for no benefit, and the rules must either live only on the server (making
the UI sluggish and unable to preview a keep) or be reimplemented client-side in
another language — two implementations of the trickiest code in the project,
guaranteed to drift.

**Portable core compiled twice.** Rules in Rust or Go, compiled to WASM for the
browser and to a native binary for the server. Genuinely one implementation, and
fast enough that bot tuning sweeps stop being a consideration. The cost is build
complexity and a serialization boundary in the middle of the hot path, paid every
day from day one against a benefit that arrives much later.

**Server-authoritative with client prediction.** What real-time multiplayer
games need. Farkle is turn-based with a human-scale clock; the complexity buys
nothing here.

The general convention for turn-based online games is the second option: the
server is authoritative because clients cannot be trusted, and the client keeps a
rules copy because a UI that must ask a server what a selection is worth feels
broken. Choosing TypeScript for the engine is largely a consequence of wanting
that copy to be literally the same code.
