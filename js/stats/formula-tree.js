// Explicit arithmetic trees; child order and grouping are significant.
export function formulaInput(name, val, source, children) {
  return {
    name, val, fmt: 'raw', kind: source ? 'input' : 'unexpanded',
    ...(source ? { source } : {}),
    ...(children?.length ? { children } : {}),
  };
}

export function formulaConstant(val, name = 'Constant') {
  return { name, val, fmt: 'raw', kind: 'constant' };
}

const OPERATIONS = {
  add: { text: 'a + b', evaluate: (a, b) => a + b },
  subtract: { text: 'a - b', evaluate: (a, b) => a - b },
  multiply: { text: 'a * b', evaluate: (a, b) => a * b },
  divide: { text: 'a / b', evaluate: (a, b) => a / b },
  power: { text: 'a ^ b', evaluate: (a, b) => Math.pow(a, b) },
  min: { text: 'min(a, b)', evaluate: (a, b) => Math.min(a, b) },
  max: { text: 'max(a, b)', evaluate: (a, b) => Math.max(a, b) },
  floor: { text: 'floor(a)', evaluate: a => Math.floor(a), arity: 1 },
  ceil: { text: 'ceil(a)', evaluate: a => Math.ceil(a), arity: 1 },
  round: { text: 'round(a)', evaluate: a => Math.round(a), arity: 1 },
  log: { text: 'ln(a)', evaluate: a => Math.log(a), arity: 1 },
  log2: { text: 'log2(a)', evaluate: a => Math.log2(a), arity: 1 },
};

export function formulaOperationValue(operation, values) {
  const spec = OPERATIONS[operation];
  if (!spec) throw new Error('Unknown formula operation: ' + operation);
  if (values.length !== (spec.arity || 2)) {
    throw new Error('Wrong operand count for ' + operation);
  }
  return spec.evaluate(...values);
}

export function formulaOperation(name, operation, ...children) {
  const val = formulaOperationValue(operation, children.map(child => child.val));
  const spec = OPERATIONS[operation];
  return {
    name, val, fmt: 'raw', kind: 'formula', operation, formula: spec.text, children,
    ...(!Number.isFinite(Number(val)) ? { unavailable: true, reason: 'Non-finite arithmetic result.' } : {}),
  };
}

export function formulaCoverage(root) {
  const result = { nodes: 0, inputs: 0, constants: 0, formulas: 0, groups: 0, unexpanded: 0, unavailable: 0 };
  const stack = [root];
  const seen = new Set();
  while (stack.length) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    result.nodes++;
    if (node.unavailable || node.val == null || (!node.nonNumeric && !Number.isFinite(Number(node.val)))) result.unavailable++;
    const children = node.children || [];
    if (node.formula) result.formulas++;
    else if (children.length) result.groups++;
    if (!children.length) {
      if (node.kind === 'constant') result.constants++;
      else if (node.kind === 'input' && node.source) result.inputs++;
      else result.unexpanded++;
    }
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  return result;
}

export function formulaExpansionAudit(root) {
  const result = { operations: 0, inputs: 0, constants: 0, gaps: 0, unavailable: 0, partial: 0, mismatches: 0, cycles: 0 };
  const visited = new Set(), active = new Set();
  const stack = [[root, false]];
  while (stack.length) {
    const [node, leaving] = stack.pop();
    if (!node) { result.gaps++; continue; }
    if (leaving) { active.delete(node); continue; }
    if (active.has(node)) { result.cycles++; continue; }
    if (visited.has(node)) continue;
    visited.add(node);
    active.add(node);
    stack.push([node, true]);
    if (node.unavailable || node.notApplicable || node.val == null
      || (!node.nonNumeric && !Number.isFinite(Number(node.val)))) result.unavailable++;
    if (node.partial) result.partial++;
    const children = node.children || [];
    if (node.operation) {
      result.operations++;
      const spec = OPERATIONS[node.operation];
      if (!spec || children.length !== (spec.arity || 2)
        || !Object.is(spec.evaluate(...children.map(child => child?.val)), node.val)) result.mismatches++;
    } else if (children.length) result.gaps++;
    else if (node.kind === 'constant') result.constants++;
    else if (node.kind === 'input' && node.source) result.inputs++;
    else result.gaps++;
    for (const child of children) stack.push([child, false]);
    for (const reference of node.sourceReferences || []) stack.push([reference, false]);
  }
  result.complete = !result.gaps && !result.unavailable && !result.partial && !result.mismatches && !result.cycles;
  return result;
}
