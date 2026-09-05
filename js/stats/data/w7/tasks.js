// ===== W7 TASK DATA =====

function _w7TaskLevel(saveData, index) {
  return Number(saveData?.tasksGlobalData?.[2]?.[6]?.[index]) || 0;
}

export function spelunkPowTaskLevel(saveData) {
  return _w7TaskLevel(saveData, 0);
}

export function w7RespawnTaskLevel(saveData) {
  return _w7TaskLevel(saveData, 1);
}

export function spelunkMaxStaminaTaskLevel(saveData) {
  return _w7TaskLevel(saveData, 2);
}

export function researchGridPointsTaskLevel(saveData) {
  return _w7TaskLevel(saveData, 3);
}

export function mineheadCurrencyTaskLevel(saveData) {
  return _w7TaskLevel(saveData, 4);
}