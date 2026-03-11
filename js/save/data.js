// ===== MAIN-THREAD SAVE DATA =====
// Variables populated during save load that are ONLY used on the main thread.
// NOT serialized to workers. Workers receive derived values (extBonuses, cached*) instead.
// Separated from state.js to slim the worker-shared state surface.

export let labData = [];
export let dreamData = [];
export let divinityData = [];
export let optionsListData = [];
export let tasksW7Data = [];
export let numCharacters = 10;
export let charClassData = [];
export let skillLvData = [];
export let playerStuffData = [];
export let cauldronInfoData = [];
export let cauldronBubblesData = [];
export let klaData = [];
export let loadedSaveFormat = '';
export let saveGlobalTime = 0;
export let cachedAFKRate = null;

export function assignSaveData(u) {
  if ('labData' in u) labData = u.labData;
  if ('dreamData' in u) dreamData = u.dreamData;
  if ('divinityData' in u) divinityData = u.divinityData;
  if ('optionsListData' in u) optionsListData = u.optionsListData;
  if ('tasksW7Data' in u) tasksW7Data = u.tasksW7Data;
  if ('numCharacters' in u) numCharacters = u.numCharacters;
  if ('charClassData' in u) charClassData = u.charClassData;
  if ('skillLvData' in u) skillLvData = u.skillLvData;
  if ('playerStuffData' in u) playerStuffData = u.playerStuffData;
  if ('cauldronInfoData' in u) cauldronInfoData = u.cauldronInfoData;
  if ('cauldronBubblesData' in u) cauldronBubblesData = u.cauldronBubblesData;
  if ('klaData' in u) klaData = u.klaData;
  if ('loadedSaveFormat' in u) loadedSaveFormat = u.loadedSaveFormat;
  if ('saveGlobalTime' in u) saveGlobalTime = u.saveGlobalTime;
  if ('cachedAFKRate' in u) cachedAFKRate = u.cachedAFKRate;
}
