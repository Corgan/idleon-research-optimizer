import { formulaOperationValue } from './formula-tree.js';
import { formulaOperandEntries } from './formula-comparison.js';

const quadratures = new Map();
const nonlinear = new Set(['min', 'max', 'floor', 'ceil', 'round', 'log', 'log2']);

function _numeric(node) {
  return node && !node.unavailable && !node.notApplicable && !node.nonNumeric && node.val != null
    && (typeof node.val === 'number' || typeof node.val === 'string' && node.val.trim() !== '')
    && Number.isFinite(Number(node.val));
}

function _sum(values) {
  let total = 0, correction = 0;
  for (const value of values) {
    const adjusted = value - correction, next = total + adjusted;
    correction = (next - total) - adjusted;
    total = next;
  }
  return total;
}

function _neutral(operation, index) {
  if (operation === 'multiply' || operation === 'divide' && index === 1
    || operation === 'power' && index === 0 || operation === 'log' || operation === 'log2') return 1;
  return 0;
}

function _scale(value, amount, total) {
  const scaled = value * (amount / total);
  return Number.isFinite(scaled) && (scaled !== 0 || value === 0 || amount === 0)
    ? scaled : (value / total) * amount;
}

function _compile(root) {
  const nodes = [], players = [], active = new Set();
  let reason = '', partial = false;
  function visit(node, route, parent, index) {
    if (!_numeric(node)) { reason = 'An operand is unavailable or nonnumeric.'; return -1; }
    partial ||= !!node.partial;
    if (route.length && (node.formulaTerm || !node.operation)) {
      if (node.kind === 'constant' && node.name === 'Constant') {
        nodes.push({ val: Number(node.val), degree: 0 });
      } else {
        const neutral = _neutral(parent, index), value = Number(node.val);
        players.push({ route, neutral, value, slot: nodes.length });
        nodes.push({ val: value, neutral, player: players.length - 1, degree: value === neutral ? 0 : 1 });
      }
      return nodes.length - 1;
    }
    if (!node.operation || active.has(node)) {
      reason = active.has(node) ? 'Cyclic arithmetic cannot be allocated.' : 'Explicit arithmetic has not been recorded.';
      return -1;
    }
    active.add(node);
    const children = (node.children || []).map((child, i) => visit(child, route.concat(i), node.operation, i));
    active.delete(node);
    if (children.includes(-1)) return -1;
    if (!['add', 'subtract', 'multiply', 'divide', 'power'].includes(node.operation) && !nonlinear.has(node.operation)) {
      reason = 'The recorded arithmetic operation is unsupported.';
      return -1;
    }
    if (children.length !== (['floor', 'ceil', 'round', 'log', 'log2'].includes(node.operation) ? 1 : 2)) {
      reason = 'Recorded arithmetic has the wrong operand count.';
      return -1;
    }
    const operands = children.map(slot => nodes[slot]);
    const actual = formulaOperationValue(node.operation, operands.map(operand => operand.val));
    if (!Object.is(actual, Number(node.val))) {
      reason = 'Recorded arithmetic does not reproduce the displayed value.';
      return -1;
    }
    let degree = 0;
    if (operands.some(operand => operand.degree)) {
      if (node.operation === 'add' || node.operation === 'subtract') degree = Math.max(...operands.map(operand => operand.degree));
      else if (node.operation === 'multiply') degree = operands[0].degree + operands[1].degree;
      else if (node.operation === 'divide' && operands[1].degree === 0) degree = operands[0].degree;
      else if (node.operation === 'power' && operands[1].degree === 0 && operands[1].val === 0) degree = 0;
      else if (node.operation === 'power' && operands[1].degree === 0 && operands[1].val === 1) degree = operands[0].degree;
      else degree = Infinity;
    }
    nodes.push({ operation: node.operation, children, val: actual, degree });
    return nodes.length - 1;
  }
  visit(root, [], null, 0);
  return { nodes, players, reason, partial };
}

function _evaluate(nodes, inputs, values) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    values[i] = node.player !== undefined ? inputs[node.player] : node.operation
      ? formulaOperationValue(node.operation, node.children.map(slot => values[slot])) : node.val;
    if (!Number.isFinite(values[i])) return false;
  }
  return true;
}

