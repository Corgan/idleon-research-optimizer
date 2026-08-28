// ===== CARRY CAPACITY =====

import { maxCarryCapData, maxCarryCapDataAvailable } from '../../../save/data.js';
import { guild } from './guild.js';
import { talent } from './talent.js';
import { companion } from './companions.js';
import { shrine } from '../w3/construction.js';
import { computePrayerReal } from '../w3/prayer.js';
import { getBribeBonus } from '../w3/bribe.js';
import { vaultUpgBonus } from './vault.js';
import { computeCarryStampBonus } from '../w1/stamp.js';
import { computeStarSignBonus } from './starSign.js';

var TYPE_CONFIG = {
  bOre: { field: 'Mining', stamp: 'MinCap' },
  bBar: { field: 'Mining', stamp: 'MinCap' },
  cOil: { field: 'Mining', stamp: 'MinCap' },
  bLog: { field: 'Chopping', stamp: 'ChopCap' },
  bLeaf: { field: 'Chopping', stamp: 'ChopCap' },
  dFish: { field: 'Fishing', stamp: 'FishCap' },
  dBugs: { field: 'Bugs', stamp: 'CatchCap' },
  cFood: { field: 'Foods' },
  dCritters: { field: 'Critters' },
  dSouls: { field: 'Souls' },
  bCraft: { field: 'bCraft', stamp: 'MatCap', material: true },
};

function _value(result) {
  if (result && typeof result === 'object' && result.val != null) return Number(result.val) || 0;
  return Number(result) || 0;
}

function _resolved(resolver, id, ctx, args) {
  try { return _value(resolver.resolve(id, ctx, args)); } catch(e) { return 0; }
}

export function capacityFromFactors(baseCapacity, factors) {
  factors = factors || {};
  var raw = Math.max(Number(baseCapacity) || 0, 0)
    * (1 + (Number(factors.categoryStampPct) || 0) / 100)
    * (1 + 25 * (Number(factors.gemPurchases) || 0) / 100)
    * (1 + (Number(factors.allCarryPct) || 0) / 100)
    * (1 + (Number(factors.materialTalentPct) || 0) / 100)
    * (Number(factors.commonMultiplier) || 0);
  return Math.floor(Math.min(2050000000, raw));
}

export function computeMaxCapacity(saveData, charIdx, itemType, ctx) {
  var type = String(itemType || '');
  if (type.charAt(0) === 'a') return { val: 1, fixed: true };
  if (type === 'dCurrency' || type === 'dQuest' || type === 'dExpOrb'
      || type === 'dStone' || type === 'dFishToolkit') return { val: 9999999, fixed: true };
  if (type === 'dStatueStone') return { val: 999999999, fixed: true };
  if (type === 'fillerz') {
    return { val: Number(maxCarryCapData[charIdx]?.fillerz) || 0, fixed: true };
  }
  var config = TYPE_CONFIG[type];
  if (!config) return { val: type.charAt(0) === 'd' ? 9999999 : 2, fixed: true };
  if (maxCarryCapDataAvailable[charIdx] === false) {
    return { val: 0, unavailable: true, reason: 'MaxCarryCap_' + charIdx + ' is missing from the imported save.' };
  }

  var baseCarry = Number(maxCarryCapData[charIdx]?.[config.field]) || 0;
  var vault11 = vaultUpgBonus(11, saveData);
  var bundles = saveData.bundlesData || {};
  var bundleBase = 1000 * ((Number(bundles.bon_w) || 0)
    + (Number(bundles.bon_x) || 0) + (Number(bundles.bon_y) || 0));
  var allCapBase = vault11 + bundleBase;
  var guild2 = _resolved(guild, 2, ctx);
  var talent634 = _resolved(talent, 634, ctx);
  var companion18 = _resolved(companion, 18, ctx);
  var shrine3 = _resolved(shrine, 3, ctx);
  var prayer4 = _value(computePrayerReal(4, 1, charIdx, saveData));
  var prayer12 = _value(computePrayerReal(12, 0, charIdx, saveData));
  var bribe23 = _value(getBribeBonus(23, saveData));
  var commonMultiplier = (1 + (guild2 + talent634) / 100)
    * (1 + companion18 / 100)
    * (1 + shrine3 / 100)
    * Math.max(1 - prayer4 / 100, 0.4)
    * (1 + (prayer12 + bribe23) / 100);
  var categoryStamp = config.stamp
    ? computeCarryStampBonus(config.stamp, saveData, charIdx) : { val: 0, children: null };
  var allCarryStamp = computeCarryStampBonus('AllCarryCap', saveData, charIdx);
  var carryStars = computeStarSignBonus('CarryCap', charIdx, saveData);
  var gemPurchases = Number(saveData.gemItemsData?.[58]) || 0;
  var materialTalent = config.material ? _resolved(talent, 78, ctx) : 0;
  var allCarryPct = _value(allCarryStamp) + _value(carryStars);
  var value = capacityFromFactors(allCapBase + baseCarry, {
    categoryStampPct: _value(categoryStamp),
    gemPurchases: gemPurchases,
    allCarryPct: allCarryPct,
    materialTalentPct: materialTalent,
    commonMultiplier: commonMultiplier,
  });
  return {
    val: value,
    type: type,
    field: config.field,
    savedBase: baseCarry,
    allCapBase: allCapBase,
    vault11: vault11,
    bundleBase: bundleBase,
    categoryStamp: categoryStamp,
    allCarryStamp: allCarryStamp,
    carryStars: carryStars,
    gemPurchases: gemPurchases,
    materialTalent: materialTalent,
    commonMultiplier: commonMultiplier,
    commonSources: {
      guild2: guild2,
      talent634: talent634,
      companion18: companion18,
      shrine3: shrine3,
      prayer4: prayer4,
      prayer12: prayer12,
      bribe23: bribe23,
    },
    partial: saveData.companionDataAvailable === false,
    reason: saveData.companionDataAvailable === false
      ? 'Partial total: the imported JSON does not include companion ownership metadata.'
      : '',
  };
}