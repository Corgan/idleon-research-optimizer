// ===== SPELUNKING SYSTEM (W7) =====
// Spelunking shop upgrade bonuses and legend talent bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { legendTalentPerPt } from '../../data/w7/legendTalent.js';
import { spelunkUpgPerLevel } from '../../data/w7/spelunking.js';

export function legendPTSbonus(idx, saveData) {
  var lv = (saveData.spelunkData && saveData.spelunkData[18] && saveData.spelunkData[18][idx]) || 0;
  var perPt = legendTalentPerPt(idx);
  return Math.round(lv * perPt);
}

var SPELUNK_DATA = {
  50: {},
};

export var spelunkShop = {
  resolve: function(id, ctx) {
    var data = SPELUNK_DATA[id];
    var name = label('Spelunking', id);
    if (!data) return node(name, 0, null, { note: 'spelunk ' + id });
    var saveData = ctx.saveData;
    var shopLv = Number((saveData.spelunkData && saveData.spelunkData[5] && saveData.spelunkData[5][id]) || 0);
    if (shopLv <= 0) return node(name, 0, null, { note: 'spelunk ' + id });
    var perLevel = spelunkUpgPerLevel(id);
    var val = perLevel * shopLv;
    return node(name, val, [
      node('Shop Level', shopLv, null, { fmt: 'raw' }),
      node('Per Level', perLevel, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'spelunk ' + id });
  },
};

// ==================== PALETTE BONUS ====================

import { paletteParams } from '../../data/w4/gaming.js';
import { Spelunky } from '../../data/game/customlists.js';
import { SpelunkUpg, SpelunkChapters } from '../../data/game/customlists.js';
import { superBitType } from '../../../game-helpers.js';
import { formulaEval } from '../../../formulas.js';
import { computeArtifactBonus } from '../w5/sailing.js';

// SuperBit → palette index pairs for doubling
var PALETTE_SUPERBIT_PAIRS = [
  [49, 25], [51, 13], [52, 31], [54, 18], [58, 3], [61, 12]
];

export function computePaletteBonus(paletteIdx, saveData) {
  var paletteLv = Number(saveData.spelunkData && saveData.spelunkData[9] && saveData.spelunkData[9][paletteIdx]) || 0;
  if (paletteLv <= 0) return 0;
  var pal = paletteParams(paletteIdx);
  if (!pal) return 0;
  var raw = pal.isDecay
    ? paletteLv / (paletteLv + pal.denom) * pal.coeff
    : paletteLv * pal.coeff;
  // SuperBit doubling for specific palette indices
  var g12 = saveData.gamingData && saveData.gamingData[12];
  for (var pi = 0; pi < PALETTE_SUPERBIT_PAIRS.length; pi++) {
    if (PALETTE_SUPERBIT_PAIRS[pi][1] === paletteIdx && superBitType(PALETTE_SUPERBIT_PAIRS[pi][0], g12) === 1) {
      raw *= 2 + 0.5 * superBitType(59, g12);
      break;
    }
  }
  var palLegendMulti = 1 + (legendPTSbonus(10, saveData) || 0) / 100;
  var loreFlag8 = (Number((saveData.spelunkData && saveData.spelunkData[0] && saveData.spelunkData[0][8]) || 0) >= 1) ? 1 : 0;
  var palLoreMulti = 1 + 0.5 * loreFlag8;
  return raw * palLegendMulti * palLoreMulti;
}

// ==================== BIG FISH BONUSES ====================
// BigFishBonuses(idx) = fishLv / (100 + fishLv) * baseVal
// fishLv from Spelunk[11], baseVal from Spelunky[18] field [2]

var _bigFishBase = null;
function getBigFishBase() {
  if (_bigFishBase) return _bigFishBase;
  _bigFishBase = [];
  var raw = Spelunky[18];
  if (!raw) return _bigFishBase;
  for (var i = 0; i < raw.length; i++) {
    var parts = ('' + raw[i]).split(',');
    _bigFishBase.push(Number(parts[2]) || 0);
  }
  return _bigFishBase;
}

export function computeBigFishBonus(idx, saveData) {
  var fishLv = Number(saveData.spelunkData && saveData.spelunkData[11] && saveData.spelunkData[11][idx]) || 0;
  if (fishLv <= 0) return 0;
  var bases = getBigFishBase();
  var base = bases[idx] || 0;
  return fishLv / (100 + fishLv) * base;
}

// ==================== SHOP UPGRADE BONUS ====================
// SpelunkUpg[idx][4] * level

export function shopUpgBonus(idx, saveData) {
  if (!saveData.spelunkData || !saveData.spelunkData[5]) return 0;
  var lv = Number(saveData.spelunkData[5][idx]) || 0;
  if (lv <= 0) return 0;
  if (!SpelunkUpg || !SpelunkUpg[idx]) return 0;
  return Number(SpelunkUpg[idx][4]) * lv;
}

// ==================== CHAPTER BONUS ====================
// SpelunkChapters[chapterIdx][bonusIdx]: formula-based bonus

function _safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;
  } catch(e) { return 0; }
}

export function chapterBonus(chapterIdx, bonusIdx, saveData) {
  var spelunk = saveData.spelunkData;
  if (!spelunk || !spelunk[8]) return 0;
  var lv = Number(spelunk[8][4 * chapterIdx + bonusIdx]) || 0;
  if (lv <= 0) return 0;
  var chData = SpelunkChapters[chapterIdx];
  if (!chData || !chData[bonusIdx]) return 0;
  var row = chData[bonusIdx];
  var dn = 1;
  if (Number(row[4]) === 1) {
    dn = 1 + _safe(computeArtifactBonus, 35, -1, { saveData: saveData }) / 100;
  }
  return dn * formulaEval(row[3], Number(row[1]) || 0, Number(row[2]) || 0, lv);
}
