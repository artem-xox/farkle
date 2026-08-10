# Research notes

Dated, reproducible write-ups of one-off analysis — as opposed to
[DESIGN.md](../DESIGN.md), which documents settled decisions, these are
snapshots: "here's what the numbers said on this date, against this commit."
The roster gets rebalanced over time, so a research file's tables are
expected to go stale — that's why the date and commit are in the header
rather than left implicit.

Filename convention: `YYYY-MM-DD-topic.md`.

Each file should say, near the top:

- the date and the engine commit the numbers were measured against,
- the bot preset(s) used, if simulation is involved,
- which scripts (with the exact commands) produce the tables, so the whole
  thing can be regenerated rather than taken on faith.

If a finding turns out to be durable rather than a one-off snapshot — e.g. a
rule about how a die's dilution behaves — promote it into DESIGN.md with its
own reasoning, the way the "trinity is a set die" note already lives there.
Research files are where such a claim gets discovered and checked, not
necessarily where it stays forever.
