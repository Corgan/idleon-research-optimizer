// ===== SPELUNKING SYSTEM (W7) =====
// Spelunking shop upgrade bonuses and legend talent bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { saveData } from '../../../state.js';
import { legendTalentPerPt } from '../../data/w7/legendTalent.js';
import { spelunkUpgPerLevel } from '../../data/w7/spelunking.js';

export function legendPTSbonus(idx) {
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

export function computePaletteBonus(paletteIdx) {
  var paletteLv = Number(saveData.spelunkData && saveData.spelunkData[9] && saveData.spelunkData[9][paletteIdx]) || 0;
  if (paletteLv <= 0) return 0;
  var pal = paletteParams(paletteIdx);
  if (!pal) return 0;
  var raw = paletteLv / (paletteLv + pal.denom) * pal.base;
  var palLegendMulti = 1 + (legendPTSbonus(10) || 0) / 100;
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

export function computeBigFishBonus(idx) {
  var fishLv = Number(saveData.spelunkData && saveData.spelunkData[11] && saveData.spelunkData[11][idx]) || 0;
  if (fishLv <= 0) return 0;
  var bases = getBigFishBase();
  var base = bases[idx] || 0;
  return fishLv / (100 + fishLv) * base;
}
