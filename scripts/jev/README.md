# Jev benchmark

`bench.mjs` measures how well [Jev](https://docs.typesafe.ai) — TypeSafe's
System One model, wired up as a bot policy in `packages/jev` — actually plays,
against any of the tuned `ThresholdBot` presets.

It lives here rather than inside `farkle sim` because it is measurement, not a
shipped feature: every decision is a network round trip, a run costs real
money, and `runSimulation` is synchronous by design (it plays a hundred
thousand matches in seconds, which this cannot). Same line the
[dice-balance scripts](../dice-balance/README.md) sit on.

```bash
npm run build
export TYPESAFE_API_KEY=…            # or: set -a; source .env; set +a
node scripts/jev/bench.mjs -n 800 --target 2000 --seed 42
```

| Flag | Default | |
|---|---|---|
| `-n`, `--matches` | 200 | matches to play |
| `--opponent` | `smart` | which preset to play against |
| `--target` | 2000 | score to win |
| `--loadout` | `balanced` | one die id for all six slots, or exactly six comma-separated ids — applied to **both** seats |
| `--seed` | 42 | reproduces the *dice*, never Jev's moves |
| `--concurrency` | 6 | requests in flight; 6 × ~300 ms is the documented 1 200/min ceiling |
| `--out` | — | also write the report as JSON |
| `--yes` | — | skip the "spend it?" prompt |

It prints what `farkle sim` prints — win rate with a 95% Wilson interval,
farkle rate, points per bank — plus what only a model has: mean confidence,
how often a decision fell back to `smart` and why, latency, tokens and cost.

**On cost.** Requests scale with the target, at roughly `target / 200` per
match for one seat (measured: 4.2 at 800, 9.8 at 2000, 20.1 at 4000), around
2 200 input tokens each at $0.042/MTok. So 800 matches at the default target
is about 7 800 requests and well under a dollar. The script estimates before
it starts and asks.

**On the loadout.** One flag for both seats, unlike `farkle sim`'s
`--loadout-a`/`--loadout-b`: there the dice are what is being compared, here
they are the control and the policies are the subject. Pick the `--target` to
suit the dice — a crown set reaches 2000 in two turns, which leaves a policy
almost nothing to decide. Aim for a match of roughly six turns: 6000 for three
kings and three queens, 4000 for six Devil's Heads, 2000 for ordinary dice.

**On the seed.** It makes the dice reproducible and nothing else. Jev is not a
deterministic policy and no seed will make it one — see
[DESIGN.md §6](../../docs/DESIGN.md#6-bots).

Results are written up in
[docs/researches/](../../docs/researches/), dated, with the command that
produced them.
