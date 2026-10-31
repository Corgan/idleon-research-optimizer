import { bubbleDefinitions } from './data/w2/alchemy.js';
import { N2L } from './data/common/encoding.js';
import { entityName } from './entity-names.js';
import { createFormulaInputSandbox } from './formula-inputs.js';
import { formulaDifference } from './formula-comparison.js';
import { readRawKey, saveRoot, characterOptions } from './systems/common/combat-sim-setup.js';
import { PRISMA_SOURCE_COVERAGE } from './data/prisma-source-coverage.js';

const COMPUTED_REFERENCE_REVIEW = {
  sourceHash: 'd103bacc16c9a1072f29725cca469217b836977a442ea16883d7d7bb8f0d2a98',
  cache: {
    67068: 'Purchased/equipped bubble iteration, partial HP/MP scaling and class-pass cache construction.',
    67070: 'Second cache pass applies the color multibubble to its declared indices.',
    67072: 'Slab-count post-pass scales W2/A2/M2 and W4/A4/M4.',
    67073: 'Tome, logged-in level and class-family level post-passes.',
    67074: 'Class-family zeroing and cleared-W6-map count for Y6.',
    67076: 'Y6 cache replacement before the independent vial-cache rebuild.',
  },
};

export function prismaSourceCoverage(effect) {
  const references = PRISMA_SOURCE_COVERAGE.unresolved.map(row => {
    let explanation = '';
    if (PRISMA_SOURCE_COVERAGE.sourceHash === COMPUTED_REFERENCE_REVIEW.sourceHash) {
      if (row.owner === 'scripts.ActorEvents_124' && row.method === '_customBlock_TalentCalc') {
        explanation = row.kind === 'computed-cache-read' ? COMPUTED_REFERENCE_REVIEW.cache[row.line] || ''
          : row.kind === 'computed-base-call' && row.line === 67068
            ? 'Base bubble iteration feeds cache construction, not a separate final outcome.' : '';
      } else if (row.owner === 'scripts.ActorEvents_232' && row.method === '_event_4'
          && row.kind === 'computed-base-call' && row.line === 72507) {
        explanation = 'Selected bubble tooltip preview; numerical base bonus is already measured separately.';
      }
    }
    return { ...row, traced: !!explanation, explanation };
  });
  return {
    consumers: PRISMA_SOURCE_COVERAGE.reads.filter(row => row.effect === effect),
    unresolved: references.filter(row => !row.traced).length,
    computedReferences: references,
    sourceHash: PRISMA_SOURCE_COVERAGE.sourceHash,
    exhaustive: false,
  };
}

function _number(value) {
  return value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
}

export function prismaPlan(raw, { charIdx = 0, cauldron = 0 } = {}) {
  if (!Number.isInteger(cauldron) || cauldron < 0 || cauldron > 3) throw new Error('Choose a valid cauldron.');
  const characters = characterOptions(raw);
  if (!characters.some(character => character.ci === charIdx)) throw new Error('Choose a character in the imported save.');
  const optionsKey = Object.hasOwn(saveRoot(raw), 'OptionsListAccount') ? 'OptionsListAccount' : 'OptLacc';
  const options = readRawKey(raw, optionsKey);
  const prisma = options?.[384];
  const prismaAvailable = typeof prisma === 'string' || prisma === 0;
  const levels = readRawKey(raw, 'CauldronInfo');
  const rows = bubbleDefinitions().filter(bubble => bubble.cauldron === cauldron).map(bubble => {
    const level = _number(levels?.[cauldron]?.[bubble.index]);
    const already = prismaAvailable && String(prisma).includes(N2L[cauldron] + bubble.index + ',');
    let status = 'ready', reason = '';
    if (!bubble.prismaEligible) { status = 'ineligible'; reason = 'Large bubbles cannot receive Prisma.'; }
    else if (!prismaAvailable || level === null || level < 0) {
      status = 'unavailable'; reason = 'Saved bubble level or Prisma ownership is missing or invalid.';
    } else if (already) { status = 'already'; reason = 'Already Prisma-ed in this save.'; }
    else if (level === 0) { status = 'unpurchased'; reason = 'Purchase this bubble first.'; }
    return { ...bubble, id: cauldron + ':' + bubble.index, comparable: (status === 'ready' || status === 'already') && level > 0,
      name: entityName('Bubble', [cauldron, bubble.index]), level, status, reason,
      sourceCoverage: prismaSourceCoverage(bubble.effect) };
  });
  return { charIdx, cauldron, characters, rows, fragments: _number(options?.[383]),
    mapIdx: _number(readRawKey(raw, 'CurrentMap_' + charIdx)) };
}

