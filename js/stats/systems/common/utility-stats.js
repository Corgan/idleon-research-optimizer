// ===== CHARACTER UTILITY STATS =====

export function printerSampleSizeFromPool(additivePct) {
  return Math.min(0.9, (Number(additivePct) || 0) / 100);
}

export function cardChanceMultiplierFromPool(additivePct, talent628) {
  return 1.2 + (Number(additivePct) || 0) / 100
    * (1 + (Number(talent628) || 0) / 100);
}