// ===== TESSERACT / ARCANE SYSTEM (MC) =====
// Arcane map kill-count bonus and arcane upgrade bonuses.

import { node } from '../../node.js';
import { arcanePerLevel } from '../../data/common/arcane.js';
import { ARCANE_NO_MULTI } from '../../data/game-constants.js';
import { maxTalentBonus } from '../common/talent.js';
import { getLOG } from '../../../formulas.js';
import { applyTermOverride } from '../../term-overrides.js';

var arcaneNoMultiSet = ARCANE_NO_MULTI;

export function arcaneUpgBonus(idx, saveData) {
  var lv = saveData.arcaneData[idx] || 0;
  if (lv <= 0) return 0;
  var perLv = arcanePerLevel(idx) || 1;
  if (arcaneNoMultiSet.has(idx)) return lv * perLv;
  return lv * perLv * (1 + arcaneUpgBonus(39, saveData) / 100);
}

function arcaneMapBonus(kills, saveData) {
  if (kills < 1) return 0;
  // Game uses getLOG (Math.log/2.30259) not Math.log10, and Log2 (Math.log/Math.log(2))
  var lg = getLOG(kills), lg2 = Math.log(Math.max(kills, 1)) / Math.log(2);
  return (2 * Math.max(0, lg - 3.5) + Math.max(0, lg2 - 12)) * (lg / 2.5)
    + Math.min(2, kills / 1000) + Math.max(5 * (lg - 5), 0);
}

// ArcaneMapMulti_bonMAX = 100 * (getbonus2(1,589,-1, saveData) - 1) + min(10, ArcaneUpgBonus(58))
// getbonus2(1,589,-1, saveData) = max talent 589 value across all characters (decayMulti: 1 + lv/(lv+500))
function arcaneMapMultiBonMax(activeCharIdx, saveData) {
  var t589 = maxTalentBonus(589, activeCharIdx, saveData);   // decayMulti → value >= 1
  return 100 * (t589 - 1) + Math.min(10, arcaneUpgBonus(58, saveData));
}

var ARCANE_MAP_TERM = ['Drop Rate', 'Monster EXP', 'AFK gains'];

// Shared ArcaneMapMulti_bon(idx) parts with component term overrides:
// `arcaneMapKills:<idx>` (MapBon[map][idx]) and `arcaneMapCap` (ArcaneMapMulti_bonMAX).
function _arcaneMapParts(idx, ctx) {
  var saveData = ctx.saveData;
  var what = ARCANE_MAP_TERM[idx] || ('#' + idx);
  var meta = { group: 'Arcane map', fmt: 'raw', function: true };
  var kills = applyTermOverride(ctx, 'arcaneMapKills:' + idx, Number(ctx.mapBon[ctx.mapIdx][idx]) || 0,
    Object.assign({ name: 'Arcane map kills (' + what + ')' }, meta));
  var raw = arcaneMapBonus(kills, saveData);
  var cap = applyTermOverride(ctx, 'arcaneMapCap', arcaneMapMultiBonMax(ctx.charIdx, saveData),
    Object.assign({ name: 'Arcane map multiplier cap' }, meta));
  return { kills: kills, raw: raw, cap: cap, val: Math.min(cap, raw) };
}

// ArcaneMapMulti_bon(idx): capped per-map kill-count bonus
// Requires ctx.mapBon[ctx.mapIdx] — array of 3+ kill counts per map
export function computeArcaneMapMultiBon(idx, ctx) {
  if (!ctx || !ctx.mapBon || ctx.mapIdx == null) return 0;
  var mapData = ctx.mapBon[ctx.mapIdx];
  if (!mapData || mapData.length < 3) return 0;
  var parts = _arcaneMapParts(idx, ctx);
  return applyTermOverride(ctx, 'arcaneMapMulti:' + idx, parts.val,
    { name: 'Arcane map multiplier (' + (ARCANE_MAP_TERM[idx] || '#' + idx) + ')', fmt: '+', group: 'Arcane map', function: true });
}

export var arcaneMap = {
  // Same component key as computeArcaneMapMultiBon(0); tree-builder applies it.
  termKey: function() { return 'arcaneMapMulti:0'; },
  resolve: function(id, ctx) {
    // Arcane map bonus requires MapBon data + current map selection
    if (!ctx.mapBon || ctx.mapIdx == null) {
      return node('Arcane Map Bonus', 0, [
        node('Session-only (no map data)', 0, null, { fmt: 'raw' }),
      ], { note: 'arcane map' });
    }
    var mapData = ctx.mapBon[ctx.mapIdx];
    if (!mapData || mapData.length < 3) return node('Arcane Map Bonus', 0, [
      node('Map data row is incomplete', mapData ? mapData.length : 0, null, { fmt: 'raw' }),
    ]);
    var p = _arcaneMapParts(0, ctx);
    return node('Arcane Map Bonus', p.val, [
      node('Map Kills', p.kills, null, { fmt: 'raw' }),
      node('Raw Bonus', p.raw, null, { fmt: '+' }),
      node('Cap', p.cap, null, { fmt: 'raw' }),
      node('Capped Bonus', p.val, null, { fmt: '+' }),
    ], { fmt: '+', note: 'arcane map' });
  },
};