export function prismaVariant(raw, cauldron, index, { prismad = true } = {}) {
  if (typeof prismad !== 'boolean') throw new Error('Prisma state must be a boolean.');
  const bubble = bubbleDefinitions().find(row => row.cauldron === cauldron && row.index === index);
  if (!bubble?.prismaEligible) throw new Error('This bubble cannot receive Prisma.');
  const sandbox = createFormulaInputSandbox(raw);
  const control = sandbox.controls({ source: `CauldronInfo[${cauldron}][${index}]` })
    .find(input => input.id === `prisma:${cauldron}:${index}`);
  if (!control || control.disabled) throw new Error('A saved purchased bubble is required.');
  if (prismad && control.saved) throw new Error('This bubble is already Prisma-ed.');
  if (!prismad && !control.saved) throw new Error('This bubble is not Prisma-ed.');
  const optionsKey = Object.hasOwn(saveRoot(raw), 'OptionsListAccount') ? 'OptionsListAccount' : 'OptLacc';
  const saved = readRawKey(raw, optionsKey)?.[384];
  if (typeof saved !== 'string' && saved !== 0) throw new Error('Saved Prisma ownership is unavailable.');
  sandbox.set(control.id, Number(prismad));
  return sandbox.current();
}

export function prismaChanges(baseline, current) {
  const previous = new Map(baseline.map(metric => [metric.id, metric]));
  const next = new Map(current.map(metric => [metric.id, metric]));
  const changes = [], intermediates = [], unavailable = [];
  for (const id of new Set([...next.keys(), ...previous.keys()])) {
    let metric = next.get(id), before = previous.get(id);
    const template = metric || before;
    if (!metric || !before) {
      const anchor = template.zeroWhenAbsent;
      const oldAnchor = previous.get(anchor), newAnchor = next.get(anchor);
      if (anchor && oldAnchor && newAnchor && !oldAnchor.unavailable && !newAnchor.unavailable
        && !oldAnchor.notApplicable && !newAnchor.notApplicable
        && Number.isFinite(oldAnchor.val) && Number.isFinite(newAnchor.val)) {
        if (!before) before = { ...template, val: 0, partial: oldAnchor.partial, reason: oldAnchor.reason };
        if (!metric) metric = { ...template, val: 0, partial: newAnchor.partial, reason: newAnchor.reason };
      } else if (!metric) metric = { ...template, val: null, unavailable: true,
        reason: 'This outcome is absent from the current evaluated scope.' };
    }
    const diff = formulaDifference(metric, before);
    if (!diff.available) {
      if (!metric.notApplicable || !before?.notApplicable) unavailable.push({
        id: metric.id, name: metric.name, reason: metric.reason || before?.reason || diff.reason,
      });
    } else if (diff.changed) (metric.intermediate ? intermediates : changes).push({
      id: metric.id, name: metric.name, before: before.val, after: metric.val,
      delta: diff.delta, percent: diff.percent, partial: diff.partial,
      reason: [...new Set([before.reason, metric.reason].filter(Boolean))].join(' '),
      absolute: metric.absolute, lowerIsBetter: metric.lowerIsBetter,
      intermediate: !!metric.intermediate, effect: metric.effect,
    });
  }
  return { changes, intermediates, unavailable };
}

export function prismaOutcome(result, baseline, id) {
  if (result?.status !== 'done' || result.unavailable.some(metric => metric.id === id)) return null;
  const changed = [...result.changes, ...(result.intermediates || [])].find(metric => metric.id === id);
  if (changed) return changed;
  const saved = baseline.find(metric => metric.id === id);
  if (!saved || saved.unavailable || saved.notApplicable) return null;
  return { ...saved, before: saved.val, after: saved.val, delta: 0,
    percent: saved.val === 0 ? null : 0, partial: !!(saved.partial || result.partial),
    reason: [saved.reason, result.reason].filter(Boolean).join(' ') };
}
