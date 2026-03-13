// ===== DASH-BREAKDOWNS.JS - EXP, AFK, and Insight breakdown trees =====
// Extracted from dashboard.js.

import { S } from '../state.js';
import { cachedAFKRate } from '../save/data.js';
import {
  ARTIFACT_BASE,
  DANCING_CORAL_BASE,
  EMPEROR_SET_BONUS_VAL,
  GODSHARD_SET_BONUS,
  RES_GRID_RAW,
  SHAPE_BONUS_PCT,
  SHAPE_NAMES,
  STICKER_BASE,
  gridCoord,
} from '../game-data.js';
import {
  gbWith,
  computeOccurrencesToBeFound,
} from '../sim-math.js';
import { simTotalExp } from '../save/context.js';
import { mainframeBonus } from '../save/lab.js';
import {
  achieveStatus,
  computeAFKGainsRate,
  computeCardLv,
  computeEmperorBon,
  computeMeritocBonusz,
  computeShinyBonusS,
  computeSummWinBonus,
  computeWinBonus,
  exoticBonusQTY40,
  grimoireUpgBonus22,
  legendPTSbonus,
} from '../save/external.js';
import { fmtExact, fmtVal } from '../renderers/format.js';
import { hideTooltip, moveTooltip } from './tooltip.js';


// ===== Tree node helpers =====
function _bNode(label, val, children, opts) {
  return { label, val: val || 0, children: children || null, fmt: opts?.fmt || 'raw', note: opts?.note || '' };
}

function _gbNode(idx, label, opts) {
  const info = RES_GRID_RAW[idx];
  if (!info) return _bNode(label || 'Grid #' + idx, 0, null, opts);
  const lv = S.gridLevels[idx] || 0;
  const bonusPerLv = info[2];
  const base = bonusPerLv * lv;
  const si = S.shapeOverlay[idx];
  const hasShape = si >= 0 && si < SHAPE_BONUS_PCT.length;
  const shapePct = hasShape ? SHAPE_BONUS_PCT[si] : 0;
  const shapeMult = 1 + shapePct / 100;
  const final = base * shapeMult * S.allBonusMulti;
  const coord = gridCoord(idx);
  const comp55val = S.companionIds.has(55) ? 15 : 0;
  const comp0owned = S.companionIds.has(0);
  const comp0val = comp0owned && S.cachedComp0DivOk && (S.gridLevels[173] || 0) > 0 ? 5 : 0;
  return _bNode(label || 'Grid ' + coord + ': ' + (info[1] || '#' + idx), final, [
    _bNode('Bonus', base, [
      _bNode('Base', bonusPerLv, null, { fmt: '%' }),
      _bNode('Level', lv, null, { fmt: 'x' })
    ], { fmt: '%' }),
    _bNode('Shape Bonus' + (hasShape ? ' (' + SHAPE_NAMES[si] + ')' : ''), shapeMult, null, { fmt: 'x', note: hasShape ? '' : 'No shape' }),
    _bNode('All Bonus Multi', S.allBonusMulti, [
      _bNode('Pirate Deckhand', comp55val, null, { fmt: '%' }),
      _bNode('Grid ' + gridCoord(173) + ': Divine Design', comp0val, null, { fmt: '%', note: comp0owned ? (S.cachedComp0DivOk ? ((S.gridLevels[173]||0) > 0 ? '' : 'Node LV 0') : 'Doot divine < 2') : 'Doot not owned' })
    ], { fmt: 'x' })
  ], opts);
}


