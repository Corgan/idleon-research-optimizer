// Save loader & external bonus tests: loadSaveData, buildSaveContext,
// mineheadBonusQTY, computeExternalBonuses, computeAFKGainsRate.
// Run:  node js/tests/test-save-loader.js

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSaveData } from '../save/loader.js';
import { buildSaveContext, makeCtx } from '../save/context.js';
import { mineheadBonusQTY, computeExternalBonuses, computeAFKGainsRate,
         computeCardLv, computeShinyBonusS, grimoireUpgBonus22, exoticBonusQTY40,
         calcAllBonusMulti } from '../save/external.js';
import { S } from '../state.js';
import { MINEHEAD_BONUS_QTY, GRID_SIZE } from '../game-data.js';
import { computeMagnifiersOwnedWith, computeShapesOwnedAt } from '../sim-math.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAVES_DIR = resolve(__dirname, '..', '..', 'saves');

let pass = 0, fail = 0;
function eq(a, b, label) {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; }
  else { fail++; console.error(`FAIL: ${label}\n  got:      ${JSON.stringify(a)}\n  expected: ${JSON.stringify(b)}`); }
}
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error(`FAIL: ${label}`); }
}
function approx(a, b, tol, label) {
  if (Math.abs(a - b) < tol) { pass++; }
  else { fail++; console.error(`FAIL: ${label}\n  got: ${a}, expected: ${b} (tol=${tol})`); }
}

// ===== Load save =====
const raw = JSON.parse(await readFile(resolve(SAVES_DIR, 'it.json'), 'utf-8'));
loadSaveData(raw);

// ============================================================
// 1. loadSaveData — verify key state populated
// ============================================================
console.log('--- loadSaveData state ---');

ok(typeof S.researchLevel === 'number' && S.researchLevel > 0, 'researchLevel is positive number');
eq(S.researchLevel, 49, 'researchLevel === 49');

ok(typeof S.magnifiersOwned === 'number' && S.magnifiersOwned > 0, 'magnifiersOwned > 0');
eq(S.magnifiersOwned, 10, 'magnifiersOwned === 10');

ok(Array.isArray(S.gridLevels), 'gridLevels is array');
eq(S.gridLevels.length, GRID_SIZE, 'gridLevels length === GRID_SIZE');
ok(S.gridLevels.some(v => v > 0), 'gridLevels has nonzero entries');

ok(Array.isArray(S.shapeOverlay), 'shapeOverlay is array');
eq(S.shapeOverlay.length, GRID_SIZE, 'shapeOverlay length === GRID_SIZE');

ok(Array.isArray(S.occFound), 'occFound is array');
ok(S.occFound.length >= 40, 'occFound length >= 40');

ok(Array.isArray(S.insightLvs), 'insightLvs is array');
ok(Array.isArray(S.insightProgress), 'insightProgress is array');

ok(Array.isArray(S.magData), 'magData is array');
ok(S.magData.length > 0, 'magData has entries');
// Each mag entry has {x, y, slot, type}
const mag0 = S.magData[0];
ok(mag0 && 'x' in mag0 && 'y' in mag0 && 'slot' in mag0 && 'type' in mag0,
  'magData[0] has x,y,slot,type');

ok(Array.isArray(S.shapePositions), 'shapePositions is array');
if (S.shapePositions.length > 0) {
  const sp0 = S.shapePositions[0];
  ok(sp0 && 'x' in sp0 && 'y' in sp0 && 'rot' in sp0, 'shapePositions[0] has x,y,rot');
}

ok(S.magMaxPerSlot >= 1 && S.magMaxPerSlot <= 4, 'magMaxPerSlot in [1,4]');
ok(typeof S.cachedEventShopStr === 'string', 'cachedEventShopStr is string');
ok(typeof S.comp52TrueMulti === 'number', 'comp52TrueMulti is number');
ok(typeof S.allBonusMulti === 'number', 'allBonusMulti is number');
ok(typeof S.externalResearchPct === 'number', 'externalResearchPct is number');
ok(S.externalResearchPct > 0, 'externalResearchPct > 0');

// Companion ids parsed
ok(S.companionIds instanceof Set, 'companionIds is Set');

// Arrays populated
ok(Array.isArray(S.olaData), 'olaData is array');
ok(Array.isArray(S.gamingData), 'gamingData is array');
ok(Array.isArray(S.spelunkData), 'spelunkData is array');
ok(typeof S.cards0Data === 'object', 'cards0Data is object');
ok(Array.isArray(S.ribbonData), 'ribbonData is array');
ok(Array.isArray(S.breedingData), 'breedingData is array');
ok(Array.isArray(S.arcaneData), 'arcaneData is array');
ok(Array.isArray(S.summonData), 'summonData is array');

// ============================================================
// 2. mineheadBonusQTY — pure function
// ============================================================
console.log('--- mineheadBonusQTY ---');

