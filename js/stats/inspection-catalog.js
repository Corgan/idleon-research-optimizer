import { allDescriptors, getSystem } from './registry.js';
import { label } from './entity-names.js';
import {
  TalentDescriptions, GuildBonuses, PostOffUpgradeInfo, ArcadeShopInfo,
  UpgradeVault, LegendTalents, GamingPalette, AlchemyDescription,
} from './data/game/customlists.js';
import { talentParams } from './data/common/talent.js';
import { STAMP_DATA } from './data/w1/stamp.js';
import { formulaInput, formulaConstant as c, formulaOperation as op } from './formula-tree.js';

const SYSTEM_NAMES = {
  talent: 'Talent', guild: 'Guild', stamp: 'Stamp', vault: 'Vault', arcade: 'Arcade',
  postOffice: 'Post Office', legendPTS: 'Legend', palette: 'Palette', alchemy: 'Bubble',
  achievement: 'Achievement', companion: 'Companion', card: 'Card', cardSingle: 'Card',
  cardSet: 'Card Set', starSign: 'Star Sign', sigil: 'Sigil', vial: 'Vial',
  shrine: 'Shrine', prayer: 'Prayer', chip: 'Chip', grid: 'Grid',
  grimoire: 'Grimoire', pristine: 'Pristine', minehead: 'Minehead', meritoc: 'Meritoc',
  etcBonus: 'EtcBonus', nametag: 'Item', trophy: 'Item', premhat: 'Item',
};
const ROYAL_TERMS = {
  'TotalStatz0*armory18': 'Resource grade bonus',
  'TotalStatz1*armory50': 'Total outpost upgrades bonus',
  'TotalStatz2*armory51': 'Purified outpost bonus',
  'charLevel*armory52': 'Royal character level bonus',
  'TotalStatz3*armory53': 'Currency balance bonus',
  base: 'Base collection', globalResourceRateMultiplier: 'Global Collection multiplier',
  outpostPurifyBonus: 'Purification multiplier', supportCollection: 'Support multiplier',
  mapLevel1: 'Logistics multiplier', 'commandRank*armory73': 'Command rank multiplier',
  'unitSpec0*totalUnits0': 'Worker multiplier', mapLevel0Cap: 'Expanded Barracks multiplier',
};

function _detailNode(name, detail) {
  const children = detail.breakdown ? [detail.breakdown] : detail.children || detail.components || detail.factors || [];
  const inputs = [];
  if (detail.savePath && detail.rawValue !== undefined) inputs.push(formulaInput('Saved value', detail.rawValue, detail.savePath));
  else if (detail.savePath && detail.level !== undefined) inputs.push(formulaInput('Purchased level', detail.level, detail.savePath));
  return {
    name: detail.label || ROYAL_TERMS[detail.name] || detail.name || name,
    val: detail.val ?? detail.value,
    formula: detail.formula,
    operation: detail.operation,
    formulaTerm: detail.formulaTerm,
    kind: detail.kind,
    source: detail.source,
    nonNumeric: detail.nonNumeric,
    notApplicable: detail.notApplicable,
    children: [...children.map(child => _detailNode('Component', child)), ...inputs],
    note: [detail.note, detail.savePath ? 'Input location: ' + detail.savePath : ''].filter(Boolean).join('\n'),
    partial: !!detail.partial,
    unavailable: detail.available === false || !!detail.unavailable,
    reason: detail.reason || (detail.missing?.length ? 'Missing: ' + detail.missing.join(', ') : ''),
  };
}

function _missing(name, key) {
  return { name, val: NaN, unavailable: true, reason: 'Missing saved ' + key + ' data.' };
}

