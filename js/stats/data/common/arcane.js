// ===== ARCANE DATA =====
import { ArcaneUpg } from '../game/customlists.js';

export function arcanePerLevel(idx) { return Number(ArcaneUpg[idx]?.[5]) || 0; }
