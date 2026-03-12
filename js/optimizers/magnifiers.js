// ===== MAGNIFIER OPTIMIZATION =====

import { OCC_DATA } from '../game-data.js';
import {
  buildKalMap,
  gbWith,
  computeOccurrencesToBeFound,
  countMagTypes,
  getAvailableSlots,
  getKaleiMultiBase,
  obsBaseExp,
} from '../sim-math.js';

import { chooseMonoTargets } from './monos.js';
import { enumKalMags } from './mags.js';

export async function optimizeMagsFor(s, ctx) {
  const gl = s.gl, so = s.so, md = s.md, il = s.il, occ = s.occ, rLv = s.rLv;
  const ownedCount = s.mOwned, maxPerSlot = s.mMax;
  const availSlots = getAvailableSlots(rLv, occ);
  const pool = md.slice(0, ownedCount);
  const { kalei: numKalei, regular: numRegular, mono: numMono } = countMagTypes(pool);
  const kalBase = getKaleiMultiBase(gl, so, ctx);
  const gd101 = gbWith(gl, so, 93, ctx);

  // Reserve room for monocles: reduce regular mags so total slots used
  // by mags+kaleidos leaves enough room for monocles to be placed.
  // Without this, _enumKalMags fills all slots to maxPerSlot, leaving
  // monoRoom=0 everywhere and monocles can't be assigned.
  const totalSlotRoom = availSlots.length * maxPerSlot;
  const magKalCount = numKalei + numRegular;
  const regsToPlace = (magKalCount + numMono > totalSlotRoom)
    ? Math.max(0, numRegular - Math.max(0, magKalCount + numMono - totalSlotRoom))
    : numRegular;

  let assigned = await enumKalMags(availSlots, numKalei, regsToPlace, kalBase, gd101, il, maxPerSlot);

  // Append monocles unassigned; chooseMonoTargets will place them
  for (let i = 0; i < numMono; i++) assigned.push({type: 1, slot: -1, x:0, y:0});
  return assigned;
}

export function evalMagScoreWith(trialMags, gl, so, il, occ, rLv, ctx) {
  const kalMap = buildKalMap(trialMags);
  const kalBase = getKaleiMultiBase(gl, so, ctx);
  const gd101 = gbWith(gl, so, 93, ctx);
  const occTBF = computeOccurrencesToBeFound(rLv, occ);
  let total = 0;
  for (let i = 0; i < occTBF; i++) {
    if ((occ[i] || 0) < 1) continue;
    if (!(OCC_DATA[i] && rLv >= OCC_DATA[i].roll)) continue;
    let count = 0;
    for (const m of trialMags) { if (m.type === 0 && m.slot === i) count++; }
    if (count === 0) continue;
    const t = i;
    const base = obsBaseExp(t);
    total += count * base * (1 + gd101 * (il[t] || 0) / 100) * (1 + (kalMap[t] || 0) * kalBase);
  }
  return total;
}

