// ===== GALLERY SYSTEM (W7) =====
// Nametag/PremHat bonus systems.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { optionsListData, numCharacters, labData } from '../../../save/data.js';
import { computeCardLv } from '../common/cards.js';
import { NAMETAG_TIER_SCALE } from '../../data/common/nametag.js';
import { NAMETAG_DR, NAMETAG_NAMES, TROPHY_DR, TROPHY_NAMES,
  PREMHAT_DR, PREMHAT_NAMES, GALLERY_STAT_FOR_ID } from '../../data/w7/gallery.js';
import { mineheadBonusQTY } from './research.js';
import { rogBonusQTY } from './sushi.js';
import { legendPTSbonus } from './spelunking.js';
import { eventShopOwned, emporiumBonus } from '../../../game-helpers.js';
import { companionBonus } from '../../data/common/companions.js';
import { GALLERY_TROPH_CHIP_MULTI } from '../../data/game-constants.js';
import { bubbleBonusY13 } from '../w2/alchemy.js';

// GalleryBonusMulti: 1 + (3*Spelunk[13][4] + 10*chipBonuses("troph") + 3*ClamWorkBonus(7)
//   + KillroyBonuses(3) + min(20, AlchBubbles.Y13) + min(CardLv("w7a11"), 10) + Companions(49)) / 100
// GalleryBonusMulti: 1 + (3*GalleryLv + 10*chipBonuses("troph") + 3*ClamWorkBonus(7)
//   + KillroyBonuses(3) + min(20, AlchBubbles.Y13) + min(CardLv("w7a11"), 10) + Companions(49)) / 100
export function galleryBonusMulti(saveData) {
  var sp = saveData.spelunkData || [];
  var galleryLv = Number((sp[13] && sp[13][4]) || 0);
  var trophChip = 0;
  if (labData) {
    for (var ci = 0; ci < numCharacters; ci++) {
      var chipSlots = labData[1 + ci];
      if (!chipSlots) continue;
      for (var s = 0; s < 7; s++) {
        if (Number(chipSlots[s]) === 16) { trophChip = 1; break; }
      }
      if (trophChip) break;
    }
  }
  // AlchBubbles.Y13: Kazam cauldron bubble 13, gallery bonus.
  // TalentCalc(-2) computes AlchBubbles at login, before gallery bonuses run.
  var y13capped = Math.min(20, bubbleBonusY13(saveData));
  var cardLv = Math.min(computeCardLv('w7a11', saveData), 10);
  var comp49 = saveData.companionIds && saveData.companionIds.has(49) ? companionBonus(49) : 0;
  var clamWork7 = (Number(optionsListData[464]) || 0) > 7 ? 1 : 0;
  var ola467 = Number(optionsListData[467]) || 0;
  var killroy3 = ola467 / (200 + ola467) * 10;
  var sum = 3 * galleryLv + GALLERY_TROPH_CHIP_MULTI * trophChip + 3 * clamWork7 + killroy3 + y13capped + cardLv + comp49;
  var val = 1 + sum / 100;
  var ch = [];
  if (galleryLv > 0) ch.push(node('Gallery Level', 3 * galleryLv, [node('Level', galleryLv, null, { fmt: 'raw' })], { fmt: 'raw', note: '3 per level' }));
  if (trophChip) ch.push(node(label('Chip', 16), GALLERY_TROPH_CHIP_MULTI, null, { fmt: 'raw', note: 'chip 16' }));
  if (clamWork7) ch.push(node(label('ClamWork', 7), 3, null, { fmt: 'raw' }));
  if (killroy3 > 0) ch.push(node(label('Killroy', 3), killroy3, null, { fmt: 'raw' }));
  if (y13capped > 0) ch.push(node('Bubble Y13 (capped 20)', y13capped, null, { fmt: 'raw', note: 'kazam bubble 13' }));
  if (cardLv > 0) ch.push(node('Card w7a11 (capped 10)', cardLv, null, { fmt: 'raw' }));
  if (comp49 > 0) ch.push(node(label('Companion', 49), comp49, null, { fmt: 'raw', note: 'companion 49' }));
  return { val: val, children: ch };
}

// HatrackBonusMulti: 1 + (Spelunk[46].length + 10*EventShopOwned(30) + MineheadBonusQTY(21) + RoG_BonusQTY(36)) / 100
export function hatrackBonusMulti(saveData) {
  var sp = saveData.spelunkData || [];
  var hatCount = (sp[46] && sp[46].length) || 0;
  var mineFloor = (saveData.stateR7 && saveData.stateR7[4]) || 0;
  var mhq21 = mineheadBonusQTY(21, mineFloor);
  var evStr = saveData.cachedEventShopStr || '';
  var evShop30 = eventShopOwned(30, evStr);
  var sushiRoG36 = rogBonusQTY(36, saveData.cachedUniqueSushi || 0);
  var sum = hatCount + 10 * evShop30 + mhq21 + sushiRoG36;
  var val = 1 + sum / 100;
  var ch = [];
  if (hatCount > 0) ch.push(node('Hats Owned', hatCount, null, { fmt: 'raw' }));
  if (evShop30 > 0) ch.push(node(label('Event', 30), 10 * evShop30, null, { fmt: 'raw' }));
  if (mhq21 > 0) ch.push(node(label('Minehead Floor', 21), mhq21, null, { fmt: 'raw', note: 'minehead 21' }));
  if (sushiRoG36 > 0) ch.push(node(label('Sushi', 36), sushiRoG36, null, { fmt: 'raw', note: 'RoG_BonusQTY(36)' }));
  return { val: val, children: ch };
}

