// ===== ANALYSIS FUNCTIONS =====
// Insight ROI, obs unlock priority, mag type balance.

import { GRID_INDICES, GRID_SIZE, OCC_DATA, RES_GRID_RAW } from './game-data.js';
import {
  computeOccurrencesToBeFound,
  countMagTypes,
  getAvailableSlots,
  insightExpRate,
  insightExpReqAt,
  simTotalExpWith,
} from './sim-math.js';
import { makeSimCtx } from './save/context.js';
import { computeCellValues } from './optimizers/shapes.js';
import {
  evalMagScoreWith,
  optimizeMagsFor,
} from './optimizers/magnifiers.js';
import { chooseMonoTargets, buildConcentratedLayout } from './optimizers/monos.js';
import { optimizeShapesFor, optimizePostGrind } from './sim-engine.js';

function _resolveState(state, saveCtx) {
  const { gl, so, il, occ, rLv, mMax, mOwned, md, ip, failedRolls } = state;
  return { gl, so, il, occ, rLv, mMax, mOwned, md, ip, failedRolls, ctx: makeSimCtx(gl, saveCtx) };
}

export async function computeMagTypeBalance(state, saveCtx) {
  const { gl, so, il, occ, rLv, mMax, mOwned, md, ctx } = _resolveState(state, saveCtx);
  const pool = md.slice(0, mOwned);
  const { regular: numR, mono: numM, kalei: numK } = countMagTypes(pool);
  const resTotal = simTotalExpWith(gl, so, pool, il, occ, rLv, ctx);
  const baseScore = evalMagScoreWith(pool, gl, so, il, occ, rLv, ctx);
  const resMulti = baseScore > 0 ? resTotal / baseScore : 1;
  const results = [];

  for (const addType of [0, 1, 2]) {
    const testMags = pool.map(m => ({...m}));
    testMags.push({ x:0, y:0, slot:-1, type: addType });
    const optMags = await optimizeMagsFor({gl, so, md: testMags, il, occ, rLv, mOwned: mOwned + 1, mMax}, ctx);
    const optScore = evalMagScoreWith(optMags, gl, so, il, occ, rLv, ctx);
    results.push({
      type: addType,
      typeName: ['Magnifier','Monocle','Kaleidoscope'][addType],
      count: [numR,numM,numK][addType],
      immediateExpHr: optScore * resMulti,
    });
  }
  const currentScore = baseScore * resMulti;
  for (const r of results) r.deltaImmediate = r.immediateExpHr - currentScore;
  results.sort((a, b) => b.deltaImmediate - a.deltaImmediate);
  return results;
}

export function computeInsightCellValues(obsIdx, md, il, gl, so, saveCtx) {
  const ctx = makeSimCtx(gl, saveCtx);
  const bareSO = new Array(GRID_SIZE).fill(-1);
  const baseIR = insightExpRate(obsIdx, md, il, gl, bareSO, ctx);
  const values = new Array(GRID_SIZE).fill(0);
  const testSO = bareSO.slice();
  for (const idx of GRID_INDICES) {
    const lv = gl[idx] || 0;
    if (lv === 0) continue;
    testSO[idx] = 0; // 25% shape
    const testIR = insightExpRate(obsIdx, md, il, gl, testSO, ctx);
    values[idx] = testIR - baseIR;
    testSO[idx] = -1; // restore
  }
  return values;
}

