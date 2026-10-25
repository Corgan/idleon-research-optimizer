import * as CS from '../stats/systems/common/combat-sim-setup.js';
import * as D from '../stats/data/game/customlists.js';
import { ITEMS } from '../stats/data/game/items.js';
import { ARMORY_UPGRADES, ROYAL_STATUES } from '../stats/data/w7/royal-guardian.js';
import { talentDescription } from './combat-sim-visual.js';
import { formatUq, statLabel } from '../stats/systems/common/combat-sim-stones.js';
import { chipDescription } from '../stats/data/w4/chips.js?v=20261023-chips';

function text(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(text).filter(Boolean).join(' ');
  if (typeof value !== 'string' || Number.isFinite(Number(value)) || /^(Blank|Filler|_)$/i.test(value)) return '';
  return value.replace(/[|_@]/g, ' ').replace(/[{}]/g, '#').replace(/\s+/g, ' ').trim();
}

const TABLE_DATA = {
  postOffice: D.PostOffUpgradeInfo, statueTiers: D.StatueInfo, bribes: D.BribeDescriptions,
  sigils: D.SigilDesc, arcade: D.ArcadeShopInfo, prayerLevels: D.PrayerInfo,
  tower: D.TowerInfo, shrineLevels: D.ShrineInfo, shrineMaps: D.ShrineInfo,
  saltLick: D.SaltLicks, atoms: D.AtomInfo, meals: D.MealINFO,
  artifacts: D.ArtifactInfo, divinityBless: D.GodsInfo, summonUpg: D.SummonUPG,
  exotics: D.MarketExoticInfo, researchGrid: D.ResGridSquares,
  researchShapes: D.ResGridSquares, spelunkShop: D.SpelunkUpg,
  legend: D.LegendTalents, royalStatues: ROYAL_STATUES, armory: ARMORY_UPGRADES,
  achievements: D.RegAchieves, guild: D.GuildBonuses, vault: D.UpgradeVault,
  grimoire: D.GrimoireUpg, arcane: D.ArcaneUpg,
};

export function combatEditorOptionText(kind, key, table) {
  if (kind === 'item') {
    const d = ITEMS[key] || {};
    const effects = [1, 2].map(i => d['UQ' + i + 'txt'] ? formatUq(d['UQ' + i + 'txt'], Number(d['UQ' + i + 'val']) || 0) : '');
    const stats = Object.keys(d).filter(k => Number(d[k]) && ['STR', 'AGI', 'WIS', 'LUK', 'Weapon_Power', 'Defence', 'Speed', 'Reach'].includes(k)).map(statLabel);
    return text([d.displayName, d.Type, d.Class, effects, stats, ...Object.keys(d).filter(k => k.startsWith('desc_line')).map(k => d[k])]);
  }
  if (kind === 'talent') return talentDescription(Number(key), 1).text;
  if (kind === 'chip') {
    const chip = chipDescription(key);
    return chip ? [chip.name, chip.description, chip.summary].join(' ') : '';
  }
  const lists = { sign: D.StarSigns, prayer: D.PrayerInfo, god: D.GodsInfo, companion: D.CompanionDB };
  if (lists[kind]) return text(lists[kind][key]);
  if (kind === 'bubble') return text(D.AlchemyDescription['abcd'.indexOf(String(key)[0])]?.[Number(String(key).slice(1))]);
  if (kind !== 'table') return '';
  if (/^bubbles[0-3]$/.test(table)) return text(D.AlchemyDescription[Number(table.slice(-1))]?.[key]);
  if (/^stamps[ABC]$/.test(table)) return combatEditorOptionText('item', 'Stamp' + table.slice(-1) + (Number(key) + 1));
  if (table === 'dream') return text(D.DreamUpg[Number(key) === 10 ? 8 : key]);
  if (table === 'vials') return text(D.AlchemyDescription[4]?.[key]);
  if (table === 'labJewels') return text(D.JewelDesc?.[key]);
  if (table === 'stickers') return text(D.Research?.[23]?.[key]);
  if (table === 'gemShop') return text((D.MTXinfo || []).filter(r => Number(r[4]) === Number(key)));
  return text(TABLE_DATA[table]?.[key]);
}

export function filterCombatEditorSearch(entries, query) {
  const words = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return entries.filter(e => words.every(w => (e.name + ' ' + e.group + ' ' + e.effect).toLowerCase().includes(w)));
}

export function buildCombatEditorSearch(raw, ci) {
  const out = [], seen = new Set();
  function add(group, name, kind, key, target, extra = '') {
    const id = kind + ':' + (target.table || '') + ':' + key;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ group, name: text(name), kind, key, target, effect: [combatEditorOptionText(kind, key, target.table), text(extra)].filter(Boolean).join(' ') });
  }
  for (const row of [0, 1]) for (let slot = 0; slot < (row === 0 ? 16 : 7); slot++) {
    for (const o of CS.itemOptionsForSlot(row, slot)) add(row === 0 ? 'Equipment' : 'Tools', o.name, 'item', o.key, { tab: 'gear', pick: 'gear', row, slot });
  }
  for (const o of CS.itemOptionsForSlot(2, 0)) add('Food', o.name, 'item', o.key, { tab: 'food', pick: 'food' });
  for (const o of CS.itemOptionsForSlot('obol', 0)) add('Obols', o.name, 'item', o.key, { tab: 'obols', pick: 'obol' });
  for (const o of CS.talentOptions()) add('Talents', o.name, 'talent', o.id, { tab: 'talents' });
  for (const o of CS.cardOptions()) add('Cards', o.name, 'card', o.key, { tab: 'cards', pick: 'card' }, o.bonus);
  for (const o of CS.cardSetOptions()) add('Card sets', o.name, 'cardSet', o.set, { tab: 'cards', pick: 'cardSet' });
  for (const [kind, group, tab, options] of [
    ['sign', 'Star signs', 'signs', CS.starSignOptions()],
    ['prayer', 'Prayers', 'signs', CS.prayerOptions()],
    ['bubble', 'Equipped bubbles', 'bubbles', CS.bubbleOptions()],
    ['chip', 'Lab chips', 'lab', CS.chipOptions()],
    ['god', 'Divinity', 'divinity', CS.godOptions()],
    ['companion', 'Companions', 'acct', CS.companionOptions()],
  ]) for (const o of options) {
    const key = o.code ?? o.id;
    if (key === '_' || key === -1) continue;
    add(group, o.name, kind, key, { tab, pick: kind === 'companion' ? null : kind, system: kind === 'companion' ? 'companions' : null });
  }
  for (const t of CS.LEVEL_TABLES) for (const r of CS.readTable(raw, t.id, ci)) {
    if (t.id === 'researchShapes') continue;
    add(t.world + ' / ' + t.group, r.name, 'table', r.index, {
      tab: t.world === 'Character' ? 'character' : 'acct', system: 'g:' + t.group, world: t.world, table: t.id,
    });
  }
  return out;
}
