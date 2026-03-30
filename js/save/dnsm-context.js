// ===== DNSM CACHE =====
// Computes or accepts pre-computed values that the game stores in DNSM.
// These are values that require deep computation chains (alchemy bubbles,
// star signs, meals, stamps, etc.) and are cached at game load.
//
// Two modes:
//   1. computeDNSM() — attempts to compute everything from shared state (S).
//      For deeply nested chains that aren't yet implemented, returns 0.
//   2. createDNSM(overrides) — manually inject known values for testing.

import { S } from '../state.js';
import {
  skillLvData, numCharacters, optionsListData, dreamData, klaData,
  charClassData, cauldronInfoData, stampLvData, emmData,
  equipOrderData, labData,
} from './data.js';
import { formulaEval } from './engine.js';
import { gbWith } from '../sim-math.js';
import { node } from '../stats/node.js';
import { computeMeritocBonusz } from '../stats/systems/w7/meritoc.js';
import { legendPTSbonus } from '../stats/systems/w7/spelunking.js';
import { eventShopOwned, ribbonBonusAt } from './helpers.js';
import { computeAllTalentLVz } from '../stats/systems/common/talent.js';
import { mainframeBonus } from '../stats/systems/w4/lab.js';
import { computeWinBonus } from '../stats/systems/w6/summoning.js';
import { computeShinyBonusS } from '../stats/systems/w4/breeding.js';
import {
  COSMO_UPG_BASE, SHIMMERON_BUBBLE, WARRIORS_RULE_BUBBLE, CLASS_TREES,
  FAMILY_BONUS_33, TALENT_144, STAR_SIGN_69_BONUS, ITEMS_WITH_GFOOD_UQ,
  isFightingMap, MAP_KILL_REQS,
} from '../game-data.js';
import { isBubblePrismad, getPrismaBonusMult } from '../stats/systems/w2/alchemy.js';
import { isExalted, computeStampDoublerSources } from '../stats/systems/w1/stamp.js';
import { computeSeraphMulti } from '../stats/systems/common/starSign.js';

/**
 * @typedef {object} DNSM
 * @property {number} famBonusQTYs66 - Family bonus #66 (golden food family bonus)
 * @property {number} etcBonuses8 - EtcBonuses("8") = %_GOLD_FOOD_EFFECT stat
 * @property {number} getTalentNumber1_99 - Talent 99 bonus (Golden Sausage?)
 * @property {number} stampBonusGFood - StampBonusOfTypeX("GFood")
 * @property {number} alchBubblesGFoodz - Alchemy bubble golden food bonus
 * @property {number} mealBonusZGoldFood - Meal bonus for golden food
 * @property {number} starSigns69 - Star sign #69 golden food bonus
 * @property {number} getbonus2_1_209 - Max talent 209 bonus across all chars
 * @property {number} calcTalentMAP209 - Number of 1B+ overkill maps (Divine Knight)
 * @property {number} votingBonuszMulti - Voting bonus multiplier
 * @property {object} votingUnlocked - Map of voteIdx → boolean
 * @property {object} companionBon - Map of companionIdx → bonus value
 * @property {object} equipSetBonusValues - Map of setName → bonus value
 * @property {number} artifactBonus16 - Sailing artifact #16 bonus
 * @property {number} meritocBonusz21 - Meritoc bonus #21
 * @property {boolean} emporiumBonusUnlocked - Whether emporium golden food is unlocked
 */

/**
 * Create a DNSM cache with manual override values.
 * Any value not provided defaults to 0 / empty.
 */
export function createDNSM(overrides = {}) {
  return {
    famBonusQTYs66: 0,
    etcBonuses8: 0,
    getTalentNumber1_99: 0,
    stampBonusGFood: 0,
    alchBubblesGFoodz: 0,
    mealBonusZGoldFood: 0,
    starSigns69: 0,
    getbonus2_1_209: 0,
    calcTalentMAP209: 0,
    votingBonuszMulti: 1,
    votingUnlocked: {},
    companionBon: {},
    equipSetBonusValues: {},
    artifactBonus16: 0,
    meritocBonusz21: 0,
    emporiumBonusUnlocked: true,
    _trees: {},
    ...overrides,
  };
}

