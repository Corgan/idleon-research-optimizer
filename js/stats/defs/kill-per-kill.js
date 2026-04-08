// ===== KILL PER KILL DESCRIPTOR =====
// KillPerKill (multikill) formula from ArbitraryCode("KillPerKill").
// Map-dependent base + multiplicative chain.
// Scope: character+map (depends on current map for world range).

import { companions, pristineBon, vaultUpgBonus, votingBonusz } from '../systems/common/goldenFood.js';
import { label } from '../entity-names.js';
import { mainframeBonus } from '../systems/w4/lab.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { talent } from '../systems/common/talent.js';
import { legendPTSbonus, computeBigFishBonus } from '../systems/w7/spelunking.js';
import { computeWinBonus } from '../systems/w6/summoning.js';
import { computeMeritocBonusz } from '../systems/w7/meritoc.js';
import { pvStatListData, currentMapData } from '../../save/data.js';
import { computeTotalStat } from '../systems/common/stats.js';
import { isBubblePrismad, getPrismaBonusMult } from '../systems/w2/alchemy.js';
import { AlchemyDescription } from '../data/game/customlists.js';
import { cauldronInfoData, numCharacters, prayersPerCharData, charClassData } from '../../save/data.js';
import { bubbleParams } from '../data/w2/alchemy.js';
import { prayerBaseBonus } from '../data/w3/prayer.js';
import { formulaEval } from '../../formulas.js';
import { rogBonusQTY } from '../systems/w7/sushi.js';
import { saveData } from '../../state.js';
import { computeFamBonusQTY, computeWorkbenchStuff } from '../systems/common/stats.js';
import { computeDivinityMajor } from '../systems/w5/divinity.js';
import { computeExoticBonus } from '../systems/w6/farming.js';
import { bubbaRoGBonuses } from '../systems/w7/bubba.js';

function rval(resolver, id, ctx, args) {
  try { return resolver.resolve(id, ctx, args).val || 0; }
  catch(e) { return 0; }
}

function safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;
  } catch(e) { return 0; }
}

function bubbleValByKey(key, charIdx) {
  for (var c2 = 0; c2 < 4; c2++) {
    var arr = AlchemyDescription[c2];
    if (!arr) continue;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i][15] === key) {
        var lv = Number((cauldronInfoData && cauldronInfoData[c2] && cauldronInfoData[c2][i]) || 0);
        if (lv <= 0) return 0;
        var baseVal = formulaEval(arr[i][3], Number(arr[i][1]), Number(arr[i][2]), lv);
        var isPrisma = isBubblePrismad(c2, i);
        var prismaMult = isPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
        var val = baseVal * prismaMult;
        var cls = Number(charClassData && charClassData[charIdx]) || 0;
        if (cls > 6 && i !== 16 && i < 30 &&
            key.indexOf('passz') < 0 && key.indexOf('ACTIVE') < 0 && key.indexOf('AllCharz') < 0) {
          if (c2 === 0 && cls < 18 && key !== 'Construction') {
            val *= Math.max(1, bubbleValByKey('Opassz'));
          } else if (c2 === 1 && cls >= 18 && cls < 30) {
            val *= Math.max(1, bubbleValByKey('Gpassz'));
          } else if (c2 === 2 && cls >= 30 && cls < 42) {
            val *= Math.max(1, bubbleValByKey('Ppassz'));
          }
        }
        return val;
      }
    }
  }
  return 0;
}

function computePrayerReal(prayerIdx, costIdx, ci) {
  var s = saveData;
  var prayerLv = Number(s.prayOwnedData && s.prayOwnedData[prayerIdx]) || 0;
  if (prayerLv <= 0) return 0;
  var equipped = false;
  try { equipped = (prayersPerCharData[ci] || []).includes(prayerIdx); } catch(e) {}
  if (!equipped) return 0;
  var base = safe(prayerBaseBonus, prayerIdx, costIdx);
  var scale = Math.max(1, 1 + (prayerLv - 1) / 10);
  return Math.round(base * scale);
}

