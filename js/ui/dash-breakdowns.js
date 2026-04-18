// ===== DASH-BREAKDOWNS.JS - EXP, AFK, and Insight breakdown trees =====
// Extracted from dashboard.js.

import { saveData } from '../state.js';
import { cachedAFKRate } from '../save/data.js';
import {
  gridCoord,
} from '../game-data.js';
import { artifactBase } from '../stats/data/w5/sailing.js';
import { dancingCoralBase, stickerBase } from '../stats/data/w7/research.js';
import { EMPEROR_SET_BONUS_VAL } from '../stats/data/common/emperor.js';
import { equipSetBonus } from '../stats/data/common/equipment.js';
import {
  gbWith,
  computeOccurrencesToBeFound,
} from '../sim-math.js';
import { simTotalExp } from '../save/context.js';
import { mainframeBonus } from '../stats/systems/w4/lab.js';
import { achieveStatus } from '../stats/systems/common/achievement.js';
import { computeCardLv } from '../stats/systems/common/cards.js';
import { computeEmperorBon } from '../stats/systems/w6/emperor.js';
import { computeMeritocBonusz } from '../stats/systems/w7/meritoc.js';
import { cookingMealMulti } from '../stats/systems/common/cooking.js';
import { computeSummWinBonus } from '../stats/systems/w6/summoning.js';
import { exoticBonusQTY40 } from '../stats/systems/w6/farming.js';
import { grimoireUpgBonus22 } from '../stats/systems/mc/grimoire.js';
import { legendPTSbonus } from '../stats/systems/w7/spelunking.js';
import { arcadeBonus } from '../stats/systems/w2/arcade.js';
import afkGainsDesc from '../stats/defs/research-afk-gains.js';
import { buildTree } from '../stats/tree-builder.js';
import { getCatalog } from '../stats/registry.js';
import { fmtExact, fmtVal } from '../renderers/format.js';
import { _bNode, _gbNode as _gbNodeS } from '../stats/node-helpers.js';
import { computeButtonBonus, computeKillroyBonus } from '../stats/defs/helpers.js';
import { label } from '../stats/entity-names.js';

