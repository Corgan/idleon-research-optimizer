// ===== DASHBOARD.JS - Tooltips, EXP breakdown, and dashboard rendering =====
// Extracted from app.js.

import {
  allBonusMulti,
  cards1Data,
  companionIds,
  cachedComp0DivOk,
  extBonuses,
  farmCropCount,
  gemItemsData,
  gridLevels,
  grimoireData,
  insightLvs,
  magData,
  magMaxPerSlot,
  magnifiersOwned,
  mealsData,
  ninjaData,
  occFound,
  olaData,
  research,
  researchLevel,
  ribbonData,
  sailingData,
  serverVarResXP,
  shapeOverlay,
  shapePositions,
  spelunkData,
  tasksGlobalData,
  totalTomePoints,
  totemInfoData,
  towerData,
} from '../state.js';
import { cachedAFKRate } from '../save/data.js';
import {
  ARTIFACT_BASE,
  DANCING_CORAL_BASE,
  EMPEROR_SET_BONUS_VAL,
  GODSHARD_SET_BONUS,
  GRID_COLS,
  GRID_SIZE,
  OCC_DATA,
  RES_GRID_RAW,
  SHAPE_BONUS_PCT,
  SHAPE_COLORS,
  SHAPE_DIMS,
  SHAPE_NAMES,
  SHAPE_VERTICES,
  STICKER_BASE,
} from '../game-data.js';
import {
  _buildKalMap,
  _gbWith,
  computeOccurrencesToBeFound,
  getKaleiMultiBase as _getKaleiMultiBasePure,
  obsBaseExp,
  researchExpReq,
} from '../sim-math.js';
import {
  emporiumBonus,
  eventShopOwned,
  ribbonBonusAt,
  superBitType,
} from '../save/helpers.js';
import { mainframeBonus } from '../lab.js';
import {
  achieveStatus,
  computeAFKGainsRate,
  computeCardLv,
  computeEmperorBon,
  computeExternalBonuses,
  computeMeritocBonusz,
  computeShinyBonusS,
  computeSummWinBonus,
  computeWinBonus,
  exoticBonusQTY40,
  grimoireUpgBonus22,
  legendPTSbonus,
} from '../save/external.js';
import {
  computeGridPointsAvailable,
  getResearchCurrentExp,
  makeCtx,
  simTotalExp,
} from '../save/context.js';
import { sameShapeCell } from '../optimizers/shapes-geo.js';
import { fmtExact, fmtTime, fmtVal } from '../renderers/format.js';
import { gridCoord } from '../grid-helpers.js';
// Circular import (render-upgrades → dashboard → render-upgrades) is safe:
// both sides use imports only inside functions, not at module level.
import { _formatDesc } from '../renderers/render-upgrades.js';


// --- Inline helpers (formerly in calculations.js → app.js, used only by dashboard) ---

function getGridBonus(idx, gl) {
  const info = RES_GRID_RAW[idx];
  if (!info) return 0;
  const lv = (gl || gridLevels)[idx] || 0;
  return info[2] * lv;
}

function getGridBonusFinal(idx, gl, so, ctx) {
  if (!ctx) ctx = makeCtx(gl || gridLevels);
  return _gbWith(gl || gridLevels, so || shapeOverlay, idx, ctx);
}

function getTotalObsLVs() {
  let total = 0;
  const occTBF = computeOccurrencesToBeFound(researchLevel, occFound);
  for (let i = 0; i < occTBF; i++) {
    if ((insightLvs[i] || 0) >= 1) total += insightLvs[i];
  }
  return total;
}

function buildKaleiMap() { return _buildKalMap(magData); }

function getKaleiMultiBase(gl, so, ctx) {
  if (!ctx) ctx = makeCtx(gl || gridLevels);
  return _getKaleiMultiBasePure(gl || gridLevels, so || shapeOverlay, ctx);
}

function _getKaleiMultiTot(obsIdx) {
  const kalMap = buildKaleiMap();
  return 1 + (kalMap[obsIdx] || 0) * getKaleiMultiBase();
}

function getResearchExpPerObs(obsIdx) {
  let count = 0;
  for (const m of magData) { if (m.type === 0 && m.slot === obsIdx) count++; }
  if (count === 0) return 0;
  const t = obsIdx;
  const basePerMag = (4 + (t/2 + Math.floor(t/4))) * (1 + Math.pow(t, 1 + t/15*0.4) / 10) + (Math.pow(t, 1.5) + 1.5*t);
  let rate = count * basePerMag;
  const gd101 = getGridBonusFinal(93);
  rate *= (1 + gd101 * (insightLvs[t] || 0) / 100);
  rate *= _getKaleiMultiTot(t);
  return rate;
}

function getInsightExpPerObs(obsIdx) {
  let count = 0;
  for (const m of magData) { if (m.type === 1 && m.slot === obsIdx) count++; }
  if (count === 0) return 0;
  const insightBonus = getGridBonusFinal(92) + getGridBonusFinal(91);
  let rate = 3 * count * (1 + insightBonus / 100);
  rate *= _getKaleiMultiTot(obsIdx);
  return rate;
}

function getResearchExpRequired() {
  return researchExpReq(researchLevel, serverVarResXP);
}


// ===== SHAPE POLYGON =====
function computeShapePolygon(shapeIdx) {
  const pos = shapePositions[shapeIdx];
  if (!pos) return null;
  const verts = SHAPE_VERTICES[shapeIdx];
  const dims = SHAPE_DIMS[shapeIdx];
  if (!verts || !dims) return null;
  const cx = dims[0] / 2, cy = dims[1] / 2;
  const angle = (pos.rot || 0) * Math.PI / 180;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  return verts.map(([vx, vy]) => {
    const dx = vx - cx, dy = vy - cy;
    return [Math.round(cx + pos.x + dx * cosA - dy * sinA),
            Math.round(cy + pos.y + dx * sinA + dy * cosA)];
  });
}


