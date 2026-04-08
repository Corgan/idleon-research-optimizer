// ===== STAMP SYSTEM (W1) =====
// Stamp book bonuses through decay formula.
// Exalted stamps get ×StampExalted_double = 1 + StampDoubler/100.
// StampDoubler = 100 + 10 sources (Atom12, Pristine20, CompassBonus76,
//   EmperorSet, 20×EventShop18, Palette23, Exotic49, Spelunk[4][3], Legend36, SushiRoG17).

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { saveData } from '../../../state.js';
import { stampLvData } from '../../../save/data.js';
import { formulaEval } from '../../../formulas.js';
import { eventShopOwned } from '../../../game-helpers.js';
import { pristineBon, getSetBonus } from '../common/goldenFood.js';
import { mainframeBonus } from '../w4/lab.js';
import { legendPTSbonus } from '../../systems/w7/spelunking.js';
import { exoticParams } from '../../data/w5/farming.js';
import { paletteParams } from '../../data/w4/gaming.js';
import { compassUpgPerLevel } from '../../data/common/compass.js';
import { rogBonusQTY } from '../w7/sushi.js';
import { STAMP_DATA } from '../../data/w1/stamp.js';
import { ITEMS } from '../../data/game/items.js';

// Number2Letter mapping for stamp key encoding: cat → letter
// Game's Number2Letter: [0]='_', [1]='a', [2]='b', [3]='c'
var N2L = '_abcdefghijklmnopqrstuvwxyz';

function stampKey(cat, idx) {
  return (N2L[cat] || '_') + idx;
}

function isExalted(cat, idx) {
  var key = stampKey(cat, idx);
  var exaltedArr = saveData.compassData && saveData.compassData[4];
  if (!exaltedArr || !Array.isArray(exaltedArr)) return false;
  return exaltedArr.indexOf(key) !== -1;
}

function computeStampDoublerSources() {

  // Source 1: AtomBonuses(12) = Atoms[12] × perLv(1)
  var atom12 = Number(saveData.atomsData[12]) || 0;

  // Source 2: PristineBon(20) — Pristine Charm 20
  var prist20 = pristineBon(20);

  // Source 3: CompassBonus(76) — Compass upgrade level × perLevel
  var compassLv = (saveData.compassData && saveData.compassData[0] && Number(saveData.compassData[0][76])) || 0;
  var compass76 = compassLv * compassUpgPerLevel(76);

  // Source 4: GetSetBonus("EMPEROR_SET", "Bonus")
  var emperorSet = getSetBonus('EMPEROR_SET');

  // Source 5: 20 × EventShopOwned(18)
  var evShop18 = 20 * eventShopOwned(18, saveData.cachedEventShopStr);

  // Source 6: PaletteBonus(23) — Honey_Yellow palette (decay type)
  // Game applies ×(1+LegendPTS_bonus(10)/100) × (1+0.5*loreFlag8) to all palette bonuses
  var paletteLv = (saveData.spelunkData && saveData.spelunkData[9] && Number(saveData.spelunkData[9][23])) || 0;
  var pal23 = paletteParams(23);
  var palRaw23 = paletteLv > 0
    ? paletteLv / (paletteLv + pal23.denom) * pal23.base
    : 0;
  var palLegendMulti = 1 + legendPTSbonus(10) / 100;
  var loreFlag8 = (Number((saveData.spelunkData && saveData.spelunkData[0] && saveData.spelunkData[0][8]) || 0) >= 1) ? 1 : 0;
  var palLoreMulti = 1 + 0.5 * loreFlag8;
  var palette23 = palRaw23 * palLegendMulti * palLoreMulti;

  // Source 7: ExoticBonusQTY(49) — EXALTED_ELDOU (decay type)
  var ex49 = exoticParams(49);
  var exoticLv = (saveData.farmUpgData && Number(saveData.farmUpgData[ex49.farmSlot])) || 0;
  var exotic49 = exoticLv > 0
    ? ex49.base * exoticLv / (ex49.denom + exoticLv)
    : 0;

  // Source 8: Math.round(Spelunk[4][3])
  var spelunk43 = Math.round(Number((saveData.spelunkData && saveData.spelunkData[4] && saveData.spelunkData[4][3]) || 0));

  // Source 9 (additive to 100): LegendPTS_bonus(36)
  var legend36 = legendPTSbonus(36);

  // Source 10: SushiStuff("RoG_BonusQTY", 17, 0)
  var sushiRoG17 = rogBonusQTY(17, saveData.cachedUniqueSushi || 0);

  var innerSum = atom12 + prist20 + compass76 + emperorSet + evShop18
    + palette23 + exotic49 + spelunk43;
  var total = 100 + innerSum + legend36 + sushiRoG17;

  var children = [
    node('Base Doubler', 100, null, { fmt: 'raw' }),
    node(label('Atom', 12), atom12, null, { fmt: '+' }),
    node(label('Pristine', 20), prist20, null, { fmt: '+' }),
    node(label('Compass', 76), compass76, compass76 > 0 ? [
      node('Compass Level', compassLv, null, { fmt: 'raw' }),
    ] : null, { fmt: '+' }),
    node('Emperor Set', emperorSet, null, { fmt: '+' }),
    node(label('Event', 18, ' (\u00d720)'), evShop18, null, { fmt: '+' }),
    node(label('Palette', 23), palette23, paletteLv > 0 ? [
      node('Palette Level', paletteLv, null, { fmt: 'raw' }),
    ] : null, { fmt: '+' }),
    node(label('Exotic', 49), exotic49, exoticLv > 0 ? [
      node('Exotic Level', exoticLv, null, { fmt: 'raw' }),
    ] : null, { fmt: '+' }),
    node('Spelunk[4][3]', spelunk43, null, { fmt: '+' }),
    node(label('Legend', 36), legend36, null, { fmt: '+' }),
    node(label('Sushi', 17), sushiRoG17, null, { fmt: '+' }),
  ];

  return { total: total, children: children };
}

