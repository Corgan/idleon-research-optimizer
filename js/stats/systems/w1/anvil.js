// ===== ANVIL PRODUCTION (W1) =====

import { createStatContext } from '../../stat-context.js';
import { anvilProducts } from '../../data/w1/anvil.js';
import { finalBubbleValByKey } from '../w2/alchemy.js';
import { computeStampBonusOfTypeX } from './stamp.js';
import { computeBoxReward, computeStatueBonusGiven } from '../common/stats.js';
import { computeStarSignBonus } from '../common/starSign.js';
import { talent } from '../common/talent.js';
import { vaultUpgBonus } from '../common/vault.js';
import { eventShopOwned } from '../../../game-helpers.js';

function _expPoints(S, charIdx) {
  const value = S.anvilPAStatsData?.[charIdx]?.[3];
  if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0)
    throw new Error('Saved Anvil EXP point allocation is missing or invalid.');
  return Number(value);
}

export function anvilProductionExpMultiplier(S, charIdx = 0, ctx) {
  const points = _expPoints(S, charIdx);
  ctx ||= createStatContext({ saveData: S, charIdx, layer1: { skillType: 'Smithing', isActive: true } });
  const exp = ctx.resolve('skill-exp');
  if (exp.unavailable || !Number.isFinite(exp.val) || exp.val < 0)
    throw new Error(exp.reason || 'Smithing EXP multiplier is unavailable.');
  const raw = (1 + 3 * points / 100) * exp.val;
  if (!Number.isFinite(raw)) throw new Error('Anvil EXP multiplier is nonfinite.');
  return raw < 20 ? raw : Math.min(20 + (raw - 20) / (raw - 20 + 70) * 50, 75);
}

export function anvilStorageSlots(S, used) {
  function number(value, name) {
    if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0)
      throw new Error(name + ' is missing or invalid.');
    return Number(value);
  }
  if (!used || typeof used !== 'object') throw new Error('Storage expansion data is missing.');
  let slots = 54;
  for (const [key, value] of Object.entries(used)) {
    if (key !== 'length') slots += number(value, 'Storage expansion');
  }
  slots = Math.round(slots + 2 * number(S.towerData?.[4], 'Storage building level'));
  for (const [key, count] of [['bun_i', 8], ['bun_c', 16], ['bon_a', 20]]) {
    if (Number(S.bundlesData?.[key]) === 1) slots = Math.round(slots + count);
  }
  slots = Math.round(slots + 9 * number(S.gemItemsData?.[109], 'Storage Gem Shop level'));
  const extra = Math.round(12 * eventShopOwned(10, S.eventShopStr) + 16 * eventShopOwned(11, S.eventShopStr)
    + (vaultUpgBonus(33, S) + (22 * (Number(S.bundlesData?.bon_x) === 1 ? 1 : 0)
      + 27 * (Number(S.bundlesData?.bon_y) === 1 ? 1 : 0))));
  return Math.round(slots + extra);
}

export function anvilQuickDeposit(S, charIdx = 0, { storageSlots, expMulti } = {}) {
  const chest = S.itemQuantityData?.chest, rows = S.anvilPAData?.[charIdx];
  if (!chest?.available || !Array.isArray(rows)) throw new Error('Saved storage or Anvil products are unavailable.');
  if (!Number.isSafeInteger(storageSlots) || storageSlots < 0 || storageSlots > chest.order.length)
    throw new Error('Unlocked storage range is missing or invalid.');
  const multiplier = expMulti ?? anvilProductionExpMultiplier(S, charIdx);
  if (!Number.isFinite(multiplier) || multiplier < 0) throw new Error('Anvil EXP multiplier is unavailable.');
  const order = chest.order.slice(), quantity = chest.quantity.slice();
  const state = rows.map(row => Array.isArray(row) ? row.slice() : row);
  let exp = 0;
  const products = anvilProducts().map(product => {
    const row = state[product.index], amount = row?.[0];
    if (amount == null || amount === '' || !Number.isFinite(Number(amount)) || Number(amount) < 0)
      throw new Error('Saved Anvil product quantity is missing or invalid.');
    let slot = -1;
    if (Number(amount) > 0) {
      slot = order.findIndex((key, index) => index < storageSlots && key === product.key);
      if (slot < 0) slot = order.findIndex((key, index) => index < storageSlots && key === 'Blank');
    }
    if (slot < 0) return { ...product, deposited: 0, retained: 0, discarded: 0, exp: 0, remaining: Number(amount) };
    const old = quantity[slot];
    if (old == null || old === '' || !Number.isFinite(Number(old)) || Number(old) < 0)
      throw new Error('Saved storage quantity is missing or invalid.');
    order[slot] = product.key;
    quantity[slot] = Math.min(2e9, Number(old) + Number(amount));
    const awarded = Number(amount) * multiplier * product.exp;
    if (!Number.isFinite(awarded)) throw new Error('Anvil deposit EXP is nonfinite.');
    exp += awarded;
    row[0] = 0; row[1] = 0;
    return { ...product, deposited: Number(amount), retained: quantity[slot] - Number(old),
      discarded: Number(old) + Number(amount) - quantity[slot], exp: awarded, remaining: 0 };
  });
  return { products, exp, state, chest: { order, quantity } };
}