export async function computeInsightROI(onProgress, state, saveCtx) {
  const { gl, so, il, occ, rLv, mMax, mOwned, md, ip, ctx } = _resolveState(state, saveCtx);
  const occTBF = computeOccurrencesToBeFound(rLv, occ);
  const pool = md.slice(0, mOwned);
  const { mono: monoCount, kalei: numKalei, regular: numRegular } = countMagTypes(pool);
  if (monoCount === 0) return { monoCount: 0, rows: [] };
  // Compute optimal baseline rate: re-optimize mags+monocles for current state
  // so ROI is always vs best non-grind layout, not the user's possibly-mid-grind layout.
  const optBaseMD = await optimizeMagsFor({gl, so, md: pool, il, occ, rLv, mOwned, mMax}, ctx);
  const optBaseFull = chooseMonoTargets({gl, so, md: optBaseMD, il, ip, occ, rLv, mMax}, ctx, 24);
  const baseRate = simTotalExpWith(gl, so, optBaseFull, il, occ, rLv, ctx);
  // evalLayout: compute break-even for a grind scenario.
  // grindSO: optional shape overlay to use during the grind (null = use current so).
  // afterMD/afterSO: optional post-grind layouts for computing the "after" rate.
  function evalLayout(mdLayout, obsIdx, targetLvGain, currentProgress, grindSO, afterMD, afterSO) {
    const useSO = grindSO || so;
    let totalGrindHrs = 0, simIP = currentProgress, simLv = il[obsIdx]||0;
    for (let g=0;g<targetLvGain;g++) {
      const iRate = insightExpRate(obsIdx,mdLayout,il,gl,useSO,ctx);
      if (iRate<=0) { totalGrindHrs=Infinity; break; }
      totalGrindHrs += Math.max(0, insightExpReqAt(obsIdx,simLv)-simIP)/iRate;
      simIP=0; simLv++;
    }
    const grindRate = simTotalExpWith(gl, useSO, mdLayout, il, occ, rLv, ctx);
    const expLostPerHr = Math.max(0, baseRate - grindRate);
    const totalExpLost = expLostPerHr * totalGrindHrs;
    const newIL = il.slice(); newIL[obsIdx] = (il[obsIdx]||0)+targetLvGain;
    // Post-grind rate: use after layouts if provided, otherwise baseline with new insight
    const postRate = afterMD && afterSO
      ? simTotalExpWith(gl, afterSO, afterMD, newIL, occ, rLv, ctx)
      : simTotalExpWith(gl, so, optBaseFull, newIL, occ, rLv, ctx);
    const rateGain = postRate - baseRate;
    const recoupHrs = rateGain > 0 ? totalExpLost / rateGain : Infinity;
    const breakEvenHrs = totalGrindHrs + recoupHrs;
    return { grindHrs:totalGrindHrs, grindRate, expLostPerHr, totalExpLost,
      postRate, rateGain, recoupHrs, breakEvenHrs,
      worth:isFinite(breakEvenHrs)&&rateGain>0,
      insightRate:insightExpRate(obsIdx,mdLayout,il,gl,useSO,ctx) };
  }
  const usableIndices = getAvailableSlots(rLv, occ);
  const totalUsable = usableIndices.length;
  const rows = []; let processed = 0;
  for (const i of usableIndices) {
    const name = OCC_DATA[i].name.replace(/_/g,' ');
    const lv = il[i]||0, progress = ip[i]||0;
    // Build grind layout using concentrated layout builder (same as optimizer)
    const grindMD = buildConcentratedLayout({md: optBaseFull, mMax, gl, so, il, occ, rLv}, i, ctx);

    // Optimize shapes for insight grind: boost cells that affect insight rate
    const insightCV = computeInsightCellValues(i, grindMD, il, gl, so, saveCtx);
    // Blend: primarily insight rate, secondarily research EXP (to avoid tanking EXP more than needed)
    const researchCV = computeCellValues({gridLevels:gl, shapeOverlay:so, magData:pool, insightLvs:il, occFound:occ, researchLevel:rLv, saveCtx});
    const maxInsight = Math.max(0.001, ...insightCV.filter(v => v > 0));
    const maxResearch = Math.max(0.001, ...researchCV.filter(v => v > 0));
    const blendedCV = new Array(GRID_SIZE).fill(0);
    for (let ci = 0; ci < GRID_SIZE; ci++) {
      // 70% insight priority, 30% research to avoid unnecessary EXP loss
      blendedCV[ci] = 0.7 * (insightCV[ci] / maxInsight) + 0.3 * (researchCV[ci] / maxResearch);
    }
    const insightShapeResult = optimizeShapesFor({gl, so, md: grindMD, il, occ, rLv}, undefined, blendedCV, saveCtx);
    const insightSO = insightShapeResult.overlay;

    // Build grind layout with insight shapes (kaleidoscope placement may differ)
    const grindMD_IS = buildConcentratedLayout({md: optBaseFull, mMax, gl, so: insightSO, il, occ, rLv}, i, ctx);

    // Compute after-grind layouts (re-optimized mags + shapes with new insight levels)
    const newIL = il.slice(); newIL[i] = (il[i]||0)+1;
    const after1 = await optimizePostGrind({gl, so, md: pool, ip, occ, rLv, mOwned, mMax}, newIL, ctx, 24, saveCtx);
    const afterMD = after1.md, afterSO = after1.so;

    // Decide: use insight shapes or current shapes? Pick whichever gives better break-even.
    const evCurrent = evalLayout(grindMD, i, 1, progress, null, afterMD, afterSO);
    const evInsight = evalLayout(grindMD_IS, i, 1, progress, insightSO, afterMD, afterSO);
    let useInsightShapes = false;
    if (evInsight.breakEvenHrs < evCurrent.breakEvenHrs) useInsightShapes = true;

    const chosenGrindMD = useInsightShapes ? grindMD_IS : grindMD;
    const chosenSO = useInsightShapes ? insightSO : null;

    const scenarios = [];
    for (const targetLvGain of [1,2]) {
      // For +2, recompute after layouts
      let aftMD2 = afterMD, aftSO2 = afterSO;
      if (targetLvGain > 1) {
        const newIL2 = il.slice(); newIL2[i] = (il[i]||0)+targetLvGain;
        const after2 = await optimizePostGrind({gl, so, md: pool, ip, occ, rLv, mOwned, mMax}, newIL2, ctx, 24, saveCtx);
        aftMD2 = after2.md;
        aftSO2 = after2.so;
      }
      const ev = evalLayout(chosenGrindMD, i, targetLvGain, progress, chosenSO, aftMD2, aftSO2);
      ev.lvGain = targetLvGain;
      ev.afterMD = aftMD2;
      ev.afterSO = aftSO2;
      scenarios.push(ev);
    }
    rows.push({
      idx:i, name, lv, progress, scenarios,
      grindLayout: chosenGrindMD,
      grindSO: chosenSO,
      useInsightShapes,
      afterLayout: afterMD,
      afterSO,
    });
    processed++;
    if (onProgress) onProgress(processed, totalUsable);
    if (processed%3===0) await new Promise(r=>setTimeout(r,0));
  }
  rows.sort((a,b)=>(a.scenarios[0]?.breakEvenHrs??Infinity)-(b.scenarios[0]?.breakEvenHrs??Infinity));
  return { monoCount, baseRate, rows, baselineLayout:optBaseFull.slice(), baselineSO:so.slice() };
}

