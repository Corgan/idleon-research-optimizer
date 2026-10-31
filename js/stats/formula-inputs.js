import { N2L } from './data/common/encoding.js';
import { CompanionDB } from './data/game/customlists.js';
import { entityName } from './entity-names.js';
import {
  LEVEL_TABLES, readTable, readRawKey, saveRoot, applyCombatSetupDetailed,
  readCompanions, EQUIP_STAT_KEYS,
} from './systems/common/combat-sim-setup.js';

function _location(source) {
  if (typeof source !== 'string') return null;
  const match = /^([A-Za-z]\w*)((?:\[\d+\]|\.[A-Za-z]\w*)*)$/.exec(source);
  if (!match) return null;
  return { key: match[1], path: [...match[2].matchAll(/\[(\d+)\]|\.([A-Za-z]\w*)/g)]
    .map(part => part[1] === undefined ? part[2] : Number(part[1])) };
}

function _cell(raw, key, path) {
  let value = readRawKey(raw, key);
  for (const part of path) value = value?.[part];
  return value;
}

function _id(key, path) { return 'input:' + key + ':' + JSON.stringify(path); }
function _optionsKey(raw) {
  return Object.hasOwn(saveRoot(raw), 'OptionsListAccount') ? 'OptionsListAccount' : 'OptLacc';
}
function _prismaList(raw) {
  return String(readRawKey(raw, _optionsKey(raw))?.[384] || '').split(',').filter(Boolean);
}
function _prismaCode(cauldron, index) { return N2L[cauldron] + index; }
function _ownedToken(raw, id) {
  return String(readRawKey(raw, _optionsKey(raw))?.[606] || '').split(',').some(value => value !== '' && Number(value) === id);
}

