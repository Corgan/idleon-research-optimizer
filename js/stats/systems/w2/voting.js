// ===== VOTING SYSTEM (W2) =====
// Summoning voting bonuses — only active when the vote is the current winner.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { votingBonusValue } from '../../data/common/voting.js';

export function votingBonusz(voteIdx, votingMulti, saveData) {
  var base = votingBonusValue(voteIdx);
  if (base === 0) return 0;
  if (saveData.activeVoteIdx !== voteIdx) return 0;
  var multi = votingMulti != null ? votingMulti : 1;
  return base * multi;
}

var VOTING_DATA = {
  27: { base: votingBonusValue(27), name: 'Voting Bonus (DR)' },
};

export var voting = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var data = VOTING_DATA[id];
    if (!data) return node(label('Voting', id), 0, null, { note: 'voting ' + id });
    // Only active when this vote index is the current server-wide winner
    if (saveData.activeVoteIdx !== id) return node(data.name, 0, [
      node('Not active vote', 0, null, { fmt: 'raw', note: 'active=' + saveData.activeVoteIdx }),
    ], { note: 'voting ' + id });
    // Prefer descriptor for voting multi
    var vm = ctx.resolve ? ctx.resolve('voting-multi') : null;
    var multi = vm ? vm.val : 1;
    var multiChildren = vm ? vm.children : null;
    var val = data.base * multi;
    return node(data.name, val, [
      node('Base', data.base, null, { fmt: 'raw' }),
      node('Voting Multi', multi, multiChildren, { fmt: 'x' }),
    ], { fmt: '+', note: 'voting ' + id });
  },
};
