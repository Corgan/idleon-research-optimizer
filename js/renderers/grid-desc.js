// ===== grid-desc.js - Grid Node Description Formatting =====
// Extracted from upgrade-eval.js to break dashboard ↔ upgrade-eval circular import.

import { RES_GRID_RAW } from '../game-data.js';
import { optionsListData } from '../save/data.js';

// Compute Grid_Bonus mode 2 (total/scaled values for $ and ^ placeholders)
function _gridBonusMode2(nodeIdx, curBonus, lvOverride, sc) {
  switch (nodeIdx) {
    case 31: return 25 * (lvOverride != null ? lvOverride : (sc.gridLevels[31] || 0));
    case 67: case 68: case 107: return curBonus * sc.cachedBoonyCount;
    case 94: {
      let t = 0; for (let i = 0; i < sc.insightLvs.length; i++) t += sc.insightLvs[i] || 0;
      return curBonus * t;
    }
    case 112: {
      let f = 0; for (let i = 0; i < sc.occFound.length; i++) if (sc.occFound[i] >= 1) f++;
      return curBonus * f;
    }
    case 151: return Number(optionsListData?.[500]) || 0;
    case 168: return curBonus; // Glimbo trades not tracked
    default: return curBonus;
  }
}

// Format description with all game placeholders resolved
export function formatDesc(nodeIdx, lvOverride, sc) {
  const info = RES_GRID_RAW[nodeIdx];
  if (!info) return '';
  const lv = lvOverride != null ? lvOverride : (sc.gridLevels[nodeIdx] || 0);
  const bonusPerLv = info[2];
  const curBonus = bonusPerLv * lv;
  const curBonusClean = parseFloat(curBonus.toFixed(4));
  const multiStr = (1 + curBonus / 100).toFixed(2);
  const g = v => '<b style="color:var(--green)">' + v + '</b>';

  let desc = (info[3] || '').replace(/_/g, ' ');
  desc = desc.replace(/ ?@ ?/g, ' \u2014 ');
  if (nodeIdx === 173) desc = desc.replace('<', 'Arctis grid bonus');
  desc = desc.replace(/\|/g, g(lv));
  desc = desc.replace(/\{/g, g(curBonusClean));
  desc = desc.replace(/\}/g, g(multiStr));
  if (desc.includes('$')) {
    const v = _gridBonusMode2(nodeIdx, curBonus, lvOverride, sc);
    desc = desc.replace(/\$/g, g(Math.round(v * 100) / 100));
  }
  if (desc.includes('^')) {
    const v = _gridBonusMode2(nodeIdx, curBonus, lvOverride, sc);
    desc = desc.replace(/\^/g, g((1 + v / 100).toFixed(2)));
  }
  if (desc.includes('&')) {
    const olaVal = Number(optionsListData?.[499]) || 0;
    desc = desc.replace(/&/g, g(Math.floor(1e4 * (1 - 1 / (1 + olaVal / 100))) / 100));
  }
  return desc;
}