// ===== TOOLTIP HELPERS =====
export function showGridTooltip(e, idx, overlayOverride) {
  const tt = document.getElementById('tooltip');
  const info = RES_GRID_RAW[idx];
  if (!info) return;
  const lv = gridLevels[idx] || 0;
  const bonus = getGridBonus(idx);
  const finalBonus = getGridBonusFinal(idx);
  const ov = overlayOverride || shapeOverlay;
  const si = ov[idx];

  let html = '<div class="tt-name">' + gridCoord(idx) + ' - ' + info[0].replace(/_/g,' ') + '</div>';
  html += '<div class="tt-lv">Level: ' + lv + ' / ' + info[1] + '</div>';
  html += '<div class="tt-bonus">Base: ' + bonus.toFixed(1) + '</div>';
  if (si >= 0) {
    const afterShape = bonus * (1 + SHAPE_BONUS_PCT[si] / 100);
    html += '<div class="tt-shape" style="color:' + SHAPE_COLORS[si] + '">' + SHAPE_NAMES[si] + ' (+' + SHAPE_BONUS_PCT[si] + '%): ' + afterShape.toFixed(1) + '</div>';
  }
  if (allBonusMulti !== 1) {
    html += '<div style="color:var(--cyan)">Grid AllMulti (x' + allBonusMulti.toFixed(2) + '): ' + finalBonus.toFixed(1) + '</div>';
  } else if (si < 0 && bonus > 0) {
    html += '<div style="color:var(--gold)">Final: ' + finalBonus.toFixed(1) + '</div>';
  }
  html += '<div class="tt-desc">' + _formatDesc(idx) + '</div>';

  // Next level preview
  const maxLv = info[1];
  if (lv < maxLv) {
    html += '<div style="margin-top:4px;border-top:1px solid #444;padding-top:4px;color:#aaa;font-size:.9em;">';
    html += '<span style="color:var(--cyan)">LV ' + (lv+1) + ':</span> ' + _formatDesc(idx, lv + 1);
    html += '</div>';
  } else if (lv > 0) {
    html += '<div style="margin-top:4px;border-top:1px solid #444;padding-top:4px;color:#666;font-size:.9em;">Max level</div>';
  }

  tt.innerHTML = html;
  tt.style.display = 'block';
  moveTooltip(e);
}

export function hideTooltip() {
  document.getElementById('tooltip').style.display = 'none';
}
export function moveTooltip(e) {
  const tt = document.getElementById('tooltip');
  tt.style.left = (e.clientX + 14) + 'px';
  tt.style.top = (e.clientY + 14) + 'px';
}
export function attachTooltip(el, showFn) {
  el.addEventListener('mouseenter', showFn);
  el.addEventListener('mouseleave', hideTooltip);
  el.addEventListener('mousemove', moveTooltip);
}
function showObsTooltip(e, obsIdx, mags, monos, kaleis, adjKal) {
  const tt = document.getElementById('tooltip');
  const occ = OCC_DATA[obsIdx];
  const name = occ ? occ.name.replace(/_/g, ' ') : 'Obs #' + obsIdx;
  const lv = insightLvs[obsIdx] || 0;
  const t = obsIdx;

  const basePerMag = obsBaseExp(t);
  const gd101 = getGridBonusFinal(93);
  const gd101Multi = 1 + gd101 * lv / 100;
  const kalBase = getKaleiMultiBase();
  const kalMulti = 1 + adjKal * kalBase;
  const perMagFinal = basePerMag * gd101Multi * kalMulti;
  const totalExp = perMagFinal * mags;

  const insightBonus = getGridBonusFinal(92) + getGridBonusFinal(91);
  const monoRate = 3 * (1 + insightBonus / 100) * kalMulti;

  let html = '<div class="tt-name">' + name + ' (#' + obsIdx + ')</div>';
  html += '<div class="tt-lv">Insight LV: ' + lv + '</div>';
  html += '<div style="margin-top:4px;border-top:1px solid #555;padding-top:4px;">';
  html += '<div style="color:#aaa">Base EXP/mag: <span style="color:var(--text)">' + basePerMag.toFixed(2) + '</span></div>';
  if (gd101 > 0) html += '<div style="color:#aaa">GD101 (x' + gd101.toFixed(1) + '% x LV ' + lv + '): <span style="color:var(--text)">x' + gd101Multi.toFixed(3) + '</span></div>';
  if (adjKal > 0) html += '<div style="color:#aaa">Kalei (' + adjKal + ' adj x ' + (kalBase*100).toFixed(1) + '%): <span style="color:var(--cyan)">x' + kalMulti.toFixed(3) + '</span></div>';
  html += '<div style="color:#aaa">Per magnifier: <span style="color:var(--green)">' + perMagFinal.toFixed(2) + '</span></div>';
  const resMulti = simTotalExp().multi;
  const totalFinal = totalExp * resMulti;
  if (mags > 0) {
    html += '<div style="color:var(--green);font-weight:700">Obs EXP/hr: ' + totalExp.toFixed(1) + ' (' + mags + ' mag' + (mags>1?'s':'') + ')</div>';
    html += '<div style="color:#aaa">ResearchEXPmulti: <span style="color:var(--cyan)">x' + resMulti.toFixed(2) + '</span></div>';
    html += '<div style="color:var(--green);font-weight:700">Final EXP/hr: ' + totalFinal.toFixed(1) + '</div>';
  } else html += '<div style="color:#666">No magnifiers assigned</div>';
  html += '</div>';
  if (monos > 0 || kaleis > 0) {
    html += '<div style="margin-top:4px;border-top:1px solid #555;padding-top:4px;">';
    if (monos > 0) html += '<div style="color:var(--purple)">Insight/hr: ' + (monoRate * monos).toFixed(2) + ' (' + monos + ' mono x ' + monoRate.toFixed(2) + ')</div>';
    if (kaleis > 0) html += '<div style="color:var(--cyan)">Kaleidoscopes on slot: ' + kaleis + '</div>';
    html += '</div>';
  }

  tt.innerHTML = html;
  tt.style.display = 'block';
  moveTooltip(e);
}

