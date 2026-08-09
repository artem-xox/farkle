# farkle

A Farkle dice game using the rule set from *Kingdom Come: Deliverance II* —
weighted dice, configurable AI opponents, no badges.

Milestone M0 is done: the rules engine scores and validates keeps, and is
verified exhaustively. There is no playable game yet — that is M1.

- [docs/RULES.md](docs/RULES.md) — the rules, specified precisely enough to test against
- [docs/DESIGN.md](docs/DESIGN.md) — architecture and technology decisions
- [docs/PLAN.md](docs/PLAN.md) — milestones

## Development

```bash
npm install
npm test          # vitest, including the exhaustive scoring suite
npm run typecheck
npm run build
```

The toolchain is pinned to versions that still run on Node 16, which is what
this machine has. Node 16 is end-of-life; once Node 20+ is available, Vitest and
TypeScript should be upgraded and this note removed.
