// ===== DIVINITY SKILLS-PANEL RATE DESCRIPTORS =====

import { createDescriptor } from './helpers.js';
import {
  computeDivinityExpPerHour,
  computeDivinityPointsPerHour,
} from '../systems/w5/divinity-rate.js';

function _status(saveData) {
  var missing = [];
  if (saveData.companionDataAvailable === false) missing.push('companion ownership');
  if (saveData.activeVoteDataAvailable === false) missing.push('current server vote');
  return {
    partial: missing.length > 0,
    reason: missing.length > 0
      ? 'Partial total: the imported JSON does not include ' + missing.join(' or ') + ' metadata.'
      : '',
  };
}

function _rateDescriptor(id, name, compute) {
  return createDescriptor({
    id: id,
    name: name,
    scope: 'character',
    category: 'rate',
    combine: function(pools, ctx) {
      var result = compute(Number(ctx.charIdx) || 0, ctx);
      var status = _status(ctx.saveData);
      return {
        val: Number(result) || 0,
        children: result.children || null,
        partial: status.partial,
        reason: status.reason,
      };
    },
  });
}

export const divinityPointsPerHour = _rateDescriptor(
  'divinity-points-per-hour',
  'Divinity Points/hr',
  computeDivinityPointsPerHour
);

export const divinityExpPerHour = _rateDescriptor(
  'divinity-exp-per-hour',
  'Divinity EXP/hr',
  computeDivinityExpPerHour
);