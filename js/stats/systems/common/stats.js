// ===== STATS SYSTEM =====
// Generic TotalStats computation for STR/AGI/WIS/LUK.
// Currently LUK is fully implemented (for DR formula).
// Other stats share the same structure — only IDs differ.
//
// Game formula (non-dungeon):
//   Math.floor(
//     AlchBubbles.Total{STAT} + talent(652) + Companions(8)
//     + (1 + pctPool/100) * (equipDN + flatBase + flatAdd)
//   )

import { node, treeResult } from '../../node.js';
import { label } from '../../entity-names.js';
import { getLOG } from '../../../formulas.js';
import {
  equipOrderData,
  cauldronInfoData,
  optionsListData,
  stampLvData,
  skillLvData,
  obolNamesData,
  obolFamilyNames,
  obolMapsData,
  obolFamilyMaps,
  emmData,
  postOfficeData,
  numCharacters,
  charClassData,
  cardEquipData,
  buffsActiveData,
} from '../../../save/data.js';
import { ITEMS } from '../../data/game/items.js';
import { formulaEval } from '../../../formulas.js';
import { superBitType } from '../../../game-helpers.js';
import { isBubblePrismad, getPrismaBonusMult, sigil as sigilResolver } from '../w2/alchemy.js';
import { etcBonus as etcBonusResolver } from './etcBonus.js';
import { pristine as pristineResolver } from '../w6/sneaking.js';
import { shiny as shinyResolver } from '../w4/breeding.js';
import { arcade as arcadeResolver } from '../w2/arcade.js';
import { owl as owlResolver } from '../w1/owl.js';
import { companion as companionResolver } from './companions.js';
import { talent as talentResolver, computeAllTalentLVz } from './talent.js';
import { NAMETAG_TIER_SCALE } from '../../data/common/nametag.js';
import { StarSigns, PostOffUpgradeInfo, ClassFamilyBonuses, ClassAccountBonus,
  ClassPromotionChoices } from '../../data/game/customlists.js';
import { CARD_BONUS } from '../../data/common/cards.js';
import { IDforCardBonus } from '../../data/game/custommaps.js';
import { computeCardLv } from './cards.js';
import { computeSeraphMulti } from './starSign.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { achieveStatus } from './achievement.js';
import { computeWinBonus } from '../w6/summoning.js';
import { mainframeBonus, charHasChip } from '../w4/lab.js';
import { goldFoodBonuses } from './goldenFood.js';
import { votingBonusz } from '../w2/voting.js';
import { vaultUpgBonus } from './vault.js';
import { pristineBon } from '../w5/pristine.js';
import { isExalted, computeStampDoublerSources } from '../w1/stamp.js';
import { artifactBase } from '../../data/w5/sailing.js';
import { cosmoUpgBase } from '../../data/w5/hole.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { AlchemyDescription } from '../../data/game/customlists.js';
import { bubbleParams } from '../../data/w2/alchemy.js';
import { guildBonusParams } from '../../data/common/guild.js';
import { equipSetBonus } from '../../data/common/equipment.js';
import { talentParams } from '../../data/common/talent.js';
import { farm as farmResolver } from '../w6/farming.js';
import { cookingMealMulti } from './cooking.js';
import { galleryBonusMulti, hatrackBonusMulti, trophyTier } from '../w7/gallery.js';
import { COMPANION_BONUS } from '../../data/game-constants.js';

// ==================== STAT CONFIG ====================
// Per-stat IDs. Only LUK is fully filled in; others can be added.
var STAT_CONFIG = {
  STR: {
    totalBubble: 'TotalSTR',
    dnPctTalent: 96,       // ABSOLUTE_UNIT: %STR from equipment
    dnPctStampType: 'PctSTR',
    dn2PctTalent: 111,     // Obol STR Boost
    pctTalent: 143,        // OVERBLOWN_TESTOSTERONE: %STR
    pctBubble: 'W8',       // TOME_STRENGTH: %STR per 2000 Tome pts
    etcPct: 57,            // %_STR
    pristineIdx: 4,
    flatTalent: 10,        // FIST_OF_RAGE: add(1, 0)
    guildTalent: 51,       // Eternal STR: getbonus2 max across chars
    stampBaseType: 'BaseSTR',
    boxRewardsBase: null,  // STR has no box reward in flat base
    etcFlat: 51,           // _STR
    olaShimmer: 174,
    extraTalents: [98, 203],  // ABSOLUTE_UNIT, BUILT_DIFFERENT
    extraTab2Talent: 142,     // SKILL_STRENGTHEN
    buffBonus: [94, 1],       // GetBuffBonuses(94,1) [NOT YET COMPUTED]
    boxRewardsStat: '23b',
    famBonusIdx: 14,
    starSignStat: 'STR',
    cardType: 9,
    flatTalent2: null,
    sigilIdx: 0,
    shinyIdx: 6,
    arcadeIdx: 19,
    a4Bubble: 'W4',        // SLABI_STRENGTH (slab-based)
    questsTal618: false,
  },
  AGI: {
    totalBubble: 'TotalAGI',
    dnPctTalent: 276,      // SANIC_SPEED-related: %AGI from equipment
    dnPctStampType: 'PctAGI',
    dn2PctTalent: 291,     // Obol AGI Boost
    pctTalent: 368,        // ADAPTATION_REVELATION: %AGI
    pctBubble: 'A9',       // TOME_AGILITY: %AGI per 2000 Tome pts
    etcPct: 25,            // %_AGI
    pristineIdx: 1,
    flatTalent: 11,        // QUICKNESS_BOOTS: add(1, 0)
    guildTalent: 52,       // Eternal AGI: getbonus2 max across chars
    stampBaseType: 'BaseAGI',
    boxRewardsBase: null,  // AGI has no box reward in flat base
    etcFlat: 52,           // _AGI
    olaShimmer: 175,
    extraTalents: [278, 428],  // SANIC_SPEED, UNREAL_AGILITY
    extraTab2Talent: 367,      // SKILL_AMBIDEXTERITY
    buffBonus: null,
    boxRewardsStat: '21b',
    famBonusIdx: 38,
    starSignStat: 'AGI',
    cardType: 7,
    flatTalent2: null,
    sigilIdx: 1,
    shinyIdx: 7,
    arcadeIdx: 20,
    a4Bubble: 'A4',        // SLABO_AGILITY (slab-based, shared AGI+LUK)
    questsTal618: false,
  },
  WIS: {
    totalBubble: 'TotalWIS',
    dnPctTalent: 456,      // %WIS from equipment (mage talent)
    dnPctStampType: 'PctWIS',
    dn2PctTalent: 486,     // Obol WIS Boost
    pctTalent: 533,        // UTMOST_INTELLECT: %WIS
    pctBubble: 'M9',       // TOME_WISDOM: %WIS per 2000 Tome pts
    etcPct: 58,            // %_WIS
    pristineIdx: 10,
    flatTalent: 12,        // BOOK_OF_THE_WISE: add(1, 0)
    guildTalent: 53,       // Eternal WIS: getbonus2 max across chars
    stampBaseType: 'BaseWIS',
    boxRewardsBase: null,  // WIS has no box reward in flat base
    etcFlat: 53,           // _WIS
    olaShimmer: 176,
    extraTalents: [459, 593],  // INDIVIDUAL_INSIGHT, INDIVIDUALITY
    extraTab2Talent: 532,      // SKILL_WIZ
    buffBonus: null,
    boxRewardsStat: '22b',
    famBonusIdx: 62,
    starSignStat: 'WIS',
    cardType: 5,
    flatTalent2: null,
    sigilIdx: 2,
    shinyIdx: 8,
    arcadeIdx: 21,
    a4Bubble: 'M4',        // SLABE_WISDOM (slab-based)
    questsTal618: false,
  },
  LUK: {
    totalBubble: 'TotalLUK',
    dnPctTalent: 21,       // F'LUK'EY_FABRICS: decay(220, 250)
    dnPctStampType: 'PctLUK',
    dn2PctTalent: 36,      // CLEVER_CLOVER_OBOLS: add(1, 0)
    pctTalent: null,       // LUK has NO pct talent
    pctBubble: null,       // LUK has NO pct bubble
    etcPct: 17,            // %_LUK
    pristineIdx: 5,
    flatTalent: 13,        // LUCKY_CLOVER: add(1, 0)
    guildTalent: 54,       // Eternal LUK: getbonus2 max across chars
    stampBaseType: 'BaseLUK',
    boxRewardsBase: '15c', // Science_Spare_Parts slot 2
    etcFlat: 54,           // _LUK
    olaShimmer: 177,
    extraTalents: [],
    extraTab2Talent: null,
    buffBonus: null,
    boxRewardsStat: 'LUK', // Non_Predatory_Loot_Box slot 1
    famBonusIdx: 4,
    starSignStat: 'LUK',
    cardType: 2,           // IDforCardBonus["2"] = "+{_Base_LUK"
    flatTalent2: 23,       // LUCKY_HORSESHOE: add(1, 0)
    sigilIdx: 3,
    shinyIdx: 9,
    arcadeIdx: 22,
    a4Bubble: 'A4',        // SLABO_AGILITY (shared AGI+LUK)
    questsTal618: true,    // Only LUK has min(QuestsComplete, tal618)
  },
};

