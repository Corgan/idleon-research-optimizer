// ===== VAULT SYSTEM =====
// Vault upgrade bonuses with mastery multipliers.
// Game: for non-whitelist indices, VaultUpgBonus = lv * perLv * (1 + masteryLv/100)
// Mastery tiers: <32 uses VaultUpgBonus(32), 33-60 uses VaultUpgBonus(61), 61-88 uses VaultUpgBonus(89).

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { VAULT_NO_MASTERY } from '../../data/game-constants.js';
import { vaultUpgPerLevel } from '../../data/common/vault.js';
import { formulaInput, formulaConstant as c, formulaOperation as op } from '../../formula-tree.js';

export function vaultUpgBonus(idx, saveData) {
  if (!saveData || !saveData.vaultData) return 0;
  var level = Number(saveData.vaultData[idx]) || 0;
  if (level <= 0) return 0;
  var perLv = vaultUpgPerLevel(idx);
  if (perLv == null) return 0;
  var base = level * perLv;
  if (idx === 0) {
    base += Math.max(0, level - 25) + Math.max(0, level - 50) + Math.max(0, level - 100);
  }
  if (idx === 60) {
    base += Math.max(0, level - 25) + Math.max(0, level - 50)
      + 2 * Math.max(0, level - 100) + 3 * Math.max(0, level - 200)
      + 5 * Math.max(0, level - 300) + 7 * Math.max(0, level - 400)
      + 10 * Math.max(0, level - 450);
    base *= 1 + Math.floor(level / 25) / 5;
  }
  if (!VAULT_NO_MASTERY.has(idx)) {
    var masteryLv = 0;
    var vd = saveData.vaultData;
    if (idx < 32)       masteryLv = Number(vd[32]) || 0;
    else if (idx <= 60) masteryLv = Number(vd[61]) || 0;
    else if (idx <= 88) masteryLv = Number(vd[89]) || 0;
    base *= 1 + masteryLv / 100;
  }
  return base;
}

// Indices that return lv * perLv WITHOUT mastery multiplier
var NO_MASTERY = VAULT_NO_MASTERY;

function _vaultFormula(id, lv, perLevel, masteryLv) {
  const level = formulaInput('Purchased level', lv, 'UpgVault[' + id + ']');
  let base = op('Level bonus', 'multiply', level,
    formulaInput('Bonus per level', perLevel, 'UpgradeVault[' + id + '][5]'));
  const thresholds = id === 0 ? [[25, 1], [50, 1], [100, 1]]
    : id === 60 ? [[25, 1], [50, 1], [100, 2], [200, 3], [300, 5], [400, 7], [450, 10]] : [];
  let extra;
  for (const [threshold, multiplier] of thresholds) {
    let term = op('Levels above ' + threshold, 'max', c(0),
      op('Breakpoint difference', 'subtract', level, c(threshold)));
    if (multiplier !== 1) term = op('Breakpoint bonus', 'multiply', c(multiplier), term);
    extra = extra ? op('Breakpoint sum', 'add', extra, term) : term;
  }
  if (extra) base = op('Base plus breakpoints', 'add', base, extra);
  if (id === 60) {
    base = op('Scaled breakpoint bonus', 'multiply', base,
      op('Scaling multiplier', 'add', c(1),
        op('Scaling fraction', 'divide',
          op('Completed level groups', 'floor', op('Level groups', 'divide', level, c(25))), c(5))));
  }
  const masteryId = id < 32 ? 32 : id <= 60 ? 61 : id <= 88 ? 89 : null;
  const mastery = NO_MASTERY.has(id) || masteryId === null ? c(1, 'No mastery multiplier')
    : op('Mastery multiplier', 'add', c(1), op('Mastery percentage', 'divide',
      formulaInput('Mastery level', masteryLv, 'UpgVault[' + masteryId + ']'), c(100)));
  return op('Vault upgrade bonus', 'multiply', base, mastery);
}

export var vault = {
  resolve: function(id, ctx) {
    var name = label('Vault', id);
    var vd = ctx.saveData.vaultData;
    var lv = vd ? (Number(vd[id]) || 0) : 0;
    var perLevel = vaultUpgPerLevel(id);
    var baseVal = perLevel * lv;
    // Index 0: breakpoint bonuses added before mastery
    if (id === 0) {
      baseVal += Math.max(0, lv - 25) + Math.max(0, lv - 50) + Math.max(0, lv - 100);
    }
    // Index 60: extended breakpoints + extra scaling
    if (id === 60) {
      baseVal += Math.max(0, lv - 25) + Math.max(0, lv - 50)
        + 2 * Math.max(0, lv - 100) + 3 * Math.max(0, lv - 200)
        + 5 * Math.max(0, lv - 300) + 7 * Math.max(0, lv - 400)
        + 10 * Math.max(0, lv - 450);
      baseVal *= 1 + Math.floor(lv / 25) / 5;
    }

    // Mastery multiplier for non-whitelist indices
    var masteryLv = 0;
    if (!NO_MASTERY.has(id) && vd) {
      if (id < 32)       masteryLv = Number(vd[32]) || 0;
      else if (id <= 60) masteryLv = Number(vd[61]) || 0;
      else if (id <= 88) masteryLv = Number(vd[89]) || 0;
    }
    var masteryMulti = 1 + masteryLv / 100;
    var val = baseVal * masteryMulti;
    if (ctx.formulaDetails) return node(name, val, [_vaultFormula(id, lv, perLevel, masteryLv)], { fmt: '+' });

    var children = [
      node('Level', lv, null, { fmt: 'raw' }),
      node('Per Level', perLevel, null, { fmt: 'raw' }),
    ];
    if (masteryLv > 0) {
      children.push(node('Mastery', masteryMulti, [
        node('Mastery Lv', masteryLv, null, { fmt: 'raw' }),
      ], { fmt: 'x' }));
    }
    return node(name, val, children, { fmt: '+' });
  },
};
