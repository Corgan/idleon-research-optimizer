// Phase 0 validation: verify extracted modules match original HTML functions.
// Run: node js/tests/test-phase0.js

import { GRID_COLS, GRID_ROWS, GRID_SIZE, RES_GRID_RAW, OCC_DATA,
         SHAPE_VERTICES, SHAPE_DIMS, SHAPE_BONUS_PCT, SHAPE_NAMES, SHAPE_COLORS,
         NODE_GOAL, NODE_GOAL_COLORS, N2L,
         MINEHEAD_BONUS_QTY, STICKER_BASE, DANCING_CORAL_BASE,
         CARD_BASE_REQ, ARENA_THRESHOLDS, GODS_TYPE,
         SUMMON_ENDLESS_TYPE, SUMMON_ENDLESS_VAL, SUMMON_NORMAL_BONUS,
         DN_MOB_DATA, EMPEROR_BON_VAL_BY_TYPE, EMPEROR_BON_TYPE, EMPEROR_SET_BONUS_VAL,
         MERITOC_BASE, LEGEND_TALENT_PER_PT, ARCADE_SHOP, ARCANE_FLAT_SET,
         HOLES_MEAS_BASE, HOLES_MEAS_TYPE, HOLES_BOLAIA_PER_LV, HOLES_MON_BONUS,
         HOLES_JAR_BONUS_PER_LV, COSMO_UPG_BASE, ARTIFACT_BASE, GODSHARD_SET_BONUS,
         LAB_BONUS_BASE, LAB_BONUS_DYNAMIC, JEWEL_DESC,
       } from '../game-data.js';

import { cloneSimState } from '../sim-state.js';
import { gbWith, buildKalMap, OBS_BASE_EXP, obsBaseExp, insightExpReqAt,
         insightExpRate, insightAffectsExp, getKaleiMultiBase, magMaxForLevel,
         isObsUsable, computeOccurrencesToBeFound, isGridCellUnlocked,
         findNewlyUnlockable, deathNoteRank, researchExpReq,
         computeGridPointsEarned, computeGridPointsSpent,
         simTotalExpWith,
         calcAllBonusMultiWith, computeMagnifiersOwnedWith, computeShapesOwnedAt,
       } from '../sim-math.js';

import { isPointInPolygon, getShapePolygonAt, getShapeCellCoverage,
         buildCoverageLUT, lookupCoverage, rebuildShapeOverlay,
       } from '../optimizers/shapes-geo.js';

import { enumKalMags, growMagPoolTyped } from '../optimizers/mags.js';

import { fmtTime, fmtExp, fmtVal, fmtExact } from '../renderers/format.js';

import {
  S, assignState, restoreState,
} from '../state.js';

let pass = 0, fail = 0;
function eq(a, b, label) {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; }
  else { fail++; console.error(`FAIL: ${label}\n  got:      ${JSON.stringify(a)}\n  expected: ${JSON.stringify(b)}`); }
}
function approx(a, b, tol, label) {
  if (Math.abs(a - b) < tol) { pass++; }
  else { fail++; console.error(`FAIL: ${label}\n  got: ${a}, expected: ${b} (tol=${tol})`); }
}

// --- game-data.js ---
eq(GRID_COLS, 20, 'GRID_COLS');
eq(GRID_ROWS, 12, 'GRID_ROWS');
eq(GRID_SIZE, 240, 'GRID_SIZE');
eq(Object.keys(RES_GRID_RAW).length, 48, 'RES_GRID_RAW count');
eq(OCC_DATA.length, 43, 'OCC_DATA count');
eq(OCC_DATA[0].name, 'Bored_Tree', 'OCC_DATA[0].name');
eq(OCC_DATA[42].name, 'Happy_Tree', 'OCC_DATA[42].name');
eq(SHAPE_NAMES.length, 10, 'SHAPE_NAMES count');
eq(SHAPE_BONUS_PCT[0], 25, 'SHAPE_BONUS_PCT[0]');
eq(SHAPE_VERTICES.length, 10, 'SHAPE_VERTICES count');
eq(SHAPE_DIMS.length, 10, 'SHAPE_DIMS count');
eq(N2L.length, 157, 'N2L length');
eq(LAB_BONUS_BASE.length, 14, 'LAB_BONUS_BASE count');
eq(LAB_BONUS_DYNAMIC.length, 4, 'LAB_BONUS_DYNAMIC count');
eq(JEWEL_DESC.length, 24, 'JEWEL_DESC count');
eq(GODSHARD_SET_BONUS, 15, 'GODSHARD_SET_BONUS');