// ==================== STAR SIGN STAT BONUSES ====================
// Parse StarSigns game data for a specific stat's flat + pct bonuses.
// All star signs count (rift enables all). Applies Seraph_Cosmos multiplier.
function computeStarSignStatBonuses(statName, charIdx, saveData) {
  var flatTotal = 0, pctTotal = 0;
  var flatChildren = [], pctChildren = [];
  for (var i = 0; i < StarSigns.length; i++) {
    var sign = StarSigns[i];
    for (var e = 1; e <= 3; e++) {
      var eff = sign[e];
      if (!eff || eff === '_') continue;
      var m = eff.match(/^\+(\d+)(%?)_(.+)$/);
      if (!m) continue;
      var val = Number(m[1]);
      var isPct = m[2] === '%';
      var type = m[3];
      if (type === statName || type === 'All_Stats' || type === 'All_Stat') {
        if (isPct) {
          pctTotal += val;
          pctChildren.push(node(sign[0], val, null, { fmt: 'raw' }));
        } else {
          flatTotal += val;
          flatChildren.push(node(sign[0], val, null, { fmt: 'raw' }));
        }
      }
    }
  }
  var seraphMulti = computeSeraphMulti(charIdx, saveData);
  return {
    flat: { val: flatTotal * seraphMulti, baseVal: flatTotal, seraphMulti: seraphMulti, children: flatChildren },
    pct:  { val: pctTotal * seraphMulti,  baseVal: pctTotal,  seraphMulti: seraphMulti, children: pctChildren },
  };
}

// ==================== CARD BONUS BY TYPE ====================
// CardBonusREAL(typeId): sum of EQUIPPED cards matching the type for given character.
// typeId maps via IDforCardBonus (e.g. 2 -> "+{_Base_LUK").
// Game reads from DNSM.CardBonusS which is pre-computed from equipped cards only.
export function computeCardBonusByType(typeId, charIdx, saveData) {
  var targetDesc = IDforCardBonus[String(typeId)];
  if (!targetDesc) return { val: 0, children: [] };
  var legend21 = legendPTSbonus(21, saveData);
  var legendMulti = 1 + legend21 / 100;
  var equipped = cardEquipData[charIdx] || [];
  var total = 0;
  var children = [];
  for (var i = 0; i < equipped.length; i++) {
    var cardKey = equipped[i];
    if (!cardKey || cardKey === 'B') continue;
    var cb = CARD_BONUS[cardKey];
    if (!cb || cb.desc !== targetDesc) continue;
    var lv = computeCardLv(cardKey, saveData);
    if (lv <= 0) continue;
    var chipDouble = (i === 0 && charHasChip(charIdx, 'card1'))
                   || (i === 7 && charHasChip(charIdx, 'card2')) ? 2 : 1;
    var contrib = chipDouble * lv * cb.val * legendMulti;
    total += contrib;
    children.push(node(cardKey + ' Lv' + lv, contrib, null,
      { fmt: 'raw', note: 'per-star=' + cb.val + (chipDouble > 1 ? ' ×2chip' : '') }));
  }
  return { val: total, children: children };
}

// ==================== BOX REWARDS ====================
// Compute a BoxRewards value by key from PostOffUpgradeInfo + postOfficeData.
export function computeBoxReward(charIdx, key) {
  for (var boxIdx = 0; boxIdx < PostOffUpgradeInfo.length; boxIdx++) {
    var box = PostOffUpgradeInfo[boxIdx];
    for (var slot = 0; slot < 3; slot++) {
      if (box[16 + slot] !== key) continue;
      var pts = Number((postOfficeData[charIdx] || [])[boxIdx]) || 0;
      if (pts <= 0) return { val: 0, children: [] };
      // Game subtracts slot thresholds for slots 1 and 2
      if (slot === 1) pts -= Number(box[13]) || 0;
      if (slot === 2) pts -= Number(box[14]) || 0;
      pts = Math.round(pts);
      if (pts <= 0) return { val: 0, children: [] };
      var paramBase = 1 + slot * 4;
      var x1 = Number(box[paramBase]) || 0;
      var x2 = Number(box[paramBase + 1]) || 0;
      var formula = box[paramBase + 2];
      var val = formulaEval(formula, x1, x2, pts);
      return {
        val: val,
        children: [node(box[0] + ' slot' + slot, val, null,
          { fmt: 'raw', note: formula + '(' + x1 + ',' + x2 + ',' + pts + ')' })],
      };
    }
  }
  return { val: 0, children: [] };
}

// ==================== DREAM SHIMMER ====================
// AllShimmerBonuses from sailing artifact 31 (The_Shim_Lantern).
// Game: max(1, min(4, 1 + Sailing("ArtifactBonus", 31, 0)))
function computeDreamShimmer(saveData) {
  var sailing = saveData.sailingData;
  if (!sailing || !sailing[3]) return 1;
  var artTier = Number(sailing[3][31]) || 0;
  if (artTier <= 0) return 1;
  return Math.max(1, Math.min(4, 1 + artTier));
}

// ==================== EQUIP BASE STAT ====================
export function computeEquipBaseStat(charIdx, statName, saveData) {
  var total = 0;
  var children = [];
  var eqData = equipOrderData[charIdx];
  if (!eqData) return { val: 0, children: [] };
  var emm = emmData && emmData[charIdx];
  // Skip gallery/premhat-managed slots (same as equipment.js)
  var sp = saveData.spelunkData || [];
  var galleryOn = (sp[16] && sp[16].length > 0) || (sp[17] && sp[17].length > 0);
  var premhatOn = sp[46] && sp[46].length > 0;
  for (var row = 0; row < 2; row++) {
    var rr = eqData[row];
    if (!rr) continue;
    var maxSlots = row === 0 ? 16 : 8;
    var emmRow = emm && emm[row];
    for (var slot = 0; slot < maxSlots; slot++) {
      if (row === 0 && galleryOn && (slot === 10 || slot === 14)) continue;
      if (row === 0 && premhatOn && slot === 8) continue;
      var itemName = rr[slot] || rr[String(slot)];
      if (!itemName || itemName === 'Blank') continue;
      var item = ITEMS[itemName];
      var baseStat = item ? (Number(item[statName]) || 0) : 0;
      var stoneStat = 0;
      if (emmRow) {
        var emmSlot = emmRow[slot] || emmRow[String(slot)];
        if (emmSlot) stoneStat = Number(emmSlot[statName]) || 0;
      }
      var slotVal = baseStat + stoneStat;
      if (slotVal !== 0) {
        total += slotVal;
        children.push(node('R' + row + 'S' + slot + ' ' + itemName, slotVal, null,
          { fmt: 'raw', note: 'base=' + baseStat + ' stone=' + stoneStat }));
      }
    }
  }
  return { val: total, children: children };
}

// ==================== GALLERY BASE STAT ====================
export function computeGalleryBaseStat(charIdx, ctx, statName) {
  var saveData = ctx.saveData;
  var total = 0;
  var children = [];
  var sp = saveData.spelunkData || [];
  var gbmObj = galleryBonusMulti(saveData);
  var gbm = gbmObj.val;
  var hbmObj = hatrackBonusMulti(saveData);
  var hbm = hbmObj.val;

  // Trophy base stat
  var trophySlots = sp[16] || [];
  var trophyTotal = 0;
  var trophyCh = [];
  for (var i = 0; i < trophySlots.length; i++) {
    var trophyId = Number(trophySlots[i]) || 0;
    if (trophyId < 1) continue;
    var tItem = ITEMS['Trophy' + trophyId];
    var tStat = tItem ? (Number(tItem[statName]) || 0) : 0;
    if (tStat === 0) continue;
    var tier = trophyTier(i, saveData);
    var val = tier * gbm * tStat;
    trophyTotal += val;
    trophyCh.push(node('Trophy' + trophyId + ' slot' + i, val, null,
      { fmt: 'raw', note: 'base=' + tStat + ' tier=' + tier }));
  }
  if (trophyTotal > 0) {
    children.push(node('Trophy Base ' + statName, trophyTotal, trophyCh, { fmt: 'raw' }));
    total += trophyTotal;
  }

  // Nametag base stat
  var nametagLevels = sp[17] || [];
  var nametagTotal = 0;
  var nametagCh = [];
  for (var ni = 0; ni < nametagLevels.length; ni++) {
    var nlv = Number(nametagLevels[ni]) || 0;
    if (nlv < 1) continue;
    var nItemKey = ni === 6 ? 'EquipmentNametag6b' : 'EquipmentNametag' + ni;
    var nItem = ITEMS[nItemKey];
    if (!nItem) continue;
    var nStat = Number(nItem[statName]) || 0;
    if (nStat === 0) continue;
    var ntier = NAMETAG_TIER_SCALE[Math.min(NAMETAG_TIER_SCALE.length - 1, nlv - 1)];
    var nval = ntier * gbm * nStat;
    nametagTotal += nval;
    nametagCh.push(node('Nametag' + (ni + 1) + ' Lv' + nlv, nval, null,
      { fmt: 'raw', note: 'base=' + nStat + ' tier=' + ntier }));
  }
  if (nametagTotal > 0) {
    children.push(node('Nametag Base ' + statName, nametagTotal, nametagCh, { fmt: 'raw' }));
    total += nametagTotal;
  }

  // Premhat base stat
  var hats = sp[46] || [];
  var premhatTotal = 0;
  var premhatCh = [];
  for (var hi = 0; hi < hats.length; hi++) {
    var hatName = hats[hi];
    if (!hatName || typeof hatName !== 'string') continue;
    var hItem = ITEMS[hatName];
    var hStat = hItem ? (Number(hItem[statName]) || 0) : 0;
    if (hStat === 0) continue;
    var hval = hbm * hStat;
    premhatTotal += hval;
    premhatCh.push(node(hatName, hval, null, { fmt: 'raw', note: 'base=' + hStat }));
  }
  if (premhatTotal > 0) {
    children.push(node('Premhat Base ' + statName, premhatTotal, premhatCh, { fmt: 'raw' }));
    total += premhatTotal;
  }

  return { val: total, children: children };
}

