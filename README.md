# farkle

A Farkle dice game using the rule set from *Kingdom Come: Deliverance II* —
weighted dice, configurable AI opponents, no badges.

Milestones M0 through M3 are done: the rules engine is exhaustively verified,
and the game is playable end to end both in the terminal and in the browser —
hot-seat or against a bot personality, with full KCD2 scoring, hot dice,
farkle, and win detection. `farkle sim` runs headless bot-vs-bot matches from
the CLI.

- [docs/RULES.md](docs/RULES.md) — the rules, specified precisely enough to test against
- [docs/DESIGN.md](docs/DESIGN.md) — architecture and technology decisions
- [docs/PLAN.md](docs/PLAN.md) — milestones
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — repo map, how to run things, current status

## Development

```bash
npm install
npm test          # vitest, including the exhaustive scoring suite
npm run typecheck
npm run build
npm run play       # build and launch the terminal game
npm run dev:web    # launch the browser game
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full layout and how
things fit together.
