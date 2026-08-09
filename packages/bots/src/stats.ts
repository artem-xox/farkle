/** z for a 95% two-sided normal interval. */
const Z_95 = 1.959963984540054;

/**
 * Wilson score interval for a binomial proportion. Preferred over the normal
 * (Wald) approximation here because a badly tuned bot preset can easily push
 * the observed win rate toward 0 or 1, exactly where the normal approximation
 * degrades — Wilson stays sane at the edges and never leaves `[0, 1]`.
 */
export function wilsonInterval(
  successes: number,
  trials: number,
  z = Z_95,
): readonly [number, number] {
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new RangeError(`trials must be a positive integer, got ${trials}`);
  }
  if (!Number.isInteger(successes) || successes < 0 || successes > trials) {
    throw new RangeError(`successes (${successes}) must be an integer within [0, ${trials}]`);
  }

  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const centre = (p + z2 / (2 * trials)) / denominator;
  const halfWidth = (z / denominator) * Math.sqrt(p * (1 - p) / trials + z2 / (4 * trials * trials));

  return [Math.max(0, centre - halfWidth), Math.min(1, centre + halfWidth)];
}