// --- sim-state.js ---
const testState = { gl:[0,1,2], so:[-1,0,1], md:[{type:0,slot:1,x:5,y:10}],
  il:[3,4], ip:[0.5,0.8], occ:[1,1], rLv:50, rExp:1234, mOwned:10, mMax:3 };
const cloned = cloneSimState(testState);
eq(cloned.rLv, 50, 'clone rLv');
eq(cloned.gl[1], 1, 'clone gl[1]');
eq(cloned.gl === testState.gl, false, 'clone gl is new array');
eq(cloned.md[0].slot, 1, 'clone md slot');
eq(cloned.md[0] === testState.md[0], false, 'clone md is new object');

// --- sim-math.js ---
approx(obsBaseExp(0), 4, 0.01, 'obsBaseExp(0)');
approx(obsBaseExp(10), 77.95, 0.1, 'obsBaseExp(10)');
eq(magMaxForLevel(1), 1, 'magMaxForLevel(1)');
eq(magMaxForLevel(40), 2, 'magMaxForLevel(40)');
eq(magMaxForLevel(70), 3, 'magMaxForLevel(70)');
eq(magMaxForLevel(120), 4, 'magMaxForLevel(120)');
eq(magMaxForLevel(200), 4, 'magMaxForLevel(200)');

// _gbWith
const gl = new Array(240).fill(0); gl[50] = 2;  // Pts Every Ten, 5 bonus/lv
const so = new Array(240).fill(-1);
const ctx = { abm: 1, c52: 1 };
approx(gbWith(gl, so, 50, ctx), 10, 0.01, '_gbWith LV2 no shape');
so[50] = 0; // shape 0 = 25%
approx(gbWith(gl, so, 50, ctx), 12.5, 0.01, '_gbWith LV2 with 25% shape');
ctx.abm = 1.15;
approx(gbWith(gl, so, 50, ctx), 14.375, 0.01, '_gbWith with abm=1.15');

// _buildKalMap
const kalMags = [{type:2,slot:5,x:0,y:0}]; // slot 5, 8-col grid
const km = buildKalMap(kalMags);
eq(km[4], 1, 'kal adj left');
eq(km[6], 1, 'kal adj right');
eq(km[13], 1, 'kal adj below'); // 5+8=13
eq(km[3], undefined, 'kal no diag');

// insightExpReqAt
approx(insightExpReqAt(0, 0), 2, 0.01, 'insightExpReqAt(0,0)');
const iReq10_5 = insightExpReqAt(10, 5);
eq(iReq10_5 > 100, true, 'insightExpReqAt(10,5)>100');

// isObsUsable
eq(isObsUsable(0, 1, [1]), true, 'obs 0 usable at rLv 1');
eq(isObsUsable(0, 1, [0]), false, 'obs 0 not found');
eq(isObsUsable(5, 5, [0,0,0,0,0,1]), false, 'obs 5 rLv too low');
eq(isObsUsable(5, 10, [0,0,0,0,0,1]), true, 'obs 5 at rLv 10');

// computeOccurrencesToBeFound
eq(computeOccurrencesToBeFound(0, [0]), 0, 'occTBF at lv0');
eq(computeOccurrencesToBeFound(1, [0]), 1, 'occTBF at lv1 unfound');
eq(computeOccurrencesToBeFound(50, [1]), 26, 'occTBF at lv50');
eq(computeOccurrencesToBeFound(100, [1]), 43, 'occTBF at lv100');

// isGridCellUnlocked
const gl2 = new Array(240).fill(0);
eq(isGridCellUnlocked(109, gl2), true, 'seed cell 109 always unlocked');
eq(isGridCellUnlocked(31, gl2), false, 'cell 31 locked');
gl2[51] = 1;
eq(isGridCellUnlocked(31, gl2), true, 'cell 31 unlocked via adj 51');

// deathNoteRank
eq(deathNoteRank(0, 0), 0, 'DN 0 kills');
eq(deathNoteRank(100000, 0), 2, 'DN 100k kills');
eq(deathNoteRank(5000000, 0), 7, 'DN 5M kills');
eq(deathNoteRank(2000000000, 0, 20), 20, 'DN 2B kills with rift 20');

// researchExpReq
approx(researchExpReq(1, 1), 12.1, 0.1, 'researchExpReq(1)');
eq(researchExpReq(50, 1) > 1e7, true, 'researchExpReq(50) > 10M');