// ==================== OBOL BASE STAT ====================
export function computeObolBaseStat(charIdx, statName) {
  var total = 0;
  var children = [];
  var pNames = obolNamesData && obolNamesData[charIdx];
  var pMaps = obolMapsData && obolMapsData[charIdx];
  if (pNames) {
    for (var i = 0; i < pNames.length; i++) {
      var on = pNames[i];
      if (!on || on === 'Blank' || on === 'Null') continue;
      var oItem = ITEMS[on];
      var oStat = oItem ? (Number(oItem[statName]) || 0) : 0;
      var mapBonus = pMaps && pMaps[i] ? (Number(pMaps[i][statName]) || 0) : 0;
      var slotTotal = oStat + mapBonus;
      if (slotTotal > 0) {
        total += slotTotal;
        children.push(node('Personal ' + on, slotTotal, null, { fmt: 'raw' }));
      }
    }
  }
  var fNames = obolFamilyNames;
  var fMaps = obolFamilyMaps;
  if (fNames) {
    for (var j = 0; j < fNames.length; j++) {
      var fn = fNames[j];
      if (!fn || fn === 'Blank' || fn === 'Null') continue;
      var fItem = ITEMS[fn];
      var fStat = fItem ? (Number(fItem[statName]) || 0) : 0;
      var fMapBonus = fMaps && fMaps[j] ? (Number(fMaps[j][statName]) || 0) : 0;
      var fSlotTotal = fStat + fMapBonus;
      if (fSlotTotal > 0) {
        total += fSlotTotal;
        children.push(node('Family ' + fn, fSlotTotal, null, { fmt: 'raw' }));
      }
    }
  }
  return { val: total, children: children };
}

// ==================== STAMP BONUS BY TYPE ====================
var CAT_LETTER = ['A', 'B', 'C'];

function computeStampBonusOfTypeX(type, saveData) {
  var total = 0;
  var children = [];
  // Precompute shared multipliers
  var labDouble = (mainframeBonus(7, saveData) === 2) ? 2 : 1;
  var prist17 = pristineBon(17, saveData);
  var pristineMulti = prist17 > 0 ? 1 + prist17 / 100 : 1;
  var doublerInfo = computeStampDoublerSources(saveData);
  for (var cat = 0; cat < 3; cat++) {
    var lvMap = stampLvData[cat] || stampLvData[String(cat)];
    if (!lvMap) continue;
    for (var idx = 0; idx < 60; idx++) {
      var lv = Number(lvMap[idx] || lvMap[String(idx)]) || 0;
      if (lv <= 0) continue;
      var stampName = 'Stamp' + CAT_LETTER[cat] + (idx + 1);
      var item = ITEMS[stampName];
      if (!item || !item.desc_line1) continue;
      var parts = item.desc_line1.split(',');
      if (parts[0] !== type) continue;
      var formula = parts[1];
      var x1 = Number(parts[2]) || 0;
      var x2 = Number(parts[3]) || 0;
      var baseVal = formulaEval(formula, x1, x2, lv);
      // Apply exalted multiplier (per-stamp)
      var exalted = isExalted(cat, idx, saveData);
      var exaltedMult = exalted ? 1 + doublerInfo.total / 100 : 1;
      var val = baseVal * exaltedMult;
      // Apply lab doubler + pristine to non-MISC stamps (cat < 2)
      if (cat < 2) {
        val = val * labDouble * pristineMulti;
      }
      total += val;
      var stampNote = formula + '(' + x1 + ',' + x2 + ',' + lv + ')';
      if (exalted) stampNote += ' exalted×' + exaltedMult.toFixed(2);
      if (cat < 2 && labDouble > 1) stampNote += ' lab×' + labDouble;
      if (cat < 2 && pristineMulti > 1) stampNote += ' prist×' + pristineMulti.toFixed(2);
      children.push(node(stampName + ' Lv' + lv, val, null,
        { fmt: 'raw', note: stampNote }));
    }
  }
  return { val: total, children: children };
}

// ==================== ALCHEMY BUBBLE ====================
var BUBBLE_KEYS = {
  TotalLUK: { cauldron: 3, index: 0, slab: false },
  TotalSTR: { cauldron: 0, index: 0, slab: false },
  TotalAGI: { cauldron: 1, index: 0, slab: false },
  TotalWIS: { cauldron: 2, index: 0, slab: false },
  W4:       { cauldron: 0, index: 23, slab: true },   // SLABI_STRENGTH
  W8:       { cauldron: 0, index: 27, tome: true },    // TOME_STRENGTH
  A4:       { cauldron: 1, index: 23, slab: true },    // SLABO_AGILITY
  A9:       { cauldron: 1, index: 28, tome: true },    // TOME_AGILITY
  M4:       { cauldron: 2, index: 23, slab: true },    // SLABE_WISDOM
  M9:       { cauldron: 2, index: 28, tome: true },    // TOME_WISDOM
};

// Passz multiplier: cauldron-matching class boost (Opassz/Gpassz/Ppassz).
// Game: TalentCalc(-2) multiplies non-passz/ACTIVE/AllCharz bubbles (idx!=16, idx<30)
// by the passz value of the matching cauldron when the character's class fits.
// Opassz = c0 i1 (warriors: class 7-17)
// Gpassz = c1 i1 (archers: class 18-29)
// Ppassz = c2 i1 (mages:   class 30-41)
// Cauldron 3: no passz (multiply by 1).
function getPasszMult(cauldron, charIdx, saveData) {
  if (cauldron === 3) return { val: 1, children: [] };
  var charClass = Number(charClassData[charIdx] || 0);
  if (charClass <= 6) return { val: 1, children: [] };
  // Check if character class matches the cauldron
  var match = false;
  if (cauldron === 0 && charClass < 18) match = true;       // warrior
  else if (cauldron === 1 && charClass >= 18 && charClass < 30) match = true;  // archer
  else if (cauldron === 2 && charClass >= 30 && charClass < 42) match = true;  // mage
  if (!match) return { val: 1, children: [] };
  // Compute the passz bubble value (always at index 1 of the matching cauldron)
  var passzParams = bubbleParams(cauldron, 1);
  if (!passzParams) return { val: 1, children: [] };
  var passzLv = Number((cauldronInfoData && cauldronInfoData[cauldron]
    && cauldronInfoData[cauldron][1]) || 0);
  if (passzLv <= 0) return { val: 1, children: [] };
  var passzBase = formulaEval(passzParams.formula, passzParams.x1, passzParams.x2, passzLv);
  var passzPrisma = isBubblePrismad(cauldron, 1) ? Math.max(1, getPrismaBonusMult(saveData)) : 1;
  var passzVal = Math.max(1, passzBase * passzPrisma);
  return { val: passzVal, children: [
    node(passzParams.name, passzVal, [
      node('Level', passzLv, null, { fmt: 'raw' }),
      node('Base', passzBase, null, { fmt: 'raw' }),
    ].concat(passzPrisma > 1 ? [node('Prisma', passzPrisma, null, { fmt: 'x' })] : []),
    { fmt: 'x' })
  ] };
}

// Multi bubble second-pass: game RecalcBubbles multiplies specific bubble indices
// by the corresponding Multi* bubble value after the first-pass computation.
// Orange (c=0): indices 0,2,4,7,14 × MultiOr (c0 i16)
// Green  (c=1): indices 0,6,9,12,14 × MultiGr (c1 i16)
// Purple (c=2): indices 0,2,6,12,14 × MultiPu (c2 i16)
var MULTI_AFFECTED = {
  0: [0, 2, 4, 7, 14],
  1: [0, 6, 9, 12, 14],
  2: [0, 2, 6, 12, 14],
};
var MULTI_BUBBLE_INDEX = 16;

function getMultiBubbleMult(cauldron, bubbleIndex, saveData) {
  var affected = MULTI_AFFECTED[cauldron];
  if (!affected || affected.indexOf(bubbleIndex) === -1) return { val: 1, children: [] };
  var multiParams = bubbleParams(cauldron, MULTI_BUBBLE_INDEX);
  if (!multiParams) return { val: 1, children: [] };
  var multiLv = Number((cauldronInfoData && cauldronInfoData[cauldron]
    && cauldronInfoData[cauldron][MULTI_BUBBLE_INDEX]) || 0);
  if (multiLv <= 0) return { val: 1, children: [] };
  var multiBase = formulaEval(multiParams.formula, multiParams.x1, multiParams.x2, multiLv);
  var multiPrisma = isBubblePrismad(cauldron, MULTI_BUBBLE_INDEX)
    ? Math.max(1, getPrismaBonusMult(saveData)) : 1;
  var multiVal = Math.max(1, multiBase * multiPrisma);
  return {
    val: multiVal,
    children: [node(multiParams.name + ' Multi', multiVal, [
      node('Level', multiLv, null, { fmt: 'raw' }),
      node('Base', multiBase, null, { fmt: 'raw' }),
    ].concat(multiPrisma > 1
      ? [node('Prisma', multiPrisma, null, { fmt: 'x' })] : []),
    { fmt: 'x' })]
  };
}

