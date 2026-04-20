// ===== KILL PER KILL DESCRIPTOR =====
// KillPerKill (multikill) formula from ArbitraryCode("KillPerKill").
// Map-dependent base + multiplicative chain.
// Scope: character+map (depends on current map for world range).

import { companion } from '../systems/common/companions.js';
import { vault } from '../systems/common/vault.js';
import { pristine } from '../systems/w6/sneaking.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { label } from '../entity-names.js';
import { mainframeBonus } from '../systems/w4/lab.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { talent } from '../systems/common/talent.js';
import { legendPTSbonus, computeBigFishBonus } from '../systems/w7/spelunking.js';
import { computeWinBonus } from '../systems/w6/summoning.js';
import { computeMeritocBonusz } from '../systems/w7/meritoc.js';
import { currentMapData } from '../../save/data.js';
import { computeTotalStat } from '../systems/common/stats.js';
import { bubbleValByKey, getPrismaBonusMult } from '../systems/w2/alchemy.js';
import { AlchemyDescription } from '../data/game/customlists.js';
import { numCharacters } from '../../save/data.js';
import { bubbleParams } from '../data/w2/alchemy.js';
import { rogBonusQTY } from '../systems/w7/sushi.js';
import { computeFamBonusQTY, computeWorkbenchStuff } from '../systems/common/stats.js';
import { computeDivinityMajor } from '../systems/w5/divinity.js';
import { computeExoticBonus } from '../systems/w6/farming.js';
import { bubbaRoGBonuses } from '../systems/w7/bubba.js';
import { safe, rval, createDescriptor } from './helpers.js';
import { computePrayerReal } from '../systems/w3/prayer.js';
import { computeOverkillTier } from '../systems/common/overkill.js';

