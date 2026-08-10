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

As of M5, five dice ship:

| id | name | weights | distribution |
|---|---|---|---|
| `balanced` | Ordinary die | `[1,1,1,1,1,1]` | 16.67% per face |
| `weighted` | Weighted die | `[10,1,1,1,1,1]` | 66.7% on `1`, 6.7% each on `2-6` |
| `devil` | Devil's Head die | `[1,1,1,1,1,1]`, `wild: 1` | 16.67% wild, 16.67% each on `2-6` |
| `odd` | Odd die | `[4,3,4,3,4,3]` | 19.0% each on `1/3/5`, 14.3% each on `2/4/6` |
| `cheat` | Cheat's die | `[2,2,2,2,2,5]` | 13.3% each on `1-5`, 33.3% on `6` |

The integer-weight model comes from the source game's own numbers: its published
probabilities are exact fractions over denominators like 13 and 15, which is what
a weighted bag produces and a float table does not.

A player's *loadout* is six dice drawn from their collection, assigned one slot
at a time on its own screen after match setup. Both players default to six
balanced dice; an opponent's loadout is always visible before the match starts
(read-only for a bot opponent in v1 — bots do not yet own a persistent
collection of their own, which is M7 territory).

Whatever dice an opponent uses must be inspectable by the player. Hiding the
distributions in a game whose entire subject is probability would be a bad
trade for atmosphere — the full odds table for every die lives on its own
"Dice" screen rather than folded into Rules.

**`devil`'s weights are a deliberate choice, not a balance result.** The wild
face sits on the `1` slot specifically: pairing that with the ordinary rule
"a wildcard scores unconditionally" would make the die mechanically identical
to `balanced` (a real `1` and an unconditional wildcard are interchangeable to
`hasScoringDice`), so RULES.md §4a instead rules that a wildcard can never
complete a single `1` or `5` on its own — only a bigger combination. Under
that rule `devil` is provably never a *safer* throw than `balanced` in
isolation (see `packages/bots/src/odds.ts`'s tests), trading a guaranteed
floor for flexibility inside triples and straights instead. `odd` and `cheat`'s
weights are reasoned from their names (favour the low/high end respectively)
but, like `devil`, have **not** been validated by a simulation pass the way
the M2 bot presets were — `farkle sim` does not yet accept a loadout
argument. That is the next piece of M5 work, not a finished result.

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
