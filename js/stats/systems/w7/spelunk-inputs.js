// ===== SPELUNKING EXPEDITION INPUTS (W7) =====
import { createStatContext } from '../../stat-context.js';
import { getCatalog } from '../../registry.js';
import { optionsListData, numCharacters, charClassData } from '../../../save/data.js';
import { shopUpgBonus, chapterBonus, computeLoreEpisodeBonus, computeDancingCoralBonus,
  legendPTSbonus } from './spelunking.js';
import { spelunkCaves, spelunkTools, spelunkElixirs, spelunkUpgPerLevel } from '../../data/w7/spelunking.js';
import { computeCropSC, computeExoticBonus } from '../w6/farming.js';
import { computeMealBonus } from '../common/stats.js';
import { cardLv } from '../common/cards.js';
import { computeLampBonus } from '../w5/hole.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { computeVialByKey, finalBubbleValByKey } from '../w2/alchemy.js';
import { arcadeBonus } from '../w2/arcade.js';
import { rogBonusQTY } from './sushi.js';
import { computeRiftSkillBonus } from '../w4/rift.js';
import { computeMeritocBonusz } from './meritoc.js';
import { outpostROGBonus } from './royal-guardian.js';
import { menagerieUnlockOwned } from './menagerie.js';
import { maxTalentBonusDetail } from '../common/talent.js';
import { upgBonus as coveBonus } from '../w5/cglunko.js';
import { jellyRewardBonus } from '../../data/w7/jelly-operator.js';
import { zenithMarketPerLevel } from '../../data/w5/sailing.js';
import { superBitType } from '../../../game-helpers.js';