// ===== EXP BREAKDOWN TREE =====
function _bNode(label, val, children, opts) {
  return { label, val: val || 0, children: children || null, fmt: opts?.fmt || 'raw', note: opts?.note || '' };
}

function _gbNode(idx, label, opts) {
  const info = RES_GRID_RAW[idx];
  if (!info) return _bNode(label || 'Grid #' + idx, 0, null, opts);
  const lv = gridLevels[idx] || 0;
  const bonusPerLv = info[2];
  const base = bonusPerLv * lv;
  const si = shapeOverlay[idx];
  const hasShape = si >= 0 && si < SHAPE_BONUS_PCT.length;
  const shapePct = hasShape ? SHAPE_BONUS_PCT[si] : 0;
  const shapeMult = 1 + shapePct / 100;
  const final = base * shapeMult * allBonusMulti;
  const coord = gridCoord(idx);
  const comp55val = companionIds.has(55) ? 15 : 0;
  const comp0owned = companionIds.has(0);
  const comp0val = comp0owned && cachedComp0DivOk && (gridLevels[173] || 0) > 0 ? 5 : 0;
  return _bNode(label || 'Grid ' + coord + ': ' + (info[1] || '#' + idx), final, [
    _bNode('Bonus', base, [
      _bNode('Base', bonusPerLv, null, { fmt: '%' }),
      _bNode('Level', lv, null, { fmt: 'x' })
    ], { fmt: '%' }),
    _bNode('Shape Bonus' + (hasShape ? ' (' + SHAPE_NAMES[si] + ')' : ''), shapeMult, null, { fmt: 'x', note: hasShape ? '' : 'No shape' }),
    _bNode('All Bonus Multi', allBonusMulti, [
      _bNode('Pirate Deckhand', comp55val, null, { fmt: '%' }),
      _bNode('Grid ' + gridCoord(173) + ': Divine Design', comp0val, null, { fmt: '%', note: comp0owned ? (cachedComp0DivOk ? ((gridLevels[173]||0) > 0 ? '' : 'Node LV 0') : 'Doot divine < 2') : 'Doot not owned' })
    ], { fmt: 'x' })
  ], opts);
}

