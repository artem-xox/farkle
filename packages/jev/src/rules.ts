/**
 * The rules, for a reader that cannot do arithmetic.
 *
 * `docs/RULES.md` is the normative reference and this is not a substitute for
 * it — it is a translation, and it must be kept in step by hand when the rules
 * there change. It is written rather than generated because the audience is
 * unusual: Jev 1.13 "does not count reliably" and is weak at numeric
 * comparison, and a large state makes it harder to tell which part produced a
 * wrong answer (https://docs.typesafe.ai/model-jaggedness/jev-1.13.md). So
 * this says what each rule *means* for a decision, drops the parts a player
 * never decides anything with (die weights, test vectors, the deviations
 * section), and leaves every number that does survive as a plain fact to be
 * recognised rather than a sum to be worked out.
 *
 * The scoring table is here because a player has to recognise what a throw is
 * worth. Nothing downstream asks Jev to *add* any of it up: `describe.ts`
 * hands over each option's points already totalled by the engine.
 */
export const RULES_DIGEST = `
Farkle, as played in Kingdom Come: Deliverance II. Two players race to a
target score. The first player whose BANKED total reaches the target wins
immediately. Points held in the current turn never win anything — only
banked points count.

A turn:
- You throw the dice in play. A turn starts with six.
- If the throw contains nothing that scores, you FARKLE: the turn ends at
  once and every point you had accumulated this turn is lost. Your banked
  total is untouched.
- Otherwise you must set aside ("keep") at least one scoring die. What you
  keep is added to your turn score, and those dice leave play for the rest of
  the turn.
- Then you choose: BANK (add the turn score to your banked total and end the
  turn safely) or THROW AGAIN with only the dice still in play.
- If keeping used up every die in play, you get all six back and may throw
  again with the turn score carried over. This is called hot dice. You may
  bank instead — hot dice is an opportunity, not an obligation.

The tension in the game is entirely in that choice. Throwing again risks
everything accumulated this turn against whatever the next throw might add.
The fewer dice left in play, the likelier the next throw farkles.

What scores:
- A single 1 is worth 100. A single 5 is worth 50.
- No other single die scores. A lone 2, 3, 4 or 6 is worth nothing, and pairs
  never score.
- Three of a kind: three 1s are 1000; three 2s are 200; three 3s are 300;
  three 4s are 400; three 5s are 500; three 6s are 600.
- Four of a kind is worth twice the three-of-a-kind value, five of a kind
  four times it, six of a kind eight times it. Each is one indivisible
  combination, not a triple with leftovers.
- The straight 1-2-3-4-5 is 500. The straight 2-3-4-5-6 is 750. The full
  straight 1-2-3-4-5-6 is 1500.

Keeping dice:
- Every die you keep must take part in one of the combinations above. You may
  never keep a die that scores nothing, so {2,2} and {1,1,1,2} are both
  illegal keeps.
- A keep is read in whatever way is worth the most to you.
- You do not have to keep everything that scores. Keeping fewer dice for
  fewer points leaves more dice in play, and more dice in play means a lower
  chance of farkling on the next throw. Trading points for dice is often the
  right move, and it is the decision this game turns on.

Wildcards:
- Some dice paint one face as a Devil's Head, or as a King's or Queen's
  crown. These roll as wildcards rather than as their printed value.
- A wildcard stands in for whichever value is worth the most in the keep it
  is part of.
- A wildcard can never be a single 1 or a single 5 on its own. It only counts
  toward three-or-more of a kind, or toward a straight. A wildcard with
  nothing to join is worth nothing.
- If one kept combination contains both a King's crown and a Queen's crown,
  that keep's whole value is doubled. Two Devil's Heads do not do this, and
  neither does a King with a Devil's Head — it takes a King and a Queen.
`.trim();
