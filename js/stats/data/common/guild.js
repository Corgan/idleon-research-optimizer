import { GuildBonuses } from '../game/customlists.js';

// ===== GUILD DATA =====
// GuildBonuses[idx]: [name, icon, icon2, desc, x1, x2, formula, ...]
export function guildBonusParams(idx) {
  var gb = GuildBonuses[idx];
  if (!gb) return null;
  return { x1: Number(gb[4]), x2: Number(gb[5]), formula: gb[6], name: gb[0].replace(/_/g, ' ') };
}
