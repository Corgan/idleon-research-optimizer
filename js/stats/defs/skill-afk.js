// ===== SKILL AFK GAINS DESCRIPTOR =====
// AFKgainrates("Mining"/"Choppin"/"Catching"/etc) formula.
// Returns skill AFK rate as a decimal.
// Scope: character (skill determined by current activity).

import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import { companion } from '../systems/common/companions.js';
import { vault } from '../systems/common/vault.js';
import { sigil } from '../systems/w2/alchemy.js';
import { getBribeBonus } from '../systems/w3/bribe.js';
import { getSetBonus } from '../systems/w3/setBonus.js';
import { cardLv, countDiscoveredCards } from '../systems/common/cards.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { guild } from '../systems/common/guild.js';
import { computeFamBonusQTYs, computeBoxReward } from '../systems/common/stats.js';
import { computeCardSetBonus } from '../systems/common/cards.js';
import { computeChipBonus } from '../systems/w4/lab.js';
import { computeTrapMGBonus } from '../systems/w3/trapping.js';
import { bubbleValByKey, computeVialByKey } from '../systems/w2/alchemy.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { eventShopOwned } from '../../game-helpers.js';
import { label } from '../entity-names.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { talent } from '../systems/common/talent.js';
import { arcade } from '../systems/w2/arcade.js';
import { winBonus } from '../systems/w6/summoning.js';
import { computeCardBonusByType } from '../systems/common/stats.js';
import { computeCompassBonus } from '../systems/w7/compass.js';
import { computeFlurboShop } from '../systems/w2/dungeon.js';
import { computeDivinityMinor, computeDivinityMajor } from '../systems/w5/divinity.js';
import { shrine } from '../systems/w3/construction.js';
import { computeRooBonus } from '../systems/w7/sushi.js';
import { computeBigFishBonus } from '../systems/w7/spelunking.js';
import { computeArcaneMapMultiBon } from '../systems/mc/tesseract.js';
import { safe, rval, createDescriptor } from './helpers.js';
import { computePrayerReal } from '../systems/w3/prayer.js';
import { computeRiftSkillBonus } from '../systems/w4/rift.js';
import { resolverTerm, sourceTerm, sumTerms } from './skill-helpers.js';

function _num(value) {
  if (value && typeof value === 'object' && value.val != null) return Number(value.val) || 0;
  return Number(value) || 0;
}

function _votingBonus(voteIdx, ctx) {
  var votingMulti = 1;
  try { votingMulti = Number(ctx.resolve('voting-multi').val) || 1; } catch(e) {}
  return votingBonusz(voteIdx, votingMulti, ctx.saveData);
}

// Per-skill source table: { baseRate, boxKey, talentIds, cardType, starSignKey, bribeKey, bubbleKey }
var SKILL_SOURCES = {
  Mining:   { base: 0.5, boxKey: 'MinAFK',  talents: [89, 621],  cardType: 33, riftSkill: 0, starSign: 'SkillAFK', bribe: '24', bubble: 'MinFshAFK', trapMG: 8 },
  Choppin:  { base: 0.5, boxKey: 'ChopAFK', talents: [449, 621], cardType: 36, riftSkill: 2, starSign: 'SkillAFK', bribe: '24', bubble: 'ChoppinAFK', trapMG: 8 },
  Fishing:  { base: 0.5, boxKey: 'FishAFK', talents: [89, 118, 621], cardType: 39, riftSkill: 3, starSign: 'SkillAFK', bribe: '24', bubble: 'MinFshAFK', etcId: '64', trapMG: 8 },
  Catching: { base: 0.5, boxKey: 'CatchAFK', talents: [298, 621], cardType: 41, riftSkill: 5, starSign: 'SkillAFK', bribe: '24', bubble: 'CatchinAFK', etcId: '97', trapMG: 8 },
  Cooking:  { base: 0.5, talents: [89, 621, 147], starSign: 'SkillAFK', bribe: '24', trapMG: 8 },
  Laboratory: { base: 0.5, talents: [621], starSign: 'SkillAFK', bribe: '24', trapMG: 8 },
};