function _quadrature(count) {
  if (quadratures.has(count)) return quadratures.get(count);
  const result = [];
  for (let i = 0; i < Math.ceil(count / 2); i++) {
    let x = i === count - 1 - i ? 0 : Math.cos(Math.PI * (i + 0.75) / (count + 0.5)), derivative;
    for (let attempt = 0; attempt < 30; attempt++) {
      let previous = 0, current = 1;
      for (let k = 1; k <= count; k++) {
        const next = ((2 * k - 1) * x * current - (k - 1) * previous) / k;
        previous = current; current = next;
      }
      derivative = count * (x * current - previous) / (x * x - 1);
      const step = current / derivative;
      if (Math.abs(step) < 1e-14) break;
      x -= step;
    }
    const weight = 1 / ((1 - x * x) * derivative * derivative);
    result.push({ t: (1 - x) / 2, weight });
    if (i !== count - 1 - i) result.push({ t: (1 + x) / 2, weight });
  }
  if (quadratures.size >= 16) quadratures.delete(quadratures.keys().next().value);
  quadratures.set(count, result);
  return result;
}

function _allocate(compiled) {
  const { nodes, players } = compiled;
  const values = new Float64Array(nodes.length), inputs = players.map(player => player.neutral);
  const credits = players.map(() => 0);
  if (!_evaluate(nodes, inputs, values)) return { reason: 'Neutral inputs produce non-finite arithmetic.' };
  const baseline = values.at(-1), degree = nodes.at(-1).degree;
  if (Number.isFinite(degree)) {
    // For multilinear expressions, integrated gradients split every interaction equally (Shapley).
    const gradients = new Float64Array(nodes.length);
    for (const { t, weight } of _quadrature(Math.max(1, Math.ceil(degree / 2)))) {
      players.forEach((player, i) => { inputs[i] = player.neutral + t * (player.value - player.neutral); });
      if (!_evaluate(nodes, inputs, values)) return { reason: 'Shared-credit arithmetic exceeds finite numeric range.' };
      gradients.fill(0); gradients[nodes.length - 1] = 1;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i], g = gradients[i];
        if (!node.operation || !node.degree || g === 0) continue;
        const [a, b] = node.children;
        if (node.operation === 'add' || node.operation === 'subtract') {
          gradients[a] += g; gradients[b] += node.operation === 'add' ? g : -g;
        } else if (node.operation === 'multiply') {
          gradients[a] += g * values[b]; gradients[b] += g * values[a];
        } else if (node.operation === 'divide') gradients[a] += g / values[b];
        else if (node.operation === 'power') gradients[a] += g;
      }
      players.forEach((player, i) => {
        credits[i] += weight * gradients[player.slot] * (player.value - player.neutral);
      });
    }
  } else {
    const changing = players.map((player, i) => player.value === player.neutral ? -1 : i).filter(i => i !== -1);
    if (changing.length > 10) return { reason: 'Exact nonlinear shared-credit allocation supports at most 10 changing terms in one group.' };
    const count = changing.length, outcomes = new Float64Array(2 ** count);
    for (let mask = 0; mask < outcomes.length; mask++) {
      changing.forEach((player, i) => { inputs[player] = mask & (1 << i) ? players[player].value : players[player].neutral; });
      if (!_evaluate(nodes, inputs, values)) return { reason: 'A neutral-input combination produces non-finite arithmetic.' };
      outcomes[mask] = values.at(-1);
    }
    const choose = [1];
    for (let k = 1; k < count; k++) choose[k] = choose[k - 1] * (count - k) / k;
    changing.forEach((player, i) => {
      const increments = [];
      for (let mask = 0; mask < outcomes.length; mask++) {
        if (mask & (1 << i)) continue;
        let bits = mask, size = 0;
        while (bits) { size++; bits &= bits - 1; }
        increments.push((outcomes[mask | (1 << i)] - outcomes[mask]) / (count * choose[size]));
      }
      credits[player] = _sum(increments);
    });
  }
  return credits.every(Number.isFinite) ? { baseline, credits } : { reason: 'Shared credit exceeds finite numeric range.' };
}

