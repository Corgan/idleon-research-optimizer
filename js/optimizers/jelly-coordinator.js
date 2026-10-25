const FOCUSES = ['explore', 'refine', 'repair', 'measure'];

function layoutKey(layout) {
  return Object.entries(layout || {}).sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([anchor, type]) => `${anchor}:${type}`).join('|');
}

export function jellySelectSharedElites(rows, limit = 6) {
  const ranked = rows.filter(row => row.result?.layout && Number.isFinite(row.result.score))
    .slice().sort((a, b) => b.result.score - a.result.score || a.start - b.start);
  const selected = [];
  const seen = new Set();
  for (const row of ranked) {
    const key = layoutKey(row.result.layout);
    if (seen.has(key)) continue;
    seen.add(key);
    const cells = new Set(key.split('|'));
    const distinct = selected.every(other => {
      let intersection = 0;
      for (const cell of cells) if (other.cells.has(cell)) intersection++;
      return 1 - intersection / Math.max(1, cells.size + other.cells.size - intersection) >= 0.1;
    });
    if (!distinct) continue;
    selected.push({ row, cells });
    if (selected.length >= limit) break;
  }
  return selected.map(({ row }) => ({
    sourceStart: row.start, layout: { ...row.result.layout }, score: row.result.score,
  }));
}

export function jellySearchAssignment(rows, start, options = {}) {
  const shared = options.shareElites === false ? [] : jellySelectSharedElites(rows);
  let focus = options.computeScheduling === false ? 'explore' : FOCUSES[start % FOCUSES.length];
  if (options.computeScheduling !== false && start % 4 !== 0 && rows.length) {
    const stats = FOCUSES.map(name => {
      const samples = rows.filter(row => (row.assignment?.focus || 'explore') === name);
      const seconds = samples.reduce((sum, row) => sum + Math.max(0.001, Number(row.elapsedMs) / 1000 || 1), 0);
      const gain = samples.reduce((sum, row) => {
        const baseline = Number(row.assignment?.baselineScore ?? row.result.savedScore);
        const score = Number(row.result.score);
        return sum + (Number.isFinite(baseline) && Number.isFinite(score)
          ? Math.max(0, score - baseline) / Math.max(1, Math.abs(score), Math.abs(baseline)) : 0);
      }, 0);
      return { name, count: samples.length, payoff: gain / Math.max(0.001, seconds) };
    });
    const untried = stats.find(row => row.count === 0);
    if (untried) focus = untried.name;
    else {
      const scale = Math.max(1e-6, ...stats.map(row => row.payoff));
      stats.sort((a, b) => (
        b.payoff / scale + Math.sqrt(2 * Math.log(rows.length + 1) / b.count)
        - a.payoff / scale - Math.sqrt(2 * Math.log(rows.length + 1) / a.count)
        || FOCUSES.indexOf(a.name) - FOCUSES.indexOf(b.name)
      ));
      focus = stats[0].name;
    }
  }
  const overrides = { computeFocus: focus };
  if (focus === 'refine') {
    const rounds = Math.max(1, Number(options.iterations) || 45);
    const savedRounds = Math.max(0, Math.min(30, Number(options.savedRefinementRounds ?? 4) || 0));
    const moved = Math.min(rounds - 1, Math.ceil(rounds / 4), 30 - savedRounds);
    overrides.iterations = rounds - moved;
    overrides.savedRefinementRounds = savedRounds + moved;
  } else if (focus === 'repair') {
    overrides.activeExactNodeBudget = 1024;
  } else if (focus === 'measure') {
    overrides.screeningTrials = Math.min(Number(options.simulationTrials) || 256,
      Math.max(Number(options.screeningTrials) || 0, 16));
  }
  return {
    focus, overrides,
    baselineScore: rows.reduce((best, row) => Number.isFinite(row.result?.score)
      ? Math.max(best ?? row.result.score, row.result.score) : best, null),
    sharedEliteLayouts: shared.map(({ sourceStart, layout }) => ({ sourceStart, layout })),
    sourceStarts: rows.map(row => row.start).sort((a, b) => a - b),
  };
}
