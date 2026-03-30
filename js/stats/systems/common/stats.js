// ===== STATS SYSTEM =====
// Stat-specific computations like LUK → drop-rate scaling.
// Currently handles lukScaling (Step 1 of DR formula).
// Uses PVStatList from the save — the game's pre-computed total stats
// [STR, AGI, WIS, LUK, level].  Computing TotalLUK from scratch would
// require 30+ source systems; the save value is authoritative.

import { node } from '../../node.js';
import { pvStatListData } from '../../../save/data.js';

function lukCurve(luk) {
  if (luk < 1000) return (Math.pow(luk + 1, 0.37) - 1) / 40;
  return (luk - 1000) / (luk + 2500) * 0.5 + 0.297;
}

export var lukScaling = {
  resolve: function(id, ctx) {
    var charIdx = ctx.charIdx;

    // PVStatList = [STR, AGI, WIS, LUK, level]
    var pvs = pvStatListData[charIdx] || [];
    var totalLUK = Math.floor(Number(pvs[3]) || 0);

    var drLUK = lukCurve(totalLUK);

    return node('LUK Scaling', drLUK, [
      node('Total LUK (from save)', totalLUK, null, { fmt: 'raw' }),
      node(totalLUK < 1000 ? 'Sub-1000 curve' : 'Over-1000 curve', drLUK, null, { fmt: 'raw',
        note: totalLUK < 1000
          ? '(pow(' + totalLUK + '+1, 0.37)-1)/40'
          : '(' + totalLUK + '-1000)/(' + totalLUK + '+2500)*0.5+0.297' }),
    ], { fmt: 'raw' });
  },
};