function _finite(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} is unavailable or invalid.`);
  return n;
}
function _value(result) { return typeof result === 'number' ? result : result?.val ?? result?.value; }
function _plain(tree) {
  const out = {};
  for (const key of ['name', 'val', 'fmt', 'note', 'partial', 'reason', 'unavailable'])
    if (tree[key] != null) out[key] = tree[key];
  if (tree.children) out.children = tree.children.map(_plain);
  return out;
}

export function buildSpelunkInputs(S, charIdx = 0) {
  if (!Array.isArray(S.spelunkData?.[3]) || !Array.isArray(S.spelunkData?.[5]))
    throw new Error('This save has no Spelunking stamina or shop data.');
  if (Number(optionsListData[478]) < 15 || !Number.isFinite(Number(optionsListData[478])))
    throw new Error('Complete the Spelunking tutorial before simulating expeditions.');
  if (!Number.isInteger(charIdx) || charIdx < 0 || charIdx >= numCharacters)
    throw new Error('Choose an existing logged-in character.');
  const ctx = createStatContext({ saveData: S, charIdx });
  const pow = ctx.resolve('spelunking-pow');
  const shop = Array.from({ length: 80 }, (_, i) => _finite(shopUpgBonus(i, S), `Shop ${i}`));
  const ch = (a, b) => chapterBonus(a, b, S);
  const sushi = i => rogBonusQTY(i, S.cachedUniqueSushi || 0);
  const resolve = (system, id) => _finite(getCatalog()[system].resolve(id, ctx).val, `${system} bonus`);
  const characters = Array.from({ length: numCharacters }, (_, id) => {
    const tree = createStatContext({ saveData: S, charIdx: id }).resolve('spelunking-max-stamina');
    const max = _finite(tree.val, 'Maximum stamina');
    const raw = S.spelunkData[3][id];
    if (raw == null || raw === '') throw new Error(`Saved stamina is missing for character ${id + 1}.`);
    const stamina = Math.min(max, Math.max(0, _finite(raw, 'Saved stamina')));
    return { id, name: S.charNames?.[id] || `Character ${id + 1}`, max, stamina,
      classId: charClassData[id], level: S.lv0AllData?.[id]?.[0], breakdown: _plain(tree) };
  });
  const amber = (1 + 14 * shop[67]) * (1 + arcadeBonus(55, S) / 100) * (1 + sushi(28) / 100)
    * (1 + (computeCropSC(8, S) + (computeLampBonus(3, 0, S)
      + computeStampBonusOfTypeX('spelunkamb', S) + computeVialByKey('7amber', S, charIdx)
      + computeMealBonus('SplkAmb', S, charIdx))) / 100)
    * (1 + computeDancingCoralBonus(2, S) / 100)
    * (1 + (Math.min(5 * cardLv('w7a7', S), 40) + Math.min(10 * cardLv('w7a7', S), 100)) / 100)
    * (1 + resolve('winBonus', 28) / 100)
    * (1 + (spelunkUpgPerLevel(7) * Math.max(0, Number(S.spelunkData[5][7]) || 0)
      + (shop[20] + (shop[41] + shop[51]))) / 100)
    * (1 + shop[6] * (30 + shop[6]) * (Number(S.spelunkData[4]?.[1]) || 0) / 100)
    * (1 + 50 * computeRiftSkillBonus(18, 6, S) / 100)
    * (1 + shop[44] / 100) * (1 + shop[8] / 100) * (1 + shop[60] / 100)
    * (1 + computeLoreEpisodeBonus(4, S) / 100)
    * Math.max(1, ch(1, 3)) * Math.max(1, ch(5, 1)) * Math.max(1, ch(4, 1))
    * (1 + computeExoticBonus(43, S) / 100) * (1 + shop[9] / 100) * (1 + shop[10] / 100);
  const regen = 5 * (1 + computeMeritocBonusz(17, S, charIdx) / 100)
    * (1 + legendPTSbonus(30, S) / 100) * Math.max(1, outpostROGBonus(S, 2))
    * (1 + sushi(11) / 100)
    * (1 + (shop[5] + _value(finalBubbleValByKey('Y11', charIdx, S))
      + (ch(2, 1) + ch(5, 2) + (10 * computeRiftSkillBonus(18, 5, S)
      + Math.min(2 * cardLv('w7a10', S), 20)))) / 100);
  const grand = 4e-5 * (1 + shop[43] / 100)
    * (1 + Math.floor(zenithMarketPerLevel(6) * (Number(S.spelunkData[45]?.[6]) || 0)) / 100)
    * (1 + ch(4, 0) / 100) * (1 + jellyRewardBonus(S, 31) / 100)
    * (1 + (Number(S.lv0AllData?.[charIdx]?.[19]) || 0)
      * (resolve('minehead', 14) + sushi(21)) / 100)
    * (1 + coveBonus(S, 20) / 100)
    * Math.max(1, _value(maxTalentBonusDetail(238, charIdx, S, { mode: 1 })))
    * (1 + shop[55] / 100) * Math.max(1, ch(6, 1));
  let unlocked = 1;
  for (let i = 0; i < 9; i++) if (Number(S.spelunkData[0]?.[i]) >= 1) unlocked = i + 2;
  const tools = spelunkTools().filter(t => t.id === 0 || shop[13 + t.id] >= 1);
  const notes = [
    'Native 10 ms callback and animated targeting model, with a seeded local RNG stream. Unsaved global RNG and callback phases prevent reproducing a particular live-client run.',
    'Account bonuses stay fixed during a run. New discoveries, boss unlocks and records are reported, not fed back into cached account stats.',
    'No AFK skill EXP, purchase sequencing or daily-haul claims are included.',
  ];
  const partial = pow.partial || characters.some(c => c.breakdown.partial) || S.companionDataAvailable === false;
  if (partial) notes.push('Some account multipliers are partial. Inspect Power and maximum-stamina breakdowns for missing metadata.');
  const input = {
    version: 2, charIdx, partial: Boolean(partial), pow: _finite(pow.val, 'Spelunking Power'), powTree: _plain(pow),
    amber: _finite(amber, 'Amber multiplier'), regen: _finite(regen, 'Stamina regeneration'),
    grand: _finite(grand, 'Grand Discovery chance'), shop, characters,
    caves: spelunkCaves().slice(0, unlocked), tools, elixirs: spelunkElixirs(),
    elixirOwned: Math.round(Math.min(12, shop[23])), slots: Math.round(Math.min(5, 1 + shop[24])),
    dupes: Math.round(Math.min(5, shop[25])), nonconsume: Math.min(.6, (shop[26] + ch(3, 2)) / 100),
    holesBonus: _finite(_value(finalBubbleValByKey('M11', charIdx, S)), 'Extra exits'),
    auto: (shop[12] === 1 || Number(S.gemItemsData?.[43]) >= 1),
    speedMax: Math.max(0, Math.floor(Number(S.gemItemsData?.[43]) || 0)),
    overuse: superBitType(36, S.gamingData?.[12]) === 1, manic: shop[53] >= 1,
    switchNova: Number(S.spelunkData[5][38]) >= 1,
    shortcut: menagerieUnlockOwned(S, 1), depths: (S.spelunkData[1] || []).map(Number),
    manicDepths: (S.spelunkData[47] || []).map(Number), bosses: (S.spelunkData[0] || []).map(Number),
    grands: (S.spelunkData[44] || []).map(Number), discoveries: [...(S.spelunkData[6] || [])],
    memorySlots: Math.round(shop[57]),
    memorized: (S.spelunkData[48] || []).slice(0, Math.round(shop[57])).map(Number),
    savedElixirs: (S.spelunkData[7] || []).slice(0, 5).map(Number),
    savedManic: Number(S.spelunkData[4]?.[10]) === 1,
    fullClear: Number(optionsListData[538]) === 1,
    prisma: Number(S.spelunkData[4]?.[4]) || 0, exalt: Number(S.spelunkData[4]?.[3]) || 0,
    bags: Math.max(0, Number(S.gemItemsData?.[44]) || 0), notes,
  };
  return input;
}
