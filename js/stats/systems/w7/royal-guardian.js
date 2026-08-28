// ===== ROYAL GUARDIAN SYSTEM (W7) =====
// Pure save-backed Royal Guardian calculations. Dynamic non-Royal sources are
// reported through breakdown.missing instead of being treated as unowned.
import {
	ARMORY_UPGRADES, ORBLET_MARKET, ROYAL_RESOURCES, OUTPOST_RANK_REQUIREMENTS,
	OUTPOST_RANK_COSTS, ARMORY_ORDER, royalKillRequirement, royalMapBaseKillRequirement,
	statueFlairMaterial, royalMarble, ROYAL_STATUES,
	royalMapEligible,
} from '../../data/w7/royal-guardian.js';
import { MapDetails } from '../../data/game/customlists.js';
import { ITEMS } from '../../data/game/items.js';
import { companions } from '../common/companions.js';
import { bubbleValByKey } from '../w2/alchemy.js';
import { arcadeBonus } from '../w2/arcade.js';
import { rogBonusQTY } from './sushi.js';
import { computeBigFishBonus, shopUpgBonus } from './spelunking.js';
import { zenithMarketPerLevel } from '../../data/w5/sailing.js';
import { getLOG } from '../../../formulas.js';
import { charClassData, optionsListData } from '../../../save/data.js';
import { maxTalentBonusDetail } from '../common/talent.js';
import { legendPTSbonus } from './spelunking.js';
import { etcBonus } from '../common/etcBonus.js';

const n = value => Number(value) || 0;
const arr = (S, index) => Array.isArray(S?.royalGData?.[index]) ? S.royalGData[index] : [];
const row = (S, mapIdx) => Array.isArray(S?.royalMapsData?.[mapIdx]) ? S.royalMapsData[mapIdx] : null;

export function royalG(S, sub, idx) { return n(arr(S, sub)[idx]); }
export function royalMap(S, mapIdx) { return row(S, Number(mapIdx)); }
export function hasRoyalData(S) { return S?.royalDataAvailable === true; }
function _hasExplicit(S, key) { return Object.prototype.hasOwnProperty.call(S || {}, key); }
export function hasRoyalGData(S) {
	if (_hasExplicit(S, 'royalGDataAvailable')) return S.royalGDataAvailable === true;
	if (S?.royalDataAvailable !== true) return false;
	return _hasExplicit(S, 'royalGData');
}
export function hasRoyalMapsData(S) {
	if (_hasExplicit(S, 'royalMapsDataAvailable')) return S.royalMapsDataAvailable === true;
	if (S?.royalDataAvailable !== true) return false;
	return _hasExplicit(S, 'royalMapsData');
}
export function hasCompleteRoyalData(S) { return hasRoyalGData(S) && hasRoyalMapsData(S); }
export function royalGuardianCharacter(S) {
	const limit = Math.max(charClassData.length, S?.lv0AllData?.length || 0);
	let index = -1; let level = 0; let count = 0;
	for (let ci = 0; ci < limit; ci++) {
		if (Number(charClassData[ci]) !== 16) continue;
		count++;
		const candidateLevel = n(S?.lv0AllData?.[ci]?.[0]);
		if (index < 0 || candidateLevel > level) { index = ci; level = candidateLevel; }
	}
	return { index, level, available: index >= 0, ...(count > 1 ? { ambiguous: true } : {}) };
}
function _treeValue(value) { return n(value?.value ?? value?.val ?? value); }
export function royalGuardianDerivedInputs(S) {
	const character = royalGuardianCharacter(S);
	const royalCharIdx = character.index;
	const talentInputs = royalTalentInputs(S);
	const detailValue = idx => { const value = character.available ? n(talentInputs.provenance[idx]) : 0; return idx === 230 || idx === 231 || idx === 232 ? Math.max(1, value) : value; };
	const alchemy = character.available ? _treeValue(bubbleValByKey('W14', royalCharIdx, S)) : 0;
	const spelunkLevel = n(S?.spelunkData?.[45]?.[10]);
	return {
		royalCharIdx, charLevel: character.available ? n(S?.lv0AllData?.[royalCharIdx]?.[0]) : 0,
		companion141: n(companions(141, S)), sushi60: n(rogBonusQTY(60, S?.cachedUniqueSushi || 0)),
		alchemyW14: alchemy, arcade70: _treeValue(arcadeBonus(70, S)),
		talent225: detailValue(225), talent226: detailValue(226), talent230Multi: detailValue(230), talent231Multi: detailValue(231), talent232Multi: detailValue(232),
		talent225Raw: n(talentInputs.provenance['225Detail']?.value), talent226Raw: n(talentInputs.provenance['226Detail']?.value),
		talent230MultiRaw: n(talentInputs.provenance['230Detail']?.value), talent231MultiRaw: n(talentInputs.provenance['231Detail']?.value), talent232MultiRaw: n(talentInputs.provenance['232Detail']?.value),
		zenith10: Math.floor(zenithMarketPerLevel(10) * spelunkLevel), shop65: n(shopUpgBonus(65, S)), shop77: n(shopUpgBonus(77, S)),
		spelunkBigFish6: n(computeBigFishBonus(6, S)), available: character.available,
		missing: character.available ? [] : ['Royal Guardian character'], candidateCount: Array.from({ length: Math.max(charClassData.length, S?.lv0AllData?.length || 0) }, (_, index) => Number(charClassData[index]) === 16).filter(Boolean).length, context: character,
		provenance: { companion141: 'companions(141)', sushi60: 'rogBonusQTY(60, cachedUniqueSushi)', alchemyW14: 'bubbleValByKey(W14, royalCharIdx)', arcade70: 'arcadeBonus(70)', talent225: 'maxTalentBonusDetail(225)', talent226: 'maxTalentBonusDetail(226)', talent230Multi: 'max(1, maxTalentBonusDetail(230))', talent231Multi: 'max(1, maxTalentBonusDetail(231))', talent232Multi: 'max(1, maxTalentBonusDetail(232))', zenith10: 'floor(zenithMarketPerLevel(10) * spelunkData[45][10])', shop65: 'shopUpgBonus(65)', shop77: 'shopUpgBonus(77)', spelunkBigFish6: 'computeBigFishBonus(6)' },
	};
}
export function royalTalentInputs(S) {
	const character = royalGuardianCharacter(S);
	const talents = {};
	for (const talentIdx of [225, 226, 230, 231, 232]) {
		const detail = maxTalentBonusDetail(talentIdx, character.available ? character.index : -1, S);
		talents[talentIdx] = character.available && detail ? detail.value : 0;
		talents[`${talentIdx}Detail`] = character.available && detail ? detail : { value: 0, contextAvailable: false };
	}
	return {
		currentCharacter: character,
		talent225: talents[225], talent226: talents[226],
		talent230Multi: talents[230], talent231Multi: talents[231], talent232Multi: talents[232],
		provenance: talents,
		contextAvailable: character.available && [225, 226, 230, 231, 232].every(idx => talents[`${idx}Detail`].contextAvailable),
	};
}
export function availability(S, required = []) {
	const missing = hasRoyalGData(S) ? required.filter(i => !Array.isArray(S.royalGData?.[i])) : ['RoyalG', ...required];
	return { available: hasRoyalGData(S), partial: missing.length > 0, missing: [...new Set(missing)] };
}

