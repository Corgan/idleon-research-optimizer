// ===== SKILLING CAVERN LAYERS (W5) =====
// Motherlode (t=0), Hive (1), Evertree (2), and Trench (3). Holes[11][2t] is the
// current layer's collected amount and Holes[11][1+2t] is the number of layers
// cleared. Clearing is manual and resets the collected amount to zero.

import { holesBolaiaPerLv } from '../../data/w5/hole.js';
import { collectibleBonus } from './jar.js';
import { legendPTSbonus } from '../w7/spelunking.js';

export var SKILLING_CAVERNS = ['Motherlode', 'Hive', 'Evertree', 'Trench'];
// StudyBolaiaBonuses index whose per-level value scales with each cavern's cleared layers.
var BOLAIA_LAYER_STUDY = [1, 7, 11, 16];

function _h11(saveData, i) {
  return Number(saveData && saveData.holesData && saveData.holesData[11] && saveData.holesData[11][i]) || 0;
}

export function cavernLayersCleared(saveData, t) {
  return _h11(saveData, 1 + 2 * t);
}

export function cavernLayerProgress(saveData, t) {
  return _h11(saveData, 2 * t);
}

// Holes("MotherlodeEffBase", t). The monster's Defence and the Trench fishing
// EffReqs are derived from this value.
export function motherlodeEffBase(saveData, t, layersOverride) {
  var layers = layersOverride != null ? Number(layersOverride) : cavernLayersCleared(saveData, t);
  return 2e4 * (1 + 99 * Math.floor(t / 3)) * Math.pow(1.8, 1 + layers);
}

// MotherlodeFISH EffReq1..3 written over FishPools when Holes data exists.
export function trenchFishingEffReqs(saveData, layersOverride) {
  var quarter = motherlodeEffBase(saveData, 3, layersOverride) / 4;
  return [quarter, quarter + 100, quarter + 200];
}

// Holes("TotalOreREQ", t): amount needed to clear the current layer, with every
// source reduction. `layersOverride` projects cavern t at a different depth;
// the Bolaia term for that cavern uses the projected depth too.
export function cavernLayerRequirement(saveData, t, layersOverride) {
  var layers = layersOverride != null ? Number(layersOverride) : cavernLayersCleared(saveData, t);
  var base = (1 + 99 * Math.floor(t / 3)) * 200 * Math.pow(2.2, 1 + layers);
  var legend29 = legendPTSbonus(29, saveData) || 0;
  var jar = collectibleBonus(saveData, 5, legend29) || 0;
  var bolaia = BOLAIA_LAYER_STUDY.map(function(study, cavern) {
    var level = Number(saveData && saveData.holesData && saveData.holesData[26] && saveData.holesData[26][study]) || 0;
    var perLayer = level * holesBolaiaPerLv(study);
    var cavernLayers = cavern === t ? layers : cavernLayersCleared(saveData, cavern);
    return { cavern: SKILLING_CAVERNS[cavern], study: study, level: level, perLayer: perLayer, layers: cavernLayers, value: perLayer * cavernLayers };
  });
  var reductionPct = jar;
  for (var i = 0; i < bolaia.length; i++) reductionPct += bolaia[i].value;
  var value = base / (1 + reductionPct / 100);
  var progress = layersOverride != null ? 0 : cavernLayerProgress(saveData, t);
  return {
    cavern: SKILLING_CAVERNS[t],
    layers: layers,
    base: base,
    jarCollectible5: jar,
    legend29: legend29,
    bolaia: bolaia,
    reductionPct: reductionPct,
    value: value,
    progress: progress,
    remaining: Math.max(0, value - progress),
  };
}
