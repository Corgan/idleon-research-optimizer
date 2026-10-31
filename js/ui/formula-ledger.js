import { allDescriptors, getCatalog } from '../stats/registry.js';
import { buildTree } from '../stats/tree-builder.js';
import { statsInspectionCatalog } from '../stats/inspection-catalog.js';
import { formulaExpansionAudit } from '../stats/formula-tree.js';
import { FORMULA_CATEGORIES, formulaInspectionOutputs, reconcileFormulaInventory } from '../stats/formula-ledger.js';
import { renderFormulaInspector } from './formula-inspector.js';

export function mountFormulaLedger(host, { getContext, tooltip, getComparison }) {
  const doc = host.ownerDocument;
  const make = (tag, text, cls = '') => {
    const el = doc.createElement(tag);
    el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const disclosure = make('details', undefined, 'fl-ledger');
  disclosure.append(make('summary', 'Source inventory & coverage'));
  const content = make('div');
  disclosure.append(content);
  host.replaceChildren(disclosure);
  let model, inventory, loading = false, generation = 0, renderList;
  const outputs = formulaInspectionOutputs(allDescriptors(), statsInspectionCatalog());
  function controls() {
    const controls = make('div', undefined, 'fi-controls');
    function select(label, options) {
      const wrapper = make('label', label), input = make('select');
      for (const [value, text] of options) {
        const option = make('option', text); option.value = value; input.append(option);
      }
      wrapper.append(input); controls.append(wrapper);
      return input;
    }
    const view = select('Browse ', [['outputs', 'Player-facing outputs'], ['native', 'Native source candidates']]);
    const label = make('label', 'Search '), search = make('input');
    search.type = 'search'; search.placeholder = 'Name, system, source or input';
    label.append(search); controls.append(label);
    const category = select('Category ', [['', 'All categories'], ...FORMULA_CATEGORIES.map(name => [name, name])]);
    const system = select('System ', [['', 'All systems'],
      ...[...new Set(model.native.map(record => record.system).concat(outputs.map(output => output.group)))]
        .sort().map(name => [name, name])]);
    const state = select('Coverage ', [['', 'All statuses'], ['unlinked', 'Native / implementation link pending'],
      ['linked', 'Explicitly linked'], ['unreviewed', 'Source review pending'], ['verified', 'Source-audited']]);
    const count = make('p', undefined, 'context-note');
    count.setAttribute('role', 'status');
    const list = make('div'), more = make('button', 'Show more', 'fi-more');
    more.type = 'button';
    const c = model.counts;
    content.replaceChildren(
      make('p', `${c.containers} native containers + ${c.branches} branch candidates; not a formula count. `
        + `${c.inspectedOutputs} calculator outputs, ${c.linkedOutputs} linked to native families. `
        + `${c.classified} candidates classified; ${c.verified} source-audited.`, 'context-note'),
      controls, count, list, more,
    );
    const caveats = make('details', undefined, 'fl-caveats');
    caveats.append(make('summary', 'Scope, source and remaining gaps'));
    caveats.append(make('p', inventory.scope), make('p', 'Native snapshot ' + inventory.source.version
      + ' | SHA-256 ' + inventory.source.hash));
    for (const note of inventory.limitations) caveats.append(make('p', note));
    caveats.append(make('p', 'Categories are suggested until reviewed. “Linked” records a deliberate implementation association, '
      + 'not complete coverage. Expansion is measured only for the inspected context; arithmetic parity is not source verification. '
      + 'No overall coverage percentage is claimed. Regenerate after each patch with node _tools\\formula-inventory.mjs.'));
    content.append(caveats);
    let limit = 60;
    function navigate(id) {
      view.value = 'native'; category.value = ''; system.value = ''; state.value = '';
      search.value = id; limit = 60; renderList();
      const section = list.querySelector('details');
      if (section) { section.open = true; section.querySelector('summary').focus(); }
    }
    function button(text, fn) {
      const el = make('button', text, 'fl-link'); el.type = 'button'; el.addEventListener('click', fn); return el;
    }
    function inspect(output, body, version) {
      const action = button('Inspect in current calculation context', async () => {
        const ctx = getContext();
        if (!ctx) { result.textContent = 'Load a save to evaluate this output.'; return; }
        action.disabled = true;
        result.removeAttribute('role');
        result.textContent = 'Loading formula...';
        try {
          const root = await (output.descriptor ? buildTree(output.descriptor, getCatalog(), ctx) : output.resolve(ctx));
          if (generation !== version) return;
          if (!root || !Object.hasOwn(root, 'val')) throw new Error('Missing formula value.');
          result.replaceChildren();
          const audit = formulaExpansionAudit(root);
          result.append(make('p', (audit.complete ? 'Explicit expansion complete for this context.' : 'Expansion incomplete: ')
            + (audit.complete ? '' : `${audit.gaps} unexpanded terms, ${audit.unavailable} unavailable, ${audit.partial} partial, `
              + `${audit.mismatches} arithmetic mismatches, ${audit.cycles} cycles.`)
            + ' This is not a native-source audit.', 'context-note'));
          const tree = make('div'); result.append(tree);
          if (audit.cycles) throw new Error('Cyclic formula tree cannot be displayed.');
          renderFormulaInspector(root, tree, { tooltip, comparison: getComparison?.(output) });
        } catch (error) {
          if (generation !== version) return;
          result.textContent = 'Unable to inspect formula: ' + (error.message || String(error));
          result.setAttribute('role', 'alert');
        } finally { action.disabled = false; }
      });
      const result = make('div', undefined, 'fl-inspection');
      body.append(action, result);
    }
    renderList = () => {
      if (tooltip) tooltip.hidden = true;
      const version = ++generation, native = view.value === 'native';
      const query = search.value.toLowerCase().trim();
      const matches = (native ? model.native : model.outputs).filter(record => {
        const linked = native ? record.links.length || record.implementation : record.nativeIds.length;
        return (!category.value || record.category === category.value)
          && (!system.value || (native ? record.system : record.group) === system.value)
          && (!state.value || (state.value === 'linked' ? linked
            : state.value === 'unlinked' ? !linked
              : state.value === 'verified' ? record.review?.verified
                : !record.review?.verified))
          && (!query || JSON.stringify([record.name, record.id || record.key, record.block,
            record.system || record.group, record.tags, record.dependencies?.attributes, record.note]).toLowerCase().includes(query));
      });
      count.textContent = Math.min(limit, matches.length) + ' of ' + matches.length + ' matching '
        + (native ? 'source candidates' : 'calculator outputs') + '.';
      list.replaceChildren(); more.hidden = limit >= matches.length;
      for (const record of matches.slice(0, limit)) {
        const section = make('details', undefined, 'fi-entry fl-entry');
        const heading = make('summary', record.name);
        const body = make('div', undefined, 'fl-body');
        section.append(heading, body); list.append(section);
        let mounted = false;
        section.addEventListener('toggle', () => {
          if (!section.open || mounted) return;
          mounted = true;
          body.append(make('p', record.category + ' | ' + (native ? record.system : record.group), 'context-note'));
          if (!native) {
            body.append(make('p', 'Implementation: available. Native association: '
              + (record.nativeIds.length ? 'linked' : 'pending') + '. Source verification: not audited.', 'context-note'));
            for (const id of record.nativeIds) body.append(button('Native source: ' + id, () => navigate(id)));
            inspect(record, body, version);
            return;
          }
          const d = record.dependencies;
          body.append(make('p', 'Candidate: ' + record.kind + ' | Review: ' + record.review.state));
          if (record.review.evidence) body.append(make('p', record.review.evidence));
          body.append(make('code', inventory.source.path + ':' + record.source.spans.map(span => span.join('-')).join(', ')));
          body.append(make('p', 'Record SHA-256 ' + record.source.hash, 'context-note'));
          if (record.note) body.append(make('p', record.note));
          if (record.tags.length) body.append(make('p', record.tags.join(' | '), 'context-note'));
          body.append(make('p', 'Inputs read: ' + (d.attributes.join(', ') || 'No direct attribute reads detected.')));
          body.append(make('p', 'Static tables: ' + (d.tables.join(', ') || 'None detected.')));
          body.append(make('p', 'DNSM reads: ' + (d.cacheReads.join(', ') || 'None detected.')
            + ' | writes: ' + (d.cacheWrites.join(', ') || 'None detected.')));
          body.append(make('p', 'Operations: ' + (d.rounding.join(', ') || 'No rounding/cap calls detected.')
            + (d.random ? ' | RNG calls present (may include cosmetics).' : '')
            + (d.timers ? ' | ' + d.timers + ' nested timer calls.' : '')));
          if (record.kind === 'dispatch-branch') body.append(button('Containing family', () => navigate(record.family)));
          else {
            const branches = model.native.filter(candidate => candidate.family === record.id && candidate.id !== record.id);
            if (branches.length) body.append(button('Browse ' + branches.length + ' branch candidates', () => {
              category.value = ''; system.value = ''; state.value = ''; limit = 60;
              search.value = record.id + '/p'; renderList();
            }));
          }
          if (record.implementation) {
            const link = make('a', record.exportName + ' (related implementation)', 'fl-link');
            link.href = './' + record.implementation; link.target = '_blank'; link.rel = 'noopener';
            body.append(link);
          }
          for (const output of record.links) {
            const linked = make('details', undefined, 'fl-output');
            linked.append(make('summary', output.name));
            const outputBody = make('div'); linked.append(outputBody);
            let resolved = false;
            linked.addEventListener('toggle', () => {
              if (!linked.open || resolved) return;
              resolved = true; inspect(output, outputBody, version);
            });
            body.append(linked);
          }
          if (!record.links.length && !record.implementation) body.append(make('p',
            'No implementation linked yet. This does not establish that the calculator lacks this behavior.', 'context-note'));
          const dependencies = make('details');
          dependencies.append(make('summary', d.calls.length + ' direct custom-block dependencies'));
          let dependenciesMounted = false;
          dependencies.addEventListener('toggle', () => {
            if (!dependencies.open || dependenciesMounted) return;
            dependenciesMounted = true;
            for (const call of d.calls) {
              const row = make('div', undefined, 'fl-dependency');
              row.append(make('code', call.block + '(' + call.args.map(arg => arg === null ? '?' : JSON.stringify(arg)).join(', ') + ')'));
              if (call.dynamic) row.append(make('span', ' Dynamic arguments require tracing. '));
              if (call.targets.length !== 1) row.append(make('span', 'Unresolved or ambiguous native target.'));
              for (const id of call.targets) row.append(button('Open family', () => navigate(id)));
              dependencies.append(row);
            }
          });
          body.append(dependencies);
        });
      }
    };
    for (const control of [view, category, system, state]) control.addEventListener('change', () => { limit = 60; renderList(); });
    search.addEventListener('input', () => { limit = 60; renderList(); });
    more.addEventListener('click', () => { limit += 60; renderList(); });
    renderList();
  }
  disclosure.addEventListener('toggle', async () => {
    if (!disclosure.open || model || loading) return;
    loading = true; content.textContent = 'Loading native formula inventory...';
    try {
      const response = await fetch(new URL('../stats/data/formula-inventory.json', import.meta.url));
      if (!response.ok) throw new Error('Inventory HTTP ' + response.status);
      inventory = await response.json();
      model = reconcileFormulaInventory(inventory, outputs);
      content.removeAttribute('role');
      controls();
    } catch (error) {
      content.textContent = 'Unable to load source inventory: ' + (error.message || String(error));
      content.setAttribute('role', 'alert');
    } finally { loading = false; }
  });
  return { refresh() { generation++; renderList?.(); } };
}