export function anvilQuickDepositAll(S, activeCharIdx = 0, { storageSlots, characterOrder, expMulti } = {}) {
  const rows = S.anvilPAData;
  if (!Array.isArray(rows) || !rows.length) throw new Error('Saved Anvil products are unavailable.');
  // Loader arrays include padding beyond the saved characters.
  let count = S.charNames?.length || 0;
  for (const values of [S.lv0AllData, S.exp0AllData, rows])
    values?.forEach((row, ci) => { if (Array.isArray(row) && row.length) count = Math.max(count, ci + 1); });
  count ||= rows.length;
  const order = characterOrder ?? Array.from({ length: count }, (_, ci) => ci);
  if (!Array.isArray(order) || order.length !== count || new Set(order).size !== count
    || !order.every(ci => Number.isSafeInteger(ci) && ci >= 0 && ci < count)
    || !order.includes(activeCharIdx))
    throw new Error('Anvil deposit order must include every saved character exactly once.');
  const state = rows.map(products => Array.isArray(products)
    ? products.map(row => Array.isArray(row) ? row.slice() : row) : products);
  let chest = S.itemQuantityData?.chest;
  const characters = [];
  const totals = anvilProducts().map(product => ({ ...product, deposited: 0, retained: 0, discarded: 0, exp: 0 }));
  let exp = 0;
  for (const ci of order) {
    const multiplier = ci === activeCharIdx ? expMulti ?? anvilProductionExpMultiplier(S, ci)
      : Math.min(25, 1 + 3 * _expPoints(S, ci) / 100);
    const result = anvilQuickDeposit({ ...S, anvilPAData: state,
      itemQuantityData: { ...S.itemQuantityData, chest } }, ci, { storageSlots, expMulti: multiplier });
    state[ci] = result.state;
    chest = { ...result.chest, available: true };
    characters.push({ charIdx: ci, exp: result.exp, products: result.products });
    exp += result.exp;
    if (!Number.isFinite(exp)) throw new Error('All-character Anvil EXP is nonfinite.');
    for (const product of result.products) {
      for (const field of ['deposited', 'retained', 'discarded', 'exp']) totals[product.index][field] += product[field];
    }
  }
  return { characters, products: totals, exp, state, chest: { order: chest.order, quantity: chest.quantity } };
}