export async function computeObsUnlockPriority(onProgress, state, saveCtx) {
  const { gl, so, il, occ, md, mOwned, mMax, rLv, failedRolls, ctx } = _resolveState(state, saveCtx);
  const currentTotal = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
  const smartEyeLv = gl[31]||0, sharpEyeLv = gl[51]||0, obsLv = gl[90]||0;
  const maxRoll = Math.floor(100 + sharpEyeLv);
  const smartEyePerFail = smartEyeLv, smartEyeCap = 25*smartEyeLv;
  const rollsPerDay = Math.round(3 + obsLv + 3*saveCtx.evShop35);
  const results = [], undiscovered = [];
  for (let t=0;t<OCC_DATA.length;t++) if ((occ[t]||0)<1) undiscovered.push(t);
  const totalUndiscovered = undiscovered.length;
  let processed = 0;
  for (const t of undiscovered) {
    const name = OCC_DATA[t].name.replace(/_/g,' ');
    const rollThreshold = OCC_DATA[t].rollReq, requiredRLv = OCC_DATA[t].roll;
    let pFailAll = 1, simFails = failedRolls;
    for (let r=0;r<rollsPerDay;r++) {
      const minRoll = Math.floor(1 + Math.min(simFails*smartEyePerFail, smartEyeCap));
      const range = maxRoll - minRoll + 1;
      if (range <= 0) { pFailAll=0; break; }
      const successRange = Math.max(0, maxRoll - rollThreshold + 1);
      pFailAll *= (1 - Math.min(1, Math.max(0, successRange / range)));
      if (pFailAll <= 0) break;
      simFails++;
    }
    const pUnlockToday = 1 - pFailAll;
    let expectedDays = Infinity;
    if (pUnlockToday >= 1) { expectedDays = 1; }
    else if (pUnlockToday > 0) {
      let cumProb=0, eDays=0, simF=failedRolls;
      for (let day=1;day<=365;day++) {
        let pFailDay = 1;
        for (let r=0;r<rollsPerDay;r++) {
          const minR = Math.floor(1 + Math.min(simF*smartEyePerFail, smartEyeCap));
          const rng = maxRoll - minR + 1;
          if (rng <= 0) { pFailDay=0; break; }
          const sr = Math.max(0, maxRoll - rollThreshold + 1);
          pFailDay *= (1 - Math.min(1, Math.max(0, sr / rng)));
          if (pFailDay <= 0) break;
          simF++;
        }
        const pFirstSuccess = (1-cumProb)*(1-pFailDay);
        eDays += day*pFirstSuccess; cumProb += pFirstSuccess;
        if (cumProb >= 0.9999) break;
      }
      expectedDays = cumProb > 0 ? eDays/cumProb : Infinity;
    }
    const canUseNow = rLv >= requiredRLv;
    const tempOF = occ.slice(); tempOF[t] = 1;
    await new Promise(r=>setTimeout(r,0));
    const tempMD = await optimizeMagsFor({gl, so, md, il, occ: tempOF, rLv, mOwned, mMax}, ctx);
    const newRate = simTotalExpWith(gl, so, tempMD, il, tempOF, rLv, ctx);
    const expGain = canUseNow ? newRate - currentTotal : 0;
    const score = expectedDays > 0 && isFinite(expectedDays) ? expGain / expectedDays : 0;
    results.push({ idx:t, name, rollThreshold, requiredRLv, canUseNow,
      maxRoll, rollsPerDay, failedRolls,
      pUnlockToday, expectedDays, expGain, newRate, score });
    processed++;
    if (onProgress) onProgress(processed, totalUndiscovered);
  }
  results.sort((a,b)=>{ if (a.canUseNow!==b.canUseNow) return a.canUseNow?-1:1; return b.score-a.score; });
  return { results, currentTotal, maxRoll, rollsPerDay, failedRolls, smartEyeLv, smartEyeCap };
}

