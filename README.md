# farkle

A Farkle dice game using the rule set from *Kingdom Come: Deliverance II* —
weighted dice, configurable AI opponents, no badges.

Milestones M0, M1 and M2 are done: the rules engine is exhaustively verified,
the game is playable end to end in the terminal — hot-seat or against a bot —
with full KCD2 scoring and seeded replay, and `farkle sim` runs headless
bot-vs-bot matches. No browser UI yet.

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
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full layout and how
things fit together.