function _itemPairCount(pair, itemId) {
	if (!pair?.available || !Array.isArray(pair.order) || !Array.isArray(pair.quantity)) return 0;
	let value = 0;
	for (let i = 0; i < Math.min(pair.order.length, pair.quantity.length); i++) {
		if (String(pair.order[i]) === itemId) value += n(pair.quantity[i]);
	}
	return value;
}
export function itemCount(S, itemId) {
	const data = S?.itemQuantityData;
	const missing = new Set();
	let value = 0;
	if (!data) {
		return { value: 0, partial: true, missing: ['storage inventory', 'character inventory'] };
	}
	if (data.chest?.available) value += _itemPairCount(data.chest, itemId);
	else missing.add('storage inventory');
	if (!Array.isArray(data.inventories)) {
		missing.add('character inventory');
	} else {
		data.inventories.forEach((pair, index) => {
			if (pair?.available) value += _itemPairCount(pair, itemId);
			else missing.add(`character inventory ${index}`);
		});
	}
	return { value, partial: missing.size > 0, missing: Array.from(missing) };
}
function _itemName(itemId, fallback) { return String(ITEMS[itemId]?.displayName || fallback).replace(/_/g, ' '); }
export function royalMarbleOwnedDetail(S, category) { const material = royalMarble(Number(category)); return { ...itemCount(S, `RGshard${category}`), item: `RGshard${category}`, itemName: material?.name || _itemName(`RGshard${category}`, 'Royal Marble'), category: Number(category) }; }
export function parchmentOwnedDetail(S) { return { ...itemCount(S, 'RGenh'), item: 'RGenh', itemName: _itemName('RGenh', 'Parchment') }; }
export function orbletOwnedDetail(S) { return { ...itemCount(S, 'Orblet'), item: 'Orblet', itemName: _itemName('Orblet', 'Orblet') }; }

