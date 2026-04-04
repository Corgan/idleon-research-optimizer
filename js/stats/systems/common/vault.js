// ===== VAULT SYSTEM =====
// Vault upgrade bonuses with mastery multipliers.
// Game: for non-whitelist indices, VaultUpgBonus = lv * perLv * (1 + masteryLv/100)
// Mastery tiers: <32 uses VaultUpgBonus(32), 33-60 uses VaultUpgBonus(61), 61-88 uses VaultUpgBonus(89).

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { VAULT_NO_MASTERY } from '../../data/game-constants.js';

// Indices that return lv * perLv WITHOUT mastery multiplier
var NO_MASTERY = VAULT_NO_MASTERY;

export var vault = {
  resolve: function(id, ctx) {
    var name = label('Vault', id);
    var vd = ctx.saveData.vaultData;
    var lv = vd ? (Number(vd[id]) || 0) : 0;
    // VaultUpgBonus: perLevel * level (perLevel is always 1 for currently used upgrades)
    var perLevel = 1;
    var baseVal = perLevel * lv;

    // Mastery multiplier for non-whitelist indices
    var masteryLv = 0;
    if (!NO_MASTERY.has(id) && vd) {
      if (id < 32)       masteryLv = Number(vd[32]) || 0;
      else if (id <= 60) masteryLv = Number(vd[61]) || 0;
      else if (id <= 88) masteryLv = Number(vd[89]) || 0;
    }
    var masteryMulti = 1 + masteryLv / 100;
    var val = baseVal * masteryMulti;

    var children = [
      node('Level', lv, null, { fmt: 'raw' }),
      node('Per Level', perLevel, null, { fmt: 'raw' }),
    ];
    if (masteryLv > 0) {
      children.push(node('Mastery', masteryMulti, [
        node('Mastery Lv', masteryLv, null, { fmt: 'raw' }),
      ], { fmt: 'x' }));
    }
    return node(name, val, children, { fmt: '+', note: 'vault ' + id });
  },
};
