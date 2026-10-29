import { SpelunkUpg, Spelunky, SpelunkRocks } from '../game/customlists.js';

// ===== SPELUNKING DATA =====
// SpelunkUpg[idx][4] = per-level bonus value for shop upgrade idx
export function spelunkUpgPerLevel(idx) { return Number(SpelunkUpg[idx]?.[4]) || 0; }

export function spelunkCaves() {
  return SpelunkRocks.map((rows, id) => ({
    id, name: String(Spelunky[6][id]).replace(/_/g, ' '),
    capacity: Number(Spelunky[0][id]), bossDepth: Number(Spelunky[7][id]),
    bossOffset: [Number(Spelunky[8][id]), Number(Spelunky[9][id])],
    letter: '_abcdefghijklmnopqrstuvwxyz'[id],
    rocks: rows.map(row => ({ name: row[0], pow: Number(row[1]), hp: Number(row[2]),
      amber: Number(row[3]), scaled: Number(row[4]) === 1,
      growth: Number(row[5]), depth: Number(row[6]), base: Number(row[7]) })),
  }));
}

export function spelunkTools() {
  return Spelunky[13].slice(0, 5).map((name, id) => ({
    id, name, radius: Number(Spelunky[10][id]),
    damage: Number(Spelunky[11][id]), cost: Number(Spelunky[12][id]),
  }));
}

export function spelunkElixirs() {
  return Spelunky[16].map((description, id) => ({
    id, charges: Number(Spelunky[3][id]), quantity: Number(Spelunky[17][id]),
    description: String(description).replace(/_/g, ' ').replace(/@/g, '')
      .replace(/\{/g, String(Spelunky[17][id])),
  }));
}
