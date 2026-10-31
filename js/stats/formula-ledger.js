export const FORMULA_CATEGORIES = [
  'Character stats', 'Combat', 'Rewards & loot', 'Skills',
  'World systems', 'Account bonuses', 'Costs & progression',
];

const branch = (block, value) => ({ block, parameter: 0, value });
const family = block => ({ block });
const DESCRIPTOR_ANCHORS = {
  'drop-rate': branch('TotalStats', 'Drop_Rarity'),
  'total-str': branch('TotalStats', 'STR'), 'total-agi': branch('TotalStats', 'AGI'),
  'total-wis': branch('TotalStats', 'WIS'), 'total-luk': branch('TotalStats', 'LUK'),
  accuracy: branch('TotalStats', 'Accuracy'), defence: branch('TotalStats', 'Defence'),
  'max-hp': family('PlayerHPmax'), 'max-mp': family('PlayerMPmax'),
  'skill-efficiency': family('SkillStats'), 'skill-exp': family('SkillStats'),
  'skill-afk': family('AFKgainrates'), 'fighting-afk': family('AFKgainrates'),
  'spelunking-pow': branch('Spelunk', 'POW'), 'spelunking-max-stamina': branch('Spelunk', 'StaminaMax'),
};
const RESOLVER_ANCHORS = {
  talent: family('GetTalentNumber'), stamp: family('StampBonusOfTypeX'),
  guild: family('GuildBonuses'), arcade: family('ArcadeBonus'), postOffice: family('PostOfficeINFO'),
  vault: branch('Summoning', 'VaultUpgBonus'), palette: branch('GamingStatType', 'PaletteBonus'),
  legendPTS: branch('Thingies', 'LegendPTS_bonus'),
};
const PRIORITIES = [
  { ...branch('Sailing', 'ArtifactChance'), label: 'Sailing - artifact find chance', category: 'Rewards & loot',
    tags: ['W5', 'chance', 'per-chest', 'sequential RNG', 'runtime'],
    implementation: 'js/stats/systems/w5/sailing-chests.js', exportName: 'islandArtifactOdds',
    note: 'Related save-backed per-island odds exist. Native stored-chest display and sequential first-success award modes still need separate inspector adapters and input tracing.' },
  { ...branch('Spelunk', 'SpelunkingMultiOre'), label: 'Spelunking - extra pages per action', category: 'Skills',
    tags: ['W7', 'page gathering', 'per-action', 'chance'],
    note: 'Multi-page bonus is not the final pages/action outcome. Trace it with OreValue, action cadence and active/AFK reward processors.' },
  { ...branch('Spelunk', 'SpelunkingOreValue'), label: 'Spelunking - base page value per action', category: 'Skills',
    tags: ['W7', 'page gathering', 'per-action'] },
  { ...branch('Spelunk', 'SpelunkingSpeed'), label: 'Spelunking - page gathering speed', category: 'Skills',
    tags: ['W7', 'page gathering', 'interval'] },
  { ...branch('Spelunk', 'PageReadingLVgains'), label: 'Spelunking - levels gained per page read', category: 'Skills',
    tags: ['W7', 'page reading', 'per-action', 'RNG'] },
  { ...branch('Spelunk', 'MaxDailyPageReads'), label: 'Spelunking - daily page reading limit', category: 'Costs & progression',
    tags: ['W7', 'page reading', 'daily', 'cap'] },
  { ...branch('Spelunk', 'AmberGain'), label: 'Spelunking - Amber gain', category: 'Rewards & loot',
    tags: ['W7', 'expeditions', 'Amber', 'runtime'] },
];

function matches(record, anchor) {
  return record.block === anchor.block && (Object.hasOwn(anchor, 'value')
    ? record.selector?.parameter === anchor.parameter && record.selector.value === anchor.value
    : record.kind === 'custom-block');
}

export function formulaSourceReview(record, inventory, review) {
  if (!review) return { classification: 'unreviewed', verified: false, state: 'Not source-audited' };
  if (review.sourceHash !== inventory.source.hash || review.recordHash !== record.source.hash) {
    return { classification: 'unreviewed', verified: false, state: 'Stale source review' };
  }
  if (!['formula', 'runtime', 'excluded'].includes(review.classification) || !review.evidence?.trim()
    || !FORMULA_CATEGORIES.includes(review.category)) throw new Error('Incomplete source review for ' + record.id);
  return { classification: review.classification, verified: review.verified === true,
    state: review.verified === true ? 'Source-audited' : 'Classified, not verified',
    evidence: review.evidence, category: review.category, tags: review.tags || [] };
}

export function formulaInspectionOutputs(descriptors, catalog) {
  return [
    ...descriptors.map(descriptor => ({
      key: 'descriptor:' + descriptor.id, name: descriptor.name, group: 'Stat summaries', descriptor,
      category: descriptor.id.startsWith('skill-') ? 'Skills'
        : descriptor.category === 'combat' ? 'Combat'
        : descriptor.category === 'stat' ? 'Character stats'
          : descriptor.category === 'capacity' || descriptor.category === 'progression' ? 'Costs & progression'
            : 'World systems',
      anchor: DESCRIPTOR_ANCHORS[descriptor.id],
    })),
    ...catalog.map(entry => {
      const resolver = entry.key.startsWith('[') ? JSON.parse(entry.key)[0] : null;
      return { ...entry, category: ['Cooking', 'Jelly Operator', 'Royal Guardian'].includes(entry.group)
        ? 'World systems' : 'Account bonuses', anchor: RESOLVER_ANCHORS[resolver] };
    }),
  ];
}

export function reconcileFormulaInventory(inventory, outputs, reviews = []) {
  if (inventory.schema !== 1 || !Array.isArray(inventory.records) || !inventory.source?.hash) {
    throw new Error('Unsupported or invalid formula inventory.');
  }
  const reviewById = new Map(reviews.map(review => [review.id, review]));
  const linkedOutputs = outputs.map(output => ({ ...output, nativeIds: [] }));
  const native = inventory.records.map(record => {
    const priority = PRIORITIES.find(anchor => matches(record, anchor));
    const links = linkedOutputs.filter(output => output.anchor && matches(record, output.anchor));
    for (const output of links) output.nativeIds.push(record.id);
    const review = formulaSourceReview(record, inventory, reviewById.get(record.id));
    return {
      ...record, name: priority?.label || record.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '),
      category: review.category || priority?.category || record.suggestedCategory,
      tags: review.tags || priority?.tags || [], note: priority?.note || '',
      implementation: priority?.implementation, exportName: priority?.exportName,
      review, links,
    };
  });
  return {
    native, outputs: linkedOutputs,
    counts: { candidates: native.length, containers: inventory.counts.containers, branches: inventory.counts.branches,
      linkedCandidates: native.filter(record => record.links.length || record.implementation).length,
      inspectedOutputs: outputs.length, linkedOutputs: linkedOutputs.filter(output => output.nativeIds.length).length,
      verified: native.filter(record => record.review.verified).length,
      classified: native.filter(record => record.review.classification !== 'unreviewed').length },
  };
}