export function statueUpgradeOdds(S, statueIdx, ext) {
	const level = royalG(S, 0, statueIdx);
	if (level <= 0) return 1 / [25, 50, 100, 250, 500, 1000, 2500, 10000][statueIdx];
	return 1 / (10 * Math.ceil((25 + 15 * statueIdx ** 2) * Math.max(1, 1 + (level - 1) / 4) / 10));
}
export function statueCost() { return 1; }
export function statueBonus(S, statueIdx, ext) {
	ext = ext || {}; const level = royalG(S, 0, statueIdx);
	if (level <= 0) return 0;
	const base = n(ext.research41?.[statueIdx] ?? OUTPOST_RANK_REQUIREMENTS[statueIdx]);
	const perLevel = n(ext.research42?.[statueIdx] ?? OUTPOST_RANK_COSTS[statueIdx]);
	return (1 + armoryBonus(S, 45) / 100) * (base + perLevel * Math.max(0, level - 1));
}
function _sourceText(value) { return String(value ?? '').replace(/_/g, ' ').replace(/\\'/g, "'").replace(/千/g, ''); }
function _formatDollar(value) {
	if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
	if (Number.isInteger(value)) return String(value);
	return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
function _kingdomSovereigntyNextUnit(S) {
	const level = Math.max(0, Math.floor(armoryLevel(S, 68)));
	if (level >= 36) return "None. You've recruited them all!";
	const types = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 0, 1, 2, 2];
	const worlds = [1, 2, 1, 2, 1, 2, 3, 1, 2, 3, 1, 2, 3, 3, 4, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 4, 4, 4];
	return `${['Commander', 'Knight', 'Priest'][types[level]]} for World ${worlds[level]}`;
}
function _outpostROGBonus(S, type) {
	const selected = Math.floor(n(royalG(S, 3, 2)));
	if (selected !== type || type < 0 || type > 3) return 1;
	const progress = Math.max(1, TotalStatz(S)[4] - 6);
	return 1 + progress / (40 + progress) * [10, 2, 1, 4][type];
}
function _replaceMarkers(template, value, dollar) {
	return _sourceText(template)
		.replace(/\+?\{%/g, `+${n(value)}%`)
		.replace(/\{px/g, `${n(value)}px`)
		.replace(/\}x/g, `${(1 + n(value) / 100).toFixed(2)}x`)
		.replace(/\{/g, `${n(value)}`)
		.replace(/\}/g, `${(1 + n(value) / 100).toFixed(2)}x`)
		.replace(/\$/g, dollar == null ? 'Source value unavailable' : typeof dollar === 'number' ? _formatDollar(dollar).replace(/\+/g, '') : String(dollar))
		.replace(/@/g, '').replace(/\+\s*\+/g, '+').replace(/([.!?])(?=[A-Z])/g, '$1 ').replace(/:(?=\+)/g, ': ').replace(/\s+/g, ' ').trim();
}
function _etcBonusValue(S, id) {
	const character = royalGuardianCharacter(S);
	if (!character.available) return 0;
	try { return n(etcBonus.resolve(String(id), { saveData: S, charIdx: character.index })?.val); } catch { return 0; }
}
export function parchmentDropChance(S) {
	if (armoryLevel(S, 37) < 1) return 0.001;
	return 0.001 * (1 + (armoryBonus(S, 38) + orbletBonus(S, 9) + n(companions(172, S))) / 100);
}
export function parchmentDoubleChance(S) { return armoryBonus(S, 39) / 100; }
export function parchmentRecycleChance(S) { return Math.min(0.75, armoryBonus(S, 40) / 100); }
export function marbleDropChance(S, category = 0, armoryBonus41Override) {
	const t = n(category);
	const derived = royalGuardianDerivedInputs(S);
	const talent = Math.max(1, n(derived.talent232Multi));
	const lore = n(S?.spelunkData?.[0]?.[9]) >= 1 ? 1 : 0;
	const armory41 = armoryBonus41Override == null ? armoryBonus(S, 41) : n(armoryBonus41Override);
	return 1 / (1000 + 300 * t ** 2) * talent
		* (1 + (armory41 + n(rogBonusQTY(62, S?.cachedUniqueSushi || 0)) + n(arcadeBonus(71, S)) + n(companions(172, S)) + _etcBonusValue(S, 107)) / 100)
		* (1 + 50 * lore / 100);
}
function _armoryDollarValue(S, index, value = armoryBonus(S, index)) {
	if (index === 0) return 25;
	if (index === 1) return Math.round(1 + (200 + value) * outpostPurification(S, 0) / 100);
	if (index === 17) return barExpRateBase(S, 3) / 2;
	if (index === 18) return TotalStatz(S)[0] * value;
	if ([19, 20, 21, 22, 23, 24, 25, 26].includes(index)) return unitSpecEffect(S, index - 19, {}, value);
	if (index === 37) return 1 / parchmentDropChance(S);
	if (index === 39) return value;
	if (index === 40) return Math.min(75, value);
	if (index === 41) return 1 / marbleDropChance(S, 0, value);
	if (index === 42) { const multiplier = 1 + supportCollection(S) / 100; return `${_formatDollar(multiplier)}x EXP & ${_formatDollar(multiplier)}x Collection Rate!`; }
	if (index === 44) return savageCollection(S);
	if (index === 50) return TotalStatz(S)[1] * value;
	if (index === 51) return TotalStatz(S)[2] * value;
	if (index === 52) return Math.floor(Math.max(0, royalGuardianDerivedInputs(S).charLevel - 1000) / 100) * value;
	if (index === 53) return TotalStatz(S)[3] * value;
	if ([60, 61, 62, 63, 64, 65, 66, 67].includes(index)) return unitSpecEffect(S, 4);
	if (index === 68) return _kingdomSovereigntyNextUnit(S);
	if (index === 71) return armoryLevel(S, 71) >= 1 ? ` You now get +1 additional PTS every ${Math.max(1, 11 - armoryLevel(S, 71))} Ranks` : '';
	if (index === 79) { const type = Math.max(0, Math.min(3, Math.floor(n(royalG(S, 3, 2))))); return `${_formatDollar(_outpostROGBonus(S, type))}x ${['Construction Build Rate', 'Research EXP Gain', 'Spelunking Stamina Regen', 'Minehead Currency Gain'][type]}`; }
	return null;
}
export function armoryDescription(S, index, value = armoryBonus(S, index)) { return _replaceMarkers(ARMORY_UPGRADES[index]?.description, value, _armoryDollarValue(S, index, value)); }
export function royalStatueDescription(S, index, levelOverride) {
	const info = ROYAL_STATUES[Number(index)];
	if (!info) return 'Source value unavailable';
	if (Number(index) >= 4) return info.description;
	const level = levelOverride == null ? royalG(S, 0, index) : n(levelOverride);
	const value = (1 + armoryBonus(S, 45) / 100) * (level > 0 ? n(OUTPOST_RANK_REQUIREMENTS[index]) + n(OUTPOST_RANK_COSTS[index]) * Math.max(0, level - 1) : 0);
	return _replaceMarkers(info.description, value);
}
export function statueFlairMax() { return 3; }
export function statueFlairLevel(S, statueIdx) { return royalG(S, 22, statueIdx); }
export function statueFlairCost(S, statueIdx) { return 10 * (statueIdx + 1) * 5 ** statueFlairLevel(S, statueIdx); }
function _statueFlairBonusAtLevel(level) { return 2 * (300 * level + 100 * Math.floor(level / 2) + 200 * Math.floor(level / 3)); }
export function statueFlairOwned(S, statueIdx, ext) {
	const material = statueFlairMaterial(statueIdx);
	const detail = royalMarbleOwnedDetail(S, material?.category);
	if (!detail.partial || !ext) return detail.value;
	if (Array.isArray(ext.flairOwned)) return n(ext.flairOwned[statueIdx]);
	if (Array.isArray(ext.shardCounts)) return n(ext.shardCounts[material?.category]);
	return detail.value;
}
export function statueFlairOwnedDetail(S, statueIdx, ext) {
	const material = statueFlairMaterial(statueIdx);
	const detail = royalMarbleOwnedDetail(S, material?.category);
	if (!detail.partial || !ext) return detail;
	const value = Array.isArray(ext.flairOwned) ? n(ext.flairOwned[statueIdx]) : Array.isArray(ext.shardCounts) ? n(ext.shardCounts[material?.category]) : detail.value;
	return { ...detail, value };
}
export function statueFlairBonus(S, statueIdx) { return _statueFlairBonusAtLevel(statueFlairLevel(S, statueIdx)); }
export function statueFlairMultiplier(S, statueIdx) { return 1 + statueFlairBonus(S, statueIdx) / 100; }
export function statueFlairRow(S, statueIdx, ext) {
	const level = statueFlairLevel(S, statueIdx); const material = statueFlairMaterial(statueIdx); const owned = statueFlairOwnedDetail(S, statueIdx, ext);
	const maxed = level >= statueFlairMax(); const cost = maxed ? Infinity : statueFlairCost(S, statueIdx);
	return { statueIdx, level, maxed, currentMultiplier: statueFlairMultiplier(S, statueIdx), nextMultiplier: maxed ? null : 1 + _statueFlairBonusAtLevel(level + 1) / 100, cost, material, owned: owned.value, affordable: !maxed && !owned.partial && owned.value >= cost, partial: owned.partial, missing: owned.missing };
}
export function royalStatueUpgradeDetail(S, idx) {
	const initial = royalG(S, 0, idx) === 0; const material = initial ? royalMarbleOwnedDetail(S, idx) : parchmentOwnedDetail(S);
	return { idx, item: material.item, itemName: material.itemName, cost: 1, owned: material.value, affordable: material.value >= 1, partial: material.partial, missing: material.missing };
}
export const Statue_Cost = statueCost;
export const SF_unlocked = S => armoryBonus(S, 78) >= 1;
export const SF_max = statueFlairMax;
export const SF_cost = statueFlairCost;
export const SF_weOwn = statueFlairOwned;
export const SF_bonus = statueFlairBonus;
export function expectedAttempts(chance) { return chance > 0 ? 1 / chance : Infinity; }
export function confidenceAttempts(chance, confidence) { return chance > 0 && chance < 1 ? Math.ceil(Math.log(1 - confidence) / Math.log(1 - chance)) : (chance >= 1 ? 1 : Infinity); }
export function statueExpectedAttempts(S, idx, ext) { return expectedAttempts(statueUpgradeOdds(S, idx, ext)); }
export function statueConfidenceAttempts(S, idx, confidence, ext) { return confidenceAttempts(statueUpgradeOdds(S, idx, ext), confidence); }

export function armoryLevel(S, index) { return royalG(S, 2, index); }
export function armoryBonus(S, index) { return armoryLevel(S, index) * (ARMORY_UPGRADES[index]?.bonusPerLevel || 0); }
export function armoryTotalLevels(S) { return arr(S, 2).reduce((sum, value) => sum + n(value), 0); }
export function armoryUnlockOrder() { return ARMORY_ORDER.slice(); }
export function armoryUnlockedCount(S) {
	const total = armoryTotalLevels(S);
	const unlocked = ARMORY_UPGRADES.reduce((count, upgrade) => count + (total >= n(upgrade.researchOrder) ? 1 : 0), 0);
	return Math.round(Math.min(unlocked, ARMORY_ORDER.length));
}
export function allMasterclassCostReduxPrefix(S) {
	const threshold = n(optionsListData?.[480]);
	const legend = legendPTSbonus(23, S);
	const bundle = S?.bundlesData?.bon_p ? 1 : 0;
	return threshold < legend ? (bundle ? 0.05 : 0.2) : (bundle ? 0.25 : 1);
}
export function allMasterclassCostRedux(S) {
	const prefix = allMasterclassCostReduxPrefix(S);
	const bargain = 1 / (1 + orbletBonus(S, 7) / 100);
	return prefix * bargain;
}
export function allMasterclassCostReduxDetail(S) {
	const prefix = allMasterclassCostReduxPrefix(S); const bargain = 1 / (1 + orbletBonus(S, 7) / 100);
	return { value: prefix * bargain, prefix, bargain, reductionPercent: (1 - prefix * bargain) * 100 };
}
export function armoryUpgradeCost(S, orderIndex) {
	const index = ARMORY_ORDER[orderIndex] ?? orderIndex; const upgrade = ARMORY_UPGRADES[index];
	if (!upgrade) return { value: Infinity, factors: [], missing: ['armory row'] };
	const level = armoryLevel(S, index); const redux = allMasterclassCostRedux(S); const currencySlot = ARMORY_UPGRADES[orderIndex]?.currencySlot ?? -1;
	if (index === 46 && level < 3) return { value: 2, factors: [{ name: 'source special case', value: 2 }], index, level, currencySlot };
	if (index === 58 && level < 1) return { value: 3, factors: [{ name: 'source special case', value: 3 }], index, level, currencySlot };
	const factors = [{ name: 'base', value: 35 }, { name: 'Masterclass reduction', value: redux }, { name: 'order growth', value: 1.28 ** orderIndex }, { name: 'order coefficient', value: 3 + 6 * orderIndex }, { name: 'base cost coefficient', value: upgrade.baseCost }, { name: 'level growth', value: upgrade.costGrowth ** level }];
	return { value: factors.reduce((value, factor) => value * factor.value, 1), factors, index, level, currencySlot };
}
export function armoryRows(S) { return ARMORY_ORDER.map((index, orderIndex) => ({ index, orderIndex, currentLevel: armoryLevel(S, index), currentBonus: armoryBonus(S, index), nextBonus: armoryBonus(S, index) + (ARMORY_UPGRADES[index]?.bonusPerLevel || 0), cost: armoryUpgradeCost(S, orderIndex) })); }

export function orbletLevel(S, index) { return royalG(S, 23, index); }
export function orbletCost(S, index) { const u = ORBLET_MARKET[index]; if (!u) return Infinity; const value = orbletLevel(S, index) + u.baseCost * u.costGrowth ** orbletLevel(S, index); return value < 1e6 ? Math.floor(value) : value; }
export function orbletBonus(S, index) { return Math.floor(orbletLevel(S, index) * (ORBLET_MARKET[index]?.bonusPerLevel || 0)); }
export function orbletNextBonus(S, index) { const u = ORBLET_MARKET[index]; return !u || orbletLevel(S, index) >= orbletMax(index) ? null : Math.floor((orbletLevel(S, index) + 1) * u.bonusPerLevel); }
export function orbletPrerequisite(index) { return ORBLET_MARKET[index]?.metadata; }
export function orbletMax(index) { return ORBLET_MARKET[index]?.maxLevel || 0; }
export function orbletDescription(S, index, levelOverride) {
	const u = ORBLET_MARKET[index];
	if (!u) return 'Source value unavailable';
	if (index === 4) return 'Attempt Glorification for a chance to gain Statue EXP.';
	const value = levelOverride == null ? orbletBonus(S, index) : Math.floor(n(levelOverride) * u.bonusPerLevel);
	return _replaceMarkers(u.description, value, 1 + value / 100);
}
export function orbletUnlocked(S, index) { return index === 0 || orbletLevel(S, index - 1) >= 1; }
export function orbletRows(S) { return ORBLET_MARKET.map((u, index) => { const level = orbletLevel(S, index); const maxed = level >= orbletMax(index); const owned = orbletOwnedDetail(S); const unlocked = orbletUnlocked(S, index); const cost = maxed ? Infinity : orbletCost(S, index); const purchasable = unlocked && !maxed && !owned.partial && Number.isFinite(cost); return { ...u, level, kind: index === 4 ? 'action' : 'upgrade', maxed, cost, bonus: orbletBonus(S, index), nextBonus: maxed || index === 4 ? null : orbletNextBonus(S, index), unlocked, purchasable, owned: owned.value, affordable: purchasable && owned.value >= cost, partial: owned.partial, missing: owned.missing }; }); }
export function glorificationAttempts(S, ext) { const chance = n(ext?.glorificationChance) || 0.1; return { expected: expectedAttempts(chance), attempts50: confidenceAttempts(chance, 0.5), attempts90: confidenceAttempts(chance, 0.9) }; }
export function glorificationCurrentCost(S) { return orbletCost(S, 4); }
export function glorificationCumulativeCost(S, attempts) { const count = Math.max(0, Math.floor(n(attempts))); if (!count) return 0; return glorificationCurrentCost(S) + Math.max(0, count - 1) * 32; }
export function glorificationAffordableAttempts(S) { const owned = orbletOwnedDetail(S); const first = glorificationCurrentCost(S); if (owned.value < first) return 0; return 1 + Math.floor((owned.value - first) / 32); }
export function glorificationPlan(S, ext) { const attempts = glorificationAttempts(S, ext); const affordableAttempts = glorificationAffordableAttempts(S); return { currentCost: glorificationCurrentCost(S), repeatCost: 32, expectedAttempts: attempts.expected, attempts50: attempts.attempts50, attempts90: attempts.attempts90, expectedCost: glorificationCumulativeCost(S, attempts.expected), cost50: glorificationCumulativeCost(S, attempts.attempts50), cost90: glorificationCumulativeCost(S, attempts.attempts90), affordableAttempts, affordableChance: 1 - 0.9 ** affordableAttempts, partial: orbletOwnedDetail(S).partial, missing: orbletOwnedDetail(S).missing }; }

export function outpostExpFormula(rank, bar = 0) { rank = Math.max(0, n(rank)); return bar === 4 ? 1e5 * 10 ** rank : bar === 2 ? (50 + 50 * rank) * 1.6 ** rank : (10 + 5 * rank) * 1.3 ** rank; }
export function outpostRank(S, mapIdx, bar = 0) { const exp = n(row(S, mapIdx)?.[3 + bar]); let rank = 0; while (exp >= outpostExpFormula(rank, bar)) rank++; return rank; }
export function outpostRankInfo(S, mapIdx, bar = 0) { const rank = outpostRank(S, mapIdx, bar); const exp = n(row(S, mapIdx)?.[3 + bar]); const previous = rank ? outpostExpFormula(rank - 1, bar) : 0; const next = outpostExpFormula(rank, bar); return { rank, exp, previousReq: previous, nextReq: next, progress: Math.max(0, Math.min(1, (exp - previous) / Math.max(1, next - previous))) }; }
export function outpostPointsLeft(S, mapIdx) { const r = row(S, mapIdx); if (!r || r.length <= 3) return 0; const rank = outpostRank(S, mapIdx, 0); const level71 = armoryLevel(S, 71); let points = 2 + armoryBonus(S, 9 + Math.floor(mapIdx / 50)) + rank; if (level71 >= 1) points += Math.floor(rank / (11 - level71)); if (n(r[12]) > 0) points += 10; return points - n(r[0]) * 12 - n(r[1]) * 2 - n(r[2]); }
export function outpostPointCost(type) { return type === 'major' ? 12 : type === 'minor' ? 2 : 1; }
export function outpostUnlockedBars(S) { return [27, 29, 73, 74, 75].map(idx => armoryLevel(S, idx) >= 1); }

export function decodePackedUnits(packed) { const digits = String(Math.max(0, Math.floor(n(packed)))).padStart(9, '0').slice(-9).split('').map(Number); const units = digits.map((digit, slot) => ({ slot, type: digit >= 2 && digit <= 5 ? digit - 2 : -1, raw: digit })).filter(unit => unit.type >= 0); return units; }
export function outpostUnits(S, mapIdx) { return decodePackedUnits(row(S, mapIdx)?.[11]); }
export function passiveUnits(S, mapIdx, type) { const rank = Math.max(0, outpostRank(S, mapIdx, 2)); if (type === 0) return Math.floor(rank / 4) + Math.min(1, outpostPurification(S, mapIdx)); return Math.floor(Math.max(0, rank - type) / 4); }
export function totalUnitsByType(S, mapIdx) { const totals = outpostUnits(S, mapIdx).reduce((counts, unit) => { counts[unit.type]++; return counts; }, [0, 0, 0, 0]); return totals.map((value, type) => value + passiveUnits(S, mapIdx, type)); }
export function parseConnectionEndpoint(value) { if (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')) return { kind: 'empty', id: -1 }; const endpoint = Number(value); if (!Number.isFinite(endpoint) || endpoint < 0) return { kind: 'empty', id: -1 }; return endpoint >= 1000 ? { kind: 'map', id: endpoint - 1000 } : { kind: 'resource', id: endpoint }; }
export function outpostConnections(S, mapIdx) { const r = row(S, mapIdx); return [parseConnectionEndpoint(r?.[8]), parseConnectionEndpoint(r?.[9])]; }
export function outpostSupports(S, mapIdx) { return outpostConnections(S, mapIdx).some(connection => connection.kind !== 'empty'); }
export function outpostType(S, mapIdx) { return n(row(S, mapIdx)?.[10]); }
export function unitSpecEffect(S, index, ext, armoryBonusOverride) { ext = ext || {}; const bonus = value => armoryBonusOverride == null ? armoryBonus(S, value) : n(armoryBonusOverride); if (index === 0) return 50 + bonus(19); if (index === 1) return bonus(20); if (index === 2) return 25 + bonus(21); if (index === 3) return bonus(22); if (index === 4) return 4000 * (1 + bonus(23) / 100) * XtraClearKillz(S, ext); if (index === 5) return bonus(24); if (index === 6) return bonus(25); if (index === 7) return bonus(26); return 0; }
function _rangeWithoutLogistics(S, mapIdx, ext) { return 80 + orbletBonus(S, 8) + unitSpecEffect(S, 2, ext) * totalUnitsByType(S, mapIdx)[2] + outpostRank(S, mapIdx, 3) * armoryBonus(S, 74); }
export function outpostRangeAtLogisticsLevel(S, mapIdx, level, ext) { const logistics = Math.max(0, Math.floor(n(level))); return Math.floor(Math.min(999, _rangeWithoutLogistics(S, mapIdx, ext) + 250 * logistics / (logistics + 100))); }
export function outpostRange(S, mapIdx, ext) { return outpostRangeAtLogisticsLevel(S, mapIdx, row(S, mapIdx)?.[1], ext); }
export function connectionRange(S, mapIdx, ext) { return outpostRange(S, mapIdx, ext); }
export function logisticsUpgradesToReach(S, mapIdx, distance, extraReach = 15, ext) {
	const currentLevel = Math.max(0, Math.floor(n(row(S, mapIdx)?.[1]))); const requiredRange = Math.ceil(Number(distance) - n(extraReach)); const currentRange = outpostRange(S, mapIdx, ext);
	if (!Number.isFinite(Number(distance))) return { possible: false, currentLevel, currentRange, levelsNeeded: null, targetLevel: null, requiredRange: Infinity, reason: 'distance unavailable' };
	if (requiredRange <= currentRange) return { possible: true, currentLevel, currentRange, levelsNeeded: 0, targetLevel: currentLevel, requiredRange };
	const fixed = _rangeWithoutLogistics(S, mapIdx, ext); const delta = requiredRange - fixed;
	if (requiredRange > 999 || delta >= 250) return { possible: false, currentLevel, currentRange, levelsNeeded: null, targetLevel: null, requiredRange, reason: 'beyond maximum Advanced Logistics range' };
	let targetLevel = Math.max(currentLevel, Math.ceil(100 * Math.max(0, delta) / (250 - Math.max(0, delta))));
	while (targetLevel < 1e9 && outpostRangeAtLogisticsLevel(S, mapIdx, targetLevel, ext) < requiredRange) targetLevel++;
	if (targetLevel >= 1e9) return { possible: false, currentLevel, currentRange, levelsNeeded: null, targetLevel: null, requiredRange, reason: 'beyond maximum Advanced Logistics range' };
	return { possible: true, currentLevel, currentRange, levelsNeeded: targetLevel - currentLevel, targetLevel, requiredRange };
}
export function outpostPurification(S, mapIdx) { return n(row(S, mapIdx)?.[12]); }
export function outpostTotalUnits(S, mapIdx, ext) { return totalUnitsByType(S, mapIdx, ext).reduce((a, b) => a + b, 0); }
export function supportCount(S, targetMap) { return (S?.royalMapsData || []).reduce((count, r, mapIdx) => count + (outpostBuilt(S, mapIdx) && n(r[10]) === 1 ? outpostConnections(S, mapIdx).filter(connection => connection.kind === 'map' && connection.id === targetMap).length : 0), 0); }

export function resourceGrade(S, index) { return royalG(S, 5, index); }
// RoyalG[4] is collected/consumed progress, not inventory remaining.
export function resourceRawProgress(S, index) { return Number(arr(S, 4)[index] ?? 0); }
// Compatibility accessor: returns the saved progress, including the -1 drained sentinel.
export function resourceQuantity(S, index) { return resourceRawProgress(S, index); }
export function resourceCapacity(S, index) { const resource = ROYAL_RESOURCES[index]; return 5 * (resource?.baseCapacity || 0) * 1.5 ** resourceGrade(S, index) * 5 ** Math.floor(index / 20); }
export function resourceCollected(S, index) { const raw = resourceRawProgress(S, index); return raw < 0 ? resourceCapacity(S, index) : Math.max(0, Math.min(resourceCapacity(S, index), raw)); }
export function resourceGradeBonus(S, index) { return resourceGrade(S, index) * 25; }
export function resourceRemaining(S, index) { return Math.max(0, resourceCapacity(S, index) - resourceCollected(S, index)); }
export function resourceDrained(S, index) { return resourceRawProgress(S, index) === -1; }
export function resourceDrainHours(S, index, rate) { const remaining = resourceRemaining(S, index); return remaining === 0 ? 0 : n(rate) > 0 ? remaining / n(rate) : Infinity; }
export function resourceFillTime(S, index, rate) { return resourceDrainHours(S, index, rate); }
export function resourceCollectedWithin(S, index, rate, hours) { return resourceDrained(S, index) ? 0 : Math.min(resourceRemaining(S, index), Math.max(0, n(rate) * Math.max(0, n(hours)))); }
export function resourceEmptiedWithin(S, index, rate, hours) { return resourceDrained(S, index) || resourceRemaining(S, index) === 0 || resourceCollectedWithin(S, index, rate, hours) >= resourceRemaining(S, index); }
export function resourceWindowMetrics(S, index, rate, hours = 24) { const drained = resourceDrained(S, index); return { remaining: resourceRemaining(S, index), collected: resourceCollectedWithin(S, index, rate, hours), drainHours: resourceDrainHours(S, index, rate), emptied: resourceEmptiedWithin(S, index, rate, hours), drained, alreadyEmpty: drained || resourceRemaining(S, index) === 0 }; }
export function nextResourceCycleMetrics(S, resourceIdx, currentRate) {
	const index = Number(resourceIdx);
	const valid = Number.isInteger(index) && index >= 0 && index < ROYAL_RESOURCES.length && Boolean(ROYAL_RESOURCES[index]);
	const grade = valid ? resourceGrade(S, index) : 0;
	const capacity = valid ? resourceCapacity(S, index) : 0;
	const rate = n(currentRate);
	const gradeFactor = 1 + grade * 25 / 100;
	const ungradedRate = gradeFactor > 0 ? rate / gradeFactor : 0;
	const fullRate = ungradedRate * gradeFactor;
	const fullDrainHours = capacity === 0 ? 0 : fullRate > 0 ? capacity / fullRate : Infinity;
	const replenishUnlocked = valid && armoryBonus(S, 70) >= 1;
	const gradeIncreaseUnlocked = valid && armoryBonus(S, 0) >= 1;
	const nextCycleAvailable = replenishUnlocked;
	const nextGrade = nextCycleAvailable && gradeIncreaseUnlocked ? grade + 1 : grade;
	const nextCapacity = nextCycleAvailable ? 5 * ROYAL_RESOURCES[index].baseCapacity * 1.5 ** nextGrade * 5 ** Math.floor(index / 20) : null;
	const nextRate = nextCycleAvailable ? ungradedRate * (1 + nextGrade * 25 / 100) : null;
	const nextDrainHours = nextCycleAvailable ? (nextCapacity === 0 ? 0 : nextRate > 0 ? nextCapacity / nextRate : Infinity) : null;
	return {
		currentGrade: grade, currentCapacity: capacity, currentRemaining: valid ? resourceRemaining(S, index) : 0,
		currentRate: rate, currentDrainHours: valid ? resourceDrainHours(S, index, rate) : 0,
		hypotheticalFullCapacity: capacity, hypotheticalFullRate: fullRate, hypotheticalFullDrainHours: fullDrainHours,
		resourceReplenishUnlocked: replenishUnlocked, resourceGradeIncreaseUnlocked: gradeIncreaseUnlocked,
		nextCycleAvailable, nextGrade, nextCapacity, nextRate, nextDrainHours,
	};
}
export function royalResetTiming(S) {
	const timeAway = S?.timeAwayData;
	const raw = timeAway?.ShopRestock;
	const missing = !timeAway || !Object.prototype.hasOwnProperty.call(timeAway, 'ShopRestock') || !Number.isFinite(Number(raw));
	if (missing) return { available: false, secondsRemaining: null, hoursRemaining: null, due: false, partial: true, missing: ['TimeAway.ShopRestock'] };
	const secondsRemaining = Math.max(0, Number(raw));
	return { available: true, secondsRemaining, hoursRemaining: secondsRemaining / 3600, due: secondsRemaining === 0, partial: false, missing: [] };
}
export function nodeQty(S, index) { return resourceQuantity(S, index); }
export function nodeGrade(S, index) { return resourceGrade(S, index); }
export function nodeCap(S, index) { return resourceCapacity(S, index); }
export function resourceCurrency(index) { return ROYAL_RESOURCES[index]?.currencySlot ?? -1; }
export function TotalStatz(S) {
	const grades = arr(S, 5).reduce((sum, value) => sum + n(value), 0);
	const levels = (S?.royalMapsData || []).reduce((sum, value, mapIdx) => sum + (outpostBuilt(S, mapIdx) ? n(value[0]) + n(value[1]) + n(value[2]) : 0), 0);
	const purified = (S?.royalMapsData || []).reduce((sum, value, mapIdx) => sum + (outpostBuilt(S, mapIdx) && outpostRank(S, mapIdx, 4) >= 1 ? 1 : 0), 0);
	const logCurrencies = Array.from({ length: 8 }, (_, index) => getLOG(royalG(S, 1, 10 * index))).reduce((sum, value) => sum + value, 0);
	const outposts = (S?.royalMapsData || []).filter((_, mapIdx) => outpostBuilt(S, mapIdx)).length;
	return [grades, levels, purified, logCurrencies, outposts];
}
export const totalStatz = TotalStatz;
export function globalResourceRateBreakdown(S, ext) {
	ext = ext || {}; const missing = []; const derived = royalGuardianDerivedInputs(S);
	const valueOf = (key, fallback = 0) => { if (derived[key] !== undefined) return n(ext[key] ?? derived[key]); if (ext[key] === undefined) { missing.push(key); return fallback; } return n(ext[key]); };
	const factors = [
		{ name: 'companion141', value: 1 + valueOf('companion141') },
		{ name: 'orbletBonus1+sushi60+alchemyW14+arcade70', value: 1 + (orbletBonus(S, 1) + valueOf('sushi60') + Math.min(50, valueOf('alchemyW14')) + valueOf('arcade70')) / 100 },
		{ name: 'TotalStatz0*armory18', value: 1 + TotalStatz(S)[0] * armoryBonus(S, 18) / 100 }, { name: 'TotalStatz1*armory50', value: 1 + TotalStatz(S)[1] * armoryBonus(S, 50) / 100 }, { name: 'TotalStatz2*armory51', value: 1 + TotalStatz(S)[2] * armoryBonus(S, 51) / 100 },
		{ name: 'charLevel*armory52', value: 1 + Math.floor(Math.max(0, valueOf('charLevel') - 1000) / 100) * armoryBonus(S, 52) / 100 },
		{ name: 'talent225+talent226', value: 1 + (valueOf('talent225') + valueOf('talent226')) / 100 }, { name: 'talent230Multi', value: Math.max(1, valueOf('talent230Multi', 1)) },
		{ name: 'TotalStatz3*armory53', value: 1 + TotalStatz(S)[3] * armoryBonus(S, 53) / 100 }, { name: 'zenith10', value: 1 + valueOf('zenith10') / 100 },
	];
	const royalDataAvailable = hasRoyalGData(S);
	const allMissing = [...new Set([...missing, ...derived.missing, ...(royalDataAvailable ? [] : ['RoyalG'])])];
	return { value: factors.reduce((v, f) => v * f.value, 1), factors, available: royalDataAvailable, partial: allMissing.length > 0 || !derived.available, missing: allMissing };
}
export function outpostResourceRateBreakdown(S, mapIdx, ext) {
	ext = ext || {}; const units = totalUnitsByType(S, mapIdx); const global = globalResourceRateBreakdown(S, ext);
	if (!global.available || !hasRoyalMapsData(S) || !outpostBuilt(S, mapIdx)) {
		const missing = new Set(global.missing);
		if (!hasRoyalMapsData(S)) missing.add('RoyalMaps');
		if (!outpostBuilt(S, mapIdx)) missing.add(`map ${mapIdx} outpost`);
		return { value: 0, factors: [], global, available: false, partial: true, missing: Array.from(missing) };
	}
	const factors = [
		{ name: 'base', value: 125, kind: 'base' },
		{ name: 'globalResourceRateMultiplier', value: global.value, kind: 'multiplier', breakdown: global },
		{ name: 'outpostPurifyBonus', value: 1 + (200 + armoryBonus(S, 1)) * outpostPurification(S, mapIdx) / 100 },
		{ name: 'supportCollection', value: 1 + supportCollection(S) * supportCount(S, mapIdx) / 100 },
		{ name: 'mapLevel1', value: 1 + n(row(S, mapIdx)?.[1]) * 5 / 100 }, { name: 'commandRank*armory73', value: 1 + outpostRank(S, mapIdx, 2) * armoryBonus(S, 73) / 100 },
		{ name: 'unitSpec0*totalUnits0', value: 1 + unitSpecEffect(S, 0) * units[0] / 100 }, { name: 'mapLevel0Cap', value: Math.min(5, 1 + 10 * Math.max(0, Math.round(n(row(S, mapIdx)?.[0]) - 5)) / 100) },
	];
	return { value: factors.reduce((v, f) => v * f.value, 1), factors, global, available: global.available, partial: global.partial, missing: [...new Set(global.missing)] };
}
export function resourceProduction(S, mapIdx, ext) { return outpostResourceRateBreakdown(S, mapIdx, ext); }
export function resourceProductionWithGrade(S, mapIdx, resourceIdx, ext) { const result = outpostResourceRateBreakdown(S, mapIdx, ext); result.value *= 1 + resourceGrade(S, resourceIdx) * 25 / 100; return result; }
export function supportCollection(S) { return 200 * (1 + armoryBonus(S, 43) / 100); }
export function savageCollection(S) { return 5 * (1 + armoryBonus(S, 69) / 100); }
export function resourceRankExpBreakdown(S, mapIdx, ext) { return outpostRankExpBreakdown(S, mapIdx, ext); }
export function barExpRateBase(S, bar, ext) { const derived = royalGuardianDerivedInputs(S); ext = ext || {}; let value = 1 + orbletBonus(S, 6) / 100; if (bar === 4) value *= 1 + n(ext.shop65 ?? derived.shop65) / 100; if (bar === n(royalG(S, 3, 7))) value *= 1 + n(ext.shop77 ?? derived.shop77) / 100; return value * (1 + unitSpecEffect(S, [1, 3, 5, 6, 7][bar], ext) / 100); }
// Source passes the bar index to isMapPurified(t) here, independently of the
// target map's own 2x purified register. Preserve that dispatcher behavior.
export function barExpRate(S, bar, mapIdx, ext) { const purifiedMap = outpostPurification(S, mapIdx) >= 1; const purifiedBarIndexMap = outpostPurification(S, bar) >= 1; return barExpRateBase(S, bar, ext) * (purifiedMap ? 2 : 1) * (1 + 200 * (purifiedBarIndexMap ? 1 : 0) / 100) * (1 + outpostRank(S, mapIdx, 1) * armoryBonus(S, 72) / 100) * (1 + supportCollection(S) * supportCount(S, mapIdx) / 100); }
export function outpostRankExpPerHour(S, mapIdx, bar, ext) { const unitIndex = bar === 0 ? 1 : bar === 1 ? 3 : -1; const units = unitIndex < 0 ? 1 : totalUnitsByType(S, mapIdx)[unitIndex]; return barExpRate(S, bar, mapIdx, ext) * units * n(royalG(S, 3, 0)) / 3600 * (bar === 3 ? 0.5 : 1); }
export function outpostRankExpBreakdown(S, mapIdx, ext) {
	const missing = new Set();
	if (!hasRoyalGData(S)) missing.add('RoyalG');
	if (!hasRoyalMapsData(S)) missing.add('RoyalMaps');
	if (!outpostBuilt(S, mapIdx)) missing.add(`map ${mapIdx} outpost`);
	if (missing.size > 0) return { value: 0, factors: [], available: false, partial: true, missing: Array.from(missing) };
	const factors = [0, 1, 2, 3, 4].map(bar => ({ name: `bar ${bar}`, value: outpostRankExpPerHour(S, mapIdx, bar, ext), kind: 'rate' }));
	return { value: factors.reduce((v, f) => v + f.value, 0), factors, available: true, partial: false, missing: [] };
}

export function outpostKillRequirement(mapIdx) { const override = royalKillRequirement(mapIdx); if (override) return override; const m = Number(mapIdx); return 3 * (25 + 5 * m + royalMapBaseKillRequirement(m) * (1.3 - 0.01 * Math.floor(m / 50)) ** (0.2 * (m - 50 * Math.floor(m / 50))) * 4 ** Math.floor(m / 50) * (1 + 29 * Math.min(1, Math.floor(m / 50)))); }
export function resourceWorld(resourceIdx) { return Math.floor(n(resourceIdx) / 20); }
export function outpostWorld(mapIdx) { return Math.floor(n(mapIdx) / 50); }
export function outpostMapPosition(mapIdx) { const position = MapDetails[Math.floor(n(mapIdx))]?.[2]; return Array.isArray(position) && Number.isFinite(Number(position[0])) && Number.isFinite(Number(position[1])) ? { x: n(position[0]) + 15, y: n(position[1]) + 13 } : null; }
function _resourcePosition(resourceIdx) { const resource = ROYAL_RESOURCES[Math.floor(n(resourceIdx))]; return resource ? { x: n(resource.x) + 28, y: n(resource.y) + 26 } : null; }
export function resourceDistance(mapIdx, resourceIdx) { if (outpostWorld(mapIdx) !== resourceWorld(resourceIdx)) return Infinity; const map = outpostMapPosition(mapIdx); const resource = _resourcePosition(resourceIdx); return map && resource ? Math.hypot(map.x - resource.x, map.y - resource.y) : Infinity; }
export function outpostDistance(from, to) { const source = outpostMapPosition(from); const target = outpostMapPosition(to); return source && target ? Math.hypot(source.x - target.x, source.y - target.y) : Infinity; }
export function resourceReachable(S, mapIdx, resourceIdx, ext) { return outpostBuilt(S, mapIdx) && [0, 2].includes(outpostType(S, mapIdx)) && resourceDistance(mapIdx, resourceIdx) <= outpostRange(S, mapIdx, ext) + 15; }
export function outpostReachable(S, from, to, ext) { const target = outpostEligibility(S, to); return outpostWorld(from) === outpostWorld(to) && outpostBuilt(S, from) && (target.built || target.state === 'eligible') && outpostDistance(from, to) <= outpostRange(S, from, ext) + 8; }
export function reachableResourcesForOutpost(S, mapIdx, ext) { const range = outpostRange(S, mapIdx, ext); const connected = outpostConnections(S, mapIdx).filter(endpoint => endpoint.kind === 'resource').length; return ROYAL_RESOURCES.map((resource, resourceIdx) => ({ resourceIdx, distance: resourceDistance(mapIdx, resourceIdx), range, connectedSlots: connected, reachable: resourceReachable(S, mapIdx, resourceIdx, ext) })).filter(value => resourceWorld(value.resourceIdx) === outpostWorld(mapIdx)).sort((a, b) => a.distance - b.distance); }
export function reachableOutpostsForResource(S, resourceIdx, ext) { return (S?.royalMapsData || []).map((_, mapIdx) => { if (outpostWorld(mapIdx) !== resourceWorld(resourceIdx) || !outpostBuilt(S, mapIdx) || ![0, 2].includes(outpostType(S, mapIdx))) return null; const connections = outpostConnections(S, mapIdx); const used = connections.filter(endpoint => endpoint.kind !== 'empty').length; return { mapIdx, distance: resourceDistance(mapIdx, resourceIdx), range: outpostRange(S, mapIdx, ext), slotsUsed: used, slotsFree: Math.max(0, 2 - used), connectedCount: connections.filter(endpoint => endpoint.kind === 'resource' && endpoint.id === Number(resourceIdx)).length, reachable: resourceReachable(S, mapIdx, resourceIdx, ext) }; }).filter(Boolean).sort((a, b) => a.distance - b.distance); }
export function nextResourceRangeTarget(S, mapIdx, ext) {
	const next = reachableResourcesForOutpost(S, mapIdx, ext).find(value => ROYAL_RESOURCES[value.resourceIdx]?.currencySlot >= 0 && !value.reachable);
	if (!next) return null;
	const plan = outpostType(S, mapIdx) === 1 ? { possible: false, levelsNeeded: null, targetLevel: null, reason: 'Support outposts cannot connect to resources' } : logisticsUpgradesToReach(S, mapIdx, next.distance, 15, ext);
	return { ...next, plan };
}
export function nextOutpostRangeTarget(S, resourceIdx, ext) {
	const next = reachableOutpostsForResource(S, resourceIdx, ext).find(value => !value.reachable);
	return next ? { ...next, plan: logisticsUpgradesToReach(S, next.mapIdx, next.distance, 15, ext) } : null;
}
export function royalWorldUnlocked(S, worldIdx) { const world = Math.floor(n(worldIdx)); if (world < 0 || world > 6) return false; if (world === 0) return true; let unlocked = 1; for (let index = 2; index <= 7; index++) unlocked += Math.min(1, Math.max(0, armoryBonus(S, index))); return unlocked >= world + 1; }
export function outpostState(S, mapIdx) { const index = Math.floor(n(mapIdx)); const saved = S?.royalMapsData?.[index]; const progress = Array.isArray(saved) ? Math.max(0, n(saved[0])) : 0; if (outpostBuilt(S, index)) return { state: 'built', progress }; if (Array.isArray(saved) && saved.length <= 2 && progress > 0) return { state: 'in-progress', progress }; return { state: royalMapEligible(index) && Array.isArray(MapDetails[index]) && royalWorldUnlocked(S, Math.floor(index / 50)) ? 'eligible' : 'locked', progress }; }
export function outpostEligibility(S, mapIdx) { const index = Math.floor(n(mapIdx)); const worldIdx = Math.floor(index / 50); const staticEligible = royalMapEligible(index) && Array.isArray(MapDetails[index]); const worldUnlocked = royalWorldUnlocked(S, worldIdx); const status = outpostState(S, index); const requirement = outpostKillRequirement(index); const progress = status.progress; const remaining = Math.max(0, requirement - progress); const reason = status.state === 'locked' ? (!staticEligible ? 'map is statically ineligible' : !worldUnlocked ? 'world is locked' : 'map is unavailable') : undefined; return { mapIdx: index, worldIdx, staticEligible, worldUnlocked, built: status.state === 'built', state: status.state, progress, requirement, remaining, reason }; }
export function worldOutpostRows(S, worldIdx, opts) { const includeLocked = opts?.includeLocked === true; const world = Math.floor(n(worldIdx)); return Array.from({ length: 50 }, (_, offset) => world * 50 + offset).filter(index => Array.isArray(MapDetails[index])).map(index => outpostEligibility(S, index)).filter(value => value.staticEligible || includeLocked); }
export const worldOutpostStatuses = worldOutpostRows;
export function worldUnlockCount(S, world) { return mapWorldUnlockCount(S, world); }
export function hasOutpost(S, mapIdx) { return outpostBuilt(S, mapIdx); }
export function outpostBuilt(S, mapIdx) { const value = S?.royalMapsData?.[mapIdx]; return Array.isArray(value) && value.length >= 3; }
export function activeKillClear(S, mapIdx) { return Math.max(0, n(S?.royalMapsData?.[mapIdx]?.[0])); }
export function XtraClearKillz(S, ext) {
	const needsDerived = ext?.talent231Multi == null || ext?.spelunkBigFish6 == null;
	let auto = { talent231Multi: 1, spelunkBigFish6: 0 };
	if (needsDerived) {
		try { auto = royalGuardianDerivedInputs(S); } catch { }
	}
	return Math.max(1, n(ext?.talent231Multi ?? auto.talent231Multi)) * (1 + (orbletBonus(S, 3) + n(ext?.spelunkBigFish6 ?? auto.spelunkBigFish6)) / 100);
}
export function mapWorldUnlockCount(S) { return 1 + [2, 3, 4, 5, 6, 7].reduce((sum, idx) => sum + armoryBonus(S, idx), 0); }

export function kingdomTotals(S, ext) { const maps = Array.isArray(S?.royalMapsData) ? S.royalMapsData : []; let resources = 0; const missing = new Set(); maps.forEach((r, i) => { if (!outpostBuilt(S, i) || outpostType(S, i) !== 0) return; for (const endpoint of outpostConnections(S, i)) if (endpoint.kind === 'resource' && ROYAL_RESOURCES[endpoint.id]) { const rate = resourceProductionWithGrade(S, i, endpoint.id, ext); resources += rate.value; for (const source of rate.missing || []) missing.add(source); } }); if (!hasCompleteRoyalData(S)) { if (!hasRoyalGData(S)) missing.add('RoyalG'); if (!hasRoyalMapsData(S)) missing.add('RoyalMaps'); } return { available: hasCompleteRoyalData(S), outposts: maps.filter((_, mapIdx) => outpostBuilt(S, mapIdx)).length, armoryLevels: armoryTotalLevels(S), resourcesPerHour: resources, partial: !hasCompleteRoyalData(S) || missing.size > 0, missing: Array.from(missing) }; }
export function outpostRows(S, ext) { const maps = Array.isArray(S?.royalMapsData) ? S.royalMapsData : []; return maps.map((r, mapIdx) => outpostBuilt(S, mapIdx) ? ({ mapIdx, type: outpostType(S, mapIdx), range: outpostRange(S, mapIdx, ext), pointsLeft: outpostPointsLeft(S, mapIdx), units: outpostUnits(S, mapIdx), connections: outpostConnections(S, mapIdx), resourceRate: outpostResourceRateBreakdown(S, mapIdx, ext), rankExp: outpostRankExpBreakdown(S, mapIdx, ext), purification: n(r[12]) }) : null).filter(Boolean); }

export function militiaAssignments(S, worldIdx) {
	const worlds = worldIdx == null ? Array.from({ length: 7 }, (_, index) => index) : [Math.floor(n(worldIdx))];
	const assignments = [];
	for (const world of worlds) {
		if (world < 0 || world > 6) continue;
		const types = arr(S, 6 + 2 * world); const maps = arr(S, 7 + 2 * world);
		for (let assignmentIdx = 0; assignmentIdx < Math.min(types.length, maps.length); assignmentIdx++) {
			const type = Number(types[assignmentIdx]); const mapIdx = Number(maps[assignmentIdx]);
			if (!Number.isFinite(type) || !Number.isFinite(mapIdx)) continue;
			assignments.push({ worldIdx: world, assignmentIdx, type, mapIdx });
		}
	}
	return assignments;
}
export function militiaAssignmentCount(S, mapIdx) { const target = Number(mapIdx); return militiaAssignments(S).filter(assignment => assignment.type === 4 && assignment.mapIdx === target).length; }
export function militiaClearRate(S, mapIdx, ext) { return militiaAssignmentCount(S, mapIdx) * unitSpecEffect(S, 4, ext); }
export function outpostClearMetrics(S, mapIdx, ext) {
	const index = Math.floor(n(mapIdx));
	const requirement = outpostKillRequirement(index);
	const assignments = militiaAssignmentCount(S, index);
	const ratePerHour = militiaClearRate(S, index, ext);
	if (!hasCompleteRoyalData(S)) return { mapIdx: index, progress: 0, requirement, remaining: requirement, assignments: 0, ratePerHour: 0, etaHours: null, state: 'unavailable', accruing: false, reason: 'Royal Guardian data is incomplete' };
	const saved = S?.royalMapsData?.[index];
	const progress = Array.isArray(saved) ? Math.max(0, n(saved[0])) : 0;
	const remaining = Math.max(0, requirement - progress);
	if (Array.isArray(saved) && saved.length >= 3) return { mapIdx: index, progress, requirement, remaining, assignments, ratePerHour, etaHours: null, state: 'built', accruing: false };
	if (!Array.isArray(saved) || saved.length !== 1) return { mapIdx: index, progress, requirement, remaining, assignments, ratePerHour, etaHours: null, state: 'non-accruing', accruing: false, reason: !Array.isArray(saved) ? 'RoyalMaps row is missing' : `RoyalMaps row length ${saved.length} does not accrue` };
	if (remaining <= 0) return { mapIdx: index, progress, requirement, remaining, assignments, ratePerHour, etaHours: null, state: 'secured', accruing: false };
	if (!assignments || ratePerHour <= 0) return { mapIdx: index, progress, requirement, remaining, assignments, ratePerHour, etaHours: null, state: 'waiting-militia', accruing: false, reason: 'no militia assignment' };
	return { mapIdx: index, progress, requirement, remaining, assignments, ratePerHour, etaHours: remaining / ratePerHour, state: 'clearing', accruing: true };
}