export default createDescriptor({
  id: 'kill-per-kill',
  name: 'Kill Per Kill (Multikill)',
  scope: 'character',
  category: 'multiplier',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 1, children: null };
    var ci = ctx.charIdx || 0;
    var mapIdx = ctx.mapIdx != null ? ctx.mapIdx : (currentMapData && currentMapData[ci]) || 0;

    // World-dependent KpKDumm — which EtcBonuses index to use
    var kpkDumm = 0;
    var worldEtcId = null;
    if (mapIdx >= 100 && mapIdx < 150) { kpkDumm = rval(etcBonus, '68', ctx); worldEtcId = '68'; }
    else if (mapIdx >= 150 && mapIdx < 200) { kpkDumm = rval(etcBonus, '69', ctx); worldEtcId = '69'; }
    else if (mapIdx >= 50 && mapIdx < 100) { kpkDumm = rval(etcBonus, '70', ctx); worldEtcId = '70'; }
    else if (mapIdx >= 200 && mapIdx < 250) { kpkDumm = rval(etcBonus, '73', ctx); worldEtcId = '73'; }
    else if (mapIdx >= 250 && mapIdx < 300) { kpkDumm = rval(etcBonus, '90', ctx); worldEtcId = '90'; }
    else if (mapIdx >= 300 && mapIdx < 350) {
      // W7: BigFishBonuses(3) — from spelunking
      kpkDumm = safe(computeBigFishBonus, 3, s);
      worldEtcId = 'BigFish(3)';
    }

    // KpKDumm2 — stat-based talent bonus (not for W7+)
    var kpkDumm2 = 0;
    if (mapIdx < 300) {
      var _strR = computeTotalStat('STR', ci, ctx); var totalSTR = _strR.computed;
      var _agiR = computeTotalStat('AGI', ci, ctx); var totalAGI = _agiR.computed;
      var _wisR = computeTotalStat('WIS', ci, ctx); var totalWIS = _wisR.computed;
      var talent141 = rval(talent, 141, ctx);
      var talent366 = rval(talent, 366, ctx);
      var talent531 = rval(talent, 531, ctx);
      kpkDumm2 = talent141 * (totalSTR / 1000) + talent366 * (totalAGI / 1000)
        + talent531 * (totalWIS / 1000);
    }

    // OverkillStuffs("3"): overkill is active if tier >= 2 (dmg ≥ HP * exp * exp^1)
    var okInfo = computeOverkillTier(ci, ctx, { mapIdx: mapIdx });
    var overkillActive = okInfo.tier >= 2;

    // Multiplicative chain (when overkill active)
    var mf4 = Math.max(1, safe(mainframeBonus, 4, s));
    var comp14 = 1 + rval(companion, 14, ctx);
    var comp29 = 1 + rval(companion, 29, ctx);
    var comp154 = 1 + rval(companion, 154, ctx);
    var etc96 = 1 + rval(etcBonus, '96', ctx) / 100;
    var etc103 = 1 + rval(etcBonus, '103', ctx) / 100;

    // FamBonus28 + Voting5
    var famBonus28 = safe(computeFamBonusQTY, 28, s);
    var voting5 = safe(votingBonusz, 5, 1, s);
    var kpkAdditive1 = 1 + (kpkDumm + famBonus28 + voting5) / 100;

    // Divinity Major bonus 7
    var divMajor7 = safe(computeDivinityMajor, ci, 7, s);
    var divMajorMult = Math.max(1, 1 + divMajor7);

    // Second additive group
    var talent109 = rval(talent, 109, ctx);
    var workbenchMultiKill = safe(computeWorkbenchStuff, s);
    var kpkBubble = safe(bubbleValByKey, 'kpkACTIVE', ci, s);
    var prayer13 = computePrayerReal(13, 0, ci, ctx.saveData);
    var pristine6 = rval(pristine, 6, ctx);
    var exotic56 = safe(computeExoticBonus, 56, s);
    var legend16 = safe(legendPTSbonus, 16, s);
    var bubbaRoG5 = safe(bubbaRoGBonuses, 5, s);
    var vault64 = rval(vault, 64, ctx);

    var kpkAdditive2;
    if (overkillActive) {
      kpkAdditive2 = 1 + (kpkDumm2 + talent109 + workbenchMultiKill + kpkBubble
        + prayer13 + pristine6 + exotic56 + legend16 + bubbaRoG5 + vault64) / 100;
    } else {
      // Non-overkill path: same but WITHOUT workbenchMultiKill
      kpkAdditive2 = 1 + (kpkDumm2 + talent109 + kpkBubble
        + prayer13 + pristine6 + exotic56 + legend16 + bubbaRoG5 + vault64) / 100;
    }

    var val = mf4 * comp14 * comp29 * comp154 * etc96 * etc103
      * kpkAdditive1 * divMajorMult * kpkAdditive2;

    if (val !== val || val == null) val = 1;

    var children = [];
    children.push({ name: label('Mainframe', 4), val: mf4, fmt: 'x' });
    if (comp14 > 1) children.push({ name: label('Companion', 14), val: comp14, fmt: 'x' });
    if (comp29 > 1) children.push({ name: label('Companion', 29), val: comp29, fmt: 'x' });
    if (comp154 > 1) children.push({ name: label('Companion', 154), val: comp154, fmt: 'x' });
    if (rval(etcBonus, '96', ctx) > 0) children.push({ name: label('EtcBonus', 96), val: etc96, fmt: 'x' });
    if (rval(etcBonus, '103', ctx) > 0) children.push({ name: label('EtcBonus', 103), val: etc103, fmt: 'x' });
    children.push({ name: 'World KpK (' + worldEtcId + ')', val: kpkAdditive1, fmt: 'x',
      note: 'map=' + mapIdx + ' kpkDumm=' + kpkDumm.toFixed(1) });
    if (divMajorMult > 1) children.push({ name: 'Divinity Major 7', val: divMajorMult, fmt: 'x' });

    var add2ch = [];
    if (kpkDumm2 > 0) add2ch.push({ name: 'Stat-based talents', val: kpkDumm2, fmt: 'raw' });
    if (talent109 > 0) add2ch.push({ name: label('Talent', 109), val: talent109, fmt: 'raw' });
    if (kpkBubble > 0) add2ch.push({ name: 'Bubble: Kill Per Kill', val: kpkBubble, fmt: 'raw' });
    if (prayer13 > 0) add2ch.push({ name: label('Prayer', 13), val: prayer13, fmt: 'raw' });
    if (pristine6 > 0) add2ch.push({ name: label('Pristine', 6), val: pristine6, fmt: 'raw' });
    if (legend16 > 0) add2ch.push({ name: label('Legend', 16), val: legend16, fmt: 'raw' });
    if (vault64 > 0) add2ch.push({ name: label('Vault', 64), val: vault64, fmt: 'raw' });
    children.push({ name: 'Additive KpK Pool', val: kpkAdditive2, fmt: 'x',
      children: add2ch.length ? add2ch : null });

    return { val: val, children: children };
  }
});