function computeAlchBubble(bonusType, charIdx, saveData) {
  var bk = BUBBLE_KEYS[bonusType];
  if (!bk) return { val: 0, children: [] };
  var params = bubbleParams(bk.cauldron, bk.index);
  if (!params) return { val: 0, children: [] };
  params.slab = bk.slab;
  params.tome = bk.tome;
  var lv = Number((cauldronInfoData && cauldronInfoData[params.cauldron]
    && cauldronInfoData[params.cauldron][params.index]) || 0);
  if (lv <= 0) return { val: 0, children: [] };
  var baseVal = formulaEval(params.formula, params.x1, params.x2, lv);
  var isPrisma = isBubblePrismad(params.cauldron, params.index);
  var prismaMult = isPrisma ? Math.max(1, getPrismaBonusMult(saveData)) : 1;
  // Slab multiplier: some bubbles (W4,A4,M4) multiply by floor(slabCount/100)
  var slabMult = 1;
  if (params.slab) {
    var slabCount = (saveData.cards1Data && saveData.cards1Data.length) || 0;
    slabMult = Math.floor(slabCount / 100);
    if (slabMult < 1) slabMult = 1;
  }
  // Tome multiplier: W8/A9/M9 multiply by floor(max(0, tomePoints-5000)/2000)
  //   × (1 + (GrimoireUpgBonus(17) + GetSetBonus("TROLL_SET")) / 100)
  var tomeMult = 1;
  var tomeExtraMult = 1;
  if (params.tome) {
    var tomePoints = saveData.totalTomePoints || 0;
    tomeMult = Math.max(0, Math.floor((tomePoints - 5000) / 2000));
    if (tomeMult < 1) tomeMult = 1;
    // Game post-processing: W8/A9/M9 *= CalcTalentDN2 * (1 + (GrimoireUpg(17) + TrollSet) / 100)
    var g17 = Number((saveData.grimoireData && saveData.grimoireData[17]) || 0);
    var trollSet = String((optionsListData && optionsListData[379]) || '').indexOf('TROLL_SET') !== -1 ? equipSetBonus('TROLL_SET') : 0;
    tomeExtraMult = 1 + (g17 + trollSet) / 100;
  }
  // Passz multiplier: class-matched cauldron boost (Opassz/Gpassz/Ppassz)
  // Game order dependency: index 0 bubbles (TotalSTR/TotalAGI/TotalWIS/TotalLUK)
  // are processed BEFORE Passz at index 1, so Passz is unavailable → max(1,0)=1.
  var passz = (charIdx != null && bk.index > 0) ? getPasszMult(bk.cauldron, charIdx, saveData) : { val: 1, children: [] };
  var passzMult = passz.val;
  var val = baseVal * prismaMult * passzMult * slabMult * tomeMult * tomeExtraMult;
  // Multi bubble second-pass multiplication
  var multi = getMultiBubbleMult(bk.cauldron, bk.index, saveData);
  val *= multi.val;
  var children = [
    node('Level', lv, null, { fmt: 'raw' }),
    node('Base', baseVal, null, { fmt: 'raw' }),
  ];
  if (isPrisma) children.push(node('Prisma Multi', prismaMult, null, { fmt: 'x' }));
  if (passzMult > 1) children = children.concat(passz.children);
  if (params.slab && slabMult > 1) children.push(node('Slab Multi', slabMult, null, { fmt: 'x', note: 'floor(slabItems/100)' }));
  if (params.tome && tomeMult > 1) children.push(node('Tome Multi', tomeMult, null, { fmt: 'x', note: 'floor((tome-5000)/2000)' }));
  if (params.tome && tomeExtraMult > 1) children.push(node('Tome Bonus', tomeExtraMult, null, { fmt: 'x', note: 'GrimoireUpg(17)+TrollSet' }));
  if (multi.val > 1) children = children.concat(multi.children);
  return { val: val, children: children, name: params.name };
}

// ==================== FAMILY BONUS ====================
// Game: iterates all players, for each class in ReturnClasses(playerClass),
// computes FamilyBonsuesREAL(classIdx, type, playerLevel) for types 0 and 1.
// Keeps max across all players for key = round(2*classIdx + type).

var _famParent = {};
for (var _fci = 0; _fci < ClassPromotionChoices.length; _fci++) {
  var _fch = ClassPromotionChoices[_fci];
  if (!_fch || _fch[0] === 'Na') continue;
  for (var _fj = 0; _fj < _fch.length; _fj++) _famParent[Number(_fch[_fj])] = _fci;
}
_famParent[2] = 1; // Journeyman -> Beginner hidden promotion

function returnClasses(classId) {
  if (classId < 6) {
    var chain = [];
    for (var i = 1; i <= classId; i++) chain.push(i);
    return chain;
  }
  var chain = [classId];
  var cur = _famParent[classId];
  while (cur !== undefined) { chain.unshift(cur); cur = _famParent[cur]; }
  return chain;
}

export function computeFamBonusQTYs(activeCharIdx, saveData) {
  // Game: for each player, for each class in ReturnClasses(playerClass),
  // compute FamilyBonsuesREAL and keep max per key.
  // Talent 144 multiplier: if the active character sets the max for a key,
  // that entry is multiplied by (1 + GetTalentNumber(1, 144) / 100).
  // Keys "24" and "44" use getbonus2(1, 144, -1, saveData) for ALL characters.
  //
  // Game computes GetTalentNumber(1, 144) lazily inside the iteration,
  // reading DNSM.FamBonusQTYs.h[68] from the partially-built map.
  // We replicate this by passing the partial result map to computeAllTalentLVz.
  var rawLv144 = 0;
  if (activeCharIdx >= 0) {
    var sl144 = skillLvData[activeCharIdx] || {};
    rawLv144 = Number(sl144[144] || sl144['144']) || 0;
  }
  var result = {};
  for (var ci = 0; ci < numCharacters; ci++) {
    var classId = charClassData[ci] || 0;
    if (classId <= 0) continue;
    var playerLv = Number((saveData.lv0AllData && saveData.lv0AllData[ci] && saveData.lv0AllData[ci][0]) || 0);
    if (playerLv <= 0) continue;
    var chain = returnClasses(classId);
    for (var c = 0; c < chain.length; c++) {
      var clsIdx = chain[c];
      var cfb = ClassFamilyBonuses[clsIdx];
      var cab = ClassAccountBonus[clsIdx];
      if (!cfb || !cab) continue;
      var lvOffset = Number(cab[1]) || 0;
      var effectiveLv = Math.max(0, Math.round(playerLv - lvOffset));
      for (var type = 0; type < 2; type++) {
        var pb = 1 + 3 * type;
        var formula = cfb[pb + 2];
        if (!formula || formula === 'txt' || formula === '_') continue;
        var x1 = Number(cfb[pb]) || 0;
        var x2 = Number(cfb[pb + 1]) || 0;
        var bonus = formulaEval(formula, x1, x2, effectiveLv);
        var key = Math.round(2 * clsIdx + type);
        if (!result[key] || bonus > result[key]) {
          result[key] = bonus;
          if (rawLv144 > 0 && ci === activeCharIdx) {
            // Compute tal144val lazily, reading FamBonusQTYs[68] from the
            // partially-built map to match the game's AllTalentLVz behavior.
            var bonus144 = computeAllTalentLVz(144, activeCharIdx, { partialFamBonusMap: result }, saveData);
            var t144 = talentParams(144);
            var tal144val = formulaEval(t144.formula, t144.x1, t144.x2, rawLv144 + bonus144);
            result[key] = bonus * (1 + tal144val / 100);
          }
        }
      }
    }
  }
  return result;
}