// ===== EXP BREAKDOWN TREE =====
export function buildExpBreakdownTree(dSaveCtx, dCtx, simOpts) {
  const getGridBonusFinal = (idx) => gbWith(dSaveCtx.gridLevels, dSaveCtx.shapeOverlay, idx, dCtx);
  function getTotalObsLVs() {
    let total = 0;
    const occTBF = computeOccurrencesToBeFound(dSaveCtx.researchLevel, dSaveCtx.occFound);
    for (let i = 0; i < occTBF; i++) {
      if ((dSaveCtx.insightLvs[i] || 0) >= 1) total += dSaveCtx.insightLvs[i];
    }
    return total;
  }

  const ext = S.extBonuses;
  if (!ext) return null;
  const rate = simTotalExp(simOpts, dSaveCtx);
  const occTBF = computeOccurrencesToBeFound(dSaveCtx.researchLevel, dSaveCtx.occFound);
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
  for (let i = 0; i < occTBF; i++) if ((S.occFound[i] || 0) >= 1) occFoundCount++;
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
  const stkLv = S.research?.[9]?.[1] || 0;
  const stkBase = STICKER_BASE[1] || 5;
  const boonyCount = S.research?.[11]?.length || 0;
  const gb68val = getGridBonusFinal(68);
  const gb68mode2 = gb68val * boonyCount;
  const evShop37 = dSaveCtx.cachedEvShop37;
  const stkCrownMulti = 1 + (gb68mode2 + 30 * evShop37) / 100;
  const stkSB62 = 1 + 20 * dSaveCtx.sb62 / 100;
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
  const tower22 = S.towerData[22] || 0;
  const dcBase = DANCING_CORAL_BASE[4] || 3;
  const dcProgress = Math.max(0, tower22 - 200);
  addChildren.push(_bNode('Clover Shrine', ext.dancingCoral?.val || 0, [
    _bNode('Base', dcBase, null, { fmt: '%' }),
    _bNode('Level', dcProgress, null, { fmt: 'x' })
  ], { fmt: '%' }));

  // Zenith Market
  const zmLevel = S.spelunkData?.[45]?.[8] || 0;
  addChildren.push(_bNode('Zenith Market', ext.zenithMarket?.val || 0, null, { fmt: '%' }));

  // Cards
  const clvW7b1 = computeCardLv('w7b1');
  const clvW7b4 = computeCardLv('w7b4');
  addChildren.push(_bNode('Card: Trench Fish', ext.cardW7b1?.val || 0, null, { fmt: '%' }));
  addChildren.push(_bNode('Card: Eggroll', ext.cardW7b4?.val || 0, null, { fmt: '%' }));

  // Prehistoric Set
  addChildren.push(_bNode('Prehistoric Set', ext.prehistoricSet?.val || 0, null, { fmt: '%' }));

  // Slabbo
  const hasSB34 = dSaveCtx.sb34;
  const c1len = S.cards1Data.length || 0;
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
  const mealLv = S.mealsData?.[0]?.[72] || 0;
  const ribT = S.ribbonData[100] || 0;
  const ribBon = dSaveCtx.ribbon100;
  const mfb116 = mainframeBonus(116);
  const shinyS20 = computeShinyBonusS(20);
  const winBon26 = computeWinBonus(26);
  const cookMulti = (1 + (mfb116 + shinyS20) / 100) * (1 + winBon26 / 100);

  // WinBonus(26) decomposition
  const swb = computeSummWinBonus();
  const swbRaw = swb[26] || 0;
  const pristine8 = (S.ninjaData?.[107]?.[8] === 1) ? 30 : 0;
  const gemItems11 = Number(S.gemItemsData[11]) || 0;
  const artRarity = Number(S.sailingData?.[3]?.[32]) || 0;
  const artBonus32 = artRarity > 0 ? (ARTIFACT_BASE[32] || 25) * artRarity : 0;
  const taskVal = Math.min(10, Number(S.tasksGlobalData?.[2]?.[5]?.[4]) || 0);
  const wb31 = swb[31] || 0;
  const empBon8 = computeEmperorBon(8);
  const godshardSet = String(S.olaData[379] || '').includes('GODSHARD_SET') ? GODSHARD_SET_BONUS : 0;
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

  const hasEmpSet = String(S.olaData[379] || '').includes('EMPEROR_SET');
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
  const hasEmp44 = dSaveCtx.emp44;
  const cropRaw = hasEmp44 ? Math.floor(Math.max(0, (S.farmCropCount - 200) / 10)) : 0;
  const mf17 = mainframeBonus(17);
  const gub22 = grimoireUpgBonus22();
  const exo40 = exoticBonusQTY40();
  const cropSCmulti = (1 + mf17 / 100) * (1 + (gub22 + exo40) / 100);
  addChildren.push(_bNode('Crop Scientist', ext.cropSC?.val || 0, hasEmp44 ? [
    _bNode('Base (' + S.farmCropCount + ')', cropRaw, null, { fmt: '%', note: 'floor((Crops - 200) / 10)' }),
    _bNode('Multi', cropSCmulti, [
      _bNode('Depot Studies PhD', 1 + mf17 / 100, null, { fmt: 'x' }),
      _bNode('Crop Research Multi', 1 + (gub22 + exo40) / 100, [
        _bNode('Superior Crop Research', gub22, null, { fmt: '%' }),
        _bNode('Scienterrific', exo40, null, { fmt: '%' })
      ], { fmt: 'x' })
    ], { fmt: 'x' })
  ] : null, { fmt: '%', note: hasEmp44 ? '' : 'Science Chalk locked' }));

  // MSA
  const hasSB44 = dSaveCtx.sb44;
  const tdWaves = Array.isArray(S.totemInfoData[0]) ? S.totemInfoData[0] : [];
  const tdNames = ['W1: Forest Outskirts', 'W2: Up Up Down Down', 'W1: The Roots', 'W3: Rollin\' Tundra', 'W4: Mountainous Deugh', 'W5: OJ Bay', 'W6: Above the Clouds', 'W7: Puffpuff Overpass'];
  const gamingStars = tdWaves.reduce(function(a,v) { return a + (Number(v)||0); }, 0);
  const msaEff = Math.max(0, Math.floor((gamingStars - 300) / 10));
  const tdChildren = [];
  for (let ti = 0; ti < tdWaves.length; ti++) {
    if (!tdNames[ti]) continue;
    tdChildren.push(_bNode(tdNames[ti], Number(tdWaves[ti]) || 0));
  }
  addChildren.push(_bNode('MSA Bonus', ext.msa?.val || 0, hasSB44 ? [
    _bNode('Total Waves', gamingStars, tdChildren)
  ] : null, { fmt: '%', note: hasSB44 ? 'floor((Total Waves - 300) / 10) x 0.3' : 'MSA Research locked' }));

  // Lore / Tome
  const loreEpisodes = S.spelunkData?.[13]?.[2] || 0;
  if (loreEpisodes > 7 && S.totalTomePoints > 0) {
    const g17 = S.grimoireData?.[17] || 0;
    const trollSet = String(S.olaData[379] || '').includes('TROLL_SET') ? 25 : 0;
    const loreMult = 1 + (g17 + trollSet) / 100;
    const x = Math.floor(Math.max(0, S.totalTomePoints - 16000) / 100);
    const xp = Math.pow(x, 0.7);
    const decayVal = 20 * Math.max(0, xp / (25 + xp));
    addChildren.push(_bNode('Tome Bonus', ext.loreEpi?.val || 0, [
      _bNode('Base', decayVal, [
        _bNode('Scaled Points (' + S.totalTomePoints + ')', x, null, { note: 'floor((Tome Points - 16000) / 100)' })
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
  const tnNode = _gbNode(70, "Takin' Notes");
  tnNode.val = 1 + takinNotesVal / 100;
  tnNode.fmt = 'x';
  rootChildren.push(tnNode);
  rootChildren.push(jellyNode);
  rootChildren.push(_bNode('Final Multiplier', finalMulti, null, { fmt: 'x' }));

  return _bNode('Total EXP/hr', rate.total, rootChildren, { fmt: '/hr' });
}

// ===== AFK BREAKDOWN TREE =====
export function buildAFKBreakdownTree() {
  const afkRate = cachedAFKRate || computeAFKGainsRate();
  const p = afkRate.parts;
  const addChildren = [];

  // Base 1% (hardcoded in formula: 0.01 + sum/100)
  addChildren.push(_bNode('Base', 1, null, { fmt: '%' }));

  // Companion 28 - RIP Tide
  addChildren.push(_bNode('RIP Tide (Companion)', p.comp28.val, null, { fmt: '%', note: p.comp28.note }));

  // Gambit Milestone 15
  addChildren.push(_bNode('Gambit Milestone', p.gambit15.val, null, { fmt: '%', note: p.gambit15.note }));

  // Minehead floors
  addChildren.push(_bNode('Minehead Floor 2', p.minehead1.val, null, { fmt: '%', note: p.minehead1.note }));
  addChildren.push(_bNode('Minehead Floor 11', p.minehead10.val, null, { fmt: '%', note: p.minehead10.note }));

  // Grid bonuses (with full decomposition)
  const gb71Node = _gbNode(71, 'Powered Down Research');
  gb71Node.fmt = '%';
  addChildren.push(gb71Node);

  const gb111Node = _gbNode(111, 'Research AFK Gains');
  gb111Node.fmt = '%';
  addChildren.push(gb111Node);

  // Sailing artifact
  addChildren.push(_bNode('Ender Pearl (Artifact)', p.sailing36.val, null, { fmt: '%', note: p.sailing36.note }));

  // Card
  addChildren.push(_bNode('Pirate Deckhand Card', p.cardW7b11.val, null, { fmt: '%', note: p.cardW7b11.note }));

  // Sort by value descending
  addChildren.sort(function(a, b) { return b.val - a.val; });

  const capped = afkRate.pct > 100;
  return _bNode('AFK Rate', afkRate.pct, addChildren, { fmt: 'pct', note: capped ? 'Capped at 100%' : '' });
}

// ===== INSIGHT MULTIPLIER BREAKDOWN TREE =====
export function buildInsightBreakdownTree(dSaveCtx, dCtx) {
  const getGridBonusFinal = (idx) => gbWith(dSaveCtx.gridLevels, dSaveCtx.shapeOverlay, idx, dCtx);

  const gb92Node = _gbNode(92, 'Oracular Spectacular');
  gb92Node.fmt = '%';
  const gb91Node = _gbNode(91, 'Optical Monocle');
  gb91Node.fmt = '%';

  const children = [gb92Node, gb91Node];
  children.sort(function(a, b) { return b.val - a.val; });

  const insightBonus = getGridBonusFinal(92) + getGridBonusFinal(91);
  const multi = 1 + insightBonus / 100;
  const totalPerMono = 3 * multi;

  const bonusNode = _bNode('Insight Bonus', insightBonus, children, { fmt: '%' });
  return _bNode('Insight/hr per Monocle', totalPerMono, [
    _bNode('Monocle Base', 3, null, { fmt: '/hr' }),
    bonusNode,
    _bNode('Final Multiplier', multi, null, { fmt: 'x' }),
  ], { fmt: '/hr' });
}

// ===== Tree renderer =====
let _btTreeCounter = 0;
export function resetTreeCounter() { _btTreeCounter = 0; }

export function renderBreakdownTree(root, container) {
  if (!root) { container.innerHTML = ''; return; }
  const prefix = 'bt' + (_btTreeCounter++) + '-';
  let idCounter = 0;

  function fmtNodeVal(node) {
    const v = node.val;
    if (node.fmt === '/hr') return fmtVal(v) + '/hr <span style="color:var(--text2);font-size:.85em">('+fmtExact(v)+')</span>';
    if (node.fmt === 'pct') return parseFloat(v.toFixed(1)) + '%';
    if (node.fmt === '%') return '+' + parseFloat(v.toFixed(2)) + '%';
    if (node.fmt === 'x') return '\u00d7' + parseFloat(v.toFixed(4));
    if (Number.isInteger(v)) return String(v);
    return parseFloat(v.toFixed(4));
  }

  function valColor(node) {
    if (node.fmt === '/hr') return 'var(--green)';
    if (node.fmt === 'pct') return 'var(--green)';
    if (node.fmt === '%') return 'var(--purple)';
    if (node.fmt === 'x') return 'var(--cyan)';
    return 'var(--text1)';
  }

  function buildHtml(node, depth) {
    const id = prefix + (idCounter++);
    const has = node.children && node.children.length > 0;
    const pad = depth * 18;
    // depth 0 = root (Total), depth 1 = additive group / multipliers - start expanded
    const startOpen = depth <= 1;
    const arrow = has ? '<span class="bt-arrow" data-id="' + id + '">' + (startOpen ? '\u25be' : '\u25b8') + '</span>' : '<span style="display:inline-block;width:14px;"></span>';
    let cls = 'bt-row';
    if (depth === 0) cls += ' bt-root';
    const noteAttr = node.note ? ' data-bt-note="' + node.note.replace(/"/g, '&quot;') + '"' : '';
    let html = '<div class="' + cls + '"' + noteAttr + ' style="padding-left:' + pad + 'px;" data-depth="' + depth + '">';
    html += arrow;
    html += '<span class="bt-label">' + node.label + '</span>';
    if (node.note) html += '';
    html += '<span class="bt-val" style="color:' + valColor(node) + '">' + fmtNodeVal(node) + '</span>';
    html += '</div>';
    if (has) {
      html += '<div class="bt-children" id="' + id + '" style="' + (startOpen ? '' : 'display:none;') + '">';
      for (let ci = 0; ci < node.children.length; ci++) {
        html += buildHtml(node.children[ci], depth + 1);
      }
      html += '</div>';
    }
    return html;
  }

  let html = '<div class="bt-controls"><button class="btn btn-sm bt-expand-all">Expand All</button><button class="btn btn-sm bt-collapse-all">Collapse All</button></div>';
  html += '<div class="bt-tree">' + buildHtml(root, 0) + '</div>';
  container.innerHTML = html;

  // Toggle handlers - use onclick to avoid stacking on re-render
  container.onmouseover = function(e) {
    const row = e.target.closest('.bt-row[data-bt-note]');
    if (!row) return;
    const tt = document.getElementById('tooltip');
    tt.innerHTML = '<div class="tt-desc">' + row.getAttribute('data-bt-note') + '</div>';
    tt.style.display = 'block';
    moveTooltip(e);
  };
  container.onmousemove = function(e) {
    const row = e.target.closest('.bt-row[data-bt-note]');
    if (row) moveTooltip(e);
  };
  container.onmouseout = function(e) {
    const row = e.target.closest('.bt-row[data-bt-note]');
    if (row && !row.contains(e.relatedTarget)) hideTooltip();
  };
  container.onclick = function(e) {
    if (e.target.closest('.bt-controls')) return;
    const row = e.target.closest('.bt-row');
    if (!row) return;
    const arrow = row.querySelector('.bt-arrow');
    if (!arrow) return;
    const targetId = arrow.dataset.id;
    const childDiv = document.getElementById(targetId);
    if (!childDiv) return;
    const open = childDiv.style.display !== 'none';
    childDiv.style.display = open ? 'none' : '';
    arrow.textContent = open ? '\u25b8' : '\u25be';
  };

  const expandBtn = container.querySelector('.bt-expand-all');
  const collapseBtn = container.querySelector('.bt-collapse-all');
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
