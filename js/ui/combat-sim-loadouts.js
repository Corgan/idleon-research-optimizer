import { normalizeCombatSetup } from '../stats/systems/common/combat-sim-setup.js';

export const COMBAT_LOADOUT_PREFIX = 'combat-sim-loadout:';
export const COMBAT_DRAFT_PREFIX = 'combat-sim-draft:';
const LEGACY_PREFIX = 'combat-sim-setup:';

export function combatLoadoutKey(ci, name) {
  return COMBAT_LOADOUT_PREFIX + Number(ci) + ':' + encodeURIComponent(String(name).trim());
}

export function readCombatLoadouts(store, ci) {
  if (!store) return [];
  const byName = new Map();
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    const scoped = key && key.startsWith(COMBAT_LOADOUT_PREFIX + Number(ci) + ':');
    const legacy = key && key.startsWith(LEGACY_PREFIX) && key !== LEGACY_PREFIX + '__active__';
    if (!scoped && !legacy) continue;
    const parsed = JSON.parse(store.getItem(key));
    if (!parsed || !Array.isArray(parsed.patches)) throw new Error('Invalid saved loadout: ' + key);
    if (Number(parsed.charIdx) !== Number(ci)) continue;
    const name = scoped ? decodeURIComponent(key.slice((COMBAT_LOADOUT_PREFIX + Number(ci) + ':').length)) : key.slice(LEGACY_PREFIX.length);
    if (!byName.has(name) || scoped) byName.set(name, { key, name, setup: normalizeCombatSetup(parsed) });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function readCombatDraft(store, ci) {
  const saved = store && (store.getItem(COMBAT_DRAFT_PREFIX + ci) || store.getItem(LEGACY_PREFIX + '__active__'));
  if (!saved) return normalizeCombatSetup({ charIdx: ci, patches: [] });
  const parsed = JSON.parse(saved);
  return normalizeCombatSetup(Number(parsed.charIdx) === Number(ci) ? parsed : { charIdx: ci, patches: [] });
}