// computeGridPointsEarned/Spent
eq(computeGridPointsEarned(10, 0), 11, 'gridPts lv10');
eq(computeGridPointsEarned(60, 0), 72, 'gridPts lv60');
const gl3 = new Array(240).fill(0); gl3[50] = 2; gl3[70] = 3;
eq(computeGridPointsSpent(gl3), 5, 'gridPts spent');

// --- shapes-geo.js ---
const poly = getShapePolygonAt(0, 0, 0, 0); // diamond at origin
eq(poly !== null, true, 'diamond polygon exists');
eq(poly.length, 4, 'diamond has 4 verts');
eq(isPointInPolygon(16, 30, poly), true, 'center of diamond is inside');
eq(isPointInPolygon(0, 0, poly), false, 'corner (0,0) is outside diamond');

// LUT
const lut = buildCoverageLUT(1);
eq(lut.length, 72, 'LUT for 1 shape has 72 entries');
eq(lut[0] !== null, true, 'LUT entry 0 exists');

// --- mags.js ---
const magResult = enumKalMags([0,1,2], 0, 2, 0.3, 0, [0,0,0], 2);
eq(magResult.length, 2, '2 mags assigned');
eq(magResult[0].type, 0, 'assigned as regular mag');
// With 0 gd101 and 0 insight, highest-index obs has highest obsBaseExp
eq(magResult[0].slot, 2, 'first mag on slot 2 (highest base)');
eq(magResult[1].slot, 2, 'second mag on slot 2 (maxPerSlot=2)');

// --- format.js ---
eq(fmtTime(0.5), '30m', 'fmtTime 30min');
eq(fmtTime(36), '1d 12h', 'fmtTime 36h');
eq(fmtExp(1234567), '1.23M', 'fmtExp 1.23M');
eq(fmtVal(99999), '100.0K', 'fmtVal 100K');
eq(fmtExact(123456.7), '123,457', 'fmtExact rounding');

// --- simTotalExpWith (Phase 1: now pure via ctx) ---
// Minimal scenario: 1 obs found, 1 regular mag on slot 0, research level 5
{
  const gl = new Array(240).fill(0);
  const so = new Array(240).fill(-1);
  const md = [{ type: 0, slot: 0, x: 0, y: 0 }]; // 1 regular mag on obs 0
  const il = new Array(80).fill(0);
  const occ = new Array(80).fill(0); occ[0] = 1;
  const rLv = 5;
  const ctx = { abm: 1, c52: 1, stickerFixed: 0, boonyCount: 0, evShop37: 0, extPctExSticker: 0 };

  const rate = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
  // With all grid bonuses at 0, additive=0, takinNotes=0, c52=1:
  //   multi = (1 + 0/100) * (1 + 0/100) * 1 = 1
  //   obsTotal = 1 * obsBaseExp(0) * 1 (no kal) * 1 (no gd101 insight)
  //   rate = obsBaseExp(0) * 1
  approx(rate, obsBaseExp(0), 1e-6, 'simTotalExpWith basic rate = obsBaseExp(0)');

  // With c52 = 1.5 (Jellofish multiplier)
  const ctx2 = { ...ctx, c52: 1.5 };
  const rate2 = simTotalExpWith(gl, so, md, il, occ, rLv, ctx2);
  approx(rate2, rate * 1.5, 1e-6, 'simTotalExpWith c52=1.5 multiplies rate');

  // With sticker bonus: stickerFixed > 0, no gl[68] bonus so grid bonus is 0
  const ctx3 = { ...ctx, stickerFixed: 10, boonyCount: 3, evShop37: 2, extPctExSticker: 5 };
  const rate3 = simTotalExpWith(gl, so, md, il, occ, rLv, ctx3);
  // dynSticker = (1 + (0*3 + 30*2)/100) * 10 = (1 + 0.6) * 10 = 16
  // additive = 0+0+0+0 + 5 + 16 = 21
  // multi = (1 + 21/100) * (1 + 0/100) * 1 = 1.21
  approx(rate3, obsBaseExp(0) * 1.21, 1e-6, 'simTotalExpWith with sticker + ext bonuses');

  // Zero mags → zero rate
  const rateZero = simTotalExpWith(gl, so, [], il, occ, rLv, ctx);
  eq(rateZero, 0, 'simTotalExpWith no mags = 0');

  // Grid bonus on node 50 (additive EXP %)
  const gl50 = gl.slice(); gl50[50] = 5;
  const node50info = RES_GRID_RAW[50];
  const expectedBonus50 = node50info[2] * 5 * 1; // val * lv * abm
  const rate50 = simTotalExpWith(gl50, so, md, il, occ, rLv, ctx);
  approx(rate50, obsBaseExp(0) * (1 + expectedBonus50 / 100), 1e-6, 'simTotalExpWith with grid node 50');
}