export default {
  id: 'kill-per-kill',
  name: 'Kill Per Kill (Multikill)',
  scope: 'character',
  category: 'multiplier',

  pools: {},

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
      kpkDumm = safe(computeBigFishBonus, 3);
      worldEtcId = 'BigFish(3)';
    }

    // KpKDumm2 — stat-based talent bonus (not for W7+)
    var kpkDumm2 = 0;
    if (mapIdx < 300) {
      var totalSTR = Number((pvStatListData[ci] || [])[0]) || 0;
      var totalAGI = Number((pvStatListData[ci] || [])[1]) || 0;
      var totalWIS = Number((pvStatListData[ci] || [])[2]) || 0;
      var talent141 = rval(talent, 141, ctx);
      var talent366 = rval(talent, 366, ctx);
      var talent531 = rval(talent, 531, ctx);
      kpkDumm2 = talent141 * (totalSTR / 1000) + talent366 * (totalAGI / 1000)
        + talent531 * (totalWIS / 1000);
    }

    // OverkillStuffs("3") check — simplified: assume overkill is active if char has damage
    // Game checks if damage > 10 * monsterHP, but we approximate as active
    var overkillActive = true;

    // Multiplicative chain (when overkill active)
    var mf4 = Math.max(1, safe(mainframeBonus, 4));
    var comp14 = 1 + safe(companions, 14);
    var comp29 = 1 + safe(companions, 29);
    var comp154 = 1 + safe(companions, 154);
    var etc96 = 1 + rval(etcBonus, '96', ctx) / 100;
    var etc103 = 1 + rval(etcBonus, '103', ctx) / 100;

    // FamBonus28 + Voting5
    var famBonus28 = safe(computeFamBonusQTY, 28);
    var voting5 = safe(votingBonusz, 5, 1);
    var kpkAdditive1 = 1 + (kpkDumm + famBonus28 + voting5) / 100;

    // Divinity Major bonus 7
    var divMajor7 = safe(computeDivinityMajor, ci, 7);
    var divMajorMult = Math.max(1, 1 + divMajor7);

    // Second additive group
    var talent109 = rval(talent, 109, ctx);
    var workbenchMultiKill = safe(computeWorkbenchStuff);
    var kpkBubble = safe(bubbleValByKey, 'kpkACTIVE', ci);
    var prayer13 = computePrayerReal(13, 0, ci);
    var pristine6 = safe(pristineBon, 6);
    var exotic56 = safe(computeExoticBonus, 56);
    var legend16 = safe(legendPTSbonus, 16);
    var bubbaRoG5 = safe(bubbaRoGBonuses, 5);
    var vault64 = safe(vaultUpgBonus, 64);

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
    if (rval(etcBonus, '96', ctx) > 0) children.push({ name: 'EtcBonuses(96)', val: etc96, fmt: 'x' });
    if (rval(etcBonus, '103', ctx) > 0) children.push({ name: 'EtcBonuses(103)', val: etc103, fmt: 'x' });
    children.push({ name: 'World KpK (' + worldEtcId + ')', val: kpkAdditive1, fmt: 'x',
      note: 'map=' + mapIdx + ' kpkDumm=' + kpkDumm.toFixed(1) });
    if (divMajorMult > 1) children.push({ name: 'Divinity Major 7', val: divMajorMult, fmt: 'x' });

    var add2ch = [];
    if (kpkDumm2 > 0) add2ch.push({ name: 'Stat-based talents', val: kpkDumm2, fmt: 'raw' });
    if (talent109 > 0) add2ch.push({ name: label('Talent', 109), val: talent109, fmt: 'raw' });
    if (kpkBubble > 0) add2ch.push({ name: 'Bubble kpkACTIVE', val: kpkBubble, fmt: 'raw' });
    if (prayer13 > 0) add2ch.push({ name: label('Prayer', 13), val: prayer13, fmt: 'raw' });
    if (pristine6 > 0) add2ch.push({ name: label('Pristine', 6), val: pristine6, fmt: 'raw' });
    if (legend16 > 0) add2ch.push({ name: label('Legend', 16), val: legend16, fmt: 'raw' });
    if (vault64 > 0) add2ch.push({ name: label('Vault', 64), val: vault64, fmt: 'raw' });
    children.push({ name: 'Additive KpK Pool', val: kpkAdditive2, fmt: 'x',
      children: add2ch.length ? add2ch : null });

    return { val: val, children: children };
  }
};
