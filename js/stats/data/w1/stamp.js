// ===== STAMP DATA (W1) =====
// Dynamically built from ITEMS.StampXN entries.
// Each stamp's desc_line1: "bonusType,formula,x1,x2,..."
import { ITEMS } from '../game/items.js';

var CAT_MAP = { A: 0, B: 1, C: 2 };

export var STAMP_DATA = {};

var keys = Object.keys(ITEMS);
for (var i = 0; i < keys.length; i++) {
  var k = keys[i];
  if (k.indexOf('Stamp') !== 0 || k.length < 7) continue;
  var letter = k[5];
  var cat = CAT_MAP[letter];
  if (cat == null) continue;
  var num = k.slice(6);
  var item = ITEMS[k];
  var parts = item.desc_line1.split(',');
  STAMP_DATA[letter + num] = {
    cat: cat,
    idx: item.ID - cat * 1000,
    x1: Number(parts[2]),
    x2: Number(parts[3]),
    formula: parts[1],
  };
}
