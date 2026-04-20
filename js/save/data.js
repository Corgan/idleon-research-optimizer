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
export let skillLvMaxData = [];
export let playerStuffData = [];
export let cauldronInfoData = [];
export let cauldronBubblesData = [];
export let klaData = [];
export let equipOrderData = [];
export let equipQtyData = [];
export let stampLvData = {};
export let starSignData = [];
export let emmData = [];
export let prayersPerCharData = [];
export let postOfficeData = [];
export let cardEquipData = [];
export let csetEqData = [];
export let currentMapData = [];
export let mapBonData = [];
export let obolNamesData = [];
export let obolMapsData = [];
export let obolFamilyNames = [];
export let obolFamilyMaps = {};
export let buffsActiveData = [];
export let loadedSaveFormat = '';
export let saveGlobalTime = 0;
export let tournamentDay = 0;
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
  if ('skillLvMaxData' in u) skillLvMaxData = u.skillLvMaxData;
  if ('playerStuffData' in u) playerStuffData = u.playerStuffData;
  if ('cauldronInfoData' in u) cauldronInfoData = u.cauldronInfoData;
  if ('cauldronBubblesData' in u) cauldronBubblesData = u.cauldronBubblesData;
  if ('klaData' in u) klaData = u.klaData;
  if ('equipOrderData' in u) equipOrderData = u.equipOrderData;
  if ('equipQtyData' in u) equipQtyData = u.equipQtyData;
  if ('stampLvData' in u) stampLvData = u.stampLvData;
  if ('starSignData' in u) starSignData = u.starSignData;
  if ('emmData' in u) emmData = u.emmData;
  if ('prayersPerCharData' in u) prayersPerCharData = u.prayersPerCharData;
  if ('postOfficeData' in u) postOfficeData = u.postOfficeData;
  if ('cardEquipData' in u) cardEquipData = u.cardEquipData;
  if ('csetEqData' in u) csetEqData = u.csetEqData;
  if ('currentMapData' in u) currentMapData = u.currentMapData;
  if ('mapBonData' in u) mapBonData = u.mapBonData;
  if ('obolNamesData' in u) obolNamesData = u.obolNamesData;
  if ('obolMapsData' in u) obolMapsData = u.obolMapsData;
  if ('obolFamilyNames' in u) obolFamilyNames = u.obolFamilyNames;
  if ('obolFamilyMaps' in u) obolFamilyMaps = u.obolFamilyMaps;
  if ('buffsActiveData' in u) buffsActiveData = u.buffsActiveData;
  if ('loadedSaveFormat' in u) loadedSaveFormat = u.loadedSaveFormat;
  if ('saveGlobalTime' in u) saveGlobalTime = u.saveGlobalTime;
  if ('tournamentDay' in u) tournamentDay = u.tournamentDay;
  if ('cachedAFKRate' in u) cachedAFKRate = u.cachedAFKRate;
}