// Podium tier computation for trophy slots 48+.
// Game: PodiumsOwned_Lv4/Lv3/Lv2 from _customBlock_Gallery.
function podiumsOwnedLv4(saveData) {
  var sail33 = Number((saveData.sailingData && saveData.sailingData[3] && saveData.sailingData[3][33]) || 0);
  var comp28 = saveData.companionIds && saveData.companionIds.has(28) ? 1 : 0;
  var evStr = saveData.cachedEventShopStr || '';
  var evShop29 = eventShopOwned(29, evStr);
  return Math.round(Math.min(1, comp28) + evShop29 + Math.min(1, Math.floor(sail33 / 6)));
}

function podiumsOwnedLv3(saveData) {
  var gem40 = Number((saveData.gemItemsData && saveData.gemItemsData[40]) || 0);
  var sail33 = Number((saveData.sailingData && saveData.sailingData[3] && saveData.sailingData[3][33]) || 0);
  return Math.round(Math.floor(gem40 / 3) + Math.min(1, Math.floor(sail33 / 5)) + podiumsOwnedLv4(saveData));
}

function podiumsOwnedLv2(saveData) {
  var gem40 = Number((saveData.gemItemsData && saveData.gemItemsData[40]) || 0);
  var sail33 = Number((saveData.sailingData && saveData.sailingData[3] && saveData.sailingData[3][33]) || 0);
  var comp42 = saveData.companionIds && saveData.companionIds.has(42) ? 1 : 0;
  // ClamWorkBonus(0): OLA[464] > 0 ? 1 : 0
  var clamWork0 = (Number(optionsListData[464]) || 0) > 0 ? 1 : 0;
  // KillroyBonuses(3): OLA[467] / (200 + OLA[467]) * 10
  var ola467 = Number(optionsListData[467]) || 0;
  var killroy3 = ola467 / (200 + ola467) * 10;
  // LegendPTS_bonus(9)
  var legendPts9 = legendPTSbonus(9, saveData);
  var sailPart = Math.max(0, Math.min(2, Math.round(sail33) - 2) - Math.min(1, Math.floor(sail33 / 5)));
  return Math.round(2 * clamWork0 + Math.min(2, killroy3) + comp42 + Math.floor(gem40 / 2) + podiumsOwnedLv3(saveData) + legendPts9 + sailPart);
}

function podiumsOwned(saveData) {
  var sp = saveData.spelunkData || [];
  var galleryLv = Number((sp[13] && sp[13][4]) || 0);
  var gem40 = Number((saveData.gemItemsData && saveData.gemItemsData[40]) || 0);
  var sail33 = Number((saveData.sailingData && saveData.sailingData[3] && saveData.sailingData[3][33]) || 0);
  var ninjaStr = String((saveData.ninjaData && saveData.ninjaData[102] && saveData.ninjaData[102][9]) || '');
  var emp42 = emporiumBonus(42, ninjaStr);
  var loreFlag5 = (Number((sp[0] && sp[0][5]) || 0) >= 1) ? 1 : 0;
  var evStr = saveData.cachedEventShopStr || '';
  var evShop26 = eventShopOwned(26, evStr);
  return Math.min(19, 1 + Math.ceil(galleryLv / 4) + Math.min(1, emp42)
    + Math.floor(gem40 / 1) + 2 * loreFlag5
    + Math.min(2, Math.round(sail33)) + evShop26);
}

export function trophyTier(slotIndex, saveData) {
  if (slotIndex < 48) return 0.3;
  var offset = slotIndex - 48;
  if (podiumsOwnedLv4(saveData) > offset) return 2.5;
  if (podiumsOwnedLv3(saveData) > offset) return 2.0;
  if (podiumsOwnedLv2(saveData) > offset) return 1.5;
  return 1.0;
}