// ==================== ALL STAT PCT ====================
// Game: 0.1 * floor(10 * (sum of ~16 sub-sources))
function computeAllStatPCT(charIdx, ctx) {
  var saveData = ctx.saveData;
  var sum = 0;
  var children = [];
  var subMissing = [];

  function addSub(name, val, ch) {
    sum += val;
    children.push(node(name, val, ch || null, { fmt: 'raw' }));
  }
  function stubSub(name) {
    subMissing.push(name);
    children.push(node(name + ' [TODO]', 0, null, { fmt: 'raw' }));
  }

  // 1. AlchVials.AllStatPCT
  // Vial 49 (PEARL_SELTZER): add(0.5, 0, vialLevel), key = "AllStatPCT"
  // VialBonus = (mf10==2?2:1) * (1+DNzz/100) * (1+meritoc20/100) * formulaVal
  // DNzz = (Rift[0]>34 ? 0 : 0) + VaultUpgBonus(42)
  var vialAllStatPCT = 0;
  var vialCh = [];
  var vials = cauldronInfoData[4] || [];
  for (var vi = 0; vi < AlchemyDescription[4].length; vi++) {
    var vDesc = AlchemyDescription[4][vi];
    if (vDesc[11] !== 'AllStatPCT') continue;
    var vialLv = Number(vials[vi]) || 0;
    if (vialLv <= 0) continue;
    var vialBase = formulaEval(vDesc[3], Number(vDesc[1]) || 0, Number(vDesc[2]) || 0, vialLv);
    var riftActive = Number(saveData.riftData && saveData.riftData[0]) > 34;
    var vub42 = vaultUpgBonus(42, saveData);
    // Rift bonus: 2 * (count of max-level vials) when Rift[0] > 34
    var maxLvVials = 0;
    if (riftActive) {
      for (var rvi = 0; rvi < vials.length; rvi++) {
        if ((Number(vials[rvi]) || 0) >= 13) maxLvVials++;
      }
    }
    var riftVialBonus = riftActive ? 2 * maxLvVials : 0;
    var dNzz = riftVialBonus + vub42;
    var mf10lab = mainframeBonus(10, saveData) === 2 ? 2 : 1;
    var meritoc20 = computeMeritocBonusz(20, saveData);
    vialAllStatPCT += mf10lab * (1 + dNzz / 100) * (1 + meritoc20 / 100) * vialBase;
    vialCh.push(node(vDesc[0] + ' Lv' + vialLv, vialAllStatPCT, [
      node('Base', vialBase, null, { fmt: 'raw', note: vDesc[3] + '(' + vDesc[1] + ',' + vDesc[2] + ',' + vialLv + ')' }),
      node('Lab x2', mf10lab, null, { fmt: 'x' }),
      node(label('Vault', 42), vub42, null, { fmt: 'raw', note: 'DNzz=' + dNzz }),
      node(label('Meritoc', 20), 1 + meritoc20 / 100, null, { fmt: 'x' }),
    ], { fmt: 'raw' }));
  }
  addSub('AlchVials.AllStatPCT', vialAllStatPCT, vialCh.length ? vialCh : null);

  // 2. 15 * Companions(0) * CosmoBonusQTY(2,0)
  var comp0 = saveData.companionIds && saveData.companionIds.has(0) ? 1 : 0;
  var hd = saveData.holesData || [];
  var cosmo20Lv = Number((hd[6] && hd[6][0]) || 0);
  var cosmo20base = cosmoUpgBase(2, 0);
  var cosmo20 = Math.floor(cosmo20base * cosmo20Lv);
  var compCosmo = COMPANION_BONUS[0] * comp0 * cosmo20;
  addSub(COMPANION_BONUS[0] + '*Comp(0)*Cosmo(2,0)', compCosmo, [
    node(label('Companion', 0, ' owned'), comp0, null, { fmt: 'raw' }),
    node('CosmoBonusQTY(2,0)', cosmo20, null, { fmt: 'raw', note: 'base=' + cosmo20base + ' lv=' + cosmo20Lv }),
  ]);

  // 3. MainframeBonus(104)
  var mf104 = mainframeBonus(104, saveData);
  addSub('MainframeBonus(104)', mf104);

  // 4. StampBonusOfTypeX("AllStatPct")
  var stampAllStatPct = computeStampBonusOfTypeX('AllStatPct', saveData);
  addSub('Stamp AllStatPct', stampAllStatPct.val, stampAllStatPct.children);

  // 5. CardBonusREAL(82)
  var card82 = computeCardBonusByType(82, charIdx, saveData);
  addSub('CardBonusREAL(82)', card82.val, card82.children);

  // 6. Summoning WinBonus(18)
  var wb18 = computeWinBonus(18, null, saveData);
  addSub('WinBonus(18)', wb18);

  // 7. FamBonusQTYs[72]
  var famMap = computeFamBonusQTYs(charIdx, saveData);
  var fam72 = famMap[72] || 0;
  addSub('FamBonusQTYs[72]', fam72);

  // 8. Sailing ArtifactBonus(28)
  var sailing = saveData.sailingData;
  var art28tier = Number((sailing && sailing[3] && sailing[3][28]) || 0);
  var art28val = art28tier > 0 ? artifactBase(28) * art28tier : 0;
  addSub('ArtifactBonus(28)', art28val, art28tier > 0 ? [
    node('Tier', art28tier, null, { fmt: 'raw' }),
    node('Base', artifactBase(28), null, { fmt: 'raw' }),
  ] : null);

  // 9. GoldFoodBonuses("AllStatz")
  var gfoodAllStatz = goldFoodBonuses('AllStatz', charIdx, undefined, saveData);
  addSub('GoldFood AllStatz', gfoodAllStatz.total);

  // 10. AchieveStatus(309)
  addSub('AchieveStatus(309)', achieveStatus(309, saveData));

  // 11. min(15, getLOG(OLA[172]) * GetTalentNumber(1, 653))
  var ola172 = Number((optionsListData && optionsListData[172]) || 0);
  var logOla172 = ola172 > 0 ? getLOG(ola172) : 0;
  var tal653node = talentResolver.resolve(653, ctx);
  var tal653eff = tal653node.val;
  var tal653val = Math.min(15, logOla172 * tal653eff);
  addSub('min(15,LOG(OLA172)*tal653)', tal653val, [
    node('OLA[172]', ola172, null, { fmt: 'raw' }),
    node('LOG(OLA172)', logOla172, null, { fmt: 'raw' }),
    tal653node,
  ]);

  // 12. AchieveStatus(362)
  addSub('AchieveStatus(362)', achieveStatus(362, saveData));

  // 13. 10 * floor((98 + OLA[232]) / 100)
  var ola232 = Number((optionsListData && optionsListData[232]) || 0);
  var ola232val = 10 * Math.floor((98 + ola232) / 100);
  addSub('10*floor((98+OLA232)/100)', ola232val, [
    node('OLA[232]', ola232, null, { fmt: 'raw' }),
  ]);

  // 14. FarmingStuffs("LankRankUpgBonus", 19, 0)
  var farmRank19 = farmResolver.resolve('rank19', ctx);
  addSub('FarmRankUpg(19)', farmRank19.val, farmRank19.children);

  // 15. Summoning VotingBonusz(2)
  var vote2 = votingBonusz(2, null, saveData);
  addSub('VotingBonusz(2)', vote2);

  // 16. SetBonus("MARBIGLASS_SET")
  var perma379 = String((optionsListData && optionsListData[379]) || '');
  var marbiVal = perma379.indexOf('MARBIGLASS_SET') !== -1 ? equipSetBonus('MARBIGLASS_SET') : 0;
  addSub('SetBonus(MARBIGLASS)', marbiVal);

  var raw = 0.1 * Math.floor(10 * sum);
  return { val: raw, rawSum: sum, children: children, subMissing: subMissing };
}