// Returns table value when mineFloor > t
eq(mineheadBonusQTY(2, 10), MINEHEAD_BONUS_QTY[2], 'mineheadBonusQTY(2, 10) === table[2]');
eq(mineheadBonusQTY(12, 20), MINEHEAD_BONUS_QTY[12], 'mineheadBonusQTY(12, 20) === table[12]');
eq(mineheadBonusQTY(20, 100), MINEHEAD_BONUS_QTY[20], 'mineheadBonusQTY(20, 100) === table[20]');

// Returns 0 when mineFloor <= t
eq(mineheadBonusQTY(2, 2), 0, 'mineheadBonusQTY(2, 2) === 0 (equal)');
eq(mineheadBonusQTY(2, 1), 0, 'mineheadBonusQTY(2, 1) === 0 (below)');
eq(mineheadBonusQTY(12, 0), 0, 'mineheadBonusQTY(12, 0) === 0 (zero floor)');

// Returns 0 for unknown index
eq(mineheadBonusQTY(999, 1000), 0, 'mineheadBonusQTY(999, 1000) === 0 (unknown index)');

// ============================================================
// 3. computeExternalBonuses — integration
// ============================================================
console.log('--- computeExternalBonuses ---');

const eb = S.extBonuses;
ok(eb && typeof eb === 'object', 'extBonuses is object');
ok(typeof eb._total === 'number', '_total is number');
ok(eb._total > 0, '_total > 0');
ok(eb._comp52 && typeof eb._comp52.val === 'number', '_comp52 present with val');
ok(eb._allMulti && typeof eb._allMulti.val === 'number', '_allMulti present with val');

// Individual bonus categories exist and have val
for (const key of ['sticker', 'dancingCoral', 'zenithMarket', 'cardW7b1', 'cardW7b4',
                    'prehistoricSet', 'slabbo', 'arcade', 'meal', 'cropSC', 'msa']) {
  ok(eb[key] && typeof eb[key].val === 'number', `extBonuses.${key} has numeric val`);
}

// _total should equal sum of non-_ keys
let checkSum = 0;
for (const k of Object.keys(eb)) {
  if (!k.startsWith('_')) checkSum += eb[k].val;
}
approx(eb._total, checkSum, 0.001, '_total matches sum of parts');

// Re-computation should yield same result
const eb2 = computeExternalBonuses();
approx(eb2._total, eb._total, 0.001, 'recomputed _total matches');

// ============================================================
// 4. computeAFKGainsRate
// ============================================================
console.log('--- computeAFKGainsRate ---');

const afk = computeAFKGainsRate();
ok(typeof afk === 'object', 'computeAFKGainsRate returns object');
ok(typeof afk.rate === 'number', 'rate is number');
ok(afk.rate >= 0.01 && afk.rate <= 1, 'rate in [0.01, 1]');
ok(typeof afk.pct === 'number', 'pct is number');
approx(afk.pct, afk.rate * 100, 0.001, 'pct === rate*100');
ok(typeof afk.sum === 'number', 'sum is number');
ok(typeof afk.parts === 'object', 'parts is object');

// ============================================================
// 5. buildSaveContext — snapshot shape
// ============================================================
console.log('--- buildSaveContext ---');

const ctx = buildSaveContext();
ok(typeof ctx === 'object', 'buildSaveContext returns object');

// Check key scalar properties
ok(typeof ctx.serverVarResXP === 'number', 'serverVarResXP is number');
ok(typeof ctx.companionHas55 === 'boolean', 'companionHas55 is boolean');
ok(typeof ctx.companionHas54 === 'boolean', 'companionHas54 is boolean');
ok(typeof ctx.companionHas0 === 'boolean', 'companionHas0 is boolean');
ok(typeof ctx.comp52TrueMulti === 'number', 'comp52TrueMulti is number');
ok(typeof ctx.cachedStickerFixed === 'number', 'cachedStickerFixed is number');
ok(typeof ctx.cachedBoonyCount === 'number', 'cachedBoonyCount is number');
ok(typeof ctx.cachedEvShop37 === 'number', 'cachedEvShop37 is number');
ok(typeof ctx.cachedExtPctExSticker === 'number', 'cachedExtPctExSticker is number');

// Shop/minehead/emporium constants
ok(typeof ctx.evShop33 === 'number', 'evShop33 is number');
ok(typeof ctx.evShop34 === 'number', 'evShop34 is number');
ok(typeof ctx.evShop35 === 'number', 'evShop35 is number');
ok(typeof ctx.evShop36 === 'number', 'evShop36 is number');
ok(typeof ctx.sb34 === 'number', 'sb34 is number');
ok(typeof ctx.sb44 === 'number', 'sb44 is number');
ok(typeof ctx.sb62 === 'number', 'sb62 is number');
ok(typeof ctx.emp44 === 'number', 'emp44 is number');
ok(typeof ctx.ribbon100 === 'number', 'ribbon100 is number');
ok(typeof ctx.mhq2 === 'number', 'mhq2 is number');
ok(typeof ctx.mhq12 === 'number', 'mhq12 is number');
ok(typeof ctx.mhq20 === 'number', 'mhq20 is number');

