import type { SideReport, SimulationReport } from '@farkle/bots';
import type { ClientView, Combo, Face, KeepOption, PlayerView } from '@farkle/engine';

const ESC = String.fromCharCode(27);

const useColour = process.env['NO_COLOR'] === undefined && process.stdout.isTTY === true;

const paint = (code: string) => (text: string) =>
  useColour ? `${ESC}[${code}m${text}${ESC}[0m` : text;

export const bold = paint('1');
export const dim = paint('2');
export const green = paint('32');
export const red = paint('31');
export const yellow = paint('33');

const COUNT_WORDS = ['', '', 'two', 'three', 'four', 'five', 'six'];

/** Names the combination the engine read, so a surprising score can be checked. */
export function describeCombo(combo: Combo): string {
  switch (combo.kind) {
    case 'Single':
      return `a ${combo.faces[0]}`;
    case 'OfAKind':
      return `${COUNT_WORDS[combo.faces.length]} ${combo.faces[0]}s`;
    case 'StraightLow':
      return 'a 1-5 straight';
    case 'StraightHigh':
      return 'a 2-6 straight';
    case 'StraightFull':
      return 'a full straight';
  }
}

export function describeCombos(combos: readonly Combo[]): string {
  return combos.map(describeCombo).join(' + ');
}

/**
 * Boxed digits rather than the Unicode die glyphs: the glyphs are double-width
 * in some terminals, which would misalign the position numbers under the dice.
 */
export function renderDice(faces: readonly Face[], indent = '   '): string {
  if (faces.length === 0) {
    return '';
  }
  const top = `┌${faces.map(() => '───').join('┬')}┐`;
  const middle = `│${faces.map((face) => ` ${bold(String(face))} `).join('│')}│`;
  const bottom = `└${faces.map(() => '───').join('┴')}┘`;
  const labels = faces.map((_, index) => `  ${dim(String(index + 1))} `).join('');
  return [top, middle, bottom, labels].map((line) => indent + line).join('\n');
}

const positionsOf = (keep: KeepOption): string => keep.indices.map((index) => index + 1).join(' ');

export function renderKeepOptions(keeps: readonly KeepOption[], limit = 10): string {
  const shown = keeps.slice(0, limit);
  const width = Math.max(...shown.map((keep) => positionsOf(keep).length));
  const lines = shown.map((keep) => {
    const left = positionsOf(keep).padEnd(width);
    const points = String(keep.points).padStart(5);
    const remaining =
      keep.diceLeft === 0
        ? 'hot dice'
        : `${keep.diceLeft} ${keep.diceLeft === 1 ? 'die' : 'dice'} left`;
    return `     ${left}  ${points}  ${dim(`${describeCombos(keep.combos)} · ${remaining}`)}`;
  });
  if (keeps.length > shown.length) {
    lines.push(dim(`     … and ${keeps.length - shown.length} more`));
  }
  return lines.join('\n');
}

export function renderScoreboard(view: ClientView): string {
  const line = view.players
    .map((player: PlayerView) => {
      const label = `${player.name} ${player.total}`;
      return player.id === view.current ? bold(label) : dim(label);
    })
    .join(dim(' · '));
  return `${line}${dim(` · first to ${view.target}`)}`;
}

export function renderKeptThisTurn(view: ClientView): string {
  return view.keptThisTurn.length === 0 ? dim('nothing yet') : view.keptThisTurn.join(' ');
}

const pct = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`;

function renderSideReport(label: string, side: SideReport): string {
  const [low, high] = side.winRateCI95;
  return [
    `   ${bold(label)}`,
    `     win rate        ${pct(side.winRate)}  ${dim(`(95% CI ${pct(low)}–${pct(high)})`)}`,
    `     avg per bank     ${Math.round(side.avgBankedPerBank)}`,
    `     farkle rate      ${pct(side.farkleRate)}`,
    `     turns per match  ${side.avgTurnsPlayed.toFixed(1)}`,
  ].join('\n');
}

export function renderSimReport(nameA: string, nameB: string, report: SimulationReport): string {
  return [
    `  ${bold(String(report.matches))} matches, avg ${report.avgTurnsPerMatch.toFixed(1)} turns/match`,
    '',
    renderSideReport(nameA, report.a),
    '',
    renderSideReport(nameB, report.b),
  ].join('\n');
}