// ==================== MAIN: computeTotalStat ====================
export function computeTotalStat(statName, charIdx, ctx) {
  var saveData = ctx.saveData;
  var cfg = STAT_CONFIG[statName];
  if (!cfg) return { computed: 0, missingCount: 1,
    missingNames: ['Unknown stat: ' + statName], tree: node('Total ' + statName, 0) };

  var tracked = { computed: 0, missing: 0, missingNames: [] };
  function addComputed(val) { tracked.computed += val; return val; }
  function addMissing(name) { tracked.missing++; tracked.missingNames.push(name); return 0; }

  // ==================== EQUIP DN ====================
  var equipBase = computeEquipBaseStat(charIdx, statName, saveData);
  var equipBaseStat = addComputed(equipBase.val);

  var galleryBase = computeGalleryBaseStat(charIdx, ctx, statName);
  var galleryBaseStat = addComputed(galleryBase.val);

  // DN pct multiplier: (1 + (dnTalent + stampPct) / 100)
  var dnTalentVal = talentResolver.resolve(cfg.dnPctTalent, ctx).val;
  addComputed(dnTalentVal);
  var stampPctStat = computeStampBonusOfTypeX(cfg.dnPctStampType, saveData);
  addComputed(stampPctStat.val);
  var equipPctMult = 1 + (dnTalentVal + stampPctStat.val) / 100;
  var totalStatsDN_main = (equipBaseStat + galleryBaseStat) * equipPctMult;

  // DN2 (obol) pct: (1 + (dn2Talent + 40*superBit2) / 100)
  var obolBase = computeObolBaseStat(charIdx, statName);
  var obolBaseStat = addComputed(obolBase.val);
  var dn2TalentVal = talentResolver.resolve(cfg.dn2PctTalent, ctx).val;
  addComputed(dn2TalentVal);
  var superBit2 = superBitType(2, saveData.gamingData && saveData.gamingData[12]) ? 1 : 0;
  var obolPctMult = 1 + (dn2TalentVal + 40 * superBit2) / 100;
  var totalStatsDN2 = obolBaseStat * obolPctMult;

  var totalStatsDN = totalStatsDN_main + totalStatsDN2;

  var equipDNchildren = [
    node('Equipment Base ' + statName, equipBaseStat, equipBase.children, { fmt: 'raw' }),
    node('Gallery Base ' + statName, galleryBaseStat, galleryBase.children, { fmt: 'raw' }),
    node('DN Pct Mult', equipPctMult, [
      node('Talent ' + cfg.dnPctTalent, dnTalentVal, null, { fmt: 'raw' }),
      node('Stamp ' + cfg.dnPctStampType, stampPctStat.val, stampPctStat.children, { fmt: 'raw' }),
    ], { fmt: 'x' }),
    node('Obol Base ' + statName, obolBaseStat, obolBase.children, { fmt: 'raw' }),
    node('Obol Pct Mult', obolPctMult, [
      node('Talent ' + cfg.dn2PctTalent, dn2TalentVal, null, { fmt: 'raw' }),
      node(label('Super Bit', 2), 40 * superBit2, null, { fmt: 'raw' }),
    ], { fmt: 'x' }),
  ];

  // ==================== PCT POOL ====================
  var etcPct = etcBonusResolver.resolve(cfg.etcPct, ctx).val;
  addComputed(etcPct);
  var etcB46 = etcBonusResolver.resolve(46, ctx).val;
  addComputed(etcB46);
  // AllStatPCT: 16 sub-sources — see computeAllStatPCT()
  var allStatPCTResult = computeAllStatPCT(charIdx, ctx);
  var allStatPCT = allStatPCTResult.val;
  addComputed(allStatPCT);
  for (var _asmi = 0; _asmi < allStatPCTResult.subMissing.length; _asmi++) {
    tracked.missing++;
    tracked.missingNames.push('AllStatPCT.' + allStatPCTResult.subMissing[_asmi]);
  }
  var pristineVal = pristineResolver.resolve(cfg.pristineIdx, ctx).val;
  addComputed(pristineVal);

  // Star sign %stat
  var signBonuses = computeStarSignStatBonuses(statName, charIdx, saveData);
  var starSignPct = signBonuses.pct.val;
  addComputed(starSignPct);

  // Stat-specific pct talent (STR=143, AGI=368, WIS=533; LUK=none)
  var pctTalentVal = 0;
  if (cfg.pctTalent) {
    pctTalentVal = talentResolver.resolve(cfg.pctTalent, ctx).val;
    addComputed(pctTalentVal);
  }

  // Stat-specific pct bubble (STR=W8, AGI=A9, WIS=M9; LUK=none)
  var pctBubbleVal = 0;
  if (cfg.pctBubble) {
    var pctBbl = computeAlchBubble(cfg.pctBubble, charIdx, saveData);
    pctBubbleVal = pctBbl.val;
    addComputed(pctBubbleVal);
  }

  var pctSum = pctTalentVal + etcPct + etcB46 + allStatPCT + pristineVal + starSignPct + pctBubbleVal;
  var pctMult = 1 + pctSum / 100;

  var pctChildren = [];
  if (cfg.pctTalent) pctChildren.push(node('Talent ' + cfg.pctTalent, pctTalentVal, null, { fmt: 'raw' }));
  pctChildren.push(
    node('EtcBonuses(' + cfg.etcPct + ') %_' + statName, etcPct, null, { fmt: 'raw' }),
    node('EtcBonuses(46) %_ALL_STATS', etcB46, null, { fmt: 'raw' }),
    node('AllStatPCT', allStatPCT, allStatPCTResult.children, { fmt: 'raw', note: '0.1*floor(10*' + allStatPCTResult.rawSum.toFixed(1) + ')' }),
    node('Pristine(' + cfg.pristineIdx + ')', pristineVal, null, { fmt: 'raw' }),
    node('StarSigns.pct' + statName, starSignPct, signBonuses.pct.children.length ? [
      node('Base Sum', signBonuses.pct.baseVal, signBonuses.pct.children, { fmt: 'raw' }),
      node('Seraph Multi', signBonuses.pct.seraphMulti, null, { fmt: 'x' }),
    ] : null, { fmt: 'raw' })
  );
  if (cfg.pctBubble) pctChildren.push(node('AlchBubble ' + cfg.pctBubble, pctBubbleVal, null, { fmt: 'raw' }));

  // ==================== FLAT BASE POOL ====================
  // Game grouping: (flatTalent + guildTalent + stampBase + [boxBase] + etcFlat + [shimmer])
  // LUK includes boxRewardsBase and shimmer in flatBase; other stats don't.
  var flatTalentVal = talentResolver.resolve(cfg.flatTalent, ctx).val;
  addComputed(flatTalentVal);

  // Guild bonus: getbonus2(1, guildTalent, -1, saveData) = max talent across all chars
  var guildMax = talentResolver.resolve(cfg.guildTalent, ctx, { mode: 'max' });
  var guildVal = guildMax.val;
  addComputed(guildVal);

  var stampBase = computeStampBonusOfTypeX(cfg.stampBaseType, saveData);
  addComputed(stampBase.val);

  // BoxRewards base (e.g. "15c" for LUK = Science_Spare_Parts slot 2)
  var boxBase = cfg.boxRewardsBase ? computeBoxReward(charIdx, cfg.boxRewardsBase) : { val: 0, children: [] };
  addComputed(boxBase.val);

  var etcFlat = etcBonusResolver.resolve(cfg.etcFlat, ctx).val;
  addComputed(etcFlat);

  // OLA[shimmer] * DreamShimmer — LUK includes this in flatBase; others put it in flatAdd
  var olaVal = Number(optionsListData && optionsListData[cfg.olaShimmer]) || 0;
  var dreamShimmer = computeDreamShimmer(saveData);
  var shimmerVal = olaVal * dreamShimmer;
  addComputed(shimmerVal);

  // Extra stat-specific talents (STR:[98,203], AGI:[278,428], WIS:[459,593]; LUK:none)
  var extraTalentSum = 0;
  var extraTalentCh = [];
  if (cfg.extraTalents) {
    for (var et = 0; et < cfg.extraTalents.length; et++) {
      var etv = talentResolver.resolve(cfg.extraTalents[et], ctx).val;
      extraTalentSum += etv;
      addComputed(etv);
      extraTalentCh.push(node('Talent ' + cfg.extraTalents[et], etv, null, { fmt: 'raw' }));
    }
  }
  if (cfg.extraTab2Talent) {
    var et2v = talentResolver.resolve(cfg.extraTab2Talent, ctx, { tab: 2 }).val;
    extraTalentSum += et2v;
    addComputed(et2v);
    extraTalentCh.push(node('Tab2 Talent ' + cfg.extraTab2Talent, et2v, null, { fmt: 'raw' }));
  }

  // GetBuffBonuses (STR only: buff 94)
  var buffVal = 0;
  if (cfg.buffBonus) {
    var buffId = cfg.buffBonus[0], buffTab = cfg.buffBonus[1];
    var charBuffs = buffsActiveData[charIdx] || [];
    var buffActive = false;
    for (var bi = 0; bi < charBuffs.length; bi++) {
      if (Number(charBuffs[bi][0] || charBuffs[bi]['0']) === buffId) { buffActive = true; break; }
    }
    if (buffActive) {
      buffVal = talentResolver.resolve(buffId, ctx, { tab: buffTab }).val;
    }
  }

  // Game flatBase = tal + guild + stampBase + etcFlat
  //   + (LUK only: boxBase + shimmer)
  var flatBaseSum = flatTalentVal + guildVal + stampBase.val + etcFlat;
  if (statName === 'LUK') flatBaseSum += boxBase.val + shimmerVal;

  var flatBaseChildren = [
    node('Talent ' + cfg.flatTalent, flatTalentVal, null, { fmt: 'raw' }),
    node('Guild (max tal ' + cfg.guildTalent + ')', guildVal, null, { fmt: 'raw' }),
    node('Stamp ' + cfg.stampBaseType, stampBase.val, stampBase.children, { fmt: 'raw' }),
    node('EtcBonuses(' + cfg.etcFlat + ') _' + statName, etcFlat, null, { fmt: 'raw' }),
  ];
  if (statName === 'LUK') {
    flatBaseChildren.push(
      node('BoxRewards[' + cfg.boxRewardsBase + ']', boxBase.val, boxBase.children, { fmt: 'raw' }),
      node('OLA[' + cfg.olaShimmer + ']*Shimmer', shimmerVal, [
        node('OLA Count', olaVal, null, { fmt: 'raw' }),
        node('DreamShimmer', dreamShimmer, null, { fmt: 'x' }),
      ], { fmt: 'raw' })
    );
  }

  // ==================== FLAT ADD POOL ====================
  // BoxRewards stat (e.g. "LUK" from Non_Predatory_Loot_Box)
  var boxStat = cfg.boxRewardsStat ? computeBoxReward(charIdx, cfg.boxRewardsStat) : { val: 0, children: [] };
  addComputed(boxStat.val);

  // FamBonusQTYs — family bonus for this stat
  var famMap = computeFamBonusQTYs(charIdx, saveData);
  var famBonus = famMap[cfg.famBonusIdx] || 0;
  addComputed(famBonus);

  // Star sign flat stat
  var starSignFlat = signBonuses.flat.val;
  addComputed(starSignFlat);

  // min(TotalQuestsComplete, talent618) — only LUK uses this
  var questsTal618 = 0;
  if (cfg.questsTal618) {
    var totalQC = saveData.totalQuestsComplete || 0;
    var tal618node = talentResolver.resolve(618, ctx);
    var tal618eff = tal618node.val;
    questsTal618 = Math.min(totalQC, tal618eff);
    addComputed(questsTal618);
  }

  // TalentCalc(620) = min(effectiveTalentLevel620, floor(maxCharLevel/10))
  // Game also applies AllTalentLVz to 620
  var tal620raw = 0;
  var tal620node = talentResolver.resolve(620, ctx);
  var tal620eff = tal620node.val;
  if (tal620eff > 0) {
    var maxCharLv = 0;
    var lv0All = saveData.lv0AllData || [];
    for (var ci = 0; ci < lv0All.length; ci++) {
      var clv = Number((lv0All[ci] && lv0All[ci][0]) || 0);
      if (clv > maxCharLv) maxCharLv = clv;
    }
    tal620raw = Math.min(tal620eff, Math.floor(maxCharLv / 10));
    addComputed(tal620raw);
  }

  // CardBonusREAL(typeId)
  var cardResult = computeCardBonusByType(cfg.cardType, charIdx, saveData);
  addComputed(cardResult.val);

  // Flat talent 2 (e.g. Lucky Horseshoe for LUK)
  var flatTal2Val = cfg.flatTalent2 ? talentResolver.resolve(cfg.flatTalent2, ctx).val : 0;
  if (cfg.flatTalent2) addComputed(flatTal2Val);

  // Stamp BaseAllStat
  var stampBaseAllStat = computeStampBonusOfTypeX('BaseAllStat', saveData);
  addComputed(stampBaseAllStat.val);

  // AllStat = floor(BoxRewards["20a"] + MealBonus("Stat") + GuildBonuses(1))
  var boxRew20a = computeBoxReward(charIdx, '20a');
  addComputed(boxRew20a.val);
  var guildData = saveData.guildData;
  var gbPoints1 = guildData ? (Number((guildData[0] || {})[1]) || 0) : 0;
  var _gb1 = guildBonusParams(1);
  var guildBon1 = gbPoints1 > 0 && _gb1 ? formulaEval(_gb1.formula, _gb1.x1, _gb1.x2, gbPoints1) : 0;
  addComputed(guildBon1);
  // MealBonus("Stat") = 0: no meal has bonus type "Stat" in MealINFO
  var mealBonusStat = 0;
  var allStat = Math.floor(boxRew20a.val + mealBonusStat + guildBon1);

  // Sigil
  var sigilVal = sigilResolver.resolve(cfg.sigilIdx, ctx).val;
  addComputed(sigilVal);

  // A4/W4/M4 bubble (stat-specific slab bubble)
  var a4Val = 0;
  var a4bubble;
  if (cfg.a4Bubble) {
    a4bubble = computeAlchBubble(cfg.a4Bubble, charIdx, saveData);
    a4Val = a4bubble.val;
    addComputed(a4Val);
  }

  var shinyVal = shinyResolver.resolve(cfg.shinyIdx, ctx).val;
  addComputed(shinyVal);
  var arcadeVal = arcadeResolver.resolve(cfg.arcadeIdx, ctx).val;
  addComputed(arcadeVal);
  var owlVal = owlResolver.resolve(5, ctx).val;
  addComputed(owlVal);

  var flatAddSum = extraTalentSum + buffVal + shimmerVal + boxStat.val + famBonus + starSignFlat + questsTal618
    + tal620raw + cardResult.val + flatTal2Val + stampBaseAllStat.val + allStat
    + sigilVal + a4Val + shinyVal + arcadeVal + owlVal;
  // LUK already counted boxBase and shimmer in flatBase
  if (statName === 'LUK') flatAddSum -= shimmerVal;

  var flatAddChildren = [];
  if (extraTalentCh.length) flatAddChildren.push(node('Extra Talents', extraTalentSum, extraTalentCh, { fmt: 'raw' }));
  if (buffVal > 0) flatAddChildren.push(node('Buff Bonus', buffVal, null, { fmt: 'raw' }));
  if (statName !== 'LUK') {
    flatAddChildren.push(node('OLA[' + cfg.olaShimmer + ']*Shimmer', shimmerVal, [
      node('OLA Count', olaVal, null, { fmt: 'raw' }),
      node('DreamShimmer', dreamShimmer, null, { fmt: 'x' }),
    ], { fmt: 'raw' }));
  }
  flatAddChildren.push(
    node('BoxRewards[' + cfg.boxRewardsStat + ']', boxStat.val, boxStat.children, { fmt: 'raw' }),
    node('FamBonusQTYs[' + cfg.famBonusIdx + ']', famBonus, null, { fmt: 'raw' }),
    node('StarSigns.' + statName, starSignFlat, signBonuses.flat.children.length ? [
      node('Base Sum', signBonuses.flat.baseVal, signBonuses.flat.children, { fmt: 'raw' }),
      node('Seraph Multi', signBonuses.flat.seraphMulti, null, { fmt: 'x' }),
    ] : null, { fmt: 'raw' }),
    node('min(Quests,tal618)', questsTal618, cfg.questsTal618 ? [
      node('TotalQuestsComplete', saveData.totalQuestsComplete || 0, null, { fmt: 'raw' }),
      node(label('Talent', 618, ' Eff'), questsTal618, null, { fmt: 'raw' }),
    ] : null, { fmt: 'raw' }),
    node('TalentCalc(620)', tal620raw, null, { fmt: 'raw', note: 'min(eff' + tal620eff + ', maxLv/10)' }),
    node('CardBonusREAL(' + cfg.cardType + ')', cardResult.val, cardResult.children, { fmt: 'raw' })
  );
  if (cfg.flatTalent2) flatAddChildren.push(node('Talent ' + cfg.flatTalent2, flatTal2Val, null, { fmt: 'raw' }));
  flatAddChildren.push(
    node('Stamp BaseAllStat', stampBaseAllStat.val, stampBaseAllStat.children, { fmt: 'raw' }),
    node('AllStat', allStat, [
      node('BoxRewards[20a]', boxRew20a.val, boxRew20a.children, { fmt: 'raw' }),
      node('GuildBonuses(1)', guildBon1, null, { fmt: 'raw', note: 'pts=' + gbPoints1 }),
      node('MealBonus(Stat)', 0, null, { fmt: 'raw', note: 'no meal gives Stat type' }),
    ], { fmt: 'raw' }),
    node('Sigil(' + cfg.sigilIdx + ')', sigilVal, null, { fmt: 'raw' })
  );
  if (cfg.a4Bubble) flatAddChildren.push(node('AlchBubble ' + cfg.a4Bubble, a4Val,
    a4bubble ? a4bubble.children : null, { fmt: 'raw', note: a4bubble ? a4bubble.name : '' }));
  flatAddChildren.push(
    node('Shiny(' + cfg.shinyIdx + ')', shinyVal, null, { fmt: 'raw' }),
    node('Arcade(' + cfg.arcadeIdx + ')', arcadeVal, null, { fmt: 'raw' }),
    node('Owl(5)', owlVal, null, { fmt: 'raw' })
  );

  // ==================== TOP LEVEL ====================
  var totalBubble = computeAlchBubble(cfg.totalBubble, charIdx, saveData);
  addComputed(totalBubble.val);
  var tal652 = talentResolver.resolve(652, ctx).val;
  addComputed(tal652);
  var comp8 = companionResolver.resolve(8, ctx).val;
  addComputed(comp8);

  var topLevel = totalBubble.val + tal652 + comp8;

  var topChildren = [
    node('AlchBubble ' + cfg.totalBubble, totalBubble.val, totalBubble.children,
      { fmt: 'raw', note: totalBubble.name }),
    node(label('Talent', 652, ' (Stat Overload)'), tal652, null, { fmt: 'raw' }),
    node('Companions(8)', comp8, null, { fmt: 'raw' }),
  ];

  // ==================== COMBINE ====================
  var inner = pctMult * (totalStatsDN + flatBaseSum + flatAddSum);
  var computed = Math.floor(topLevel + inner);

  var treeChildren = [
    node('Top Level', topLevel, topChildren, { fmt: 'raw' }),
    node('Pct Multiplier (1 + pct/100)', pctMult, pctChildren, { fmt: 'x' }),
    node('TotalStatsDN', totalStatsDN, equipDNchildren, { fmt: 'raw' }),
    node('Flat Base', flatBaseSum, flatBaseChildren, { fmt: 'raw' }),
    node('Flat Add', flatAddSum, flatAddChildren, { fmt: 'raw' }),
    node('Computed Total', computed, null, { fmt: 'full' }),
  ];

  return {
    computed: computed,
    missingCount: tracked.missing,
    missingNames: tracked.missingNames,
    tree: node('Total ' + statName, computed, treeChildren, { fmt: 'full' }),
  };
}

