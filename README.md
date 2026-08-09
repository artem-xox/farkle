# farkle

A Farkle dice game using the rule set from *Kingdom Come: Deliverance II* —
weighted dice, configurable AI opponents, no badges.

Milestones M0 and M1 are done: the rules engine is exhaustively verified, and
the game is playable end to end in the terminal — hot-seat, full KCD2 scoring,
seeded replay. No bots yet, no browser UI yet.

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

The toolchain is pinned to versions that still run on Node 16, which is what
this machine has. Node 16 is end-of-life; once Node 20+ is available, Vitest and
TypeScript should be upgraded and this note removed.
