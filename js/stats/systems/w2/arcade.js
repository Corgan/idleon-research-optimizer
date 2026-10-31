// ===== ARCADE SYSTEM (W2) =====
// Arcade shop bonus values.

import { node, treeResult } from '../../node.js';
import { label } from '../../entity-names.js';
import { arcadeShopParams } from '../../data/w2/arcade.js';
import { companionBonusForSave } from '../../data/common/companions.js';
import { formulaEvalDetail } from '../../../formula-details.js';
import { formulaInput, formulaOperation } from '../../formula-tree.js';

export function arcadeBonus(idx, saveData, options) {
  var params = arcadeShopParams(idx);
  if (!params) return treeResult(0);
  var lv = (saveData.arcadeUpgData && saveData.arcadeUpgData[idx]) || 0;
  if (lv <= 0) {
    if (options?.formulaDetails) return Object.assign(treeResult(0), {
      name: label('Arcade', idx), kind: 'formula', formula: 'Purchased level <= 0: return 0',
      children: [formulaInput('Purchased level', lv, 'ArcadeUpg[' + idx + ']')], formulaTerm: true,
    });
    return treeResult(0);
  }
  var type = params[0], base = params[1], denom = params[2];
  var raw = type === 'add' ? (denom !== 0 ? ((base + denom) / denom + 0.5 * (lv - 1)) / (base / denom) * lv * base : base * lv) : base * lv / (lv + denom);
  var maxedM = lv === 101 ? 2 : lv === 102 ? 6 : 1;
  var comp27M = companionBonusForSave(27, saveData) === 1 ? 2 : 1;
  var val = maxedM * comp27M * raw;
  if (options?.formulaDetails) {
    const level = formulaInput('Purchased level', lv, 'ArcadeUpg[' + idx + ']');
    const cap = {
      name: 'Level cap multiplier', val: maxedM, kind: 'formula', formulaTerm: true,
      formula: 'level === 101 ? 2 : level === 102 ? 6 : 1', children: [level],
    };
    const companion = {
      name: label('Companion', 27), val: comp27M, kind: 'formula', formulaTerm: true,
      formula: 'Effective companion bonus === 1 ? 2 : 1',
      children: [formulaInput('Effective companion bonus', companionBonusForSave(27, saveData))],
    };
    const detail = formulaOperation(label('Arcade', idx), 'multiply',
      formulaOperation('Bonus multipliers', 'multiply', cap, companion),
      { ...formulaEvalDetail(type === 'add' ? 'add' : 'decay', base, denom, lv, {
        x1: formulaInput('First coefficient', base, 'ArcadeShopInfo[' + idx + '][1]'),
        x2: formulaInput('Second coefficient', denom, 'ArcadeShopInfo[' + idx + '][2]'),
        lv: level,
      }), name: 'Base shop bonus', formulaTerm: true });
    return Object.assign(treeResult(val, detail.children), detail, { formulaTerm: true });
  }
  return treeResult(val, [
    { name: 'Raw (lv=' + lv + ')', val: raw, fmt: 'raw' },
    { name: lv === 102 ? 'Omega Multi (102)' : 'Maxed Multi (101)', val: maxedM, fmt: 'x' },
    { name: label('Companion', 27), val: comp27M, fmt: 'x' },
  ]);
}

export var arcade = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var params = arcadeShopParams(id);
    if (!params) return node(label('Arcade', id), 0, null, { note: 'arcade ' + id });
    if (ctx.formulaDetails) return arcadeBonus(id, saveData, { formulaDetails: true });
    var lv = (saveData.arcadeUpgData && saveData.arcadeUpgData[id]) || 0;
    if (lv <= 0) return node(label('Arcade', id), 0, null, { note: 'arcade ' + id });
    var result = arcadeBonus(id, saveData);
    var val = Number(result) || 0;
    var maxedM = lv === 101 ? 2 : lv === 102 ? 6 : 1;
    var comp27M = companionBonusForSave(27, saveData) === 1 ? 2 : 1;
    return node(label('Arcade', id), val, [
      node('Level', lv, null, { fmt: 'raw' }),
      node('Raw Value', val / maxedM / comp27M, null, { fmt: 'raw' }),
      node('Maxed Bonus', maxedM, null, { fmt: 'x', note: lv === 102 ? 'Level 102 (Omega)' : lv === 101 ? 'Level 101 (Super)' : 'Not maxed' }),
      node(label('Companion', 27), comp27M, null, { fmt: 'x' }),
    ].concat(result.children || []), { fmt: '+' });
  },
};