// ==================== LUK CURVE + LUKSCALING ====================
function lukCurve(luk) {
  if (luk < 1000) return (Math.pow(luk + 1, 0.37) - 1) / 40;
  return (luk - 1000) / (luk + 2500) * 0.5 + 0.297;
}

export var lukScaling = {
  resolve: function(id, ctx) {
    var charIdx = ctx.charIdx;
    var lukResult = computeTotalStat('LUK', charIdx, ctx);
    var totalLUK = lukResult.computed;
    var drLUK = lukCurve(totalLUK);

    var lukChildren = lukResult.tree.children || [];
    lukChildren.unshift(
      node(totalLUK < 1000 ? 'Sub-1000 curve' : 'Over-1000 curve', drLUK, null, { fmt: 'raw',
        note: totalLUK < 1000
          ? '(pow(' + totalLUK + '+1, 0.37)-1)/40'
          : '(' + totalLUK + '-1000)/(' + totalLUK + '+2500)*0.5+0.297' })
    );

    return node('LUK Scaling', drLUK, lukChildren, { fmt: 'raw' });
  },
};

// ==================== STATUE BONUS ====================

import { StatueInfo, ZenithMarket, MealINFO } from '../../data/game/customlists.js';
import { eventShopOwned, ribbonBonusAt } from '../../../game-helpers.js';
import { computeShinyBonusS } from '../w4/breeding.js';

