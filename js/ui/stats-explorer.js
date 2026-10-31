import { statsInspectionCatalog } from '../stats/inspection-catalog.js';
import { renderFormulaInspector } from './formula-inspector.js';

export function mountStatsExplorer(host, { getContext, tooltip, editor, getComparison }) {
  const doc = host.ownerDocument;
  const entries = statsInspectionCatalog();
  const make = (tag, text) => {
    const el = doc.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const controls = make('div');
  controls.className = 'fi-controls';
  const searchLabel = make('label', 'Search formulas ');
  const search = make('input');
  search.type = 'search';
  search.placeholder = 'Name or system';
  searchLabel.append(search);
  const groupLabel = make('label', 'System ');
  const group = make('select');
  const all = make('option', 'All systems');
  all.value = '';
  group.append(all);
  for (const name of new Set(entries.map(entry => entry.group))) {
    const option = make('option', name);
    option.value = name;
    group.append(option);
  }
  groupLabel.append(group);
  controls.append(searchLabel, groupLabel);
  const status = make('p');
  status.className = 'fi-coverage';
  status.setAttribute('role', 'status');
  const list = make('div');
  const more = make('button', 'Show more');
  more.type = 'button';
  more.className = 'fi-more';
  host.replaceChildren(controls, status, list, more);
  let limit = 60;
  let generation = 0;
  const records = new Map();
  function render() {
    if (tooltip) tooltip.hidden = true;
    const version = ++generation;
    const ctx = getContext();
    const query = search.value.toLowerCase().trim();
    const matches = entries.filter(entry => (!group.value || group.value === entry.group)
      && (!query || (entry.name + ' ' + entry.group + ' ' + entry.note).toLowerCase().includes(query)));
    more.hidden = !ctx || matches.length <= limit;
    status.textContent = !ctx ? 'Load a save to inspect systems.'
      : Math.min(limit, matches.length) + ' of ' + matches.length + ' matching formulas. '
        + 'Trees load on demand; unexpanded terms are not verified raw inputs.';
    if (!ctx) { list.replaceChildren(); records.clear(); return; }
    const visible = new Set(), sections = [];
    for (const entry of matches.slice(0, limit)) {
      visible.add(entry.key);
      const existing = records.get(entry.key);
      if (existing) {
        existing.ctx = ctx;
        existing.version = version;
        sections.push(existing.section);
        if (existing.section.open && existing.loadedCtx !== ctx) existing.load();
        continue;
      }
      const section = make('details');
      section.className = 'fi-entry';
      const summary = make('summary', entry.name);
      const body = make('div');
      section.append(summary, body);
      let loaded = false;
      const record = { section, ctx, version, loadedCtx: null, loadingVersion: null };
      record.load = async () => {
        if (!section.open || record.loadedCtx === record.ctx || record.loadingVersion === record.version) return;
        loaded = true;
        const context = record.ctx, requestedVersion = record.version;
        record.loadingVersion = requestedVersion;
        if (!body.children.length) body.textContent = 'Loading formula...';
        try {
          const root = await entry.resolve(context);
          if (generation !== requestedVersion) return;
          record.loadedCtx = context;
          if (!root || !Object.prototype.hasOwnProperty.call(root, 'val')) throw new Error('Resolver returned no formula value.');
          body.removeAttribute('role');
          renderFormulaInspector(root, body, { tooltip, editor, comparison: getComparison?.(entry) });
          if (entry.note) {
            const note = make('p', entry.note);
            note.className = 'fi-expression';
            body.prepend(note);
          }
        } catch (error) {
          if (generation !== requestedVersion) return;
          record.loadedCtx = context;
          body.textContent = 'Unable to inspect formula: ' + (error.message || String(error));
          body.setAttribute('role', 'alert');
        }
      };
      section.addEventListener('toggle', () => {
        if (section.open && (!loaded || record.loadedCtx !== record.ctx)) record.load();
      });
      records.set(entry.key, record);
      sections.push(section);
    }
    for (const key of records.keys()) if (!visible.has(key)) records.delete(key);
    if (sections.length !== list.children.length || sections.some((section, i) => list.children[i] !== section)) list.replaceChildren(...sections);
  }
  search.addEventListener('input', () => { limit = 60; render(); });
  group.addEventListener('change', () => { limit = 60; render(); });
  more.addEventListener('click', () => { limit += 60; render(); });
  render();
  return { refresh: render };
}
