// Save loader & external bonus tests: loadSaveData, buildSaveContext,
// mineheadBonusQTY, computeExternalBonuses, computeAFKGainsRate.
// Run:  node js/tests/test-save-loader.js

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSaveData } from '../save/loader.js';
import { buildSaveContext, makeSimCtx } from '../save/context.js';
import afkGainsDesc from '../stats/defs/research-afk-gains.js';
import { mineheadBonusQTY } from '../stats/systems/w7/research.js';
import { computeCardLv } from '../stats/systems/common/cards.js';
import { computeShinyBonusS } from '../stats/systems/w4/breeding.js';
import { grimoireUpgBonus22 } from '../stats/systems/mc/grimoire.js';
import resExpDesc from '../stats/defs/research-exp.js';
import { exoticBonusQTY40 } from '../stats/systems/w6/farming.js';
import { saveData } from '../state.js';
import { GRID_SIZE } from '../game-data.js';
import { MINEHEAD_BONUS_QTY } from '../stats/data/w7/minehead.js';
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

ok(typeof saveData.researchLevel === 'number' && saveData.researchLevel > 0, 'researchLevel is positive number');
ok(saveData.researchLevel >= 10 && saveData.researchLevel <= 200, 'researchLevel in [10, 200]');

ok(typeof saveData.magnifiersOwned === 'number' && saveData.magnifiersOwned > 0, 'magnifiersOwned > 0');
ok(saveData.magnifiersOwned >= 4 && saveData.magnifiersOwned <= 30, 'magnifiersOwned in [4, 30]');

ok(Array.isArray(saveData.gridLevels), 'gridLevels is array');
eq(saveData.gridLevels.length, GRID_SIZE, 'gridLevels length === GRID_SIZE');
ok(saveData.gridLevels.some(v => v > 0), 'gridLevels has nonzero entries');

ok(Array.isArray(saveData.shapeOverlay), 'shapeOverlay is array');
eq(saveData.shapeOverlay.length, GRID_SIZE, 'shapeOverlay length === GRID_SIZE');

ok(Array.isArray(saveData.occFound), 'occFound is array');
ok(saveData.occFound.length >= 40, 'occFound length >= 40');

ok(Array.isArray(saveData.insightLvs), 'insightLvs is array');
ok(Array.isArray(saveData.insightProgress), 'insightProgress is array');

ok(Array.isArray(saveData.magData), 'magData is array');
ok(saveData.magData.length > 0, 'magData has entries');
// Each mag entry has {x, y, slot, type}
const mag0 = saveData.magData[0];
ok(mag0 && 'x' in mag0 && 'y' in mag0 && 'slot' in mag0 && 'type' in mag0,
  'magData[0] has x,y,slot,type');

ok(Array.isArray(saveData.shapePositions), 'shapePositions is array');
if (saveData.shapePositions.length > 0) {
  const sp0 = saveData.shapePositions[0];
  ok(sp0 && 'x' in sp0 && 'y' in sp0 && 'rot' in sp0, 'shapePositions[0] has x,y,rot');
}

ok(saveData.magMaxPerSlot >= 1 && saveData.magMaxPerSlot <= 4, 'magMaxPerSlot in [1,4]');
ok(typeof saveData.cachedEventShopStr === 'string', 'cachedEventShopStr is string');
ok(typeof saveData.comp52TrueMulti === 'number', 'comp52TrueMulti is number');
ok(typeof saveData.allBonusMulti === 'number', 'allBonusMulti is number');
ok(typeof saveData.externalResearchPct === 'number', 'externalResearchPct is number');
ok(saveData.externalResearchPct > 0, 'externalResearchPct > 0');

// Companion ids parsed
ok(saveData.companionIds instanceof Set, 'companionIds is Set');

// Arrays populated
ok(Array.isArray(saveData.olaData), 'olaData is array');
ok(Array.isArray(saveData.gamingData), 'gamingData is array');
ok(Array.isArray(saveData.spelunkData), 'spelunkData is array');
ok(typeof saveData.cards0Data === 'object', 'cards0Data is object');
ok(Array.isArray(saveData.ribbonData), 'ribbonData is array');
ok(Array.isArray(saveData.breedingData), 'breedingData is array');
ok(Array.isArray(saveData.arcaneData), 'arcaneData is array');
ok(Array.isArray(saveData.summonData), 'summonData is array');

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
// 3. research-exp descriptor — integration
// ============================================================
console.log('--- research-exp descriptor ---');

const rexp = resExpDesc.combine({}, { saveData });
ok(rexp && typeof rexp === 'object', 'descriptor returns object');
ok(typeof rexp.val === 'number', 'val is number');
ok(rexp.val > 0, 'val > 0');
ok(Array.isArray(rexp.children), 'children is array');
ok(rexp.children.length > 0, 'children has items');
approx(rexp.val, saveData.externalResearchPct, 0.001, 'descriptor val matches saveData.externalResearchPct');

// Re-computation should yield same result
const rexp2 = resExpDesc.combine({}, { saveData });
approx(rexp2.val, rexp.val, 0.001, 'recomputed val matches');

// ============================================================
// 4. computeAFKGainsRate
// ============================================================
console.log('--- computeAFKGainsRate ---');

const afk = afkGainsDesc.combine({}, { saveData });
ok(typeof afk === 'object', 'afkGainsDesc returns object');
ok(typeof afk.val === 'number', 'val is number');
ok(afk.val >= 0.01 && afk.val <= 1, 'val in [0.01, 1]');
ok(Array.isArray(afk.children), 'children is array');

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
eq(ctx.gridLevels, saveData.gridLevels, 'ctx.gridLevels === saveData.gridLevels (same ref)');
ok(Array.isArray(ctx.insightLvs), 'ctx.insightLvs is array');
ok(Array.isArray(ctx.insightProgress), 'ctx.insightProgress is array');
ok(Array.isArray(ctx.occFound), 'ctx.occFound is array');
ok(Array.isArray(ctx.magData), 'ctx.magData is array');
ok(Array.isArray(ctx.shapePositions), 'ctx.shapePositions is array');
ok(typeof ctx.magnifiersOwned === 'number', 'ctx.magnifiersOwned is number');
eq(ctx.magnifiersOwned, saveData.magnifiersOwned, 'ctx.magnifiersOwned matches saveData');
eq(ctx.researchLevel, saveData.researchLevel, 'ctx.researchLevel matches saveData');

// Display-only
ok(typeof ctx.externalResearchPct === 'number', 'ctx.externalResearchPct is number');
eq(ctx.externalResearchPct, saveData.externalResearchPct, 'ctx.externalResearchPct matches saveData');

// ============================================================
// 6. makeCtx — derived context from saveCtx
// ============================================================
console.log('--- makeCtx ---');

const mctx = makeSimCtx(ctx.gridLevels);
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

const magOwned = computeMagnifiersOwnedWith(saveData.gridLevels, saveData.researchLevel, ctx);
eq(magOwned, saveData.magnifiersOwned, 'computeMagnifiersOwnedWith matches loader result');

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
// 9. allBonusMulti (inlined)
// ============================================================
console.log('--- allBonusMulti ---');

const comp55v = saveData.companionIds.has(55) ? 15 : 0;
const comp0v = saveData.companionIds.has(0) && saveData.cachedComp0DivOk && (saveData.gridLevels[173] || 0) > 0 ? 5 : 0;
const abm = 1 + (comp55v + comp0v) / 100;
ok(typeof abm === 'number', 'allBonusMulti is number');
ok(abm >= 1, 'abm >= 1');
eq(abm, saveData.allBonusMulti, 'inlined abm matches saveData.allBonusMulti');

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
