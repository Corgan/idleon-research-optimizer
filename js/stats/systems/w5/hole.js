// ===== HOLE SYSTEM (W5) =====
// Cavern upgrades, brass schematics, measurements, monument bonuses.
// Also: gambit / cosmo helpers used by research descriptors.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { cosmoUpgBase, holesBolaiaPerLv, HOLES_JAR_BONUS_PER_LV,
  holesMeasBase, holesMeasType, holesMonBonus } from '../../data/w5/hole.js';
import { DN_MOB_DATA } from '../../data/w7/deathNote.js';
import { deathNoteRank } from '../../../sim-math.js';
import { numCharacters, klaData } from '../../../save/data.js';
import { arcaneUpgBonus } from '../mc/tesseract.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { HOLE_MULTIPLIERS } from '../../data/game-constants.js';

var HOLE_DATA = HOLE_MULTIPLIERS;

export var holes = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var hd = saveData.holesData;
    if (!hd) return node('Hole: ' + id, 0);

    // Standard upgrades: multi × Holes[11][dataIdx] if building constructed
    var data = HOLE_DATA[id];
    if (data) {
      var built = ((hd[13] && hd[13][data.buildIdx]) || 0) >= 1;
      var lv = Number((hd[11] && hd[11][data.dataIdx]) || 0);
      var name = label('Cavern', id);
      if (!built) return node(name, 0, [node('Not built', 0, null, { fmt: 'raw' })], { note: 'hole:' + id });
      var val = data.multi * lv;
      return node(name, val, [
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
      if (measLv <= 0) return node(label('Measurement', 15), 0, null, { note: 'hole:meas15' });
      // HOLES_MEAS_BASE[15] = '50TOT' → parsedVal=50, decay formula
      var parsedVal = parseFloat(holesMeasBase(15)) || 50;
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
      return node(label('Measurement', 15), val, [
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
      var bonusPerLv = holesMonBonus(26);

      // Wisdom monument multiplier (MonumentROGbonuses(t, 9))
      var wisIdx = 10 * t + iWis;
      var wisLv = Number((hd[15] && hd[15][wisIdx]) || 0);
      var wisBonusPerLv = holesMonBonus(29);
      var wisBonus = 0;
      if (wisLv > 0) {
        // Wisdom uses diminishing (bonusPerLv=250 >= 30), HoleozDN=1 (self)
        wisBonus = 0.1 * Math.ceil(wisLv / (250 + wisLv) * 10 * wisBonusPerLv);
      }

      // CosmoBonusQTY(0,0) = floor(CosmoUpgrades[0][0][0] * Holes[4][0])
      var cosmo00Base = cosmoUpgBase(0, 0);
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

// ===== Cosmo / Gambit helpers =====

export function cosmoBonus(S, t, i) {
  var base = cosmoUpgBase(t, i);
  return Math.floor(base * (Number(S.holesData && S.holesData[4 + t] && S.holesData[4 + t][i]) || 0));
}

function _computeOverkillQTY() {
  var total = 0;
  for (var w = 0; w < 7; w++) {
    var mobs = DN_MOB_DATA[w];
    if (!mobs) continue;
    for (var m = 0; m < mobs.length; m++) {
      var klaIdx = mobs[m][0], killReq = mobs[m][1];
      if (klaIdx < 0) continue;
      var kills = 0;
      for (var ci = 0; ci < numCharacters; ci++) {
        var kla = klaData[ci];
        var left = Number(kla && kla[klaIdx] && kla[klaIdx][0]) || 0;
        kills += killReq - left;
      }
      total += deathNoteRank(Math.max(0, kills), 0);
    }
  }
  return total;
}

function _measurementMulti(S, typeIdx) {
  var qty = 0;
  switch (typeIdx) {
    case 0: { var raw = Number(S.holesData && S.holesData[11] && S.holesData[11][28]) || 0; qty = raw > 0 ? Math.log(raw) : 0; break; }
    case 1: qty = S.farmCropCount / 14; break;
    case 3: qty = S.totalTomePoints / 2500; break;
    case 6: qty = _computeOverkillQTY() / 125; break;
    case 8: qty = (S.cards1Data.length || 0) / 150; break;
    case 9: {
      var sum = 0;
      var bolaia = S.holesData[26] || [];
      for (var i = 0; i < bolaia.length; i++) sum += Number(bolaia[i]) || 0;
      qty = sum / 6; break;
    }
    default: qty = 0;
  }
  if (qty < 5) return 1 + 18 * qty / 100;
  return 1 + (18 * qty + 8 * (qty - 5)) / 100;
}

export function gambitPTSmulti(S) {
  var cosmo13 = cosmoBonus(S, 1, 3);
  var measBaseStr = holesMeasBase(13) || '0';
  var isTOT = measBaseStr.includes('TOT');
  var measBaseNum = parseFloat(measBaseStr) || 0;
  var measLv = Number(S.holesData && S.holesData[22] && S.holesData[22][13]) || 0;
  var measBase;
  if (isTOT) {
    measBase = (1 + cosmo13 / 100) * (measBaseNum * measLv / (100 + measLv));
  } else {
    measBase = (1 + cosmo13 / 100) * measBaseNum * measLv;
  }
  var measType = holesMeasType(13);
  var measMulti = _measurementMulti(S, measType);
  var measTotal = measBase * measMulti;

  var bolaiaLv = Number(S.holesData && S.holesData[26] && S.holesData[26][13]) || 0;
  var bolaiaPerLv = holesBolaiaPerLv(13);
  var studyBolaia = bolaiaLv * bolaiaPerLv;

  var bUpg78 = (Number(S.holesData && S.holesData[13] && S.holesData[13][78]) || 0) === 1 ? 10 : 0;

  var mon29Lv = Number(S.holesData && S.holesData[15] && S.holesData[15][29]) || 0;
  var mon29Bonus = holesMonBonus(29);
  var mon29 = mon29Bonus >= 30
    ? 0.1 * Math.ceil(mon29Lv / (250 + mon29Lv) * 10 * mon29Bonus)
    : mon29Lv * mon29Bonus;
  var cosmo00 = cosmoBonus(S, 0, 0);
  var holeozDN = (1 + mon29 / 100) + cosmo00 / 100;
  var mon27Lv = Number(S.holesData && S.holesData[15] && S.holesData[15][27]) || 0;
  var mon27Bonus = holesMonBonus(27);
  var monROG27;
  if (mon27Bonus >= 30) {
    monROG27 = 0.1 * Math.ceil(mon27Lv / (250 + mon27Lv) * 10 * mon27Bonus * Math.max(1, holeozDN));
  } else {
    monROG27 = mon27Lv * mon27Bonus * Math.max(1, holeozDN);
  }

  var legend29 = legendPTSbonus(29);
  var jar23 = (Number(S.holesData && S.holesData[24] && S.holesData[24][23]) || 0) * (HOLES_JAR_BONUS_PER_LV[23] || 0) * (1 + legend29 / 100);
  var jar30 = (Number(S.holesData && S.holesData[24] && S.holesData[24][30]) || 0) * (HOLES_JAR_BONUS_PER_LV[30] || 0) * (1 + legend29 / 100);

  var arcane47 = arcaneUpgBonus(47);

  var sum = measTotal + studyBolaia + bUpg78 + monROG27 + jar23 + jar30 + arcane47;
  return 1 + sum / 100;
}

export function gambitBonus15(S) {
  if (!Array.isArray(S.holesData[11])) return 0;
  var rawPts = 0;
  for (var i = 0; i < 6; i++) {
    var score = Number(S.holesData[11][65 + i]) || 0;
    var base = score + 3 * Math.floor(score / 10) + 10 * Math.floor(score / 60);
    rawPts += (i === 0 ? 100 : 200) * base;
  }
  var multi = gambitPTSmulti(S);
  var totalPts = rawPts * multi;
  var req = 2000 + 1000 * 16 * (1 + 15 / 5) * Math.pow(1.26, 15);
  return totalPts >= req ? 3 : 0;
}
