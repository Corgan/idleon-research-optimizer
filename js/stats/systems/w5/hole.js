// ===== HOLE SYSTEM (W5) =====
// Cavern upgrades, brass schematics, measurements, monument bonuses.

import { node } from '../../node.js';

var HOLE_DATA = {
  upg46:    { buildIdx: 26, dataIdx: 26, multi: 5,  name: 'Cavern Upgrade 46' },
  upg82:    { buildIdx: 55, dataIdx: 55, multi: 20, name: 'Cavern Upgrade 82' },
  brass20:  { buildIdx: 20, dataIdx: 14, multi: 5,  name: 'Brass Schematic 20' },
};

export var holes = {
  resolve: function(id, ctx) {
    var S = ctx.S;
    var hd = S.holesData;
    if (!hd) return node('Hole: ' + id, 0);

    // Standard upgrades: multi × Holes[11][dataIdx] if building constructed
    var data = HOLE_DATA[id];
    if (data) {
      var built = ((hd[13] && hd[13][data.buildIdx]) || 0) >= 1;
      var lv = Number((hd[11] && hd[11][data.dataIdx]) || 0);
      if (!built) return node(data.name, 0, [node('Not built', 0, null, { fmt: 'raw' })], { note: 'hole:' + id });
      var val = data.multi * lv;
      return node(data.name, val, [
        node('Level', lv, null, { fmt: 'raw' }),
        node('Multiplier', data.multi, null, { fmt: 'x' }),
      ], { fmt: '+', note: 'hole:' + id });
    }

    // Measurement bonus
    // Game: MeasurementBonusTOTAL(t) = MeasurementBaseBonus(t) × MeasurementMulti(HolesInfo[52][t])
    // MeasurementBaseBonus: (1+cosmo13/100) × parsedVal × measLv / (100+measLv)  [when "TOT" suffix]
    // MeasurementMulti: based on MeasurementQTYfound(typeIdx, 99)
    if (id === 'meas15') {
      var measLv = Number((hd[22] && hd[22][15]) || 0);
      if (measLv <= 0) return node('Measurement 15', 0, null, { note: 'hole:meas15' });
      // HOLES_MEAS_BASE[15] = '50TOT' → parsedVal=50, decay formula
      var parsedVal = 50;
      // CosmoBonusQTY(1,3) = floor(25 × Holes[5][3])
      var cosmoRaw = Number((hd[5] && hd[5][3]) || 0);
      var cosmoBonus = Math.floor(cosmoRaw * 25);
      var baseBonus = (1 + cosmoBonus / 100) * (parsedVal * measLv / (100 + measLv));

      // MeasurementMulti for type 10 (HOLES_MEAS_TYPE[15]=10)
      // MeasurementQTYfound(10, 99) = max(0, log10(Holes[11][63]) - 2)
      var raw63 = Number((hd[11] && hd[11][63]) || 0);
      var qty = raw63 > 1 ? Math.max(0, Math.log(raw63) / 2.30259 - 2) : 0;
      var measMulti = qty < 5 ? 1 + 18 * qty / 100 : 1 + (18 * qty + 8 * (qty - 5)) / 100;

      var val = baseBonus * measMulti;
      return node('Measurement 15', val, [
        node('Measurement Level', measLv, null, { fmt: 'raw' }),
        node('Cosmo Bonus', cosmoBonus, null, { fmt: 'raw', note: 'raw=' + cosmoRaw }),
        node('Cosmo Multiplier', 1 + cosmoBonus / 100, null, { fmt: 'x' }),
        node('Base Bonus', baseBonus, null, { fmt: 'raw', note: '50×lv/(100+lv)×cosmo' }),
        node('Meas Multi', measMulti, [
          node('Holes[11][63]', raw63, null, { fmt: 'raw' }),
          node('QTY (type 10)', qty, null, { fmt: 'raw', note: 'max(0,log10(raw)-2)' }),
        ], { fmt: 'x', note: 'type 10' }),
      ], { fmt: '+', note: 'hole:meas15' });
    }

    // Monument ROG bonus
    if (id === 'monument') {
      var t = 2, iDR = 6, iWis = 9;
      var idx = 10 * t + iDR;
      var monLv = Number((hd[15] && hd[15][idx]) || 0);
      if (monLv <= 0) return node('Monument Drop Rate', 0, null, { note: 'hole:monument' });
      var bonusPerLv = 100;

      // Wisdom monument multiplier (MonumentROGbonuses(t, 9))
      var wisIdx = 10 * t + iWis;
      var wisLv = Number((hd[15] && hd[15][wisIdx]) || 0);
      var wisBonusPerLv = 250;
      var wisBonus = 0;
      if (wisLv > 0) {
        // Wisdom uses diminishing (bonusPerLv=250 >= 30), HoleozDN=1 (self)
        wisBonus = 0.1 * Math.ceil(wisLv / (250 + wisLv) * 10 * wisBonusPerLv);
      }

      // CosmoBonusQTY(0,0) = floor(CosmoUpgrades[0][0][0] * Holes[4][0])
      var cosmo00Base = 25; // COSMO_UPG_BASE['0_0']
      var cosmo00Lv = Number((hd[4] && hd[4][0]) || 0);
      var cosmoBonus = Math.floor(cosmo00Base * cosmo00Lv);

      // HoleozDN = (1 + wisBonus/100) + cosmoBonus/100
      var holeozDN = (1 + wisBonus / 100) + cosmoBonus / 100;

      // Diminishing formula (bonusPerLv=100 >= 30)
      var val = 0.1 * Math.ceil(monLv / (250 + monLv) * 10 * bonusPerLv * Math.max(1, holeozDN));

      var multiCh = [];
      if (wisBonus > 0) multiCh.push(node('Wisdom Monument', wisBonus, [
        node('Wisdom Level', wisLv, null, { fmt: 'raw' }),
        node('Bonus Per Level', wisBonusPerLv, null, { fmt: 'raw' }),
      ], { fmt: 'raw', note: 'monument idx 29' }));
      if (cosmoBonus > 0) multiCh.push(node('Cosmo Upgrade', cosmoBonus, [
        node('Cosmo Level', cosmo00Lv, null, { fmt: 'raw' }),
      ], { fmt: 'raw', note: 'cosmo 0/0' }));
      return node('Monument Drop Rate', val, [
        node('Monument Level', monLv, null, { fmt: 'raw' }),
        node('Bonus Per Level', bonusPerLv, null, { fmt: 'raw' }),
        node('Wisdom Multiplier', holeozDN, multiCh.length ? multiCh : null, { fmt: 'x' }),
      ], { fmt: '+', note: 'hole:monument' });
    }

    return node('Hole ' + id, 0, null, { note: 'hole:' + id });
  },
};