// Mutable array refs
ok(Array.isArray(ctx.gridLevels), 'ctx.gridLevels is array');
eq(ctx.gridLevels, S.gridLevels, 'ctx.gridLevels === S.gridLevels (same ref)');
ok(Array.isArray(ctx.insightLvs), 'ctx.insightLvs is array');
ok(Array.isArray(ctx.insightProgress), 'ctx.insightProgress is array');
ok(Array.isArray(ctx.occFound), 'ctx.occFound is array');
ok(Array.isArray(ctx.magData), 'ctx.magData is array');
ok(Array.isArray(ctx.shapePositions), 'ctx.shapePositions is array');
ok(typeof ctx.magnifiersOwned === 'number', 'ctx.magnifiersOwned is number');
eq(ctx.magnifiersOwned, S.magnifiersOwned, 'ctx.magnifiersOwned matches S');
eq(ctx.researchLevel, S.researchLevel, 'ctx.researchLevel matches S');

// Display-only
ok(typeof ctx.externalResearchPct === 'number', 'ctx.externalResearchPct is number');
eq(ctx.externalResearchPct, S.externalResearchPct, 'ctx.externalResearchPct matches S');

// ============================================================
// 6. makeCtx — derived context from saveCtx
// ============================================================
console.log('--- makeCtx ---');

const mctx = makeCtx(ctx.gridLevels, ctx);
ok(typeof mctx === 'object', 'makeCtx returns object');
ok(typeof mctx.abm === 'number', 'abm is number');
ok(mctx.abm >= 1, 'abm >= 1');
ok(typeof mctx.c52 === 'number', 'c52 is number');
ok(typeof mctx.stickerFixed === 'number', 'stickerFixed is number');
ok(typeof mctx.boonyCount === 'number', 'boonyCount is number');

// ============================================================
// 7. computeMagnifiersOwnedWith (pure)
// ============================================================
console.log('--- computeMagnifiersOwnedWith ---');

const magOwned = computeMagnifiersOwnedWith(S.gridLevels, S.researchLevel, ctx);
eq(magOwned, S.magnifiersOwned, 'computeMagnifiersOwnedWith matches loader result');

// At level 0 with zeroed grid, should be 1 + shopBonuses + mineheadBonuses
const zeroGL = new Array(GRID_SIZE).fill(0);
const magLv0 = computeMagnifiersOwnedWith(zeroGL, 0, ctx);
ok(magLv0 >= 1, 'magnifiers at lv0 >= 1 (base)');
ok(magLv0 <= magOwned, 'magnifiers at lv0 <= full magnifiers');

// ============================================================
// 8. computeShapesOwnedAt (pure)
// ============================================================
console.log('--- computeShapesOwnedAt ---');

const shapes0 = computeShapesOwnedAt(0, ctx);
ok(shapes0 >= 0 && shapes0 <= 10, 'shapes at lv0 in [0,10]');
const shapes200 = computeShapesOwnedAt(200, ctx);
ok(shapes200 >= shapes0, 'shapes at lv200 >= shapes at lv0');
ok(shapes200 <= 10, 'shapes capped at 10');

// ============================================================
// 9. calcAllBonusMulti
// ============================================================
console.log('--- calcAllBonusMulti ---');

const abm = calcAllBonusMulti(S.gridLevels);
ok(typeof abm === 'number', 'calcAllBonusMulti returns number');
ok(abm >= 1, 'abm >= 1');
eq(abm, S.allBonusMulti, 'calcAllBonusMulti matches S.allBonusMulti');

// ============================================================
// 10. Other pure external helpers
// ============================================================
console.log('--- other external helpers ---');

// grimoireUpgBonus22
const gub22 = grimoireUpgBonus22();
ok(typeof gub22 === 'number', 'grimoireUpgBonus22 returns number');
ok(gub22 >= 0, 'grimoireUpgBonus22 >= 0');

// exoticBonusQTY40
const exo40 = exoticBonusQTY40();
ok(typeof exo40 === 'number', 'exoticBonusQTY40 returns number');
ok(exo40 >= 0, 'exoticBonusQTY40 >= 0');

// computeCardLv
const clv = computeCardLv('w7b1');
ok(typeof clv === 'number', 'computeCardLv returns number');
ok(clv >= 0 && clv <= 7, 'card level in valid range');

// computeShinyBonusS
const shiny = computeShinyBonusS(20);
ok(typeof shiny === 'number', 'computeShinyBonusS returns number');
ok(shiny >= 0, 'shinyBonusS >= 0');

// ===== Summary =====
console.log(`\n${pass} passed, ${fail} failed (${pass + fail} total)`);
process.exit(fail > 0 ? 1 : 0);