function _rval(resolver, id, ctx, args) {
  try { return resolver.resolve(id, ctx, args).val || 0; }
  catch(e) { return 0; }
}

function _safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;
  } catch(e) { return 0; }
}

// Map class ID to primary damage stat name
export function primaryStatForClass(charIdx) {
  var cls = Number(charClassData && charClassData[charIdx]) || 0;
  if (cls <= 0) return 'STR'; // Beginner default
  if (cls < 6) return 'LUK'; // Journeyman family
  var root = 6 + 12 * Math.floor((cls - 6) / 12);
  if (root === 18) return 'AGI';
  if (root === 30) return 'WIS';
  return 'STR'; // root === 6 or fallback
}

export function computeStatueBonusGiven(idx, charIdx, saveData) {
  var s = saveData;
  var statueLv = Number(s.statueData && s.statueData[idx]) || 0;
  if (statueLv <= 0) return treeResult(0, null);
  var baseBonus = Number(StatueInfo[idx] && StatueInfo[idx][3]) || 1;
  var val = statueLv * baseBonus;
  var children = [node('Level', statueLv, null, { fmt: 'raw' }), node('Base/Lv', baseBonus, null, { fmt: 'raw' })];
  var _dbg = false;
  if (_dbg) console.log('[statue'+idx+'] base:', val.toFixed(2));
  // Game uses GetTalentNumber(1, X) = current character's talent, NOT max scan
  var _ci = charIdx != null ? charIdx : 0;
  var _ctx = { saveData: s, charIdx: _ci };
  if (idx === 0 || idx === 2 || idx === 8 || idx === 7) {
    if (idx !== 7) { var _t = _rval(talentResolver, 112, _ctx); if (_t > 0) children.push(node('Talent 112', _t, null, { fmt: 'raw', note: '×' + (1+_t/100).toFixed(2) })); val *= Math.max(1, 1 + _t / 100); }
    if (idx !== 8) { var _t = _rval(talentResolver, 127, _ctx); if (_t > 0) children.push(node('Talent 127', _t, null, { fmt: 'raw', note: '×' + (1+_t/100).toFixed(2) })); val *= Math.max(1, 1 + _t / 100); }
  } else if (idx === 1 || idx === 11 || idx === 9 || idx === 14) {
    if (idx !== 14) { var _t = _rval(talentResolver, 292, _ctx); if (_t > 0) children.push(node('Talent 292', _t, null, { fmt: 'raw', note: '×' + (1+_t/100).toFixed(2) })); val *= Math.max(1, 1 + _t / 100); }
    if (idx !== 9) { var _t = _rval(talentResolver, 307, _ctx); if (_t > 0) children.push(node('Talent 307', _t, null, { fmt: 'raw', note: '×' + (1+_t/100).toFixed(2) })); val *= Math.max(1, 1 + _t / 100); }
  } else if (idx === 10 || idx === 6 || idx === 12 || idx === 13) {
    if (idx !== 13) { var _t = _rval(talentResolver, 487, _ctx); if (_t > 0) children.push(node('Talent 487', _t, null, { fmt: 'raw', note: '×' + (1+_t/100).toFixed(2) })); val *= Math.max(1, 1 + _t / 100); }
    if (idx !== 12) { var _t = _rval(talentResolver, 472, _ctx); if (_t > 0) children.push(node('Talent 472', _t, null, { fmt: 'raw', note: '×' + (1+_t/100).toFixed(2) })); val *= Math.max(1, 1 + _t / 100); }
  } else if (idx === 3 || idx === 5 || idx === 17) {
    var _t = _rval(talentResolver, 37, _ctx); if (_t > 0) children.push(node('Talent 37', _t, null, { fmt: 'raw', note: '×' + (1+_t/100).toFixed(2) }));
    val *= Math.max(1, 1 + _t / 100);
  }
  var statueG = Number(s.statueGData && s.statueGData[idx]) || 0;
  if (statueG >= 2) {
    var art30tier = Number(s.sailingData && s.sailingData[3] && s.sailingData[3][30]) || 0;
    var art30val = art30tier > 0 ? artifactBase(30) * Math.max(1, art30tier) : 0;
    var gMult = 1 + (100 + art30val) / 100;
    children.push(node('Gold G2', gMult, null, { fmt: 'x', note: 'art30=' + art30val.toFixed(0) }));
    val *= Math.max(1, gMult);
  }
  if (statueG >= 3) {
    var zmLv = Number(s.spelunkData && s.spelunkData[45] && s.spelunkData[45][0]) || 0;
    var zmMulti = Number(ZenithMarket && ZenithMarket[0] && ZenithMarket[0][4]) || 1;
    var g3Mult = 1 + (50 + Math.floor(zmMulti * zmLv)) / 100;
    children.push(node('Gold G3', g3Mult, null, { fmt: 'x', note: 'zmLv=' + zmLv }));
    val *= Math.max(1, g3Mult);
  }
  if (idx === 0 || idx === 1 || idx === 2 || idx === 6) {
    var _v25 = _safe(vaultUpgBonus, 25);
    if (_v25 > 0) { children.push(node('Vault 25', _v25, null, { fmt: 'raw' })); }
    val *= Math.max(1, 1 + _v25 / 100);
  }
  if (idx !== 29) {
    var _s29 = computeStatueBonusGiven(29, charIdx, saveData);
    var _s29v = (typeof _s29 === 'object') ? (Number(_s29) || 0) : _s29;
    if (_s29v > 0) children.push(node('Statue 29 multi', _s29v, null, { fmt: 'raw', note: '×' + (1+_s29v/100).toFixed(2) }));
    val *= Math.max(1, 1 + _s29v / 100);
  }
  var _evShop = eventShopOwned(19, s.cachedEventShopStr);
  var _t56 = _rval(talentResolver, 56, { saveData: s, charIdx: charIdx != null ? charIdx : 0 }, { mode: 'max' });
  var _m26 = _safe(computeMeritocBonusz, 26);
  if (_dbg) console.log('[statue'+idx+'] before finals:', val.toFixed(2), 'evShop:', _evShop, 't56:', _t56, 'm26:', _m26);
  if (_evShop) children.push(node('EventShop 19', _evShop, null, { fmt: 'raw', note: '×' + (1+0.3*_evShop).toFixed(2) }));
  val *= (1 + 0.3 * _evShop);
  if (_t56 > 0) children.push(node('Talent 56', _t56, null, { fmt: 'raw', note: '×' + (1+_t56/100).toFixed(2) }));
  val *= Math.max(1, 1 + _t56 / 100);
  if (_m26 > 0) children.push(node('Meritoc 26', _m26, null, { fmt: 'raw', note: '×' + (1+_m26/100).toFixed(2) }));
  val *= (1 + _m26 / 100);
  if (_dbg) console.log('[statue'+idx+'] final:', val.toFixed(2));
  return treeResult(val, children);
}

// ==================== MEAL BONUS ====================

export function computeMealBonus(effectKey, saveData) {
  var s = saveData;
  var meals0 = s.mealsData && s.mealsData[0];
  if (!meals0) return treeResult(0, null);
  var cookMulti = cookingMealMulti(s).val;
  var total = 0;
  var children = [];
  for (var mi = 0; mi < MealINFO.length; mi++) {
    if (!MealINFO[mi] || MealINFO[mi][5] !== effectKey) continue;
    var mealLv = Number(meals0[mi]) || 0;
    if (mealLv <= 0) continue;
    var bonusPerLv = Number(MealINFO[mi][2]) || 0;
    var ribIdx = 28 + mi;
    var ribMeal = ribbonBonusAt(ribIdx, s.ribbonData, String((s.olaData && s.olaData[379]) || ''), s.weeklyBossData);
    var contrib = cookMulti * ribMeal * mealLv * bonusPerLv;
    total += contrib;
    children.push(node('Meal ' + mi + ' (' + (MealINFO[mi][0] || '').replace(/_/g, ' ') + ')', contrib, null,
      { fmt: 'raw', note: 'lv=' + mealLv + ' rib=' + ribMeal.toFixed(2) }));
  }
  return treeResult(total, children);
}

// ==================== FAMILIAR BONUSES ====================

export function computeFamBonusQTY(famIdx, saveData) {
  var s = saveData;
  if (!ClassFamilyBonuses || !ClassFamilyBonuses[famIdx]) return 0;
  var info = ClassFamilyBonuses[famIdx];
  var bonusPerChar = Number(info[1]) || 0;
  var total = 0;
  for (var ci2 = 0; ci2 < numCharacters; ci2++) {
    var cls2 = Number(charClassData && charClassData[ci2]) || 0;
    if (cls2 <= 0) continue;
    var lvArr = s.lv0AllData && s.lv0AllData[ci2];
    var classLv = Number(lvArr && lvArr[0]) || 0;
    if (classLv > 0) total += bonusPerChar;
  }
  return total;
}

// ==================== WORKBENCH (WORLD BOSS) ====================

export function computeWorkbenchStuff(saveData) {
  var s = saveData;
  var wboss = s.worldBossData;
  if (!wboss) return 1;
  var total = 1;
  for (var bi = 0; bi < 4; bi++) {
    var bossLv = Number(wboss[bi]) || 0;
    if (bossLv > 0) total *= 1 + bossLv / 100;
  }
  return total;
}
