import type { ReactNode } from 'react';

import type { PresetName } from '@farkle/bots';

/*
 * Pixel-art medieval faces for the bot personalities, drawn in the same
 * in-house, no-emoji spirit as the dice faces — but as proper character
 * portraits instead of abstract shapes, so each personality reads as a person
 * sitting across the tavern table.
 *
 * Each face is a 16×16 pixel grid where every cell is a palette key and `.`
 * is transparent; `BotIcon` renders it as an SVG of unit rectangles with
 * `shape-rendering: crispEdges`, so the pixels stay sharp at any size.
 *
 *   cautious   — a hooded elder with a grey beard, wary small eyes
 *   balanced   — a plain brown-haired everyman in a simple tunic
 *   aggressive — a bandit brute, heavy brow, scowl, a gold earring
 *   reckless   — a rogue with a red feathered cap, a grin and an eye patch
 *   novice     — a young squire with big eyes and a green tunic
 *   smart      — a bald scholar with grey hair and a grey beard
 */

/** Accent hue per personality, used for the gallery card's badge ring and its selected glow. */
export const BOT_COLORS: Record<PresetName, { readonly accent: string; readonly glow: string }> = {
  cautious: { accent: '#7fc4d6', glow: 'rgb(127 196 214 / 0.4)' },
  balanced: { accent: '#e6b84f', glow: 'rgb(230 184 79 / 0.4)' },
  aggressive: { accent: '#e68a4f', glow: 'rgb(230 138 79 / 0.4)' },
  reckless: { accent: '#e24f4f', glow: 'rgb(226 79 79 / 0.4)' },
  novice: { accent: '#a9cf87', glow: 'rgb(169 207 135 / 0.4)' },
  smart: { accent: '#b18fe0', glow: 'rgb(177 143 224 / 0.4)' },
};

interface PixelFace {
  readonly grid: readonly string[];
  readonly palette: Record<string, string>;
}

const FACES: Record<PresetName, PixelFace> = {
  balanced: {
    grid: [
      '................',
      '....hhhhhhhh....',
      '..hhhhhhhhhhhh..',
      '..hhsssssssshh..',
      '..hhsssssssshh..',
      '..hhsssssssshh..',
      '..hhsseesseehh..',
      '..hhsssssssshh..',
      '..hhsssssssshh..',
      '..hhssmmmmsshh..',
      '..hhsssssssshh..',
      '..ssssssssssss..',
      '..cccccccccccc..',
      '.cccccccccccccc.',
      '.cccccccccccccc.',
      'cccccccccccccccc',
    ],
    palette: { h: '#6b4a2c', s: '#e2b287', e: '#241108', m: '#8a3a2e', c: '#8a6a3e' },
  },

  cautious: {
    grid: [
      '................',
      '....aaaaaaaa....',
      '..aaaaaaaaaaaa..',
      '..aaAA....AAaa..',
      '..aassssssssaa..',
      '..aassssssssaa..',
      '..aassessessaa..',
      '..aassssssssaa..',
      '..aassssssssaa..',
      '..aassmmmmssaa..',
      '..aassssssssaa..',
      '..bbbbbbbbbbbb..',
      '..bbbbbbbbbbbb..',
      '.aaaaaaaaaaaaaa.',
      '.aaaaaaaaaaaaaa.',
      'aaaaaaaaaaaaaaaa',
    ],
    palette: { a: '#5a6a44', A: '#3c4a2e', s: '#e0b085', e: '#241108', m: '#8a3a2e', b: '#c9c4b8' },
  },

  aggressive: {
    grid: [
      '................',
      '................',
      '....hhhhhhhh....',
      '..hhhhhhhhhhhh..',
      '..hhSSSSSSSShh..',
      '..hhsseesseehh..',
      '..hhsssssssshh..',
      '..hhssSSSSsshh..',
      '..jhsssssssshh..',
      '..hhssmmsmsshh..',
      '..hhsssssssshh..',
      '..bbssssssssbb..',
      '..bbbbbbbbbbbb..',
      '.cccccccccccccc.',
      '.cccccccccccccc.',
      'cccccccccccccccc',
    ],
    palette: {
      h: '#2a2016',
      s: '#d9a37a',
      S: '#b57a4e',
      e: '#1a0f08',
      m: '#5c1f18',
      j: '#c9a06a',
      b: '#3a2e22',
      c: '#3a2e22',
    },
  },

  reckless: {
    grid: [
      '..........fff...',
      '........ffff....',
      '....aaaaaaaa....',
      '..aaaaaaaaaaaa..',
      '..aAA......AAa..',
      '..hhsssssssshh..',
      '..hhssppsseehh..',
      '..hhsssssssshh..',
      '..hhsssssssshh..',
      '..hhssmmmmsshh..',
      '..hhsssssssshh..',
      '..ssssssssssss..',
      '..cccccccccccc..',
      '.cccccccccccccc.',
      '.cccccccccccccc.',
      'cccccccccccccccc',
    ],
    palette: {
      f: '#e8e0d0',
      a: '#8a2e2e',
      A: '#5e1c1c',
      h: '#6b4a2c',
      s: '#e0b085',
      p: '#1a1a1a',
      e: '#241108',
      m: '#7a2e22',
      c: '#4a3b28',
    },
  },

  novice: {
    grid: [
      '................',
      '....hhhhhhhh....',
      '..hhhhhhhhhhhh..',
      '..hhHhhhhhhHhh..',
      '..hhsssssssshh..',
      '..hhsssssssshh..',
      '..hhsseesseehh..',
      '..hhsssssssshh..',
      '..hhsssssssshh..',
      '..hhssmmmmsshh..',
      '..hhsssssssshh..',
      '..ssssssssssss..',
      '..cccccccccccc..',
      '.cccccccccccccc.',
      '.cccccccccccccc.',
      'cccccccccccccccc',
    ],
    palette: { h: '#a97b4a', H: '#7c552f', s: '#ecc19a', e: '#241108', m: '#a04a38', c: '#5f7a4a' },
  },

  smart: {
    grid: [
      '................',
      '................',
      '..hh........hh..',
      '..hhsssssssshh..',
      '..hhsssssssshh..',
      '..hhsssssssshh..',
      '..hhsseesseehh..',
      '..hhsssssssshh..',
      '..hhsssssssshh..',
      '..hhssmmmmsshh..',
      '..hhsssssssshh..',
      '..bbbbbbbbbbbb..',
      '..bbbbbbbbbbbb..',
      '.cccccccccccccc.',
      '.cccccccccccccc.',
      'cccccccccccccccc',
    ],
    palette: { h: '#b3ab9c', s: '#dcae84', e: '#241108', m: '#8a3a2e', b: '#b3ab9c', c: '#3c2e4a' },
  },
};

export interface BotIconProps {
  readonly id: PresetName;
}

/** The personality's pixel-art face, chosen by preset id. */
export function BotIcon({ id }: BotIconProps) {
  return <PixelFace face={FACES[id]} />;
}

function PixelFace({ face }: { readonly face: PixelFace }) {
  const { grid, palette } = face;
  const width = grid[0]?.length ?? 0;
  const height = grid.length;
  const rects: ReactNode[] = [];

  for (let y = 0; y < height; y++) {
    const row = grid[y];
    for (let x = 0; x < width; x++) {
      const key = row[x];
      if (key === '.' || key === undefined) {
        continue;
      }
      const fill = palette[key];
      if (fill === undefined) {
        continue;
      }
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    }
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" shapeRendering="crispEdges" aria-hidden="true">
      {rects}
    </svg>
  );
}
