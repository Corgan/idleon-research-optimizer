// ===== GALLERY DATA (W7) =====
import { ITEMS } from '../game/items.js';
import { IDforETCbonus } from '../game/custommaps.js';

function uqEntries(item) {
  var out = [];
  if (item.UQ1txt) out.push({ stat: item.UQ1txt, val: item.UQ1val });
  if (item.UQ2txt) out.push({ stat: item.UQ2txt, val: item.UQ2val });
  return out.length ? out : null;
}

function cleanName(s) { return s ? s.replace(/\|/g, ' ').replace(/_/g, ' ') : ''; }

// ALL nametag UQ stats keyed by nametag ID
export var NAMETAG_UQ = {};
export var NAMETAG_NAMES = {};
for (const [name, item] of Object.entries(ITEMS)) {
  if (item.Type !== 'NAMETAG') continue;
  var uqs = uqEntries(item);
  if (uqs) { NAMETAG_UQ[item.ID] = uqs; NAMETAG_NAMES[item.ID] = cleanName(item.displayName); }
}

// ALL trophy UQ stats keyed by trophy ID
export var TROPHY_UQ = {};
export var TROPHY_NAMES = {};
for (const [name, item] of Object.entries(ITEMS)) {
  if (!name.startsWith('Trophy')) continue;
  var id = Number(name.replace('Trophy', ''));
  if (isNaN(id)) continue;
  var uqs = uqEntries(item);
  if (uqs) { TROPHY_UQ[id] = uqs; TROPHY_NAMES[id] = cleanName(item.displayName); }
}

// ALL hat UQ stats keyed by item name
// Includes premium/cosmetic hats and crafted hats
export var HAT_UQ = {};
export var HAT_NAMES = {};
for (const [name, item] of Object.entries(ITEMS)) {
  if (!name.startsWith('EquipmentHats')) continue;
  var uqs = uqEntries(item);
  if (uqs) { HAT_UQ[name] = uqs; HAT_NAMES[name] = cleanName(item.displayName); }
}

// EtcBonuses ID → stat name (full map)
export var GALLERY_STAT_FOR_ID = {};
for (var _gid in IDforETCbonus) {
  if (IDforETCbonus[_gid]) GALLERY_STAT_FOR_ID[_gid] = IDforETCbonus[_gid];
}

// Legacy aliases
export var NAMETAG_DR = NAMETAG_UQ;
export var TROPHY_DR = TROPHY_UQ;
export var PREMHAT_DR = HAT_UQ;
export var PREMHAT_NAMES = HAT_NAMES;