// ===== Tree node helpers =====
// _bNode imported from stats/node-helpers.js
// _gbNode wrapper binds global saveData for local use
export { _bNode };
const _gbNode = (idx, label, opts) => _gbNodeS(saveData, idx, label, opts);
export { _gbNode };


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

  if (!saveData.research) return null;
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
  for (let i = 0; i < occTBF; i++) if ((saveData.occFound[i] || 0) >= 1) occFoundCount++;
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
  const stkLv = saveData.research?.[9]?.[1] || 0;
  const stkBase = stickerBase(1) || 5;
  const boonyCount = saveData.research?.[11]?.length || 0;
  const gb68val = getGridBonusFinal(68);
  const gb68mode2 = gb68val * boonyCount;
  const evShop37 = dSaveCtx.cachedEvShop37;
  const stkCrownMulti = 1 + (gb68mode2 + 30 * evShop37) / 100;
  const stkSB62 = 1 + 20 * dSaveCtx.sb62 / 100;
  addChildren.push(_bNode('Farming: Laissez Maize Sticker', stkCrownMulti * stkSB62 * stkLv * stkBase, [
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
  const tower22 = saveData.towerData[22] || 0;
  const dcBase = dancingCoralBase(4) || 3;
  const dcProgress = Math.max(0, tower22 - 200);
  addChildren.push(_bNode('Clover Shrine', dcBase * dcProgress, [
    _bNode('Base', dcBase, null, { fmt: '%' }),
    _bNode('Level', dcProgress, null, { fmt: 'x' })
  ], { fmt: '%' }));

  // Zenith Market
  const zmLevel = saveData.spelunkData?.[45]?.[8] || 0;
  addChildren.push(_bNode('Zenith Market', Math.floor(zmLevel), null, { fmt: '%' }));

  // Cards
  const clvW7b1 = computeCardLv('w7b1');
  const clvW7b4 = computeCardLv('w7b4');
  const clvW7a11 = computeCardLv('w7a11');
  addChildren.push(_bNode('Card: Trench Fish', Math.min(clvW7b1, 10), null, { fmt: '%' }));
  addChildren.push(_bNode('Card: Eggroll', Math.min(2 * clvW7b4, 10), null, { fmt: '%' }));
  addChildren.push(_bNode('Card: Coralcave Crab', Math.min(clvW7a11, 10), null, { fmt: '%' }));

  // Prehistoric Set
  const _prehistoricSet = String(saveData.olaData[379] || '').includes('PREHISTORIC_SET') ? 50 : 0;
  addChildren.push(_bNode('Prehistoric Set', _prehistoricSet, null, { fmt: '%' }));

  // Slabbo
  const hasSB34 = dSaveCtx.sb34;
  const c1len = saveData.cards1Data.length || 0;
  const slabboBase = Math.floor(Math.max(0, c1len - 1300) / 5);
  const slabboMF15 = mainframeBonus(15);
  const slabboMeritoc23 = computeMeritocBonusz(23);
  const slabboLegend28 = legendPTSbonus(28);
  const vub74 = saveData.vaultData[74] || 0;
  const slabboMult = (1 + slabboMF15 / 100) * (1 + slabboMeritoc23 / 100) * (1 + slabboLegend28 / 100) * (1 + vub74 / 100);
  addChildren.push(_bNode('Slab Bonus', hasSB34 ? 0.1 * slabboMult * slabboBase : 0, hasSB34 ? [
    _bNode('Base (' + c1len + ')', slabboBase * 0.1, null, { fmt: '%', note: 'floor((Item Count - 1300) / 5) x 0.1' }),
    _bNode('Multiplier', slabboMult, [
      _bNode('Slab Sovereignty', 1 + slabboMF15 / 100, null, { fmt: 'x' }),
      _bNode('Slab Meritocracy', 1 + slabboMeritoc23 / 100, null, { fmt: 'x' }),
      _bNode('+1 Slab', 1 + slabboLegend28 / 100, null, { fmt: 'x' }),
      _bNode('Vault: Super Slab', 1 + vub74 / 100, null, { fmt: 'x' })
    ], { fmt: 'x' })
  ] : null, { fmt: '%', note: hasSB34 ? '' : 'Slabby Research locked' }));

  // Arcade
  addChildren.push(_bNode('Arcade: Research XP', arcadeBonus(63), null, { fmt: '%' }));

  // Meal (Giga Chip) - deep decomposition
  const mealLv = saveData.mealsData?.[0]?.[72] || 0;
  const ribT = saveData.ribbonData[100] || 0;
  const ribBon = dSaveCtx.ribbon100;
  const cm = cookingMealMulti(saveData);

  // WinBonus(26) decomposition
  const swb = computeSummWinBonus();
  const swbRaw = swb[26] || 0;
  const pristine8 = (saveData.ninjaData?.[107]?.[8] === 1) ? 30 : 0;
  const gemItems11 = Number(saveData.gemItemsData[11]) || 0;
  const artRarity = Number(saveData.sailingData?.[3]?.[32]) || 0;
  const artBonus32 = artRarity > 0 ? artifactBase(32) * artRarity : 0;
  const taskVal = Math.min(10, Number(saveData.tasksGlobalData?.[2]?.[5]?.[4]) || 0);
  const wb31 = swb[31] || 0;
  const empBon8 = computeEmperorBon(8);
  const godshardSet = String(saveData.olaData[379] || '').includes('GODSHARD_SET') ? equipSetBonus('GODSHARD_SET') : 0;
  const ach379 = achieveStatus(379);
  const ach373 = achieveStatus(373);

  const winBonNode = _bNode('Summoning Win Bonus', 1 + cm.winBon26 / 100, [
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

  const hasEmpSet = String(saveData.olaData[379] || '').includes('EMPEROR_SET');
  const empTermVal = hasEmpSet ? Math.floor(ribT / 4) * (EMPEROR_SET_BONUS_VAL / 4) : 0;

  const ribBase = ribT > 0 ? Math.floor(5 * ribT + Math.floor(ribT / 2) * (4 + 6.5 * Math.floor(ribT / 5))) : 0;

  addChildren.push(_bNode('Meal: Giga Chip', ribBon * mealLv * 0.01 * cm.val, [
    _bNode('Meal Value', 0.01 * mealLv, [
      _bNode('Base', 0.01, null, { fmt: '%' }),
      _bNode('Levels', mealLv, null, { fmt: 'x' })
    ], { fmt: '%' }),
    _bNode('Ribbon', ribBon, [
      _bNode('Ribbon Base (T' + ribT + ')', ribBase, null, { fmt: '%', note: 'floor(5T + floor(T/2) x (4 + 6.5 x floor(T/5)))' }),
      _bNode('Emperor Set', empTermVal, null, { fmt: '%' })
    ], { fmt: 'x' }),
    _bNode('Meal Multi', cm.val, [
      _bNode('Cooking Multi', 1 + (cm.mfb116 + cm.shinyS20) / 100, [
        _bNode(label('Mainframe', 116), cm.mfb116, null, { fmt: '%' }),
        _bNode(label('Breeding', 20), cm.shinyS20, null, { fmt: '%' })
      ], { fmt: 'x' }),
      winBonNode,
      _bNode(label('Companion', 162, ' (1.25x meals)'), 1 + cm.comp162 / 100, null, { fmt: 'x', note: saveData.companionIds.has(162) ? 'Owned' : 'Not owned' })
    ], { fmt: 'x' })
  ], { fmt: '%' }));

  // Crop Scientist
  const hasEmp44 = dSaveCtx.emp44;
  const cropRaw = hasEmp44 ? Math.floor(Math.max(0, (saveData.farmCropCount - 200) / 10)) : 0;
  const mf17 = mainframeBonus(17);
  const gub22 = grimoireUpgBonus22();
  const exo40 = exoticBonusQTY40();
  const vub79 = saveData.vaultData[79] || 0;
  const cropSCmulti = (1 + mf17 / 100) * (1 + (gub22 + exo40 + vub79) / 100);
  addChildren.push(_bNode('Crop Scientist', cropRaw * cropSCmulti, hasEmp44 ? [
    _bNode('Base (' + saveData.farmCropCount + ')', cropRaw, null, { fmt: '%', note: 'floor((Crops - 200) / 10)' }),
    _bNode('Multi', cropSCmulti, [
      _bNode('Depot Studies PhD', 1 + mf17 / 100, null, { fmt: 'x' }),
      _bNode('Crop Research Multi', 1 + (gub22 + exo40 + vub79) / 100, [
        _bNode('Superior Crop Research', gub22, null, { fmt: '%' }),
        _bNode('Scienterrific', exo40, null, { fmt: '%' }),
        _bNode('Vault: Funded Research', vub79, null, { fmt: '%' })
      ], { fmt: 'x' })
    ], { fmt: 'x' })
  ] : null, { fmt: '%', note: hasEmp44 ? '' : 'Science Chalk locked' }));

  // MSA
  const hasSB44 = dSaveCtx.sb44;
  const tdWaves = Array.isArray(saveData.totemInfoData[0]) ? saveData.totemInfoData[0] : [];
  const tdNames = ['W1: Forest Outskirts', 'W2: Up Up Down Down', 'W1: The Roots', 'W3: Rollin\' Tundra', 'W4: Mountainous Deugh', 'W5: OJ Bay', 'W6: Above the Clouds', 'W7: Puffpuff Overpass'];
  const gamingStars = tdWaves.reduce(function(a,v) { return a + (Number(v)||0); }, 0);
  const msaEff = Math.max(0, Math.floor((gamingStars - 300) / 10));
  const tdChildren = [];
  for (let ti = 0; ti < tdWaves.length; ti++) {
    if (!tdNames[ti]) continue;
    tdChildren.push(_bNode(tdNames[ti], Number(tdWaves[ti]) || 0));
  }
  addChildren.push(_bNode('MSA Bonus', hasSB44 ? 0.3 * msaEff : 0, hasSB44 ? [
    _bNode('Total Waves', gamingStars, tdChildren)
  ] : null, { fmt: '%', note: hasSB44 ? 'floor((Total Waves - 300) / 10) x 0.3' : 'MSA Research locked' }));

  // Lore / Tome
  const loreEpisodes = saveData.spelunkData?.[13]?.[2] || 0;
  if (loreEpisodes > 7 && saveData.totalTomePoints > 0) {
    const g17 = saveData.grimoireData?.[17] || 0;
    const trollSet = String(saveData.olaData[379] || '').includes('TROLL_SET') ? 25 : 0;
    const loreMult = 1 + (g17 + trollSet) / 100;
    const x = Math.floor(Math.max(0, saveData.totalTomePoints - 16000) / 100);
    const xp = Math.pow(x, 0.7);
    const decayVal = 20 * Math.max(0, xp / (25 + xp));
    addChildren.push(_bNode('Tome Bonus', loreMult * decayVal, [
      _bNode('Base', decayVal, [
        _bNode('Scaled Points (' + saveData.totalTomePoints + ')', x, null, { note: 'floor((Tome Points - 16000) / 100)' })
      ], { fmt: '%', note: '20 x Scaled^0.7 / (25 + Scaled^0.7)' }),
      _bNode('Tome Multi', loreMult, [
        _bNode('DB: Grey Tome Book', g17, null, { fmt: '%' }),
        _bNode('Troll Set', trollSet, null, { fmt: '%' })
      ], { fmt: 'x' })
    ], { fmt: '%' }));
  } else {
    addChildren.push(_bNode('Tome Bonus', 0, null, {
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

  const comp52val = saveData.companionIds.has(52) ? 0.5 : 0;
  const jellyNode = _bNode('Jellofish', 1 + comp52val, null, { fmt: 'x', note: comp52val > 0 ? 'Owned' : 'Not owned' });

  const comp153val = saveData.companionIds.has(153) ? 1 : 0;
  const nightmareNode = _bNode('Nightmare', 1 + comp153val, null, { fmt: 'x', note: comp153val > 0 ? 'Owned' : 'Not owned' });

  const rog0val = saveData.cachedUniqueSushi > 0 ? 1 : 0;
  const rog0Node = _bNode('Sushi RoG', 1 + rog0val, null, { fmt: 'x', note: rog0val > 0 ? saveData.cachedUniqueSushi + ' unique sushi' : 'Not unlocked' });

  const buttonBonus0 = computeButtonBonus(0, saveData);
  const buttonPresses = Number(saveData.olaData[594]) || 0;
  const buttonNode = _bNode('Button Bonus', 1 + buttonBonus0 / 100, null, { fmt: 'x', note: buttonPresses + ' presses' });

  const killroy5raw = computeKillroyBonus(5, saveData);
  const killroyNode = _bNode(label('Killroy', 5), 1 + killroy5raw / 100, null, { fmt: 'x' });

  const dream14val = dCtx.dream14 || 0;
  const nonstopNode = _bNode('Nonstop Studies', 1 + 3 * dream14val / 100, null, { fmt: 'x', note: dream14val > 0 ? 'LV ' + dream14val : 'Not unlocked' });

  // ---- Build root with flat structure: obs base (leaf), additive group, multi group ----
  const finalMulti = (1 + additiveTotal / 100) * (1 + takinNotesVal / 100) * (1 + 3 * dream14val / 100) * Math.max(1, (1 + comp52val) * (1 + comp153val)) * (1 + rog0val) * (1 + buttonBonus0 / 100) * (1 + killroy5raw / 100);

  // Root children: obs base summary, then additive sources, then multipliers
  const rootChildren = [];
  rootChildren.push(_bNode('Observation Base', rate.obsBase, null, { fmt: '/hr' }));
  rootChildren.push(additiveNode);
  const tnNode = _gbNode(70, "Takin' Notes");
  tnNode.val = 1 + takinNotesVal / 100;
  tnNode.fmt = 'x';
  rootChildren.push(tnNode);
  rootChildren.push(nonstopNode);
  rootChildren.push(jellyNode);
  rootChildren.push(nightmareNode);
  rootChildren.push(rog0Node);
  rootChildren.push(buttonNode);
  rootChildren.push(killroyNode);
  rootChildren.push(_bNode('Final Multiplier', finalMulti, null, { fmt: 'x' }));

  return _bNode('Total EXP/hr', rate.total, rootChildren, { fmt: '/hr' });
}

// ===== AFK BREAKDOWN TREE =====
export function buildAFKBreakdownTree() {
  const afkRate = cachedAFKRate || buildTree(afkGainsDesc, getCatalog(), { saveData: saveData });
  const afkPct = afkRate.val * 100;
  const addChildren = [];

  // Base 1% (hardcoded in formula: 0.01 + sum/100)
  addChildren.push(_bNode('Base', 1, null, { fmt: '%' }));

  // Map descriptor children to display nodes
  var descChildren = afkRate.children || [];
  for (var i = 0; i < descChildren.length; i++) {
    var dc = descChildren[i];
    // Grid bonuses get full _gbNode decomposition
    if (dc.name === 'Grid: Powered Down Research') {
      var gbn71 = _gbNode(71, 'Powered Down Research');
      gbn71.fmt = '%';
      addChildren.push(gbn71);
    } else if (dc.name === 'Grid: Research AFK Gains') {
      var gbn111 = _gbNode(111, 'Research AFK Gains');
      gbn111.fmt = '%';
      addChildren.push(gbn111);
    } else {
      addChildren.push(_bNode(dc.name, dc.val, null, { fmt: '%' }));
    }
  }

  // Sort by value descending
  addChildren.sort(function(a, b) { return b.val - a.val; });

  const capped = afkPct > 100;
  return _bNode('AFK Rate', afkPct, addChildren, { fmt: 'pct', note: capped ? 'Capped at 100%' : '' });
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
  const emp46 = dCtx.emp46 || 0;
  const multi = (1 + insightBonus / 100) * (1 + 35 * emp46 / 100);
  const totalPerMono = 3 * multi;

  if (emp46 > 0) children.push(_bNode('Optimal Optometry', 35 * emp46, null, { fmt: '%' }));

  const bonusNode = _bNode('Insight Bonus', insightBonus + 35 * emp46, children, { fmt: '%' });
  return _bNode('Insight/hr per Monocle', totalPerMono, [
    _bNode('Monocle Base', 3, null, { fmt: '/hr' }),
    bonusNode,
    _bNode('Final Multiplier', multi, null, { fmt: 'x' }),
  ], { fmt: '/hr' });
}

// ===== Tree renderer =====
let _btTreeCounter = 0;
export function resetTreeCounter() { _btTreeCounter = 0; }

export function renderBreakdownTree(root, container, opts) {
  if (!root) { container.innerHTML = ''; return; }
  opts = opts || {};
  const prefix = 'bt' + (_btTreeCounter++) + '-';
  let idCounter = 0;
  const ttId = opts.tooltipId || 'tooltip';

  function fmtNodeVal(node) {
    const v = Number(node.val) || 0;    if (node.fmt === 'full') return fmtExact(v);    if (node.fmt === '/hr') return fmtVal(v) + '/hr <span style="color:var(--text2);font-size:.85em">('+fmtExact(v)+')</span>';
    if (node.fmt === 'pct') return parseFloat(v.toFixed(1)) + '%';
    if (node.fmt === '%') return '+' + parseFloat(v.toFixed(2)) + '%';
    if (node.fmt === 'x') return '\u00d7' + (Math.abs(v) >= 1e4 ? fmtVal(v) : parseFloat(v.toFixed(4)));
    if (node.fmt === '+') return (v >= 0 ? '+' : '') + (Math.abs(v) >= 1e4 ? fmtVal(v) : parseFloat(v.toFixed(4)));
    if (Number.isInteger(v)) return v >= 1e4 ? fmtVal(v) : String(v);
    return Math.abs(v) >= 1e4 ? fmtVal(v) : parseFloat(v.toFixed(4));
  }

  function valColor(node) {
    if (node.fmt === '/hr') return 'var(--green)';
    if (node.fmt === 'pct') return 'var(--green)';
    if (node.fmt === '+') return 'var(--green)';
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
    const tagHtml = node.tag ? ' <span class="bt-tag ' + node.tag + '">[' + node.tag + ']</span>' : '';
    let html = '<div class="' + cls + '"' + noteAttr + ' style="padding-left:' + pad + 'px;" data-depth="' + depth + '">';
    html += arrow;
    html += '<span class="bt-label">' + node.label + tagHtml + '</span>';
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

  // Tooltip handlers — self-contained, configurable element ID
  container.onmouseover = function(e) {
    const row = e.target.closest('.bt-row[data-bt-note]');
    if (!row) return;
    const tt = document.getElementById(ttId);
    if (!tt) return;
    tt.innerHTML = '<div class="tt-desc">' + row.getAttribute('data-bt-note') + '</div>';
    tt.style.display = 'block';
    tt.style.left = (e.clientX + 14) + 'px';
    tt.style.top = (e.clientY + 14) + 'px';
  };
  container.onmousemove = function(e) {
    const row = e.target.closest('.bt-row[data-bt-note]');
    if (!row) return;
    const tt = document.getElementById(ttId);
    if (tt && tt.style.display === 'block') {
      tt.style.left = (e.clientX + 14) + 'px';
      tt.style.top = (e.clientY + 14) + 'px';
    }
  };
  container.onmouseout = function(e) {
    const row = e.target.closest('.bt-row[data-bt-note]');
    if (row && !row.contains(e.relatedTarget)) {
      const tt = document.getElementById(ttId);
      if (tt) tt.style.display = 'none';
    }
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
