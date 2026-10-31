import { formulaCoverage } from '../stats/formula-tree.js';
import { formulaOperandEntries, formulaTermImpact } from '../stats/formula-comparison.js';
import { createFormulaContributions } from '../stats/formula-contributions.js';

const inspectorStates = new WeakMap();

export function exactFormulaValue(value) {
  return Object.is(value, -0) ? '-0' : String(value);
}

export function formulaNodeStatus(node) {
  if (node.notApplicable) return 'Not applicable';
  if (node.unavailable || node.val == null || (!node.nonNumeric && !Number.isFinite(Number(node.val)))) return 'Unavailable';
  if (node.partial) return 'Partial';
  if (node.formula) return 'Formula';
  if (node.kind === 'constant') return 'Constant';
  if (node.kind === 'input' && node.source) return 'Input';
  return node.children?.length ? 'Arithmetic not specified' : 'Not yet expanded';
}

function _operands(node) {
  return formulaOperandEntries(node).map(entry => entry.node);
}

function _signed(value) { return (value > 0 ? '+' : '') + exactFormulaValue(value); }
function _percent(value) { return value === null ? 'unavailable (zero denominator)' : _signed(Number(value.toPrecision(6))) + '%'; }
function _share(value) { return value === null ? 'Unavailable' : exactFormulaValue(Number(value.toPrecision(6))) + '%'; }
function _value(node) {
  return !node ? 'Not present in this branch' : node.notApplicable ? 'Not applicable'
    : node.unavailable ? 'Unavailable' : exactFormulaValue(node.val) + (node.partial ? ' (partial)' : '');
}

export function formulaExpressionParts(root, { expanded = new Set() } = {}) {
  const parts = [];
  const binary = { add: ' + ', subtract: ' - ', multiply: ' * ', divide: ' / ', power: ' ^ ' };
  const precedence = { add: 1, subtract: 1, multiply: 2, divide: 2, power: 3 };
  function visit(node, depth, parent, right, path = '') {
    if (!node.operation || (depth > 0 && node.formulaTerm && !expanded.has(path))) {
      parts.push({ text: exactFormulaValue(node.val), node, path });
      return;
    }
    const inline = depth > 0 && node.formulaTerm;
    if (inline) parts.push({ text: '(', inlineStart: node, path });
    const children = node.children;
    const symbol = binary[node.operation];
    if (symbol) {
      const brackets = !inline && (depth === 0 || (parent &&
        (precedence[node.operation] < precedence[parent]
          || (precedence[node.operation] === precedence[parent] && (right || parent === 'power')))));
      if (brackets) parts.push({ text: '(' });
      visit(children[0], depth + 1, node.operation, false, path + '.0');
      parts.push({ text: symbol });
      visit(children[1], depth + 1, node.operation, true, path + '.1');
      if (brackets) parts.push({ text: ')' });
    } else {
      parts.push({ text: (node.operation === 'log' ? 'ln' : node.operation) + '(' });
      children.forEach((child, i) => {
        if (i) parts.push({ text: ', ' });
        visit(child, depth + 1, undefined, false, path + '.' + i);
      });
      parts.push({ text: ')' });
    }
    if (inline) parts.push({ text: ')', inlineEnd: node, path });
  }
  visit(root, 0);
  return parts;
}

