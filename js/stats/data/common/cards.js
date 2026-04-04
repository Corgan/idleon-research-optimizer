// ===== CARD DATA =====
import { CardStuff } from '../game/customlists.js';

// Full card tables — process ALL cards from game data
export var CARD_BASE_REQ = {};
export var CARD_BONUS = {};  // ALL card bonuses keyed by cardID → { desc, val }

for (var _cw = 0; _cw < CardStuff.length; _cw++) {
  var _world = CardStuff[_cw];
  for (var _ci = 0; _ci < _world.length; _ci++) {
    var _c = _world[_ci];
    var _id = _c[0], _req = Number(_c[2]), _desc = _c[3], _val = Number(_c[4]);
    if (_req !== 10) CARD_BASE_REQ[_id] = _req;
    CARD_BONUS[_id] = { desc: _desc, val: _val };
  }
}

// Generic accessor
export function cardBaseReq(id) { return CARD_BASE_REQ[id] || 10; }
export function cardBonusVal(id) { var b = CARD_BONUS[id]; return b ? b.val : 0; }
export function cardBonusDesc(id) { var b = CARD_BONUS[id]; return b ? b.desc : ''; }

// Legacy DR-specific maps (filtered from generic data)
export var CARD_DR_BONUS = {};
export var CARD_DR_PASSIVE = {};
export var CARD_DR_MULTI = {};
for (var _kid in CARD_BONUS) {
  var _kb = CARD_BONUS[_kid];
  if (_kb.desc === '+{%_Total_Drop_Rate') CARD_DR_BONUS[_kid] = _kb.val;
  else if (_kb.desc === '+{%_Total_Drop_Rate_(Passive)') CARD_DR_PASSIVE[_kid] = _kb.val;
  else if (_kb.desc === '+{%_Drop_Rate_Multi') CARD_DR_MULTI[_kid] = _kb.val;
}