// --- calcAllBonusMultiWith ---
{
  const gl = new Array(240).fill(0);
  // No companions → baseline 1
  approx(calcAllBonusMultiWith(gl, false, false), 1.0, 1e-9, 'abmWith no comps');
  // Comp55 → +15%
  approx(calcAllBonusMultiWith(gl, true, false), 1.15, 1e-9, 'abmWith comp55');
  // Comp0DivOk but gl[173]=0 → no bonus
  approx(calcAllBonusMultiWith(gl, false, true), 1.0, 1e-9, 'abmWith comp0 but gl173=0');
  // Comp0DivOk with gl[173]=1 → +5%
  gl[173] = 1;
  approx(calcAllBonusMultiWith(gl, false, true), 1.05, 1e-9, 'abmWith comp0 gl173=1');
  // Both comps + gl[173]
  approx(calcAllBonusMultiWith(gl, true, true), 1.20, 1e-9, 'abmWith both comps');
}

// --- computeMagnifiersOwnedWith ---
{
  const gl = new Array(240).fill(0);
  const magCtx = { evShop33: 0, evShop34: 0, mhq2: 0, mhq12: 0, mhq20: 0 };
  // Base: 1 mag
  eq(computeMagnifiersOwnedWith(gl, 1, magCtx), 1, 'magOwned base');
  // rLv 10 → +1 bonus
  eq(computeMagnifiersOwnedWith(gl, 10, magCtx), 2, 'magOwned rLv10');
  // rLv 100 → +2 bonus
  eq(computeMagnifiersOwnedWith(gl, 100, magCtx), 3, 'magOwned rLv100');
  // gl[72]=3 → +3 kalei
  gl[72] = 3;
  eq(computeMagnifiersOwnedWith(gl, 10, magCtx), 5, 'magOwned 3 kalei');
  // gl[91]=2 → +2 mono
  gl[91] = 2;
  eq(computeMagnifiersOwnedWith(gl, 10, magCtx), 7, 'magOwned + 2 mono');
  // evShop33=1 evShop34=1  → +2
  const magCtx2 = { evShop33: 1, evShop34: 1, mhq2: 0, mhq12: 0, mhq20: 0 };
  eq(computeMagnifiersOwnedWith(gl, 10, magCtx2), 9, 'magOwned + shop');
  // Capped at 80
  gl[72] = 50; gl[91] = 30;
  const magCtx3 = { evShop33: 5, evShop34: 5, mhq2: 5, mhq12: 5, mhq20: 5 };
  eq(computeMagnifiersOwnedWith(gl, 200, magCtx3), 80, 'magOwned capped at 80');
  // companionHas153 → +1
  gl[72] = 0; gl[91] = 0;
  const magCtx4 = { evShop33: 0, evShop34: 0, mhq2: 0, mhq12: 0, mhq20: 0, companionHas153: true };
  eq(computeMagnifiersOwnedWith(gl, 1, magCtx4), 2, 'magOwned + comp153');
}

// --- computeShapesOwnedAt ---
{
  const shpCtx = { evShop36: 0, hasComp54: false, spelunkyUpg7: 0 };
  eq(computeShapesOwnedAt(1, shpCtx), 0, 'shapes rLv1');
  eq(computeShapesOwnedAt(20, shpCtx), 1, 'shapes rLv20');
  eq(computeShapesOwnedAt(30, shpCtx), 2, 'shapes rLv30');
  eq(computeShapesOwnedAt(50, shpCtx), 3, 'shapes rLv50');
  eq(computeShapesOwnedAt(80, shpCtx), 4, 'shapes rLv80');
  eq(computeShapesOwnedAt(110, shpCtx), 5, 'shapes rLv110');
  // With comp54 → +1 at lv20+
  const shpCtx2 = { evShop36: 0, hasComp54: true, spelunkyUpg7: 0 };
  eq(computeShapesOwnedAt(20, shpCtx2), 2, 'shapes rLv20 + comp54');
  // With spelunkyUpg7 → +1 at lv20+
  const shpCtx3 = { evShop36: 0, hasComp54: false, spelunkyUpg7: 1 };
  eq(computeShapesOwnedAt(20, shpCtx3), 2, 'shapes rLv20 + spelunky');
  // With evShop36
  const shpCtx4 = { evShop36: 3, hasComp54: false, spelunkyUpg7: 0 };
  eq(computeShapesOwnedAt(1, shpCtx4), 3, 'shapes evShop36=3 rLv1');
  // Capped at 10
  const shpCtx5 = { evShop36: 8, hasComp54: true, spelunkyUpg7: 1 };
  eq(computeShapesOwnedAt(200, shpCtx5), 10, 'shapes capped at 10');
}

