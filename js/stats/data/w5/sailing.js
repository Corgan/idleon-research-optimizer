// ===== SAILING DATA =====
import { ArtifactInfo, CaptainBonuses, IslandInfo, IslandInfobox, ZenithMarket } from '../game/customlists.js';

export function artifactBase(idx) { return Number(ArtifactInfo[idx]?.[3]) || 0; }
export function artifactCount() { return ArtifactInfo.length; }
export function artifactName(idx) { return String(ArtifactInfo[idx]?.[0] || ('Artifact ' + idx)).replace(/_/g, ' '); }
export function artifactBaseOdds(idx) { return Number(ArtifactInfo[idx]?.[2]) || Infinity; }
export function artifactTierBonus(idx, tier) {
	if (tier < 2 || tier > 6) return 0;
	return Number(ArtifactInfo[idx]?.[2 * tier + 2]) || 0;
}

export function islandCount() { return IslandInfo.length; }
export function islandDistance(idx) { return Number(IslandInfo[idx]?.[1]) || 0; }
export function islandCloudRequired(idx) { return Number(IslandInfo[idx]?.[5]) || 0; }
export function islandCaptainExp(idx) { return Number(IslandInfo[idx]?.[8]) || 0; }
export function islandArtifactCount(idx) { return Number(IslandInfobox[idx]?.[2]) || 0; }
export function islandArtifactOffset(idx) {
	var offset = 0;
	for (var i = 0; i < idx; i++) offset += islandArtifactCount(i);
	return offset;
}

export function captainBonusName(idx) {
	return String(CaptainBonuses[idx]?.[3] || ('Bonus ' + idx)).replace(/[+{%}]/g, '').replace(/_/g, ' ').trim();
}
export function captainBonusMin(idx) { return Number(CaptainBonuses[idx]?.[0]) || 0; }
export function captainBonusMax(idx) { return Number(CaptainBonuses[idx]?.[1]) || 0; }
export function zenithMarketPerLevel(idx) { return Number(ZenithMarket[idx]?.[4]) || 0; }