export default createDescriptor({
  id: 'skill-afk',
  name: 'Skill AFK Rate',
  scope: 'character+map+skill',
  category: 'rate',
  applies: function(ctx) {
    var skillType = ctx.skillType || 'Mining';
    return skillType === 'Smithing' || skillType === 'Breeding'
      ? { applicable: false, reason: skillType + ' has no AFK gain-rate panel branch.' }
      : true;
  },

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 0.01, children: null };
    var ci = ctx.charIdx || 0;
    var skillType = ctx.skillType || 'Mining';

    // === AFKgainzzALL (shared between fighting and skill) ===
    // Tasks[2][1][2] check
    var tasks2_1_2 = Number(s.tasksGlobalData && s.tasksGlobalData[2] && s.tasksGlobalData[2][1] &&
      s.tasksGlobalData[2][1][2]) || 0;

    // Skill-only sources (not for fighting)
    var familyBonuses = safe(computeFamBonusQTYs, ci, s);
    var famBonus50 = familyBonuses && typeof familyBonuses === 'object' ? Number(familyBonuses[50]) || 0 : 0;
    var _cb46 = safe(computeCardBonusByType, 46, ci, s);
    var skillOnlyTerms = [
      sourceTerm('Family Bonus 50', famBonus50),
      sourceTerm('Card Bonus: Skill AFK (+2 base)', null, {
        val: 2 + ((typeof _cb46 === 'object' && _cb46) ? (_cb46.val || 0) : Number(_cb46) || 0),
        children: _cb46 && _cb46.children || null,
      }),
      resolverTerm(guild, 7, ctx),
      sourceTerm('Card Set: Skill AFK', safe(computeCardSetBonus, ci, '7')),
      resolverTerm(talent, 79, ctx),
      resolverTerm(sigil, 16, ctx),
      sourceTerm('Lab Chip: Skill AFK', safe(computeChipBonus, 'safk', ci)),
      resolverTerm(etcBonus, '24', ctx),
      resolverTerm(etcBonus, '59', ctx),
      sourceTerm(label('Prayer', 4), computePrayerReal(4, 0, ci, ctx.saveData)),
      sourceTerm(label('Prayer', 12) + ' curse', null, { val: -_num(computePrayerReal(12, 1, ci, ctx.saveData)) }),
    ];

    // Shared ALL-AFK sources
    var _gfAFK = 0;
    try {
      var gf = goldFoodBonuses('AllAFK', ci, undefined, ctx.saveData);
      _gfAFK = (gf && typeof gf === 'object') ? (Number(gf.total) || 0) : (Number(gf) || 0);
    } catch(e) {}
    var discoveredCards = countDiscoveredCards(ctx.saveData);
    var talent650 = rval(talent, 650, ctx);
    var sharedTerms = [
      resolverTerm(arcade, 6, ctx),
      resolverTerm(companion, 6, ctx),
      resolverTerm(companion, 25, ctx),
      resolverTerm(winBonus, 11, ctx, undefined, 'Summoning Win Bonus: AFK Gains'),
      sourceTerm('Golden Food: AFK Gains', _gfAFK),
      sourceTerm('Event Shop 5', 20 * eventShopOwned(5, s.cachedEventShopStr)),
      resolverTerm(vault, 23, ctx),
      sourceTerm(label('Compass', 57), safe(computeCompassBonus, 57, s)),
      sourceTerm('Void Set', safe(getSetBonus, 'VOID_SET', ci)),
      sourceTerm('Flurbo Shop 7', safe(computeFlurboShop, 7, s)),
      sourceTerm('30 × Divinity Major 0', 30 * safe(computeDivinityMajor, ci, 0, s)),
      sourceTerm('Divinity Minor 5', safe(computeDivinityMinor, -1, 5, s, ci)),
      resolverTerm(shrine, 8, ctx),
      sourceTerm(label('Talent', 650) + ' × ' + discoveredCards + ' cards', talent650 * discoveredCards),
      sourceTerm('1.5 × ' + label('Card', 'w6d3') + ' level', 1.5 * safe(cardLv, 'w6d3', s)),
      sourceTerm('Roo Bonus 5', safe(computeRooBonus, 5, s)),
      sourceTerm('Vote: AFK Gains', _votingBonus(6, ctx)),
    ];

    var afkAllChildren = [];
    var afkAll = 0;
    if (tasks2_1_2 > ci) {
      afkAll += 2;
      afkAllChildren.push(sourceTerm('W3 Task: AFK Gains', 2));
    }
    var skillOnlySum = sumTerms(skillOnlyTerms);
    afkAll += skillOnlySum;
    afkAllChildren.push({ name: 'Skilling AFK sources', val: skillOnlySum, fmt: '%', children: skillOnlyTerms });
    var sharedSum = sumTerms(sharedTerms);
    afkAll += sharedSum;
    afkAllChildren.push({ name: 'All AFK sources', val: sharedSum, fmt: '%', children: sharedTerms });
    if (s.bundlesData && s.bundlesData.bun_u === 1) {
      afkAll += 30;
      afkAllChildren.push(sourceTerm('Bundle bun_u', 30));
    }

    // === AFKgainzzALLmulti ===
    var etc92Term = resolverTerm(etcBonus, '92', ctx);
    var etc92 = etc92Term.val;
    var arcaneMapMulti2 = safe(computeArcaneMapMultiBon, 2, ctx);
    var afkAllMulti = (1 + arcaneMapMulti2 / 100) * (1 + etc92 / 100);
    var afkAllMultiNode = { name: 'ALL AFK multiplier', val: afkAllMulti, fmt: 'x', children: [
      { name: 'Arcane Map Multi 2', val: 1 + arcaneMapMulti2 / 100, fmt: 'x', note: '+' + arcaneMapMulti2 + '%' },
      Object.assign({}, etc92Term, { val: 1 + etc92 / 100, fmt: 'x', note: '+' + etc92 + '%' }),
    ] };

    if (skillType === 'Divinity') return {
      val: 1,
      children: [{ name: 'AFKgainrates("Divinity") source value', val: 1, fmt: 'x' }],
      partial: false,
      reason: '',
    };

    // === Per-skill sources ===
    var sk = SKILL_SOURCES[skillType];
    if (skillType === 'Spelunking') {
      var bigFish2 = safe(computeBigFishBonus, 2, s);
      var companion28 = rval(companion, 28, ctx);
      var passiveSpelunkCards = computeRiftSkillBonus(18, 2, s) > 0;
      var card99Result = safe(computeCardBonusByType, 99, ci, s, { passive: passiveSpelunkCards });
      var card99 = card99Result && typeof card99Result === 'object'
        ? Number(card99Result.val) || 0 : Number(card99Result) || 0;
      var vial7afkResult = safe(computeVialByKey, '7skillw7afk', s, ci);
      var vial7afk = vial7afkResult && typeof vial7afkResult === 'object'
        ? Number(vial7afkResult.val) || 0 : Number(vial7afkResult) || 0;
      var spelunkDedicated = bigFish2 + companion28 + card99 + vial7afk;
      var spelunkAllPct = 0;
      var spelunkShared = rval(talent, 621, ctx) + afkAll
        + safe(computeTrapMGBonus, 8, s)
        + safe(computeStarSignBonus, 'SkillAFK', ci, s)
        + safe(getBribeBonus, '24', s);
      var spelunkValue = (0.5 + spelunkDedicated / 100
        + spelunkAllPct / 100 * (spelunkShared / 100)) * afkAllMulti;
      spelunkValue = Math.max(0.01, spelunkValue);
      var spelunkMissing = [];
      if (s.companionDataAvailable === false) spelunkMissing.push('companion ownership');
      return {
        val: spelunkValue,
        children: [
          { name: 'Base', val: 0.5, fmt: 'raw' },
          { name: 'Spelunking AFK Sources', val: spelunkDedicated, fmt: 'raw', children: [
            { name: 'Big Fish Bonus', val: bigFish2, fmt: 'raw' },
            { name: label('Companion', 28), val: companion28, fmt: 'raw' },
            { name: 'Spelunking AFK Cards', val: card99, fmt: 'raw' },
            { name: 'Vial: Spelunking AFK', val: vial7afk, fmt: 'raw' },
          ] },
          { name: 'Shared AFK Portion', val: spelunkAllPct, fmt: 'raw', note: 'Source currently returns 0% of shared AFK sources' },
          { name: 'ALL AFK multiplier', val: afkAllMulti, fmt: 'x' },
        ],
        partial: spelunkMissing.length > 0,
        reason: spelunkMissing.length > 0
          ? 'Partial total: the imported JSON does not include ' + spelunkMissing.join(' or ') + ' metadata.'
          : '',
      };
    }
    if (!sk) return {
      val: 0.01,
      children: [{ name: 'AFKgainrates source fallthrough', val: 0.01, fmt: 'x' }],
      partial: false,
      reason: '',
    };

    var skillSum = 0;
    var skillChildren = [];
    for (var ti = 0; ti < sk.talents.length; ti++) {
      var talentTerm = resolverTerm(talent, sk.talents[ti], ctx);
      skillSum += rval(talent, sk.talents[ti], ctx);
      skillChildren.push(talentTerm);
    }
    var trapMG = sk.trapMG != null ? safe(computeTrapMGBonus, sk.trapMG, s) : 0;
    var starSign = sk.starSign ? safe(computeStarSignBonus, sk.starSign, ci, s) : 0;
    var bribe = sk.bribe ? safe(getBribeBonus, sk.bribe, s) : 0;
    var boxResult = sk.boxKey ? safe(computeBoxReward, ci, sk.boxKey) : 0;
    var boxBonus = boxResult && typeof boxResult === 'object' ? Number(boxResult.val) || 0 : Number(boxResult) || 0;
    var passiveCards = sk.cardType != null && computeRiftSkillBonus(sk.riftSkill, 2, s) > 0;
    var cardResult = sk.cardType != null
      ? safe(computeCardBonusByType, sk.cardType, ci, s, { passive: passiveCards }) : 0;
    var cardBonus = cardResult && typeof cardResult === 'object' ? Number(cardResult.val) || 0 : Number(cardResult) || 0;
    var bubbleBonus = sk.bubble ? safe(bubbleValByKey, sk.bubble, ci, s) : 0;
    var skillEtcTerm = sk.etcId ? resolverTerm(etcBonus, sk.etcId, ctx) : null;
    var skillEtc = sk.etcId ? rval(etcBonus, sk.etcId, ctx) : 0;
    skillSum += trapMG + starSign + bribe + boxBonus + cardBonus + bubbleBonus + skillEtc;
    skillChildren.push(
      sourceTerm('Trapping minigame AFK', trapMG),
      sourceTerm('Star Signs: Skill AFK', starSign),
      sourceTerm(sk.bribe ? label('Bribe', Number(sk.bribe)) : 'Bribe', bribe),
      sourceTerm('Post Office: ' + skillType + ' AFK', boxResult, { val: boxBonus }),
      sourceTerm('Card Bonus: ' + skillType + ' AFK', cardResult, { val: cardBonus }),
      sourceTerm('Bubble: ' + skillType + ' AFK', bubbleBonus)
    );
    if (skillEtcTerm) skillChildren.push(skillEtcTerm);

    var val = (sk.base + (skillSum + afkAll) / 100) * afkAllMulti;
    val = Math.max(0.01, val);

    if (val !== val || val == null) val = 0.01;

    var children = [];
    children.push({ name: 'Base', val: sk.base, fmt: 'raw' });
    children.push({ name: 'Skill Sources (' + skillType + ')', val: skillSum, fmt: '%', children: skillChildren });
    children.push({ name: 'Shared AFK Sources', val: afkAll, fmt: '%', children: afkAllChildren });
    children.push(afkAllMultiNode);

    var missingMetadata = [];
    if (s.companionDataAvailable === false) missingMetadata.push('companion ownership');
    if (s.activeVoteDataAvailable === false) missingMetadata.push('current server vote');
    return {
      val: val,
      children: children,
      partial: missingMetadata.length > 0,
      reason: missingMetadata.length > 0
        ? 'Partial total: the imported JSON does not include ' + missingMetadata.join(' or ') + ' metadata.'
        : '',
    };
  }
});
