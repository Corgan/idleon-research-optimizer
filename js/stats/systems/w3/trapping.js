// ===== TRAPPING SYSTEM (W3) =====
// New placement snapshots and distinct local/remote collection rewards.

import { optionsListData, charClassData, equipOrderData, equipQtyData, foodSlotsOwnedData } from '../../../save/data.js';
import { RANDOlist } from '../../data/game/customlists.js';
import { trappingCritters, trappingCompounderPerLevel } from '../../data/w3/trapping.js';
import { finalBubbleValByKey, computeVialByKey } from '../w2/alchemy.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { talent, maxTalentBonusDetail } from '../common/talent.js';
import { createStatContext } from '../../stat-context.js';
import { computeStarSignBonus } from '../common/starSign.js';
import { computeMealBonus, computeBoxReward, computeCardBonusByType } from '../common/stats.js';
import { computeShinyBonusS } from '../w4/breeding.js';
import { computeCropSC } from '../w6/farming.js';
import { bubbaRoGBonuses } from '../w7/bubba.js';
import { computeCompassBonus } from '../w7/compass.js';
import { computePaletteBonus } from '../w7/spelunking.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { menagerieBoostQTY } from '../w7/menagerie.js';
import { arcadeBonus } from '../w2/arcade.js';
import { votingBonusz } from '../w2/voting.js';
import { vaultUpgBonus } from '../common/vault.js';
import { computePrayerReal } from './prayer.js';
import { getSetBonus } from './setBonus.js';
import { itemDef } from '../common/combat-sim-inputs.js';

const _num = value => Number(value?.val ?? value) || 0;

export function trappingPlacement(S, ci, critterIndex, box) {
  if (!Number.isInteger(ci) || ci < 0 || !S.lv0AllData?.[ci]?.length)
    throw new Error('Choose a saved character for Trapping placement.');
  const critter = trappingCritters().find(row => row.index === critterIndex);
  if (!critter || !box || [box.seconds, box.quantity, box.exp, box.rarity]
    .some(value => !Number.isFinite(value) || value < 0)) throw new Error('Valid critter and trap box are required.');
  const ctx = createStatContext({ saveData: S, charIdx: ci, mapIdx: critter.map, layer1: { skillType: 'Trapping' } });
  let hunt = 0;
  for (let i = 0; i < 10; i++) hunt += Math.max(0, _num(S.questCompleteData?.[ci]?.['Lord_of_the_Hunt' + (i + 2)]));
  const base = Math.floor(10 + (_num(S.towerData?.[6]) + hunt)
    + (_num(computeVialByKey('CritterBASED', S, ci))
      + (computeStarSignBonus('pctCritter', ci, S) + (computeTrapMGBonus(4, S) + computeTrapMGBonus(7, S))
        + ((_num(computeBoxReward(ci, '16c')) + bubbaRoGBonuses(2, S)) / 10
          + (computeShinyBonusS(23, S) + (Math.min(20, computeCropSC(6, S)) + computeCompassBonus(42, S)))))));
  let talentLevels = 0;
  for (let character = 0; character < charClassData.length; character++) {
    if (_num(charClassData[character]) < 6) talentLevels = Math.max(talentLevels,
      _num(S.lv0AllData?.[character]?.[7]) + _num(S.lv0AllData?.[character]?.[9]));
  }
  const talent57 = maxTalentBonusDetail(57, ci, S).value * Math.max(0, talentLevels - 100);
  const efficiency = ctx.resolve('skill-efficiency');
  const experience = ctx.resolve('skill-exp');
  if (efficiency.unavailable || experience.unavailable || !Number.isFinite(efficiency.val)
    || !Number.isFinite(experience.val)) throw new Error('Trapping efficiency or EXP multiplier is unavailable.');
  const efficiencyBonus = efficiency.val >= critter.efficiencyReq
    ? Math.floor(100 * Math.pow(efficiency.val / (10 * critter.efficiencyReq), .25)) : 0;
  const quantity = (1 + computeMealBonus('Critter', S, ci) / 100) * (1 + talent57 / 100)
    * (1 + _num(arcadeBonus(23, S)) / 100) * (1 + vaultUpgBonus(50, S) / 100)
    * base * (1 + efficiencyBonus / 100) * box.quantity;
  return { key: critter.key, quantity: quantity > 1e6 ? quantity : Math.floor(quantity),
    exp: (base + .01) * (box.exp + .01) * critter.exp * experience.val,
    rarePct: trappingPlacementRarePct(S, ci, critterIndex, box.rarity), seconds: box.seconds };
}

