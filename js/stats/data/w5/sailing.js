// ===== SAILING DATA =====
import { ArtifactInfo } from '../game/customlists.js';

export function artifactBase(idx) { return Number(ArtifactInfo[idx]?.[3]) || 0; }
