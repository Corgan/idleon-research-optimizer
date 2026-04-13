// FarmRankUpgBonus(idx) — Farming Rank upgrade bonuses
// Game formula (LankRankUpgBonus):
//   if idx in [4,9,14,19]: max(1, getbonus2(1,207,-1)) * (1 + ExoticBonusQTY(14)/100) * NinjaInfo[36][idx] * FarmRank[2][idx]
//   else: max(1, getbonus2(1,207,-1)) * (1 + ExoticBonusQTY(14)/100) * 1.7 * NinjaInfo[36][idx] * FarmRank[2][idx] / (FarmRank[2][idx] + 80)

import { NinjaInfo } from '../../data/game/customlists.js';
import { saveData } from '../../../state.js';
import { computeExoticBonus } from './farming.js';
import { talent } from '../common/talent.js';

function rval(resolver, id, ctx, args) {
  try { return resolver.resolve(id, ctx, args).val || 0; }
  catch(e) { return 0; }
}

export function farmRankUpgBonus(idx, activeCharIdx) {
  var s = saveData;
  var farmRank2 = s.farmRankData && s.farmRankData[2];
  if (!farmRank2) return 0;
  var rankLv = Number(farmRank2[idx]) || 0;
  if (rankLv <= 0) return 0;

  // getbonus2(1, 207, -1) = max talent 207 across all chars
  // Game uses the active character's context for AllTalentLVz
  var t207 = rval(talent, 207, { saveData: s, charIdx: activeCharIdx || 0 }, { mode: 'max' });
  var talentMult = Math.max(1, t207);

  var exotic14 = 0;
  try { exotic14 = computeExoticBonus(14) || 0; } catch(e) {}

  var basePerLv = Number(NinjaInfo[36] && NinjaInfo[36][idx]) || 0;

  if (idx === 4 || idx === 9 || idx === 14 || idx === 19) {
    // Linear: no decay
    return talentMult * (1 + exotic14 / 100) * basePerLv * rankLv;
  } else {
    // Decay formula
    return talentMult * (1 + exotic14 / 100) * 1.7 * basePerLv * rankLv / (rankLv + 80);
  }
}