// Gallery Nametag system: sums nametag UQ stat bonuses for a given EtcBonuses ID.
// Game: GalleryNametagBonTOT[statName] += tier Ã— GalleryBonusMulti Ã— UQ_val
export var nametag = {
  resolve: function(id, ctx) {
    var ids = Array.isArray(id) ? id : [id];
    var statNameMap = {};
    for (var si = 0; si < ids.length; si++) { var s = GALLERY_STAT_FOR_ID[ids[si]]; if (s) statNameMap[s] = true; }
    if (!Object.keys(statNameMap).length) return node('Nametag ' + id, 0, null, { note: 'nametag ' + id });
    var saveData = ctx.saveData;
    var sp = saveData.spelunkData || [];
    var levels = sp[17] || [];
    var gbmObj = galleryBonusMulti(saveData);
    var gbm = gbmObj.val;
    var total = 0;
    var children = [];
    for (var i = 0; i < levels.length; i++) {
      var lv = Number(levels[i]) || 0;
      if (lv < 1) continue;
      var drEntries = NAMETAG_DR[i];
      if (!drEntries) continue;
      var tier = NAMETAG_TIER_SCALE[Math.min(4, lv - 1)];
      for (var j = 0; j < drEntries.length; j++) {
        if (!statNameMap[drEntries[j].stat]) continue;
        var val = tier * gbm * drEntries[j].val;
        total += val;
        var tagName = NAMETAG_NAMES[i] || ('Tag #' + i);
        children.push(node(tagName + ' Level ' + lv, val, [
          node('Tier', tier, null, { fmt: 'x' }),
          node('Gallery Bonus Multi', gbm, gbmObj.children, { fmt: 'x' }),
          node('Base', drEntries[j].val, null, { fmt: 'raw' }),
        ], { fmt: '+' }));
      }
    }
    return node('Nametag Bonuses', total, children, { fmt: '+', note: 'nametag ' + id });
  },
};

// Gallery Trophy system: sums trophy UQ stat bonuses for a given EtcBonuses ID.
// Game: GalleryTrophyBonTOT[statName] += tier Ã— GalleryBonusMulti Ã— UQ_val
// Trophy tier: slots 0-47 = 0.3, slots 48+ = podium-dependent (1/1.5/2/2.5)
// The trophy item looked up is Trophy{Spelunk[16][slot]}.
export var trophy = {
  resolve: function(id, ctx) {
    var ids = Array.isArray(id) ? id : [id];
    var statNameMap = {};
    for (var si = 0; si < ids.length; si++) { var s = GALLERY_STAT_FOR_ID[ids[si]]; if (s) statNameMap[s] = true; }
    if (!Object.keys(statNameMap).length) return node('Trophy ' + id, 0, null, { note: 'trophy ' + id });
    var saveData = ctx.saveData;
    var sp = saveData.spelunkData || [];
    var trophySlots = sp[16] || [];
    var gbmObj = galleryBonusMulti(saveData);
    var gbm = gbmObj.val;
    var total = 0;
    var children = [];
    for (var i = 0; i < trophySlots.length; i++) {
      var trophyId = Number(trophySlots[i]) || 0;
      if (trophyId < 1) continue;
      var drEntries = TROPHY_DR[trophyId];
      if (!drEntries) continue;
      var tier = trophyTier(i, saveData);
      for (var j = 0; j < drEntries.length; j++) {
        if (!statNameMap[drEntries[j].stat]) continue;
        var val = tier * gbm * drEntries[j].val;
        total += val;
        var tName = TROPHY_NAMES[trophyId] || ('Trophy' + trophyId);
        children.push(node(tName + ' slot ' + i, val, [
          node('Tier', tier, null, { fmt: 'x' }),
          node('Gallery Bonus Multi', gbm, gbmObj.children, { fmt: 'x' }),
          node('Base', drEntries[j].val, null, { fmt: 'raw' }),
        ], { fmt: '+' }));
      }
    }
    return node('Trophy Bonuses', total, children, { fmt: '+', note: 'trophy ' + id });
  },
};

// PremHat (Hatrack) system: sums hat UQ stat bonuses for a given EtcBonuses ID.
// Game: PremHatBonTOT[statName] += HatrackBonusMulti Ã— UQ_val
export var premhat = {
  resolve: function(id, ctx) {
    var ids = Array.isArray(id) ? id : [id];
    var statNameMap = {};
    for (var si = 0; si < ids.length; si++) { var s = GALLERY_STAT_FOR_ID[ids[si]]; if (s) statNameMap[s] = true; }
    if (!Object.keys(statNameMap).length) return node('Hatrack ' + id, 0, null, { note: 'premhat ' + id });
    var saveData = ctx.saveData;
    var sp = saveData.spelunkData || [];
    var hats = sp[46] || [];
    var hbmObj = hatrackBonusMulti(saveData);
    var hbm = hbmObj.val;
    var total = 0;
    var children = [];
    for (var i = 0; i < hats.length; i++) {
      var hatName = hats[i];
      if (!hatName || typeof hatName !== 'string') continue;
      var drEntries = PREMHAT_DR[hatName];
      if (!drEntries) continue;
      for (var j = 0; j < drEntries.length; j++) {
        if (!statNameMap[drEntries[j].stat]) continue;
        var val = hbm * drEntries[j].val;
        total += val;
        children.push(node(PREMHAT_NAMES[hatName] || hatName, val, [
          node('Hatrack Bonus Multi', hbm, hbmObj.children, { fmt: 'x' }),
          node('Base', drEntries[j].val, null, { fmt: 'raw' }),
        ], { fmt: '+' }));
      }
    }
    return node('Hatrack Bonuses', total, children, { fmt: '+', note: 'premhat ' + id });
  },
};
