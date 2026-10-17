// ===== COMBAT SIM COMPONENT TERMS =====
// Lists every component term (descriptor pool source or inline source function)
// that feeds the combat sim's inputs for one character/map, with its saved and
// effective value, so the page can override the smaller terms that bubble up
// into Drop Rate, Coin, EXP, damage, etc. Overrides use js/stats/term-overrides.js
// rules ({mode:'off'|'set'|'scale', value}) and must be applied by building the
// sim inside withTermScope({ overrides }) — see js/workers/combat-sim-worker.js.

import { buildCombatInputs } from './combat-sim-inputs.js';
import { withTermScope, normalizeTermOverrides, summarizeTermTrace } from '../../term-overrides.js';
import { label } from '../../entity-names.js';

// Friendly labels for `fn:<name>:<id>` terms (descriptor safe() calls).
const FN_ENTITY = {
  achieveStatus: 'Achievement', cardLv: 'Card', computeCardLv: 'Card', mainframeBonus: 'Mainframe',
  computeArtifactBonus: 'Artifact', computeExoticBonus: 'Exotic', computeCompassBonus: 'Compass',
  grimoireUpgBonus: 'Grimoire', computePaletteBonus: 'Palette', statueBonus: 'Statue',
  legendPTSbonus: 'Legend', rogBonusQTY: 'RoG', computeShrine: 'Shrine', computePrayerReal: 'Prayer',
  computeVialByKey: 'Vial', bubbleValByKey: 'Bubble', computeMealBonus: 'Meal', computeMSABonus: 'Gaming',
};
const FN_TEXT = {
  votingBonusz: 'Voting bonus', computeBoxReward: 'Post Office', computeCardSetBonus: 'Card set',
  computePetArenaBonus: 'Pet arena', computeVaultKillzTotal: 'Vault kill bonus', computeCropSC: 'Crop scientist',
  computeDivinityMajor: 'Divinity major', computeDivinityMinor: 'Divinity minor', computeDivinityBless: 'Divinity blessing',
  computeChipBonus: 'Lab chip', computeMeritocBonusz: 'Meritocracy', computeCosmoBonus: 'Cosmo upgrade',
  computeMonumentROGbonus: 'Monument', bubbaRoGBonuses: 'Bubba', computeShinyBonusS: 'Shiny pet',
  computeArtifactBonus1: 'Artifact: Maneki Kat', computeGambitBonus7: 'Gambit', computeAllShimmerBonuses: 'Shimmer bonuses',
  eventShopOwned: 'Event shop', farmRankUpgBonus: 'Land rank upgrade', getSetBonus: 'Equipment set',
  computeStickerBonus: 'Sticker', computeStickerDmgMulti: 'Sticker damage multi', computeEclipseSkulls: 'Eclipse skulls',
  computeKillroyDMG: 'Killroy damage', computeRiftSkillETC: 'Rift skill bonus', superBitType: 'Super bit',
  computeBigFishBonus: 'Big fish', computeTotalTitanKills: 'Titan kills', computeArcaneMapMultiBon: 'Arcane map multiplier',
  computeFamBonusQTYs: 'Family bonus', computeBonusLineWidth: 'Lab line width', computeBubonicGreen: 'Bubonic green',
  totalDmgBonus: 'Total damage bonus',
};

/** Player-facing name for a term key. */
export function combatTermLabel(key, fallback) {
  const p = String(key).split(':');
  if (p[0] !== 'fn') return fallback || key;
  const fn = p[1], args = p.slice(2).join(':');
  if (FN_ENTITY[fn] && args) {
    const id = /^\d+$/.test(args) ? Number(args) : args;
    try { return label(FN_ENTITY[fn], id); } catch (e) { /* fall through */ }
  }
  if (FN_TEXT[fn]) return FN_TEXT[fn] + (args ? ' (' + args + ')' : '');
  return fallback || key;
}

/** Term scope used for a sim run; null when there are no valid overrides. */
export function combatTermScope(overrides) {
  const o = normalizeTermOverrides(overrides);
  return Object.keys(o).length ? { overrides: o } : null;
}

/** Runs fn inside the term scope for `overrides` (no-op scope when empty). */
export function withCombatTerms(overrides, fn) {
  const scope = combatTermScope(overrides);
  return scope ? withTermScope(scope, fn) : fn();
}

/**
 * Traces buildCombatInputs for (charIdx, mapIdx) and returns
 * { terms: [{ key, name, fmt, group, saved, val, overridden, function, usedIn, descs, varies }],
 *   inputs: { name: value } } — terms sorted by group then name.
 * opts: { rawSave, overrides, inputOptions }.
 */
export function collectCombatTerms(saveData, charIdx, mapIdx, opts = {}) {
  const scope = { overrides: normalizeTermOverrides(opts.overrides), trace: [] };
  const built = withTermScope(scope, () =>
    buildCombatInputs(saveData, charIdx, mapIdx, Object.assign({ rawSave: opts.rawSave }, opts.inputOptions || {})));
  const terms = summarizeTermTrace(scope.trace);
  for (const t of terms) t.name = combatTermLabel(t.key, t.name);
  terms.sort((a, b) => String(a.group).localeCompare(String(b.group)) || String(a.name).localeCompare(String(b.name)));
  return { terms, inputs: built.values };
}