export function renderFormulaInspector(root, host, { tooltip, editor, comparison } = {}) {
  const doc = host.ownerDocument;
  const element = (tag, className, text) => {
    const el = doc.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const focused = host.contains(doc.activeElement) ? doc.activeElement.dataset.fiFocus : undefined;
  const selection = focused === 'filter' ? [doc.activeElement.selectionStart, doc.activeElement.selectionEnd] : null;
  const previous = inspectorStates.get(host);
  const state = previous?.name === root.name ? previous
    : { name: root.name, open: new Set(['']), inline: new Map(), editing: new Set(), query: '' };
  inspectorStates.set(host, state);
  const token = {};
  state.renderToken = token;
  host.replaceChildren();
  const coverage = formulaCoverage(root);
  host.dataset.traceGaps = String(coverage.unexpanded + coverage.groups);
  const collapse = element('button', 'fi-collapse', 'Collapse');
  collapse.type = 'button';
  collapse.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    for (const details of host.querySelectorAll('details')) details.open = false;
  });
  const targets = new Map();
  const rows = new Map();
  const records = [];
  let matches = new WeakMap();
  let compared = null, comparisonError = '', activeTip = null;
  const routeKeys = new Map(), nodeKeys = new Map(), impactCache = new Map();
  const contributions = createFormulaContributions(root);
  const totalName = root.impactLabel || root.name || 'total';
  const impactFor = route => {
    const key = route.join('.');
    if (!impactCache.has(key)) impactCache.set(key, formulaTermImpact(root, route));
    return impactCache.get(key);
  };
  const changes = element('details', 'fi-changes');
  changes.hidden = !comparison;
  changes.open = !!state.changesOpen;
  const changesSummary = element('summary', '', 'Calculating formula changes...');
  const changesBody = element('div', 'fi-change-list');
  changes.append(changesSummary, changesBody);
  changes.addEventListener('toggle', () => {
    state.changesOpen = changes.open;
    if (changes.open) drawChanges();
  });
  function drawChanges() {
    changesBody.replaceChildren();
    if (comparisonError) { changesBody.textContent = comparisonError; return; }
    if (!compared) return;
    changesBody.append(element('p', 'fi-comparison-note',
      'Saved vs edited. Per-edit impacts remove only that edit, keeping all others; impacts overlap and must not be added.'));
    for (const [key, value] of compared.rows) {
      if (!value.difference.changed) continue;
      const line = element('div', 'fi-change-line');
      const link = element('button', 'fi-change-link', value.current.names.join(' > '));
      link.type = 'button';
      link.addEventListener('click', () => {
        const node = nodeKeys.get(key);
        if (node) reveal(node);
      });
      const detail = element('span', '', _value(value.saved) + ' \u2192 ' + _value(value.current)
        + (value.difference.available ? ' (\u0394 ' + _signed(value.difference.delta)
          + ', ' + _percent(value.difference.percent) + ' vs saved)' : ' \u2014 ' + value.difference.reason));
      line.append(link, detail); changesBody.append(line);
    }
    for (const removed of compared.removed) {
      changesBody.append(element('div', 'fi-change-line',
        removed.names.join(' > ') + ': ' + _value(removed) + ' \u2192 Not present in edited branch'));
    }
  }
  const filter = element('div', 'fi-filter');
  const label = element('label', '', 'Filter subterms ');
  const search = element('input', 'fi-input');
  search.type = 'search';
  search.placeholder = 'Name or source';
  search.dataset.fiFocus = 'filter';
  search.value = state.query;
  label.append(search);
  const clear = element('button', 'fi-clear', 'Clear');
  clear.type = 'button';
  const result = element('span', 'fi-filter-status');
  result.setAttribute('role', 'status');
  filter.append(label, clear, result);
  let highlighted = [];
  function highlight(nodes) {
    for (const el of highlighted) el.classList.remove('fi-active');
    highlighted = [];
    for (const node of nodes) {
      for (const el of targets.get(node) || []) {
        el.classList.add('fi-active');
        highlighted.push(el);
      }
    }
  }
  const hideTip = () => {
    if (tooltip) tooltip.hidden = true;
    activeTip = null;
    highlight([]);
  };
  function comparisonInfo(key) {
    if (!comparison) return '';
    if (comparisonError) return 'Comparison unavailable: ' + comparisonError;
    if (!compared) return 'Saved and per-edit comparisons are calculating.';
    const value = compared.rows.get(key);
    if (!value) return 'Saved comparison: no unambiguous matching term.';
    const lines = ['Saved: ' + _value(value.saved), 'Edited: ' + _value(value.current)];
    const diff = value.difference;
    lines.push(diff.available ? 'Change: ' + _signed(diff.delta) + ' (' + _percent(diff.percent) + ' vs saved)'
      : 'Change unavailable: ' + diff.reason);
    const relevant = value.edits.filter(edit => key === '' || edit.difference.changed || !edit.difference.available);
    if (relevant.length) lines.push('By edit (others kept; overlapping, not additive):');
    for (const edit of relevant) {
      const name = edit.change.name + ' \u00b7 ' + edit.change.label;
      const local = edit.difference;
      lines.push(name + ': ' + (local.available
        ? _value(edit.without) + ' \u2192 ' + _value(value.current) + '; \u0394 ' + _signed(local.delta)
          + ' (' + _percent(local.percent) + ' vs without edit)'
        : local.reason));
      if (edit.total.available) lines.push('  Impact on ' + totalName + ': ' + _signed(edit.total.delta)
        + ' (' + _percent(edit.total.share) + ' of edited total)');
      else lines.push('  Total impact unavailable: ' + edit.total.reason);
    }
    return lines.join('\n');
  }
  function bind(el, node, ancestors, key, route, allocation = null) {
    if (!targets.has(node)) targets.set(node, new Set());
    targets.get(node).add(el);
    const status = formulaNodeStatus(node);
    const info = [
      node.formula && !node.operation ? node.formula : '',
      node.source ? 'Source: ' + node.source : '',
      node.reason || '',
      node.note || '',
      !allocation && (status === 'Arithmetic not specified' || status === 'Not yet expanded')
        ? 'Detailed arithmetic has not been recorded for this term.' : '',
    ].filter(Boolean).join('\n');
    el.setAttribute('aria-description', [info, 'Press F2 to focus and scroll the full value tooltip.'].filter(Boolean).join('\n'));
    el.setAttribute('aria-keyshortcuts', 'F2');
    if (tooltip?.id) el.setAttribute('aria-describedby', tooltip.id);
    const show = () => {
      highlight([...ancestors, node]);
      if (!tooltip) return;
      activeTip = show;
      const contribution = allocation || contributions.get(route);
      const contributionInfo = contribution.available
        ? 'Allocated contribution to ' + totalName + ': ' + exactFormulaValue(contribution.amount)
          + ' (' + _share(contribution.percent) + ' of total)'
          + (contribution.parentPercent !== null ? '\nShare of parent: ' + _share(contribution.parentPercent) : '')
          + (contribution.neutral !== undefined ? '\nLocal neutral input: ' + contribution.neutral : '')
          + (contribution.percent === null ? '\nPercentage unavailable for a zero total or non-finite percentage.' : '')
          + '\nShared interaction credit is split equally (hierarchical Shapley allocation).'
          + '\nThis is a credit-allocation convention, not a game-defined causal split. Penalties can have negative credit.'
          + '\nAdd siblings and baseline, not parents plus their descendants. Filtering does not change shares.'
          + (contribution.reason ? '\n' + contribution.reason : '')
          + (contribution.partial ? '\nContribution is based on partial inputs.' : '')
        : 'Contribution unallocated: ' + contribution.reason;
      const impact = !allocation && route.length ? impactFor(route) : null;
      const impactInfo = !impact ? '' : impact.available
        ? 'Removal effect on ' + totalName + ': ' + _signed(impact.delta) + ' (' + _percent(impact.percent) + ' of total)'
          + '\nWithout this occurrence (replace by ' + impact.neutral + '): ' + exactFormulaValue(impact.without)
          + '\nOccurrence-specific arithmetic impact; interactions overlap, not a share summing to 100%.'
          + (impact.partial ? '\nImpact is based on a partial total.' : '')
        : 'Term impact unavailable: ' + impact.reason;
      tooltip.textContent = (node.name || node.label || 'Value') + ' = ' + exactFormulaValue(node.val)
        + [contributionInfo, !allocation ? comparisonInfo(key ?? routeKeys.get(route.join('.'))) : '', impactInfo, info]
          .filter(Boolean).map(text => '\n' + text).join('');
      tooltip.hidden = false;
      tooltip.tabIndex = 0;
      tooltip.onmouseleave = hideTip;
      tooltip.onblur = hideTip;
      tooltip.onkeydown = event => {
        if (event.key === 'Escape') { el.focus({ preventScroll: true }); hideTip(); }
      };
      const rect = el.getBoundingClientRect();
      const view = doc.defaultView;
      tooltip.style.left = Math.max(8, Math.min(rect.left, view.innerWidth - tooltip.offsetWidth - 8)) + 'px';
      tooltip.style.top = Math.max(8, Math.min(rect.bottom + 5, view.innerHeight - tooltip.offsetHeight - 8)) + 'px';
    };
    el.addEventListener('mouseenter', show);
    el.addEventListener('focus', show);
    const leave = event => { if (!tooltip?.contains(event.relatedTarget)) hideTip(); };
    el.addEventListener('mouseleave', leave);
    el.addEventListener('blur', leave);
    el.addEventListener('keydown', event => {
      if (event.key === 'Escape') hideTip();
      if (event.key === 'F2' && tooltip) { event.preventDefault(); show(); tooltip.focus({ preventScroll: true }); }
    });
  }
  function reveal(target) {
    if (state.query.trim() && rows.get(target)?.wrapper.hidden !== false) {
      search.value = '';
      applyFilter();
    }
    const visited = new Set();
    function find(node) {
      if (node === target) return [node];
      if (visited.has(node)) return null;
      visited.add(node);
      for (const child of _operands(node)) {
        const path = find(child);
        if (path) return [node, ...path];
      }
      return null;
    }
    const path = find(root);
    if (!path) return;
    for (const node of path) {
      const record = rows.get(node);
      if (record?.mount) {
        record.wrapper.open = true;
        record.mount();
      }
    }
    rows.get(target)?.heading.focus();
  }
  function expression(node, ancestors, key, route) {
    const equation = element('div', 'fi-expression');
    if (!state.inline.has(key)) state.inline.set(key, new Set());
    const expanded = state.inline.get(key);
    function draw(focusPath) {
      hideTip();
      for (const old of equation.querySelectorAll('.fi-operand')) {
        for (const [source, elements] of targets) {
          elements.delete(old);
          if (!elements.size) targets.delete(source);
        }
      }
      equation.replaceChildren();
      const inlineButton = (part, collapse) => {
        const button = element('button', 'fi-inline', collapse ? '-' : '+');
        button.type = 'button';
        button.dataset.path = part.path;
        button.setAttribute('aria-label', (collapse ? 'Collapse ' : 'Expand ') + (part.node?.name || part.inlineEnd.name) + ' inline');
        button.setAttribute('aria-expanded', String(collapse));
        button.addEventListener('click', () => {
          if (collapse) expanded.delete(part.path);
          else expanded.add(part.path);
          draw(part.path);
        });
        equation.append(button);
      };
      for (const part of formulaExpressionParts(node, { expanded })) {
        if (!part.node || (part.node.kind === 'constant' && part.node.name === 'Constant')) {
          equation.append(doc.createTextNode(part.text));
          if (part.inlineEnd) inlineButton(part, true);
          continue;
        }
        const operand = element('button', 'fi-operand', part.text);
        operand.type = 'button';
        operand.setAttribute('aria-label', (part.node.name || 'Value') + ': ' + part.text);
        operand.addEventListener('click', () => reveal(part.node));
        bind(operand, part.node, ancestors, undefined, route.concat(part.path.split('.').slice(1).map(Number)));
        equation.append(operand);
        if (part.node.operation) inlineButton(part, false);
      }
      equation.append(doc.createTextNode(' = ' + exactFormulaValue(node.val)));
      if (focusPath !== undefined) {
        [...equation.querySelectorAll('.fi-inline')].find(el => el.dataset.path === focusPath)?.focus();
      }
    }
    if (node.operation) draw();
    else equation.textContent = node.formula;
    return equation;
  }
  function inputEditors(node, heading, wrapper, key) {
    const controls = editor?.controls(node) || [];
    if (!controls.length) return;
    const toggle = element('button', 'fi-edit', 'Edit');
    toggle.type = 'button';
    toggle.dataset.fiFocus = key + ':edit';
    toggle.setAttribute('aria-label', 'Edit ' + (node.name || 'game input'));
    const panel = element('div', 'fi-inputs');
    panel.hidden = !state.editing.has(key);
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      panel.hidden = !panel.hidden;
      if (panel.hidden) state.editing.delete(key); else state.editing.add(key);
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });
    heading.append(toggle);
    wrapper.append(panel);
    for (const control of controls) {
      const label = element('label', 'fi-input-label', control.label + ' ');
      const input = element(control.type === 'choice' ? 'select' : 'input', 'fi-input');
      input.dataset.editId = control.id;
      input.dataset.fiFocus = key + ':' + control.id;
      input.setAttribute('aria-label', (node.name || 'Game input') + ': ' + control.label);
      if (control.type === 'choice') {
        for (const option of control.options) {
          const el = element('option', '', option.label);
          el.value = String(option.value); input.append(el);
        }
        input.value = String(control.value);
      } else if (control.type === 'flag') {
        input.type = 'checkbox'; input.checked = Boolean(control.value);
      } else {
        input.type = 'number'; input.value = String(control.value); input.step = String(control.step);
        if (control.min !== undefined) input.min = String(control.min);
        if (control.max !== undefined) input.max = String(control.max);
      }
      input.disabled = Boolean(control.disabled);
      const error = element('span', 'fi-error');
      error.setAttribute('role', 'alert');
      function commit(reset) {
        try {
          error.textContent = '';
          input.removeAttribute('aria-invalid');
          editor.change(control.id, reset ? undefined : input.type === 'checkbox' ? Number(input.checked) : input.value, reset);
        } catch (failure) {
          input.setAttribute('aria-invalid', 'true');
          error.textContent = failure.message || String(failure);
        }
      }
      input.addEventListener('change', () => commit(false));
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && input.type === 'number') { event.preventDefault(); commit(false); }
      });
      label.append(input);
      panel.append(label);
      if (control.edited) {
        const saved = control.type === 'flag' ? (control.saved ? 'On' : 'Off')
          : control.options?.find(option => Number(option.value) === control.saved)?.label ?? String(control.saved);
        panel.append(element('span', 'fi-saved', 'Saved: ' + saved));
        const reset = element('button', 'fi-edit', 'Reset');
        reset.type = 'button';
        reset.dataset.fiFocus = key + ':' + control.id + ':reset';
        reset.setAttribute('aria-label', 'Reset ' + (node.name || 'input') + ': ' + control.label);
        reset.addEventListener('click', () => commit(true));
        panel.append(reset);
      }
      panel.append(error);
    }
    heading.classList.toggle('fi-edited', controls.some(control => control.edited));
  }
  function row(node, ancestors, key = '', route = []) {
    const children = formulaOperandEntries(node);
    const expandable = children.length > 0;
    const wrapper = element(expandable ? 'details' : 'div', 'fi-node');
    const heading = element(expandable ? 'summary' : 'div', 'fi-row');
    if (!expandable) heading.tabIndex = 0;
    const status = formulaNodeStatus(node);
    heading.dataset.value = exactFormulaValue(node.val);
    heading.dataset.status = status;
    heading.append(element('span', 'fi-name', node.name || node.label || 'Value'));
    heading.append(element('code', 'fi-value', exactFormulaValue(node.val)));
    if (node.notApplicable || status === 'Unavailable' || node.partial) {
      heading.append(element('span', 'fi-status', status));
    }
    bind(heading, node, ancestors, key, route);
    const contribution = contributions.get(route);
    heading.dataset.formulaRoute = route.join('.');
    if (route.length) {
      const badge = element('small', 'fi-contribution', contribution.available && contribution.percent !== null
        ? _share(contribution.percent) + ' of total' : contribution.available ? 'Share unavailable' : 'Unallocated');
      if (contribution.available) heading.dataset.contributionValue = String(contribution.amount);
      if (contribution.percent !== null) heading.dataset.totalContribution = String(contribution.percent);
      heading.append(badge);
    }
    wrapper.append(heading);
    inputEditors(node, heading, wrapper, key);
    const record = { wrapper, heading, node, key, route };
    records.push(record);
    nodeKeys.set(key, node);
    if (!rows.has(node)) rows.set(node, record);
    if (expandable) {
      const body = element('div', 'fi-children');
      wrapper.append(body);
      let mounted = false;
      const mount = () => {
        if (!wrapper.open || mounted) return;
        mounted = true;
        if (node.formula) body.append(expression(node, ancestors, key, route));
        const terms = element('div', 'fi-terms');
        children.forEach(child => {
          terms.append(row(child.node, [...ancestors, node], key + '/' + child.key, route.concat(child.route)));
        });
        const allocation = contributions.split(route);
        for (const [kind, name] of [['baseline', 'Baseline / fixed constants'], ['unallocated', 'Unallocated breakdown']]) {
          const value = allocation[kind];
          if (!value) continue;
          const line = element('div', 'fi-allocation');
          line.tabIndex = 0;
          line.dataset.allocation = kind;
          line.dataset.parentRoute = route.join('.');
          if (value.available) line.dataset.contributionValue = String(value.amount);
          if (value.percent !== null) line.dataset.totalContribution = String(value.percent);
          line.append(element('span', 'fi-name', name), element('small', 'fi-contribution',
            value.percent !== null ? _share(value.percent) + ' of total' : 'Share unavailable'));
          bind(line, { name, val: value.value, note: value.reason }, [...ancestors, node], key, route, value);
          terms.append(line);
        }
        body.append(terms);
        applyComparison();
      };
      record.mount = mount;
      wrapper.addEventListener('toggle', () => {
        if (!state.query.trim()) {
          if (wrapper.open) state.open.add(key); else state.open.delete(key);
        }
        mount();
      });
      if (!state.query.trim() && state.open.has(key)) {
        wrapper.open = true;
        mount();
      }
    }
    return wrapper;
  }
  const tree = row(root, []);
  function applyComparison() {
    if (!compared) return;
    for (const record of records) {
      const value = compared.rows.get(record.key);
      if (!value) continue;
      const diff = value.difference;
      record.heading.classList.toggle('fi-changed', diff.changed);
      record.heading.dataset.savedValue = String(value.saved?.val ?? '');
      if (diff.available) record.heading.dataset.delta = String(diff.delta);
      else delete record.heading.dataset.delta;
    }
  }
  if (_operands(root).length) tree.firstElementChild.append(collapse);
  function applyFilter() {
    hideTip();
    state.query = search.value;
    const words = state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const active = words.length > 0;
    matches = new WeakMap();
    let count = 0;
    function scan(node) {
      if (matches.has(node)) return matches.get(node);
      const text = [node.name, node.label, node.source, node.note, node.reason].filter(Boolean).join(' ').toLowerCase();
      const match = words.every(word => text.includes(word));
      const entry = { match, descendant: false };
      matches.set(node, entry);
      if (match) count++;
      for (const child of _operands(node)) {
        const found = scan(child);
        if (found.match || found.descendant) entry.descendant = true;
      }
      return entry;
    }
    if (active) scan(root);
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const found = matches.get(record.node);
      record.wrapper.hidden = active && record.node !== root && !found?.match && !found?.descendant;
      record.heading.classList.toggle('fi-match', active && Boolean(found?.match));
      if (record.mount) {
        record.wrapper.open = active ? Boolean(found?.descendant) : state.open.has(record.key);
        record.mount();
      }
    }
    clear.hidden = !active;
    collapse.disabled = active;
    result.textContent = active ? (count ? count + ' matching terms; shares use the full formula' : 'No matching subterms') : '';
  }
  search.addEventListener('input', applyFilter);
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      search.value = '';
      applyFilter();
    }
  });
  clear.addEventListener('click', () => {
    search.value = '';
    applyFilter();
    search.focus();
  });
  host.append(filter, changes, tree);
  applyFilter();
  if (focused !== undefined) {
    const focusTarget = [...host.querySelectorAll('[data-fi-focus]')].find(el => el.dataset.fiFocus === focused)
      || [...host.querySelectorAll('[data-fi-focus]')].find(el => el.dataset.fiFocus === focused.replace(/:reset$/, ''));
    focusTarget?.focus({ preventScroll: true });
    if (focused === 'filter' && selection) focusTarget?.setSelectionRange(...selection);
  }
  for (const source of root.sourceReferences || []) {
    if (source.unavailable) {
      host.append(element('p', 'fi-error', source.name + ': ' + (source.reason || 'Unavailable')));
    }
  }
  if (comparison) {
    Promise.resolve().then(() => comparison.load(root)).then(value => {
      if (inspectorStates.get(host)?.renderToken !== token) return;
      if (!value) { changes.hidden = true; return; }
      compared = value;
      for (const { current: entry } of compared.rows.values()) {
        routeKeys.set(entry.route.join('.'), entry.key);
        nodeKeys.set(entry.key, entry.route.reduce((node, slot) => node.children[slot], root));
      }
      const changed = [...compared.rows.values()].filter(row => row.difference.changed).length + compared.removed.length;
      changesSummary.textContent = changed + ' changed formula term' + (changed === 1 ? '' : 's');
      applyComparison();
      if (changes.open) drawChanges();
      activeTip?.();
    }).catch(error => {
      if (inspectorStates.get(host)?.renderToken !== token) return;
      comparisonError = error.message || String(error);
      changesSummary.textContent = 'Formula comparison unavailable';
      changesBody.textContent = comparisonError;
      changesBody.setAttribute('role', 'alert');
      changes.open = true;
      activeTip?.();
    });
  }
}