export function createFormulaContributions(root) {
  const entries = new Map(), splits = new Map();
  const total = _numeric(root) ? Number(root.val) : null;
  function entry(route, amount, parentAmount, reason = '', partial = false) {
    const percent = total === null || total === 0 || amount === null ? null : amount / total * 100;
    const parentPercent = parentAmount && amount !== null ? amount / parentAmount * 100 : null;
    return { route, available: amount !== null, amount,
      percent: Number.isFinite(percent) ? percent : null,
      parentPercent: Number.isFinite(parentPercent) ? parentPercent : null,
      reason, partial };
  }
  entries.set('', entry([], total, total, total === null ? 'The total is unavailable or nonnumeric.' : '', !!root.partial));
  function get(route) {
    const key = route.join('.');
    if (entries.has(key)) return entries.get(key);
    let parentRoute = [];
    while (parentRoute.length < route.length) {
      const group = split(parentRoute);
      const child = group.terms.find(term => term.route.length <= route.length
        && term.route.every((slot, i) => route[i] === slot));
      if (!child) break;
      if (child.route.length === route.length) return child;
      parentRoute = child.route;
    }
    return entry(route, null, null, 'No explicit allocation path to the total.');
  }
  function split(route) {
    const key = route.join('.');
    if (splits.has(key)) return splits.get(key);
    const own = get(route), node = route.reduce((parent, slot) => parent?.children?.[slot], root);
    const children = node ? formulaOperandEntries(node) : [];
    const result = { terms: [], baseline: null, unallocated: null };
    splits.set(key, result);
    function unavailable(reason) {
      result.unallocated = { ...entry(route, own.amount, own.amount, reason, own.partial), value: node?.val };
      result.terms = children.map(child => entry(route.concat(child.route), null, own.amount, reason, own.partial));
    }
    if (!own.available || !_numeric(node)) unavailable(own.reason || 'The formula is unavailable or nonnumeric.');
    else if (node.outputChild !== undefined) {
      if (!Number.isInteger(node.outputChild) || !_numeric(node.children?.[node.outputChild])
        || !Object.is(node.children[node.outputChild].val, node.val)) unavailable('The declared output does not match the displayed total.');
      else result.terms = children.map(child => entry(route.concat(child.route),
        child.route[0] === node.outputChild ? own.amount : 0, own.amount, '', own.partial || !!child.node.partial));
    } else if (!node.operation) unavailable('Explicit arithmetic has not been recorded; this portion remains unallocated.');
    else if (Number(node.val) === 0 && route.length) unavailable('A zero-valued parent has no proportional breakdown; its credit remains unallocated.');
    else {
      const compiled = _compile(node);
      const allocation = compiled.reason ? compiled : _allocate(compiled);
      if (allocation.reason) unavailable(allocation.reason);
      else {
        const scale = value => Number(node.val) === 0 ? value : _scale(value, own.amount, Number(node.val));
        const amounts = allocation.credits.map(scale);
        let base = scale(allocation.baseline);
        if (!Number.isFinite(base) || amounts.some(value => !Number.isFinite(value))) unavailable('Allocated credit exceeds finite numeric range.');
        else {
          const remainder = own.amount - _sum([base, ...amounts]);
          if (!Number.isFinite(remainder)) unavailable('Contribution accounting exceeds finite numeric range.');
          else {
            const partial = own.partial || compiled.partial;
            result.terms = compiled.players.map((player, i) => ({
              ...entry(route.concat(player.route), amounts[i], own.amount, '', partial), neutral: player.neutral,
            }));
            if (Math.abs(remainder) <= Math.max(Math.abs(own.amount), Number.MIN_VALUE) * 1e-10) base += remainder;
            else result.unallocated = { ...entry(route, remainder, own.amount, 'Numerical remainder could not be reliably attributed.', partial), value: remainder };
            if (base !== 0) result.baseline = { ...entry(route, base, own.amount,
              'Fixed constants with terms neutralized: additive inputs and division numerators use 0; multipliers, divisors, logarithm inputs and power bases use 1; power exponents use 0. Includes floating-point reconciliation.',
              partial), value: allocation.baseline };
          }
        }
      }
    }
    for (const term of result.terms) entries.set(term.route.join('.'), term);
    return result;
  }
  return { get, split };
}
