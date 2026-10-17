// ===== ACTIVE COMBAT SIMULATOR - CLASS EXP PROJECTIONS =====

export function classExpRequirement(level) {
  level = Number(level);
  if (!Number.isSafeInteger(level) || level < 1) throw new Error('Class level must be a positive whole number.');
  // IncreaseExpREQ(0) / expReqQTY(0, level), src 69100-69102.
  return (15 + Math.pow(level, 1.9) + 11 * level)
    * Math.pow(1.208 - Math.min(.164, .215 * level / (level + 100)), level) - 15;
}

export function captureCombatExpStart(S, charIdx, inputs) {
  const level = inputs.entries?.level?.value ?? S.lv0AllData?.[charIdx]?.[0];
  const exp = S.exp0AllData?.[charIdx]?.[0];
  if (level == null || level === '' || !Number.isSafeInteger(Number(level)) || Number(level) < 1) {
    return { available: false, reason: 'The save has no valid Class level for this character.' };
  }
  if (exp == null || exp === '' || !Number.isFinite(Number(exp)) || Number(exp) < 0) {
    return { available: false, level: Number(level), reason: 'The save has no valid Class EXP progress for this character.' };
  }
  return { available: true, level: Number(level), exp: Number(exp) };
}

export function projectCombatExp(start, gained, timeMs, targetLevel, actual = null) {
  gained = Number(gained);
  timeMs = Number(timeMs);
  if (!Number.isFinite(gained) || gained < 0) throw new Error('Earned Class EXP must be finite and nonnegative.');
  if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error('Simulation duration must be finite and nonnegative.');
  const perHour = timeMs > 0 ? gained / (timeMs / 3600000) : 0;
  if (!start?.available) return { available: false, reason: start?.reason || 'Starting Class EXP is unavailable.', gained, perHour };
  const level = Number(start.level), exp = Number(start.exp);
  const requirement = classExpRequirement(level);
  if (!Number.isFinite(requirement) || !Number.isFinite(exp) || exp < 0 || !Number.isFinite(exp + gained)) {
    throw new Error('Class EXP progress exceeds the numerical projection range.');
  }
  targetLevel = targetLevel == null ? level + 1 : Number(targetLevel);
  if (!Number.isFinite(classExpRequirement(targetLevel))) throw new Error('Target level exceeds the numerical projection range.');

  let endLevel = level, endExp = exp + gained, endRequirement = requirement;
  while (!actual?.available && endExp >= endRequirement) {
    endExp -= endRequirement;
    endRequirement = classExpRequirement(++endLevel);
  }
  if (actual?.available) {
    endLevel = actual.level;
    endExp = actual.exp;
    endRequirement = classExpRequirement(endLevel);
  }
  const eta = (needed) => needed <= 0 ? 0 : perHour > 0 ? needed / perHour : null;
  const milestones = [];
  let needed = -exp, targetExp = 0;
  const lastLevel = Math.max(level + 1, targetLevel);
  for (let from = level; from < lastLevel; from++) {
    needed += classExpRequirement(from);
    const to = from + 1;
    if (to === targetLevel) targetExp = Math.max(0, needed);
    if (to <= level + 20 || to === targetLevel) {
      milestones.push({
        level: to, required: classExpRequirement(from), needed: Math.max(0, needed),
        reached: actual?.available ? to <= endLevel : needed <= gained,
        hoursFromStart: actual?.levels?.some(e => e.level === to)
          ? actual.levels.find(e => e.level === to).t / 3600000 : eta(needed),
        hoursRemaining: eta(needed - gained),
      });
    }
  }
  if (!Number.isFinite(needed)) throw new Error('Target EXP exceeds the numerical projection range.');
  return {
    available: true, gained, perHour,
    start: { level, exp, requirement, progress: Math.min(1, exp / requirement) },
    end: { level: endLevel, exp: endExp, requirement: endRequirement, progress: endExp / endRequirement },
    levelsGained: endLevel - level, nextLevelHours: eta(endRequirement - endExp),
    targetLevel, targetExp, targetRemaining: Math.max(0, targetExp - gained),
    targetHours: eta(targetExp), targetRemainingHours: eta(targetExp - gained),
    targetReached: targetLevel <= endLevel, milestones,
  };
}
