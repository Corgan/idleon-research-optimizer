import { loadSaveData } from '../save/loader.js';
import { saveData } from '../state.js';
import { applyCombatSetup } from '../stats/systems/common/combat-sim-setup.js';
import { withCombatTerms } from '../stats/systems/common/combat-sim-terms.js';
import { combatAfkGains } from '../stats/systems/common/combat-afk.js';

let rawSave = null, loadedVariant = null, patched = null;
self.onmessage = ({ data: msg }) => {
  try {
    if (msg.type === 'load') {
      rawSave = msg.rawSave;
      loadedVariant = null;
      self.postMessage({ type: 'loaded' });
      return;
    }
    if (msg.type !== 'afk') return;
    if (!rawSave) throw new Error('Load a save before comparing AFK gains.');
    if (msg.setup && Number(msg.setup.charIdx) !== Number(msg.charIdx)) throw new Error('This loadout belongs to another character.');
    const signature = JSON.stringify([msg.charIdx, msg.setup || null]);
    if (signature !== loadedVariant) {
      patched = msg.setup ? applyCombatSetup(rawSave, { ...msg.setup, charIdx: msg.charIdx }) : rawSave;
      loadSaveData(patched);
      loadedVariant = signature;
    }
    const result = withCombatTerms(msg.setup?.termOverrides, () => combatAfkGains(saveData, msg.charIdx, msg.mapIdx, msg.hours, {
      rawSave: patched, toggles: msg.setup?.toggles, holeCavern: msg.holeCavern, candy: msg.candy, clamworksPhase: msg.clamworksPhase,
    }));
    self.postMessage({ type: 'done', id: msg.id, result });
  } catch (error) {
    self.postMessage({ type: 'error', id: msg.id, error: error.message || String(error) });
  }
};
