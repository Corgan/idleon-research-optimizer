// ===== PRAYER SYSTEM (W3) =====
// Prayer bonuses for equipped prayers.

import { node, treeResult } from '../../node.js';
import { label } from '../../entity-names.js';
import { prayersPerCharData } from '../../../save/data.js';
import { prayerBaseBonus } from '../../data/w3/prayer.js';
import { superBitType } from '../../../game-helpers.js';
import { formulaInput as input, formulaConstant as constant, formulaOperation as op } from '../../formula-tree.js';

var PRAYER_DATA = {
  7: { baseBonus: prayerBaseBonus(7) },
};

function _prayerDetail(result, prayerIdx, costIdx, ci, saveData) {
  const level = input('Prayer Level', result.prayerLv, 'PrayOwned[' + prayerIdx + ']');
  const equipped = {
    ...input('Equipped prayers', (prayersPerCharData[ci] || []).join(', '), 'Prayers_' + ci),
    nonNumeric: true,
  };
  if (result.prayerLv <= 0 || (!result.isEquipped && result.passivePct <= 0)) return {
    name: label('Prayer', prayerIdx), val: 0, kind: 'formula', formulaTerm: true,
    formula: result.prayerLv <= 0 ? 'Prayer level <= 0: return 0' : 'Neither equipped nor passive: return 0',
    children: [level, equipped],
  };
  const scale = op('Level scaling', 'max', constant(1), op('Level scaling', 'add', constant(1),
    op('Additional level scaling', 'divide', op('Levels after first', 'subtract', level, constant(1)), constant(10))));
  const base = input('Base Bonus', result.base, 'PrayerInfo[' + prayerIdx + '][' + (costIdx === 1 ? 4 : 3) + ']');
  let amount = op('Prayer amount', 'multiply', base, scale);
  if (!result.isEquipped) {
    const bits = result.superBits.map((val, i) => ({
      name: label('Super Bit', [9, 39, 53][i]), val, kind: 'formula', formulaTerm: true,
      formula: 'Saved Super Bit unlock owned ? 1 : 0',
      children: [{ ...input('Saved Super Bit unlocks', saveData.gamingData?.[12], 'Gaming[12]'), nonNumeric: true }],
    }));
    const passive = op('No-Prayer Passive', 'multiply', constant(0.2),
      op('Unlocked passive bonuses', 'add', op('Unlocked passive bonuses', 'add', bits[0], bits[1]), bits[2]));
    amount = op('Passive prayer amount', 'multiply', op('Passive base', 'multiply', passive, base), scale);
  }
  return {
    ...op(label('Prayer', prayerIdx), 'round', amount), formulaTerm: true,
    note: result.isEquipped ? 'Equipped on this character.' : 'No prayers equipped; passive Super Bit conditions met.',
  };
}

function prayerValue(prayerIdx, costIdx, charIdx, saveData) {
  var prayerLv = Number(saveData.prayOwnedData && saveData.prayOwnedData[prayerIdx]) || 0;
  var base = prayerBaseBonus(prayerIdx, costIdx) || 0;
  var scale = Math.max(1, 1 + (prayerLv - 1) / 10);
  var equipped = prayersPerCharData[charIdx] || [];
  var isEquipped = equipped.some(function(value) { return Number(value) === prayerIdx; });
  var noPrayersEquipped = equipped.length > 0 && !equipped.some(function(value) { return Number(value) >= 0; });
  var gaming = saveData.gamingData && saveData.gamingData[12];
  var sb9 = superBitType(9, gaming);
  var sb39 = superBitType(39, gaming);
  var sb53 = superBitType(53, gaming);

  if (prayerLv <= 0) return { val: 0, prayerLv: prayerLv, base: base, scale: scale, isEquipped: false, passivePct: 0 };
  if (isEquipped) return { val: Math.round(base * scale), prayerLv: prayerLv, base: base, scale: scale, isEquipped: true, passivePct: 0 };

  var passiveEnabled = noPrayersEquipped && (sb9 === 1 || sb39 === 1);
  var passivePct = passiveEnabled && prayerIdx !== 5 && costIdx !== 1
    ? 0.2 * (sb9 + sb39 + sb53)
    : 0;
  return {
    val: passivePct > 0 ? Math.round(passivePct * base * scale) : 0,
    prayerLv: prayerLv,
    base: base,
    scale: scale,
    isEquipped: false,
    passivePct: passivePct,
    noPrayersEquipped: noPrayersEquipped,
    superBits: [sb9, sb39, sb53],
  };
}

export var prayer = {
  resolve: function(id, ctx) {
    var data = PRAYER_DATA[id];
    if (!data) return node(label('Prayer', id), 0);
    var name = label('Prayer', id);
    var result = prayerValue(id, 0, ctx.charIdx, ctx.saveData);
    if (ctx.formulaDetails) return _prayerDetail(result, id, 0, ctx.charIdx, ctx.saveData);
    var stateChildren = [
      node('Prayer Level', result.prayerLv, null, { fmt: 'raw' }),
      node('Base Bonus', data.baseBonus, null, { fmt: 'raw' }),
      node('Level Scaling', result.scale, null, { fmt: 'x' }),
    ];
    if (result.isEquipped) {
      stateChildren.push(node('Equipped', 1, null, { fmt: 'raw' }));
    } else if (result.passivePct > 0) {
      stateChildren.push(node('No-Prayer Passive Bonus', result.passivePct, [
        node(label('Super Bit', 9), result.superBits[0] ? 20 : 0, null, { fmt: '%' }),
        node(label('Super Bit', 39), result.superBits[1] ? 20 : 0, null, { fmt: '%' }),
        node(label('Super Bit', 53), result.superBits[2] ? 20 : 0, null, { fmt: '%' }),
      ], { fmt: 'x' }));
    } else {
      stateChildren.push(node('Not Active', 0, null, { fmt: 'raw', note: 'Not equipped and passive-prayer conditions are not met' }));
    }
    return node(name, result.val, stateChildren, { fmt: '+' });
  },
};

// ==================== PRAYER REAL (save-based aggregation) ====================

export function computePrayerReal(prayerIdx, costIdx, ci, saveData, options) {
  var result = prayerValue(prayerIdx, costIdx, ci, saveData);
  if (options?.formulaDetails) {
    const detail = _prayerDetail(result, prayerIdx, costIdx, ci, saveData);
    return Object.assign(treeResult(result.val, detail.children), detail);
  }
  return treeResult(result.val, [
    { name: 'Base Bonus', val: result.base, fmt: 'raw' },
    { name: 'Prayer Level', val: result.prayerLv, fmt: 'raw' },
    { name: 'Level Scaling', val: result.scale, fmt: 'x' },
    { name: result.isEquipped ? 'Equipped' : result.passivePct > 0 ? 'No-Prayer Passive' : 'Not Active', val: result.passivePct || 0, fmt: 'raw' },
  ]);
}
