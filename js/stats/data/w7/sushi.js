// ===== SUSHI STATION DATA =====
import { SushiUPG as _RAW_UPG, Research } from '../game/customlists.js';

// Research[37]: Ring of Glory bonus quantities
export const ROG_BONUS_QTY = Research[37].map(Number);

// SushiUPG[i] = [name, maxLv, costBase, bonusPerLv, costDN_override, description]
export const SUSHI_UPG = _RAW_UPG.map(u => [
  u[0].replace(/_/g, ' ').replace(/\\'/g, "'"),
  Number(u[1]), Number(u[2]), Number(u[3]), Number(u[4]),
  u[5].replace(/_/g, ' ').replace(/\\'/g, "'"),
]);

// Research[32]: slot -> SushiUPG entry index
export const SLOT_TO_UPG = Research[32].map(Number);

// Research[33]: sushi tier -> knowledge category (0-10)
export const TIER_TO_KNOWLEDGE_CAT = Research[33].map(Number);

// Research[34]: knowledge category descriptions
export const KNOWLEDGE_CAT_DESC = Research[34].map(s => s.replace(/_/g, ' '));

// Research[35]: knowledge bonus value per level per category
export const KNOWLEDGE_CAT_VALUE = Research[35].map(Number);

// Research[36]: Ring of Glory bonus descriptions
export const ROG_DESC = Research[36].map(s => s.replace(/_/g, ' '));

// CurrencyPerTier lookup
export const CURRENCY_PER_TIER = [1,3,8,20,50,115,250,560,1220,2650];

export const MAX_SLOTS = 120;
export const MAX_TIER = 53;