export function createFormulaInputSandbox(raw) {
  const catalog = new Map(), tableCache = new Map();
  let edits = new Map(), current = raw;

  function tables(key, ci) {
    const cacheKey = key + ':' + ci;
    if (tableCache.has(cacheKey)) return tableCache.get(cacheKey);
    const rows = new Map();
    for (const table of LEVEL_TABLES) {
      if ((typeof table.key === 'function' ? table.key(ci) : table.key) !== key || table.decode) continue;
      for (const row of readTable(raw, table.id, ci)) {
        if (row.kind === 'readonly') continue;
        const path = table.path.concat(table.cell ? table.cell(row.index)
          : [table.indices ? row.index : (table.offset || 0) + (table.stride || 1) * row.index]);
        rows.set(JSON.stringify(path), { table, row });
      }
    }
    tableCache.set(cacheKey, rows);
    return rows;
  }

  function register(control, value) {
    catalog.set(control.id, control);
    return { ...control, value, edited: edits.has(control.id) };
  }

  function controls(node) {
    if (node.operation || node.formula || node.unavailable || node.notApplicable) return [];
    if (node.gameInput?.type === 'companion') {
      const id = node.gameInput.id;
      if (!Number.isInteger(id) || !CompanionDB[id] || !readCompanions(raw).available) return [];
      const saved = readCompanions(raw).owned.find(entry => entry.id === id);
      const token = _ownedToken(raw, id);
      const savedValue = saved?.enhanced ? 2 : saved || token ? 1 : 0;
      const selected = readCompanions(current).owned.find(entry => entry.id === id);
      return [register({
        id: 'companion:' + id, name: entityName('Companion', id), type: 'choice', label: 'Ownership', saved: savedValue,
        options: [...(token ? [] : [{ value: 0, label: 'Not owned' }]),
          { value: 1, label: token ? 'Normal (Pet Bonus Token)' : 'Normal' }, { value: 2, label: 'Pet+' }],
        companion: id,
      }, selected?.enhanced ? 2 : selected || token ? 1 : 0)];
    }
    if (node.nonNumeric) return [];
    const location = _location(node.source);
    if (!location) return [];
    const { key, path } = location;
    const ci = Number(/_(\d+)$/.exec(key)?.[1] || 0);
    const mapping = tables(key, ci).get(JSON.stringify(path));
    const result = [];
    if (mapping) {
      const { table, row } = mapping;
      if (row.raw == null || String(row.raw).trim() === '' || !Number.isFinite(Number(row.raw))) return [];
      const control = {
        id: _id(key, path), type: row.kind === 'flag' ? 'flag' : row.kind === 'choice' ? 'choice' : 'number',
        label: row.kind === 'flag' ? 'Owned' : row.kind === 'choice' ? 'Tier' : 'Level',
        name: row.name,
        saved: Number(row.value), min: 0, step: 1,
        max: row.max ?? (table.id === 'vials' ? 13 : undefined), options: row.options,
        key, path, table: table.id, index: row.index, ci,
      };
      const now = readTable(current, table.id, ci).find(entry => entry.index === row.index);
      result.push(register(control, Number(now.value)));
      if (key === 'CauldronInfo' && path.length === 2 && path[0] < 4) {
        const [cauldron, index] = path, code = _prismaCode(cauldron, index);
        result.push(register({
          id: 'prisma:' + cauldron + ':' + index, type: 'flag', label: 'Prisma',
          name: row.name,
          saved: _prismaList(raw).includes(code) ? 1 : 0, cauldron, index,
          disabled: Number(now.value) <= 0,
        }, _prismaList(current).includes(code) ? 1 : 0));
      }
      return result;
    }
    const talent = /^SL_(\d+)$/.exec(key);
    const equipment = /^EMm[01]_\d+$/.test(key);
    const obol = /^ObolEqMAP(?:_\d+|z1)$/.test(key);
    if (talent && path.length === 1 && Number.isInteger(path[0])) {
      const saved = _cell(raw, key, path), cap = _cell(current, 'SM_' + talent[1], path);
      if (saved == null || cap == null || String(saved).trim() === '' || String(cap).trim() === ''
        || !Number.isFinite(Number(saved)) || !Number.isFinite(Number(cap))) return [];
      return [register({
        id: _id(key, path), type: 'number', label: 'Level', saved: Number(saved),
        name: entityName('Talent', path[0]) + ' (Character ' + (Number(talent[1]) + 1) + ')',
        min: 0, max: Number(cap), step: 1, key, path, talent: path[0], ci: Number(talent[1]),
      }, Number(_cell(current, key, path)))];
    }
    if ((equipment || obol) && path.length === 2 && Number.isInteger(path[0])
      && EQUIP_STAT_KEYS.includes(path[1]) && !/txt$/.test(path[1])) {
      const namesKey = equipment ? key.replace(/^EMm([01])_/, 'EquipOrder_')
        : key === 'ObolEqMAPz1' ? 'ObolEqO1' : key.replace('ObolEqMAP_', 'ObolEqO0_');
      const row = equipment ? Number(key[3]) : null;
      const item = _cell(current, namesKey, equipment ? [row, path[0]] : [path[0]]);
      if (!item || /^(Blank|Null|B)$/.test(String(item))) return [];
      const saved = _cell(raw, key, path) ?? 0;
      if (!Number.isFinite(Number(saved))) return [];
      return [register({
        id: _id(key, path), type: 'number', label: 'Added', saved: Number(saved), step: 'any', key, path,
        name: entityName('Item', item) + ': ' + (node.name || path[1])
          + (key === 'ObolEqMAPz1' ? ' (Family)' : ' (Character ' + (ci + 1) + ')'),
      }, Number(_cell(current, key, path) ?? 0))];
    }
    return [];
  }

  function materialize(next) {
    const patches = [], prisma = new Set(_prismaList(raw));
    let prismaChanged = false;
    for (const { control, value } of next.values()) {
      if (control.cauldron !== undefined) {
        const code = _prismaCode(control.cauldron, control.index);
        if (value) prisma.add(code); else prisma.delete(code);
        prismaChanged = true;
      } else if (control.companion !== undefined) {
        patches.push({ system: 'companion', id: control.companion, owned: value > 0, enhanced: value === 2 });
      } else if (control.table) {
        patches.push({ system: 'table', table: control.table, index: control.index, value, ci: control.ci });
      } else if (control.talent !== undefined) {
        patches.push({ system: 'talent', id: control.talent, level: value, ci: control.ci });
      } else patches.push({ system: 'raw', key: control.key, path: control.path, value });
    }
    if (prismaChanged) patches.push({
      system: 'raw', key: _optionsKey(raw), path: [384], value: [...prisma].join(',') + (prisma.size ? ',' : ''),
    });
    const result = applyCombatSetupDetailed(raw, { version: 1, charIdx: 0, patches });
    if (result.warnings.length) throw new Error(result.warnings.join('; '));
    for (const { control, value } of next.values()) {
      if (control.cauldron !== undefined && value
        && !(Number(_cell(result.raw, 'CauldronInfo', [control.cauldron, control.index])) > 0)) {
        throw new Error('Purchase at least one bubble level before applying Prisma.');
      }
    }
    return next.size ? result.raw : raw;
  }

  function set(id, input) {
    const control = catalog.get(id);
    if (!control) throw new Error('Unknown editable game input.');
    if (input === '' || input == null || typeof input === 'string' && !input.trim()) throw new Error('Enter a number.');
    const value = Number(input);
    if (!Number.isFinite(value)) throw new Error('Enter a finite number.');
    if (control.type === 'flag' && value !== 0 && value !== 1) throw new Error('Choose On or Off.');
    if (control.type === 'choice' && !control.options.some(option => Number(option.value) === value)) throw new Error('Choose a listed game value.');
    if (control.step === 1 && !Number.isSafeInteger(value)) throw new Error('Enter a whole level.');
    if (control.min !== undefined && value < control.min) throw new Error('Minimum: ' + control.min + '.');
    if (control.max !== undefined && value > control.max) throw new Error('Maximum: ' + control.max + '.');
    const next = new Map(edits);
    if (Object.is(value, control.saved)) next.delete(id);
    else next.set(id, { control, value });
    const updated = materialize(next), undo = rollback();
    edits = next;
    current = updated;
    return undo;
  }

  function rollback() {
    const previousEdits = edits, previousRaw = current;
    return () => { edits = previousEdits; current = previousRaw; };
  }

  return {
    controls, set,
    current: () => current,
    count: () => edits.size,
    changes: () => [...edits.values()].map(({ control, value }) => ({
      id: control.id, name: control.name, label: control.label, saved: control.saved, value, options: control.options, type: control.type,
    })),
    capture: () => [...edits.values()].map(({ control, value }) => ({
      id: control.id, value,
      input: control.companion !== undefined ? { gameInput: { type: 'companion', id: control.companion } }
        : { source: control.cauldron !== undefined ? 'CauldronInfo[' + control.cauldron + '][' + control.index + ']'
          : control.key + control.path.map(part => typeof part === 'number' ? '[' + part + ']' : '.' + part).join('') },
      change: { id: control.id, name: control.name, label: control.label, saved: control.saved, value },
    })),
    reset(id) {
      const undo = rollback();
      if (id === undefined) { edits = new Map(); current = raw; return undo; }
      const next = new Map(edits);
      next.delete(id);
      const updated = materialize(next);
      edits = next;
      current = updated;
      return undo;
    },
  };
}