export function trappingCollectionInputs(S, ci, boostFoodEffect, { compounderDays = _num(optionsListData[363]) } = {}) {
  if (!Number.isFinite(boostFoodEffect) || boostFoodEffect < 0) throw new Error('Trapping boost-food multiplier is unavailable.');
  if (!Number.isInteger(ci) || ci < 0 || !S.lv0AllData?.[ci]?.length
    || !Number.isFinite(compounderDays) || compounderDays < 0)
    throw new Error('Saved collector or Compounder days are invalid.');
  let food = 0;
  for (let slot = 0; slot < _num(foodSlotsOwnedData[ci]); slot++) {
    if (!(_num(equipQtyData[ci]?.[2]?.[slot]) > 0)) continue;
    const item = itemDef(equipOrderData[ci]?.[2]?.[slot]);
    if (item?.Effect === 'TrappingSpeedBoosts') food += _num(item.Amount) * boostFoodEffect;
  }
  const ctx = createStatContext({ saveData: S, charIdx: ci });
  const current = (tab) => talent.resolve(310, ctx, { tab }).val;
  const best = (tab) => maxTalentBonusDetail(310, ci, S, { mode: tab }).value;
  const other = _num(computeVialByKey('TrapOvision', S, ci))
    + (computeCompassBonus(42, S) + (_num(S.atomsData?.[11]) * trappingCompounderPerLevel() * compounderDays
      + (_num(getSetBonus('DEMENTIA_SET', ci)) + computePaletteBonus(12, S))));
  const card = ctx.resolve('card-drop-chance-multiplier');
  if (card.unavailable || !Number.isFinite(card.val)) throw new Error('Trapping card multiplier is unavailable.');
  return {
    quantityPct: Math.max(50, (current(1) > 0 ? current(1) : best(1)) + other),
    expPct: Math.max(40, current(2) > 0 ? Math.min(current(2), 99) : Math.min(best(2), 99)),
    votingExpPct: _num(votingBonusz(30, ctx.resolve('voting-multi').val, S)),
    rareOpenPct: food + (_num(computeCardBonusByType(53, ci, S))
      + (computeTrapMGBonus(2, S) + computeTrapMGBonus(5, S) + _num(arcadeBonus(13, S)))),
    rareOpenMulti: (1 + _num(computeMeritocBonusz(4, S, ci)) / 100) * (1 + menagerieBoostQTY(S, 13) / 100),
    prayerBonus: _num(computePrayerReal(3, 0, ci, S)),
    prayerCurse: _num(computePrayerReal(3, 1, ci, S)), cardMulti: card.val,
  };
}

export function trappingCollection(trap, inputs, { mode = 'local', currentOwner = true, ready = true } = {}) {
  if (!['local', 'remote', 'all'].includes(mode)) throw new Error('Choose local, remote or all Trapping collection.');
  if (!trap || !trappingCritters().some(row => row.key === trap.key) || [trap.quantity, trap.exp, trap.rarePct, trap.seconds]
    .some(value => !Number.isFinite(value) || value < 0)
    || ['quantityPct', 'expPct', 'votingExpPct', 'rareOpenPct', 'rareOpenMulti', 'prayerBonus', 'prayerCurse', 'cardMulti']
      .some(key => !Number.isFinite(inputs?.[key])))
    throw new Error('Trapping snapshot or collection inputs are invalid.');
  const number = Number(trap.key.slice(7));
  const card = number < 4 ? 'CardsD' + (18 + number) : number < 8 ? 'CardsF' + number
    : number < 11 ? 'CardsF' + (9 + number) : number === 11 ? 'CardsF47' : null;
  const amount = trap.quantity * (inputs.quantityPct / 100);
  const quantity = mode === 'local' ? 3 * Math.floor(trap.quantity / 4) + Math.floor(trap.quantity % 4 + trap.quantity / 4)
    : mode === 'all' ? Math.floor(Math.min(2e9, amount)) : Math.max(0, Math.ceil(amount));
  const chance = trap.rarePct * (1 + inputs.rareOpenPct / 100) / Math.round(1 + inputs.prayerCurse) / 100;
  const rareChance = chance > 0 ? Math.min(1, chance) : 0;
  const rareQuantity = Math.round((1 + inputs.prayerBonus) * inputs.rareOpenMulti);
  const exp = mode === 'local' ? trap.exp : trap.exp * ((inputs.expPct
    + (mode === 'remote' && currentOwner ? inputs.votingExpPct : 0)) / 100);
  return { quantity: ready ? quantity : 0, exp: ready ? exp : 0,
    rareChance: ready ? rareChance : 0, rareQuantity,
    rareExpected: ready ? rareChance * rareQuantity : 0, card,
    cardChance: ready && card ? Math.max(0, Math.min(1, Math.pow(trap.seconds / 3600 * 4, .62) * inputs.cardMulti / 100)) : 0 };
}

export function trappingPlacementRarePct(S, charIdx, critterIndex, rareBonus = 1) {
  const critter = trappingCritters().find(row => row.index === critterIndex);
  if (!critter) throw new Error('Choose a valid Trapping critter.');
  const level = S.lv0AllData?.[charIdx]?.[7], task = S.tasksGlobalData?.[1]?.[2]?.[5];
  if ([level, task, rareBonus].some(value =>
    value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0))
    throw new Error('Trapping level, task or trap rarity bonus is missing or invalid.');
  const ctx = createStatContext({ saveData: S, charIdx, mapIdx: critter.map, layer1: { skillType: 'Trapping' } });
  return Math.max(.001, critter.rarePct * Math.max(Number(rareBonus), 1)
    * (1 + (computeStampBonusOfTypeX('ShinyChance', S) + 2 * Number(task)) / 100)
    * Math.max(Number(finalBubbleValByKey('CritShiny', charIdx, S)), 1)
    * (1 + (Number(computeVialByKey('Shiny1', S, charIdx))
      + Number(computeVialByKey('Shiny2', S, charIdx))) / 100)
    * Math.pow(Math.max(1, talent.resolve(313, ctx).val), 1 + Math.floor(Number(level) / 10)));
}

// ==================== TRAP MG BONUS ====================

export function computeTrapMGBonus(idx, saveData) {
  var highScore = Number(optionsListData[99]) || 0;
  if (highScore < 25 * (idx + 1)) return 0;
  return Number(RANDOlist[59] && RANDOlist[59][idx]) || 0;
}
