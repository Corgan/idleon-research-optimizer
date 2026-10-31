import { formulaOperation } from './formula-tree.js';

export function formulaOperandEntries(node) {
  const result = [], active = new Set([node]);
  function visit(child, route) {
    if (node.operation && child.operation && !child.formulaTerm) {
      if (active.has(child)) throw new Error('Cannot inspect a cyclic arithmetic tree.');
      active.add(child);
      child.children.forEach((operand, i) => visit(operand, route.concat(i)));
      active.delete(child);
    } else if (!node.operation || child.kind !== 'constant' || child.name !== 'Constant') {
      result.push({ node: child, route });
    }
  }
  (node.children || []).forEach((child, i) => visit(child, [i]));
  const counts = new Map();
  return result.map(entry => {
    const identity = JSON.stringify(entry.node.gameInput || entry.node.source || entry.node.name || 'Value');
    const occurrence = counts.get(identity) || 0;
    counts.set(identity, occurrence + 1);
    return { ...entry, key: identity + ':' + occurrence };
  });
}

export function formulaSnapshot(root, { compact = false } = {}) {
  const entries = [], active = new Set();
  function visit(node, key, route, names) {
    if (active.has(node)) throw new Error('Cannot compare a cyclic formula tree.');
    active.add(node);
    entries.push({
      key, val: node.val,
      ...(!compact ? { route, names, name: node.name || node.label || 'Value' } : {}),
      unavailable: !!node.unavailable, notApplicable: !!node.notApplicable,
      partial: !!node.partial, nonNumeric: !!node.nonNumeric,
    });
    for (const child of formulaOperandEntries(node)) {
      visit(child.node, key + '/' + child.key, compact ? null : route.concat(child.route),
        compact ? null : names.concat(child.node.name || 'Value'));
    }
    active.delete(node);
  }
  visit(root, '', compact ? null : [], compact ? null : [root.name || 'Total']);
  return entries;
}

function _numeric(node) {
  return node && !node.unavailable && !node.notApplicable && !node.nonNumeric && node.val != null
    && (typeof node.val === 'number' || typeof node.val === 'string' && node.val.trim() !== '')
    && Number.isFinite(Number(node.val));
}

export function formulaDifference(current, previous) {
  if (!current || !previous) return { available: false, changed: true, reason: 'Term absent from this formula branch.' };
  const changed = !Object.is(current.val, previous.val)
    || !!current.unavailable !== !!previous.unavailable || !!current.notApplicable !== !!previous.notApplicable
    || !!current.partial !== !!previous.partial || !!current.nonNumeric !== !!previous.nonNumeric;
  if (!_numeric(current) || !_numeric(previous)) return {
    available: false, changed, reason: 'A formula value is nonnumeric, unavailable or not applicable.',
  };
  const delta = Number(current.val) - Number(previous.val);
  if (!Number.isFinite(delta)) return { available: false, changed, reason: 'The difference exceeds finite numeric range.' };
  const percent = Number(previous.val) === 0 ? null : delta / Math.abs(Number(previous.val)) * 100;
  const share = Number(current.val) === 0 ? null : delta / Math.abs(Number(current.val)) * 100;
  if (percent !== null && !Number.isFinite(percent) || share !== null && !Number.isFinite(share)) return {
    available: false, changed, reason: 'The relative difference exceeds finite numeric range.',
  };
  return { available: true, changed, delta, percent, share,
    partial: !!(current.partial || previous.partial),
  };
}

export function compareFormulaSnapshots(current, baseline, variants = []) {
  const saved = new Map(baseline.map(entry => [entry.key, entry]));
  const edits = variants.map(variant => {
    const values = new Map((variant.values || []).map(entry => [entry.key, entry]));
    return { ...variant, values, total: variant.error ? { available: false, reason: variant.error }
      : formulaDifference(current[0], values.get('')) };
  });
  const rows = new Map();
  for (const node of current) {
    rows.set(node.key, {
      current: node, saved: saved.get(node.key),
      difference: formulaDifference(node, saved.get(node.key)),
      edits: edits.map(variant => ({
        change: variant.change, without: variant.values.get(node.key),
        difference: variant.error ? { available: false, changed: false, reason: variant.error }
          : formulaDifference(node, variant.values.get(node.key)),
        total: variant.total,
      })),
    });
    saved.delete(node.key);
  }
  return { rows, removed: [...saved.values()] };
}

export function formulaTermImpact(root, route) {
  if (!route.length) return { available: false, reason: 'This is the top-level total.' };
  const parents = [];
  let node = root;
  for (const index of route) {
    if (!node?.children?.[index]) return { available: false, reason: 'Term occurrence is no longer present.' };
    parents.push({ node, index });
    node = node.children[index];
  }
  if (!_numeric(root) || !_numeric(node)) return { available: false, reason: 'The total or term is unavailable or nonnumeric.' };
  const parent = parents.at(-1).node;
  const neutral = parent.outputChild !== undefined || ['add', 'subtract'].includes(parent.operation) ? 0
    : ['multiply', 'divide'].includes(parent.operation) ? 1 : null;
  if (neutral === null) return { available: false, reason: 'No unambiguous additive or multiplicative neutral value at this position.' };
  let value = neutral;
  for (let i = parents.length - 1; i >= 0; i--) {
    const { node: ancestor, index } = parents[i];
    if (ancestor.outputChild !== undefined) {
      if (!_numeric(ancestor) || !Number.isInteger(ancestor.outputChild) || !_numeric(ancestor.children[ancestor.outputChild])
        || !Object.is(ancestor.children[ancestor.outputChild].val, ancestor.val)) return {
        available: false, reason: 'The declared output projection does not match the displayed total.',
      };
      if (ancestor.outputChild !== index) value = ancestor.val;
    } else {
      if (!ancestor.operation || !_numeric(ancestor)) return {
        available: false, reason: 'An explicit arithmetic path to the top-level total has not been recorded.',
      };
      if (ancestor.children.some((child, slot) => slot !== index && !_numeric(child))) return {
        available: false, reason: 'Another operand on the path is unavailable.',
      };
      if (!Object.is(formulaOperation('Recorded arithmetic', ancestor.operation, ...ancestor.children).val, ancestor.val)) return {
        available: false, reason: 'Recorded arithmetic does not reproduce the displayed value.',
      };
      value = formulaOperation('Without this occurrence', ancestor.operation,
        ...ancestor.children.map((child, slot) => ({ val: slot === index ? value : child.val }))).val;
    }
  }
  if (!Number.isFinite(value)) return { available: false, reason: 'Neutralizing this occurrence produces a non-finite result.' };
  const delta = Number(root.val) - value;
  const percent = Number(root.val) === 0 ? null : delta / Math.abs(Number(root.val)) * 100;
  if (!Number.isFinite(delta) || percent !== null && !Number.isFinite(percent)) return {
    available: false, reason: 'The impact exceeds finite numeric range.',
  };
  return { available: true, neutral, without: value, delta, percent,
    partial: !!(node.partial || parents.some(parent => parent.node.partial)),
  };
}