export { stampKey, isExalted, computeStampDoublerSources };

export var stamp = {
  resolve: function(id, ctx) {
    var data = STAMP_DATA[id];
    if (!data) return node(label('Stamp', id), 0, null, { note: 'stamp ' + id });
    var lv = Number((stampLvData && stampLvData[data.cat] && stampLvData[data.cat][data.idx]) || 0);
    if (lv <= 0) return node(label('Stamp', id), 0, null, { note: 'stamp ' + id });
    var baseVal = formulaEval(data.formula, data.x1, data.x2, lv);

    var exalted = isExalted(data.cat, data.idx);
    var doublerInfo = computeStampDoublerSources();
    var exaltedMulti = exalted ? 1 + doublerInfo.total / 100 : 1;
    var val = baseVal * exaltedMulti;

    // Post-loop multipliers from StampBonusOfTypeX (apply to non-MISC stamps: cat < 2)
    var labDouble = 1;
    var pristineMulti = 1;
    if (data.cat < 2) {
      // Certified Stamp Book (lab node 7): doubles all non-MISC stamps when connected
      if (mainframeBonus(7) === 2) labDouble = 2;
      // Pristine Charm 17 (Liquorice Rolle): ×(1 + PristineBon(17)/100)
      var prist17 = pristineBon(17);
      if (prist17 > 0) pristineMulti = 1 + prist17 / 100;
      val = val * labDouble * pristineMulti;
    }

    var stampChildren = [
      node('Stamp Level', lv, null, { fmt: 'raw' }),
      node('Formula Result', baseVal, null, { fmt: 'raw', note: data.formula + '(' + data.x1 + ',' + data.x2 + ',' + lv + ')' }),
    ];

    if (exalted) {
      stampChildren.push(
        node('Exalted ×', exaltedMulti, [
          node('StampDoubler', doublerInfo.total, doublerInfo.children, { fmt: 'raw' }),
        ], { fmt: 'x' })
      );
    } else {
      stampChildren.push(
        node('Exalted', 0, [
          node('Not exalted (Compass[4] missing key "' + stampKey(data.cat, data.idx) + '")', 0, null, { fmt: 'raw' }),
          node('StampDoubler (if exalted)', doublerInfo.total, doublerInfo.children, { fmt: 'raw' }),
        ], { fmt: 'raw', note: 'inactive' })
      );
    }

    if (data.cat < 2) {
      if (labDouble > 1) {
        stampChildren.push(node('Certified Stamp Book ×', labDouble, null, { fmt: 'x', note: 'Lab node 7' }));
      }
      if (pristineMulti > 1) {
        stampChildren.push(node('Liquorice Rolle ×', pristineMulti, null, { fmt: 'x', note: 'Pristine 17' }));
      }
    }

    return node(label('Stamp', id), val, stampChildren, { fmt: '+', note: 'stamp ' + id });
  },
};

// ==================== STAMP BONUS OF TYPE X ====================
// Sums all stamps of a given bonus type (e.g. "classxp", "BaseMinEff").
// The bonus type is derived from ITEMS[stampKey].desc_line1.

var _stampTypeCache = null;
function buildStampTypeMap() {
  if (_stampTypeCache) return _stampTypeCache;
  _stampTypeCache = {};
  var keys = Object.keys(ITEMS);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf('Stamp') !== 0 || k.length < 7) continue;
    var item = ITEMS[k];
    var parts = item.desc_line1.split(',');
    var type = parts[0];
    var catLetter = k[5]; // A, B, C
    var catNum = catLetter === 'A' ? 0 : catLetter === 'B' ? 1 : 2;
    var idx = item.ID - catNum * 1000;
    if (!_stampTypeCache[type]) _stampTypeCache[type] = [];
    _stampTypeCache[type].push({ cat: catNum, idx: idx, x1: Number(parts[2]), x2: Number(parts[3]), formula: parts[1] });
  }
  return _stampTypeCache;
}

export function computeStampBonusOfTypeX(typeKey) {
  var map = buildStampTypeMap();
  var stamps = map[typeKey];
  if (!stamps) return 0;
  var total = 0;
  var doublerTotal = null; // lazy-computed
  var labDouble = mainframeBonus(7) === 2 ? 2 : 1;
  var prist17 = pristineBon(17) || 0;
  var pristMulti = prist17 > 0 ? 1 + prist17 / 100 : 1;

  for (var si = 0; si < stamps.length; si++) {
    var st = stamps[si];
    var lv = Number((stampLvData && stampLvData[st.cat] && stampLvData[st.cat][st.idx]) || 0);
    if (lv <= 0) continue;
    var val = formulaEval(st.formula, st.x1, st.x2, lv);
    if (isExalted(st.cat, st.idx)) {
      if (doublerTotal === null) {
        var _d = computeStampDoublerSources();
        doublerTotal = (typeof _d === 'object' && _d) ? (_d.total || 0) : (Number(_d) || 0);
      }
      val *= 1 + doublerTotal / 100;
    }
    if (st.cat < 2) {
      val *= labDouble * pristMulti;
    }
    total += val;
  }
  return total;
}