/**
 * Compute DNSM cache from shared state (S).
 * Implements as many DNSM chains as possible; values that can't be
 * computed yet are left at 0 and flagged in the `_uncomputed` array.
 */
/**
 * Compute DNSM cache from shared state (S).
 * Implements as many DNSM chains as possible; values that can't be
 * computed yet are left at 0 and flagged in the `_uncomputed` array.
 *
 * @param {number} [charIdx=0] - Character index for per-char values like talents
 */
export function computeDNSM(charIdx = 0) {
  const uncomputed = [];
  const dnsm = createDNSM();
  const T = dnsm._trees;

  // === Direct save reads ===

  // LegendPTS_bonus, BribeBonus, AchieveStatus, PristineBon, VaultUpgBonus
  // are computed directly in golden-food.js — no dnsm needed.

  // === Emporium unlock ===
  const ninja104 = S.ninjaData[104];
  if (Array.isArray(ninja104)) {
    dnsm.emporiumBonusUnlocked = ninja104.some(v => Number(v) > 0);
  }

  // === meritocBonusz21 ===
  dnsm.meritocBonusz21 = computeMeritocBonusz(21);

  // === getTalentNumber1_99 ===
  {
    const sl = skillLvData[charIdx] || {};
    const rawLv = Number(sl[99]) || 0;
    const allTalentLv = rawLv > 0 ? computeAllTalentLVz(99, charIdx) : 0;
    const effectiveLv = rawLv + allTalentLv;
    dnsm.getTalentNumber1_99 = effectiveLv > 0 ? formulaEval('decay', 55, 80, effectiveLv) : 0;
    T.getTalentNumber1_99 = node('Talent 99', dnsm.getTalentNumber1_99, effectiveLv > 0 ? [
      node('Base Lv', rawLv, null, { fmt: 'raw' }),
      node('Bonus Lv', allTalentLv, null, { fmt: '+' }),
      node('Effective Lv', effectiveLv, null, { fmt: 'raw' }),
    ] : null, { fmt: 'raw', note: 'decay(55,80,' + effectiveLv + ')' });
  }

  // === getbonus2_1_209 ===
  {
    let maxVal = 0, bestCi = -1, bestBase = 0, bestBonus = 0, bestEff = 0;
    for (let ci = 0; ci < numCharacters; ci++) {
      const sl = skillLvData[ci] || {};
      const rawLv = Number(sl[209]) || 0;
      if (rawLv > 0) {
        const allTalentLv = computeAllTalentLVz(209, ci);
        const effectiveLv = rawLv + allTalentLv;
        const val = formulaEval('decay', 2, 200, effectiveLv);
        if (val > maxVal) { maxVal = val; bestCi = ci; bestBase = rawLv; bestBonus = allTalentLv; bestEff = effectiveLv; }
      }
    }
    dnsm.getbonus2_1_209 = maxVal;
    T.getbonus2_1_209 = node('Talent 209', maxVal, maxVal > 0 ? [
      node('Best Char', bestCi, null, { fmt: 'raw' }),
      node('Base Lv', bestBase, null, { fmt: 'raw' }),
      node('Bonus Lv', bestBonus, null, { fmt: '+' }),
      node('Effective Lv', bestEff, null, { fmt: 'raw' }),
    ] : null, { fmt: 'raw', note: 'decayMulti(2,200,' + bestEff + ')' });
  }

  // === artifactBonus16 ===
  {
    const tier = Number((S.sailingData[3] || [])[16]) || 0;
    if (tier === 0) {
      dnsm.artifactBonus16 = 0;
    } else {
      const base = 1;
      dnsm.artifactBonus16 = base * Math.max(1, tier);
    }
    T.artifactBonus16 = node('Artifact 16', dnsm.artifactBonus16, tier > 0 ? [
      node('Base', 1, null, { fmt: 'raw' }),
      node('Tier', tier, null, { fmt: 'x' }),
    ] : null, { fmt: 'raw' });
  }

  // === Equipment Set Bonuses (permanent unlocks in OLA[379]) ===
  {
    const perma = String(optionsListData[379] || '');
    if (perma.includes('SECRET_SET')) {
      dnsm.equipSetBonusValues.SECRET_SET = 25;
    }
    if (perma.includes('EMPEROR_SET')) {
      dnsm.equipSetBonusValues.EMPEROR_SET = 20;
    }
  }

  // === companionBon ===
  {
    const GFOOD_COMPANION_VALUES = { 48: 5, 155: 2500 };
    const bon = {};
    for (const [idx, val] of Object.entries(GFOOD_COMPANION_VALUES)) {
      if (S.companionIds.has(Number(idx))) bon[idx] = val;
    }
    dnsm.companionBon = bon;
  }

  // === calcTalentMAP209 ===
  // Game logic: finds the LAST Divine Knight (ReturnClasses[3]==10) in charNames
  // order, then counts FIGHTING maps where that DK has >= 1B kills.
  // killsDone = MAP_KILL_REQS[m] - KillsLeft2Advance[m][0] >= 1e9
  // This is account-wide (same value for all characters).
  {
    // Find last DK: highest charIdx whose CLASS_TREES[classId][3] === 10
    let dkIdx = -1;
    for (let ci = 0; ci < numCharacters; ci++) {
      const classId = charClassData[ci] || 0;
      const tree = CLASS_TREES[classId];
      if (tree && tree[3] === 10) dkIdx = ci;
    }
    let count = 0;
    if (dkIdx >= 0) {
      const kla = klaData[dkIdx] || [];
      for (let m = 0; m < kla.length; m++) {
        if (!isFightingMap(m)) continue;
        const arr = kla[m];
        if (!Array.isArray(arr)) continue;
        const killsDone = (MAP_KILL_REQS[m] || 0) - Number(arr[0]);
        if (killsDone >= 1e9) count++;
      }
    }
    dnsm.calcTalentMAP209 = count;
    T.calcTalentMAP209 = node('1B+ Overkill Maps', count, dkIdx >= 0 ? [
      node('DK Character', dkIdx, null, { fmt: 'raw' }),
    ] : null, { fmt: 'raw' });
  }

  // === votingBonuszMulti ===
  {
    const meritoc9 = computeMeritocBonusz(9);
    const comp41 = S.companionIds.has(41) ? 40 : 0;
    const dream13 = Number((dreamData || [])[13]) || 0;
    const comp19 = S.companionIds.has(19) ? 5 : 0;
    const legendPTS22 = legendPTSbonus(22);
    const evStr = S.cachedEventShopStr;
    const eventShop7 = eventShopOwned(7, evStr);
    const eventShop16 = eventShopOwned(16, evStr);
    const cosmoBase = COSMO_UPG_BASE['2_3'] || 0;
    const holesLv = Number(S.holesData?.[6]?.[3]) || 0;
    const cosmoBonus23 = Math.floor(cosmoBase * holesLv);
    const winBonus22 = computeWinBonus(22);
    const paletteLv = Number(S.spelunkData?.[9]?.[32]) || 0;
    let paletteBonus32 = 0;
    if (paletteLv > 0) {
      const paletteRaw = paletteLv / (paletteLv + 25) * 10;
      const legendMulti = 1 + legendPTSbonus(10) / 100;
      const loreFlag8 = (Number(S.spelunkData?.[0]?.[8]) || 0) >= 1 ? 1 : 0;
      const loreMulti = 1 + 0.5 * loreFlag8;
      paletteBonus32 = paletteRaw * legendMulti * loreMulti;
    }
    const innerSum = comp41 + dream13 + cosmoBonus23 + winBonus22
      + 17 * eventShop7 + 13 * eventShop16 + comp19 + paletteBonus32 + legendPTS22;
    dnsm.votingBonuszMulti = (1 + meritoc9 / 100) * (1 + innerSum / 100);

    var innerCh = [];
    if (comp41 > 0) innerCh.push(node('Comp 41', comp41, null, { fmt: 'raw' }));
    if (dream13 > 0) innerCh.push(node('Dream 13', dream13, null, { fmt: 'raw' }));
    if (cosmoBonus23 > 0) innerCh.push(node('Cosmo 2/3', cosmoBonus23, null, { fmt: 'raw', note: 'Holes Lv=' + holesLv }));
    if (winBonus22 > 0) innerCh.push(node('WinBonus 22', winBonus22, null, { fmt: 'raw' }));
    if (eventShop7 > 0) innerCh.push(node('17×EvShop 7', 17 * eventShop7, null, { fmt: 'raw' }));
    if (eventShop16 > 0) innerCh.push(node('13×EvShop 16', 13 * eventShop16, null, { fmt: 'raw' }));
    if (comp19 > 0) innerCh.push(node('Comp 19', comp19, null, { fmt: 'raw' }));
    if (paletteBonus32 > 0) innerCh.push(node('Palette 32', paletteBonus32, paletteLv > 0 ? [
      node('Palette Lv', paletteLv, null, { fmt: 'raw' }),
      node('Legend 10 ×', 1 + legendPTSbonus(10) / 100, null, { fmt: 'x' }),
    ] : null, { fmt: 'raw' }));
    if (legendPTS22 > 0) innerCh.push(node('Legend 22', legendPTS22, null, { fmt: 'raw' }));

    T.votingBonuszMulti = node('Voting Multi', dnsm.votingBonuszMulti, [
      node('Meritoc 9 ×', 1 + meritoc9 / 100, null, { fmt: 'x' }),
      node('Inner ×', 1 + innerSum / 100, innerCh.length ? innerCh : null, { fmt: 'x' }),
    ], { fmt: 'x' });
  }

  // === stampBonusGFood ===
  {
    const stampLv = Number((stampLvData[2] || [])[6]) || 0;
    const exalted = isExalted(2, 6);
    const doublerInfo = exalted ? computeStampDoublerSources({ dnsm }) : null;
    const exaltedMulti = exalted ? 1 + doublerInfo.total / 100 : 1;
    dnsm.stampBonusGFood = stampLv * exaltedMulti;
    T.stampBonusGFood = node('GFood Stamp C7', dnsm.stampBonusGFood, stampLv > 0 ? [
      node('Stamp Lv', stampLv, null, { fmt: 'raw' }),
    ].concat(exalted ? [
      node('Exalted ×', exaltedMulti, [
        node('StampDoubler', doublerInfo.total, doublerInfo.children, { fmt: 'raw' }),
      ], { fmt: 'x' }),
    ] : []) : null, { fmt: 'raw' });
  }

  // === alchBubblesGFoodz ===
  {
    const bubbleLv = Number((cauldronInfoData[0] || [])[SHIMMERON_BUBBLE.index]) || 0;
    if (bubbleLv > 0) {
      const baseVal = formulaEval(
        SHIMMERON_BUBBLE.formula, SHIMMERON_BUBBLE.x1, SHIMMERON_BUBBLE.x2, bubbleLv
      );

      // Opassz: warrior chars (classId 6-17) get cauldron-0 bubbles ×max(1, WARRIORS_RULE)
      // Game computes Opassz via CauldronStats("BubbleBonus") which includes Prisma
      // if Warriors Rule itself is a super (prisma'd) bubble.
      const classId = charClassData[charIdx] || 0;
      const isWarrior = classId > 6 && classId < 18;
      const wrLv = Number((cauldronInfoData[0] || [])[WARRIORS_RULE_BUBBLE.index]) || 0;
      let opassz = 1;
      if (isWarrior && wrLv > 0) {
        const wrRaw = formulaEval(WARRIORS_RULE_BUBBLE.formula, WARRIORS_RULE_BUBBLE.x1, WARRIORS_RULE_BUBBLE.x2, wrLv);
        const isWrPrisma = isBubblePrismad(WARRIORS_RULE_BUBBLE.cauldron, WARRIORS_RULE_BUBBLE.index);
        const wrPrisma = isWrPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
        opassz = wrRaw * wrPrisma;
      }

      // PrismaBonusMult: super (prisma'd) bubbles get ×max(1, prisma)
      const isPrisma = isBubblePrismad(SHIMMERON_BUBBLE.cauldron, SHIMMERON_BUBBLE.index);
      const prismaMult = isPrisma ? Math.max(1, getPrismaBonusMult()) : 1;

      dnsm.alchBubblesGFoodz = baseVal * Math.max(1, opassz) * prismaMult;
    }
    const _bLv = Number((cauldronInfoData[0] || [])[SHIMMERON_BUBBLE.index]) || 0;
    const _classId = charClassData[charIdx] || 0;
    const _isW = _classId > 6 && _classId < 18;
    T.alchBubblesGFoodz = node('Shimmeron Bubble', dnsm.alchBubblesGFoodz, _bLv > 0 ? [
      node('Bubble Lv', _bLv, null, { fmt: 'raw' }),
      node('Base decay', formulaEval(SHIMMERON_BUBBLE.formula, SHIMMERON_BUBBLE.x1, SHIMMERON_BUBBLE.x2, _bLv), null, { fmt: 'raw', note: 'decay(80,40,' + _bLv + ')' }),
    ].concat(_isW ? (function() {
      var _wrLv = Number((cauldronInfoData[0] || [])[WARRIORS_RULE_BUBBLE.index]) || 0;
      var _wrRaw = formulaEval(WARRIORS_RULE_BUBBLE.formula, WARRIORS_RULE_BUBBLE.x1, WARRIORS_RULE_BUBBLE.x2, _wrLv);
      var _wrPrisma = isBubblePrismad(WARRIORS_RULE_BUBBLE.cauldron, WARRIORS_RULE_BUBBLE.index);
      var _wrPrismaMult = _wrPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
      var _opassz = _wrRaw * _wrPrismaMult;
      var _opCh = [node('WR Raw', _wrRaw, null, { fmt: 'raw', note: 'decayMulti(2,50,' + _wrLv + ')' })];
      if (_wrPrisma) _opCh.push(node('WR Prisma ×', _wrPrismaMult, null, { fmt: 'x' }));
      return [node('Opassz ×', Math.max(1, _opassz), _opCh, { fmt: 'x', note: 'Warrior class ' + _classId })];
    })() : []).concat(isBubblePrismad(SHIMMERON_BUBBLE.cauldron, SHIMMERON_BUBBLE.index) ? [
      node('Prisma ×', Math.max(1, getPrismaBonusMult()), null, { fmt: 'x', note: 'Super bubble' }),
    ] : []) : null, { fmt: 'raw' });
  }

  // === starSigns69 ===
  // Base value 20, multiplied by Seraph_Cosmos (chip × meritoc × seraph power).
  {
    const seraphMul = computeSeraphMulti(charIdx);
    const val = STAR_SIGN_69_BONUS * seraphMul;
    dnsm.starSigns69 = val;
    T.starSigns69 = node('Star Sign 69', val, seraphMul > 1 ? [
      node('Base', STAR_SIGN_69_BONUS, null, { fmt: 'raw' }),
      node('Seraph Multi', seraphMul, null, { fmt: 'x' }),
    ] : null, { fmt: 'raw' });
  }

  // === mealBonusZGoldFood ===
  {
    const mealLv = Number((S.mealsData?.[0] || [])[64]) || 0;
    if (mealLv > 0) {
      const mfb116 = mainframeBonus(116);
      const shinyS20 = computeShinyBonusS(20);
      const winBon26 = computeWinBonus(26);
      const cookMulti = (1 + (mfb116 + shinyS20) / 100) * (1 + winBon26 / 100);
      const ribbonIdx = 28 + 64;
      const ribbon = ribbonBonusAt(ribbonIdx, S.ribbonData, optionsListData[379]);
      dnsm.mealBonusZGoldFood = cookMulti * ribbon * mealLv * 2;

      var cookCh = [];
      if (mfb116 > 0) cookCh.push(node('Mainframe 116', mfb116, null, { fmt: 'raw' }));
      if (shinyS20 > 0) cookCh.push(node('Shiny S20', shinyS20, null, { fmt: 'raw' }));
      if (winBon26 > 0) cookCh.push(node('WinBonus 26 ×', 1 + winBon26 / 100, null, { fmt: 'x' }));
      T.mealBonusZGoldFood = node('Meal 64 (Peachring)', dnsm.mealBonusZGoldFood, [
        node('Meal Lv', mealLv, null, { fmt: 'raw' }),
        node('Per Lv', 2, null, { fmt: 'raw' }),
        node('Ribbon ×', ribbon, null, { fmt: 'x' }),
        node('Cook Multi ×', cookMulti, cookCh.length ? cookCh : null, { fmt: 'x' }),
      ], { fmt: 'raw' });
    } else {
      T.mealBonusZGoldFood = node('Meal 64 (Peachring)', 0, null, { fmt: 'raw' });
    }
  }

  // === famBonusQTYs66 ===
  // Game applies talent 144 during iteration (not after), so the amplified
  // value becomes the bar later characters must beat.  We match that here.
  {
    let maxBonus = 0, bestCi = -1, bestLv = 0, bestEff = 0;
    // Pre-compute talent 144 multiplier for the active char
    let talent144Val = 0;
    {
      const sl144 = skillLvData[charIdx] || {};
      const rawLv144 = Number(sl144[144] || sl144['144']) || 0;
      if (rawLv144 > 0) {
        const bonus144Lv = computeAllTalentLVz(144, charIdx);
        const eff144 = rawLv144 + bonus144Lv;
        talent144Val = formulaEval(TALENT_144.formula, TALENT_144.x1, TALENT_144.x2, eff144);
      }
    }
    for (let ci = 0; ci < numCharacters; ci++) {
      const classId = charClassData[ci] || 0;
      const tree = CLASS_TREES[classId];
      if (!tree || !tree.includes(33)) continue;
      const charLevel = Number((S.lv0AllData[ci] || [])[0]) || 0;
      const effectiveLv = Math.max(0, charLevel - FAMILY_BONUS_33.lvOffset);
      const bonus = formulaEval(
        FAMILY_BONUS_33.formula, FAMILY_BONUS_33.x1, FAMILY_BONUS_33.x2, effectiveLv
      );
      if (bonus > maxBonus) {
        maxBonus = bonus;
        bestCi = ci; bestLv = charLevel; bestEff = effectiveLv;
        // Game immediately amplifies with talent 144 when active char becomes best
        if (ci === charIdx && talent144Val > 0) {
          maxBonus = bonus * (1 + talent144Val / 100);
        }
      }
    }
    dnsm.famBonusQTYs66 = maxBonus;
    var famChildren = maxBonus > 0 ? [
      node('Best Char', bestCi, null, { fmt: 'raw' }),
      node('Char Level', bestLv, null, { fmt: 'raw' }),
      node('Effective Lv', bestEff, null, { fmt: 'raw', note: 'lv - ' + FAMILY_BONUS_33.lvOffset }),
    ] : null;
    if (talent144Val > 0 && famChildren) {
      famChildren.push(node('Talent 144 ×', 1 + talent144Val / 100, [
        node('Talent Value', talent144Val, null, { fmt: 'raw' }),
      ], { fmt: 'x' }));
    }
    T.famBonusQTYs66 = node('Family 66', maxBonus, famChildren, { fmt: 'raw' });
  }

  // === etcBonuses8 ===
  // Game's EtcBonuses sums equipment (both rows) + obols + nametag + trophy + premhat.
  // Stat type "8" = %_GOLD_FOOD_EFFECT.  Scan all 5 sub-systems to match.
  {
    const STAT = '%_GOLD_FOOD_EFFECT';
    let total = 0;
    var etcChildren = [];

    // -- Equipment (rows 0 and 1) --
    var sp = S.spelunkData || [];
    var galleryOn = (sp[16] && sp[16].length > 0) || (sp[17] && sp[17].length > 0);
    var premhatOn = sp[46] && sp[46].length > 0;

    // Chip detection: check if pendant/keychain/trophy chips are equipped
    // ChipDesc IDs: 18 = pend, 17 = key1, 16 = troph (values are all 1)
    var chipSlots = labData && labData[1 + charIdx];
    var hasPendChip = false, hasKey1Chip = false, hasTrophChip = false;
    if (chipSlots) {
      for (var ci = 0; ci < 7; ci++) {
        var cid = Number(chipSlots[ci]);
        if (cid === 18) hasPendChip = true;
        else if (cid === 17) hasKey1Chip = true;
        else if (cid === 16) hasTrophChip = true;
      }
    }

    // Research grid 172 bonus for slot 15 UQ multiplier
    var gridBonus172 = gbWith(S.gridLevels, S.shapeOverlay, 172, { abm: S.allBonusMulti || 1 });

    for (let row = 0; row < 2; row++) {
      const gear = equipOrderData[charIdx]?.[row] || {};
      const emmGear = emmData[charIdx]?.[row] || {};
      var maxSlot = row === 0 ? 15 : 7;
      for (let slot = 0; slot <= maxSlot; slot++) {
        // Skip gallery/premhat-managed slots (they have dedicated sub-systems)
        if (row === 0 && galleryOn && (slot === 10 || slot === 14)) continue;
        if (row === 0 && premhatOn && slot === 8) continue;
        const itemName = gear[slot] || 'Blank';
        if (itemName === 'Blank') continue;
        const emmSlot = emmGear[slot] || {};
        const itemDef = ITEMS_WITH_GFOOD_UQ[itemName];
        for (let uqi = 1; uqi <= 2; uqi++) {
          const uqTxtKey = 'UQ' + uqi + 'txt';
          const uqValKey = 'UQ' + uqi + 'val';
          let statName = null, val = 0;
          if (itemDef && itemDef.uq === uqi) {
            statName = STAT;
            val = itemDef.baseVal + (Number(emmSlot[uqValKey]) || 0);
          }
          if (!statName && emmSlot[uqTxtKey] === STAT && (Number(emmSlot[uqValKey]) || 0) > 0) {
            statName = STAT;
            val = Number(emmSlot[uqValKey]) || 0;
          }
          if (statName !== STAT) continue;
          // Game multipliers for row 0 slots with equipped chips or research 172
          if (row === 0 && slot === 3 && hasPendChip) val *= 2;
          else if (row === 0 && slot === 9 && hasKey1Chip) val *= 2;
          else if (row === 0 && slot === 10 && hasTrophChip) val *= 2;
          else if (row === 0 && slot === 15 && gridBonus172 >= 1) val *= (1 + gridBonus172 / 100);
          total += val;
          etcChildren.push(node('R' + row + 'S' + slot + ' ' + itemName, val, null, { fmt: 'raw' }));
        }
      }
    }

    // -- Obols, Nametag, Trophy, Premhat --
    // These sub-systems rarely have %_GOLD_FOOD_EFFECT but game includes them.
    // Scan obol data (ScrollCircleINFO[43])
    var obolData = S.obolData || [];
    for (let oi = 0; oi < obolData.length; oi++) {
      var ob = obolData[oi];
      if (!ob) continue;
      if (ob.stat === STAT && ob.val > 0) {
        total += ob.val;
        etcChildren.push(node('Obol ' + oi, ob.val, null, { fmt: 'raw' }));
      }
    }
    // Nametag, trophy, premhat: scan gallery data for stat type 8
    var galTrophy = S.galleryTrophyBon || {};
    if (galTrophy[STAT]) { total += galTrophy[STAT]; etcChildren.push(node('Trophy GF', galTrophy[STAT], null, { fmt: 'raw' })); }
    var galNametag = S.galleryNametagBon || {};
    if (galNametag[STAT]) { total += galNametag[STAT]; etcChildren.push(node('Nametag GF', galNametag[STAT], null, { fmt: 'raw' })); }
    var galPremhat = S.premHatBon || {};
    if (galPremhat[STAT]) { total += galPremhat[STAT]; etcChildren.push(node('Premhat GF', galPremhat[STAT], null, { fmt: 'raw' })); }

    dnsm.etcBonuses8 = total;
    T.etcBonuses8 = node('GFood Equip UQ', total, etcChildren.length ? etcChildren : null, { fmt: 'raw' });
  }

  dnsm._uncomputed = uncomputed;
  return dnsm;
}
