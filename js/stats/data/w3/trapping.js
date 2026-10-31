import { TrappingInfo, TrapBoxInfo, AtomInfo } from '../game/customlists.js';

export function trappingCritters() {
  return TrappingInfo.map((row, index) => ({
    index, map: Number(row[0]), key: row[2], efficiencyReq: Number(row[4]),
    exp: Number(row[5]), rarePct: Number(row[6]),
  }));
}

export function trappingBoxOptions(type) {
  if (!Number.isInteger(type) || !TrapBoxInfo[type]) throw new Error('Choose a valid trap box type.');
  return TrapBoxInfo[type].map((row, index) => ({
    index, seconds: Number(row[0]), quantity: Math.floor(Number(row[1])),
    exp: Number(row[3]) === 0 ? Math.floor(Number(row[2])) : 1,
    rarity: Number(row[3]) === 1 ? Math.floor(Number(row[2])) : 1,
  }));
}

export function trappingCompounderPerLevel() { return Number(AtomInfo[11][4]); }
