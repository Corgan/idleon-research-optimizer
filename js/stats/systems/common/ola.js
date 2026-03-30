// ===== OLA SYSTEM =====
// Checks OLA (optionsListData) flag entries for threshold bonuses.

import { node } from '../../node.js';
import { optionsListData } from '../../../save/data.js';

var OLA_NAMES = {
  232: 'Sneaking Mastery',
};

export var ola = {
  resolve: function(id, ctx, args) {
    var threshold = args ? args[0] : 1;
    var bonus = args ? args[1] : 0;
    var val = Number(optionsListData && optionsListData[id]) || 0;
    var active = val >= threshold;
    var name = OLA_NAMES[id] || 'OLA ' + id;
    return node(name, active ? bonus : 0, [
      node('Value', val, null, { fmt: 'raw' }),
      node('Threshold', threshold, null, { fmt: 'raw' }),
      node('Active', active ? 1 : 0, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'OLA[' + id + ']' });
  },
};