function buildExpBreakdownTree() {
  const ext = extBonuses || computeExternalBonuses();
  const rate = simTotalExp();
  const occTBF = computeOccurrencesToBeFound(researchLevel, occFound);
  const addChildren = [];

  // Grid-based additive bonuses
  const gridExpSquares = [
    { idx: 50, name: 'Pts Every Ten' },
    { idx: 90, name: 'Observationalistic' },
    { idx: 110, name: 'All Night Studying' },
    { idx: 31, name: 'Smart Eye' }
  ];
  for (const sq of gridExpSquares) {
    addChildren.push(_gbNode(sq.idx, 'Grid ' + gridCoord(sq.idx) + ': ' + sq.name, { fmt: '%' }));
  }

  // Grid 112 x occFoundCount
  let occFoundCount = 0;
  for (let i = 0; i < occTBF; i++) if ((occFound[i] || 0) >= 1) occFoundCount++;
  const gb112raw = getGridBonusFinal(112);
  addChildren.push(_bNode('Grid ' + gridCoord(112) + ': See Em All', gb112raw * occFoundCount, [
    _gbNode(112, 'Per-Insight Level', { fmt: '%' }),
    _bNode('Total Insight Level', occFoundCount, null, { fmt: 'x' })
  ], { fmt: '%' }));

  // Grid 94 x totalObsLV
  const totalObsLV = getTotalObsLVs();
  const gb94raw = getGridBonusFinal(94);
  addChildren.push(_bNode('Grid ' + gridCoord(94) + ': Game Design 102', gb94raw * totalObsLV, [
    _gbNode(94, 'Per-Level Value', { fmt: '%' }),
    _bNode('Total Obs Levels', totalObsLV, null, { fmt: 'x' })
  ], { fmt: '%' }));

  // ---- External sources ----
  // Sticker
  const stkLv = research?.[9]?.[1] || 0;
  const stkBase = STICKER_BASE[1] || 5;
  const boonyCount = research?.[11]?.length || 0;
  const gb68val = getGridBonusFinal(68);
  const gb68mode2 = gb68val * boonyCount;
  const evShop37 = eventShopOwned(37);
  const stkCrownMulti = 1 + (gb68mode2 + 30 * evShop37) / 100;
  const stkSB62 = 1 + 20 * superBitType(62) / 100;
  addChildren.push(_bNode('Farming: Laissez Maize Sticker', ext.sticker?.val || 0, [
    _bNode('Sticker', stkBase * stkLv, [
      _bNode('Base', stkBase, null, { fmt: '%' }),
      _bNode('Count', stkLv, null, { fmt: 'x' })
    ], { fmt: '%', note: 'Base x Count' }),
    _bNode('Crown Multi', stkCrownMulti, [
      _bNode('Grid I4: Boony Crowns x King Rat Crowns', gb68mode2, [
        _gbNode(68, 'Grid I4: Boony Crowns'),
        _bNode('King Rat Crowns', boonyCount)
      ]),
      _bNode('Rift Guy Sticker', 30 * evShop37, null, { fmt: '%' })
    ], { fmt: 'x' }),
    _bNode('Super Bit: Bettah Stickahs', stkSB62, null, { fmt: 'x' }),
  ], { fmt: '%' }));

  // Dancing Coral
  const tower22 = towerData[22] || 0;
  const dcBase = DANCING_CORAL_BASE[4] || 3;
  const dcProgress = Math.max(0, tower22 - 200);
  addChildren.push(_bNode('Clover Shrine', ext.dancingCoral?.val || 0, [
    _bNode('Base', dcBase, null, { fmt: '%' }),
    _bNode('Level', dcProgress, null, { fmt: 'x' })
  ], { fmt: '%' }));

  // Zenith Market
  const zmLevel = spelunkData?.[45]?.[8] || 0;
  addChildren.push(_bNode('Zenith Market', ext.zenithMarket?.val || 0, null, { fmt: '%' }));

  // Cards
  const clvW7b1 = computeCardLv('w7b1');
  const clvW7b4 = computeCardLv('w7b4');
  addChildren.push(_bNode('Card: Trench Fish', ext.cardW7b1?.val || 0, null, { fmt: '%' }));
  addChildren.push(_bNode('Card: Eggroll', ext.cardW7b4?.val || 0, null, { fmt: '%' }));

  // Prehistoric Set
  addChildren.push(_bNode('Prehistoric Set', ext.prehistoricSet?.val || 0, null, { fmt: '%' }));

  // Slabbo
  const hasSB34 = superBitType(34);
  const c1len = cards1Data.length || 0;
  const slabboBase = Math.floor(Math.max(0, c1len - 1300) / 5);
  const slabboMF15 = mainframeBonus(15);
  const slabboMeritoc23 = computeMeritocBonusz(23);
  const slabboLegend28 = legendPTSbonus(28);
  const slabboMult = (1 + slabboMF15 / 100) * (1 + slabboMeritoc23 / 100) * (1 + slabboLegend28 / 100);
  addChildren.push(_bNode('Slab Bonus', ext.slabbo?.val || 0, hasSB34 ? [
    _bNode('Base (' + c1len + ')', slabboBase * 0.1, null, { fmt: '%', note: 'floor((Item Count - 1300) / 5) x 0.1' }),
    _bNode('Multiplier', slabboMult, [
      _bNode('Slab Sovereignty', 1 + slabboMF15 / 100, null, { fmt: 'x' }),
      _bNode('Slab Meritocracy', 1 + slabboMeritoc23 / 100, null, { fmt: 'x' }),
      _bNode('+1 Slab', 1 + slabboLegend28 / 100, null, { fmt: 'x' })
    ], { fmt: 'x' })
  ] : null, { fmt: '%', note: hasSB34 ? '' : 'Slabby Research locked' }));

  // Arcade
  addChildren.push(_bNode('Arcade: Research XP', ext.arcade?.val || 0, null, { fmt: '%' }));

  // Meal (Giga Chip) - deep decomposition
  const mealLv = mealsData?.[0]?.[72] || 0;
  const ribT = ribbonData[100] || 0;
  const ribBon = ribbonBonusAt(100);
  const mfb116 = mainframeBonus(116);
  const shinyS20 = computeShinyBonusS(20);
  const winBon26 = computeWinBonus(26);
  const cookMulti = (1 + (mfb116 + shinyS20) / 100) * (1 + winBon26 / 100);

  // WinBonus(26) decomposition
  const swb = computeSummWinBonus();
  const swbRaw = swb[26] || 0;
  const pristine8 = (ninjaData?.[107]?.[8] === 1) ? 30 : 0;
  const gemItems11 = Number(gemItemsData[11]) || 0;
  const artRarity = Number(sailingData?.[3]?.[32]) || 0;
  const artBonus32 = artRarity > 0 ? (ARTIFACT_BASE[32] || 25) * artRarity : 0;
  const taskVal = Math.min(10, Number(tasksGlobalData?.[2]?.[5]?.[4]) || 0);
  const wb31 = swb[31] || 0;
  const empBon8 = computeEmperorBon(8);
  const godshardSet = String(olaData[379] || '').includes('GODSHARD_SET') ? GODSHARD_SET_BONUS : 0;
  const ach379 = achieveStatus(379);
  const ach373 = achieveStatus(373);

  const winBonNode = _bNode('Summoning Win Bonus', 1 + winBon26 / 100, [
    _bNode('Summon Wins', swbRaw, null, { fmt: '%' }),
    _bNode('Sneaking: Crystal Comb', 1 + pristine8 / 100, null, { fmt: 'x' }),
    _bNode('Gem Shop: King of All Winners', 1 + 10 * gemItems11 / 100, null, { fmt: 'x' }),
    _bNode('Winner Multi', 1 + (artBonus32 + taskVal + ach379 + ach373 + wb31 + empBon8 + godshardSet) / 100, [
      _bNode('Sailing: The Winz Lantern', artBonus32, null, { fmt: '%' }),
      _bNode('Task Shop', taskVal, null, { fmt: '%' }),
      _bNode('Achievement: Spectre Stars', ach379, null, { fmt: '%' }),
      _bNode('Achievement: Regalis My Beloved', ach373, null, { fmt: '%' }),
      _bNode('Win Bonus: xN Winner Bonuses', wb31, null, { fmt: '%' }),
      _bNode('Emperor: Winner Bonuses', empBon8, null, { fmt: '%' }),
      _bNode('Godshard Set', godshardSet, null, { fmt: '%' })
    ], { fmt: 'x' })
  ], { fmt: 'x' });

  const hasEmpSet = String(olaData[379] || '').includes('EMPEROR_SET');
  const empTermVal = hasEmpSet ? Math.floor(ribT / 4) * (EMPEROR_SET_BONUS_VAL / 4) : 0;

  const ribBase = ribT > 0 ? Math.floor(5 * ribT + Math.floor(ribT / 2) * (4 + 6.5 * Math.floor(ribT / 5))) : 0;

  addChildren.push(_bNode('Meal: Giga Chip', ext.meal?.val || 0, [
    _bNode('Meal Value', 0.01 * mealLv, [
      _bNode('Base', 0.01, null, { fmt: '%' }),
      _bNode('Levels', mealLv, null, { fmt: 'x' })
    ], { fmt: '%' }),
    _bNode('Ribbon', ribBon, [
      _bNode('Ribbon Base (T' + ribT + ')', ribBase, null, { fmt: '%', note: 'floor(5T + floor(T/2) x (4 + 6.5 x floor(T/5)))' }),
      _bNode('Emperor Set', empTermVal, null, { fmt: '%' })
    ], { fmt: 'x' }),
    _bNode('Meal Multi', cookMulti, [
      _bNode('Cooking Multi', 1 + (mfb116 + shinyS20) / 100, [
        _bNode('Black Diamond Rhinestone', mfb116, null, { fmt: '%' }),
        _bNode('Shiny: Meal Bonus', shinyS20, null, { fmt: '%' })
      ], { fmt: 'x' }),
      winBonNode
    ], { fmt: 'x' })
  ], { fmt: '%' }));

  // Crop Scientist
  const hasEmp44 = emporiumBonus(44);
  const cropRaw = hasEmp44 ? Math.floor(Math.max(0, (farmCropCount - 200) / 10)) : 0;
  const mf17 = mainframeBonus(17);
  const gub22 = grimoireUpgBonus22();
  const exo40 = exoticBonusQTY40();
  const cropSCmulti = (1 + mf17 / 100) * (1 + (gub22 + exo40) / 100);
  addChildren.push(_bNode('Crop Scientist', ext.cropSC?.val || 0, hasEmp44 ? [
    _bNode('Base (' + farmCropCount + ')', cropRaw, null, { fmt: '%', note: 'floor((Crops - 200) / 10)' }),
    _bNode('Multi', cropSCmulti, [
      _bNode('Depot Studies PhD', 1 + mf17 / 100, null, { fmt: 'x' }),
      _bNode('Crop Research Multi', 1 + (gub22 + exo40) / 100, [
        _bNode('Superior Crop Research', gub22, null, { fmt: '%' }),
        _bNode('Scienterrific', exo40, null, { fmt: '%' })
      ], { fmt: 'x' })
    ], { fmt: 'x' })
  ] : null, { fmt: '%', note: hasEmp44 ? '' : 'Science Chalk locked' }));

  // MSA
  const hasSB44 = superBitType(44);
  const tdWaves = Array.isArray(totemInfoData[0]) ? totemInfoData[0] : [];
  const tdNames = ['W1: Forest Outskirts', 'W2: Up Up Down Down', 'W1: The Roots', 'W3: Rollin\' Tundra', 'W4: Mountainous Deugh', 'W5: OJ Bay', 'W6: Above the Clouds', 'W7: Puffpuff Overpass'];
  const gamingStars = tdWaves.reduce(function(a,v) { return a + (Number(v)||0); }, 0);
  const msaEff = Math.max(0, Math.floor((gamingStars - 300) / 10));
  const tdChildren = [];
  for (var ti = 0; ti < tdWaves.length; ti++) {
    if (!tdNames[ti]) continue;
    tdChildren.push(_bNode(tdNames[ti], Number(tdWaves[ti]) || 0));
  }
  addChildren.push(_bNode('MSA Bonus', ext.msa?.val || 0, hasSB44 ? [
    _bNode('Total Waves', gamingStars, tdChildren)
  ] : null, { fmt: '%', note: hasSB44 ? 'floor((Total Waves - 300) / 10) x 0.3' : 'MSA Research locked' }));

  // Lore / Tome
  const loreEpisodes = spelunkData?.[13]?.[2] || 0;
  if (loreEpisodes > 7 && totalTomePoints > 0) {
    const g17 = grimoireData?.[17] || 0;
    const trollSet = String(olaData[379] || '').includes('TROLL_SET') ? 25 : 0;
    const loreMult = 1 + (g17 + trollSet) / 100;
    const x = Math.floor(Math.max(0, totalTomePoints - 16000) / 100);
    const xp = Math.pow(x, 0.7);
    const decayVal = 20 * Math.max(0, xp / (25 + xp));
    addChildren.push(_bNode('Tome Bonus', ext.loreEpi?.val || 0, [
      _bNode('Base', decayVal, [
        _bNode('Scaled Points (' + totalTomePoints + ')', x, null, { note: 'floor((Tome Points - 16000) / 100)' })
      ], { fmt: '%', note: '20 x Scaled^0.7 / (25 + Scaled^0.7)' }),
      _bNode('Tome Multi', loreMult, [
        _bNode('DB: Grey Tome Book', g17, null, { fmt: '%' }),
        _bNode('Troll Set', trollSet, null, { fmt: '%' })
      ], { fmt: 'x' })
    ], { fmt: '%' }));
  } else {
    addChildren.push(_bNode('Tome Bonus', ext.loreEpi?.val || 0, null, {
      fmt: '%', note: loreEpisodes <= 7 ? 'Need 8+ lore episodes' : 'No tome points'
    }));
  }

  // Sort additive by value descending
  addChildren.sort(function(a, b) { return b.val - a.val; });
  let additiveTotal = 0;
  for (const c of addChildren) additiveTotal += c.val;
  const additiveNode = _bNode('Additive Bonus', additiveTotal, addChildren, { fmt: '%' });

  // ---- Multiplicative ----
  const takinNotesVal = getGridBonusFinal(70);

  const comp52val = ext._comp52?.val || 0;
  const jellyNode = _bNode('Jellofish', 1 + comp52val, null, { fmt: 'x', note: comp52val > 0 ? 'Owned' : 'Not owned' });

  // ---- Build root with flat structure: obs base (leaf), additive group, multi group ----
  const finalMulti = (1 + additiveTotal / 100) * (1 + takinNotesVal / 100) * Math.max(1, 1 + comp52val);

  // Root children: obs base summary, then additive sources, then multipliers
  const rootChildren = [];
  rootChildren.push(_bNode('Observation Base', rate.obsBase, null, { fmt: '/hr' }));
  rootChildren.push(additiveNode);
  var tnNode = _gbNode(70, "Takin' Notes");
  tnNode.val = 1 + takinNotesVal / 100;
  tnNode.fmt = 'x';
  rootChildren.push(tnNode);
  rootChildren.push(jellyNode);
  rootChildren.push(_bNode('Final Multiplier', finalMulti, null, { fmt: 'x' }));

  return _bNode('Total EXP/hr', rate.total, rootChildren, { fmt: '/hr' });
}