// --- _growMagPoolTyped ---
{
  const growCtx = { evShop33: 1 }; // 1 kalei from shop
  const gl = new Array(240).fill(0);
  gl[72] = 2; // 2 kalei from grid → expected 3 total kalei
  gl[91] = 1; // 1 mono

  // Start with 1 regular mag
  const md = [{ type: 0, slot: 0, x: 0, y: 0 }];
  growMagPoolTyped(md, gl, 10, 6, growCtx);
  eq(md.length, 6, 'grow to 6 mags');
  // First 3 new should be kalei (need 3 total, have 0)
  eq(md[1].type, 2, 'grow: 2nd is kalei');
  eq(md[2].type, 2, 'grow: 3rd is kalei');
  eq(md[3].type, 2, 'grow: 4th is kalei');
  // Next should be mono (need 1, have 0)
  eq(md[4].type, 1, 'grow: 5th is mono');
  // Remaining is regular
  eq(md[5].type, 0, 'grow: 6th is regular');

  // Already at target → no change
  const before = md.length;
  growMagPoolTyped(md, gl, 10, 6, growCtx);
  eq(md.length, before, 'grow: no change when at target');
}

// --- state.js: assignState / restoreState round-trip ---
{
  // Save original state
  const origRL = S.researchLevel;
  const origMag = S.magnifiersOwned;
  const origGL = S.gridLevels.slice();
  const origComp = new Set(S.companionIds);
  const origTiersAbove = S.shapeTiers.above.slice();

  // assignState partial update
  assignState({ researchLevel: 42, magnifiersOwned: 99 });
  eq(S.researchLevel, 42, 'assignState: researchLevel set');
  eq(S.magnifiersOwned, 99, 'assignState: magnifiersOwned set');
  // Untouched fields remain unchanged
  eq(S.gridLevels, origGL, 'assignState: gridLevels untouched');

  // assignState with Set (companionIds)
  assignState({ companionIds: [10, 20, 30] });
  eq(S.companionIds instanceof Set, true, 'assignState: companionIds is Set');
  eq(S.companionIds.size, 3, 'assignState: companionIds size');
  eq(S.companionIds.has(20), true, 'assignState: companionIds has 20');

  // assignState with shapeTiers (special .above/.below)
  assignState({ shapeTiers: { above: [1, 2], below: [3] } });
  eq(S.shapeTiers.above, [1, 2], 'assignState: shapeTiers.above');
  eq(S.shapeTiers.below, [3], 'assignState: shapeTiers.below');

  // restoreState with full snapshot round-trip
  restoreState({
    research: [], gridLevels: [5, 10], shapeOverlay: [], occFound: [],
    insightLvs: [], insightProgress: [], magData: [], shapePositions: [],
    stateR7: [], researchLevel: 7, magMaxPerSlot: 0, externalResearchPct: 0,
    comp52TrueMulti: 1, allBonusMulti: 1, magnifiersOwned: 15,
    companionIds: [55], shapeTiers: { above: [1], below: [2] },
  });
  eq(S.researchLevel, 7, 'restoreState: researchLevel from data');
  eq(S.magnifiersOwned, 15, 'restoreState: magnifiersOwned from data');
  eq(S.gridLevels[0], 5, 'restoreState: gridLevels[0]');
  eq(S.gridLevels[1], 10, 'restoreState: gridLevels[1]');
  eq(S.companionIds.has(55), true, 'restoreState: companionIds has 55');
  eq(S.shapeTiers.above[0], 1, 'restoreState: shapeTiers.above');
  eq(S.shapeTiers.below[0], 2, 'restoreState: shapeTiers.below');

  // Live binding: assignState changes are visible through S object
  assignState({ researchLevel: 123 });
  eq(S.researchLevel, 123, 'live binding: researchLevel reflects assignState');

  // Restore original state to not affect other tests
  restoreState({
    researchLevel: origRL,
    magnifiersOwned: origMag,
    gridLevels: origGL,
    companionIds: Array.from(origComp),
    shapeTiers: { above: origTiersAbove, below: S.shapeTiers.below }
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
