// ===== VAULT DATA =====
import { UpgradeVault } from '../game/customlists.js';

export function vaultUpgPerLevel(idx) { return Number(UpgradeVault[idx]?.[5]) || 0; }
