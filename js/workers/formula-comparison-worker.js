import { loadSaveData } from '../save/loader.js';
import { saveData } from '../state.js';
import { createStatContext } from '../stats/stat-context.js';
import { statsInspectionCatalog } from '../stats/inspection-catalog.js';
import { createFormulaInputSandbox } from '../stats/formula-inputs.js';
import { formulaSnapshot } from '../stats/formula-comparison.js';

let snapshot;
let queue = Promise.resolve();
const entries = new Map(statsInspectionCatalog().map(entry => [entry.key, entry]));

async function compare(target) {
  const sandbox = createFormulaInputSandbox(snapshot.raw);
  for (const edit of snapshot.edits) sandbox.controls(edit.input);
  for (const edit of snapshot.edits) sandbox.set(edit.id, edit.value);
  async function resolve(raw, detailed = false) {
    loadSaveData(raw);
    const ctx = createStatContext({ ...snapshot.context, saveData,
      layer1: { ...snapshot.context.layer1, formulaDetails: true } });
    const entry = target.entry ? entries.get(target.entry) : null;
    if (target.entry && !entry) throw new Error('Unknown formula inspection entry.');
    const root = entry ? await entry.resolve(ctx) : ctx.resolve(target.descriptor);
    if (!root || !Object.hasOwn(root, 'val')) throw new Error('Formula comparison returned no value.');
    return formulaSnapshot(root, { compact: !detailed });
  }
  const current = await resolve(sandbox.current());
  const baseline = await resolve(snapshot.raw, true);
  const variants = [];
  for (const edit of snapshot.edits) {
    let undo;
    try { undo = sandbox.reset(edit.id); }
    catch (error) {
      variants.push({ change: edit.change, error: 'Cannot remove this edit independently: ' + (error.message || String(error)) });
      continue;
    }
    try { variants.push({ change: edit.change, values: await resolve(sandbox.current()) }); }
    catch (error) {
      variants.push({ change: edit.change, error: 'Formula evaluation without this edit failed: ' + (error.message || String(error)) });
    } finally { undo(); }
  }
  return { current, baseline, variants };
}

self.onmessage = ({ data }) => {
  if (data.type === 'init') { snapshot = data.snapshot; return; }
  queue = queue.then(async () => {
    try { self.postMessage({ id: data.id, result: await compare(data.target) }); }
    catch (error) { self.postMessage({ id: data.id, error: error.message || String(error) }); }
  });
};
