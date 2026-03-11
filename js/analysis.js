// ===== ANALYSIS FUNCTIONS =====
// Insight ROI, obs unlock priority, mag type balance.

import {
  cachedFailedRolls,
  gridLevels,
  insightLvs,
  insightProgress,
  magData,
  magMaxPerSlot,
  magnifiersOwned,
  occFound,
  researchLevel,
  shapeOverlay,
} from './state.js';
import { GRID_SIZE, OCC_DATA, RES_GRID_RAW } from './game-data.js';
import {
  computeOccurrencesToBeFound,
  countMagTypes,
  getAvailableSlots,
  insightExpRate,
  insightExpReqAt,
  isObsUsable,
  simTotalExpWith,
} from './sim-math.js';
import { eventShopOwned } from './save/helpers.js';
import { makeCtx } from './save/context.js';
import { computeCellValues } from './optimizers/shapes.js';
import {
  _evalMagScoreWith,
  optimizeMagsFor,
} from './optimizers/magnifiers.js';
import { chooseMonoTargets } from './optimizers/monos.js';
import { optimizeShapesFor } from './sim-engine.js';

function _resolveState(state) {
  const gl = state ? state.gl : gridLevels;
  const so = state ? state.so : shapeOverlay;
  const il = state ? state.il : insightLvs;
  const occ = state ? state.occ : occFound;
  const rLv = state ? state.rLv : researchLevel;
  const mMax = state ? state.mMax : magMaxPerSlot;
  const mOwned = state ? state.mOwned : magnifiersOwned;
  const md = state ? state.md : magData;
  const ip = state ? state.ip : insightProgress;
  const failedRolls = state ? state.failedRolls : cachedFailedRolls;
  return { gl, so, il, occ, rLv, mMax, mOwned, md, ip, failedRolls, ctx: makeCtx(gl) };
}

