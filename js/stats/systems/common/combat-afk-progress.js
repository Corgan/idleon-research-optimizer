// ===== OFFLINE CLAIM ACCEPTANCE AND BONUS REWARDS =====
import * as D from '../../../save/data.js';
import { StarQuests, TournyStuff } from '../../data/game/customlists.js';
import { readRawKey } from './combat-sim-setup.js';
import { talent } from './talent.js';
import { computeStarSignBonus } from './starSign.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { computeDivinityExpPerHour } from '../w5/divinity-rate.js';
import { hasBonusMajor } from '../w5/divinity.js';
import { menagerieUnlockOwned } from '../w7/menagerie.js';

const N = x => Number(x?.val ?? x) || 0;

export function combatAfkProgress(S, ci, mapIdx, claim, ctx, rawSave) {
  const rows = [], bonusDrops = [], warnings = [], notes = [];
  if (!(claim.hours * 3600 > 120)) return { rows, bonusDrops, warnings, notes };
  const seconds = claim.effectiveHours * 3600, hours = seconds / 3600;
  const read = key => readRawKey(rawSave, key);
  const tn = (id, tab = 1) => N(talent.resolve(id, ctx, { tab }));
  function add(key, name, amount, unit = '', before) {
    if (!(amount > 0)) return;
    rows.push({ key, name, amount, unit, before: Number.isFinite(Number(before)) ? Number(before) : null,
      after: Number.isFinite(Number(before)) ? Number(before) + amount : null });
  }
  function drop(key, chance, quantity = 1) {
    chance = Math.max(0, Math.min(1, chance));
    if (chance > 0 && quantity > 0) bonusDrops.push({ key, expected: chance * quantity, chance, guaranteed: chance === 1, minimum: chance === 1 ? quantity : 0, single: quantity === 1 });
  }
  const kills = claim.creditedKills, target = claim.target;
  const tasks = S.tasksGlobalData;
  if (tasks?.[0]?.[0]) {
    add('taskKills', 'Task kill progress', kills, 'kills', tasks[0][0][0]);
    add('taskHours', 'Task AFK time', hours, 'hours', tasks[0][0][2]);
    if (target === 'poopSmall' && N(tasks[5]?.[0]) === 0) add('taskPoopClaim', 'Poop AFK task', 1, 'claim', tasks[0][0][8]);
  } else warnings.push('Saved task progress is unavailable.');
  const questComplete = read('QuestComplete_' + ci), questStatus = read('QuestStatus_' + ci);
  function quest(key, name, slot, amount, set = false) {
    if (questComplete?.[key] != 0) return; // eslint-disable-line eqeqeq
    const before = questStatus?.[key]?.[slot];
    if (!Number.isFinite(Number(before))) { warnings.push(name + ': saved quest progress is unavailable.'); return; }
    add('quest:' + key, name, set ? Math.max(0, amount - Number(before)) : amount, 'progress', before);
  }
  if (!questComplete || typeof questComplete !== 'object') warnings.push('Saved active quests are unavailable.');
  const killQuests = {
    goblinG: ['Tiki_Chief3', 'Tiki Chief kill quest'], w6a5: ['Woodlin_Elder1', 'Woodlin Elder kill quest'],
    w5b6: ['Tired_Mole1', 'Tired Mole kill quest'], w5c1: ['Tired_Mole2', 'Tired Mole kill quest'],
    moonman: ['Djonnut2', 'Djonnut kill quest'], w5a1: ['Slargon1', 'Slargon kill quest'],
    w5a2: ['Slargon2', 'Slargon kill quest'], w5a3: ['Slargon3', 'Slargon kill quest'], w5a4: ['Slargon4', 'Slargon kill quest'],
  };
  if (killQuests[target]) quest(...killQuests[target], 0, kills);
  const timed = { GrasslandsA: ['Stiltzcho4', 'Stiltzcho AFK quest'], GrasslandsB: ['Stiltzcho5', 'Stiltzcho AFK quest'], JungleA: ['Stiltzcho6', 'Stiltzcho AFK quest'] };
  // Map identities, not display names, own these native scene gates.
  const scene = claim.sceneName;
  if (timed[scene]) quest(...timed[scene], 0, Math.floor(seconds));
  for (const [name, key, low, high] of [['ySnowA3', 'Yondergreen5', 14820, 15180], ['ySnowA2', 'Yondergreen6', 34200, 34560], ['ySnowC3', 'Yondergreen7', 78480, 78840]]) {
    if (scene === name && seconds >= low && seconds <= high) quest(key, 'Yondergreen timed AFK quest', 0, 1, true);
  }
  const kla = D.klaData?.[ci]?.[mapIdx];
  if (kla && typeof kla === 'object') {
    const entries = Array.isArray(kla) ? kla : Object.values(kla);
    const remaining = entries.map(Number).filter(Number.isFinite);
    if (remaining.length) rows.push({ key: 'portalKills', name: 'Portal kill progress (each saved requirement)', amount: kills, unit: 'kills', remainingBefore: remaining, remainingAfter: remaining.map(value => value - kills) });
  }
  if (target === 'caveB') {
    const multiplier = N(claim.xtraMushKillz);
    add('grottoKills', 'Grotto mushroom kills', kills * multiplier, 'kills', S.holesData?.[11]?.[27]);
    add('grottoTotal', 'Grotto total mushroom credit', kills * multiplier, 'kills', S.holesData?.[11]?.[28]);
  } else if (target === 'caveC') add('templeKills', 'Temple Ancient Golem kills', kills, 'kills', S.holesData?.[11]?.[63]);
  else if (target === 'caveD') add('coveKills', 'Cove Crystal Glunko kills', kills, 'kills', S.optionsListData?.[668]);
  add('forgeSeconds', 'Extra Forge time', kills * tn(280) / 100 * tn(280, 2), 'seconds');
  if (!claim.candy && N(D.divinityData?.[ci]) === 5) {
    const rate = computeDivinityExpPerHour(ci, ctx);
    if (rate.unavailable) warnings.push(rate.reason || 'Divinity EXP inputs are unavailable.');
    else add('divinityExp', 'TranQi Divinity EXP', N(rate) * Math.floor(hours), 'EXP');
  }
  const starIndex = StarQuests.findIndex(row => String(row[0]) === String(mapIdx));
  const star = StarQuests[starIndex], progress = read('StarSignProg')?.[starIndex];
  if (star && N(star[8]) === 3 && hours >= N(star[3])) {
    const letter = TournyStuff.slice(0, 13).flat()[ci];
    if (!progress) warnings.push('Saved star-sign challenge progress is unavailable.');
    else if (N(progress[1]) === 0 && !String(progress[0]).includes(letter)) add('starChallenge', 'Star-sign AFK challenge completed for this character', 1);
  }
  const guild = read('GuildTasks');
  if (hours > 4.9 && guild) {
    for (let i = 1; i <= 9; i++) if (N(guild[i]?.[0]) === 4) {
      add('guildAfk', 'Guild long-AFK task', Math.round(N(guild[i][2]) + 1) - N(guild[i][2]), 'progress', guild[i][2]); break;
    }
  }
  if (menagerieUnlockOwned(S, 2) === 1) {
    const level = N(S.optionsListData?.[619]);
    const multiplier = Math.max(0, Math.min(1, Math.round(125 * level / (level + 100)) / 100));
    add('coralHours', 'Coral Kid banked hours', Math.floor(hours) * multiplier, 'hours', S.optionsListData?.[624]);
  }
  // These three quest items use original elapsed time, even with Prayer 2.
  const mc = { 14: ['Quest97', 367], 29: ['Quest96', 401], 40: ['Quest101', 452] }[N(D.charClassData[ci])];
  if (!claim.candy && mc && N(S.optionsListData?.[mc[1]]) === 1 && claim.hours * 3600 > 3599) {
    const bonus = N(computeMeritocBonusz(19, S, ci));
    drop(mc[0], 1, Math.floor(claim.hours + Math.max(0, bonus / 100 * Math.min(48, claim.hours))));
  }
  if (hours >= 7.9) {
    const chance = Math.min(1, Math.max(0, N(computeStarSignBonus('TimeCandy', ci, S)) / 100));
    for (const [key, fraction] of [['Timecandy4', 0.005], ['Timecandy3', 0.025], ['Timecandy2', 0.17], ['Timecandy1', 0.8]]) drop(key, chance * fraction);
  }
  if (hours >= 39.8) {
    const chance = Math.min(1, Math.max(0, N(computeStarSignBonus('TC40p', ci, S)) / 100));
    for (const [key, fraction] of [['Timecandy4', 0.18], ['Timecandy3', 0.22], ['Timecandy2', 0.6]]) drop(key, chance * fraction);
  }
  if (hours >= 29.8) {
    const chance = Math.min(1, Math.max(0, tn(633) / 100));
    const base = hours >= 150 ? 4 : hours >= 100 ? 3 : hours >= 60 ? 2 : 1;
    const upgrade = hours >= 150 ? Math.min(50, hours - 150) / 100 : hours >= 100 ? (hours - 100) / 100 : hours >= 60 ? (hours - 60) / 80 : Math.max(0, hours - 30) / 60;
    drop('Timecandy' + base, chance * (1 - upgrade));
    drop('Timecandy' + (base + 1), chance * upgrade);
  }
  if (!claim.candy && N(hasBonusMajor(ci, 4, S)) === 1) {
    add('harriep', 'Harriep bonus (one randomly selected system)', seconds, 'seconds');
    notes.push('Harriep chooses one of Refinery, Printer, Cooking, Breeding eggs, Sailing or Gaming with equal probability; the same time is not awarded to all six.');
  }
  notes.push('Added Forge time is reported as time credit, not a resolved furnace-bar outcome. Independent whole-account passive production, shrine leveling, egg/pet bonus processing and Sailing/Gaming chance-based time bonuses are not resolved here.');
  return { rows, bonusDrops, warnings, notes };
}