export function anvilProductionBatch(S, charIdx = 0, seconds = 0, { stats } = {}) {
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new Error('Anvil credited seconds must be finite and nonnegative.');
  const rows = S.anvilPAData?.[charIdx], selected = S.anvilPASelectData?.[charIdx];
  const products = anvilProducts();
  if (!Array.isArray(rows) || !Array.isArray(selected))
    throw new Error('Saved Anvil products or hammer assignments are missing.');
  const state = products.map(product => {
    const row = rows[product.index];
    if (!Array.isArray(row) || row.length < 4 || Array.from(row.slice(0, 4)).some(value =>
      value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0))
      throw new Error('Saved Anvil product progress is missing or invalid.');
    return row.map(Number);
  });
  const assignments = Array.from(selected, value => {
    if (value == null || value === '' || !Number.isInteger(Number(value))
        || Number(value) < -1 || Number(value) >= products.length)
      throw new Error('Saved Anvil hammer assignment is invalid.');
    return Number(value);
  });
  const inputs = stats || anvilProductionStats(S, charIdx);
  if (!Number.isFinite(inputs.capacity) || inputs.capacity < 0)
    throw new Error(inputs.capacityReason || 'Anvil product capacity is unavailable.');
  if (!Number.isFinite(inputs.speed) || inputs.speed < 0
      || !Number.isFinite(inputs.expMulti) || inputs.expMulti < 0)
    throw new Error('Anvil production factors are invalid.');
  const gains = products.map(() => ({ items: 0, exp: 0 }));
  for (const index of assignments) {
    if (index === -1) continue;
    const row = state[index], product = products[index];
    if (row[0] >= inputs.capacity) continue;
    row[2] += inputs.speed * seconds;
    if (!Number.isFinite(row[2])) throw new Error('Anvil accumulated progress is nonfinite.');
    if (row[2] < product.seconds) continue;
    const quantity = Math.min(inputs.capacity - row[0], Math.floor(row[2] / product.seconds));
    row[2] = Math.min(row[2] - product.seconds * quantity, product.seconds);
    const exp = quantity * inputs.expMulti * product.exp;
    if (!Number.isFinite(exp)) throw new Error('Anvil stored EXP is nonfinite.');
    row[0] += quantity;
    row[1] += exp;
    row[3] += quantity;
    gains[index].items += quantity;
    gains[index].exp += exp;
  }
  return { products: products.map(product => ({ ...product, ...gains[product.index],
    stored: state[product.index][0], storedExp: state[product.index][1],
    progress: state[product.index][2], full: state[product.index][0] >= inputs.capacity })), state };
}

export function anvilProductionStats(S, charIdx = 0) {
  const points = S.anvilPAStatsData?.[charIdx];
  for (const index of [1, 2, 3, 4, 5]) {
    if (points?.[index] == null || points[index] === '' || !Number.isFinite(Number(points[index]))
        || Number(points[index]) < 0)
      throw new Error('Saved Anvil point allocation is missing or invalid.');
  }
  const ctx = createStatContext({ saveData: S, charIdx, layer1: { skillType: 'Smithing', isActive: true } });
  const agi = ctx.resolve('total-agi');
  if (agi.unavailable) throw new Error(agi.reason || 'Character Agility is unavailable.');
  const stat = agi.val < 1000 ? (Math.pow(agi.val + 1, .37) - 1) / 40
    : (agi.val - 1000) / (agi.val + 2500) * .5 + .297;
  const town = talent.resolve(269, ctx).val + computeStarSignBonus('TownSkillSpd', charIdx, S);
  const speed = (1 + (computeStampBonusOfTypeX('AnvilPAspd', S) + 2 * Number(points[4])) / 100)
    * (1 + (computeBoxReward(charIdx, 'ProdSpd').val
      + (computeStatueBonusGiven(11, charIdx, S) + vaultUpgBonus(24, S))) / 100)
    * (1 + Number(finalBubbleValByKey('AnvilACTIVE', charIdx, S)) / 100)
    * (1 + 2 * stat) * (1 + town / 100);
  const expMulti = anvilProductionExpMultiplier(S, charIdx, ctx);
  const carry = ctx.resolve('carry-capacity-materials');
  const reduction = Math.max(.1, 1 - Number(finalBubbleValByKey('AnvilProdCost', charIdx, S)) / 100);
  const coins = Number(points[1]), materials = Number(points[2]);
  return {
    speed, expMulti,
    capacity: carry.unavailable ? null : Math.round(Math.min(2e9, carry.val * (2 + .1 * Number(points[5])))),
    capacityReason: carry.unavailable ? carry.reason : '',
    coinCost: Math.round((Math.pow(coins, 3) + 50) * (1 + coins / 100) * reduction),
    materialCost: Math.round((Math.pow(materials + 1, 1.5) + materials) * reduction),
    products: anvilProducts().filter(product => Number(S.lv0AllData?.[charIdx]?.[4]) >= product.level)
      .map(product => ({ ...product, perHour: speed * 3600 / product.seconds,
        expPerHour: speed * 3600 / product.seconds * expMulti * product.exp })),
  };
}