export async function computeMagTypeBalance(state) {
  const { gl, so, il, occ, rLv, mMax, mOwned, md, ctx } = _resolveState(state);
  const pool = md.slice(0, mOwned);
  const { regular: numR, mono: numM, kalei: numK } = countMagTypes(pool);
  const resTotal = simTotalExpWith(gl, so, pool, il, occ, rLv, ctx);
  const baseScore = _evalMagScoreWith(pool, gl, so, il, occ, rLv);
  const resMulti = baseScore > 0 ? resTotal / baseScore : 1;
  const results = [];

  for (const addType of [0, 1, 2]) {
    const testMags = pool.map(m => ({...m}));
    testMags.push({ x:0, y:0, slot:-1, type: addType });
    const optMags = await optimizeMagsFor({gl, so, md: testMags, il, occ, rLv, mOwned: mOwned + 1, mMax});
    const optScore = _evalMagScoreWith(optMags, gl, so, il, occ, rLv);
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

export function _computeInsightCellValues(obsIdx, md, il, gl, so) {
  const ctx = makeCtx(gl);
  const bareSO = new Array(GRID_SIZE).fill(-1);
  const baseIR = insightExpRate(obsIdx, md, il, gl, bareSO, ctx);
  const values = new Array(GRID_SIZE).fill(0);
  for (const idx of Object.keys(RES_GRID_RAW).map(Number)) {
    const lv = gl[idx] || 0;
    if (lv === 0) continue;
    const testSO = bareSO.slice();
    testSO[idx] = 0; // 25% shape
    const testIR = insightExpRate(obsIdx, md, il, gl, testSO, ctx);
    values[idx] = testIR - baseIR;
  }
  return values;
}

export async function computeInsightROI(onProgress, state) {
  const { gl, so, il, occ, rLv, mMax, mOwned, md, ip, ctx } = _resolveState(state);
  const occTBF = computeOccurrencesToBeFound(rLv, occ);
  const pool = md.slice(0, mOwned);
  const { mono: monoCount, kalei: numKalei, regular: numRegular } = countMagTypes(pool);
  if (monoCount === 0) return { monoCount: 0, rows: [] };
  // Compute optimal baseline rate: re-optimize mags+monocles for current state
  // so ROI is always vs best non-grind layout, not the user's possibly-mid-grind layout.
  const optBaseMD = await optimizeMagsFor({gl, so, md: pool, il, occ, rLv, mOwned, mMax});
  const optBaseFull = chooseMonoTargets({gl, so, md: optBaseMD, il, ip, occ, rLv, mMax}, ctx, 24);
  const baseRate = simTotalExpWith(gl, so, optBaseFull, il, occ, rLv, ctx);
  const availSlots = getAvailableSlots(rLv, occ);
  function buildLayout(targetObs, nAdjKalei) {
    const assigned = [], slotCounts = new Map();
    function _assign(type, slot) { assigned.push({ type, slot, x:0, y:0 }); slotCounts.set(slot, (slotCounts.get(slot)||0)+1); }
    const monoOnTarget = Math.min(monoCount, mMax);
    for (let k = 0; k < monoOnTarget; k++) _assign(1, targetObs);
    if (nAdjKalei > 0) {
      const adj = [], t = targetObs;
      if (t%8!==0) adj.push(t-1); if (t%8!==7) adj.push(t+1);
      if (t>=8) adj.push(t-8); if (t+8<80) adj.push(t+8);
      let placed = 0;
      for (const s of adj) {
        if (placed >= nAdjKalei) break;
        if (s<0||s>=occTBF||!isObsUsable(s,rLv,occ)) continue;
        if ((slotCounts.get(s)||0)>=mMax) continue;
        _assign(2, s); placed++;
      }
    }
    const preKalei = assigned.filter(a=>a.type===2).length;
    const remainKalei = numKalei - preKalei;
    const toPlace = [];
    for (let k=0;k<monoCount-monoOnTarget;k++) toPlace.push(1);
    for (let k=0;k<remainKalei;k++) toPlace.push(2);
    for (let k=0;k<numRegular;k++) toPlace.push(0);
    while (toPlace.length > 0) {
      let bestPI = -1, bestSlot = -1, bestScore = -Infinity;
      const triedTypes = new Set();
      for (let pi=0;pi<toPlace.length;pi++) {
        const magType = toPlace[pi]; if (triedTypes.has(magType)) continue; triedTypes.add(magType);
        for (const slot of availSlots) {
          if ((slotCounts.get(slot)||0)>=mMax) continue;
          const trial = [...assigned, {type:magType,slot,x:0,y:0}];
          const score = _evalMagScoreWith(trial,gl,so,il,occ,rLv);
          if (score > bestScore) { bestScore=score; bestSlot=slot; bestPI=pi; }
        }
      }
      if (bestPI >= 0) { _assign(toPlace[bestPI], bestSlot); toPlace.splice(bestPI,1); } else break;
    }
    return assigned;
  }
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
    const maxAdj = Math.min(numKalei, 4), layouts = [];
    for (let nAdj=0;nAdj<=maxAdj;nAdj++) layouts.push({nAdj,md:buildLayout(i,nAdj)});

    // Find best mag layout (by break-even with current shapes)
    let bestLayout = layouts[0], bestBE = Infinity;
    for (const l of layouts) { const ev = evalLayout(l.md,i,1,progress); if (ev.breakEvenHrs<bestBE) { bestBE=ev.breakEvenHrs; bestLayout=l; } }

    // Optimize shapes for insight grind: boost cells that affect insight rate
    const insightCV = _computeInsightCellValues(i, bestLayout.md, il, gl, so);
    // Blend: primarily insight rate, secondarily research EXP (to avoid tanking EXP more than needed)
    const researchCV = computeCellValues({gridLevels:gl, shapeOverlay:so, magData:pool, insightLvs:il, occFound:occ, researchLevel:rLv});
    const maxInsight = Math.max(0.001, ...insightCV.filter(v => v > 0));
    const maxResearch = Math.max(0.001, ...researchCV.filter(v => v > 0));
    const blendedCV = new Array(GRID_SIZE).fill(0);
    for (let ci = 0; ci < GRID_SIZE; ci++) {
      // 70% insight priority, 30% research to avoid unnecessary EXP loss
      blendedCV[ci] = 0.7 * (insightCV[ci] / maxInsight) + 0.3 * (researchCV[ci] / maxResearch);
    }
    const insightShapeResult = optimizeShapesFor({gl, so, md: bestLayout.md, il, occ, rLv}, undefined, blendedCV);
    const insightSO = insightShapeResult.overlay;

    // Also re-find best mag layout with insight shapes (kaleidoscope effect may differ)
    let bestLayoutIS = bestLayout, bestBE_IS = Infinity;
    for (const l of layouts) {
      const ev = evalLayout(l.md, i, 1, progress, insightSO);
      if (ev.breakEvenHrs < bestBE_IS) { bestBE_IS = ev.breakEvenHrs; bestLayoutIS = l; }
    }

    // Compute after-grind layouts (re-optimized mags + shapes with new insight levels)
    const newIL = il.slice(); newIL[i] = (il[i]||0)+1;
    const afterMDRaw = await optimizeMagsFor({gl, so, md: pool, il: newIL, occ, rLv, mOwned, mMax});
    const afterMD = chooseMonoTargets({gl, so, md: afterMDRaw, il: newIL, ip, occ, rLv, mMax}, ctx, 24);
    const afterShapeResult = optimizeShapesFor({gl, so, md: afterMD, il: newIL, occ, rLv});
    const afterSO = afterShapeResult.overlay;

    // Decide: use insight shapes or current shapes? Pick whichever gives better break-even.
    const evCurrent = evalLayout(bestLayout.md, i, 1, progress, null, afterMD, afterSO);
    const evInsight = evalLayout(bestLayoutIS.md, i, 1, progress, insightSO, afterMD, afterSO);
    let useInsightShapes = false;
    if (evInsight.breakEvenHrs < evCurrent.breakEvenHrs) useInsightShapes = true;

    const chosenMagLayout = useInsightShapes ? bestLayoutIS : bestLayout;
    const chosenSO = useInsightShapes ? insightSO : null;

    const scenarios = [];
    for (const targetLvGain of [1,2]) {
      // For +2, recompute after layouts
      let aftMD2 = afterMD, aftSO2 = afterSO;
      if (targetLvGain > 1) {
        const newIL2 = il.slice(); newIL2[i] = (il[i]||0)+targetLvGain;
        const aftMD2Raw = await optimizeMagsFor({gl, so, md: pool, il: newIL2, occ, rLv, mOwned, mMax});
        aftMD2 = chooseMonoTargets({gl, so, md: aftMD2Raw, il: newIL2, ip, occ, rLv, mMax}, ctx, 24);
        const aftShape2 = optimizeShapesFor({gl, so, md: aftMD2, il: newIL2, occ, rLv});
        aftSO2 = aftShape2.overlay;
      }
      const ev = evalLayout(chosenMagLayout.md, i, targetLvGain, progress, chosenSO, aftMD2, aftSO2);
      ev.lvGain = targetLvGain;
      ev.adjKalei = chosenMagLayout.nAdj;
      ev.afterMD = aftMD2;
      ev.afterSO = aftSO2;
      scenarios.push(ev);
    }
    rows.push({
      idx:i, name, lv, progress, scenarios,
      grindLayout: chosenMagLayout.md,
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

export async function computeObsUnlockPriority(onProgress, state) {
  const { gl, so, il, occ, md, mOwned, mMax, rLv, failedRolls, ctx } = _resolveState(state);
  const currentTotal = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
  const smartEyeLv = gl[31]||0, sharpEyeLv = gl[51]||0, obsLv = gl[90]||0;
  const maxRoll = Math.floor(100 + sharpEyeLv);
  const smartEyePerFail = smartEyeLv, smartEyeCap = 25*smartEyeLv;
  const rollsPerDay = Math.round(3 + obsLv + 3*eventShopOwned(35));
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
    const tempMD = await optimizeMagsFor({gl, so, md, il, occ: tempOF, rLv, mOwned, mMax});
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