function renderBreakdownTree(root, container) {
  var idCounter = 0;

  function fmtNodeVal(node) {
    var v = node.val;
    if (node.fmt === '/hr') return fmtVal(v) + '/hr <span style="color:var(--text2);font-size:.85em">(' + fmtExact(v) + ')</span>';
    if (node.fmt === '%') return '+' + parseFloat(v.toFixed(2)) + '%';
    if (node.fmt === 'x') return '\u00d7' + parseFloat(v.toFixed(4));
    if (Number.isInteger(v)) return String(v);
    return parseFloat(v.toFixed(4));
  }

  function valColor(node) {
    if (node.fmt === '/hr') return 'var(--green)';
    if (node.fmt === '%') return 'var(--purple)';
    if (node.fmt === 'x') return 'var(--cyan)';
    return 'var(--text1)';
  }

  function buildHtml(node, depth) {
    var id = 'bt-' + (idCounter++);
    var has = node.children && node.children.length > 0;
    var pad = depth * 18;
    // depth 0 = root (Total), depth 1 = additive group / multipliers - start expanded
    var startOpen = depth <= 1;
    var arrow = has ? '<span class="bt-arrow" data-id="' + id + '">' + (startOpen ? '\u25be' : '\u25b8') + '</span>' : '<span style="display:inline-block;width:14px;"></span>';
    var cls = 'bt-row';
    if (depth === 0) cls += ' bt-root';
    var noteAttr = node.note ? ' data-bt-note="' + node.note.replace(/"/g, '&quot;') + '"' : '';
    var html = '<div class="' + cls + '"' + noteAttr + ' style="padding-left:' + pad + 'px;" data-depth="' + depth + '">';
    html += arrow;
    html += '<span class="bt-label">' + node.label + '</span>';
    if (node.note) html += '';
    html += '<span class="bt-val" style="color:' + valColor(node) + '">' + fmtNodeVal(node) + '</span>';
    html += '</div>';
    if (has) {
      html += '<div class="bt-children" id="' + id + '" style="' + (startOpen ? '' : 'display:none;') + '">';
      for (var ci = 0; ci < node.children.length; ci++) {
        html += buildHtml(node.children[ci], depth + 1);
      }
      html += '</div>';
    }
    return html;
  }

  var html = '<div class="bt-controls"><button class="btn btn-sm bt-expand-all">Expand All</button><button class="btn btn-sm bt-collapse-all">Collapse All</button></div>';
  html += '<div class="bt-tree">' + buildHtml(root, 0) + '</div>';
  container.innerHTML = html;

  // Toggle handlers - use onclick to avoid stacking on re-render
  container.onmouseover = function(e) {
    var row = e.target.closest('.bt-row[data-bt-note]');
    if (!row) return;
    var tt = document.getElementById('tooltip');
    tt.innerHTML = '<div class="tt-desc">' + row.getAttribute('data-bt-note') + '</div>';
    tt.style.display = 'block';
    moveTooltip(e);
  };
  container.onmousemove = function(e) {
    var row = e.target.closest('.bt-row[data-bt-note]');
    if (row) moveTooltip(e);
  };
  container.onmouseout = function(e) {
    var row = e.target.closest('.bt-row[data-bt-note]');
    if (row && !row.contains(e.relatedTarget)) hideTooltip();
  };
  container.onclick = function(e) {
    if (e.target.closest('.bt-controls')) return;
    var row = e.target.closest('.bt-row');
    if (!row) return;
    var arrow = row.querySelector('.bt-arrow');
    if (!arrow) return;
    var targetId = arrow.dataset.id;
    var childDiv = document.getElementById(targetId);
    if (!childDiv) return;
    var open = childDiv.style.display !== 'none';
    childDiv.style.display = open ? 'none' : '';
    arrow.textContent = open ? '\u25b8' : '\u25be';
  };

  var expandBtn = container.querySelector('.bt-expand-all');
  var collapseBtn = container.querySelector('.bt-collapse-all');
  if (expandBtn) expandBtn.onclick = function(e) {
    e.stopPropagation();
    container.querySelectorAll('.bt-children').forEach(function(el) { el.style.display = ''; });
    container.querySelectorAll('.bt-arrow').forEach(function(el) { el.textContent = '\u25be'; });
  };
  if (collapseBtn) collapseBtn.onclick = function(e) {
    e.stopPropagation();
    container.querySelectorAll('.bt-children').forEach(function(el) { el.style.display = 'none'; });
    container.querySelectorAll('.bt-arrow').forEach(function(el) { el.textContent = '\u25b8'; });
  };
}

// ===== RENDER: DASHBOARD =====
export function renderDashboard() {
  // Summary
  const sumDiv = document.getElementById('dash-summary');
  const curRate = simTotalExp();
  const afkRate = cachedAFKRate || computeAFKGainsRate();
  const expReq = getResearchExpRequired();
  const expCur = getResearchCurrentExp();
  const timeToNext = curRate.total > 0 ? (expReq - expCur) / curRate.total : Infinity;
  sumDiv.innerHTML = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;justify-content:center;padding:12px;">
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">Research Level</div><div style="color:var(--gold);font-size:1.4em;font-weight:700;">${researchLevel}</div></div>
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">EXP/hr</div><div style="color:var(--green);font-size:1.4em;font-weight:700;">${fmtVal(curRate.total)}</div><div style="color:var(--text2);font-size:.7em;">${fmtExact(curRate.total)}</div></div>
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">Time to Next LV</div><div style="color:var(--cyan);font-size:1.4em;font-weight:700;">${fmtTime(timeToNext)}</div></div>
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">AFK Rate</div><div style="color:var(--text);font-size:1.4em;font-weight:700;">${(afkRate.rate * 100).toFixed(1)}%</div></div>
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">Magnifiers</div><div style="color:var(--blue);font-size:1.4em;font-weight:700;">${magnifiersOwned}</div></div>
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">Max/Slot</div><div style="color:var(--blue);font-size:1.4em;font-weight:700;">${magMaxPerSlot}</div></div>
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">Grid Points</div><div style="color:var(--gold);font-size:1.4em;font-weight:700;">${computeGridPointsAvailable()} free</div></div>
    </div>
    <div style="max-width:420px;margin:8px auto 4px;padding:0 12px;">
      <div style="height:22px;background:#1a1a2e;border-radius:11px;overflow:hidden;border:1px solid #333;">
        <div style="height:100%;width:${expReq > 0 ? Math.min(100, expCur / expReq * 100) : 0}%;background:linear-gradient(90deg,#e0e0e0,#fff);border-radius:11px;transition:width .3s;"></div>
      </div>
      <div style="text-align:center;font-size:.8em;font-weight:600;color:#fff;margin-top:4px;">Exp ${fmtVal(expCur)} / ${fmtVal(expReq)}</div>
    </div>`;

  // Grid - DOM-based with shape overlays, coordinate names, tooltips
  const gridDiv = document.getElementById('dash-grid');
  gridDiv.innerHTML = '';

  const COLS = GRID_COLS;

  for (let i = 0; i < GRID_SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    const info = RES_GRID_RAW[i];
    if (info) {
      const lv = gridLevels[i] || 0;
      const maxLv = info[1];
      cell.classList.add('active');
      if (lv >= maxLv) cell.classList.add('maxed');
      cell.innerHTML = '<div class="cell-name">' + gridCoord(i) + '</div>' +
        '<div class="cell-lv">' + lv + '/' + maxLv + '</div>';
      attachTooltip(cell, (ev) => showGridTooltip(ev, i));
    } else {
      cell.classList.add('empty');
    }

    // Shape overlay - connected borders
    const si = shapeOverlay[i];
    if (si >= 0) {
      const color = SHAPE_COLORS[si];
      const col = i % COLS;
      const top = !sameShapeCell(shapeOverlay, i, i - COLS);
      const bottom = !sameShapeCell(shapeOverlay, i, i + COLS);
      const left = col > 0 ? !sameShapeCell(shapeOverlay, i, i - 1) : true;
      const right = col < COLS - 1 ? !sameShapeCell(shapeOverlay, i, i + 1) : true;
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:.5;'
        + 'background:' + color + '22;'
        + 'border-top:' + (top ? '2px solid ' + color : 'none') + ';'
        + 'border-bottom:' + (bottom ? '2px solid ' + color : 'none') + ';'
        + 'border-left:' + (left ? '2px solid ' + color : 'none') + ';'
        + 'border-right:' + (right ? '2px solid ' + color : 'none') + ';'
        + 'border-radius:' + (top && left ? '3px' : '0') + ' ' + (top && right ? '3px' : '0') + ' ' + (bottom && right ? '3px' : '0') + ' ' + (bottom && left ? '3px' : '0') + ';';
      cell.appendChild(overlay);
    }

    gridDiv.appendChild(cell);
  }

  // SVG shape polygon overlay
  const activeShapes = new Set();
  for (let i = 0; i < shapeOverlay.length; i++) {
    if (shapeOverlay[i] >= 0) activeShapes.add(shapeOverlay[i]);
  }
  if (activeShapes.size > 0) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.classList.add('shape-svg');
    svg.setAttribute('viewBox', '15 24 600 360');
    svg.setAttribute('preserveAspectRatio', 'none');
    // Allow pointer events on shape polygons but pass through elsewhere
    svg.style.pointerEvents = 'none';
    for (const si of activeShapes) {
      const poly = computeShapePolygon(si);
      if (!poly) continue;

      // Compute bounding box of the polygon
      let bxMin = Infinity, bxMax = -Infinity, byMin = Infinity, byMax = -Infinity;
      for (const [px, py] of poly) {
        if (px < bxMin) bxMin = px; if (px > bxMax) bxMax = px;
        if (py < byMin) byMin = py; if (py > byMax) byMax = py;
      }

      // Bounding box rect (hidden by default)
      const bbox = document.createElementNS(svgNS, 'rect');
      bbox.setAttribute('x', bxMin);
      bbox.setAttribute('y', byMin);
      bbox.setAttribute('width', bxMax - bxMin);
      bbox.setAttribute('height', byMax - byMin);
      bbox.setAttribute('fill', 'none');
      bbox.setAttribute('stroke', SHAPE_COLORS[si]);
      bbox.setAttribute('stroke-width', '1.5');
      bbox.setAttribute('stroke-dasharray', '4 3');
      bbox.setAttribute('opacity', '0');
      bbox.setAttribute('rx', '2');
      svg.appendChild(bbox);

      // Shape polygon (interactive)
      const points = poly.map(([x,y]) => x + ',' + y).join(' ');
      const el = document.createElementNS(svgNS, 'polygon');
      el.setAttribute('points', points);
      el.setAttribute('fill', SHAPE_COLORS[si] + '08');
      el.setAttribute('stroke', SHAPE_COLORS[si]);
      el.setAttribute('stroke-width', '2');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('opacity', '0.7');
      el.style.pointerEvents = 'fill';
      el.style.cursor = 'pointer';
      el.addEventListener('mouseenter', function() { bbox.setAttribute('opacity', '0.6'); });
      el.addEventListener('mouseleave', function() { bbox.setAttribute('opacity', '0'); });
      svg.appendChild(el);
    }
    gridDiv.appendChild(svg);
  }

  // Shape legend with rasterized footprints
  if (activeShapes.size > 0) {
    const legend = document.createElement('div');
    legend.style.cssText = 'margin-top:6px;display:flex;flex-wrap:wrap;gap:8px 16px;';
    const sortedShapes = Array.from(activeShapes).sort((a, b) => (SHAPE_BONUS_PCT[b] || 0) - (SHAPE_BONUS_PCT[a] || 0));
    for (const si of sortedShapes) {
      // Collect cells covered by this shape
      const cells = [];
      for (let ci = 0; ci < shapeOverlay.length; ci++) {
        if (shapeOverlay[ci] === si) cells.push(ci);
      }
      if (cells.length === 0) continue;
      const sc = SHAPE_COLORS[si] || '#888';

      // Build bounding box footprint
      let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
      for (const c of cells) {
        const col = c % GRID_COLS, row = Math.floor(c / GRID_COLS);
        if (col < minC) minC = col; if (col > maxC) maxC = col;
        if (row < minR) minR = row; if (row > maxR) maxR = row;
      }
      const cellSet = new Set(cells);
      const w = maxC - minC + 1;
      const sz = 6;
      let fpHtml = '<div style="display:inline-grid;grid-template-columns:repeat(' + w + ',' + sz + 'px);gap:1px;flex-shrink:0;">';
      for (let row = minR; row <= maxR; row++) {
        for (let col = minC; col <= maxC; col++) {
          fpHtml += '<div style="width:' + sz + 'px;height:' + sz + 'px;background:' +
            (cellSet.has(row * GRID_COLS + col) ? sc + '88' : '#1a1a2e') +
            ';border-radius:1px;"></div>';
        }
      }
      fpHtml += '</div>';

      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:.75em;white-space:nowrap;';
      var coordStr = cells.length <= 6
        ? cells.map(c => gridCoord(c)).join(', ')
        : cells.length + ' cells (' + gridCoord(cells[0]) + '\u2013' + gridCoord(cells[cells.length - 1]) + ')';
      item.innerHTML = fpHtml +
        '<span style="color:' + sc + ';font-weight:600;">' + SHAPE_NAMES[si] + '</span>' +
        ' <span style="opacity:.6;">(' + SHAPE_BONUS_PCT[si] + '%)</span>' +
        '<span style="opacity:.5;"> \u2192 </span>' +
        '<span style="opacity:.7;">' + coordStr + '</span>';
      legend.appendChild(item);
    }
    gridDiv.parentNode.insertBefore(legend, gridDiv.nextSibling);
  }

  // Observations - v1-style: 8 cols, full names, text mag indicators, EXP*multi, insight rate, hover tooltip
  const obsDiv = document.getElementById('dash-obs');
  obsDiv.innerHTML = '';
  const occTBF = computeOccurrencesToBeFound(researchLevel, occFound);
  const kalMap = buildKaleiMap();
  const resMulti = simTotalExp().multi;

  for (let i = 0; i < Math.min(occTBF, OCC_DATA.length); i++) {
    const cell = document.createElement('div');
    const found = occFound[i] >= 1;
    cell.className = 'obs-cell ' + (found ? 'found' : 'not-found');

    const name = OCC_DATA[i] ? OCC_DATA[i].name.replace(/_/g,' ') : 'Obs #' + i;
    const lv = insightLvs[i] || 0;

    let mags = 0, monos = 0, kaleis = 0;
    for (const m of magData) {
      if (m.slot === i) {
        if (m.type === 0) mags++;
        else if (m.type === 1) monos++;
        else if (m.type === 2) kaleis++;
      }
    }

    const adjKal = kalMap[i] || 0;
    const expRate = getResearchExpPerObs(i);
    const expFinal = expRate * resMulti;
    const insightRate = getInsightExpPerObs(i);

    let magStr = '';
    if (mags) magStr += '<span style="color:#81c784">M:' + mags + '</span> ';
    if (monos) magStr += '<span style="color:#ce93d8">O:' + monos + '</span> ';
    if (kaleis) magStr += '<span style="color:#4dd0e1">K:' + kaleis + '</span> ';
    if (adjKal) magStr += '<span style="color:#ff9800">Adj:' + adjKal + '</span>';

    cell.innerHTML =
      '<div class="obs-name">' + name + '</div>' +
      '<div class="obs-lv">LV ' + lv + '</div>' +
      '<div class="obs-mag">' + (magStr || '\u2014') + '</div>' +
      '<div class="obs-rate">' + (expFinal > 0 ? fmtVal(expFinal) + ' exp <span style="color:var(--text2);font-size:.85em;">(' + fmtExact(expFinal) + ')</span>' : '') + (insightRate > 0 ? ' | ' + insightRate.toFixed(2) + ' ins' : '') + '</div>';
    attachTooltip(cell, (ev) => showObsTooltip(ev, i, mags, monos, kaleis, adjKal));
    obsDiv.appendChild(cell);
  }

  // EXP Rate Breakdown - nested tree
  const expDiv = document.getElementById('dash-exp-breakdown');
  {
    const tree = buildExpBreakdownTree();
    renderBreakdownTree(tree, expDiv);
  }

  // AFK Rate Breakdown - full source table
  const afkDiv = document.getElementById('dash-afk');
  {
    const CARD_NAMES_AFK = { w7b11: 'Pirate Deckhand' };
    const afkSources = Object.entries(afkRate.parts).map(([k, p]) => {
      let label = p.label;
      if (k === 'cardW7b11') label = 'Card: ' + CARD_NAMES_AFK.w7b11;
      return { label, val: p.val };
    });
    afkSources.sort((a, b) => b.val - a.val);

    let aHtml = '<table class="opt-table"><thead><tr><th>Source</th><th>Value</th></tr></thead><tbody>';
    for (const s of afkSources) {
      aHtml += '<tr><td>' + s.label + '</td>' +
        '<td style="color:' + (s.val > 0 ? 'var(--green)' : 'var(--text2)') + ';font-weight:600">' + (s.val > 0 ? '+' + s.val + '%' : '0') + '</td></tr>';
    }
    aHtml += '<tr style="border-top:2px solid #444;">' +
      '<td style="font-weight:700;">Total:</td>' +
      '<td style="color:var(--gold);font-weight:700;font-size:1.1em;">' + afkRate.pct.toFixed(0) + '%</td></tr>';
    aHtml += '</tbody></table>';
    aHtml += '<div style="margin-top:6px;font-size:.85em;color:var(--text2);">Effective offline EXP/hr: <b style="color:var(--green);">' + fmtVal(curRate.total * Math.min(1, afkRate.rate)) + '</b></div>';
    afkDiv.innerHTML = aHtml;
  }
}
