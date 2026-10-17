// ===== COMBAT SIM DERIVED VALUES (common) =====
// Read-only account totals that the setup editor cannot set directly: they are
// recomputed from other save fields, so the editor shows them as base -> current
// with the editable systems that feed them. Pure: reads a loaded saveData plus
// data.js exports; no DOM.

import { charClassData } from '../../../save/data.js';

const FAMILIES = ['Warrior', 'Archer', 'Mage'];

function _classFamily(cls) {
  return cls < 6 ? -1 : cls < 18 ? 0 : cls < 30 ? 1 : cls < 42 ? 2 : -1;
}

function _level(S, ci) {
  return Number(S.lv0AllData && S.lv0AllData[ci] && S.lv0AllData[ci][0]) || 0;
}

/**
 * Derived account values for the setup editor's read-only view.
 * Each entry: { id, label, value, fmt: 'int'|'x', group, note, feeds, sources }.
 * `sources` lists editor locations ({ scope:'acct'|'char', world?, sys?, tab? , label })
 * whose edits can change the value; `raw` marks save keys only editable as raw JSON.
 */
export function combatDerivedValues(S, charIdx) {
  S = S || {};
  const ci = Number(charIdx) || 0;
  const out = [];
  const tome = Number(S.totalTomePoints) || 0;
  const tomeN = Math.floor(Math.max(0, (tome - 5000) / 2000));
  out.push({ id: 'tome', group: 'Tome', label: 'Tome score', value: tome, fmt: 'int',
    note: 'Sum of every Tome slot (card levels, statues, achievements, talents, stamps, skills, and more), recomputed on load.',
    feeds: 'Overkill Tome quantity (score / 2500), Lore Episode Tome bonus, and the Tome bubble post-pass below.',
    sources: [{ scope: 'acct', world: 'General', sys: 'cardLevels', label: 'Card levels' }, { scope: 'acct', world: 'W1', sys: 'g:Statues', label: 'Statues' }, { raw: true, label: 'Other Tome slots (raw JSON)' }] });
  out.push({ id: 'tomeFactor', group: 'Tome', label: 'Tome bubble multiplier', value: tomeN, fmt: 'x',
    note: 'floor(max(0, (Tome - 5000) / 2000)).',
    feeds: 'Multiplies the cached W8/A9/M9 and W10/A10/M10 all-character bubbles.', sources: [] });

  const slab = (S.cards1Data && S.cards1Data.length) || 0;
  out.push({ id: 'slab', group: 'Slab', label: 'Slab items found', value: slab, fmt: 'int',
    note: 'Cards1: every item ever discovered. Only editable as raw JSON.',
    feeds: 'Slab bubble post-pass and Slabbo bonuses.', sources: [{ raw: true, label: 'Cards1 (raw JSON)' }] });
  out.push({ id: 'slabFactor', group: 'Slab', label: 'Slab bubble multiplier', value: Math.floor(slab / 100), fmt: 'x',
    note: 'floor(Slab items / 100).', feeds: 'Multiplies the W2/W4/A2/A4/M2/M4 bubbles.', sources: [] });

  const lv = _level(S, ci);
  out.push({ id: 'charLevel', group: 'Levels', label: 'This character\u2019s level', value: lv, fmt: 'int',
    note: 'Lv0[0] for the selected character.', feeds: 'Level bubble post-pass below.', sources: [{ raw: true, label: 'Lv0_X (raw JSON)' }] });
  out.push({ id: 'levelFactor', group: 'Levels', label: 'Level bubble multiplier', value: Math.max(1, Math.floor((lv - 500) / 10)), fmt: 'x',
    note: 'max(1, floor((level - 500) / 10)).', feeds: 'Multiplies the W7/A8/M7 bubbles.', sources: [] });
  const fam = [0, 0, 0];
  let top = 0;
  for (let i = 0; i < (charClassData || []).length; i++) {
    const f = _classFamily(Number(charClassData[i]) || 0);
    const l = _level(S, i);
    if (f >= 0) fam[f] += l;
    if (l > top) top = l;
  }
  out.push({ id: 'topLevel', group: 'Levels', label: 'Highest character level', value: top, fmt: 'int',
    note: 'Highest Lv0[0] across characters.', feeds: 'Sailing artifacts that read the highest-level cache.', sources: [{ raw: true, label: 'Lv0_X (raw JSON)' }] });
  FAMILIES.forEach((name, f) => {
    out.push({ id: 'fam' + f, group: 'Levels', label: name + ' family levels', value: fam[f], fmt: 'int',
      note: 'Sum of character levels in the ' + name + ' class family.', sources: [{ raw: true, label: 'Lv0_X (raw JSON)' }],
      feeds: (['W9', 'A7', 'M8'][f]) + ' all-character bubble \u00d7 ' + (1 + 4 * fam[f] / (fam[f] + 1e3)).toFixed(3) + ' (1 + 4L / (L + 1000)).' });
  });

  const signs = S.starSignsUnlocked && typeof S.starSignsUnlocked === 'object' ? Object.keys(S.starSignsUnlocked).length : 0;
  out.push({ id: 'signs', group: 'Counts', label: 'Star signs unlocked', value: signs, fmt: 'int',
    note: 'Keys present in StarSg.', feeds: 'Bonuses that count unlocked signs.', sources: [{ scope: 'acct', world: 'General', sys: 'signUnlocks', label: 'Star sign unlocks' }] });
  let ach = 0;
  (S.achieveRegData || []).forEach(v => { if (Number(v) === -1) ach++; });
  out.push({ id: 'achievements', group: 'Counts', label: 'Achievements completed', value: ach, fmt: 'int',
    note: 'AchieveReg entries equal to -1.', feeds: 'Tome score and achievement-gated bonuses.', sources: [{ raw: true, label: 'AchieveReg (raw JSON)' }] });
  return out;
}