export function statsInspectionCatalog() {
  const entries = new Map();
  function resolver(system, id, args, context = '') {
    const key = JSON.stringify([system, id, args || null]);
    if (entries.has(key)) return;
    const group = SYSTEM_NAMES[system] || system.replace(/([a-z])([A-Z])/g, '$1 $2');
    let name = SYSTEM_NAMES[system] ? label(SYSTEM_NAMES[system], id) : group + ' - ' + context;
    if (system === 'postOffice') {
      const [box, slot = 0] = Array.isArray(id) ? id : String(id).split(',').map(Number);
      const effect = PostOffUpgradeInfo[box]?.[4 + slot * 4];
      if (effect) name += ' - ' + String(effect).replace(/_/g, ' ');
    }
    if (args?.tab === 2) name += ' - second effect';
    if (args?.mode === 'max') name += ' - account best';
    entries.set(key, {
      key, group, name,
      note: system === 'alchemy'
        ? 'Base purchased bubble plus Prisma, before TalentCalc class/cache post-passes.'
        : context,
      resolve: ctx => {
        const provider = getSystem(system);
        if (!provider?.resolve) throw new Error('Missing stat resolver: ' + system);
        return provider.resolve(id, ctx, args);
      },
    });
  }
  for (const desc of allDescriptors()) {
    for (const sources of Object.values(desc.pools || {})) {
      for (const source of sources) resolver(source.system, source.id, source.args, desc.name);
    }
  }
  for (const id of Object.keys(TalentDescriptions).map(Number)) {
    for (const tab of [1, 2]) {
      const params = talentParams(id, tab);
      if (!params || !params.formula || params.formula === '_' || params.formula === 'txt') continue;
      resolver('talent', id, tab === 2 ? { tab: 2 } : undefined);
    }
  }
  for (const id of Object.keys(STAMP_DATA)) resolver('stamp', id);
  for (const [system, table] of [
    ['guild', GuildBonuses], ['arcade', ArcadeShopInfo], ['vault', UpgradeVault],
    ['legendPTS', LegendTalents], ['palette', GamingPalette],
  ]) {
    for (let id = 0; id < table.length; id++) {
      if (!table[id] || table[id][0] === '_' || table[id][0] === 'FILL') continue;
      resolver(system, id);
    }
  }
  for (let box = 0; box < PostOffUpgradeInfo.length; box++) {
    for (let slot = 0; slot < 3; slot++) {
      if (PostOffUpgradeInfo[box]?.[3 + slot * 4]) resolver('postOffice', [box, slot]);
    }
  }
  for (let cauldron = 0; cauldron < 4; cauldron++) {
    for (let id = 0; id < (AlchemyDescription[cauldron]?.length || 0); id++) {
      const row = AlchemyDescription[cauldron][id];
      if (row?.[3] && row[3] !== '_') resolver('alchemy', [cauldron, id]);
    }
  }
  function extra(key, group, name, resolve, note = '') {
    entries.set(key, { key, group, name, resolve, note });
  }
  for (const [key, name] of [
    ['jellyCellDamageBreakdown', 'Jelly Operator - Cell Damage multiplier'],
    ['jellyCellSpeedBreakdown', 'Jelly Operator - Cell Speed multiplier'],
    ['jellyCellExpBreakdown', 'Jelly Operator - Cell EXP multiplier'],
    ['jellyBloodcellBreakdown', 'Jelly Operator - Bloodcell multiplier'],
  ]) {
    extra(key, 'Jelly Operator', name, async ctx => {
      const J = await import('./systems/w7/jelly-operator.js');
      if (!J.hasJellyData(ctx.saveData)) return _missing(name, 'Jelly Operator');
      const fever = J.jellyProgress(ctx.saveData).fever;
      const detail = key === 'jellyCellDamageBreakdown'
        ? J[key](ctx.saveData, { fever }) : J[key](ctx.saveData, fever);
      return { ..._detailNode(name, detail), name };
    }, 'Saved Fever; COLD begins at zero elapsed seconds. No operation is simulated.');
  }
  extra('cookingMealSpeed', 'Cooking', 'Cooking - total kitchen meal speed /hr', async ctx => {
    const C = await import('./systems/w4/cooking-ladle.js');
    if (!ctx.saveData.cookingData?.length) return _missing('Kitchen speed', 'Cooking');
    return C.totalKitchenSpeedDetail(C.cookingSpeedModel(ctx.saveData, ctx.charIdx), C.mealLevels(ctx.saveData));
  }, 'All saved unlocked kitchens; selected character uses ladles. Saved Turkey stock, not an unsaved map-entry cache.');
  for (const [key, name, selectedMap] of [
    ['globalResourceRateBreakdown', 'Royal Guardian - global Collection multiplier', false],
    ['outpostResourceRateBreakdown', 'Royal Guardian - selected outpost Collection /hr', true],
    ['outpostRankExpBreakdown', 'Royal Guardian - selected outpost total Rank EXP /hr', true],
  ]) {
    extra(key, 'Royal Guardian', name, async ctx => {
      const R = await import('./systems/w7/royal-guardian.js');
      const detail = selectedMap
        ? R[key](ctx.saveData, ctx.mapIdx) : R[key](ctx.saveData);
      if (key === 'outpostRankExpBreakdown' && detail.available) {
        detail.factors = detail.factors.map((factor, bar) => {
          const local = R.outpostRankBarBreakdown(ctx.saveData, ctx.mapIdx, bar);
          const factors = [
            { name: 'Global base per contributor', val: local.globalBar.baseRate },
            { name: 'Education multiplier', val: local.educationMultiplier },
            { name: 'Glorified multiplier', val: local.glorifiedMultiplier },
            { name: 'Purified multiplier', val: local.purifiedMultiplier },
            { name: 'Intel multiplier', val: local.intelMultiplier },
            { name: 'Support multiplier', val: local.supportMultiplier },
            { name: 'Contributors', val: local.contributors },
          ];
          let direct = factors[0];
          for (const factor of factors.slice(1)) direct = op('Contributor rate', 'multiply', direct, factor);
          return {
            name: local.globalBar.name, value: factor.value,
            children: [op('Rank EXP per hour', 'add', direct, { name: 'Militia feed', val: local.militiaFeed })],
          };
        });
      }
      const adapted = _detailNode(name, detail);
      let total = c(key === 'outpostRankExpBreakdown' ? 0 : 1,
        key === 'outpostRankExpBreakdown' ? 'Initial sum' : 'Initial product');
      for (const factor of adapted.children) total = op(name,
        key === 'outpostRankExpBreakdown' ? 'add' : 'multiply', total, factor);
      return { ...adapted, name, children: detail.available ? [total] : adapted.children };
    }, selectedMap ? 'Uses the Calculation Context map; requires a built outpost there.' : 'Account-wide factors only.');
  }
  extra('royalRange', 'Royal Guardian', 'Royal Guardian - selected outpost Range', async ctx => {
    const R = await import('./systems/w7/royal-guardian.js');
    if (!R.hasCompleteRoyalData(ctx.saveData)) return _missing('Outpost Range', 'Royal Guardian');
    const d = R.outpostRangeBreakdown(ctx.saveData, ctx.mapIdx);
    if (!d.available) return _missing('Outpost Range', 'built outpost at the selected map');
    const lv = formulaInput('Logistics level', d.logistics.level, d.logistics.savePath);
    const terms = [c(d.global.base, 'Base range'), { name: 'Orblet range bonus', val: d.global.orblet.bonus },
      op('Guard range', 'multiply', { name: 'Total Guards', val: d.guards }, { name: 'Range per Guard', val: d.perGuard }),
      op('Military range', 'multiply', { name: 'Military rank', val: d.militaryRank }, { name: 'Range per Military rank', val: d.militaryPerRank }),
      op('Logistics range', 'divide', op('Logistics numerator', 'multiply', c(d.logistics.numerator), lv),
        op('Logistics denominator', 'add', lv, c(d.logistics.denominatorOffset)))];
    let sum = terms[0];
    for (const term of terms.slice(1)) sum = op('Range subtotal', 'add', sum, term);
    const derived = R.royalGuardianDerivedInputs(ctx.saveData);
    return {
      ...op('Outpost Range', 'floor', op('Capped range', 'min', c(d.global.cap), sum)),
      partial: !derived.available,
      reason: derived.missing?.length ? 'Missing: ' + derived.missing.join(', ') : '',
    };
  }, 'Calculation Context map; native range before resource (+15) and Support (+8) allowances.');
  return [...entries.values()].sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}
